-- NXTTRACK swim-school canon v3: versioned learning foundation, fine-grained
-- permissions, feature rollout, audit, outbox and idempotent publication.

alter table public.tenant_memberships
  drop constraint tenant_memberships_role_check;

alter table public.tenant_memberships
  add constraint tenant_memberships_role_check
  check (role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator', 'instructor', 'parent', 'athlete'));

create table public.tenant_swim_rollouts (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  feature_key text not null,
  status text not null default 'disabled',
  readiness_json jsonb not null default '{}'::jsonb,
  config_json jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  activated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_key),
  constraint tenant_swim_rollouts_feature_key_check
    check (feature_key ~ '^swim\\.[a-z0-9_]+(?:\\.[a-z0-9_]+)*$'),
  constraint tenant_swim_rollouts_status_check
    check (status in ('disabled', 'shadow', 'pilot', 'enabled', 'paused')),
  constraint tenant_swim_rollouts_readiness_check check (jsonb_typeof(readiness_json) = 'object'),
  constraint tenant_swim_rollouts_config_check check (jsonb_typeof(config_json) = 'object')
);

create table public.tenant_role_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  role text not null,
  permission_key text not null,
  is_granted boolean not null,
  reason text not null,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_role_permission_overrides_role_check
    check (role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator', 'instructor', 'parent', 'athlete')),
  constraint tenant_role_permission_overrides_key_check
    check (permission_key in (
      'curriculum.read',
      'curriculum.draft.manage',
      'curriculum.publish',
      'curriculum.migrate.preview',
      'curriculum.migrate.execute',
      'assessment.read',
      'assessment.record',
      'assessment.correct',
      'transition.review',
      'transition.approve',
      'transition.execute',
      'carryover.complete_previous',
      'badge.read',
      'badge.definition.manage',
      'badge.publish',
      'badge.award',
      'badge.award_remaining',
      'badge.revoke',
      'group.read',
      'group.manage',
      'group.publish',
      'planning.manage',
      'holiday.manage',
      'billing.read',
      'billing.manage',
      'invoice.issue',
      'invoice.credit',
      'analytics.read',
      'forecast.read',
      'forecast.hold.manage'
    )),
  constraint tenant_role_permission_overrides_reason_check check (length(trim(reason)) >= 3),
  constraint tenant_role_permission_overrides_unique unique (tenant_id, role, permission_key),
  constraint tenant_role_permission_overrides_tenant_id_id_unique unique (tenant_id, id)
);

create table public.domain_command_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  idempotency_key text not null,
  command_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  actor_user_id uuid references auth.users (id) on delete set null,
  request_hash text not null,
  result_json jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint domain_command_receipts_idempotency_key_check check (length(idempotency_key) between 8 and 200),
  constraint domain_command_receipts_request_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint domain_command_receipts_result_check check (jsonb_typeof(result_json) = 'object'),
  constraint domain_command_receipts_unique unique (tenant_id, idempotency_key),
  constraint domain_command_receipts_tenant_id_id_unique unique (tenant_id, id)
);

