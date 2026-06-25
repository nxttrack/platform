create table if not exists public.diploma_readiness_radar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  stage_id uuid references public.stages (id) on delete set null,
  readiness_criteria_id uuid references public.milestone_readiness_criteria (id) on delete set null,
  smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  recommended_event_id uuid references public.milestone_events (id) on delete set null,
  milestone_event_participant_id uuid references public.milestone_event_participants (id) on delete set null,
  certificate_id uuid references public.certificates (id) on delete set null,
  readiness_status text not null default 'not_ready',
  score numeric(6, 2),
  confidence text not null default 'unknown',
  progress_snapshot jsonb not null default '{}'::jsonb,
  attendance_snapshot jsonb not null default '{}'::jsonb,
  badge_snapshot jsonb not null default '{}'::jsonb,
  period_snapshot jsonb not null default '{}'::jsonb,
  criteria_results jsonb not null default '[]'::jsonb,
  missing_criteria jsonb not null default '[]'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  review_note text,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diploma_readiness_radar_status_check check (readiness_status in ('not_ready', 'almost_ready', 'ready_for_review', 'invited', 'completed')),
  constraint diploma_readiness_radar_score_check check (score is null or score between 0 and 100),
  constraint diploma_readiness_radar_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint diploma_readiness_radar_progress_check check (jsonb_typeof(progress_snapshot) = 'object'),
  constraint diploma_readiness_radar_attendance_check check (jsonb_typeof(attendance_snapshot) = 'object'),
  constraint diploma_readiness_radar_badge_check check (jsonb_typeof(badge_snapshot) = 'object'),
  constraint diploma_readiness_radar_period_check check (jsonb_typeof(period_snapshot) = 'object'),
  constraint diploma_readiness_radar_criteria_results_check check (jsonb_typeof(criteria_results) = 'array'),
  constraint diploma_readiness_radar_missing_criteria_check check (jsonb_typeof(missing_criteria) = 'array'),
  constraint diploma_readiness_radar_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint diploma_readiness_radar_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint diploma_readiness_radar_id_tenant_unique unique (id, tenant_id),
  constraint diploma_readiness_radar_unique_enrollment unique (tenant_id, enrollment_id, program_id),
  constraint diploma_readiness_radar_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint diploma_readiness_radar_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint diploma_readiness_radar_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint diploma_readiness_radar_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint diploma_readiness_radar_criteria_tenant_fk foreign key (readiness_criteria_id, tenant_id) references public.milestone_readiness_criteria (id, tenant_id),
  constraint diploma_readiness_radar_event_tenant_fk foreign key (recommended_event_id, tenant_id) references public.milestone_events (id, tenant_id),
  constraint diploma_readiness_radar_participant_event_tenant_fk foreign key (milestone_event_participant_id, tenant_id) references public.milestone_event_participants (id, tenant_id),
  constraint diploma_readiness_radar_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id)
);

create table if not exists public.afzwem_event_candidate_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  readiness_radar_id uuid not null references public.diploma_readiness_radar (id) on delete cascade,
  milestone_event_id uuid not null references public.milestone_events (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  score numeric(6, 2),
  confidence text not null default 'unknown',
  capacity_snapshot jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  suggested_status text not null default 'candidate',
  review_note text,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  suggested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint afzwem_event_candidate_suggestions_status_check check (suggested_status in ('candidate', 'invited', 'dismissed', 'expired')),
  constraint afzwem_event_candidate_suggestions_score_check check (score is null or score between 0 and 100),
  constraint afzwem_event_candidate_suggestions_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint afzwem_event_candidate_suggestions_capacity_check check (jsonb_typeof(capacity_snapshot) = 'object'),
  constraint afzwem_event_candidate_suggestions_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint afzwem_event_candidate_suggestions_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint afzwem_event_candidate_suggestions_id_tenant_unique unique (id, tenant_id),
  constraint afzwem_event_candidate_suggestions_unique_event unique (tenant_id, readiness_radar_id, milestone_event_id),
  constraint afzwem_event_candidate_suggestions_radar_tenant_fk foreign key (readiness_radar_id, tenant_id) references public.diploma_readiness_radar (id, tenant_id) on delete cascade,
  constraint afzwem_event_candidate_suggestions_event_tenant_fk foreign key (milestone_event_id, tenant_id) references public.milestone_events (id, tenant_id) on delete cascade,
  constraint afzwem_event_candidate_suggestions_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint afzwem_event_candidate_suggestions_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint afzwem_event_candidate_suggestions_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict
);

