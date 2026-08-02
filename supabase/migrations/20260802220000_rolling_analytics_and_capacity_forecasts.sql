-- Formula-versioned rolling flow analytics, deterministic capacity forecasts,
-- planner-approved soft reservations and append-only lifecycle evidence.

create table public.swim_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_key text not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  participant_id uuid,
  enrollment_id uuid,
  program_id uuid,
  curriculum_stage_id uuid,
  group_id uuid,
  occurred_at timestamptz not null,
  local_date date not null,
  tenant_timezone text not null,
  formula_version text not null default 'swim_flow_v3.0.0',
  source_table text not null,
  source_record_id uuid not null,
  source_version integer not null default 1,
  payload_json jsonb not null default '{}'::jsonb,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint swim_lifecycle_events_event_key_check
    check (length(event_key) between 8 and 320),
  constraint swim_lifecycle_events_type_check check (event_type in (
    'waitlist.entered',
    'waitlist.placed',
    'enrollment.started',
    'enrollment.paused',
    'enrollment.resumed',
    'stage.started',
    'transition.approved',
    'transition.executed',
    'diploma.issued',
    'group.membership_started',
    'group.membership_ended',
    'capacity.opening_realized'
  )),
  constraint swim_lifecycle_events_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_lifecycle_events_enrollment_fk
    foreign key (tenant_id, enrollment_id)
    references public.enrollments (tenant_id, id) on delete cascade,
  constraint swim_lifecycle_events_program_fk
    foreign key (tenant_id, program_id)
    references public.programs (tenant_id, id) on delete restrict,
  constraint swim_lifecycle_events_stage_fk
    foreign key (tenant_id, curriculum_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint swim_lifecycle_events_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete cascade,
  constraint swim_lifecycle_events_source_version_check check (source_version > 0),
  constraint swim_lifecycle_events_payload_check check (jsonb_typeof(payload_json) = 'object'),
  constraint swim_lifecycle_events_test_marker_check check (
    (not is_test and journey_run_id is null)
    or is_test
  ),
  constraint swim_lifecycle_events_unique unique (tenant_id, event_key),
  constraint swim_lifecycle_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.swim_flow_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  grain text not null,
  snapshot_date date not null,
  window_start date not null,
  window_end date not null,
  tenant_timezone text not null,
  metric_key text not null,
  formula_version text not null,
  metric_json jsonb not null,
  cohorts_json jsonb not null default '[]'::jsonb,
  data_quality_json jsonb not null,
  source_event_count integer not null default 0,
  source_event_watermark timestamptz,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint swim_flow_metric_snapshots_grain_check
    check (grain in ('daily', 'monthly')),
  constraint swim_flow_metric_snapshots_metric_check
    check (metric_key in ('wait_time', 'stage_duration', 'diploma_duration')),
  constraint swim_flow_metric_snapshots_window_check
    check (window_start <= snapshot_date and snapshot_date < window_end),
  constraint swim_flow_metric_snapshots_metric_json_check
    check (jsonb_typeof(metric_json) = 'object'),
  constraint swim_flow_metric_snapshots_cohorts_check
    check (jsonb_typeof(cohorts_json) = 'array'),
  constraint swim_flow_metric_snapshots_quality_check
    check (jsonb_typeof(data_quality_json) = 'object'),
  constraint swim_flow_metric_snapshots_source_count_check check (source_event_count >= 0),
  constraint swim_flow_metric_snapshots_unique
    unique (tenant_id, grain, snapshot_date, metric_key, formula_version),
  constraint swim_flow_metric_snapshots_tenant_id_id_unique unique (tenant_id, id)
);

create table public.capacity_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  model_version text not null default 'capacity_forecast_v3.0.0',
  formula_version text not null default 'swim_flow_v3.0.0',
  horizon_weeks integer not null,
  as_of_date date not null,
  tenant_timezone text not null,
  filters_json jsonb not null default '{}'::jsonb,
  input_fingerprint text not null,
  status text not null default 'generating',
  result_count integer not null default 0,
  data_quality_json jsonb not null default '{}'::jsonb,
  source_event_watermark timestamptz,
  completed_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capacity_forecast_runs_horizon_check check (horizon_weeks in (4, 8, 12)),
  constraint capacity_forecast_runs_filters_check check (jsonb_typeof(filters_json) = 'object'),
  constraint capacity_forecast_runs_fingerprint_check
    check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint capacity_forecast_runs_status_check
    check (status in ('generating', 'completed', 'failed')),
  constraint capacity_forecast_runs_count_check check (result_count >= 0),
  constraint capacity_forecast_runs_quality_check
    check (jsonb_typeof(data_quality_json) = 'object'),
  constraint capacity_forecast_runs_completion_check check (
    (status = 'generating' and completed_at is null and failure_code is null)
    or (status = 'completed' and completed_at is not null and failure_code is null)
    or (status = 'failed' and completed_at is not null and failure_code is not null)
  ),
  constraint capacity_forecast_runs_unique
    unique (tenant_id, model_version, horizon_weeks, as_of_date, input_fingerprint),
  constraint capacity_forecast_runs_tenant_id_id_unique unique (tenant_id, id)
);

create table public.capacity_forecast_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  run_id uuid not null,
  group_id uuid not null,
  current_capacity numeric(8, 2) not null,
  current_occupied numeric(8, 2) not null,
  active_soft_reservations numeric(8, 2) not null default 0,
  waitlist_demand numeric(8, 2) not null default 0,
  expected_openings numeric(8, 2) not null default 0,
  expected_bottlenecks integer not null default 0,
  conservative_openings numeric(8, 2) not null default 0,
  likely_openings numeric(8, 2) not null default 0,
  optimistic_openings numeric(8, 2) not null default 0,
  earliest_availability_on date,
  likely_availability_on date,
  latest_availability_on date,
  risk_level text not null,
  confidence_label text not null,
  confidence_score numeric(5, 4) not null,
  reasons_json jsonb not null default '[]'::jsonb,
  data_quality_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint capacity_forecast_results_run_fk
    foreign key (tenant_id, run_id)
    references public.capacity_forecast_runs (tenant_id, id) on delete cascade,
  constraint capacity_forecast_results_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete cascade,
  constraint capacity_forecast_results_nonnegative_check check (
    current_capacity >= 0
    and current_occupied >= 0
    and active_soft_reservations >= 0
    and waitlist_demand >= 0
    and expected_openings >= 0
    and expected_bottlenecks >= 0
    and conservative_openings >= 0
    and likely_openings >= 0
    and optimistic_openings >= 0
  ),
  constraint capacity_forecast_results_scenario_check check (
    conservative_openings <= likely_openings
    and likely_openings <= optimistic_openings
  ),
  constraint capacity_forecast_results_range_check check (
    (
      earliest_availability_on is null
      and likely_availability_on is null
      and latest_availability_on is null
    )
    or (
      earliest_availability_on is not null
      and likely_availability_on is not null
      and latest_availability_on is not null
      and earliest_availability_on <= likely_availability_on
      and likely_availability_on <= latest_availability_on
    )
  ),
  constraint capacity_forecast_results_risk_check
    check (risk_level in ('healthy', 'watch', 'bottleneck', 'critical')),
  constraint capacity_forecast_results_confidence_label_check
    check (confidence_label in ('laag', 'middel', 'hoog')),
  constraint capacity_forecast_results_confidence_check check (confidence_score between 0 and 1),
  constraint capacity_forecast_results_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint capacity_forecast_results_quality_check check (jsonb_typeof(data_quality_json) = 'object'),
  constraint capacity_forecast_results_unique unique (tenant_id, run_id, group_id),
  constraint capacity_forecast_results_tenant_id_id_unique unique (tenant_id, id)
);

