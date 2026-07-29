-- Reserve a make-up place atomically. The function revalidates the credit,
-- stage, session capacity, existing bookings and actor authority under locks.

alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_type_check,
  add constraint tenant_notifications_type_check check (
    type in (
      'progress_score',
      'badge_award',
      'graduation_invite',
      'certificate_issued',
      'payment_due',
      'payment_overdue',
      'payment_received',
      'admin_message',
      'task_assigned',
      'document_published',
      'report_ready',
      'makeup_invitation',
      'system'
    )
  );

create or replace function app_private.book_makeup_marketplace_session(
  target_tenant_id uuid,
  target_credit_id uuid,
  target_session_id uuid,
  actor_user_id uuid,
  booking_mode text,
  human_confirmation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_credit public.catch_up_credits%rowtype;
  target_enrollment public.enrollments%rowtype;
  target_session public.sessions%rowtype;
  target_group public.groups%rowtype;
  target_settings public.tenant_settings%rowtype;
  existing_request public.catch_up_requests%rowtype;
  target_request_id uuid;
  target_status text;
  session_day date;
  regular_count numeric;
  cancellation_count numeric;
  active_hold_count numeric;
  effective_used numeric;
  effective_capacity numeric;
  actor_is_staff boolean;
  actor_can_mutate boolean;
  target_is_test boolean;
  target_journey_run_id uuid;
  target_test_metadata jsonb;
begin
  if human_confirmation is not true then
    raise exception using errcode = '23514', message = 'makeup_confirmation_required';
  end if;
  if booking_mode not in ('admin_direct', 'parent_request') then
    raise exception using errcode = '23514', message = 'makeup_booking_mode_invalid';
  end if;

  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) into actor_is_staff;

  select *
  into target_credit
  from public.catch_up_credits
  where tenant_id = target_tenant_id and id = target_credit_id
  for update;
  if target_credit.id is null then
    raise exception using errcode = 'P0002', message = 'makeup_credit_missing';
  end if;

  select
    (
      participant.guardian_user_id = actor_user_id
      or exists (
        select 1
        from public.participant_guardians guardian
        where guardian.tenant_id = target_tenant_id
          and guardian.participant_id = participant.id
          and guardian.guardian_user_id = actor_user_id
          and guardian.status = 'active'
          and guardian.access_level in ('primary', 'secondary')
      )
    ),
    participant.is_test,
    participant.journey_run_id,
    participant.test_metadata_json
  into actor_can_mutate, target_is_test, target_journey_run_id, target_test_metadata
  from public.participants participant
  where participant.tenant_id = target_tenant_id
    and participant.id = target_credit.participant_id;
  if actor_user_id is null
    or (booking_mode = 'admin_direct' and not actor_is_staff)
    or (booking_mode = 'parent_request' and not actor_can_mutate and not actor_is_staff)
  then
    raise exception using errcode = '42501', message = 'makeup_actor_forbidden';
  end if;

  if target_credit.status not in ('available', 'reserved') then
    raise exception using errcode = '55000', message = 'makeup_credit_unavailable';
  end if;

  select *
  into target_session
  from public.sessions
  where tenant_id = target_tenant_id and id = target_session_id
  for update;
  if target_session.id is null or target_session.status <> 'scheduled' or target_session.starts_at <= now() then
    raise exception using errcode = '23514', message = 'makeup_session_unavailable';
  end if;
  session_day := (target_session.starts_at at time zone 'Europe/Amsterdam')::date;
  if target_credit.expires_on is not null and target_credit.expires_on < session_day then
    raise exception using errcode = '23514', message = 'makeup_credit_expired_before_session';
  end if;

  select *
  into target_enrollment
  from public.enrollments
  where tenant_id = target_tenant_id
    and id = target_credit.enrollment_id
    and participant_id = target_credit.participant_id;
  if target_enrollment.id is null or target_enrollment.status not in ('active', 'paused') then
    raise exception using errcode = '23514', message = 'makeup_enrollment_inactive';
  end if;

  select *
  into target_group
  from public.groups
  where tenant_id = target_tenant_id and id = target_session.group_id;
  if target_group.id is null or target_group.status <> 'active'
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

  select *
  into existing_request
  from public.catch_up_requests request
  where request.tenant_id = target_tenant_id
    and request.credit_id = target_credit.id
    and request.status in ('requested', 'approved')
  for update;
  if existing_request.id is not null then
    if coalesce(existing_request.assigned_session_id, existing_request.preferred_session_id) = target_session.id then
      return jsonb_build_object(
        'requestId', existing_request.id,
        'status', existing_request.status,
        'idempotent', true
      );
    end if;
    raise exception using errcode = '23505', message = 'makeup_credit_already_booked';
  end if;

  if exists (
    select 1
    from public.catch_up_requests request
    where request.tenant_id = target_tenant_id
      and request.participant_id = target_credit.participant_id
      and request.status in ('requested', 'approved')
      and coalesce(request.assigned_session_id, request.preferred_session_id) = target_session.id
  ) then
    raise exception using errcode = '23505', message = 'makeup_participant_already_booked';
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
    and request.status in ('requested', 'approved')
    and coalesce(request.assigned_session_id, request.preferred_session_id) = target_session.id;

  effective_capacity := coalesce(target_session.capacity_override, target_group.capacity);
  effective_used := greatest(0, regular_count - cancellation_count) + active_hold_count;
  if effective_used + 1 > effective_capacity then
    raise exception using errcode = '23514', message = 'makeup_no_capacity';
  end if;

  select * into target_settings
  from public.tenant_settings
  where tenant_id = target_tenant_id;
  target_status := case
    when booking_mode = 'admin_direct' then 'approved'
    when coalesce(target_settings.catch_up_requires_admin_approval, true) then 'requested'
    else 'approved'
  end;

  insert into public.catch_up_requests (
    tenant_id, credit_id, participant_id, enrollment_id, requested_by_user_id,
    preferred_session_id, assigned_session_id, status, requested_at,
    decided_at, decided_by_user_id, admin_notes
  )
  values (
    target_tenant_id, target_credit.id, target_credit.participant_id,
    target_credit.enrollment_id, actor_user_id, target_session.id,
    case when target_status = 'approved' then target_session.id else null end,
    target_status, now(),
    case when target_status = 'approved' then now() else null end,
    case when target_status = 'approved' then actor_user_id else null end,
    case when booking_mode = 'admin_direct'
      then 'Direct geboekt via Inhaalmarktplaats na expliciete bevestiging.'
      else 'Aangevraagd via de Inhaalmarktplaats.'
    end
  )
  returning id into target_request_id;

  update public.catch_up_credits
  set status = 'reserved'
  where tenant_id = target_tenant_id and id = target_credit.id;

  insert into public.makeup_marketplace_decisions (
    tenant_id, session_id, participant_id, credit_id, catch_up_request_id,
    status, score, reasons_json, suggested_action, expires_soon,
    decided_at, decided_by_user_id, source, is_test, journey_run_id, test_metadata_json
  )
  values (
    target_tenant_id, target_session.id, target_credit.participant_id, target_credit.id,
    target_request_id, 'booked', 100, '["Actuele capaciteit transactioneel bevestigd."]'::jsonb,
    case when target_status = 'approved' then 'booked' else 'await_admin_approval' end,
    target_credit.expires_on is not null and target_credit.expires_on <= session_day + 7,
    now(), actor_user_id,
    case when target_is_test then 'journey_simulation_bot' else 'makeup_marketplace' end,
    target_is_test, target_journey_run_id, coalesce(target_test_metadata, '{}'::jsonb)
  )
  on conflict (tenant_id, session_id, credit_id)
  do update set
    catch_up_request_id = excluded.catch_up_request_id,
    status = 'booked',
    decided_at = excluded.decided_at,
    decided_by_user_id = excluded.decided_by_user_id;

  return jsonb_build_object(
    'requestId', target_request_id,
    'status', target_status,
    'effectiveCapacity', effective_capacity,
    'effectiveUsedBeforeBooking', effective_used,
    'idempotent', false
  );
end
$$;

revoke all on function app_private.book_makeup_marketplace_session(uuid, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function app_private.book_makeup_marketplace_session(uuid, uuid, uuid, uuid, text, boolean)
  to service_role;

create or replace function public.book_makeup_marketplace_session(
  target_tenant_id uuid,
  target_credit_id uuid,
  target_session_id uuid,
  actor_user_id uuid,
  booking_mode text,
  human_confirmation boolean
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.book_makeup_marketplace_session(
    target_tenant_id,
    target_credit_id,
    target_session_id,
    actor_user_id,
    booking_mode,
    human_confirmation
  );
$$;

revoke all on function public.book_makeup_marketplace_session(uuid, uuid, uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.book_makeup_marketplace_session(uuid, uuid, uuid, uuid, text, boolean)
  to service_role;

comment on function app_private.book_makeup_marketplace_session(uuid, uuid, uuid, uuid, text, boolean) is
  'Human-confirmed and idempotent make-up reservation with row locks and fresh capacity, credit, stage and authorization validation.';
