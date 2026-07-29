-- Keep admin decisions atomic and consume reserved credits only after actual
-- attendance. Both functions are service-only and revalidate tenant authority.

create or replace function app_private.decide_makeup_marketplace_request(
  target_tenant_id uuid,
  target_request_id uuid,
  actor_user_id uuid,
  requested_decision text,
  decision_notes text,
  human_confirmation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.catch_up_requests%rowtype;
  target_credit public.catch_up_credits%rowtype;
  target_enrollment public.enrollments%rowtype;
  target_session public.sessions%rowtype;
  target_group public.groups%rowtype;
  session_day date;
  regular_count numeric;
  cancellation_count numeric;
  active_hold_count numeric;
  effective_capacity numeric;
  effective_used numeric;
  actor_is_staff boolean;
begin
  if human_confirmation is not true then
    raise exception using errcode = '23514', message = 'makeup_confirmation_required';
  end if;
  if requested_decision not in ('approved', 'declined') then
    raise exception using errcode = '23514', message = 'makeup_decision_invalid';
  end if;

  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) into actor_is_staff;
  if actor_user_id is null or not actor_is_staff then
    raise exception using errcode = '42501', message = 'makeup_actor_forbidden';
  end if;

  select *
  into target_request
  from public.catch_up_requests request
  where request.tenant_id = target_tenant_id
    and request.id = target_request_id
  for update;
  if target_request.id is null or target_request.status <> 'requested' then
    raise exception using errcode = '55000', message = 'makeup_request_not_open';
  end if;

  select *
  into target_credit
  from public.catch_up_credits credit
  where credit.tenant_id = target_tenant_id
    and credit.id = target_request.credit_id
  for update;
  if target_credit.id is null or target_credit.status not in ('available', 'reserved') then
    raise exception using errcode = '55000', message = 'makeup_credit_unavailable';
  end if;

  if requested_decision = 'declined' then
    update public.catch_up_requests
    set
      assigned_session_id = null,
      status = 'declined',
      decided_at = now(),
      decided_by_user_id = actor_user_id,
      admin_notes = nullif(btrim(decision_notes), '')
    where tenant_id = target_tenant_id and id = target_request.id;

    update public.catch_up_credits
    set status = 'available', used_session_id = null
    where tenant_id = target_tenant_id and id = target_credit.id;

    update public.makeup_marketplace_decisions
    set
      status = 'ignored',
      decided_at = now(),
      decided_by_user_id = actor_user_id
    where tenant_id = target_tenant_id
      and credit_id = target_credit.id
      and session_id = target_request.preferred_session_id;

    return jsonb_build_object('requestId', target_request.id, 'status', 'declined');
  end if;

  select *
  into target_session
  from public.sessions session
  where session.tenant_id = target_tenant_id
    and session.id = target_request.preferred_session_id
  for update;
  if target_session.id is null
    or target_session.status <> 'scheduled'
    or target_session.starts_at <= now()
  then
    raise exception using errcode = '23514', message = 'makeup_session_unavailable';
  end if;

  session_day := (target_session.starts_at at time zone 'Europe/Amsterdam')::date;
  if target_credit.expires_on is not null and target_credit.expires_on < session_day then
    raise exception using errcode = '23514', message = 'makeup_credit_expired_before_session';
  end if;

  select *
  into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
    and enrollment.id = target_credit.enrollment_id
    and enrollment.participant_id = target_credit.participant_id;

  select *
  into target_group
  from public.groups candidate_group
  where candidate_group.tenant_id = target_tenant_id
    and candidate_group.id = target_session.group_id;

  if target_enrollment.id is null
    or target_enrollment.status not in ('active', 'paused')
    or target_group.id is null
    or target_group.status <> 'active'
    or target_group.program_id <> target_enrollment.program_id
    or target_group.stage_id is distinct from target_enrollment.current_stage_id
  then
    raise exception using errcode = '23514', message = 'makeup_program_or_stage_mismatch';
  end if;

  if exists (
    select 1
    from public.group_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.group_id = target_group.id
      and membership.participant_id = target_credit.participant_id
      and membership.status in ('active', 'trial')
      and membership.starts_on <= session_day
      and (membership.ends_on is null or membership.ends_on >= session_day)
  ) then
    raise exception using errcode = '23514', message = 'makeup_already_regular_participant';
  end if;

  select coalesce(sum(membership.capacity_weight), 0)
  into regular_count
  from public.group_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.group_id = target_group.id
    and membership.status in ('active', 'trial')
    and membership.starts_on <= session_day
    and (membership.ends_on is null or membership.ends_on >= session_day);

  select coalesce(sum(membership.capacity_weight), 0)
  into cancellation_count
  from public.lesson_cancellations cancellation
  join public.group_memberships membership
    on membership.tenant_id = cancellation.tenant_id
   and membership.participant_id = cancellation.participant_id
   and membership.group_id = target_group.id
  where cancellation.tenant_id = target_tenant_id
    and cancellation.session_id = target_session.id
    and cancellation.status in ('accepted', 'late_cancelled')
    and membership.status in ('active', 'trial')
    and membership.starts_on <= session_day
    and (membership.ends_on is null or membership.ends_on >= session_day);

  select coalesce(count(*), 0)
  into active_hold_count
  from public.catch_up_requests request
  where request.tenant_id = target_tenant_id
    and request.id <> target_request.id
    and request.status in ('requested', 'approved')
    and coalesce(request.assigned_session_id, request.preferred_session_id) = target_session.id;

  effective_capacity := coalesce(target_session.capacity_override, target_group.capacity);
  effective_used := greatest(0, regular_count - cancellation_count) + active_hold_count;
  if effective_used + 1 > effective_capacity then
    raise exception using errcode = '23514', message = 'makeup_no_capacity';
  end if;

  update public.catch_up_requests
  set
    assigned_session_id = target_session.id,
    status = 'approved',
    decided_at = now(),
    decided_by_user_id = actor_user_id,
    admin_notes = nullif(btrim(decision_notes), '')
  where tenant_id = target_tenant_id and id = target_request.id;

  update public.catch_up_credits
  set status = 'reserved', used_session_id = null
  where tenant_id = target_tenant_id and id = target_credit.id;

  update public.makeup_marketplace_decisions
  set
    status = 'booked',
    decided_at = now(),
    decided_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and credit_id = target_credit.id
    and session_id = target_session.id;

  return jsonb_build_object(
    'requestId', target_request.id,
    'status', 'approved',
    'effectiveCapacity', effective_capacity,
    'effectiveUsedBeforeBooking', effective_used
  );
