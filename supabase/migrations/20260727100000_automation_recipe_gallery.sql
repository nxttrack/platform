create function app_private.current_user_can_manage_automation(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin']);
$$;

revoke all on function app_private.current_user_can_manage_automation(uuid) from public;
revoke all on function app_private.current_user_can_manage_automation(uuid) from anon;
grant execute on function app_private.current_user_can_manage_automation(uuid) to authenticated;
grant execute on function app_private.current_user_can_manage_automation(uuid) to service_role;

drop policy if exists "Tenant admins manage automation rules" on public.automation_rules;
create policy "Tenant owners and admins manage automation rules"
  on public.automation_rules
  for all
  to authenticated
  using (app_private.current_user_can_manage_automation(tenant_id))
  with check (app_private.current_user_can_manage_automation(tenant_id));

create table public.automation_recipes (
  key text primary key,
  version integer not null default 1,
  name text not null,
  description text not null,
  category text not null,
  trigger_type text not null,
  conditions_json jsonb not null default '{}'::jsonb,
  actions_json jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_recipes_key_check check (key ~ '^[a-z0-9_]+$'),
  constraint automation_recipes_version_check check (version > 0),
  constraint automation_recipes_category_check
    check (category in ('attendance', 'engagement', 'placement', 'progress', 'billing')),
  constraint automation_recipes_trigger_check
    check (trigger_type in ('attendance', 'calendar', 'offer', 'progress', 'payment', 'credit', 'capacity')),
  constraint automation_recipes_conditions_check check (jsonb_typeof(conditions_json) = 'object'),
  constraint automation_recipes_actions_check check (jsonb_typeof(actions_json) = 'array'),
  constraint automation_recipes_status_check check (status in ('active', 'deprecated'))
);

create table public.tenant_automation_recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  recipe_key text not null references public.automation_recipes (key) on update cascade on delete restrict,
  recipe_version integer not null default 1,
  enabled boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  review_only boolean not null default true,
  external_delivery_enabled boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  enabled_by_user_id uuid references auth.users (id) on delete set null,
  enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_automation_recipes_recipe_version_check check (recipe_version > 0),
  constraint tenant_automation_recipes_settings_check check (jsonb_typeof(settings_json) = 'object'),
  constraint tenant_automation_recipes_safety_check check (review_only and not external_delivery_enabled),
  constraint tenant_automation_recipes_enabled_check check (
    (enabled and enabled_at is not null and enabled_by_user_id is not null)
    or (not enabled and enabled_at is null and enabled_by_user_id is null)
  ),
  constraint tenant_automation_recipes_tenant_id_id_unique unique (tenant_id, id),
  constraint tenant_automation_recipes_tenant_recipe_unique unique (tenant_id, recipe_key)
);

