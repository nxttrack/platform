-- Canonical five-point observations and independently projected learning states.
-- Legacy participant_progress_* tables remain historical compatibility projections.

create table public.swim_assessment_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_item_id uuid not null,
  rating integer,
  note text,
  visibility text not null default 'parent_visible',
  context_json jsonb not null default '{}'::jsonb,
  client_operation_id text,
  device_id text,
  draft_revision integer not null default 1,
  saved_by_user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_assessment_drafts_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_assessment_drafts_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_assessment_drafts_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_assessment_drafts_item_fk
    foreign key (tenant_id, curriculum_item_id)
    references public.curriculum_items (tenant_id, id) on delete restrict,
  constraint swim_assessment_drafts_rating_check check (rating is null or rating between 1 and 5),
  constraint swim_assessment_drafts_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint swim_assessment_drafts_context_check check (jsonb_typeof(context_json) = 'object'),
  constraint swim_assessment_drafts_revision_check check (draft_revision > 0),
  constraint swim_assessment_drafts_expiry_check check (expires_at > created_at),
  constraint swim_assessment_drafts_tenant_id_id_unique unique (tenant_id, id)
);

create unique index swim_assessment_drafts_operation_idx
  on public.swim_assessment_drafts (tenant_id, saved_by_user_id, client_operation_id)
  where client_operation_id is not null;
create unique index swim_assessment_drafts_actor_item_idx
  on public.swim_assessment_drafts (tenant_id, saved_by_user_id, enrollment_id, curriculum_item_id);

create table public.swim_assessment_observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_item_id uuid not null,
  rating integer not null,
  scale_version text not null default 'five_point_v1',
  source_scale_version text not null default 'five_point_v1',
  source_value integer,
  positive_label text not null,
  note text,
  visibility text not null default 'parent_visible',
  context_json jsonb not null default '{}'::jsonb,
  source text not null default 'manual',
  observed_at timestamptz not null,
  finalized_at timestamptz not null default now(),
  assessed_by_user_id uuid references auth.users (id) on delete set null,
  corrects_observation_id uuid,
  correction_reason text,
  session_id uuid,
  client_operation_id text,
  device_id text,
  created_at timestamptz not null default now(),
  constraint swim_assessment_observations_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_assessment_observations_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_assessment_observations_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_assessment_observations_item_fk
    foreign key (tenant_id, curriculum_item_id)
    references public.curriculum_items (tenant_id, id) on delete restrict,
  constraint swim_assessment_observations_correction_fk
    foreign key (tenant_id, corrects_observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint swim_assessment_observations_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete restrict,
  constraint swim_assessment_observations_rating_check check (rating between 1 and 5),
  constraint swim_assessment_observations_scale_check check (scale_version = 'five_point_v1'),
  constraint swim_assessment_observations_source_scale_check
    check (source_scale_version in ('five_point_v1', 'three_point_legacy')),
  constraint swim_assessment_observations_source_value_check check (
    (source_scale_version = 'five_point_v1' and source_value is null)
    or (source_scale_version = 'three_point_legacy' and source_value between 1 and 3)
  ),
  constraint swim_assessment_observations_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint swim_assessment_observations_context_check check (jsonb_typeof(context_json) = 'object'),
  constraint swim_assessment_observations_source_check
    check (source in ('manual', 'offline', 'import', 'admin_command', 'carryover_command')),
  constraint swim_assessment_observations_correction_reason_check check (
    (corrects_observation_id is null and correction_reason is null)
    or (corrects_observation_id is not null and length(trim(correction_reason)) >= 3)
  ),
  constraint swim_assessment_observations_tenant_id_id_unique unique (tenant_id, id)
);

create unique index swim_assessment_observations_operation_idx
  on public.swim_assessment_observations (tenant_id, assessed_by_user_id, client_operation_id)
  where client_operation_id is not null;
create unique index swim_assessment_observations_corrects_once_idx
  on public.swim_assessment_observations (tenant_id, corrects_observation_id)
  where corrects_observation_id is not null;
create index swim_assessment_observations_latest_idx
  on public.swim_assessment_observations (
    tenant_id,
    enrollment_id,
    curriculum_item_id,
    observed_at desc,
    finalized_at desc
  );