create table public.domain_outbox_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  correlation_id uuid,
  causation_id uuid,
  formula_version text,
  payload_json jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  claimed_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint domain_outbox_events_payload_check check (jsonb_typeof(payload_json) = 'object'),
  constraint domain_outbox_events_status_check check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  constraint domain_outbox_events_attempt_check check (attempt_count >= 0),
  constraint domain_outbox_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.swim_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  permission_key text,
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  reason text,
  before_json jsonb not null default '{}'::jsonb,
  after_json jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint swim_audit_events_before_check check (jsonb_typeof(before_json) = 'object'),
  constraint swim_audit_events_after_check check (jsonb_typeof(after_json) = 'object'),
  constraint swim_audit_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  version_number integer not null,
  name text not null,
  status text not null default 'draft',
  formula_version text not null default 'swim_progress_v3',
  weighting_enabled boolean not null default false,
  wizard_step text not null default 'framework',
  wizard_state_json jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  source_version_id uuid,
  published_at timestamptz,
  published_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_versions_program_fk
    foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint curriculum_versions_source_fk
    foreign key (tenant_id, source_version_id) references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint curriculum_versions_number_check check (version_number > 0),
  constraint curriculum_versions_status_check check (status in ('draft', 'published')),
  constraint curriculum_versions_formula_check check (formula_version = 'swim_progress_v3'),
  constraint curriculum_versions_wizard_state_check check (jsonb_typeof(wizard_state_json) = 'object'),
  constraint curriculum_versions_revision_check check (revision > 0),
  constraint curriculum_versions_publication_check check (
    (status = 'draft' and published_at is null and published_by_user_id is null)
    or (status = 'published' and published_at is not null and published_by_user_id is not null)
  ),
  constraint curriculum_versions_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_versions_program_number_unique unique (tenant_id, program_id, version_number)
);

create table public.curriculum_version_lifecycle (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  availability text not null default 'available',
  reason text,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint curriculum_version_lifecycle_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint curriculum_version_lifecycle_availability_check
    check (availability in ('available', 'not_for_new_enrollments', 'retired')),
  constraint curriculum_version_lifecycle_tenant_id_id_unique unique (tenant_id, id)
);

create table public.curriculum_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  legacy_stage_id uuid,
  stable_key text not null,
  name text not null,
  description text,
  color_hex text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_stages_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_stages_legacy_fk
    foreign key (tenant_id, legacy_stage_id)
    references public.program_stages (tenant_id, id) on delete restrict,
  constraint curriculum_stages_key_check check (stable_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint curriculum_stages_color_check check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint curriculum_stages_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_stages_version_key_unique unique (tenant_id, curriculum_version_id, stable_key)
);

create table public.curriculum_competencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  stable_key text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_competencies_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_competencies_key_check check (stable_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint curriculum_competencies_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_competencies_version_key_unique unique (tenant_id, curriculum_version_id, stable_key)
);

create table public.curriculum_item_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  stable_key text not null,
  created_at timestamptz not null default now(),
  constraint curriculum_item_identities_program_fk
    foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint curriculum_item_identities_key_check check (stable_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint curriculum_item_identities_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_item_identities_program_key_unique unique (tenant_id, program_id, stable_key)
);

create table public.curriculum_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  curriculum_stage_id uuid not null,
  identity_id uuid not null,
  legacy_progress_item_id uuid,
  name text not null,
  description text,
  context_json jsonb not null default '{}'::jsonb,
  weight numeric(10, 4) not null default 1,
  mastery_threshold integer not null default 4,
  contributes_to_stage boolean not null default true,
  contributes_to_diploma boolean not null default true,
  required_for_transition boolean not null default true,
  required_for_graduation boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_items_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_items_stage_fk
    foreign key (tenant_id, curriculum_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete cascade,
  constraint curriculum_items_identity_fk
    foreign key (tenant_id, identity_id)
    references public.curriculum_item_identities (tenant_id, id) on delete restrict,
  constraint curriculum_items_legacy_fk
    foreign key (tenant_id, legacy_progress_item_id)
    references public.progress_items (tenant_id, id) on delete restrict,
  constraint curriculum_items_context_check check (jsonb_typeof(context_json) = 'object'),
  constraint curriculum_items_weight_check check (weight > 0),
  constraint curriculum_items_mastery_check check (mastery_threshold between 1 and 5),
  constraint curriculum_items_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_items_version_identity_unique unique (tenant_id, curriculum_version_id, identity_id)
);

