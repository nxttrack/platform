-- Reviewed stage transitions and referenced carryover work.
-- A carryover points at the original immutable curriculum item; it never copies it.

create table public.swim_item_carryovers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_item_id uuid not null,
  curriculum_item_identity_id uuid not null,
  from_stage_id uuid not null,
  to_stage_id uuid not null,
  transition_case_id uuid not null,
  status text not null default 'open',
  completed_observation_id uuid,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_item_carryovers_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_item_carryovers_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_item_carryovers_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_item_fk
    foreign key (tenant_id, curriculum_item_id)
    references public.curriculum_items (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_identity_fk
    foreign key (tenant_id, curriculum_item_identity_id)
    references public.curriculum_item_identities (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_from_stage_fk
    foreign key (tenant_id, from_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_to_stage_fk
    foreign key (tenant_id, to_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_transition_fk
    foreign key (tenant_id, transition_case_id)
    references public.swim_transition_cases (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_observation_fk
    foreign key (tenant_id, completed_observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint swim_item_carryovers_status_check
    check (status in ('open', 'completed', 'waived')),
  constraint swim_item_carryovers_completion_check check (
    (status = 'open' and completed_observation_id is null and completed_at is null and completed_by_user_id is null)
    or (status = 'completed' and completed_observation_id is not null and completed_at is not null and completed_by_user_id is not null)
    or (status = 'waived' and completed_observation_id is null and completed_at is not null and completed_by_user_id is not null)
  ),
  constraint swim_item_carryovers_transition_item_unique
    unique (tenant_id, transition_case_id, curriculum_item_id),
  constraint swim_item_carryovers_tenant_id_id_unique unique (tenant_id, id)
);

create unique index swim_item_carryovers_one_open_identity_idx
  on public.swim_item_carryovers (tenant_id, enrollment_id, curriculum_item_identity_id)
  where status = 'open';
create index swim_item_carryovers_participant_idx
  on public.swim_item_carryovers (tenant_id, participant_id, status, created_at desc);

create table public.swim_carryover_completion_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  status text not null default 'processing',
  reason text not null,
  requested_count integer not null,
  completed_count integer not null default 0,
  idempotency_key text not null,
  requested_by_user_id uuid not null references auth.users (id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_carryover_completion_batches_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_carryover_completion_batches_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint swim_carryover_completion_batches_status_check
    check (status in ('processing', 'completed', 'failed')),
  constraint swim_carryover_completion_batches_reason_check
    check (length(trim(reason)) >= 3),
  constraint swim_carryover_completion_batches_count_check
    check (requested_count between 1 and 50 and completed_count between 0 and requested_count),
  constraint swim_carryover_completion_batches_completion_check check (
    (status = 'completed' and completed_at is not null and completed_count = requested_count)
    or (status <> 'completed' and completed_at is null)
  ),
  constraint swim_carryover_completion_batches_idempotency_check
    check (length(idempotency_key) between 8 and 200),
  constraint swim_carryover_completion_batches_idempotency_unique
    unique (tenant_id, idempotency_key),
  constraint swim_carryover_completion_batches_tenant_id_id_unique unique (tenant_id, id)
);

create table public.swim_carryover_completion_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null,
  carryover_id uuid not null,
  observation_id uuid not null,
  rating integer not null,
  created_at timestamptz not null default now(),
  constraint swim_carryover_completion_items_batch_fk
    foreign key (tenant_id, batch_id)
    references public.swim_carryover_completion_batches (tenant_id, id) on delete cascade,
  constraint swim_carryover_completion_items_carryover_fk
    foreign key (tenant_id, carryover_id)
    references public.swim_item_carryovers (tenant_id, id) on delete restrict,
  constraint swim_carryover_completion_items_observation_fk
    foreign key (tenant_id, observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint swim_carryover_completion_items_rating_check check (rating between 1 and 5),
  constraint swim_carryover_completion_items_batch_carryover_unique
    unique (tenant_id, batch_id, carryover_id),
  constraint swim_carryover_completion_items_tenant_id_id_unique unique (tenant_id, id)
);

create trigger swim_item_carryovers_set_updated_at
  before update on public.swim_item_carryovers
  for each row execute function app_private.set_updated_at();
create trigger swim_carryover_completion_batches_set_updated_at
  before update on public.swim_carryover_completion_batches
  for each row execute function app_private.set_updated_at();

create or replace function app_private.preview_swim_transition(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_assignment public.enrollment_stage_assignments%rowtype;
  target_from_stage public.curriculum_stages%rowtype;
  target_to_stage public.curriculum_stages%rowtype;
  target_case_id uuid;
  required_count integer;
  mastered_count integer;
  open_count integer;
  stage_progress numeric;
  stage_coverage numeric;
  target_eligibility text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if not app_private.current_user_has_swim_permission(target_tenant_id, 'transition.review') then
    raise exception 'Insufficient transition review permission';
  end if;

  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
    and enrollment.id = target_enrollment_id
    and enrollment.status in ('active', 'paused')
  for update;

  if target_enrollment.id is null or target_enrollment.curriculum_version_id is null then
    raise exception 'Versioned enrollment not found';
  end if;
  if not (
    app_private.current_user_can_manage_tenant_domain(target_tenant_id)
    or app_private.current_user_can_instruct_participant(target_enrollment.participant_id)
  ) then
    raise exception 'Enrollment is outside actor scope';
  end if;

  select * into target_assignment
  from public.enrollment_stage_assignments assignment
  where assignment.tenant_id = target_tenant_id
    and assignment.enrollment_id = target_enrollment_id
    and assignment.status = 'active'
  for update;

  if target_assignment.id is null then
    raise exception 'Active curriculum stage assignment not found';
  end if;

  select * into target_from_stage
  from public.curriculum_stages stage
  where stage.tenant_id = target_tenant_id
    and stage.id = target_assignment.curriculum_stage_id;

  select * into target_to_stage
  from public.curriculum_stages stage
  where stage.tenant_id = target_tenant_id
    and stage.curriculum_version_id = target_assignment.curriculum_version_id
    and stage.sort_order > target_from_stage.sort_order
  order by stage.sort_order, stage.id
  limit 1;

  select
    count(*)::integer,
    count(*) filter (
      where coalesce(projection.progress_fraction, 0) >= item.mastery_threshold::numeric / 5
    )::integer
  into required_count, mastered_count
  from public.curriculum_items item
  left join public.swim_progress_projections projection
    on projection.tenant_id = item.tenant_id
   and projection.enrollment_id = target_enrollment_id
   and projection.scope_kind = 'item'
   and projection.scope_id = item.id
  where item.tenant_id = target_tenant_id
    and item.curriculum_version_id = target_assignment.curriculum_version_id
    and item.curriculum_stage_id = target_assignment.curriculum_stage_id
    and item.required_for_transition;

  open_count := required_count - mastered_count;
  select projection.progress_fraction, projection.coverage_fraction
    into stage_progress, stage_coverage
  from public.swim_progress_projections projection
  where projection.tenant_id = target_tenant_id
    and projection.enrollment_id = target_enrollment_id
    and projection.scope_kind = 'stage'
    and projection.scope_id = target_assignment.curriculum_stage_id;

  target_eligibility := case
    when target_to_stage.id is null then 'not_eligible'
    when required_count > 0 and open_count = 0 then 'eligible'
    else 'not_eligible'
  end;

  select transition.id into target_case_id
  from public.swim_transition_cases transition
  where transition.tenant_id = target_tenant_id
    and transition.enrollment_id = target_enrollment_id
    and transition.from_stage_id = target_assignment.curriculum_stage_id
    and transition.execution_status = 'pending'
    and transition.approval_status <> 'rejected'
  for update;

  if target_case_id is null then
    insert into public.swim_transition_cases (
      tenant_id,
      participant_id,
      enrollment_id,
      curriculum_version_id,
      from_stage_id,
      to_stage_id,
      eligibility_status,
      eligibility_json,
      eligibility_calculated_at
    ) values (
      target_tenant_id,
      target_enrollment.participant_id,
      target_enrollment_id,
      target_assignment.curriculum_version_id,
      target_assignment.curriculum_stage_id,
      target_to_stage.id,
      target_eligibility,
      jsonb_build_object(
        'requiredCount', required_count,
        'masteredCount', mastered_count,
        'openCount', open_count,
        'stageProgressFraction', stage_progress,
        'stageCoverageFraction', stage_coverage,
        'formulaVersion', 'swim_progress_v3',
        'nextStageAvailable', target_to_stage.id is not null
      ),
      now()
    )
    returning id into target_case_id;
  else
    update public.swim_transition_cases
    set to_stage_id = target_to_stage.id,
        eligibility_status = target_eligibility,
        eligibility_json = jsonb_build_object(
          'requiredCount', required_count,
          'masteredCount', mastered_count,
          'openCount', open_count,
          'stageProgressFraction', stage_progress,
          'stageCoverageFraction', stage_coverage,
          'formulaVersion', 'swim_progress_v3',
          'nextStageAvailable', target_to_stage.id is not null
        ),
        eligibility_calculated_at = now()
    where tenant_id = target_tenant_id
      and id = target_case_id;
  end if;

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type, subject_id, after_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    'transition.review',
    'transition.previewed',
    'swim_transition_case',
    target_case_id,
    jsonb_build_object(
      'eligibilityStatus', target_eligibility,
      'requiredCount', required_count,
      'masteredCount', mastered_count,
      'openCount', open_count,
      'toStageId', target_to_stage.id
    )
  );

  return target_case_id;
end;
$$;

create or replace function app_private.review_swim_transition(
  target_case_id uuid,
  target_reason text,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_case public.swim_transition_cases%rowtype;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  select * into target_case
  from public.swim_transition_cases transition
  where transition.id = target_case_id
  for update;
  if target_case.id is null then
    raise exception 'Transition case not found';
  end if;
  if not app_private.current_user_has_swim_permission(target_case.tenant_id, 'transition.review')
    or not (
      app_private.current_user_can_manage_tenant_domain(target_case.tenant_id)
      or app_private.current_user_can_instruct_participant(target_case.participant_id)
    )
  then
    raise exception 'Insufficient transition review permission';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'A review reason is required';
  end if;

  update public.swim_transition_cases
  set review_status = 'reviewed',
      reviewed_at = now(),
      reviewed_by_user_id = target_actor_user_id,
      reason = trim(target_reason)
  where id = target_case.id;

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type, subject_id, reason, after_json
  ) values (
    target_case.tenant_id,
    target_actor_user_id,
    'transition.review',
    'transition.reviewed',
    'swim_transition_case',
    target_case.id,
    trim(target_reason),
    jsonb_build_object('eligibilityStatus', target_case.eligibility_status, 'reviewStatus', 'reviewed')
  );
  return target_case.id;
end;
$$;

create or replace function app_private.approve_swim_transition(
  target_case_id uuid,
  target_approved boolean,
  target_reason text,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_case public.swim_transition_cases%rowtype;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  select * into target_case
  from public.swim_transition_cases transition
  where transition.id = target_case_id
  for update;
  if target_case.id is null or target_case.review_status <> 'reviewed' then
    raise exception 'Reviewed transition case not found';
  end if;
  if not app_private.current_user_has_swim_permission(target_case.tenant_id, 'transition.approve') then
    raise exception 'Insufficient transition approval permission';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'An approval reason is required';
  end if;

  update public.swim_transition_cases
  set approval_status = case when target_approved then 'approved' else 'rejected' end,
      approved_at = now(),
      approved_by_user_id = target_actor_user_id,
      reason = trim(target_reason)
  where id = target_case.id;

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type, subject_id, reason, before_json, after_json
  ) values (
    target_case.tenant_id,
    target_actor_user_id,
    'transition.approve',
    case when target_approved then 'transition.approved' else 'transition.rejected' end,
    'swim_transition_case',
    target_case.id,
    trim(target_reason),
    jsonb_build_object('approvalStatus', target_case.approval_status),
    jsonb_build_object('approvalStatus', case when target_approved then 'approved' else 'rejected' end)
  );
  return target_case.id;
end;
$$;

create or replace function app_private.execute_swim_transition(
  target_case_id uuid,
  target_reason text,
  target_actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_case public.swim_transition_cases%rowtype;
  target_enrollment public.enrollments%rowtype;
  target_assignment public.enrollment_stage_assignments%rowtype;
  target_legacy_stage_id uuid;
  target_carryover_count integer;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'An execution reason is required';
  end if;

  select * into target_case
  from public.swim_transition_cases transition
  where transition.id = target_case_id
  for update;
  if target_case.id is null
    or target_case.review_status <> 'reviewed'
    or target_case.approval_status <> 'approved'
    or target_case.to_stage_id is null
  then
    raise exception 'Approved transition case not found';
  end if;
  if not app_private.current_user_has_swim_permission(target_case.tenant_id, 'transition.execute') then
    raise exception 'Insufficient transition execution permission';
  end if;

  request_hash := encode(
    extensions.digest(concat_ws(':', target_case.id::text, trim(target_reason)), 'sha256'),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_case.tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'transition.execute'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_case.tenant_id
    and enrollment.id = target_case.enrollment_id
    and enrollment.participant_id = target_case.participant_id
  for update;
  select * into target_assignment
  from public.enrollment_stage_assignments assignment
  where assignment.tenant_id = target_case.tenant_id
    and assignment.enrollment_id = target_case.enrollment_id
    and assignment.status = 'active'
  for update;

  if target_enrollment.id is null
    or target_assignment.id is null
    or target_assignment.curriculum_stage_id <> target_case.from_stage_id
  then
    raise exception 'Enrollment stage changed after approval';
  end if;

  insert into public.swim_item_carryovers (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    curriculum_item_id,
    curriculum_item_identity_id,
    from_stage_id,
    to_stage_id,
    transition_case_id
  )
  select
    target_case.tenant_id,
    target_case.participant_id,
    target_case.enrollment_id,
    target_case.curriculum_version_id,
    item.id,
    item.identity_id,
    target_case.from_stage_id,
    target_case.to_stage_id,
    target_case.id
  from public.curriculum_items item
  left join public.swim_progress_projections projection
    on projection.tenant_id = item.tenant_id
   and projection.enrollment_id = target_case.enrollment_id
   and projection.scope_kind = 'item'
   and projection.scope_id = item.id
  where item.tenant_id = target_case.tenant_id
    and item.curriculum_version_id = target_case.curriculum_version_id
    and item.curriculum_stage_id = target_case.from_stage_id
    and item.required_for_transition
    and coalesce(projection.progress_fraction, 0) < item.mastery_threshold::numeric / 5
  on conflict (tenant_id, transition_case_id, curriculum_item_id) do nothing;
  get diagnostics target_carryover_count = row_count;

  update public.enrollment_stage_assignments
  set status = 'completed',
      ends_at = now(),
      transition_case_id = target_case.id
  where id = target_assignment.id;

  insert into public.enrollment_stage_assignments (
    tenant_id,
    enrollment_id,
    participant_id,
    curriculum_version_id,
    curriculum_stage_id,
    status,
    starts_at,
    assigned_by_user_id,
    transition_case_id
  ) values (
    target_case.tenant_id,
    target_case.enrollment_id,
    target_case.participant_id,
    target_case.curriculum_version_id,
    target_case.to_stage_id,
    'active',
    now(),
    target_actor_user_id,
    target_case.id
  );

  select stage.legacy_stage_id into target_legacy_stage_id
  from public.curriculum_stages stage
  where stage.tenant_id = target_case.tenant_id
    and stage.id = target_case.to_stage_id;
  update public.enrollments
  set current_stage_id = coalesce(target_legacy_stage_id, current_stage_id)
  where tenant_id = target_case.tenant_id
    and id = target_case.enrollment_id;

  update public.swim_transition_cases
  set execution_status = 'executed',
      executed_at = now(),
      executed_by_user_id = target_actor_user_id,
      reason = trim(target_reason)
  where id = target_case.id;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_case.tenant_id,
    target_idempotency_key,
    'transition.execute',
    'swim_transition_case',
    target_case.id,
    target_actor_user_id,
    request_hash,
    jsonb_build_object('transitionCaseId', target_case.id, 'carryoverCount', target_carryover_count)
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id, formula_version, payload_json
  ) values (
    target_case.tenant_id,
    'transition.executed',
    'swim_transition_case',
    target_case.id,
    target_actor_user_id,
    'swim_progress_v3',
    jsonb_build_object(
      'participantId', target_case.participant_id,
      'enrollmentId', target_case.enrollment_id,
      'fromStageId', target_case.from_stage_id,
      'toStageId', target_case.to_stage_id,
      'carryoverCount', target_carryover_count
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type, subject_id,
    reason, before_json, after_json
  ) values (
    target_case.tenant_id,
    target_actor_user_id,
    'transition.execute',
    'transition.executed',
    'swim_transition_case',
    target_case.id,
    trim(target_reason),
    jsonb_build_object('stageId', target_case.from_stage_id),
    jsonb_build_object('stageId', target_case.to_stage_id, 'carryoverCount', target_carryover_count)
  );
  return target_case.id;
end;
$$;

create or replace function app_private.preview_previous_stage_items(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_actor_user_id uuid
)
returns table (
  carryover_id uuid,
  curriculum_item_id uuid,
  stable_key text,
  item_name text,
  from_stage_name text,
  mastery_threshold integer,
  latest_rating integer,
  latest_observation_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if not app_private.current_user_has_swim_permission(target_tenant_id, 'carryover.complete_previous') then
    raise exception 'Insufficient carryover permission';
  end if;
  if not exists (
    select 1
    from public.enrollments enrollment
    where enrollment.tenant_id = target_tenant_id
      and enrollment.id = target_enrollment_id
      and (
        app_private.current_user_can_manage_tenant_domain(target_tenant_id)
        or app_private.current_user_can_instruct_participant(enrollment.participant_id)
      )
  ) then
    raise exception 'Enrollment is outside actor scope';
  end if;

  return query
  select
    carryover.id,
    item.id,
    identity.stable_key,
    item.name,
    stage.name,
    item.mastery_threshold,
    latest.rating,
    latest.id
  from public.swim_item_carryovers carryover
  join public.curriculum_items item
    on item.tenant_id = carryover.tenant_id
   and item.id = carryover.curriculum_item_id
  join public.curriculum_item_identities identity
    on identity.tenant_id = carryover.tenant_id
   and identity.id = carryover.curriculum_item_identity_id
  join public.curriculum_stages stage
    on stage.tenant_id = carryover.tenant_id
   and stage.id = carryover.from_stage_id
  left join lateral (
    select observation.id, observation.rating
    from public.swim_assessment_observations observation
    where observation.tenant_id = carryover.tenant_id
      and observation.enrollment_id = carryover.enrollment_id
      and observation.curriculum_item_id = carryover.curriculum_item_id
      and not exists (
        select 1
        from public.swim_assessment_retractions retraction
        where retraction.tenant_id = observation.tenant_id
          and retraction.observation_id = observation.id
      )
      and not exists (
        select 1
        from public.swim_assessment_observations correction
        where correction.tenant_id = observation.tenant_id
          and correction.corrects_observation_id = observation.id
          and not exists (
            select 1
            from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by observation.observed_at desc, observation.finalized_at desc, observation.id desc
    limit 1
  ) latest on true
  where carryover.tenant_id = target_tenant_id
    and carryover.enrollment_id = target_enrollment_id
    and carryover.status = 'open'
  order by stage.sort_order, item.sort_order, item.id;
end;
$$;

create or replace function app_private.complete_previous_stage_items(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_entries jsonb,
  target_reason text,
  target_actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_carryover public.swim_item_carryovers%rowtype;
  target_item public.curriculum_items%rowtype;
  target_entry jsonb;
  target_batch_id uuid;
  target_observation_id uuid;
  target_rating integer;
  target_visibility text;
  target_requested_count integer;
  target_completed_count integer := 0;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if not app_private.current_user_has_swim_permission(target_tenant_id, 'carryover.complete_previous') then
    raise exception 'Insufficient carryover permission';
  end if;
  if jsonb_typeof(target_entries) <> 'array' then
    raise exception 'Carryover entries must be an array';
  end if;
  target_requested_count := jsonb_array_length(target_entries);
  if target_requested_count < 1 or target_requested_count > 50 then
    raise exception 'A carryover batch must contain 1 through 50 items';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'A carryover completion reason is required';
  end if;

  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
    and enrollment.id = target_enrollment_id
  for update;
  if target_enrollment.id is null or target_enrollment.curriculum_version_id is null then
    raise exception 'Versioned enrollment not found';
  end if;
  if not (
    app_private.current_user_can_manage_tenant_domain(target_tenant_id)
    or app_private.current_user_can_instruct_participant(target_enrollment.participant_id)
  ) then
    raise exception 'Enrollment is outside actor scope';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_enrollment_id::text, target_entries::text, trim(target_reason)),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'carryover.complete_previous'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  insert into public.swim_carryover_completion_batches (
    tenant_id,
    participant_id,
    enrollment_id,
    reason,
    requested_count,
    idempotency_key,
    requested_by_user_id
  ) values (
    target_tenant_id,
    target_enrollment.participant_id,
    target_enrollment_id,
    trim(target_reason),
    target_requested_count,
    target_idempotency_key,
    target_actor_user_id
  )
  returning id into target_batch_id;

  for target_entry in select value from jsonb_array_elements(target_entries)
  loop
    if jsonb_typeof(target_entry) <> 'object'
      or not target_entry ? 'carryoverId'
      or not target_entry ? 'rating'
    then
      raise exception 'Invalid carryover entry';
    end if;
    begin
      target_rating := (target_entry ->> 'rating')::integer;
    exception when others then
      raise exception 'Carryover rating must be an integer';
    end;
    target_visibility := coalesce(nullif(target_entry ->> 'visibility', ''), 'parent_visible');
    if target_rating not between 1 and 5 or target_visibility not in ('internal', 'parent_visible') then
      raise exception 'Invalid carryover rating or visibility';
    end if;

    select carryover.* into target_carryover
    from public.swim_item_carryovers carryover
    where carryover.tenant_id = target_tenant_id
      and carryover.id = (target_entry ->> 'carryoverId')::uuid
      and carryover.enrollment_id = target_enrollment_id
      and carryover.status = 'open'
    for update;
    if target_carryover.id is null then
      raise exception 'Open carryover item not found';
    end if;

    select * into target_item
    from public.curriculum_items item
    where item.tenant_id = target_tenant_id
      and item.id = target_carryover.curriculum_item_id;
    if target_rating < target_item.mastery_threshold then
      raise exception 'Carryover completion rating is below the item mastery threshold';
    end if;

    target_observation_id := app_private.finalize_swim_assessment(
      target_tenant_id,
      target_enrollment.participant_id,
      target_enrollment_id,
      target_carryover.curriculum_item_id,
      target_rating,
      nullif(trim(coalesce(target_entry ->> 'note', '')), ''),
      target_visibility,
      jsonb_build_object(
        'carryoverId', target_carryover.id,
        'fromStageId', target_carryover.from_stage_id,
        'toStageId', target_carryover.to_stage_id,
        'batchId', target_batch_id,
        'providedContext', coalesce(target_entry -> 'context', '{}'::jsonb)
      ),
      now(),
      null,
      null,
      null,
      'carryover_command',
      concat('carryover:', target_batch_id, ':', target_carryover.id),
      'carryover-command',
      target_actor_user_id,
      concat('carryover-assessment:', target_batch_id, ':', target_carryover.id)
    );

    update public.swim_item_carryovers
    set status = 'completed',
        completed_observation_id = target_observation_id,
        completed_at = now(),
        completed_by_user_id = target_actor_user_id
    where id = target_carryover.id;

    insert into public.swim_carryover_completion_items (
      tenant_id, batch_id, carryover_id, observation_id, rating
    ) values (
      target_tenant_id, target_batch_id, target_carryover.id, target_observation_id, target_rating
    );
    target_completed_count := target_completed_count + 1;
  end loop;

  update public.swim_carryover_completion_batches
  set status = 'completed',
      completed_count = target_completed_count,
      completed_at = now()
  where id = target_batch_id;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id,
    target_idempotency_key,
    'carryover.complete_previous',
    'swim_carryover_completion_batch',
    target_batch_id,
    target_actor_user_id,
    request_hash,
    jsonb_build_object('batchId', target_batch_id, 'completedCount', target_completed_count)
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id, formula_version, payload_json
  ) values (
    target_tenant_id,
    'carryover.completed',
    'swim_carryover_completion_batch',
    target_batch_id,
    target_actor_user_id,
    'swim_progress_v3',
    jsonb_build_object(
      'participantId', target_enrollment.participant_id,
      'enrollmentId', target_enrollment_id,
      'completedCount', target_completed_count
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type, subject_id,
    reason, after_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    'carryover.complete_previous',
    'carryover.completed',
    'swim_carryover_completion_batch',
    target_batch_id,
    trim(target_reason),
    jsonb_build_object(
      'participantId', target_enrollment.participant_id,
      'enrollmentId', target_enrollment_id,
      'completedCount', target_completed_count
    )
  );
  return target_batch_id;
end;
$$;

revoke all on function app_private.preview_swim_transition(uuid, uuid, uuid) from public, anon;
revoke all on function app_private.review_swim_transition(uuid, text, uuid) from public, anon;
revoke all on function app_private.approve_swim_transition(uuid, boolean, text, uuid) from public, anon;
revoke all on function app_private.execute_swim_transition(uuid, text, uuid, text) from public, anon;
revoke all on function app_private.preview_previous_stage_items(uuid, uuid, uuid) from public, anon;
revoke all on function app_private.complete_previous_stage_items(uuid, uuid, jsonb, text, uuid, text) from public, anon;
grant execute on function app_private.preview_swim_transition(uuid, uuid, uuid) to authenticated;
grant execute on function app_private.review_swim_transition(uuid, text, uuid) to authenticated;
grant execute on function app_private.approve_swim_transition(uuid, boolean, text, uuid) to authenticated;
grant execute on function app_private.execute_swim_transition(uuid, text, uuid, text) to authenticated;
grant execute on function app_private.preview_previous_stage_items(uuid, uuid, uuid) to authenticated;
grant execute on function app_private.complete_previous_stage_items(uuid, uuid, jsonb, text, uuid, text) to authenticated;

create or replace function public.preview_swim_transition(
  target_tenant_id uuid,
  target_enrollment_id uuid
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.preview_swim_transition(
    target_tenant_id,
    target_enrollment_id,
    (select auth.uid())
  );
$$;

create or replace function public.review_swim_transition(
  target_case_id uuid,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.review_swim_transition(target_case_id, target_reason, (select auth.uid()));
$$;

create or replace function public.approve_swim_transition(
  target_case_id uuid,
  target_approved boolean,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.approve_swim_transition(
    target_case_id,
    target_approved,
    target_reason,
    (select auth.uid())
  );
$$;

create or replace function public.execute_swim_transition(
  target_case_id uuid,
  target_reason text,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.execute_swim_transition(
    target_case_id,
    target_reason,
    (select auth.uid()),
    target_idempotency_key
  );
$$;

create or replace function public.preview_previous_stage_items(
  target_tenant_id uuid,
  target_enrollment_id uuid
)
returns table (
  carryover_id uuid,
  curriculum_item_id uuid,
  stable_key text,
  item_name text,
  from_stage_name text,
  mastery_threshold integer,
  latest_rating integer,
  latest_observation_id uuid
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select *
  from app_private.preview_previous_stage_items(
    target_tenant_id,
    target_enrollment_id,
    (select auth.uid())
  );
$$;

create or replace function public.complete_previous_stage_items(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_entries jsonb,
  target_reason text,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.complete_previous_stage_items(
    target_tenant_id,
    target_enrollment_id,
    target_entries,
    target_reason,
    (select auth.uid()),
    target_idempotency_key
  );
$$;

revoke all on function public.preview_swim_transition(uuid, uuid) from public, anon;
revoke all on function public.review_swim_transition(uuid, text) from public, anon;
revoke all on function public.approve_swim_transition(uuid, boolean, text) from public, anon;
revoke all on function public.execute_swim_transition(uuid, text, text) from public, anon;
revoke all on function public.preview_previous_stage_items(uuid, uuid) from public, anon;
revoke all on function public.complete_previous_stage_items(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.preview_swim_transition(uuid, uuid) to authenticated;
grant execute on function public.review_swim_transition(uuid, text) to authenticated;
grant execute on function public.approve_swim_transition(uuid, boolean, text) to authenticated;
grant execute on function public.execute_swim_transition(uuid, text, text) to authenticated;
grant execute on function public.preview_previous_stage_items(uuid, uuid) to authenticated;
grant execute on function public.complete_previous_stage_items(uuid, uuid, jsonb, text, text) to authenticated;

revoke insert, update, delete on public.swim_transition_cases from authenticated;
drop policy if exists swim_transition_cases_manage on public.swim_transition_cases;

grant select on public.swim_item_carryovers to authenticated;
grant select on public.swim_carryover_completion_batches to authenticated;
grant select on public.swim_carryover_completion_items to authenticated;
grant all on public.swim_item_carryovers to service_role;
grant all on public.swim_carryover_completion_batches to service_role;
grant all on public.swim_carryover_completion_items to service_role;

alter table public.swim_item_carryovers enable row level security;
alter table public.swim_carryover_completion_batches enable row level security;
alter table public.swim_carryover_completion_items enable row level security;
alter table public.swim_item_carryovers force row level security;
alter table public.swim_carryover_completion_batches force row level security;
alter table public.swim_carryover_completion_items force row level security;

create policy swim_item_carryovers_read
  on public.swim_item_carryovers for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );
create policy swim_carryover_completion_batches_read
  on public.swim_carryover_completion_batches for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );
create policy swim_carryover_completion_items_read
  on public.swim_carryover_completion_items for select to authenticated
  using (
    exists (
      select 1
      from public.swim_carryover_completion_batches batch
      where batch.tenant_id = swim_carryover_completion_items.tenant_id
        and batch.id = swim_carryover_completion_items.batch_id
        and (
          app_private.current_user_can_instruct_participant(batch.participant_id)
          or app_private.current_user_can_view_participant(batch.participant_id)
        )
    )
  );

comment on table public.swim_item_carryovers is
  'Open work after an approved stage transition. Each row references the original immutable curriculum item identity; no item is duplicated.';
comment on function public.complete_previous_stage_items(uuid, uuid, jsonb, text, text) is
  'Previewed, permission-bound and idempotent Voltooi onderdelen vorig badje command.';
