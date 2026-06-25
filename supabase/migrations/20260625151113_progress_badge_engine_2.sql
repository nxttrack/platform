alter table public.stage_modules
  add column if not exists rubric jsonb not null default '{}'::jsonb,
  add column if not exists assessment_scale text not null default 'four_step',
  add column if not exists parent_copy text,
  add column if not exists evidence_required boolean not null default false;

alter table public.stage_modules
  drop constraint if exists stage_modules_rubric_check,
  add constraint stage_modules_rubric_check check (jsonb_typeof(rubric) = 'object'),
  drop constraint if exists stage_modules_assessment_scale_check,
  add constraint stage_modules_assessment_scale_check check (assessment_scale in ('four_step', 'percentage', 'binary', 'custom'));

alter table public.progress
  add column if not exists parent_summary text,
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb;

alter table public.progress
  drop constraint if exists progress_evidence_snapshot_check,
  add constraint progress_evidence_snapshot_check check (jsonb_typeof(evidence_snapshot) = 'object');

alter table public.stage_module_progress
  add column if not exists parent_summary text,
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb;

alter table public.stage_module_progress
  drop constraint if exists stage_module_progress_evidence_snapshot_check,
  add constraint stage_module_progress_evidence_snapshot_check check (jsonb_typeof(evidence_snapshot) = 'object');

create table if not exists public.stage_progress_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  required_modules integer not null default 0,
  required_score numeric(5, 2),
  required_statuses text[] not null default array['passed']::text[],
  evidence_required boolean not null default false,
  parent_copy text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_progress_criteria_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint stage_progress_criteria_score_check check (required_score is null or required_score between 0 and 100),
  constraint stage_progress_criteria_modules_check check (required_modules >= 0),
  constraint stage_progress_criteria_status_check check (status in ('draft', 'active', 'archived')),
  constraint stage_progress_criteria_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint stage_progress_criteria_id_tenant_unique unique (id, tenant_id),
  constraint stage_progress_criteria_unique_code unique (tenant_id, stage_id, code),
  constraint stage_progress_criteria_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade,
  constraint stage_progress_criteria_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id) on delete cascade
);

create table if not exists public.quick_assessment_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete cascade,
  stage_module_id uuid references public.stage_modules (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  default_status text not null default 'in_progress',
  default_score numeric(5, 2),
  instructor_prompt text,
  parent_friendly_copy text,
  sort_order integer not null default 0,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quick_assessment_templates_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint quick_assessment_templates_default_status_check check (default_status in ('observed', 'in_progress', 'passed', 'needs_attention')),
  constraint quick_assessment_templates_default_score_check check (default_score is null or default_score between 0 and 100),
  constraint quick_assessment_templates_status_check check (status in ('draft', 'active', 'archived')),
  constraint quick_assessment_templates_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint quick_assessment_templates_id_tenant_unique unique (id, tenant_id),
  constraint quick_assessment_templates_unique_code unique (tenant_id, code),
  constraint quick_assessment_templates_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade,
  constraint quick_assessment_templates_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint quick_assessment_templates_module_tenant_fk foreign key (stage_module_id, tenant_id) references public.stage_modules (id, tenant_id)
);

create table if not exists public.progress_evidence_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete set null,
  stage_module_id uuid references public.stage_modules (id) on delete set null,
  progress_id uuid references public.progress (id) on delete set null,
  stage_module_progress_id uuid references public.stage_module_progress (id) on delete set null,
  badge_award_id uuid references public.badge_awards (id) on delete set null,
  stage_transition_proposal_id uuid references public.stage_transition_proposals (id) on delete set null,
  event_type text not null,
  title text not null,
  summary text,
  parent_summary text,
  evidence_source text not null default 'instructor',
  score numeric(5, 2),
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint progress_evidence_events_type_check check (event_type in ('progress_observation', 'module_assessment', 'badge_recommendation', 'badge_award', 'stage_transition_proposal', 'compliment')),
  constraint progress_evidence_events_source_check check (evidence_source in ('instructor', 'admin', 'system', 'parent')),
  constraint progress_evidence_events_score_check check (score is null or score between 0 and 100),
  constraint progress_evidence_events_status_check check (status in ('active', 'archived')),
  constraint progress_evidence_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint progress_evidence_events_id_tenant_unique unique (id, tenant_id),
  constraint progress_evidence_events_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint progress_evidence_events_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  constraint progress_evidence_events_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint progress_evidence_events_module_tenant_fk foreign key (stage_module_id, tenant_id) references public.stage_modules (id, tenant_id),
  constraint progress_evidence_events_progress_tenant_fk foreign key (progress_id, tenant_id) references public.progress (id, tenant_id),
  constraint progress_evidence_events_module_progress_tenant_fk foreign key (stage_module_progress_id, tenant_id) references public.stage_module_progress (id, tenant_id),
  constraint progress_evidence_events_badge_award_tenant_fk foreign key (badge_award_id, tenant_id) references public.badge_awards (id, tenant_id),
  constraint progress_evidence_events_stage_transition_tenant_fk foreign key (stage_transition_proposal_id, tenant_id) references public.stage_transition_proposals (id, tenant_id)
);