create table public.curriculum_item_competencies (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  curriculum_item_id uuid not null,
  competency_id uuid not null,
  contribution_weight numeric(10, 4) not null default 1,
  created_at timestamptz not null default now(),
  primary key (tenant_id, curriculum_item_id, competency_id),
  constraint curriculum_item_competencies_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_item_competencies_item_fk
    foreign key (tenant_id, curriculum_item_id)
    references public.curriculum_items (tenant_id, id) on delete cascade,
  constraint curriculum_item_competencies_competency_fk
    foreign key (tenant_id, competency_id)
    references public.curriculum_competencies (tenant_id, id) on delete cascade,
  constraint curriculum_item_competencies_weight_check check (contribution_weight > 0)
);

create table public.curriculum_transition_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  from_stage_id uuid not null,
  to_stage_id uuid,
  rule_key text not null,
  rule_json jsonb not null,
  approval_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_transition_rules_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_transition_rules_from_stage_fk
    foreign key (tenant_id, from_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete cascade,
  constraint curriculum_transition_rules_to_stage_fk
    foreign key (tenant_id, to_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint curriculum_transition_rules_key_check check (rule_key ~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'),
  constraint curriculum_transition_rules_rule_check
    check (jsonb_typeof(rule_json) = 'object' and rule_json ? 'kind'),
  constraint curriculum_transition_rules_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_transition_rules_version_key_unique unique (tenant_id, curriculum_version_id, rule_key)
);

create table public.curriculum_graduation_requirements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  requirement_key text not null,
  requirement_kind text not null,
  target_id uuid,
  threshold integer,
  rule_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_graduation_requirements_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_graduation_requirements_kind_check
    check (requirement_kind in ('item', 'competency', 'stage', 'coverage', 'manual_review')),
  constraint curriculum_graduation_requirements_threshold_check
    check (threshold is null or threshold between 1 and 5),
  constraint curriculum_graduation_requirements_rule_check check (jsonb_typeof(rule_json) = 'object'),
  constraint curriculum_graduation_requirements_tenant_id_id_unique unique (tenant_id, id),
  constraint curriculum_graduation_requirements_version_key_unique unique (tenant_id, curriculum_version_id, requirement_key)
);

create table public.curriculum_publication_validations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  revision integer not null,
  is_valid boolean not null,
  coverage_json jsonb not null default '{}'::jsonb,
  impact_json jsonb not null default '{}'::jsonb,
  diff_json jsonb not null default '{}'::jsonb,
  findings_json jsonb not null default '[]'::jsonb,
  validated_by_user_id uuid references auth.users (id) on delete set null,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint curriculum_publication_validations_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_publication_validations_revision_check check (revision > 0),
  constraint curriculum_publication_validations_coverage_check check (jsonb_typeof(coverage_json) = 'object'),
  constraint curriculum_publication_validations_impact_check check (jsonb_typeof(impact_json) = 'object'),
  constraint curriculum_publication_validations_diff_check check (jsonb_typeof(diff_json) = 'object'),
  constraint curriculum_publication_validations_findings_check check (jsonb_typeof(findings_json) = 'array'),
  constraint curriculum_publication_validations_tenant_id_id_unique unique (tenant_id, id)
);

create table public.curriculum_migration_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  from_version_id uuid not null,
  to_version_id uuid not null,
  status text not null default 'draft',
  impact_json jsonb not null default '{}'::jsonb,
  mapping_json jsonb not null default '{}'::jsonb,
  reason text not null,
  previewed_at timestamptz,
  approved_at timestamptz,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  executed_at timestamptz,
  executed_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint curriculum_migration_plans_program_fk
    foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint curriculum_migration_plans_from_fk
    foreign key (tenant_id, from_version_id) references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint curriculum_migration_plans_to_fk
    foreign key (tenant_id, to_version_id) references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint curriculum_migration_plans_distinct_check check (from_version_id <> to_version_id),
  constraint curriculum_migration_plans_status_check
    check (status in ('draft', 'previewed', 'approved', 'executing', 'completed', 'failed', 'cancelled')),
  constraint curriculum_migration_plans_impact_check check (jsonb_typeof(impact_json) = 'object'),
  constraint curriculum_migration_plans_mapping_check check (jsonb_typeof(mapping_json) = 'object'),
  constraint curriculum_migration_plans_reason_check check (length(trim(reason)) >= 3),
  constraint curriculum_migration_plans_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.enrollments
  add column curriculum_version_id uuid,
  add constraint enrollments_curriculum_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict;