create table public.capacity_forecast_accuracy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  forecast_result_id uuid not null,
  actual_first_opening_on date,
  absolute_error_days integer,
  within_predicted_range boolean,
  evaluation_status text not null default 'observed',
  evidence_event_ids uuid[] not null default '{}'::uuid[],
  model_version text not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint capacity_forecast_accuracy_result_fk
    foreign key (tenant_id, forecast_result_id)
    references public.capacity_forecast_results (tenant_id, id) on delete cascade,
  constraint capacity_forecast_accuracy_error_check
    check (absolute_error_days is null or absolute_error_days >= 0),
  constraint capacity_forecast_accuracy_status_check
    check (evaluation_status in ('observed', 'no_opening', 'insufficient_evidence')),
  constraint capacity_forecast_accuracy_evidence_check
    check (cardinality(evidence_event_ids) <= 100),
  constraint capacity_forecast_accuracy_unique unique (tenant_id, forecast_result_id),
  constraint capacity_forecast_accuracy_tenant_id_id_unique unique (tenant_id, id)
);

create table public.capacity_soft_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  waitlist_entry_id uuid not null,
  forecast_result_id uuid,
  capacity_bucket text not null default 'regular',
  capacity_weight numeric(4, 2) not null default 1,
  status text not null default 'pending_approval',
  reason text not null,
  idempotency_key text not null,
  requested_by_user_id uuid not null references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  released_by_user_id uuid references auth.users (id) on delete set null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capacity_soft_reservations_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete cascade,
  constraint capacity_soft_reservations_waitlist_fk
    foreign key (tenant_id, waitlist_entry_id)
    references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint capacity_soft_reservations_result_fk
    foreign key (tenant_id, forecast_result_id)
    references public.capacity_forecast_results (tenant_id, id) on delete set null (forecast_result_id),
  constraint capacity_soft_reservations_bucket_check
    check (capacity_bucket in ('regular', 'flex', 'trial')),
  constraint capacity_soft_reservations_weight_check
    check (capacity_weight > 0 and capacity_weight <= 1),
  constraint capacity_soft_reservations_status_check check (
    status in ('pending_approval', 'approved', 'rejected', 'released', 'expired', 'converted')
  ),
  constraint capacity_soft_reservations_reason_check check (length(trim(reason)) between 3 and 1000),
  constraint capacity_soft_reservations_idempotency_check
    check (length(idempotency_key) between 8 and 200),
  constraint capacity_soft_reservations_expiry_check check (expires_at > requested_at),
  constraint capacity_soft_reservations_review_check check (
    (
      status in ('pending_approval', 'expired')
      and reviewed_by_user_id is null
      and reviewed_at is null
    )
    or (
      status in ('approved', 'rejected', 'released', 'converted')
      and reviewed_by_user_id is not null
      and reviewed_at is not null
      and length(trim(coalesce(review_reason, ''))) >= 3
    )
  ),
  constraint capacity_soft_reservations_release_check check (
    (
      status in ('released', 'converted')
      and released_by_user_id is not null
      and released_at is not null
      and length(trim(coalesce(release_reason, ''))) >= 3
    )
    or (
      status not in ('released', 'converted')
      and released_by_user_id is null
      and released_at is null
      and release_reason is null
    )
  ),
  constraint capacity_soft_reservations_idempotency_unique
    unique (tenant_id, idempotency_key),
  constraint capacity_soft_reservations_tenant_id_id_unique unique (tenant_id, id)
);

create unique index capacity_soft_reservations_one_active_candidate_idx
  on public.capacity_soft_reservations (tenant_id, waitlist_entry_id)
  where status in ('pending_approval', 'approved');
create index swim_lifecycle_events_timeline_idx
  on public.swim_lifecycle_events (tenant_id, event_type, local_date, occurred_at);
create index swim_lifecycle_events_aggregate_idx
  on public.swim_lifecycle_events (tenant_id, aggregate_type, aggregate_id, occurred_at);
create index swim_lifecycle_events_group_idx
  on public.swim_lifecycle_events (tenant_id, group_id, occurred_at)
  where group_id is not null;
create index swim_flow_metric_snapshots_lookup_idx
  on public.swim_flow_metric_snapshots
    (tenant_id, metric_key, grain, snapshot_date desc, formula_version);
create index capacity_forecast_runs_lookup_idx
  on public.capacity_forecast_runs
    (tenant_id, as_of_date desc, horizon_weeks, status, model_version);
create index capacity_forecast_results_group_idx
  on public.capacity_forecast_results (tenant_id, group_id, created_at desc);
create index capacity_forecast_accuracy_model_idx
  on public.capacity_forecast_accuracy (tenant_id, model_version, evaluated_at desc);
create index capacity_soft_reservations_group_idx
  on public.capacity_soft_reservations (tenant_id, group_id, status, expires_at);

create trigger capacity_forecast_runs_set_updated_at
  before update on public.capacity_forecast_runs
  for each row execute function app_private.set_updated_at();
create trigger capacity_soft_reservations_set_updated_at
  before update on public.capacity_soft_reservations
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_swim_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Swim lifecycle events are append-only';
end;
$$;

create trigger swim_lifecycle_events_append_only
  before update or delete on public.swim_lifecycle_events
  for each row execute function app_private.prevent_swim_lifecycle_event_mutation();

