-- Direct placement is an explicit, transactional tenant-admin operation.
-- The existing verified parent offer remains the default path.

alter table public.placement_audit_events
  drop constraint placement_audit_events_event_type_check,
  add constraint placement_audit_events_event_type_check
    check (
      event_type in (
        'waitlist.created',
        'stage.recommended',
        'placement.scored',
        'placement.direct',
        'slot_offer.created',
        'slot_offer.sent',
        'slot_offer.accepted',
        'slot_offer.declined',
        'slot_offer.expired'
      )
    );

create or replace function app_private.confirm_direct_placement(
  target_tenant_id uuid,
  target_waitlist_entry_id uuid,
  target_group_id uuid,
  target_guardian_user_id uuid,
  actor_user_id uuid,
  human_confirmation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_entry public.waitlist_entries%rowtype;
  target_group public.groups%rowtype;
  target_participant_id uuid;
  target_enrollment_id uuid;
  target_membership_id uuid;
  current_capacity numeric;
begin
  if human_confirmation is not true then
    raise exception using errcode = '23514', message = 'direct_placement_confirmation_required';
  end if;

  if actor_user_id is null or not exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) then
    raise exception using errcode = '42501', message = 'direct_placement_actor_forbidden';
  end if;

  select *
  into target_entry
  from public.waitlist_entries
  where tenant_id = target_tenant_id
    and id = target_waitlist_entry_id
  for update;

  if target_entry.id is null then
    raise exception using errcode = 'P0002', message = 'direct_placement_waitlist_missing';
  end if;
  if target_entry.status not in ('waiting', 'reviewing') then
    raise exception using errcode = '55000', message = 'waitlist_not_approved';
  end if;
  if (
    target_entry.participant_birth_date is not null
    and target_entry.participant_birth_date > (current_date - interval '4 years')::date
  ) or (
    target_entry.eligible_from is not null
    and target_entry.eligible_from > current_date
  ) then
    raise exception using errcode = '23514', message = 'under_minimum_age';
  end if;

  select *
  into target_group
  from public.groups
  where tenant_id = target_tenant_id
    and id = target_group_id
  for update;

  if target_group.id is null or target_group.status <> 'active' then
    raise exception using errcode = 'P0002', message = 'direct_placement_group_missing';
  end if;
  if target_group.program_id <> target_entry.program_id
    or target_entry.recommended_stage_id is null
    or target_group.stage_id is distinct from target_entry.recommended_stage_id
  then
    raise exception using errcode = '23514', message = 'wrong_stage';
  end if;
  if target_group.default_weekday is null
    or target_group.default_start_time is null
    or target_group.default_end_time is null
  then
    raise exception using errcode = '23514', message = 'resource_conflict';
  end if;
  if target_group.default_resource_id is null or not exists (
    select 1
    from public.resources resource
    where resource.tenant_id = target_tenant_id
      and resource.id = target_group.default_resource_id
      and resource.status = 'active'
      and resource.kind <> 'location'
  ) then
    raise exception using errcode = '23514', message = 'resource_conflict';
  end if;
  if not exists (
    select 1
    from public.group_instructor_assignments assignment
    where assignment.tenant_id = target_tenant_id
      and assignment.group_id = target_group.id
      and assignment.status = 'active'
      and (assignment.starts_on is null or assignment.starts_on <= current_date)
      and (assignment.ends_on is null or assignment.ends_on >= current_date)
  ) then
    raise exception using errcode = '23514', message = 'instructor_missing';
  end if;
  if exists (
    select 1
    from public.groups other_group
    join public.group_instructor_assignments target_assignment
      on target_assignment.tenant_id = target_tenant_id
     and target_assignment.group_id = target_group.id
     and target_assignment.status = 'active'
    join public.group_instructor_assignments other_assignment
      on other_assignment.tenant_id = target_tenant_id
     and other_assignment.group_id = other_group.id
     and other_assignment.instructor_user_id = target_assignment.instructor_user_id
     and other_assignment.status = 'active'
    where other_group.tenant_id = target_tenant_id
      and other_group.id <> target_group.id
      and other_group.status = 'active'
      and other_group.default_weekday = target_group.default_weekday
      and other_group.default_start_time < target_group.default_end_time
      and other_group.default_end_time > target_group.default_start_time
      and (target_assignment.starts_on is null or target_assignment.starts_on <= current_date)
      and (target_assignment.ends_on is null or target_assignment.ends_on >= current_date)
      and (other_assignment.starts_on is null or other_assignment.starts_on <= current_date)
      and (other_assignment.ends_on is null or other_assignment.ends_on >= current_date)
  ) then
    raise exception using errcode = '23514', message = 'instructor_overloaded';
  end if;
  if exists (
    select 1
    from public.groups other_group
    where other_group.tenant_id = target_tenant_id
      and other_group.id <> target_group.id
      and other_group.status = 'active'
      and other_group.default_resource_id = target_group.default_resource_id
      and other_group.default_weekday = target_group.default_weekday
      and other_group.default_start_time < target_group.default_end_time
      and other_group.default_end_time > target_group.default_start_time
  ) then
    raise exception using errcode = '23514', message = 'resource_conflict';
  end if;

  select coalesce(sum(membership.capacity_weight), 0)
  into current_capacity
  from public.group_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.group_id = target_group.id
    and membership.status in ('active', 'trial');

  if current_capacity + 1 > target_group.capacity then
    raise exception using errcode = '23514', message = 'no_capacity';
  end if;

  if target_guardian_user_id is not null and not exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = target_guardian_user_id
      and membership.status = 'active'
      and membership.role in ('parent', 'athlete')
  ) then
    raise exception using errcode = '23514', message = 'direct_placement_guardian_invalid';
  end if;

  insert into public.participants (
    tenant_id,
    guardian_user_id,
    display_name,
    birth_date,
    status,
    source,
    is_test,
    journey_run_id,
    test_metadata_json
  )
  values (
    target_tenant_id,
    target_guardian_user_id,
    target_entry.participant_name,
    target_entry.participant_birth_date,
    'active',
    case when target_entry.is_test then 'journey_simulation_bot' else 'intake' end,
    target_entry.is_test,
    target_entry.journey_run_id,
    target_entry.test_metadata_json
  )
  returning id into target_participant_id;

  insert into public.enrollments (
    tenant_id,
    participant_id,
    guardian_user_id,
    program_id,
    current_stage_id,
    status,
    source,
    starts_on,
    is_test,
    journey_run_id,
    test_metadata_json
  )
  values (
    target_tenant_id,
    target_participant_id,
    target_guardian_user_id,
    target_entry.program_id,
    target_group.stage_id,
    'active',
    case when target_entry.is_test then 'journey_simulation_bot' else 'intake' end,
    current_date,
    target_entry.is_test,
    target_entry.journey_run_id,
    target_entry.test_metadata_json
  )
  returning id into target_enrollment_id;

  insert into public.group_memberships (
    tenant_id,
    group_id,
    enrollment_id,
    participant_id,
    status,
    starts_on,
    capacity_weight,
    source,
    is_test,
    journey_run_id,
    test_metadata_json
  )
  values (
    target_tenant_id,
    target_group.id,
    target_enrollment_id,
    target_participant_id,
    'active',
    current_date,
    1,
    case when target_entry.is_test then 'journey_simulation_bot' else 'intake' end,
    target_entry.is_test,
    target_entry.journey_run_id,
    target_entry.test_metadata_json
  )
  returning id into target_membership_id;

  if target_guardian_user_id is not null then
    insert into public.participant_guardians (
      tenant_id,
      participant_id,
      guardian_user_id,
      relationship,
      access_level,
      status
    )
    values (
      target_tenant_id,
      target_participant_id,
      target_guardian_user_id,
      'parent',
      'primary',
      'active'
    )
    on conflict (tenant_id, participant_id, guardian_user_id)
    do update set status = 'active', access_level = 'primary';
  end if;

  update public.waitlist_entries
  set status = 'placed'
  where tenant_id = target_tenant_id
    and id = target_entry.id;

  if target_entry.intake_submission_id is not null then
    update public.intake_submissions
    set status = 'converted', reviewed_at = now()
    where tenant_id = target_tenant_id
      and id = target_entry.intake_submission_id;
  end if;

  update public.placement_suggestions
  set status = case when group_id = target_group.id then 'accepted' else 'rejected' end
  where tenant_id = target_tenant_id
    and waitlist_entry_id = target_entry.id
    and status in ('suggested', 'offered');

  insert into public.placement_audit_events (
    tenant_id,
    waitlist_entry_id,
    actor_user_id,
    event_type,
    message,
    payload
  )
  values (
    target_tenant_id,
    target_entry.id,
    actor_user_id,
    'placement.direct',
    'Tenantadmin heeft de directe plaatsing expliciet bevestigd.',
    jsonb_build_object(
      'groupId', target_group.id,
      'participantId', target_participant_id,
      'enrollmentId', target_enrollment_id,
      'groupMembershipId', target_membership_id
    )
  );

  return jsonb_build_object(
    'participantId', target_participant_id,
    'enrollmentId', target_enrollment_id,
    'groupMembershipId', target_membership_id
  );
end
$$;

revoke all on function app_private.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from public;
revoke all on function app_private.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from anon;
revoke all on function app_private.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from authenticated;
grant execute on function app_private.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;

comment on function app_private.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) is
  'Atomic direct placement after explicit staff confirmation and fail-closed capacity, stage, age, resource and instructor checks.';

create or replace function public.confirm_direct_placement(
  target_tenant_id uuid,
  target_waitlist_entry_id uuid,
  target_group_id uuid,
  target_guardian_user_id uuid,
  actor_user_id uuid,
  human_confirmation boolean
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.confirm_direct_placement(
    target_tenant_id,
    target_waitlist_entry_id,
    target_group_id,
    target_guardian_user_id,
    actor_user_id,
    human_confirmation
  );
$$;

revoke all on function public.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from public;
revoke all on function public.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from anon;
revoke all on function public.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) from authenticated;
grant execute on function public.confirm_direct_placement(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;