create table public.enrollment_stage_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null,
  participant_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_stage_id uuid not null,
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by_user_id uuid references auth.users (id) on delete set null,
  transition_case_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_stage_assignments_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint enrollment_stage_assignments_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  constraint enrollment_stage_assignments_stage_fk
    foreign key (tenant_id, curriculum_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  constraint enrollment_stage_assignments_status_check
    check (status in ('planned', 'active', 'completed', 'superseded', 'cancelled')),
  constraint enrollment_stage_assignments_time_check check (ends_at is null or starts_at <= ends_at),
  constraint enrollment_stage_assignments_tenant_id_id_unique unique (tenant_id, id)
);

create unique index enrollment_stage_assignments_one_active_idx
  on public.enrollment_stage_assignments (tenant_id, enrollment_id)
  where status = 'active';

create index tenant_swim_rollouts_status_idx
  on public.tenant_swim_rollouts (status, feature_key, tenant_id);
create index domain_outbox_events_claim_idx
  on public.domain_outbox_events (status, available_at, created_at)
  where status in ('pending', 'failed');
create index swim_audit_events_subject_idx
  on public.swim_audit_events (tenant_id, subject_type, subject_id, occurred_at desc);
create index curriculum_versions_program_status_idx
  on public.curriculum_versions (tenant_id, program_id, status, version_number desc);
create index curriculum_stages_version_sort_idx
  on public.curriculum_stages (tenant_id, curriculum_version_id, sort_order);
create index curriculum_items_stage_sort_idx
  on public.curriculum_items (tenant_id, curriculum_stage_id, sort_order);
create index curriculum_items_version_diploma_idx
  on public.curriculum_items (tenant_id, curriculum_version_id, contributes_to_diploma);
create index curriculum_publication_validations_version_idx
  on public.curriculum_publication_validations (tenant_id, curriculum_version_id, validated_at desc);
create index curriculum_migration_plans_versions_idx
  on public.curriculum_migration_plans (tenant_id, from_version_id, to_version_id, status);
create index enrollments_curriculum_version_idx
  on public.enrollments (tenant_id, curriculum_version_id, status);
create index enrollment_stage_assignments_participant_idx
  on public.enrollment_stage_assignments (tenant_id, participant_id, status, starts_at desc);

create trigger tenant_swim_rollouts_set_updated_at
  before update on public.tenant_swim_rollouts
  for each row execute function app_private.set_updated_at();
create trigger tenant_role_permission_overrides_set_updated_at
  before update on public.tenant_role_permission_overrides
  for each row execute function app_private.set_updated_at();
create trigger curriculum_versions_set_updated_at
  before update on public.curriculum_versions
  for each row execute function app_private.set_updated_at();
create trigger curriculum_stages_set_updated_at
  before update on public.curriculum_stages
  for each row execute function app_private.set_updated_at();
create trigger curriculum_competencies_set_updated_at
  before update on public.curriculum_competencies
  for each row execute function app_private.set_updated_at();
create trigger curriculum_items_set_updated_at
  before update on public.curriculum_items
  for each row execute function app_private.set_updated_at();
create trigger curriculum_transition_rules_set_updated_at
  before update on public.curriculum_transition_rules
  for each row execute function app_private.set_updated_at();
create trigger curriculum_graduation_requirements_set_updated_at
  before update on public.curriculum_graduation_requirements
  for each row execute function app_private.set_updated_at();