create or replace function app_private.swim_tenant_timezone(target_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select settings.timezone
      from public.tenant_settings settings
      where settings.tenant_id = target_tenant_id
    ),
    'Europe/Amsterdam'
  );
$$;

create or replace function app_private.append_swim_lifecycle_event(
  target_tenant_id uuid,
  target_event_key text,
  target_event_type text,
  target_aggregate_type text,
  target_aggregate_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_program_id uuid,
  target_curriculum_stage_id uuid,
  target_group_id uuid,
  target_occurred_at timestamptz,
  target_formula_version text,
  target_source_table text,
  target_source_record_id uuid,
  target_payload jsonb,
  target_is_test boolean,
  target_journey_run_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id uuid;
  target_timezone text := app_private.swim_tenant_timezone(target_tenant_id);
begin
  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, curriculum_stage_id, group_id,
    occurred_at, local_date, tenant_timezone, formula_version,
    source_table, source_record_id, payload_json, is_test, journey_run_id
  ) values (
    target_tenant_id, target_event_key, target_event_type, target_aggregate_type,
    target_aggregate_id, target_participant_id, target_enrollment_id,
    target_program_id, target_curriculum_stage_id, target_group_id,
    target_occurred_at,
    (target_occurred_at at time zone target_timezone)::date,
    target_timezone, target_formula_version, target_source_table,
    target_source_record_id, coalesce(target_payload, '{}'::jsonb),
    coalesce(target_is_test, false), target_journey_run_id
  )
  on conflict (tenant_id, event_key) do nothing
  returning id into target_id;

  if target_id is null then
    select event.id into target_id
    from public.swim_lifecycle_events event
    where event.tenant_id = target_tenant_id
      and event.event_key = target_event_key;
  end if;
  return target_id;
end;
$$;

create or replace function app_private.capture_waitlist_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('waitlist:', new.id, ':entered'),
      'waitlist.entered',
      'waitlist_entry',
      new.id,
      new.participant_id,
      null,
      new.program_id,
      null,
      null,
      new.created_at,
      'swim_flow_v3.0.0',
      'waitlist_entries',
      new.id,
      jsonb_build_object(
        'source', new.source,
        'eligibleFrom', new.eligible_from,
        'status', new.status
      ),
      new.is_test,
      new.journey_run_id
    );
  elsif new.status = 'placed' and old.status is distinct from new.status then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('waitlist:', new.id, ':placed'),
      'waitlist.placed',
      'waitlist_entry',
      new.id,
      new.participant_id,
      null,
      new.program_id,
      null,
      null,
      new.updated_at,
      'swim_flow_v3.0.0',
      'waitlist_entries',
      new.id,
      jsonb_build_object('source', new.source, 'status', new.status),
      new.is_test,
      new.journey_run_id
    );
  end if;
  return new;
end;
$$;

create trigger waitlist_entries_capture_swim_lifecycle
  after insert or update of status on public.waitlist_entries
  for each row execute function app_private.capture_waitlist_lifecycle();

create or replace function app_private.capture_conversion_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_program_id uuid;
begin
  select enrollment.program_id into target_program_id
  from public.enrollments enrollment
  where enrollment.tenant_id = new.tenant_id
    and enrollment.id = new.enrollment_id;
  perform app_private.append_swim_lifecycle_event(
    new.tenant_id,
    concat('conversion:', new.id, ':placed'),
    'waitlist.placed',
    'enrollment',
    new.enrollment_id,
    new.participant_id,
    new.enrollment_id,
    target_program_id,
    null,
    null,
    new.placed_at,
    'swim_flow_v3.0.0',
    'intake_conversion_lineage',
    new.id,
    jsonb_build_object(
      'intakeSubmissionId', new.intake_submission_id,
      'placementMethod', new.placement_method
    ),
    new.is_test,
    new.journey_run_id
  );
  return new;
end;
$$;

create trigger intake_conversion_capture_swim_lifecycle
  after insert on public.intake_conversion_lineage
  for each row execute function app_private.capture_conversion_lifecycle();

create or replace function app_private.capture_enrollment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_timezone text := app_private.swim_tenant_timezone(new.tenant_id);
begin
  if tg_op = 'INSERT' then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('enrollment:', new.id, ':started'),
      'enrollment.started',
      'enrollment',
      new.id,
      new.participant_id,
      new.id,
      new.program_id,
      null,
      null,
      (new.starts_on::timestamp at time zone target_timezone),
      'swim_flow_v3.0.0',
      'enrollments',
      new.id,
      jsonb_build_object('source', new.source),
      new.is_test,
      new.journey_run_id
    );
  elsif new.status = 'paused' and old.status is distinct from new.status then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('enrollment:', new.id, ':paused:', new.updated_at),
      'enrollment.paused',
      'enrollment',
      new.id,
      new.participant_id,
      new.id,
      new.program_id,
      null,
      null,
      new.updated_at,
      'swim_flow_v3.0.0',
      'enrollments',
      new.id,
      jsonb_build_object('previousStatus', old.status),
      new.is_test,
      new.journey_run_id
    );
  elsif old.status = 'paused' and new.status = 'active' then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('enrollment:', new.id, ':resumed:', new.updated_at),
      'enrollment.resumed',
      'enrollment',
      new.id,
      new.participant_id,
      new.id,
      new.program_id,
      null,
      null,
      new.updated_at,
      'swim_flow_v3.0.0',
      'enrollments',
      new.id,
      jsonb_build_object('previousStatus', old.status),
      new.is_test,
      new.journey_run_id
    );
  end if;
  return new;
end;
$$;

create trigger enrollments_capture_swim_lifecycle
  after insert or update of status on public.enrollments
  for each row execute function app_private.capture_enrollment_lifecycle();

create or replace function app_private.capture_stage_assignment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
begin
  if new.status <> 'active' then return new; end if;
  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = new.tenant_id
    and enrollment.id = new.enrollment_id;
  perform app_private.append_swim_lifecycle_event(
    new.tenant_id,
    concat('stage-assignment:', new.id, ':started'),
    'stage.started',
    'enrollment_stage_assignment',
    new.id,
    new.participant_id,
    new.enrollment_id,
    target_enrollment.program_id,
    new.curriculum_stage_id,
    null,
    new.starts_at,
    'swim_flow_v3.0.0',
    'enrollment_stage_assignments',
    new.id,
    jsonb_build_object(
      'transitionCaseId', new.transition_case_id,
      'curriculumVersionId', new.curriculum_version_id
    ),
    target_enrollment.is_test,
    target_enrollment.journey_run_id
  );
  return new;
