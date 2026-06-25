create table if not exists public.tenant_smart_engine_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  engine_key text not null,
  mode text not null default 'semi_automatic',
  rule_version text not null default 'v1',
  weights jsonb not null default '{}'::jsonb,
  thresholds jsonb not null default '{}'::jsonb,
  expiry_settings jsonb not null default '{}'::jsonb,
  hold_settings jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_smart_engine_settings_engine_check check (engine_key in (
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
  constraint tenant_smart_engine_settings_mode_check check (mode in ('manual', 'semi_automatic', 'automatic')),
  constraint tenant_smart_engine_settings_status_check check (status in ('active', 'paused', 'disabled')),
  constraint tenant_smart_engine_settings_weights_check check (jsonb_typeof(weights) = 'object'),
  constraint tenant_smart_engine_settings_thresholds_check check (jsonb_typeof(thresholds) = 'object'),
  constraint tenant_smart_engine_settings_expiry_check check (jsonb_typeof(expiry_settings) = 'object'),
  constraint tenant_smart_engine_settings_hold_check check (jsonb_typeof(hold_settings) = 'object'),
  constraint tenant_smart_engine_settings_notifications_check check (jsonb_typeof(notification_settings) = 'object'),
  constraint tenant_smart_engine_settings_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint tenant_smart_engine_settings_unique unique (tenant_id, engine_key)
);

create table if not exists public.smart_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  engine_key text not null,
  subject_type text not null,
  subject_id uuid not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  rule_version text not null default 'v1',
  score numeric(6,2),
  confidence text not null default 'unknown',
  reasons_json jsonb not null default '[]'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  decision_status text not null default 'recommended',
  human_decision text,
  override_reason text,
  result jsonb not null default '{}'::jsonb,
  decided_by_profile_id uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_decisions_engine_check check (engine_key in (
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
  constraint smart_decisions_subject_type_check check (subject_type ~ '^[a-z][a-z0-9_]*$'),
  constraint smart_decisions_snapshot_check check (jsonb_typeof(input_snapshot) = 'object'),
  constraint smart_decisions_score_check check (score is null or (score >= 0 and score <= 100)),
  constraint smart_decisions_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint smart_decisions_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint smart_decisions_blockers_check check (jsonb_typeof(blockers_json) = 'array'),
  constraint smart_decisions_recommendation_check check (jsonb_typeof(recommendation) = 'object'),
  constraint smart_decisions_status_check check (decision_status in ('recommended', 'approved', 'rejected', 'overridden', 'applied', 'cancelled', 'expired')),
  constraint smart_decisions_human_decision_check check (human_decision is null or human_decision in ('approved', 'rejected', 'overridden', 'applied', 'cancelled')),
  constraint smart_decisions_override_reason_check check (human_decision <> 'overridden' or nullif(trim(override_reason), '') is not null),
  constraint smart_decisions_result_check check (jsonb_typeof(result) = 'object'),
  constraint smart_decisions_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint smart_decisions_subject_rule_unique unique (tenant_id, engine_key, subject_type, subject_id, rule_version)
);

alter table public.intake_submissions
  add column if not exists stage_recommendation_decision_id uuid references public.smart_decisions (id) on delete set null;

alter table public.placement_suggestions
  add column if not exists smart_decision_id uuid references public.smart_decisions (id) on delete set null;

create index if not exists tenant_smart_engine_settings_tenant_idx
  on public.tenant_smart_engine_settings (tenant_id, engine_key);

create index if not exists smart_decisions_tenant_engine_created_idx
  on public.smart_decisions (tenant_id, engine_key, created_at desc);

create index if not exists smart_decisions_subject_idx
  on public.smart_decisions (tenant_id, subject_type, subject_id);

create index if not exists smart_decisions_status_idx
  on public.smart_decisions (tenant_id, decision_status, created_at desc);

drop trigger if exists tenant_smart_engine_settings_set_updated_at on public.tenant_smart_engine_settings;
create trigger tenant_smart_engine_settings_set_updated_at
  before update on public.tenant_smart_engine_settings
  for each row execute function app_private.set_updated_at();

drop trigger if exists smart_decisions_set_updated_at on public.smart_decisions;
create trigger smart_decisions_set_updated_at
  before update on public.smart_decisions
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.tenant_smart_engine_settings to authenticated;
grant all on public.tenant_smart_engine_settings to service_role;

grant select, insert, update on public.smart_decisions to authenticated;
grant all on public.smart_decisions to service_role;

alter table public.tenant_smart_engine_settings enable row level security;
alter table public.smart_decisions enable row level security;

drop policy if exists "Tenant staff can view smart engine settings" on public.tenant_smart_engine_settings;
create policy "Tenant staff can view smart engine settings"
  on public.tenant_smart_engine_settings
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant admins can manage smart engine settings" on public.tenant_smart_engine_settings;
create policy "Tenant admins can manage smart engine settings"
  on public.tenant_smart_engine_settings
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

drop policy if exists "Tenant staff can view smart decisions" on public.smart_decisions;
create policy "Tenant staff can view smart decisions"
  on public.smart_decisions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can create smart decisions" on public.smart_decisions;
create policy "Tenant staff can create smart decisions"
  on public.smart_decisions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update smart decisions" on public.smart_decisions;
create policy "Tenant staff can update smart decisions"
  on public.smart_decisions
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop trigger if exists tenant_smart_engine_settings_audit_events on public.tenant_smart_engine_settings;
create trigger tenant_smart_engine_settings_audit_events
  after insert or update or delete on public.tenant_smart_engine_settings
  for each row execute function app_private.record_audit_event();

drop trigger if exists smart_decisions_audit_events on public.smart_decisions;
create trigger smart_decisions_audit_events
  after insert or update or delete on public.smart_decisions
  for each row execute function app_private.record_audit_event();

with engine_defaults(engine_key, weights, thresholds, expiry_settings, hold_settings, notification_settings, metadata) as (
  values
    ('intake_recommendation', '{"age":10,"answers":25,"program":20,"preferences":10}'::jsonb, '{"high":80,"medium":55}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_confirmation":true}'::jsonb, '{"rule_family":"intake"}'::jsonb),
    ('stage_recommendation', '{"answers":35,"experience":30,"age":10}'::jsonb, '{"high":80,"medium":55}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rule_family":"stage"}'::jsonb),
    ('capacity', '{"group":35,"resource":35,"instructor":20,"holds":10}'::jsonb, '{"available_minimum":1}'::jsonb, '{}'::jsonb, '{"default_hold_minutes":20160}'::jsonb, '{}'::jsonb, '{"rule_family":"capacity"}'::jsonb),
    ('waitlist', '{"priority_date":35,"stage":20,"day":20,"time":10,"manual_priority":15}'::jsonb, '{"high":80,"medium":55}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rule_family":"waitlist"}'::jsonb),
    ('placement', '{"capacity":30,"stage":25,"day":20,"time":10,"waitlist":15}'::jsonb, '{"high":80,"medium":60}'::jsonb, '{}'::jsonb, '{"slot_offer_hold_days":14}'::jsonb, '{"slot_offer":true}'::jsonb, '{"rule_family":"placement"}'::jsonb),
    ('slot_offer', '{"expiry":40,"delivery":30,"response":30}'::jsonb, '{"expiry_days":14}'::jsonb, '{"offer_days":14,"reminder_days":[7,2]}'::jsonb, '{"holds_capacity":true}'::jsonb, '{"parent_email":true,"internal_notification":true}'::jsonb, '{"rule_family":"offer"}'::jsonb),
    ('lesson', '{"attendance":35,"resource":25,"instructor":25,"makeup":15}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rule_family":"lesson"}'::jsonb),
    ('progress', '{"module":40,"attendance":20,"instructor":25,"history":15}'::jsonb, '{"transition_ready":85}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_progress":true}'::jsonb, '{"rule_family":"progress"}'::jsonb),
    ('badge', '{"progress":45,"milestone":35,"instructor":20}'::jsonb, '{"recommend":75}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_badge":true}'::jsonb, '{"rule_family":"badge"}'::jsonb),
    ('flow_through', '{"progress":35,"capacity":25,"preferences":20,"timing":20}'::jsonb, '{"recommend":80}'::jsonb, '{}'::jsonb, '{"target_group_hold_days":7}'::jsonb, '{"parent_transition":true}'::jsonb, '{"rule_family":"flow"}'::jsonb),
    ('diploma_readiness', '{"progress":40,"attendance":20,"instructor":25,"criteria":15}'::jsonb, '{"ready":90,"almost_ready":75}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_afzwem":true}'::jsonb, '{"rule_family":"diploma"}'::jsonb),
    ('milestone_event', '{"capacity":30,"readiness":40,"schedule":20,"resource":10}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_invite":true}'::jsonb, '{"rule_family":"milestone"}'::jsonb),
    ('certificate', '{"result":60,"template":20,"visibility":20}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"parent_diploma":true}'::jsonb, '{"rule_family":"certificate"}'::jsonb),
    ('notification', '{"event":35,"template":25,"delivery":25,"preference":15}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"smtp_first":true,"sendgrid_ready":true}'::jsonb, '{"rule_family":"communication"}'::jsonb),
    ('task', '{"severity":35,"due_date":25,"owner":20,"workflow":20}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rule_family":"task"}'::jsonb),
    ('reporting', '{"accuracy":40,"freshness":25,"permission":20,"export":15}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"rule_family":"reporting"}'::jsonb)
)
insert into public.tenant_smart_engine_settings (
  tenant_id,
  engine_key,
  mode,
  rule_version,
  weights,
  thresholds,
  expiry_settings,
  hold_settings,
  notification_settings,
  metadata
)
select
  tenant.id,
  engine_defaults.engine_key,
  'semi_automatic',
  'v1',
  engine_defaults.weights,
  engine_defaults.thresholds,
  engine_defaults.expiry_settings,
  engine_defaults.hold_settings,
  engine_defaults.notification_settings,
  engine_defaults.metadata || jsonb_build_object('seeded_by', 'smart_flow_s0')
from public.tenants tenant
cross join engine_defaults
on conflict (tenant_id, engine_key) do update
  set rule_version = excluded.rule_version,
      weights = tenant_smart_engine_settings.weights || excluded.weights,
      thresholds = tenant_smart_engine_settings.thresholds || excluded.thresholds,
      expiry_settings = tenant_smart_engine_settings.expiry_settings || excluded.expiry_settings,
      hold_settings = tenant_smart_engine_settings.hold_settings || excluded.hold_settings,
      notification_settings = tenant_smart_engine_settings.notification_settings || excluded.notification_settings,
      metadata = tenant_smart_engine_settings.metadata || excluded.metadata;