create trigger curriculum_migration_plans_set_updated_at
  before update on public.curriculum_migration_plans
  for each row execute function app_private.set_updated_at();
create trigger enrollment_stage_assignments_set_updated_at
  before update on public.enrollment_stage_assignments
  for each row execute function app_private.set_updated_at();

create or replace function app_private.current_user_has_swim_permission(
  target_tenant_id uuid,
  target_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  membership_role text;
  explicit_grant boolean;
begin
  if app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']) then
    return true;
  end if;

  if app_private.current_user_has_platform_role(array['platform_support']) then
    return target_permission_key like '%.read';
  end if;

  select membership.role
    into membership_role
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by case membership.role
    when 'tenant_owner' then 1
    when 'tenant_admin' then 2
    when 'coordinator' then 3
    when 'tenant_staff' then 4
    when 'instructor' then 5
    when 'parent' then 6
    else 7
  end
  limit 1;

  if membership_role is null then
    return false;
  end if;

  select override.is_granted
    into explicit_grant
  from public.tenant_role_permission_overrides override
  where override.tenant_id = target_tenant_id
    and override.role = membership_role
    and override.permission_key = target_permission_key;

  if explicit_grant is not null then
    return explicit_grant;
  end if;

  if membership_role in ('tenant_owner', 'tenant_admin') then
    return true;
  end if;

  if membership_role in ('coordinator', 'tenant_staff') then
    return target_permission_key not in ('curriculum.publish', 'badge.publish');
  end if;

  if membership_role = 'instructor' then
    return target_permission_key in (
      'curriculum.read',
      'assessment.read',
      'assessment.record',
      'assessment.correct',
      'transition.review',
      'carryover.complete_previous',
      'badge.read',
      'badge.award',
      'group.read'
    );
  end if;

  return target_permission_key in ('curriculum.read', 'assessment.read', 'badge.read', 'group.read');
end;
$$;

revoke all on function app_private.current_user_has_swim_permission(uuid, text) from public, anon;
grant execute on function app_private.current_user_has_swim_permission(uuid, text) to authenticated;
grant execute on function app_private.current_user_has_swim_permission(uuid, text) to service_role;

create or replace function app_private.enforce_published_curriculum_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version_id uuid;
  target_status text;
begin
  if tg_table_name = 'curriculum_versions' then
    if tg_op = 'DELETE' and old.status = 'published' then
      raise exception 'Published curriculum versions are immutable';
    end if;
    if tg_op = 'UPDATE' and old.status = 'published' then
      raise exception 'Published curriculum versions are immutable';
    end if;
    if tg_op = 'UPDATE'
      and old.status = 'draft'
      and new.status = 'published'
      and current_setting('app.swim_publish_authorized', true) is distinct from old.id::text
    then
      raise exception 'Curriculum publication must use the publication command';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  target_version_id := case when tg_op = 'DELETE' then old.curriculum_version_id else new.curriculum_version_id end;
  select version.status into target_status
  from public.curriculum_versions version
  where version.id = target_version_id;

  if target_status = 'published' then
    raise exception 'Published curriculum contents are immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function app_private.enforce_published_curriculum_immutability() from public, anon, authenticated;
grant execute on function app_private.enforce_published_curriculum_immutability() to service_role;

create trigger curriculum_versions_immutable
  before update or delete on public.curriculum_versions
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_stages_immutable
  before update or delete on public.curriculum_stages
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_competencies_immutable
  before update or delete on public.curriculum_competencies
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_items_immutable
  before update or delete on public.curriculum_items
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_item_competencies_immutable
  before update or delete on public.curriculum_item_competencies
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_transition_rules_immutable
  before update or delete on public.curriculum_transition_rules
  for each row execute function app_private.enforce_published_curriculum_immutability();
create trigger curriculum_graduation_requirements_immutable
  before update or delete on public.curriculum_graduation_requirements
  for each row execute function app_private.enforce_published_curriculum_immutability();

create or replace function app_private.publish_curriculum_version(
  target_version_id uuid,
  expected_revision integer,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version public.curriculum_versions%rowtype;
  stage_count integer;
  item_count integer;
  invalid_stage_count integer;
  receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  if actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Actor mismatch';
  end if;

  select * into target_version
  from public.curriculum_versions
  where id = target_version_id
  for update;

  if target_version.id is null then
    raise exception 'Curriculum version not found';
  end if;

  if not app_private.current_user_has_swim_permission(target_version.tenant_id, 'curriculum.publish') then
    raise exception 'Insufficient permission';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_version_id::text, expected_revision::text, actor_user_id::text),
      'sha256'
    ),
    'hex'
  );

  select * into receipt
  from public.domain_command_receipts command_receipt
  where command_receipt.tenant_id = target_version.tenant_id
    and command_receipt.idempotency_key = target_idempotency_key;

  if receipt.id is not null then
    if receipt.command_type <> 'curriculum.publish' or receipt.request_hash <> request_hash then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return target_version_id;
  end if;

  if target_version.status <> 'draft' then
    raise exception 'Only draft curricula can be published';
  end if;
  if target_version.revision <> expected_revision then
    raise exception 'Curriculum revision conflict';
  end if;

  select count(*) into stage_count
  from public.curriculum_stages stage
  where stage.curriculum_version_id = target_version_id;

  select count(*) into item_count
  from public.curriculum_items item
  where item.curriculum_version_id = target_version_id;

  select count(*) into invalid_stage_count
  from public.curriculum_stages stage
  where stage.curriculum_version_id = target_version_id
    and not exists (
      select 1
      from public.curriculum_items item
      where item.curriculum_version_id = target_version_id
        and item.curriculum_stage_id = stage.id
        and item.contributes_to_stage
    );

  if stage_count = 0 or item_count = 0 or invalid_stage_count > 0 then
    raise exception 'Publication validation failed: every curriculum needs stages and every stage needs contributing items';
  end if;

  insert into public.curriculum_publication_validations (
    tenant_id,
    curriculum_version_id,
    revision,
    is_valid,
    coverage_json,
    impact_json,
    diff_json,
    findings_json,
    validated_by_user_id
  ) values (
    target_version.tenant_id,
    target_version_id,
    expected_revision,
    true,
    jsonb_build_object('stages', stage_count, 'items', item_count, 'invalidStages', invalid_stage_count),
    jsonb_build_object('activeEnrollments', 0),
    jsonb_build_object('sourceVersionId', target_version.source_version_id),
    '[]'::jsonb,
    actor_user_id
  );

  perform set_config('app.swim_publish_authorized', target_version_id::text, true);

  update public.curriculum_versions
  set status = 'published',
      published_at = now(),
      published_by_user_id = actor_user_id
  where id = target_version_id;

  insert into public.curriculum_version_lifecycle (
    tenant_id,
    curriculum_version_id,
    availability,
    reason,
    changed_by_user_id
  ) values (
    target_version.tenant_id,
    target_version_id,
    'available',
    'Initial publication',
    actor_user_id
  );

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
    target_version.tenant_id,
    target_idempotency_key,
    'curriculum.publish',
    'curriculum_version',
    target_version_id,
    actor_user_id,
    request_hash,
    jsonb_build_object('curriculumVersionId', target_version_id, 'revision', expected_revision)
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
    target_version.tenant_id,
    'curriculum.published',
    'curriculum_version',
    target_version_id,
    actor_user_id,
    target_version.formula_version,
    jsonb_build_object('programId', target_version.program_id, 'versionNumber', target_version.version_number)
  );

  insert into public.swim_audit_events (
    tenant_id,
    actor_user_id,
    permission_key,
    event_type,
    subject_type,
    subject_id,
    before_json,
    after_json
  ) values (
    target_version.tenant_id,
    actor_user_id,
    'curriculum.publish',
    'curriculum.published',
    'curriculum_version',
    target_version_id,
    jsonb_build_object('status', 'draft', 'revision', expected_revision),
    jsonb_build_object('status', 'published', 'formulaVersion', target_version.formula_version)
  );

  return target_version_id;