end;
$$;

create trigger enrollment_stage_assignments_capture_swim_lifecycle
  after insert on public.enrollment_stage_assignments
  for each row execute function app_private.capture_stage_assignment_lifecycle();

create or replace function app_private.capture_transition_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
begin
  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = new.tenant_id
    and enrollment.id = new.enrollment_id;

  if new.approval_status = 'approved'
    and old.approval_status is distinct from new.approval_status
  then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('transition:', new.id, ':approved'),
      'transition.approved',
      'swim_transition_case',
      new.id,
      new.participant_id,
      new.enrollment_id,
      target_enrollment.program_id,
      new.from_stage_id,
      null,
      coalesce(new.approved_at, now()),
      'swim_flow_v3.0.0',
      'swim_transition_cases',
      new.id,
      jsonb_build_object('fromStageId', new.from_stage_id, 'toStageId', new.to_stage_id),
      target_enrollment.is_test,
      target_enrollment.journey_run_id
    );
  end if;

  if new.execution_status = 'executed'
    and old.execution_status is distinct from new.execution_status
  then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('transition:', new.id, ':executed'),
      'transition.executed',
      'swim_transition_case',
      new.id,
      new.participant_id,
      new.enrollment_id,
      target_enrollment.program_id,
      new.to_stage_id,
      null,
      coalesce(new.executed_at, now()),
      'swim_flow_v3.0.0',
      'swim_transition_cases',
      new.id,
      jsonb_build_object('fromStageId', new.from_stage_id, 'toStageId', new.to_stage_id),
      target_enrollment.is_test,
      target_enrollment.journey_run_id
    );
  end if;
  return new;
end;
$$;

create trigger swim_transition_cases_capture_lifecycle
  after update of approval_status, execution_status on public.swim_transition_cases
  for each row execute function app_private.capture_transition_lifecycle();

create or replace function app_private.capture_diploma_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_timezone text := app_private.swim_tenant_timezone(new.tenant_id);
begin
  if new.status <> 'issued' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'issued' then return new; end if;
  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = new.tenant_id
    and enrollment.id = new.enrollment_id;
  perform app_private.append_swim_lifecycle_event(
    new.tenant_id,
    concat('certificate:', new.id, ':issued'),
    'diploma.issued',
    'certificate_record',
    new.id,
    new.participant_id,
    new.enrollment_id,
    new.program_id,
    null,
    null,
    (new.issued_on::timestamp at time zone target_timezone),
    'swim_flow_v3.0.0',
    'certificate_records',
    new.id,
    jsonb_build_object('certificateNumber', new.certificate_number),
    target_enrollment.is_test,
    target_enrollment.journey_run_id
  );
  return new;
end;
$$;

create trigger certificate_records_capture_swim_lifecycle
  after insert or update of status on public.certificate_records
  for each row execute function app_private.capture_diploma_lifecycle();

create or replace function app_private.capture_membership_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_group public.groups%rowtype;
  target_timezone text := app_private.swim_tenant_timezone(new.tenant_id);
begin
  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = new.tenant_id
    and enrollment.id = new.enrollment_id;
  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id
    and lesson_group.id = new.group_id;

  if tg_op = 'INSERT' and new.status in ('active', 'trial') then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('membership:', new.id, ':started'),
      'group.membership_started',
      'group_membership',
      new.id,
      new.participant_id,
      new.enrollment_id,
      target_group.program_id,
      null,
      new.group_id,
      (new.starts_on::timestamp at time zone target_timezone),
      'swim_flow_v3.0.0',
      'group_memberships',
      new.id,
      jsonb_build_object('capacityBucket', new.capacity_bucket, 'source', new.source),
      new.is_test,
      new.journey_run_id
    );
  elsif new.status in ('completed', 'cancelled')
    and old.status is distinct from new.status
  then
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('membership:', new.id, ':ended'),
      'group.membership_ended',
      'group_membership',
      new.id,
      new.participant_id,
      new.enrollment_id,
      target_group.program_id,
      null,
      new.group_id,
      coalesce(
        new.ends_on::timestamp at time zone target_timezone,
        new.updated_at
      ),
      'swim_flow_v3.0.0',
      'group_memberships',
      new.id,
      jsonb_build_object('status', new.status, 'capacityWeight', new.capacity_weight),
      new.is_test,
      new.journey_run_id
    );
    perform app_private.append_swim_lifecycle_event(
      new.tenant_id,
      concat('membership:', new.id, ':capacity-opening'),
      'capacity.opening_realized',
      'group',
      new.group_id,
      new.participant_id,
      new.enrollment_id,
      target_group.program_id,
      null,
      new.group_id,
      coalesce(
        new.ends_on::timestamp at time zone target_timezone,
        new.updated_at
      ),
      'capacity_forecast_v3.0.0',
      'group_memberships',
      new.id,
      jsonb_build_object('capacityWeight', new.capacity_weight, 'membershipStatus', new.status),
      new.is_test,
      new.journey_run_id
    );
  end if;
  return new;
end;
$$;

create trigger group_memberships_capture_swim_lifecycle
  after insert or update of status on public.group_memberships
  for each row execute function app_private.capture_membership_lifecycle();

