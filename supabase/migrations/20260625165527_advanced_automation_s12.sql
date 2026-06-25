alter table public.tenant_smart_engine_settings
  add column if not exists automation_level text not null default 'recommend_and_prepare',
  add column if not exists safety_limits jsonb not null default '{}'::jsonb,
  add column if not exists feature_flags jsonb not null default '{}'::jsonb,
  add column if not exists last_automation_reviewed_at timestamptz,
  add column if not exists last_automation_reviewed_by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.tenant_smart_engine_settings
  drop constraint if exists tenant_smart_engine_settings_automation_level_check,
  add constraint tenant_smart_engine_settings_automation_level_check
    check (automation_level in ('disabled', 'recommend_only', 'recommend_and_prepare', 'execute_with_approval', 'execute_automatically')),
  drop constraint if exists tenant_smart_engine_settings_safety_limits_check,
  add constraint tenant_smart_engine_settings_safety_limits_check
    check (jsonb_typeof(safety_limits) = 'object'),
  drop constraint if exists tenant_smart_engine_settings_feature_flags_check,
  add constraint tenant_smart_engine_settings_feature_flags_check
    check (jsonb_typeof(feature_flags) = 'object');

create table if not exists public.tenant_feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  flag_key text not null,
  label text not null,
  description text,
  enabled boolean not null default false,
  rollout_state text not null default 'disabled',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_feature_flags_key_check check (flag_key ~ '^[a-z][a-z0-9_]*$'),
  constraint tenant_feature_flags_rollout_state_check check (rollout_state in ('disabled', 'internal', 'beta', 'enabled')),
  constraint tenant_feature_flags_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint tenant_feature_flags_unique unique (tenant_id, flag_key)
);

create table if not exists public.automation_execution_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  engine_key text not null,
  automation_level text not null,
  trigger_source text not null default 'manual_review',
  subject_type text,
  subject_id uuid,
  smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  action_key text not null,
  action_status text not null default 'planned',
  input_snapshot jsonb not null default '{}'::jsonb,
  safety_result jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  rollback_available boolean not null default false,
  rollback_status text not null default 'not_available',
  rollback_reference_table text,
  rollback_reference_id uuid,
  failure_reason text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  executed_at timestamptz,
  rolled_back_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_execution_logs_engine_check check (engine_key in (
    'intake_recommendation',
    'stage_recommendation',
    'capacity',
    'waitlist',
    'placement',
    'slot_offer',
    'lesson',
    'progress',
    'badge',
    'flow_through',
    'diploma_readiness',
    'milestone_event',
    'certificate',
    'notification',
    'task',
    'reporting'
  )),
  constraint automation_execution_logs_automation_level_check check (automation_level in ('disabled', 'recommend_only', 'recommend_and_prepare', 'execute_with_approval', 'execute_automatically')),
  constraint automation_execution_logs_trigger_source_check check (trigger_source in ('manual_review', 'scheduled_worker', 'event_hook', 'system')),
  constraint automation_execution_logs_subject_type_check check (subject_type is null or subject_type ~ '^[a-z][a-z0-9_]*$'),
  constraint automation_execution_logs_action_key_check check (action_key ~ '^[a-z][a-z0-9_]*$'),
  constraint automation_execution_logs_action_status_check check (action_status in ('planned', 'prepared', 'approval_required', 'executed', 'blocked', 'failed', 'rolled_back', 'rollback_unavailable')),
  constraint automation_execution_logs_input_snapshot_check check (jsonb_typeof(input_snapshot) = 'object'),
  constraint automation_execution_logs_safety_result_check check (jsonb_typeof(safety_result) = 'object'),
  constraint automation_execution_logs_result_check check (jsonb_typeof(result) = 'object'),
  constraint automation_execution_logs_rollback_status_check check (rollback_status in ('not_available', 'available', 'requested', 'completed', 'failed', 'expired')),
  constraint automation_execution_logs_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists tenant_smart_engine_settings_automation_idx
  on public.tenant_smart_engine_settings (tenant_id, automation_level, engine_key);

create index if not exists tenant_feature_flags_tenant_enabled_idx
  on public.tenant_feature_flags (tenant_id, enabled, flag_key);

create index if not exists automation_execution_logs_tenant_engine_created_idx
  on public.automation_execution_logs (tenant_id, engine_key, created_at desc);

create index if not exists automation_execution_logs_status_idx
  on public.automation_execution_logs (tenant_id, action_status, created_at desc);

create index if not exists automation_execution_logs_subject_idx
  on public.automation_execution_logs (tenant_id, subject_type, subject_id);

drop trigger if exists tenant_feature_flags_set_updated_at on public.tenant_feature_flags;
create trigger tenant_feature_flags_set_updated_at
  before update on public.tenant_feature_flags
  for each row execute function app_private.set_updated_at();