create table if not exists public.badge_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete cascade,
  code text not null,
  name text not null,
  trigger_type text not null default 'manual',
  min_score numeric(5, 2),
  required_module_ids uuid[] not null default '{}'::uuid[],
  required_status text not null default 'passed',
  approval_role text not null default 'either',
  recommendation_copy text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_rules_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint badge_rules_trigger_type_check check (trigger_type in ('manual', 'progress_recommendation')),
  constraint badge_rules_score_check check (min_score is null or min_score between 0 and 100),
  constraint badge_rules_required_status_check check (required_status in ('observed', 'in_progress', 'passed', 'needs_attention')),
  constraint badge_rules_approval_role_check check (approval_role in ('instructor', 'tenant_admin', 'either')),
  constraint badge_rules_status_check check (status in ('draft', 'active', 'archived')),
  constraint badge_rules_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint badge_rules_id_tenant_unique unique (id, tenant_id),
  constraint badge_rules_unique_code unique (tenant_id, badge_id, code),
  constraint badge_rules_badge_tenant_fk foreign key (badge_id, tenant_id) references public.badges (id, tenant_id) on delete cascade,
  constraint badge_rules_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id),
  constraint badge_rules_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id)
);

create table if not exists public.badge_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  badge_rule_id uuid references public.badge_rules (id) on delete set null,
  badge_id uuid not null references public.badges (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete cascade,
  smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  score numeric(5, 2),
  confidence text not null default 'unknown',
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'recommended',
  recommended_at timestamptz not null default now(),
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  badge_award_id uuid references public.badge_awards (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_recommendations_score_check check (score is null or score between 0 and 100),
  constraint badge_recommendations_confidence_check check (confidence in ('unknown', 'low', 'medium', 'high', 'manual')),
  constraint badge_recommendations_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint badge_recommendations_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint badge_recommendations_snapshot_check check (jsonb_typeof(evidence_snapshot) = 'object'),
  constraint badge_recommendations_status_check check (status in ('recommended', 'approved', 'rejected', 'awarded', 'expired')),
  constraint badge_recommendations_id_tenant_unique unique (id, tenant_id),
  constraint badge_recommendations_unique_active unique (tenant_id, badge_id, participant_id, enrollment_id, status),
  constraint badge_recommendations_badge_rule_tenant_fk foreign key (badge_rule_id, tenant_id) references public.badge_rules (id, tenant_id),
  constraint badge_recommendations_badge_tenant_fk foreign key (badge_id, tenant_id) references public.badges (id, tenant_id) on delete cascade,
  constraint badge_recommendations_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint badge_recommendations_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

alter table public.badge_awards
  add column if not exists badge_recommendation_id uuid references public.badge_recommendations (id) on delete set null;

alter table public.stage_transition_proposals
  add column if not exists criteria_id uuid references public.stage_progress_criteria (id) on delete set null,
  add column if not exists evidence_snapshot jsonb not null default '{}'::jsonb;

alter table public.stage_transition_proposals
  drop constraint if exists stage_transition_proposals_evidence_snapshot_check,
  add constraint stage_transition_proposals_evidence_snapshot_check check (jsonb_typeof(evidence_snapshot) = 'object');

create index if not exists stage_progress_criteria_tenant_stage_idx on public.stage_progress_criteria (tenant_id, stage_id, status);
create index if not exists quick_assessment_templates_tenant_stage_idx on public.quick_assessment_templates (tenant_id, stage_id, status, sort_order);
create index if not exists quick_assessment_templates_module_idx on public.quick_assessment_templates (tenant_id, stage_module_id);
create index if not exists progress_evidence_events_participant_idx on public.progress_evidence_events (tenant_id, participant_id, created_at desc);
create index if not exists progress_evidence_events_enrollment_idx on public.progress_evidence_events (tenant_id, enrollment_id, created_at desc);
create index if not exists badge_rules_badge_idx on public.badge_rules (tenant_id, badge_id, status);
create index if not exists badge_recommendations_participant_idx on public.badge_recommendations (tenant_id, participant_id, status, recommended_at desc);
create index if not exists badge_recommendations_enrollment_idx on public.badge_recommendations (tenant_id, enrollment_id, status);

drop trigger if exists stage_progress_criteria_set_updated_at on public.stage_progress_criteria;
create trigger stage_progress_criteria_set_updated_at
  before update on public.stage_progress_criteria
  for each row execute function app_private.set_updated_at();

drop trigger if exists quick_assessment_templates_set_updated_at on public.quick_assessment_templates;
create trigger quick_assessment_templates_set_updated_at
  before update on public.quick_assessment_templates
  for each row execute function app_private.set_updated_at();

drop trigger if exists badge_rules_set_updated_at on public.badge_rules;
create trigger badge_rules_set_updated_at
  before update on public.badge_rules
  for each row execute function app_private.set_updated_at();

drop trigger if exists badge_recommendations_set_updated_at on public.badge_recommendations;
create trigger badge_recommendations_set_updated_at
  before update on public.badge_recommendations
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.stage_progress_criteria to authenticated;
grant select, insert, update on public.quick_assessment_templates to authenticated;
grant select, insert, update on public.progress_evidence_events to authenticated;
grant select, insert, update on public.badge_rules to authenticated;
grant select, insert, update on public.badge_recommendations to authenticated;

grant all on public.stage_progress_criteria to service_role;
grant all on public.quick_assessment_templates to service_role;
grant all on public.progress_evidence_events to service_role;
grant all on public.badge_rules to service_role;
grant all on public.badge_recommendations to service_role;

alter table public.stage_progress_criteria enable row level security;
alter table public.quick_assessment_templates enable row level security;
alter table public.progress_evidence_events enable row level security;
alter table public.badge_rules enable row level security;
alter table public.badge_recommendations enable row level security;

drop policy if exists "Tenant staff can view stage progress criteria" on public.stage_progress_criteria;
create policy "Tenant staff can view stage progress criteria"
  on public.stage_progress_criteria
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can manage stage progress criteria" on public.stage_progress_criteria;
create policy "Tenant staff can manage stage progress criteria"
  on public.stage_progress_criteria
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

drop policy if exists "Tenant staff can view quick assessment templates" on public.quick_assessment_templates;
create policy "Tenant staff can view quick assessment templates"
  on public.quick_assessment_templates
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can manage quick assessment templates" on public.quick_assessment_templates;
create policy "Tenant staff can manage quick assessment templates"
  on public.quick_assessment_templates
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

drop policy if exists "Participants and instruction team can view progress evidence events" on public.progress_evidence_events;
create policy "Participants and instruction team can view progress evidence events"
  on public.progress_evidence_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

drop policy if exists "Instruction team can insert progress evidence events" on public.progress_evidence_events;
create policy "Instruction team can insert progress evidence events"
  on public.progress_evidence_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Instruction team can update progress evidence events" on public.progress_evidence_events;
create policy "Instruction team can update progress evidence events"
  on public.progress_evidence_events
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

drop policy if exists "Instruction team can view badge rules" on public.badge_rules;
create policy "Instruction team can view badge rules"
  on public.badge_rules
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Tenant staff can manage badge rules" on public.badge_rules;
create policy "Tenant staff can manage badge rules"
  on public.badge_rules
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

drop policy if exists "Instruction team can view badge recommendations" on public.badge_recommendations;
create policy "Instruction team can view badge recommendations"
  on public.badge_recommendations
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Instruction team can insert badge recommendations" on public.badge_recommendations;
create policy "Instruction team can insert badge recommendations"
  on public.badge_recommendations
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop policy if exists "Instruction team can update badge recommendations" on public.badge_recommendations;
create policy "Instruction team can update badge recommendations"
  on public.badge_recommendations
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

drop trigger if exists stage_progress_criteria_audit_events on public.stage_progress_criteria;
create trigger stage_progress_criteria_audit_events
  after insert or update or delete on public.stage_progress_criteria
  for each row execute function app_private.record_audit_event();

drop trigger if exists quick_assessment_templates_audit_events on public.quick_assessment_templates;
create trigger quick_assessment_templates_audit_events
  after insert or update or delete on public.quick_assessment_templates
  for each row execute function app_private.record_audit_event();

drop trigger if exists progress_evidence_events_audit_events on public.progress_evidence_events;
create trigger progress_evidence_events_audit_events
  after insert or update or delete on public.progress_evidence_events
  for each row execute function app_private.record_audit_event();

drop trigger if exists badge_rules_audit_events on public.badge_rules;
create trigger badge_rules_audit_events
  after insert or update or delete on public.badge_rules
  for each row execute function app_private.record_audit_event();

drop trigger if exists badge_recommendations_audit_events on public.badge_recommendations;
create trigger badge_recommendations_audit_events
  after insert or update or delete on public.badge_recommendations
  for each row execute function app_private.record_audit_event();

insert into public.stage_progress_criteria (
  tenant_id,
  program_id,
  stage_id,
  code,
  name,
  description,
  required_modules,
  required_score,
  parent_copy,
  metadata
)
select
  stage.tenant_id,
  stage.program_id,
  stage.id,
  stage.code || '-criteria',
  stage.name || ' criteria',
  'Basiscriteria voor doorstroom: voldoende modules en instructeursevidence.',
  greatest(count(module.id)::integer, 1),
  80,
  'We kijken naar de onderdelen, de lesobservaties en het oordeel van de instructeur.',
  jsonb_build_object('seeded_from', 'progress_badge_engine_2')
from public.stages stage
left join public.stage_modules module
  on module.tenant_id = stage.tenant_id
  and module.stage_id = stage.id
  and module.status = 'active'
group by stage.tenant_id, stage.program_id, stage.id, stage.code, stage.name
on conflict (tenant_id, stage_id, code) do nothing;

insert into public.quick_assessment_templates (
  tenant_id,
  program_id,
  stage_id,
  stage_module_id,
  code,
  name,
  description,
  default_status,
  default_score,
  instructor_prompt,
  parent_friendly_copy,
  sort_order,
  metadata
)
select
  module.tenant_id,
  module.program_id,
  module.stage_id,
  module.id,
  stage.code || '-' || module.code || '-quick',
  module.name || ' snelbeoordeling',
  'Snelle lesbeoordeling voor ' || module.name || '.',
  'in_progress',
  60,
  'Wat zag je vandaag bij ' || module.name || '?',
  coalesce(module.parent_copy, 'Er is gewerkt aan ' || module.name || '.'),
  module.sort_order,
  jsonb_build_object('seeded_from', 'progress_badge_engine_2')
from public.stage_modules module
join public.stages stage
  on stage.tenant_id = module.tenant_id
  and stage.id = module.stage_id
on conflict (tenant_id, code) do nothing;

insert into public.badge_rules (
  tenant_id,
  badge_id,
  program_id,
  stage_id,
  code,
  name,
  trigger_type,
  min_score,
  approval_role,
  recommendation_copy,
  metadata
)
select
  badge.tenant_id,
  badge.id,
  badge.program_id,
  badge.stage_id,
  badge.code || '-progress-rule',
  badge.name || ' voortgangsregel',
  'progress_recommendation',
  80,
  'either',
  coalesce(badge.description, 'Deze badge past bij de recente voortgang.'),
  jsonb_build_object('seeded_from', 'progress_badge_engine_2')
from public.badges badge
on conflict (tenant_id, badge_id, code) do nothing;

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
  defaults.engine_key,
  'semi_automatic',
  defaults.rule_version,
  defaults.weights,
  defaults.thresholds,
  '{}'::jsonb,
  '{}'::jsonb,
  defaults.notification_settings,
  jsonb_build_object('phase', 'S7', 'rule_family', defaults.engine_key)
from public.tenants tenant
cross join (
  values
    ('progress', 'progress-v2', '{"module":45,"score":25,"evidence":20,"instructor":10}'::jsonb, '{"stage_transition_candidate":85,"attention":45}'::jsonb, '{"parent_progress":true,"evidence_timeline":true}'::jsonb),
    ('badge', 'badge-v2', '{"module_completion":45,"score":30,"rule_fit":15,"instructor":10}'::jsonb, '{"recommend":75,"high_confidence":90}'::jsonb, '{"parent_badge":true,"approval_required":true}'::jsonb)
) as defaults(engine_key, rule_version, weights, thresholds, notification_settings)
on conflict (tenant_id, engine_key) do update
  set mode = excluded.mode,
      rule_version = excluded.rule_version,
      weights = public.tenant_smart_engine_settings.weights || excluded.weights,
      thresholds = public.tenant_smart_engine_settings.thresholds || excluded.thresholds,
      notification_settings = public.tenant_smart_engine_settings.notification_settings || excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata;