end;
$$;

revoke all on function app_private.publish_curriculum_version(uuid, integer, uuid, text) from public, anon;
grant execute on function app_private.publish_curriculum_version(uuid, integer, uuid, text) to authenticated;
grant execute on function app_private.publish_curriculum_version(uuid, integer, uuid, text) to service_role;

grant select on public.tenant_swim_rollouts to authenticated;
grant select on public.tenant_role_permission_overrides to authenticated;
grant select on public.domain_command_receipts to authenticated;
grant select on public.domain_outbox_events to authenticated;
grant select on public.swim_audit_events to authenticated;
grant select, insert, update, delete on public.curriculum_versions to authenticated;
grant select, insert on public.curriculum_version_lifecycle to authenticated;
grant select, insert, update, delete on public.curriculum_stages to authenticated;
grant select, insert, update, delete on public.curriculum_competencies to authenticated;
grant select, insert, update, delete on public.curriculum_item_identities to authenticated;
grant select, insert, update, delete on public.curriculum_items to authenticated;
grant select, insert, update, delete on public.curriculum_item_competencies to authenticated;
grant select, insert, update, delete on public.curriculum_transition_rules to authenticated;
grant select, insert, update, delete on public.curriculum_graduation_requirements to authenticated;
grant select on public.curriculum_publication_validations to authenticated;
grant select, insert, update on public.curriculum_migration_plans to authenticated;
grant select, insert, update on public.enrollment_stage_assignments to authenticated;