create or replace function app_private.reconcile_swim_lifecycle_events(
  target_tenant_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_count integer;
  after_count integer;
  target_timezone text := app_private.swim_tenant_timezone(target_tenant_id);
begin
  select count(*) into before_count
  from public.swim_lifecycle_events event
  where event.tenant_id = target_tenant_id;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, program_id, occurred_at, local_date, tenant_timezone,
    formula_version, source_table, source_record_id, payload_json,
    is_test, journey_run_id
  )
  select
    entry.tenant_id,
    concat('waitlist:', entry.id, ':entered'),
    'waitlist.entered',
    'waitlist_entry',
    entry.id,
    entry.participant_id,
    entry.program_id,
    entry.created_at,
    (entry.created_at at time zone target_timezone)::date,
    target_timezone,
    'swim_flow_v3.0.0',
    'waitlist_entries',
    entry.id,
    jsonb_build_object('source', entry.source, 'eligibleFrom', entry.eligible_from),
    entry.is_test,
    entry.journey_run_id
  from public.waitlist_entries entry
  where entry.tenant_id = target_tenant_id
  on conflict (tenant_id, event_key) do nothing;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, occurred_at, local_date,
    tenant_timezone, formula_version, source_table, source_record_id,
    payload_json, is_test, journey_run_id
  )
  select
    lineage.tenant_id,
    concat('conversion:', lineage.id, ':placed'),
    'waitlist.placed',
    'enrollment',
    lineage.enrollment_id,
    lineage.participant_id,
    lineage.enrollment_id,
    enrollment.program_id,
    lineage.placed_at,
    (lineage.placed_at at time zone target_timezone)::date,
    target_timezone,
    'swim_flow_v3.0.0',
    'intake_conversion_lineage',
    lineage.id,
    jsonb_build_object('intakeSubmissionId', lineage.intake_submission_id),
    lineage.is_test,
    lineage.journey_run_id
  from public.intake_conversion_lineage lineage
  join public.enrollments enrollment
    on enrollment.tenant_id = lineage.tenant_id
   and enrollment.id = lineage.enrollment_id
  where lineage.tenant_id = target_tenant_id
  on conflict (tenant_id, event_key) do nothing;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, occurred_at, local_date,
    tenant_timezone, formula_version, source_table, source_record_id,
    payload_json, is_test, journey_run_id
  )
  select
    enrollment.tenant_id,
    concat('enrollment:', enrollment.id, ':started'),
    'enrollment.started',
    'enrollment',
    enrollment.id,
    enrollment.participant_id,
    enrollment.id,
    enrollment.program_id,
    enrollment.starts_on::timestamp at time zone target_timezone,
    enrollment.starts_on,
    target_timezone,
    'swim_flow_v3.0.0',
    'enrollments',
    enrollment.id,
    jsonb_build_object('source', enrollment.source),
    enrollment.is_test,
    enrollment.journey_run_id
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
  on conflict (tenant_id, event_key) do nothing;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, curriculum_stage_id,
    occurred_at, local_date, tenant_timezone, formula_version, source_table,
    source_record_id, payload_json, is_test, journey_run_id
  )
  select
    assignment.tenant_id,
    concat('stage-assignment:', assignment.id, ':started'),
    'stage.started',
    'enrollment_stage_assignment',
    assignment.id,
    assignment.participant_id,
    assignment.enrollment_id,
    enrollment.program_id,
    assignment.curriculum_stage_id,
    assignment.starts_at,
    (assignment.starts_at at time zone target_timezone)::date,
    target_timezone,
    'swim_flow_v3.0.0',
    'enrollment_stage_assignments',
    assignment.id,
    jsonb_build_object('transitionCaseId', assignment.transition_case_id),
    enrollment.is_test,
    enrollment.journey_run_id
  from public.enrollment_stage_assignments assignment
  join public.enrollments enrollment
    on enrollment.tenant_id = assignment.tenant_id
   and enrollment.id = assignment.enrollment_id
  where assignment.tenant_id = target_tenant_id
  on conflict (tenant_id, event_key) do nothing;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, curriculum_stage_id,
    occurred_at, local_date, tenant_timezone, formula_version, source_table,
    source_record_id, payload_json, is_test, journey_run_id
  )
  select
    transition.tenant_id,
    concat('transition:', transition.id, ':executed'),
    'transition.executed',
    'swim_transition_case',
    transition.id,
    transition.participant_id,
    transition.enrollment_id,
    enrollment.program_id,
    transition.to_stage_id,
    transition.executed_at,
    (transition.executed_at at time zone target_timezone)::date,
    target_timezone,
    'swim_flow_v3.0.0',
    'swim_transition_cases',
    transition.id,
    jsonb_build_object(
      'fromStageId', transition.from_stage_id,
      'toStageId', transition.to_stage_id
    ),
    enrollment.is_test,
    enrollment.journey_run_id
  from public.swim_transition_cases transition
  join public.enrollments enrollment
    on enrollment.tenant_id = transition.tenant_id
   and enrollment.id = transition.enrollment_id
  where transition.tenant_id = target_tenant_id
    and transition.execution_status = 'executed'
  on conflict (tenant_id, event_key) do nothing;

  insert into public.swim_lifecycle_events (
    tenant_id, event_key, event_type, aggregate_type, aggregate_id,
    participant_id, enrollment_id, program_id, occurred_at, local_date,
    tenant_timezone, formula_version, source_table, source_record_id,
    payload_json, is_test, journey_run_id
  )
  select
    certificate.tenant_id,
    concat('certificate:', certificate.id, ':issued'),
    'diploma.issued',
    'certificate_record',
    certificate.id,
    certificate.participant_id,
    certificate.enrollment_id,
    certificate.program_id,
    certificate.issued_on::timestamp at time zone target_timezone,
    certificate.issued_on,
    target_timezone,
    'swim_flow_v3.0.0',
    'certificate_records',
    certificate.id,
    jsonb_build_object('certificateNumber', certificate.certificate_number),
    enrollment.is_test,
    enrollment.journey_run_id
  from public.certificate_records certificate
  join public.enrollments enrollment
    on enrollment.tenant_id = certificate.tenant_id
   and enrollment.id = certificate.enrollment_id
  where certificate.tenant_id = target_tenant_id
    and certificate.status = 'issued'
  on conflict (tenant_id, event_key) do nothing;

  select count(*) into after_count
  from public.swim_lifecycle_events event
  where event.tenant_id = target_tenant_id;
  return after_count - before_count;
end;
$$;