create table if not exists public.diploma_readiness_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  readiness_radar_id uuid not null references public.diploma_readiness_radar (id) on delete cascade,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint diploma_readiness_events_type_check check (event_type in (
    'evaluated',
    'reviewed',
    'candidate_suggested',
    'invited',
    'reminder_scheduled',
    'result_registered',
    'certificate_created',
    'completed',
    'dismissed',
    'guardrail_blocked'
  )),
  constraint diploma_readiness_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint diploma_readiness_events_radar_tenant_fk foreign key (readiness_radar_id, tenant_id) references public.diploma_readiness_radar (id, tenant_id) on delete cascade
);

alter table public.milestone_event_participants
  add column if not exists diploma_readiness_radar_id uuid references public.diploma_readiness_radar (id) on delete set null,
  add column if not exists invitation_reminder_at timestamptz,
  add column if not exists invitation_reminder_status text not null default 'not_scheduled';

alter table public.milestone_event_participants
  drop constraint if exists milestone_event_participants_reminder_status_check,
  add constraint milestone_event_participants_reminder_status_check check (invitation_reminder_status in ('not_scheduled', 'scheduled', 'sent', 'failed', 'cancelled')),
  drop constraint if exists milestone_event_participants_radar_tenant_fk,
  add constraint milestone_event_participants_radar_tenant_fk foreign key (diploma_readiness_radar_id, tenant_id) references public.diploma_readiness_radar (id, tenant_id);

alter table public.milestone_results
  add column if not exists diploma_readiness_radar_id uuid references public.diploma_readiness_radar (id) on delete set null,
  add column if not exists guardrail_snapshot jsonb not null default '{}'::jsonb;

alter table public.milestone_results
  drop constraint if exists milestone_results_guardrail_snapshot_check,
  add constraint milestone_results_guardrail_snapshot_check check (jsonb_typeof(guardrail_snapshot) = 'object'),
  drop constraint if exists milestone_results_radar_tenant_fk,
  add constraint milestone_results_radar_tenant_fk foreign key (diploma_readiness_radar_id, tenant_id) references public.diploma_readiness_radar (id, tenant_id);

create index if not exists diploma_readiness_radar_status_idx
  on public.diploma_readiness_radar (tenant_id, readiness_status, score desc, last_evaluated_at desc);

create index if not exists diploma_readiness_radar_enrollment_idx
  on public.diploma_readiness_radar (tenant_id, enrollment_id);

create index if not exists afzwem_event_candidate_suggestions_event_idx
  on public.afzwem_event_candidate_suggestions (tenant_id, milestone_event_id, suggested_status, score desc);

create index if not exists afzwem_event_candidate_suggestions_radar_idx
  on public.afzwem_event_candidate_suggestions (tenant_id, readiness_radar_id, score desc);

create index if not exists diploma_readiness_events_radar_idx
  on public.diploma_readiness_events (tenant_id, readiness_radar_id, created_at desc);

create index if not exists milestone_event_participants_radar_idx
  on public.milestone_event_participants (diploma_readiness_radar_id)
  where diploma_readiness_radar_id is not null;

drop trigger if exists diploma_readiness_radar_set_updated_at on public.diploma_readiness_radar;
create trigger diploma_readiness_radar_set_updated_at
  before update on public.diploma_readiness_radar
  for each row execute function app_private.set_updated_at();