grant all on public.tenant_swim_rollouts to service_role;
grant all on public.tenant_role_permission_overrides to service_role;
grant all on public.domain_command_receipts to service_role;
grant all on public.domain_outbox_events to service_role;
grant all on public.swim_audit_events to service_role;
grant all on public.curriculum_versions to service_role;
grant all on public.curriculum_version_lifecycle to service_role;
grant all on public.curriculum_stages to service_role;
grant all on public.curriculum_competencies to service_role;
grant all on public.curriculum_item_identities to service_role;
grant all on public.curriculum_items to service_role;
grant all on public.curriculum_item_competencies to service_role;
grant all on public.curriculum_transition_rules to service_role;
grant all on public.curriculum_graduation_requirements to service_role;
grant all on public.curriculum_publication_validations to service_role;
grant all on public.curriculum_migration_plans to service_role;
grant all on public.enrollment_stage_assignments to service_role;

alter table public.tenant_swim_rollouts enable row level security;
alter table public.tenant_role_permission_overrides enable row level security;
alter table public.domain_command_receipts enable row level security;
alter table public.domain_outbox_events enable row level security;
alter table public.swim_audit_events enable row level security;
alter table public.curriculum_versions enable row level security;
alter table public.curriculum_version_lifecycle enable row level security;
alter table public.curriculum_stages enable row level security;
alter table public.curriculum_competencies enable row level security;
alter table public.curriculum_item_identities enable row level security;
alter table public.curriculum_items enable row level security;
alter table public.curriculum_item_competencies enable row level security;
alter table public.curriculum_transition_rules enable row level security;
alter table public.curriculum_graduation_requirements enable row level security;
alter table public.curriculum_publication_validations enable row level security;
alter table public.curriculum_migration_plans enable row level security;
alter table public.enrollment_stage_assignments enable row level security;