create or replace function app_private.create_capacity_soft_reservation(
  target_tenant_id uuid,
  target_group_id uuid,
  target_waitlist_entry_id uuid,
  target_forecast_result_id uuid,
  target_capacity_bucket text,
  target_capacity_weight numeric,
  target_expires_at timestamptz,
  target_reason text,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group public.groups%rowtype;
  target_waitlist public.waitlist_entries%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  target_id uuid;
  request_hash text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if not app_private.current_user_has_swim_permission(
    target_tenant_id,
    'forecast.hold.manage'
  ) then
    raise exception 'Insufficient forecast hold permission';
  end if;
  if target_capacity_bucket not in ('regular', 'flex', 'trial')
    or target_capacity_weight <= 0
    or target_capacity_weight > 1
    or target_expires_at <= now() + interval '1 hour'
    or target_expires_at > now() + interval '168 hours'
    or length(trim(coalesce(target_reason, ''))) < 3
    or length(target_idempotency_key) not between 8 and 200
  then
    raise exception 'Invalid soft reservation request';
  end if;

  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = target_tenant_id
    and lesson_group.id = target_group_id
    and lesson_group.status = 'active'
  for update;
  select * into target_waitlist
  from public.waitlist_entries entry
  where entry.tenant_id = target_tenant_id
    and entry.id = target_waitlist_entry_id
    and entry.status in ('waiting', 'reviewing', 'offered')
  for update;
  if target_group.id is null or target_waitlist.id is null then
    raise exception 'Active group or waitlist candidate not found';
  end if;
  if target_group.program_id <> target_waitlist.program_id
    or (
      target_waitlist.recommended_stage_id is not null
      and target_group.stage_id is distinct from target_waitlist.recommended_stage_id
    )
  then
    raise exception 'Waitlist candidate does not match the group';
  end if;

  request_hash := encode(extensions.digest(concat_ws(
    ':', target_group_id, target_waitlist_entry_id, target_capacity_bucket,
    target_capacity_weight, target_expires_at, trim(target_reason)
  ), 'sha256'), 'hex');
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'forecast.soft_hold.request'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another reservation';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  insert into public.capacity_soft_reservations (
    tenant_id, group_id, waitlist_entry_id, forecast_result_id,
    capacity_bucket, capacity_weight, expires_at, reason, idempotency_key,
    requested_by_user_id
  ) values (
    target_tenant_id, target_group_id, target_waitlist_entry_id,
    target_forecast_result_id, target_capacity_bucket, target_capacity_weight,
    target_expires_at, trim(target_reason), target_idempotency_key,
    target_actor_user_id
  ) returning id into target_id;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'forecast.soft_hold.request',
    'capacity_soft_reservation', target_id, target_actor_user_id, request_hash,
    jsonb_build_object('reservationId', target_id, 'status', 'pending_approval')
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, after_json
  ) values (
    target_tenant_id, target_actor_user_id, 'forecast.hold.manage',
    'forecast.soft_hold.requested', 'capacity_soft_reservation', target_id,
    trim(target_reason),
    jsonb_build_object(
      'groupId', target_group_id,
      'waitlistEntryId', target_waitlist_entry_id,
      'expiresAt', target_expires_at
    )
  );
  return target_id;
end;
$$;

create or replace function app_private.review_capacity_soft_reservation(
  target_reservation_id uuid,
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
  target_reservation public.capacity_soft_reservations%rowtype;
  target_group public.groups%rowtype;
  regular_used numeric := 0;
  flex_used numeric := 0;
  trial_used numeric := 0;
  total_used numeric := 0;
  bucket_limit numeric := 0;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  select * into target_reservation
  from public.capacity_soft_reservations reservation
  where reservation.id = target_reservation_id
  for update;
  if target_reservation.id is null then
    raise exception 'Soft reservation not found';
  end if;
  if not app_private.current_user_has_swim_permission(
    target_reservation.tenant_id,
    'forecast.hold.manage'
  ) then
    raise exception 'Insufficient forecast hold permission';
  end if;
  if target_reservation.status <> 'pending_approval' then
    if target_reservation.status = (
      case when target_approved then 'approved' else 'rejected' end
    ) then
      return target_reservation.id;
    end if;
    raise exception 'Soft reservation is no longer pending';
  end if;
  if target_reservation.expires_at <= now() then
    update public.capacity_soft_reservations
    set status = 'expired'
    where id = target_reservation.id;
    raise exception 'Soft reservation expired before review';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'A review reason is required';
  end if;

  if target_approved then
    select * into target_group
    from public.groups lesson_group
    where lesson_group.tenant_id = target_reservation.tenant_id
      and lesson_group.id = target_reservation.group_id
      and lesson_group.status = 'active'
    for update;
    if target_group.id is null then raise exception 'Active group not found'; end if;

    select
      coalesce(sum(source.weight) filter (where source.bucket = 'regular'), 0),
      coalesce(sum(source.weight) filter (where source.bucket = 'flex'), 0),
      coalesce(sum(source.weight) filter (where source.bucket = 'trial'), 0),
      coalesce(sum(source.weight), 0)
    into regular_used, flex_used, trial_used, total_used
    from (
      select membership.capacity_bucket as bucket, membership.capacity_weight as weight
      from public.group_memberships membership
      where membership.tenant_id = target_reservation.tenant_id
        and membership.group_id = target_reservation.group_id
        and membership.status in ('active', 'trial')
      union all
      select registration.capacity_bucket, 1::numeric
      from public.offering_registrations registration
      where registration.tenant_id = target_reservation.tenant_id
        and registration.group_id = target_reservation.group_id
        and registration.status in ('held', 'pending_payment', 'payment_review')
        and (
          registration.hold_expires_at is null
          or registration.hold_expires_at > now()
        )
      union all
      select reservation.capacity_bucket, reservation.capacity_weight
      from public.capacity_soft_reservations reservation
      where reservation.tenant_id = target_reservation.tenant_id
        and reservation.group_id = target_reservation.group_id
        and reservation.status = 'approved'
        and reservation.expires_at > now()
        and reservation.id <> target_reservation.id
    ) source;

    if total_used + target_reservation.capacity_weight > target_group.hard_capacity then
      raise exception 'Physical group capacity exceeded by soft reservation';
    end if;
    bucket_limit := case target_reservation.capacity_bucket
      when 'regular' then target_group.regular_capacity
      when 'flex' then target_group.flex_capacity
      else target_group.trial_capacity
    end;
    if target_reservation.capacity_bucket = 'flex'
      and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional')
    then
      bucket_limit := bucket_limit + greatest(
        target_group.regular_capacity - regular_used,
        0
      );
    elsif target_reservation.capacity_bucket = 'regular'
      and target_group.capacity_borrowing = 'bidirectional'
    then
      bucket_limit := bucket_limit + greatest(
        target_group.flex_capacity - flex_used,
        0
      );
    end if;
    if (
      case target_reservation.capacity_bucket
        when 'regular' then regular_used
        when 'flex' then flex_used
        else trial_used
      end
    ) + target_reservation.capacity_weight > bucket_limit then
      raise exception 'Capacity bucket is full for soft reservation';
    end if;
  end if;

  update public.capacity_soft_reservations
  set status = case when target_approved then 'approved' else 'rejected' end,
      reviewed_by_user_id = target_actor_user_id,
      reviewed_at = now(),
      review_reason = trim(target_reason)
  where id = target_reservation.id;
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, before_json, after_json
  ) values (
    target_reservation.tenant_id, target_actor_user_id,
    'forecast.hold.manage',
    case when target_approved
      then 'forecast.soft_hold.approved'
      else 'forecast.soft_hold.rejected'
    end,
    'capacity_soft_reservation', target_reservation.id, trim(target_reason),
    jsonb_build_object('status', target_reservation.status),
    jsonb_build_object(
      'status', case when target_approved then 'approved' else 'rejected' end
    )
  );
  return target_reservation.id;
