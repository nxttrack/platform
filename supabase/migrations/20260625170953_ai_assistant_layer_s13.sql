create table if not exists public.tenant_ai_assistant_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  capability text not null,
  label text not null,
  description text,
  enabled boolean not null default false,
  mode text not null default 'suggestion_only',
  provider text not null default 'openai',
  model text not null default 'gpt-4.1-mini',
  prompt_version text not null default 's13-v1',
  allowed_context_level text not null default 'minimal',
  sensitive_data_review_status text not null default 'pending',
  sensitive_data_reviewed_at timestamptz,
  sensitive_data_reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_ai_assistant_settings_capability_check check (capability in (
    'intake_summary',
    'admin_explanation',
    'parent_message_draft',
    'progress_note_rewrite',
    'report_insight',
    'risk_signal_summary'
  )),
  constraint tenant_ai_assistant_settings_mode_check check (mode in ('disabled', 'suggestion_only', 'draft_with_review')),
  constraint tenant_ai_assistant_settings_provider_check check (provider in ('openai')),
  constraint tenant_ai_assistant_settings_context_level_check check (allowed_context_level in ('minimal', 'operational', 'sensitive')),
  constraint tenant_ai_assistant_settings_review_check check (sensitive_data_review_status in ('pending', 'approved', 'blocked')),
  constraint tenant_ai_assistant_settings_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint tenant_ai_assistant_settings_unique unique (tenant_id, capability)
);