create table public.automation_recipe_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tenant_recipe_id uuid,
  recipe_key text not null references public.automation_recipes (key) on update cascade on delete restrict,
  recipe_version integer not null,
  status text not null default 'running',
  execution_mode text not null,
  idempotency_key text not null,
  trigger_entity_type text,
  trigger_entity_id uuid,
  participant_id uuid,
  review_task_id uuid,
  actions_taken_json jsonb not null default '[]'::jsonb,
  source_data_json jsonb not null default '{}'::jsonb,
  reasons_json jsonb not null default '[]'::jsonb,
  confidence numeric(5, 4),
  skipped_reason text,
  error_code text,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  initiated_by_user_id uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  content_classification text not null default 'operational',
  classification_reasons jsonb not null default '["automation_review_audit"]'::jsonb,
  created_at timestamptz not null default now(),
  constraint automation_recipe_runs_tenant_recipe_fk
    foreign key (tenant_id, tenant_recipe_id)
    references public.tenant_automation_recipes (tenant_id, id)
    on delete restrict,
  constraint automation_recipe_runs_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete set null (participant_id),
  constraint automation_recipe_runs_task_fk
    foreign key (tenant_id, review_task_id)
    references public.tenant_tasks (tenant_id, id)
    on delete set null (review_task_id),
  constraint automation_recipe_runs_version_check check (recipe_version > 0),
  constraint automation_recipe_runs_status_check
    check (status in ('running', 'completed', 'skipped', 'failed')),
  constraint automation_recipe_runs_mode_check check (execution_mode in ('test', 'live')),
  constraint automation_recipe_runs_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint automation_recipe_runs_actions_check check (jsonb_typeof(actions_taken_json) = 'array'),
  constraint automation_recipe_runs_source_check check (jsonb_typeof(source_data_json) = 'object'),
  constraint automation_recipe_runs_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint automation_recipe_runs_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint automation_recipe_runs_classification_reasons_check
    check (jsonb_typeof(classification_reasons) = 'array'),
  constraint automation_recipe_runs_test_marker_check check (journey_run_id is null or is_test),
  constraint automation_recipe_runs_live_marker_check
    check (execution_mode <> 'live' or (not is_test and journey_run_id is null)),
  constraint automation_recipe_runs_completion_check check (
    (status = 'running' and completed_at is null)
    or (status <> 'running' and completed_at is not null)
  ),
  constraint automation_recipe_runs_outcome_check check (
    (status = 'skipped' and skipped_reason is not null)
    or (status <> 'skipped' and skipped_reason is null)
  ),
  constraint automation_recipe_runs_error_check check (
    (status = 'failed' and error_code is not null)
    or (status <> 'failed' and error_code is null)
  ),
  constraint automation_recipe_runs_review_only_check check (
    (status in ('running', 'skipped', 'failed')
      and review_task_id is null
      and actions_taken_json = '[]'::jsonb)
    or (status = 'completed'
      and execution_mode = 'test'
      and review_task_id is null
      and actions_taken_json = '["simulation_only"]'::jsonb)
    or (status = 'completed'
      and execution_mode = 'live'
      and review_task_id is not null
      and actions_taken_json = '["review_task_created"]'::jsonb)
  ),
  constraint automation_recipe_runs_tenant_id_id_unique unique (tenant_id, id),
  constraint automation_recipe_runs_idempotency_unique unique (tenant_id, idempotency_key)
);

create index tenant_automation_recipes_enabled_idx
  on public.tenant_automation_recipes (tenant_id, enabled, recipe_key);
create index automation_recipe_runs_tenant_created_idx
  on public.automation_recipe_runs (tenant_id, created_at desc);
create index automation_recipe_runs_recipe_created_idx
  on public.automation_recipe_runs (tenant_id, recipe_key, created_at desc);
create index automation_recipe_runs_journey_idx
  on public.automation_recipe_runs (tenant_id, journey_run_id)
  where is_test;

create trigger automation_recipes_set_updated_at
  before update on public.automation_recipes
  for each row execute function app_private.set_updated_at();
create trigger tenant_automation_recipes_set_updated_at
  before update on public.tenant_automation_recipes
  for each row execute function app_private.set_updated_at();

grant select on public.automation_recipes to authenticated;
grant select, insert, update, delete on public.tenant_automation_recipes to authenticated;
grant select on public.automation_recipe_runs to authenticated;
grant all on public.automation_recipes to service_role;
grant all on public.tenant_automation_recipes to service_role;
grant all on public.automation_recipe_runs to service_role;

alter table public.automation_recipes enable row level security;
alter table public.tenant_automation_recipes enable row level security;
alter table public.automation_recipe_runs enable row level security;
alter table public.automation_recipes force row level security;
alter table public.tenant_automation_recipes force row level security;
alter table public.automation_recipe_runs force row level security;

create policy "Authenticated users view automation recipe catalog"
  on public.automation_recipes
  for select
  to authenticated
  using (true);

create policy "Tenant owners and admins view recipe configuration"
  on public.tenant_automation_recipes
  for select
  to authenticated
  using (app_private.current_user_can_manage_automation(tenant_id));

create policy "Tenant owners and admins create recipe configuration"
  on public.tenant_automation_recipes
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_automation(tenant_id));

create policy "Tenant owners and admins update recipe configuration"
  on public.tenant_automation_recipes
  for update
  to authenticated
  using (app_private.current_user_can_manage_automation(tenant_id))
  with check (app_private.current_user_can_manage_automation(tenant_id));

create policy "Tenant owners and admins delete recipe configuration"
  on public.tenant_automation_recipes
  for delete
  to authenticated
  using (app_private.current_user_can_manage_automation(tenant_id));

create policy "Tenant owners and admins view recipe runs"
  on public.automation_recipe_runs
  for select
  to authenticated
  using (app_private.current_user_can_manage_automation(tenant_id));