end;
$$;

create or replace function app_private.release_capacity_soft_reservation(
  target_reservation_id uuid,
  target_reason text,
  target_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_reservation public.capacity_soft_reservations%rowtype;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  select * into target_reservation
  from public.capacity_soft_reservations reservation
  where reservation.id = target_reservation_id
  for update;
  if target_reservation.id is null then raise exception 'Soft reservation not found'; end if;
  if not app_private.current_user_has_swim_permission(
    target_reservation.tenant_id,
    'forecast.hold.manage'
  ) then
    raise exception 'Insufficient forecast hold permission';
  end if;
  if target_reservation.status = 'released' then return target_reservation.id; end if;
  if target_reservation.status not in ('approved') then
    raise exception 'Only an approved soft reservation can be released';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'A release reason is required';
  end if;

  update public.capacity_soft_reservations
  set status = 'released',
      released_by_user_id = target_actor_user_id,
      released_at = now(),
      release_reason = trim(target_reason)
  where id = target_reservation.id;
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, before_json, after_json
  ) values (
    target_reservation.tenant_id, target_actor_user_id,
    'forecast.hold.manage', 'forecast.soft_hold.released',
    'capacity_soft_reservation', target_reservation.id, trim(target_reason),
    jsonb_build_object('status', target_reservation.status),
    jsonb_build_object('status', 'released')
  );
  return target_reservation.id;
end;
$$;

