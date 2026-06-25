create table if not exists public.flow_through_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  stage_transition_proposal_id uuid not null references public.stage_transition_proposals (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  from_stage_id uuid references public.stages (id) on delete set null,
  to_stage_id uuid not null references public.stages (id) on delete restrict,
  current_group_membership_id uuid references public.group_memberships (id) on delete set null,
  current_group_id uuid references public.groups (id) on delete set null,
  target_group_id uuid references public.groups (id) on delete set null,
  capacity_hold_id uuid references public.capacity_holds (id) on delete set null,
  smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  score numeric(6, 2),
  confidence text not null default 'unknown',
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  completion_snapshot jsonb not null default '{}'::jsonb,
  capacity_result jsonb not null default '{}'::jsonb,
  preferred_fit jsonb not null default '{}'::jsonb,
  constraints_snapshot jsonb not null default '{}'::jsonb,
  old_spot_release_on date,
  target_start_on date,
  status text not null default 'recommended',
  decision_note text,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_through_recommendations_score_check check (score is null or score between 0 and 100),
  constraint flow_through_recommendations_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint flow_through_recommendations_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint flow_through_recommendations_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint flow_through_recommendations_completion_check check (jsonb_typeof(completion_snapshot) = 'object'),
  constraint flow_through_recommendations_capacity_check check (jsonb_typeof(capacity_result) = 'object'),
  constraint flow_through_recommendations_fit_check check (jsonb_typeof(preferred_fit) = 'object'),
  constraint flow_through_recommendations_constraints_check check (jsonb_typeof(constraints_snapshot) = 'object'),
  constraint flow_through_recommendations_status_check check (status in ('recommended', 'approved_transition', 'approved_with_group', 'postponed', 'rejected', 'applied', 'cancelled')),
  constraint flow_through_recommendations_id_tenant_unique unique (id, tenant_id),
  constraint flow_through_recommendations_unique_proposal unique (tenant_id, stage_transition_proposal_id),
  constraint flow_through_recommendations_proposal_tenant_fk foreign key (stage_transition_proposal_id, tenant_id) references public.stage_transition_proposals (id, tenant_id) on delete cascade,
  constraint flow_through_recommendations_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint flow_through_recommendations_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint flow_through_recommendations_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id),
  constraint flow_through_recommendations_from_stage_tenant_fk foreign key (from_stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint flow_through_recommendations_to_stage_tenant_fk foreign key (to_stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint flow_through_recommendations_current_membership_tenant_fk foreign key (current_group_membership_id, tenant_id) references public.group_memberships (id, tenant_id),
  constraint flow_through_recommendations_current_group_tenant_fk foreign key (current_group_id, tenant_id) references public.groups (id, tenant_id),
  constraint flow_through_recommendations_target_group_tenant_fk foreign key (target_group_id, tenant_id) references public.groups (id, tenant_id),
  constraint flow_through_recommendations_hold_tenant_fk foreign key (capacity_hold_id, tenant_id) references public.capacity_holds (id, tenant_id)
);

create table if not exists public.flow_through_target_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recommendation_id uuid not null references public.flow_through_recommendations (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  instructor_id uuid references public.instructors (id) on delete set null,
  score numeric(6, 2),
  confidence text not null default 'unknown',
  capacity_snapshot jsonb not null default '{}'::jsonb,
  preferred_fit jsonb not null default '{}'::jsonb,
  constraints_snapshot jsonb not null default '{}'::jsonb,
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  suggested_start_on date,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flow_through_target_options_score_check check (score is null or score between 0 and 100),
  constraint flow_through_target_options_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint flow_through_target_options_capacity_check check (jsonb_typeof(capacity_snapshot) = 'object'),
  constraint flow_through_target_options_fit_check check (jsonb_typeof(preferred_fit) = 'object'),
  constraint flow_through_target_options_constraints_check check (jsonb_typeof(constraints_snapshot) = 'object'),
  constraint flow_through_target_options_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint flow_through_target_options_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint flow_through_target_options_status_check check (status in ('candidate', 'selected', 'blocked', 'expired')),
  constraint flow_through_target_options_id_tenant_unique unique (id, tenant_id),
  constraint flow_through_target_options_unique_group unique (tenant_id, recommendation_id, group_id),
  constraint flow_through_target_options_recommendation_tenant_fk foreign key (recommendation_id, tenant_id) references public.flow_through_recommendations (id, tenant_id) on delete cascade,
  constraint flow_through_target_options_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete cascade,
  constraint flow_through_target_options_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id),
  constraint flow_through_target_options_instructor_tenant_fk foreign key (instructor_id, tenant_id) references public.instructors (id, tenant_id)
);