insert into public.automation_recipes (
  key,
  version,
  name,
  description,
  category,
  trigger_type,
  conditions_json,
  actions_json
)
values
  (
    'no_show_follow_up',
    1,
    'No-show opvolging',
    'Signaleert herhaalde afwezigheid en maakt uitsluitend een interne controletaak.',
    'attendance',
    'attendance',
    '{"lookback_days":30,"minimum_occurrences":2}'::jsonb,
    '[{"type":"review_task","human_follow_up_required":true}]'::jsonb
  ),
  (
    'birthday_message',
    1,
    'Verjaardagsbericht',
    'Bereidt een interne herinnering voor optionele verjaardagsopvolging voor.',
    'engagement',
    'calendar',
    '{"days_ahead":1}'::jsonb,
    '[{"type":"review_task","external_delivery":false,"occasion_consent_required":true}]'::jsonb
  ),
  (
    'offer_expiring',
    1,
    'Aanbod verloopt bijna',
    'Signaleert een open plaatsingsaanbod dat binnenkort verloopt.',
    'placement',
    'offer',
    '{"days_ahead":2,"statuses":["sent"]}'::jsonb,
    '[{"type":"review_task","placement_action":false,"external_delivery":false}]'::jsonb
  ),
  (
    'long_absence',
    1,
    'Lange afwezigheid',
    'Gebruikt de neutrale learning-intelligence signalering voor langdurige afwezigheid.',
    'attendance',
    'attendance',
    '{"lookback_days":90,"minimum_occurrences":1}'::jsonb,
    '[{"type":"review_task","cause_inference":false}]'::jsonb
  ),
  (
    'diploma_achieved',
    1,
    'Diploma behaald',
    'Zet een recent uitgegeven diploma klaar voor gecontroleerde opvolging.',
    'progress',
    'progress',
    '{"lookback_days":2,"statuses":["issued"]}'::jsonb,
    '[{"type":"review_task","external_delivery":false}]'::jsonb
  ),
  (
    'payment_failed',
    1,
    'Mislukte betaling',
    'Maakt uitsluitend een financiële controletaak; er wordt niets geïncasseerd.',
    'billing',
    'payment',
    '{"lookback_days":3,"statuses":["failed"]}'::jsonb,
    '[{"type":"review_task","payment_action":false,"external_delivery":false}]'::jsonb
  ),
  (
    'makeup_credit_expiring',
    1,
    'Inhaalcredit verloopt bijna',
    'Signaleert een beschikbare inhaalcredit die binnenkort verloopt.',
    'engagement',
    'credit',
    '{"days_ahead":7,"statuses":["available"]}'::jsonb,
    '[{"type":"review_task","booking_action":false,"external_delivery":false}]'::jsonb
  ),
  (
    'graduation_reminder',
    1,
    'Afzwemherinnering',
    'Zet een aankomend afzwemmoment met actieve uitnodiging klaar voor controle.',
    'progress',
    'calendar',
    '{"days_ahead":7,"invite_statuses":["sent","confirmed"]}'::jsonb,
    '[{"type":"review_task","external_delivery":false}]'::jsonb
  ),
  (
    'trial_lesson_follow_up',
    1,
    'Proefles follow-up',
    'Zet een proefles zonder vastgelegde opvolging klaar voor persoonlijk contact.',
    'engagement',
    'attendance',
    '{"lookback_days":2,"signal_types":["trial_unfollowed"]}'::jsonb,
    '[{"type":"review_task","marketing_consent_required":true,"external_delivery":false}]'::jsonb
  ),
  (
    'waitlist_capacity_available',
    1,
    'Nieuwe wachtlijstplek beschikbaar',
    'Signaleert een blocker-vrije Smart Placement-suggestie voor menselijke beoordeling.',
    'placement',
    'capacity',
    '{"minimum_confidence":0.65,"statuses":["suggested"]}'::jsonb,
    '[{"type":"review_task","placement_action":false,"external_delivery":false}]'::jsonb
  )
on conflict (key) do update set
  version = excluded.version,
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  trigger_type = excluded.trigger_type,
  conditions_json = excluded.conditions_json,
  actions_json = excluded.actions_json,
  status = 'active',
  updated_at = now();

comment on table public.automation_recipes is
  'Versioned, platform-owned catalog. Recipes only create internal review work and never dispatch externally.';
comment on table public.tenant_automation_recipes is
  'Owner/admin-controlled tenant configuration with a database-enforced review-only safety boundary.';
comment on table public.automation_recipe_runs is
  'Privacy-minimised evaluation and internal review-task audit; test and Journey runs cannot produce live actions.';