create or replace function app_private.expire_capacity_soft_reservations(
  target_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count integer;
  released_count integer;
begin
  update public.capacity_soft_reservations
  set status = 'expired'
  where status = 'pending_approval'
    and expires_at <= target_now;
  get diagnostics expired_count = row_count;

  update public.capacity_soft_reservations
  set status = 'released',
      reviewed_by_user_id = coalesce(reviewed_by_user_id, requested_by_user_id),
      reviewed_at = coalesce(reviewed_at, target_now),
      review_reason = coalesce(review_reason, 'Automatisch verlopen'),
      released_by_user_id = requested_by_user_id,
      released_at = target_now,
      release_reason = 'Automatisch verlopen'
  where status = 'approved'
    and expires_at <= target_now;
  get diagnostics released_count = row_count;
  return expired_count + released_count;
end;
$$;

create or replace function app_private.enforce_membership_capacity_bucket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group public.groups%rowtype;
  regular_used numeric := 0;
  flex_used numeric := 0;
  trial_used numeric := 0;
  total_used numeric := 0;
  bucket_limit numeric := 0;
begin
  if new.status not in ('active', 'trial') then return new; end if;
  if new.status = 'trial' and new.capacity_bucket <> 'trial' then
    raise exception 'Trial memberships must use the trial capacity bucket';
  end if;
  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id
    and lesson_group.id = new.group_id
  for update;
  if target_group.id is null then raise exception 'Group not found'; end if;

  select
    coalesce(sum(source.weight) filter (where source.bucket = 'regular'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'flex'), 0),
    coalesce(sum(source.weight) filter (where source.bucket = 'trial'), 0),
    coalesce(sum(source.weight), 0)
  into regular_used, flex_used, trial_used, total_used
  from (
    select membership.capacity_bucket as bucket, membership.capacity_weight as weight
    from public.group_memberships membership
    where membership.tenant_id = new.tenant_id
      and membership.group_id = new.group_id
      and membership.status in ('active', 'trial')
      and (tg_op = 'INSERT' or membership.id <> new.id)
    union all
    select registration.capacity_bucket, 1::numeric
    from public.offering_registrations registration
    where registration.tenant_id = new.tenant_id
      and registration.group_id = new.group_id
      and registration.status in ('held', 'pending_payment', 'payment_review')
      and (
        registration.hold_expires_at is null
        or registration.hold_expires_at > now()
      )
    union all
    select reservation.capacity_bucket, reservation.capacity_weight
    from public.capacity_soft_reservations reservation
    where reservation.tenant_id = new.tenant_id
      and reservation.group_id = new.group_id
      and reservation.status = 'approved'
      and reservation.expires_at > now()
  ) source;
  if total_used + new.capacity_weight > target_group.hard_capacity then
    raise exception 'Physical group capacity exceeded';
  end if;
  bucket_limit := case new.capacity_bucket
    when 'regular' then target_group.regular_capacity
    when 'flex' then target_group.flex_capacity
    else target_group.trial_capacity
  end;
  if new.capacity_bucket = 'flex'
    and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional')
  then
    bucket_limit := bucket_limit + greatest(
      target_group.regular_capacity - regular_used,
      0
    );
  elsif new.capacity_bucket = 'regular'
    and target_group.capacity_borrowing = 'bidirectional'
  then
    bucket_limit := bucket_limit + greatest(
      target_group.flex_capacity - flex_used,
      0
    );
  end if;
  if (
    case new.capacity_bucket
      when 'regular' then regular_used
      when 'flex' then flex_used
      else trial_used
    end
  ) + new.capacity_weight > bucket_limit then
    raise exception 'Requested capacity bucket is full';
  end if;
  return new;
end;
$$;

create or replace function public.create_capacity_soft_reservation(
  target_tenant_id uuid,
  target_group_id uuid,
  target_waitlist_entry_id uuid,
  target_forecast_result_id uuid,
  target_capacity_bucket text,
  target_capacity_weight numeric,
  target_expires_at timestamptz,
  target_reason text,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.create_capacity_soft_reservation(
    target_tenant_id, target_group_id, target_waitlist_entry_id,
    target_forecast_result_id, target_capacity_bucket, target_capacity_weight,
    target_expires_at, target_reason, target_idempotency_key,
    (select auth.uid())
  );
$$;

create or replace function public.review_capacity_soft_reservation(
  target_reservation_id uuid,
  target_approved boolean,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.review_capacity_soft_reservation(
    target_reservation_id, target_approved, target_reason, (select auth.uid())
  );
$$;

create or replace function public.release_capacity_soft_reservation(
  target_reservation_id uuid,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.release_capacity_soft_reservation(
    target_reservation_id, target_reason, (select auth.uid())
  );
$$;

create or replace function public.reconcile_swim_lifecycle_events(
  target_tenant_id uuid
)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.reconcile_swim_lifecycle_events(target_tenant_id);
$$;

create or replace function public.expire_capacity_soft_reservations(
  target_now timestamptz default now()
)
returns integer
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.expire_capacity_soft_reservations(target_now);
$$;

revoke all on function app_private.prevent_swim_lifecycle_event_mutation()
  from public, anon, authenticated;
revoke all on function app_private.swim_tenant_timezone(uuid)
  from public, anon, authenticated;
revoke all on function app_private.append_swim_lifecycle_event(
  uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz,
  text, text, uuid, jsonb, boolean, uuid
) from public, anon, authenticated;
revoke all on function app_private.capture_waitlist_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_conversion_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_enrollment_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_stage_assignment_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_transition_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_diploma_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.capture_membership_lifecycle()
  from public, anon, authenticated;
revoke all on function app_private.reconcile_swim_lifecycle_events(uuid)
  from public, anon, authenticated;
revoke all on function app_private.create_capacity_soft_reservation(
  uuid, uuid, uuid, uuid, text, numeric, timestamptz, text, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.review_capacity_soft_reservation(
  uuid, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.release_capacity_soft_reservation(
  uuid, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.expire_capacity_soft_reservations(timestamptz)
  from public, anon, authenticated;
revoke all on function app_private.enforce_membership_capacity_bucket()
  from public, anon, authenticated;

grant execute on function app_private.prevent_swim_lifecycle_event_mutation()
  to service_role;
grant execute on function app_private.swim_tenant_timezone(uuid)
  to service_role;
grant execute on function app_private.append_swim_lifecycle_event(
  uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz,
  text, text, uuid, jsonb, boolean, uuid
) to service_role;
grant execute on function app_private.capture_waitlist_lifecycle()
  to service_role;
grant execute on function app_private.capture_conversion_lifecycle()
  to service_role;
grant execute on function app_private.capture_enrollment_lifecycle()
  to service_role;
grant execute on function app_private.capture_stage_assignment_lifecycle()
  to service_role;
grant execute on function app_private.capture_transition_lifecycle()
  to service_role;
grant execute on function app_private.capture_diploma_lifecycle()
  to service_role;
grant execute on function app_private.capture_membership_lifecycle()
  to service_role;
grant execute on function app_private.reconcile_swim_lifecycle_events(uuid)
  to service_role;
grant execute on function app_private.create_capacity_soft_reservation(
  uuid, uuid, uuid, uuid, text, numeric, timestamptz, text, text, uuid
) to authenticated, service_role;
grant execute on function app_private.review_capacity_soft_reservation(
  uuid, boolean, text, uuid
) to authenticated, service_role;
grant execute on function app_private.release_capacity_soft_reservation(
  uuid, text, uuid
) to authenticated, service_role;
grant execute on function app_private.expire_capacity_soft_reservations(timestamptz)
  to service_role;
grant execute on function app_private.enforce_membership_capacity_bucket()
  to service_role;

revoke all on function public.create_capacity_soft_reservation(
  uuid, uuid, uuid, uuid, text, numeric, timestamptz, text, text
) from public, anon;
revoke all on function public.review_capacity_soft_reservation(
  uuid, boolean, text
) from public, anon;
revoke all on function public.release_capacity_soft_reservation(
  uuid, text
) from public, anon;
revoke all on function public.reconcile_swim_lifecycle_events(uuid)
  from public, anon, authenticated;
revoke all on function public.expire_capacity_soft_reservations(timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_capacity_soft_reservation(
  uuid, uuid, uuid, uuid, text, numeric, timestamptz, text, text
) to authenticated, service_role;
grant execute on function public.review_capacity_soft_reservation(
  uuid, boolean, text
) to authenticated, service_role;
grant execute on function public.release_capacity_soft_reservation(
  uuid, text
) to authenticated, service_role;
grant execute on function public.reconcile_swim_lifecycle_events(uuid)
  to service_role;
grant execute on function public.expire_capacity_soft_reservations(timestamptz)
  to service_role;

grant select on public.swim_lifecycle_events to authenticated;
grant select on public.swim_flow_metric_snapshots to authenticated;
grant select on public.capacity_forecast_runs to authenticated;
grant select on public.capacity_forecast_results to authenticated;
grant select on public.capacity_forecast_accuracy to authenticated;
grant select on public.capacity_soft_reservations to authenticated;
grant all on public.swim_lifecycle_events to service_role;
grant all on public.swim_flow_metric_snapshots to service_role;
grant all on public.capacity_forecast_runs to service_role;
grant all on public.capacity_forecast_results to service_role;
grant all on public.capacity_forecast_accuracy to service_role;
grant all on public.capacity_soft_reservations to service_role;

alter table public.swim_lifecycle_events enable row level security;
alter table public.swim_flow_metric_snapshots enable row level security;
alter table public.capacity_forecast_runs enable row level security;
alter table public.capacity_forecast_results enable row level security;
alter table public.capacity_forecast_accuracy enable row level security;
alter table public.capacity_soft_reservations enable row level security;
alter table public.swim_lifecycle_events force row level security;
alter table public.swim_flow_metric_snapshots force row level security;
alter table public.capacity_forecast_runs force row level security;
alter table public.capacity_forecast_results force row level security;
alter table public.capacity_forecast_accuracy force row level security;
alter table public.capacity_soft_reservations force row level security;

create policy swim_lifecycle_events_read
  on public.swim_lifecycle_events for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'analytics.read'));
create policy swim_flow_metric_snapshots_read
  on public.swim_flow_metric_snapshots for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'analytics.read'));
create policy capacity_forecast_runs_read
  on public.capacity_forecast_runs for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'forecast.read'));
create policy capacity_forecast_results_read
  on public.capacity_forecast_results for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'forecast.read'));
create policy capacity_forecast_accuracy_read
  on public.capacity_forecast_accuracy for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'forecast.read'));
create policy capacity_soft_reservations_read
  on public.capacity_soft_reservations for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'forecast.read'));

comment on table public.swim_lifecycle_events is
  'Append-only, tenant-local and formula-versioned evidence for swim-flow projections; corrections append new source events.';
comment on table public.swim_flow_metric_snapshots is
  'Daily and monthly rolling twelve-month projections with explicit cohort and data-quality payloads.';
comment on table public.capacity_forecast_runs is
  'Immutable-input deterministic forecast runs. A forecast remains advisory and never places or moves a learner.';
comment on table public.capacity_forecast_accuracy is
  'Observed accuracy by model version; no-history and no-opening outcomes remain explicit.';
comment on table public.capacity_soft_reservations is
  'Planner-reviewed, expiring capacity reservations. Pending rows do not consume capacity and no row enrolls a learner.';