create table if not exists public.ai_assistant_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  capability text not null,
  subject_type text,
  subject_id uuid,
  source_engine_key text,
  smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  provider text not null default 'openai',
  model text not null,
  prompt_version text not null default 's13-v1',
  suggestion_label text not null default 'AI-suggestie',
  status text not null default 'drafted',
  input_snapshot jsonb not null default '{}'::jsonb,
  source_of_truth jsonb not null default '{}'::jsonb,
  prompt_snapshot jsonb not null default '{}'::jsonb,
  redaction_summary jsonb not null default '{}'::jsonb,
  output_text text,
  edited_output_text text,
  human_decision text,
  human_note text,
  decided_by_profile_id uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  error_message text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_assistant_suggestions_capability_check check (capability in (
    'intake_summary',
    'admin_explanation',
    'parent_message_draft',
    'progress_note_rewrite',
    'report_insight',
    'risk_signal_summary'
  )),
  constraint ai_assistant_suggestions_subject_type_check check (subject_type is null or subject_type ~ '^[a-z][a-z0-9_]*$'),
  constraint ai_assistant_suggestions_engine_check check (source_engine_key is null or source_engine_key in (
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
  constraint ai_assistant_suggestions_provider_check check (provider in ('openai')),
  constraint ai_assistant_suggestions_status_check check (status in ('drafted', 'blocked', 'failed', 'edited', 'accepted', 'dismissed')),
  constraint ai_assistant_suggestions_decision_check check (human_decision is null or human_decision in ('accepted', 'edited', 'dismissed')),
  constraint ai_assistant_suggestions_input_check check (jsonb_typeof(input_snapshot) = 'object'),
  constraint ai_assistant_suggestions_truth_check check (jsonb_typeof(source_of_truth) = 'object'),
  constraint ai_assistant_suggestions_prompt_check check (jsonb_typeof(prompt_snapshot) = 'object'),
  constraint ai_assistant_suggestions_redaction_check check (jsonb_typeof(redaction_summary) = 'object'),
  constraint ai_assistant_suggestions_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists tenant_ai_assistant_settings_tenant_idx
  on public.tenant_ai_assistant_settings (tenant_id, enabled, capability);

create index if not exists ai_assistant_suggestions_tenant_capability_idx
  on public.ai_assistant_suggestions (tenant_id, capability, created_at desc);

create index if not exists ai_assistant_suggestions_status_idx
  on public.ai_assistant_suggestions (tenant_id, status, created_at desc);

create index if not exists ai_assistant_suggestions_subject_idx
  on public.ai_assistant_suggestions (tenant_id, subject_type, subject_id);

drop trigger if exists tenant_ai_assistant_settings_set_updated_at on public.tenant_ai_assistant_settings;
create trigger tenant_ai_assistant_settings_set_updated_at
  before update on public.tenant_ai_assistant_settings
  for each row execute function app_private.set_updated_at();

drop trigger if exists ai_assistant_suggestions_set_updated_at on public.ai_assistant_suggestions;
create trigger ai_assistant_suggestions_set_updated_at
  before update on public.ai_assistant_suggestions
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.tenant_ai_assistant_settings to authenticated;
grant all on public.tenant_ai_assistant_settings to service_role;

grant select, insert, update on public.ai_assistant_suggestions to authenticated;
grant all on public.ai_assistant_suggestions to service_role;

alter table public.tenant_ai_assistant_settings enable row level security;
alter table public.ai_assistant_suggestions enable row level security;

drop policy if exists "Tenant staff can view AI assistant settings" on public.tenant_ai_assistant_settings;
create policy "Tenant staff can view AI assistant settings"
  on public.tenant_ai_assistant_settings
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant admins can manage AI assistant settings" on public.tenant_ai_assistant_settings;
create policy "Tenant admins can manage AI assistant settings"
  on public.tenant_ai_assistant_settings
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

drop policy if exists "Tenant staff can view AI assistant suggestions" on public.ai_assistant_suggestions;
create policy "Tenant staff can view AI assistant suggestions"
  on public.ai_assistant_suggestions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can create AI assistant suggestions" on public.ai_assistant_suggestions;
create policy "Tenant staff can create AI assistant suggestions"
  on public.ai_assistant_suggestions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update AI assistant suggestions" on public.ai_assistant_suggestions;
create policy "Tenant staff can update AI assistant suggestions"
  on public.ai_assistant_suggestions
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

drop trigger if exists tenant_ai_assistant_settings_audit_events on public.tenant_ai_assistant_settings;
create trigger tenant_ai_assistant_settings_audit_events
  after insert or update or delete on public.tenant_ai_assistant_settings
  for each row execute function app_private.record_audit_event();

drop trigger if exists ai_assistant_suggestions_audit_events on public.ai_assistant_suggestions;
create trigger ai_assistant_suggestions_audit_events
  after insert or update or delete on public.ai_assistant_suggestions
  for each row execute function app_private.record_audit_event();

with capability_defaults(capability, label, description, allowed_context_level, metadata) as (
  values
    ('intake_summary', 'Intake samenvatting', 'Vat intake-antwoorden samen voor admin review zonder een beslissing te nemen.', 'operational', '{"phase":"s13","assistant":"intake"}'::jsonb),
    ('admin_explanation', 'Admin uitleg', 'Maak een begrijpelijke uitleg bij een rules-based smart decision.', 'minimal', '{"phase":"s13","assistant":"decision_explanation"}'::jsonb),
    ('parent_message_draft', 'Ouderbericht concept', 'Maak een bewerkbaar ouderbericht op basis van een menselijke beslissing of workflowstatus.', 'operational', '{"phase":"s13","assistant":"communication"}'::jsonb),
    ('progress_note_rewrite', 'Voortgangstekst herschrijven', 'Herschrijf ruwe instructeursnotities naar heldere oudervriendelijke tekst.', 'operational', '{"phase":"s13","assistant":"progress"}'::jsonb),
    ('report_insight', 'Rapportage inzicht', 'Vat rapportage- of exportcontext samen als managementinzicht.', 'minimal', '{"phase":"s13","assistant":"reporting"}'::jsonb),
    ('risk_signal_summary', 'Risicosignalen samenvatten', 'Bundel blokkades, mislukte acties en attention signals tot een admin actielijst.', 'minimal', '{"phase":"s13","assistant":"risk"}'::jsonb)
)
insert into public.tenant_ai_assistant_settings (
  tenant_id,
  capability,
  label,
  description,
  enabled,
  mode,
  provider,
  model,
  prompt_version,
  allowed_context_level,
  sensitive_data_review_status,
  metadata
)
select
  tenant.id,
  capability_defaults.capability,
  capability_defaults.label,
  capability_defaults.description,
  false,
  'suggestion_only',
  'openai',
  'gpt-4.1-mini',
  's13-v1',
  capability_defaults.allowed_context_level,
  'pending',
  capability_defaults.metadata
from public.tenants tenant
cross join capability_defaults
on conflict (tenant_id, capability) do update
  set label = excluded.label,
      description = excluded.description,
      metadata = public.tenant_ai_assistant_settings.metadata || excluded.metadata;

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
  'ai_assistant_layer',
  'AI assistant layer',
  'AI mag bewerkbare suggesties maken, maar nooit de bron van waarheid zijn.',
  false,
  'disabled',
  '{"phase":"s13","requires_sensitive_data_review":true}'::jsonb
from public.tenants tenant
on conflict (tenant_id, flag_key) do update
  set label = excluded.label,
      description = excluded.description,
      metadata = public.tenant_feature_flags.metadata || excluded.metadata;