create table public.swim_assessment_retractions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  observation_id uuid not null,
  reason text not null,
  retracted_by_user_id uuid references auth.users (id) on delete set null,
  retracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint swim_assessment_retractions_observation_fk
    foreign key (tenant_id, observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint swim_assessment_retractions_reason_check check (length(trim(reason)) >= 3),
  constraint swim_assessment_retractions_observation_unique unique (tenant_id, observation_id),
  constraint swim_assessment_retractions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.swim_progress_projections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  scope_kind text not null,
  scope_key text not null,
  scope_id uuid,
  progress_fraction numeric(18, 12),
  coverage_fraction numeric(18, 12),
  assessed_count integer not null,
  contributing_count integer not null,
  formula_version text not null default 'swim_progress_v3',
  calculated_from_observation_id uuid,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_progress_projections_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_progress_projections_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_progress_projections_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_progress_projections_observation_fk
    foreign key (tenant_id, calculated_from_observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint swim_progress_projections_scope_check
    check (scope_kind in ('item', 'stage', 'competency', 'diploma')),
  constraint swim_progress_projections_scope_id_check check (
    (scope_kind = 'diploma' and scope_id is null and scope_key = 'diploma')
    or (scope_kind <> 'diploma' and scope_id is not null)
  ),
  constraint swim_progress_projections_progress_check
    check (progress_fraction is null or progress_fraction between 0 and 1),
  constraint swim_progress_projections_coverage_check
    check (coverage_fraction is null or coverage_fraction between 0 and 1),
  constraint swim_progress_projections_count_check
    check (assessed_count >= 0 and contributing_count >= 0 and assessed_count <= contributing_count),
  constraint swim_progress_projections_formula_check check (formula_version = 'swim_progress_v3'),
  constraint swim_progress_projections_tenant_id_id_unique unique (tenant_id, id),
  constraint swim_progress_projections_scope_unique
    unique (tenant_id, enrollment_id, scope_kind, scope_key)
);

create index swim_progress_projections_participant_idx
  on public.swim_progress_projections (tenant_id, participant_id, curriculum_version_id, scope_kind);

create table public.swim_transition_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  from_stage_id uuid not null,
  to_stage_id uuid,
  eligibility_status text not null default 'unknown',
  eligibility_json jsonb not null default '{}'::jsonb,
  eligibility_calculated_at timestamptz,
  review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  approval_status text not null default 'pending',
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  execution_status text not null default 'pending',
  executed_at timestamptz,
  executed_by_user_id uuid references auth.users (id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_transition_cases_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_transition_cases_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_transition_cases_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_transition_cases_from_stage_fk
    foreign key (tenant_id, from_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint swim_transition_cases_to_stage_fk
    foreign key (tenant_id, to_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint swim_transition_cases_eligibility_check
    check (eligibility_status in ('unknown', 'not_eligible', 'eligible')),
  constraint swim_transition_cases_eligibility_json_check check (jsonb_typeof(eligibility_json) = 'object'),
  constraint swim_transition_cases_review_check
    check (review_status in ('pending', 'reviewed')),
  constraint swim_transition_cases_approval_check
    check (approval_status in ('pending', 'approved', 'rejected')),
  constraint swim_transition_cases_execution_check
    check (execution_status in ('pending', 'executed', 'cancelled')),
  constraint swim_transition_cases_state_check check (
    (approval_status <> 'approved' or review_status = 'reviewed')
    and (execution_status <> 'executed' or approval_status = 'approved')
  ),
  constraint swim_transition_cases_tenant_id_id_unique unique (tenant_id, id)
);

create unique index swim_transition_cases_one_open_idx
  on public.swim_transition_cases (tenant_id, enrollment_id, from_stage_id)
  where execution_status = 'pending' and approval_status <> 'rejected';

create table public.swim_graduation_controls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  curriculum_version_id uuid not null,
  eligibility_status text not null default 'unknown',
  eligibility_json jsonb not null default '{}'::jsonb,
  eligibility_calculated_at timestamptz,
  control_status text not null default 'pending',
  controlled_at timestamptz,
  controlled_by_user_id uuid references auth.users (id) on delete set null,
  readiness_status text not null default 'not_ready',
  readiness_decided_at timestamptz,
  readiness_decided_by_user_id uuid references auth.users (id) on delete set null,
  credential_status text not null default 'not_issued',
  credential_issued_at timestamptz,
  certificate_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint swim_graduation_controls_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint swim_graduation_controls_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint swim_graduation_controls_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint swim_graduation_controls_certificate_fk
    foreign key (tenant_id, certificate_record_id)
    references public.certificate_records (tenant_id, id) on delete restrict,
  constraint swim_graduation_controls_eligibility_check
    check (eligibility_status in ('unknown', 'not_eligible', 'eligible')),
  constraint swim_graduation_controls_eligibility_json_check check (jsonb_typeof(eligibility_json) = 'object'),
  constraint swim_graduation_controls_control_check
    check (control_status in ('pending', 'approved', 'rejected')),
  constraint swim_graduation_controls_readiness_check
    check (readiness_status in ('not_ready', 'ready')),
  constraint swim_graduation_controls_credential_check
    check (credential_status in ('not_issued', 'issued', 'revoked')),
  constraint swim_graduation_controls_state_check check (
    (readiness_status <> 'ready' or control_status = 'approved')
    and (credential_status <> 'issued' or readiness_status = 'ready')
    and (credential_status <> 'issued' or certificate_record_id is not null)
  ),
  constraint swim_graduation_controls_scope_unique
    unique (tenant_id, enrollment_id, curriculum_version_id),
  constraint swim_graduation_controls_tenant_id_id_unique unique (tenant_id, id)
);

create trigger swim_assessment_drafts_set_updated_at
  before update on public.swim_assessment_drafts
  for each row execute function app_private.set_updated_at();
create trigger swim_progress_projections_set_updated_at
  before update on public.swim_progress_projections
  for each row execute function app_private.set_updated_at();
create trigger swim_transition_cases_set_updated_at
  before update on public.swim_transition_cases
  for each row execute function app_private.set_updated_at();
create trigger swim_graduation_controls_set_updated_at
  before update on public.swim_graduation_controls
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_swim_observation_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Final assessment observations and retractions are append-only';
end;
$$;

revoke all on function app_private.prevent_swim_observation_mutation() from public, anon, authenticated;
grant execute on function app_private.prevent_swim_observation_mutation() to service_role;

create trigger swim_assessment_observations_append_only
  before update or delete on public.swim_assessment_observations
  for each row execute function app_private.prevent_swim_observation_mutation();
create trigger swim_assessment_retractions_append_only
  before update or delete on public.swim_assessment_retractions
  for each row execute function app_private.prevent_swim_observation_mutation();

create or replace function app_private.refresh_swim_progress_projections(
  target_tenant_id uuid,
  target_enrollment_id uuid,
  target_observation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_weighting_enabled boolean;
begin
  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
    and enrollment.id = target_enrollment_id;

  if target_enrollment.id is null or target_enrollment.curriculum_version_id is null then
    raise exception 'Versioned enrollment not found';
  end if;

  select version.weighting_enabled into target_weighting_enabled
  from public.curriculum_versions version
  where version.tenant_id = target_tenant_id
    and version.id = target_enrollment.curriculum_version_id
    and version.status = 'published';

  if target_weighting_enabled is null then
    raise exception 'Published curriculum version not found';
  end if;

  delete from public.swim_progress_projections projection
  where projection.tenant_id = target_tenant_id
    and projection.enrollment_id = target_enrollment_id;

  with latest as (
    select distinct on (observation.curriculum_item_id)
      observation.id,
      observation.curriculum_item_id,
      observation.rating
    from public.swim_assessment_observations observation
    where observation.tenant_id = target_tenant_id
      and observation.enrollment_id = target_enrollment_id
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
            select 1 from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by
      observation.curriculum_item_id,
      observation.observed_at desc,
      observation.finalized_at desc,
      observation.id desc
  )
  insert into public.swim_progress_projections (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    scope_kind,
    scope_key,
    scope_id,
    progress_fraction,
    coverage_fraction,
    assessed_count,
    contributing_count,
    formula_version,
    calculated_from_observation_id
  )
  select
    target_tenant_id,
    target_enrollment.participant_id,
    target_enrollment_id,
    target_enrollment.curriculum_version_id,
    'item',
    item.id::text,
    item.id,
    case when latest.id is null then null else latest.rating::numeric / 5 end,
    case when latest.id is null then 0 else 1 end,
    case when latest.id is null then 0 else 1 end,
    1,
    'swim_progress_v3',
    target_observation_id
  from public.curriculum_items item
  left join latest on latest.curriculum_item_id = item.id
  where item.tenant_id = target_tenant_id
    and item.curriculum_version_id = target_enrollment.curriculum_version_id;

  with latest as (
    select distinct on (observation.curriculum_item_id)
      observation.id,
      observation.curriculum_item_id,
      observation.rating
    from public.swim_assessment_observations observation
    where observation.tenant_id = target_tenant_id
      and observation.enrollment_id = target_enrollment_id
      and not exists (
        select 1 from public.swim_assessment_retractions retraction
        where retraction.tenant_id = observation.tenant_id and retraction.observation_id = observation.id
      )
      and not exists (
        select 1 from public.swim_assessment_observations correction
        where correction.tenant_id = observation.tenant_id and correction.corrects_observation_id = observation.id
          and not exists (
            select 1 from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by observation.curriculum_item_id, observation.observed_at desc, observation.finalized_at desc, observation.id desc
  )
  insert into public.swim_progress_projections (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    scope_kind,
    scope_key,
    scope_id,
    progress_fraction,
    coverage_fraction,
    assessed_count,
    contributing_count,
    formula_version,
    calculated_from_observation_id
  )
  select
    target_tenant_id,
    target_enrollment.participant_id,
    target_enrollment_id,
    target_enrollment.curriculum_version_id,
    'stage',
    stage.id::text,
    stage.id,
    coalesce(
      sum(
        case when latest.id is null then 0
        else (latest.rating::numeric / 5) * case when target_weighting_enabled then item.weight else 1 end
        end
      ) / nullif(sum(case when target_weighting_enabled then item.weight else 1 end), 0),
      0
    ),
    count(latest.id)::numeric / nullif(count(item.id), 0),
    count(latest.id)::integer,
    count(item.id)::integer,
    'swim_progress_v3',
    target_observation_id
  from public.curriculum_stages stage
  join public.curriculum_items item
    on item.tenant_id = stage.tenant_id
   and item.curriculum_stage_id = stage.id
   and item.contributes_to_stage
  left join latest on latest.curriculum_item_id = item.id
  where stage.tenant_id = target_tenant_id
    and stage.curriculum_version_id = target_enrollment.curriculum_version_id
  group by stage.id;

  with latest as (
    select distinct on (observation.curriculum_item_id)
      observation.id,
      observation.curriculum_item_id,
      observation.rating
    from public.swim_assessment_observations observation
    where observation.tenant_id = target_tenant_id
      and observation.enrollment_id = target_enrollment_id
      and not exists (
        select 1 from public.swim_assessment_retractions retraction
        where retraction.tenant_id = observation.tenant_id and retraction.observation_id = observation.id
      )
      and not exists (
        select 1 from public.swim_assessment_observations correction
        where correction.tenant_id = observation.tenant_id and correction.corrects_observation_id = observation.id
          and not exists (
            select 1 from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by observation.curriculum_item_id, observation.observed_at desc, observation.finalized_at desc, observation.id desc
  )
  insert into public.swim_progress_projections (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    scope_kind,
    scope_key,
    scope_id,
    progress_fraction,
    coverage_fraction,
    assessed_count,
    contributing_count,
    formula_version,
    calculated_from_observation_id
  )
  select
    target_tenant_id,
    target_enrollment.participant_id,
    target_enrollment_id,
    target_enrollment.curriculum_version_id,
    'competency',
    competency.id::text,
    competency.id,
    coalesce(
      sum(
        case when latest.id is null then 0
        else (latest.rating::numeric / 5)
          * link.contribution_weight
          * case when target_weighting_enabled then item.weight else 1 end
        end
      ) / nullif(
        sum(link.contribution_weight * case when target_weighting_enabled then item.weight else 1 end),
        0
      ),
      0
    ),
    count(latest.id)::numeric / nullif(count(item.id), 0),
    count(latest.id)::integer,
    count(item.id)::integer,
    'swim_progress_v3',
    target_observation_id
  from public.curriculum_competencies competency
  join public.curriculum_item_competencies link
    on link.tenant_id = competency.tenant_id
   and link.competency_id = competency.id
  join public.curriculum_items item
    on item.tenant_id = link.tenant_id
   and item.id = link.curriculum_item_id
  left join latest on latest.curriculum_item_id = item.id
  where competency.tenant_id = target_tenant_id
    and competency.curriculum_version_id = target_enrollment.curriculum_version_id
  group by competency.id;

  with latest as (
    select distinct on (observation.curriculum_item_id)
      observation.id,
      observation.curriculum_item_id,
      observation.rating
    from public.swim_assessment_observations observation
    where observation.tenant_id = target_tenant_id
      and observation.enrollment_id = target_enrollment_id
      and not exists (
        select 1 from public.swim_assessment_retractions retraction
        where retraction.tenant_id = observation.tenant_id and retraction.observation_id = observation.id
      )
      and not exists (
        select 1 from public.swim_assessment_observations correction
        where correction.tenant_id = observation.tenant_id and correction.corrects_observation_id = observation.id
          and not exists (
            select 1 from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by observation.curriculum_item_id, observation.observed_at desc, observation.finalized_at desc, observation.id desc
  )
  insert into public.swim_progress_projections (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    scope_kind,
    scope_key,
    scope_id,
    progress_fraction,
    coverage_fraction,
    assessed_count,
    contributing_count,
    formula_version,
    calculated_from_observation_id
  )
  select
    target_tenant_id,
    target_enrollment.participant_id,
    target_enrollment_id,
    target_enrollment.curriculum_version_id,
    'diploma',
    'diploma',
    null,
    coalesce(
      sum(
        case when latest.id is null then 0
        else (latest.rating::numeric / 5) * case when target_weighting_enabled then item.weight else 1 end
        end
      ) / nullif(sum(case when target_weighting_enabled then item.weight else 1 end), 0),
      0
    ),
    count(latest.id)::numeric / nullif(count(item.id), 0),
    count(latest.id)::integer,
    count(item.id)::integer,
    'swim_progress_v3',
    target_observation_id
  from public.curriculum_items item
  left join latest on latest.curriculum_item_id = item.id
  where item.tenant_id = target_tenant_id
    and item.curriculum_version_id = target_enrollment.curriculum_version_id
    and item.contributes_to_diploma
  having count(item.id) > 0;
end;
$$;

revoke all on function app_private.refresh_swim_progress_projections(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.refresh_swim_progress_projections(uuid, uuid, uuid) to service_role;

create or replace function app_private.finalize_swim_assessment(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_enrollment_id uuid,
  target_curriculum_item_id uuid,
  target_rating integer,
  target_note text,
  target_visibility text,
  target_context_json jsonb,
  target_observed_at timestamptz,
  target_session_id uuid,
  target_corrects_observation_id uuid,
  target_correction_reason text,
  target_source text,
  target_client_operation_id text,
  target_device_id text,
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
  target_item public.curriculum_items%rowtype;
  target_legacy_module_id uuid;
  target_legacy_score_id uuid;
  target_observation_id uuid;
  target_positive_label text;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if target_rating not between 1 and 5 then
    raise exception 'Assessment rating must be an integer from 1 through 5';
  end if;
  if target_visibility not in ('internal', 'parent_visible') then
    raise exception 'Unsupported visibility';
  end if;
  if target_source not in ('manual', 'offline', 'import', 'admin_command', 'carryover_command') then
    raise exception 'Unsupported assessment source';
  end if;
  if jsonb_typeof(coalesce(target_context_json, '{}'::jsonb)) <> 'object' then
    raise exception 'Assessment context must be an object';
  end if;

  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id
    and enrollment.id = target_enrollment_id
    and enrollment.participant_id = target_participant_id
  for update;

  if target_enrollment.id is null or target_enrollment.curriculum_version_id is null then
    raise exception 'Versioned enrollment not found';
  end if;

  select * into target_item
  from public.curriculum_items item
  where item.tenant_id = target_tenant_id
    and item.id = target_curriculum_item_id
    and item.curriculum_version_id = target_enrollment.curriculum_version_id;

  if target_item.id is null then
    raise exception 'Curriculum item does not belong to the enrollment version';
  end if;

  if not app_private.current_user_has_swim_permission(target_tenant_id, 'assessment.record')
    or not (
      app_private.current_user_can_manage_tenant_domain(target_tenant_id)
      or app_private.current_user_can_instruct_participant(target_participant_id)
    )
  then
    raise exception 'Insufficient assessment permission';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(
        ':',
        target_participant_id::text,
        target_enrollment_id::text,
        target_curriculum_item_id::text,
        target_rating::text,
        coalesce(target_corrects_observation_id::text, '')
      ),
      'sha256'
    ),
    'hex'
  );

  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'assessment.finalize'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  if target_corrects_observation_id is not null then
    if not app_private.current_user_has_swim_permission(target_tenant_id, 'assessment.correct') then
      raise exception 'Insufficient correction permission';
    end if;
    if length(trim(coalesce(target_correction_reason, ''))) < 3 then
      raise exception 'A correction reason is required';
    end if;
    if not exists (
      select 1
      from public.swim_assessment_observations observation
      where observation.tenant_id = target_tenant_id
        and observation.id = target_corrects_observation_id
        and observation.participant_id = target_participant_id
        and observation.enrollment_id = target_enrollment_id
        and observation.curriculum_item_id = target_curriculum_item_id
        and not exists (
          select 1 from public.swim_assessment_retractions retraction
          where retraction.tenant_id = observation.tenant_id
            and retraction.observation_id = observation.id
        )
        and not exists (
          select 1 from public.swim_assessment_observations correction
          where correction.tenant_id = observation.tenant_id
            and correction.corrects_observation_id = observation.id
            and not exists (
              select 1 from public.swim_assessment_retractions correction_retraction
              where correction_retraction.tenant_id = correction.tenant_id
                and correction_retraction.observation_id = correction.id
            )
        )
    ) then
      raise exception 'Correction predecessor is not the current final observation';
    end if;
  end if;

  target_positive_label := case target_rating
    when 1 then 'Goed begonnen'
    when 2 then 'Goed bezig'
    when 3 then 'Mooi op weg'
    when 4 then 'Heel knap'
    when 5 then 'Superster'
  end;

  insert into public.swim_assessment_observations (
    tenant_id,
    participant_id,
    enrollment_id,
    curriculum_version_id,
    curriculum_item_id,
    rating,
    positive_label,
    note,
    visibility,
    context_json,
    source,
    observed_at,
    assessed_by_user_id,
    corrects_observation_id,
    correction_reason,
    session_id,
    client_operation_id,
    device_id
  ) values (
    target_tenant_id,
    target_participant_id,
    target_enrollment_id,
    target_enrollment.curriculum_version_id,
    target_curriculum_item_id,
    target_rating,
    target_positive_label,
    nullif(trim(coalesce(target_note, '')), ''),
    target_visibility,
    coalesce(target_context_json, '{}'::jsonb),
    target_source,
    coalesce(target_observed_at, now()),
    target_actor_user_id,
    target_corrects_observation_id,
    nullif(trim(coalesce(target_correction_reason, '')), ''),
    target_session_id,
    nullif(trim(coalesce(target_client_operation_id, '')), ''),
    nullif(trim(coalesce(target_device_id, '')), '')
  )
  returning id into target_observation_id;

  perform app_private.refresh_swim_progress_projections(
    target_tenant_id,
    target_enrollment_id,
    target_observation_id
  );

  if target_item.legacy_progress_item_id is not null then
    select progress_item.module_id into target_legacy_module_id
    from public.progress_items progress_item
    where progress_item.tenant_id = target_tenant_id
      and progress_item.id = target_item.legacy_progress_item_id;

    insert into public.participant_progress_scores (
      tenant_id,
      participant_id,
      enrollment_id,
      module_id,
      item_id,
      session_id,
      score,
      scale_version,
      source_scale_version,
      source_value,
      positive_label,
      note,
      visibility,
      status,
      scored_by_user_id,
      scored_at,
      source
    ) values (
      target_tenant_id,
      target_participant_id,
      target_enrollment_id,
      target_legacy_module_id,
      target_item.legacy_progress_item_id,
      target_session_id,
      target_rating,
      'five_point_v1',
      'five_point_v1',
      null,
      target_positive_label,
      nullif(trim(coalesce(target_note, '')), ''),
      target_visibility,
      'active',
      target_actor_user_id,
      coalesce(target_observed_at, now()),
      case when target_source = 'import' then 'import' else 'manual' end
    )
    on conflict (tenant_id, participant_id, item_id)
    do update set
      enrollment_id = excluded.enrollment_id,
      session_id = excluded.session_id,
      score = excluded.score,
      positive_label = excluded.positive_label,
      note = excluded.note,
      visibility = excluded.visibility,
      status = excluded.status,
      scored_by_user_id = excluded.scored_by_user_id,
      scored_at = excluded.scored_at,
      scale_version = excluded.scale_version,
      source_scale_version = excluded.source_scale_version,
      source_value = excluded.source_value
    returning id into target_legacy_score_id;
  end if;

  insert into public.domain_command_receipts (
    tenant_id,
    idempotency_key,
    command_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    request_hash,
    result_json
  ) values (
    target_tenant_id,
    target_idempotency_key,
    'assessment.finalize',
    'swim_assessment_observation',
    target_observation_id,
    target_actor_user_id,
    request_hash,
    jsonb_build_object(
      'observationId', target_observation_id,
      'legacyProgressScoreId', target_legacy_score_id
    )
  );

  insert into public.domain_outbox_events (
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    formula_version,
    payload_json
  ) values (
    target_tenant_id,
    case when target_corrects_observation_id is null then 'assessment.finalized' else 'assessment.corrected' end,
    'swim_assessment_observation',
    target_observation_id,
    target_actor_user_id,
    'swim_progress_v3',
    jsonb_build_object(
      'participantId', target_participant_id,
      'enrollmentId', target_enrollment_id,
      'curriculumItemId', target_curriculum_item_id,
      'rating', target_rating,
      'visibility', target_visibility
    )
  );

  insert into public.swim_audit_events (
    tenant_id,
    actor_user_id,
    permission_key,
    event_type,
    subject_type,
    subject_id,
    reason,
    before_json,
    after_json
  ) values (
    target_tenant_id,
    target_actor_user_id,
    case when target_corrects_observation_id is null then 'assessment.record' else 'assessment.correct' end,
    case when target_corrects_observation_id is null then 'assessment.finalized' else 'assessment.corrected' end,
    'swim_assessment_observation',
    target_observation_id,
    target_correction_reason,
    case when target_corrects_observation_id is null
      then '{}'::jsonb
      else jsonb_build_object('correctsObservationId', target_corrects_observation_id)
    end,
    jsonb_build_object('rating', target_rating, 'visibility', target_visibility)
  );

  return target_observation_id;
end;
$$;

revoke all on function app_private.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, uuid, text
) from public, anon;
grant execute on function app_private.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, uuid, text
) to authenticated;
grant execute on function app_private.finalize_swim_assessment(
  uuid, uuid, uuid, uuid, integer, text, text, jsonb, timestamptz, uuid, uuid, text, text, text, text, uuid, text
) to service_role;

create or replace function app_private.retract_swim_assessment(
  target_observation_id uuid,
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
  target_observation public.swim_assessment_observations%rowtype;
  target_retraction_id uuid;
  target_legacy_item_id uuid;
  target_effective_observation public.swim_assessment_observations%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  if target_actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'A retraction reason is required';
  end if;

  select * into target_observation
  from public.swim_assessment_observations observation
  where observation.id = target_observation_id;

  if target_observation.id is null then
    raise exception 'Assessment observation not found';
  end if;
  if not app_private.current_user_has_swim_permission(target_observation.tenant_id, 'assessment.correct')
    or not (
      app_private.current_user_can_manage_tenant_domain(target_observation.tenant_id)
      or app_private.current_user_can_instruct_participant(target_observation.participant_id)
    )
  then
    raise exception 'Insufficient correction permission';
  end if;
  if exists (
    select 1
    from public.swim_assessment_observations correction
    where correction.tenant_id = target_observation.tenant_id
      and correction.corrects_observation_id = target_observation.id
      and not exists (
        select 1 from public.swim_assessment_retractions correction_retraction
        where correction_retraction.tenant_id = correction.tenant_id
          and correction_retraction.observation_id = correction.id
      )
  ) then
    raise exception 'Only the current correction-chain leaf can be retracted';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_observation_id::text, trim(target_reason), target_actor_user_id::text),
      'sha256'
    ),
    'hex'
  );

  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_observation.tenant_id
    and receipt.idempotency_key = target_idempotency_key;

  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'assessment.retract'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  insert into public.swim_assessment_retractions (
    tenant_id,
    observation_id,
    reason,
    retracted_by_user_id
  ) values (
    target_observation.tenant_id,
    target_observation_id,
    trim(target_reason),
    target_actor_user_id
  )
  returning id into target_retraction_id;

  perform app_private.refresh_swim_progress_projections(
    target_observation.tenant_id,
    target_observation.enrollment_id,
    target_observation_id
  );

  select item.legacy_progress_item_id into target_legacy_item_id
  from public.curriculum_items item
  where item.tenant_id = target_observation.tenant_id
    and item.id = target_observation.curriculum_item_id;

  if target_legacy_item_id is not null then
    select * into target_effective_observation
    from public.swim_assessment_observations observation
    where observation.tenant_id = target_observation.tenant_id
      and observation.enrollment_id = target_observation.enrollment_id
      and observation.curriculum_item_id = target_observation.curriculum_item_id
      and not exists (
        select 1 from public.swim_assessment_retractions retraction
        where retraction.tenant_id = observation.tenant_id
          and retraction.observation_id = observation.id
      )
      and not exists (
        select 1 from public.swim_assessment_observations correction
        where correction.tenant_id = observation.tenant_id
          and correction.corrects_observation_id = observation.id
          and not exists (
            select 1 from public.swim_assessment_retractions correction_retraction
            where correction_retraction.tenant_id = correction.tenant_id
              and correction_retraction.observation_id = correction.id
          )
      )
    order by observation.observed_at desc, observation.finalized_at desc, observation.id desc
    limit 1;

    if target_effective_observation.id is null then
      update public.participant_progress_scores
      set status = 'archived'
      where tenant_id = target_observation.tenant_id
        and participant_id = target_observation.participant_id
        and item_id = target_legacy_item_id;
    else
      update public.participant_progress_scores
      set score = target_effective_observation.rating,
          positive_label = target_effective_observation.positive_label,
          note = target_effective_observation.note,
          visibility = target_effective_observation.visibility,
          status = 'active',
          scored_by_user_id = target_effective_observation.assessed_by_user_id,
          scored_at = target_effective_observation.observed_at
      where tenant_id = target_observation.tenant_id
        and participant_id = target_observation.participant_id
        and item_id = target_legacy_item_id;
    end if;
  end if;

  insert into public.domain_command_receipts (
    tenant_id,
    idempotency_key,
    command_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    request_hash,
    result_json
  ) values (
    target_observation.tenant_id,
    target_idempotency_key,
    'assessment.retract',
    'swim_assessment_retraction',
    target_retraction_id,
    target_actor_user_id,
    request_hash,
    jsonb_build_object('observationId', target_observation_id, 'retractionId', target_retraction_id)
  );

  insert into public.domain_outbox_events (
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    actor_user_id,
    formula_version,
    payload_json
  ) values (
    target_observation.tenant_id,
    'assessment.corrected',
    'swim_assessment_retraction',
    target_retraction_id,
    target_actor_user_id,
    'swim_progress_v3',
    jsonb_build_object(
      'participantId', target_observation.participant_id,
      'enrollmentId', target_observation.enrollment_id,
      'observationId', target_observation_id,
      'retracted', true
    )
  );

  insert into public.swim_audit_events (
    tenant_id,
    actor_user_id,
    permission_key,
    event_type,
    subject_type,
    subject_id,
    reason,
    before_json,
    after_json
  ) values (
    target_observation.tenant_id,
    target_actor_user_id,
    'assessment.correct',
    'assessment.retracted',
    'swim_assessment_observation',
    target_observation_id,
    trim(target_reason),
    jsonb_build_object('rating', target_observation.rating),
    jsonb_build_object('retracted', true, 'retractionId', target_retraction_id)
  );

  return target_retraction_id;
end;
$$;

revoke all on function app_private.retract_swim_assessment(uuid, text, uuid, text) from public, anon;
grant execute on function app_private.retract_swim_assessment(uuid, text, uuid, text) to authenticated;
grant execute on function app_private.retract_swim_assessment(uuid, text, uuid, text) to service_role;

grant select, insert, update, delete on public.swim_assessment_drafts to authenticated;
grant select on public.swim_assessment_observations to authenticated;
grant select on public.swim_assessment_retractions to authenticated;
grant select on public.swim_progress_projections to authenticated;
grant select, insert, update on public.swim_transition_cases to authenticated;
grant select, insert, update on public.swim_graduation_controls to authenticated;

grant all on public.swim_assessment_drafts to service_role;
grant all on public.swim_assessment_observations to service_role;
grant all on public.swim_assessment_retractions to service_role;
grant all on public.swim_progress_projections to service_role;
grant all on public.swim_transition_cases to service_role;
grant all on public.swim_graduation_controls to service_role;

alter table public.swim_assessment_drafts enable row level security;
alter table public.swim_assessment_observations enable row level security;
alter table public.swim_assessment_retractions enable row level security;
alter table public.swim_progress_projections enable row level security;
alter table public.swim_transition_cases enable row level security;
alter table public.swim_graduation_controls enable row level security;

alter table public.swim_assessment_drafts force row level security;
alter table public.swim_assessment_observations force row level security;
alter table public.swim_assessment_retractions force row level security;
alter table public.swim_progress_projections force row level security;
alter table public.swim_transition_cases force row level security;
alter table public.swim_graduation_controls force row level security;

create policy swim_assessment_drafts_read
  on public.swim_assessment_drafts for select to authenticated
  using (
    saved_by_user_id = (select auth.uid())
    and app_private.current_user_can_instruct_participant(participant_id)
  );
create policy swim_assessment_drafts_manage
  on public.swim_assessment_drafts for all to authenticated
  using (
    saved_by_user_id = (select auth.uid())
    and app_private.current_user_has_swim_permission(tenant_id, 'assessment.record')
    and app_private.current_user_can_instruct_participant(participant_id)
  )
  with check (
    saved_by_user_id = (select auth.uid())
    and app_private.current_user_has_swim_permission(tenant_id, 'assessment.record')
    and app_private.current_user_can_instruct_participant(participant_id)
  );

create policy swim_assessment_observations_read
  on public.swim_assessment_observations for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or (
      visibility = 'parent_visible'
      and app_private.current_user_can_view_participant(participant_id)
    )
  );
create policy swim_assessment_retractions_read
  on public.swim_assessment_retractions for select to authenticated
  using (
    exists (
      select 1
      from public.swim_assessment_observations observation
      where observation.tenant_id = swim_assessment_retractions.tenant_id
        and observation.id = swim_assessment_retractions.observation_id
        and (
          app_private.current_user_can_instruct_participant(observation.participant_id)
          or (
            observation.visibility = 'parent_visible'
            and app_private.current_user_can_view_participant(observation.participant_id)
          )
        )
    )
  );
create policy swim_progress_projections_read
  on public.swim_progress_projections for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy swim_transition_cases_read
  on public.swim_transition_cases for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );
create policy swim_transition_cases_manage
  on public.swim_transition_cases for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'transition.review'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'transition.review'));

create policy swim_graduation_controls_read
  on public.swim_graduation_controls for select to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );
create policy swim_graduation_controls_manage
  on public.swim_graduation_controls for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'transition.approve'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'transition.approve'));

comment on table public.swim_assessment_observations is
  'Canonical append-only integer 1..5 observations. Null means no row and therefore exclusively not yet assessed.';
comment on table public.swim_progress_projections is
  'Server-authoritative item, stage, competency and diploma projections using rating/5 and separate coverage.';
comment on table public.swim_transition_cases is
  'Eligibility, review, approval and execution are deliberately independent states.';
comment on table public.swim_graduation_controls is
  'Graduation control, readiness and credential issuance are deliberately independent states; progress cannot issue a credential.';