drop trigger if exists afzwem_event_candidate_suggestions_set_updated_at on public.afzwem_event_candidate_suggestions;
create trigger afzwem_event_candidate_suggestions_set_updated_at
  before update on public.afzwem_event_candidate_suggestions
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.diploma_readiness_radar to authenticated;
grant select, insert, update on public.afzwem_event_candidate_suggestions to authenticated;
grant select, insert on public.diploma_readiness_events to authenticated;

grant all on public.diploma_readiness_radar to service_role;
grant all on public.afzwem_event_candidate_suggestions to service_role;
grant all on public.diploma_readiness_events to service_role;

alter table public.diploma_readiness_radar enable row level security;
alter table public.afzwem_event_candidate_suggestions enable row level security;
alter table public.diploma_readiness_events enable row level security;

drop policy if exists "Tenant instruction team can view diploma readiness radar" on public.diploma_readiness_radar;
create policy "Tenant instruction team can view diploma readiness radar"
  on public.diploma_readiness_radar
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can insert diploma readiness radar" on public.diploma_readiness_radar;
create policy "Tenant staff can insert diploma readiness radar"
  on public.diploma_readiness_radar
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update diploma readiness radar" on public.diploma_readiness_radar;
create policy "Tenant staff can update diploma readiness radar"
  on public.diploma_readiness_radar
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

drop policy if exists "Tenant instruction team can view afzwem event candidates" on public.afzwem_event_candidate_suggestions;
create policy "Tenant instruction team can view afzwem event candidates"
  on public.afzwem_event_candidate_suggestions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can manage afzwem event candidates" on public.afzwem_event_candidate_suggestions;
create policy "Tenant staff can manage afzwem event candidates"
  on public.afzwem_event_candidate_suggestions
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant instruction team can view diploma readiness events" on public.diploma_readiness_events;
create policy "Tenant instruction team can view diploma readiness events"
  on public.diploma_readiness_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can insert diploma readiness events" on public.diploma_readiness_events;
create policy "Tenant staff can insert diploma readiness events"
  on public.diploma_readiness_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop trigger if exists diploma_readiness_radar_audit_events on public.diploma_readiness_radar;
create trigger diploma_readiness_radar_audit_events
  after insert or update or delete on public.diploma_readiness_radar
  for each row execute function app_private.record_audit_event();

drop trigger if exists afzwem_event_candidate_suggestions_audit_events on public.afzwem_event_candidate_suggestions;
create trigger afzwem_event_candidate_suggestions_audit_events
  after insert or update or delete on public.afzwem_event_candidate_suggestions
  for each row execute function app_private.record_audit_event();

drop trigger if exists diploma_readiness_events_audit_events on public.diploma_readiness_events;
create trigger diploma_readiness_events_audit_events
  after insert or update or delete on public.diploma_readiness_events
  for each row execute function app_private.record_audit_event();

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
  'diploma_readiness',
  'semi_automatic',
  'diploma-readiness-v1',
  '{"progress":35,"attendance":20,"instructor_approval":20,"badges":10,"period":10,"event_capacity":5}'::jsonb,
  '{"almost_ready":65,"ready_for_review":80,"high_confidence":90}'::jsonb,
  '{"candidate_valid_days":14,"invitation_reminder_days":7}'::jsonb,
  '{}'::jsonb,
  '{"parent_invitation":true,"result_notification":true,"diploma_available":true}'::jsonb,
  '{"rule_family":"diploma_readiness","phase":"S9"}'::jsonb
from public.tenants tenant
on conflict (tenant_id, engine_key) do update
  set mode = excluded.mode,
      rule_version = excluded.rule_version,
      weights = public.tenant_smart_engine_settings.weights || excluded.weights,
      thresholds = public.tenant_smart_engine_settings.thresholds || excluded.thresholds,
      expiry_settings = public.tenant_smart_engine_settings.expiry_settings || excluded.expiry_settings,
      notification_settings = public.tenant_smart_engine_settings.notification_settings || excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata;