end
$$;

revoke all on function app_private.decide_makeup_marketplace_request(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function app_private.decide_makeup_marketplace_request(uuid, uuid, uuid, text, text, boolean)
  to service_role;

create or replace function public.decide_makeup_marketplace_request(
  target_tenant_id uuid,
  target_request_id uuid,
  actor_user_id uuid,
  requested_decision text,
  decision_notes text,
  human_confirmation boolean
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.decide_makeup_marketplace_request(
    target_tenant_id,
    target_request_id,
    actor_user_id,
    requested_decision,
    decision_notes,
    human_confirmation
  );
$$;

revoke all on function public.decide_makeup_marketplace_request(uuid, uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.decide_makeup_marketplace_request(uuid, uuid, uuid, text, text, boolean)
  to service_role;

create or replace function app_private.consume_makeup_credit_after_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  matched_request public.catch_up_requests%rowtype;
begin
  if new.status not in ('present', 'late', 'trial') then
    return new;
  end if;

  select *
  into matched_request
  from public.catch_up_requests request
  where request.tenant_id = new.tenant_id
    and request.participant_id = new.participant_id
    and request.enrollment_id = new.enrollment_id
    and request.assigned_session_id = new.session_id
    and request.status = 'approved'
  for update;

  if matched_request.id is null then
    return new;
  end if;

  update public.catch_up_requests
  set status = 'used'
  where tenant_id = new.tenant_id and id = matched_request.id;

  update public.catch_up_credits
  set status = 'used', used_session_id = new.session_id
  where tenant_id = new.tenant_id and id = matched_request.credit_id;

  return new;
end
$$;

revoke all on function app_private.consume_makeup_credit_after_attendance() from public, anon, authenticated;

create trigger session_attendance_consume_makeup_credit
  after insert or update of status on public.session_attendance
  for each row execute function app_private.consume_makeup_credit_after_attendance();

comment on function app_private.decide_makeup_marketplace_request(uuid, uuid, uuid, text, text, boolean) is
  'Human-confirmed service-only inhaalbesluit with locks and fresh stage, credit and effective-capacity checks.';
comment on function app_private.consume_makeup_credit_after_attendance() is
  'Marks an approved inhaalrequest and reserved credit as used after attendance evidence exists.';