create table if not exists public.flow_through_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recommendation_id uuid not null references public.flow_through_recommendations (id) on delete cascade,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint flow_through_events_type_check check (event_type in (
    'created',
    'recommended',
    'hold_created',
    'hold_released',
    'approved_transition',
    'approved_with_group',
    'postponed',
    'rejected',
    'applied',
    'old_spot_released',
    'waitlist_rematch_triggered',
    'parent_notified',
    'billing_guard'
  )),
  constraint flow_through_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint flow_through_events_recommendation_tenant_fk foreign key (recommendation_id, tenant_id) references public.flow_through_recommendations (id, tenant_id) on delete cascade
);

alter table public.capacity_holds
  add column if not exists flow_through_recommendation_id uuid references public.flow_through_recommendations (id) on delete set null;

create index if not exists flow_through_recommendations_tenant_status_idx
  on public.flow_through_recommendations (tenant_id, status, created_at desc);

create index if not exists flow_through_recommendations_proposal_idx
  on public.flow_through_recommendations (stage_transition_proposal_id);

create index if not exists flow_through_target_options_recommendation_idx
  on public.flow_through_target_options (tenant_id, recommendation_id, score desc);

create index if not exists flow_through_events_recommendation_created_idx
  on public.flow_through_events (tenant_id, recommendation_id, created_at desc);

create index if not exists capacity_holds_flow_through_idx
  on public.capacity_holds (flow_through_recommendation_id)
  where flow_through_recommendation_id is not null;

drop trigger if exists flow_through_recommendations_set_updated_at on public.flow_through_recommendations;
create trigger flow_through_recommendations_set_updated_at
  before update on public.flow_through_recommendations
  for each row execute function app_private.set_updated_at();

drop trigger if exists flow_through_target_options_set_updated_at on public.flow_through_target_options;
create trigger flow_through_target_options_set_updated_at
  before update on public.flow_through_target_options
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.flow_through_recommendations to authenticated;
grant select, insert, update on public.flow_through_target_options to authenticated;
grant select, insert, update on public.flow_through_events to authenticated;
grant update (flow_through_recommendation_id) on public.capacity_holds to authenticated;

grant all on public.flow_through_recommendations to service_role;
grant all on public.flow_through_target_options to service_role;
grant all on public.flow_through_events to service_role;

alter table public.flow_through_recommendations enable row level security;
alter table public.flow_through_target_options enable row level security;
alter table public.flow_through_events enable row level security;

drop policy if exists "Tenant instruction team can view flow through recommendations" on public.flow_through_recommendations;
create policy "Tenant instruction team can view flow through recommendations"
  on public.flow_through_recommendations
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can insert flow through recommendations" on public.flow_through_recommendations;
create policy "Tenant staff can insert flow through recommendations"
  on public.flow_through_recommendations
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update flow through recommendations" on public.flow_through_recommendations;
create policy "Tenant staff can update flow through recommendations"
  on public.flow_through_recommendations
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

drop policy if exists "Tenant instruction team can view flow through options" on public.flow_through_target_options;
create policy "Tenant instruction team can view flow through options"
  on public.flow_through_target_options
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can manage flow through options" on public.flow_through_target_options;
create policy "Tenant staff can manage flow through options"
  on public.flow_through_target_options
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

drop policy if exists "Tenant instruction team can view flow through events" on public.flow_through_events;
create policy "Tenant instruction team can view flow through events"
  on public.flow_through_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can insert flow through events" on public.flow_through_events;
create policy "Tenant staff can insert flow through events"
  on public.flow_through_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop trigger if exists flow_through_recommendations_audit_events on public.flow_through_recommendations;
create trigger flow_through_recommendations_audit_events
  after insert or update or delete on public.flow_through_recommendations
  for each row execute function app_private.record_audit_event();

drop trigger if exists flow_through_target_options_audit_events on public.flow_through_target_options;
create trigger flow_through_target_options_audit_events
  after insert or update or delete on public.flow_through_target_options
  for each row execute function app_private.record_audit_event();

drop trigger if exists flow_through_events_audit_events on public.flow_through_events;
create trigger flow_through_events_audit_events
  after insert or update or delete on public.flow_through_events
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
  'flow_through',
  'semi_automatic',
  'flow-through-v2',
  '{"stage_completion":30,"capacity":30,"day_time_fit":15,"resource":10,"instructor":10,"billing_guard":5}'::jsonb,
  '{"recommend":75,"high_confidence":90}'::jsonb,
  '{}'::jsonb,
  '{"target_group_hold_days":7,"old_spot_release_notice_days":0}'::jsonb,
  '{"parent_transition":true,"instructor_visibility":true,"waitlist_rematch":true}'::jsonb,
  '{"rule_family":"flow_through","phase":"S8"}'::jsonb
from public.tenants tenant
on conflict (tenant_id, engine_key) do update
  set mode = excluded.mode,
      rule_version = excluded.rule_version,
      weights = public.tenant_smart_engine_settings.weights || excluded.weights,
      thresholds = public.tenant_smart_engine_settings.thresholds || excluded.thresholds,
      hold_settings = public.tenant_smart_engine_settings.hold_settings || excluded.hold_settings,
      notification_settings = public.tenant_smart_engine_settings.notification_settings || excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata;