alter table public.tenant_swim_rollouts force row level security;
alter table public.tenant_role_permission_overrides force row level security;
alter table public.domain_command_receipts force row level security;
alter table public.domain_outbox_events force row level security;
alter table public.swim_audit_events force row level security;
alter table public.curriculum_versions force row level security;
alter table public.curriculum_version_lifecycle force row level security;
alter table public.curriculum_stages force row level security;
alter table public.curriculum_competencies force row level security;
alter table public.curriculum_item_identities force row level security;
alter table public.curriculum_items force row level security;
alter table public.curriculum_item_competencies force row level security;
alter table public.curriculum_transition_rules force row level security;
alter table public.curriculum_graduation_requirements force row level security;
alter table public.curriculum_publication_validations force row level security;
alter table public.curriculum_migration_plans force row level security;
alter table public.enrollment_stage_assignments force row level security;

create policy tenant_swim_rollouts_read
  on public.tenant_swim_rollouts for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy tenant_swim_rollouts_manage
  on public.tenant_swim_rollouts for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.publish'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.publish'));

create policy tenant_role_permission_overrides_read
  on public.tenant_role_permission_overrides for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'coordinator'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy tenant_role_permission_overrides_manage
  on public.tenant_role_permission_overrides for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

create policy domain_command_receipts_read
  on public.domain_command_receipts for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
    or actor_user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy domain_outbox_events_read
  on public.domain_outbox_events for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
create policy swim_audit_events_read
  on public.swim_audit_events for select to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
    or actor_user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy curriculum_versions_read
  on public.curriculum_versions for select to authenticated
  using (
    (status = 'published' and app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'))
    or app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage')
  );
create policy curriculum_versions_manage
  on public.curriculum_versions for all to authenticated
  using (status = 'draft' and app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (
    (
      status = 'draft'
      and app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage')
    )
    or (
      status = 'published'
      and app_private.current_user_has_swim_permission(tenant_id, 'curriculum.publish')
    )
  );

create policy curriculum_version_lifecycle_read
  on public.curriculum_version_lifecycle for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_version_lifecycle_manage
  on public.curriculum_version_lifecycle for insert to authenticated
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.publish'));

create policy curriculum_stages_read
  on public.curriculum_stages for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_stages_manage
  on public.curriculum_stages for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_competencies_read
  on public.curriculum_competencies for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_competencies_manage
  on public.curriculum_competencies for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_item_identities_read
  on public.curriculum_item_identities for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_item_identities_manage
  on public.curriculum_item_identities for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_items_read
  on public.curriculum_items for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_items_manage
  on public.curriculum_items for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_item_competencies_read
  on public.curriculum_item_competencies for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_item_competencies_manage
  on public.curriculum_item_competencies for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_transition_rules_read
  on public.curriculum_transition_rules for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_transition_rules_manage
  on public.curriculum_transition_rules for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_graduation_requirements_read
  on public.curriculum_graduation_requirements for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));
create policy curriculum_graduation_requirements_manage
  on public.curriculum_graduation_requirements for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_publication_validations_read
  on public.curriculum_publication_validations for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.draft.manage'));

create policy curriculum_migration_plans_read
  on public.curriculum_migration_plans for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.migrate.preview'));
create policy curriculum_migration_plans_manage
  on public.curriculum_migration_plans for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.migrate.execute'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.migrate.execute'));

create policy enrollment_stage_assignments_read
  on public.enrollment_stage_assignments for select to authenticated
  using (
    app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  );
create policy enrollment_stage_assignments_manage
  on public.enrollment_stage_assignments for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'transition.execute'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'transition.execute'));

comment on table public.curriculum_versions is
  'Persistent draft and immutable published curriculum versions. Publication is only permitted through the transactional command.';
comment on table public.curriculum_item_identities is
  'Stable curriculum item identities used by versioned items and carryover; open work is never duplicated.';
comment on table public.domain_outbox_events is
  'Transactional outbox for retry-safe projections, notifications, analytics and provider jobs.';
comment on function app_private.publish_curriculum_version(uuid, integer, uuid, text) is
  'Validates and immutably publishes one curriculum revision with idempotency, audit and outbox evidence.';