drop trigger if exists automation_execution_logs_set_updated_at on public.automation_execution_logs;
create trigger automation_execution_logs_set_updated_at
  before update on public.automation_execution_logs
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.tenant_feature_flags to authenticated;
grant all on public.tenant_feature_flags to service_role;

grant select, insert, update on public.automation_execution_logs to authenticated;
grant all on public.automation_execution_logs to service_role;

alter table public.tenant_feature_flags enable row level security;
alter table public.automation_execution_logs enable row level security;

drop policy if exists "Tenant staff can view tenant feature flags" on public.tenant_feature_flags;
create policy "Tenant staff can view tenant feature flags"
  on public.tenant_feature_flags
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant admins can manage tenant feature flags" on public.tenant_feature_flags;
create policy "Tenant admins can manage tenant feature flags"
  on public.tenant_feature_flags
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

drop policy if exists "Tenant staff can view automation logs" on public.automation_execution_logs;
create policy "Tenant staff can view automation logs"
  on public.automation_execution_logs
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can create automation logs" on public.automation_execution_logs;
create policy "Tenant staff can create automation logs"
  on public.automation_execution_logs
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant admins can update automation logs" on public.automation_execution_logs;
create policy "Tenant admins can update automation logs"
  on public.automation_execution_logs
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

drop trigger if exists tenant_feature_flags_audit_events on public.tenant_feature_flags;
create trigger tenant_feature_flags_audit_events
  after insert or update or delete on public.tenant_feature_flags
  for each row execute function app_private.record_audit_event();

drop trigger if exists automation_execution_logs_audit_events on public.automation_execution_logs;
create trigger automation_execution_logs_audit_events
  after insert or update or delete on public.automation_execution_logs
  for each row execute function app_private.record_audit_event();

with defaults as (
  select
    '{"max_auto_offers_per_day":5,"min_confidence":"high","min_score":80,"block_on_duplicate_risk":true,"require_available_target_group":true,"require_registered_result_for_diploma":true,"rollback_window_minutes":1440}'::jsonb as safety_limits,
    '{"advanced_automation":true,"auto_execution":false,"auto_placement":false,"auto_slot_offers":false,"auto_flow_through":false,"auto_diploma":false}'::jsonb as feature_flags
)
update public.tenant_smart_engine_settings settings
set automation_level = case settings.mode
      when 'manual' then 'recommend_only'
      when 'automatic' then 'execute_with_approval'
      else 'recommend_and_prepare'
    end,
    safety_limits = defaults.safety_limits || settings.safety_limits,
    feature_flags = defaults.feature_flags || settings.feature_flags,
    metadata = settings.metadata || jsonb_build_object('automation_consolidated_by', 'phase_s12')
from defaults;

with flag_defaults(flag_key, label, description, enabled, rollout_state, metadata) as (
  values
    ('advanced_automation', 'Advanced automation', 'Tenant mag per engine hogere automation levels configureren.', true, 'beta', '{"phase":"s12"}'::jsonb),
    ('auto_execution', 'Automatisch uitvoeren', 'Algemene kill switch voor execute automatically.', false, 'disabled', '{"phase":"s12","safety_gate":"global"}'::jsonb),
    ('auto_placement', 'Automatische plaatsing', 'Automatische plaatsing blijft uit totdat confidence, duplicaat- en capaciteitregels slagen.', false, 'disabled', '{"phase":"s12","engine":"placement"}'::jsonb),
    ('auto_slot_offers', 'Automatische lesplek-aanbiedingen', 'Automatisch versturen van slot offers binnen daglimiet.', false, 'disabled', '{"phase":"s12","engine":"slot_offer"}'::jsonb),
    ('auto_flow_through', 'Automatische doorstroom', 'Automatisch doorstromen alleen bij beschikbare doelgroep.', false, 'disabled', '{"phase":"s12","engine":"flow_through"}'::jsonb),
    ('auto_diploma', 'Automatische diploma-afhandeling', 'Diploma-acties vereisen een geregistreerd resultaat.', false, 'disabled', '{"phase":"s12","engine":"diploma_readiness"}'::jsonb),
    ('automation_rollback', 'Automation rollback', 'Rollbackmetadata en herstelstatus zichtbaar maken waar mogelijk.', true, 'beta', '{"phase":"s12"}'::jsonb)
)
insert into public.tenant_feature_flags (
  tenant_id,
  flag_key,
  label,
  description,
  enabled,
  rollout_state,
  metadata
)
select
  tenant.id,
  flag_defaults.flag_key,
  flag_defaults.label,
  flag_defaults.description,
  flag_defaults.enabled,
  flag_defaults.rollout_state,
  flag_defaults.metadata
from public.tenants tenant
cross join flag_defaults
on conflict (tenant_id, flag_key) do update
  set label = excluded.label,
      description = excluded.description,
      metadata = public.tenant_feature_flags.metadata || excluded.metadata;
