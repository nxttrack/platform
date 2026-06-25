alter table public.intake_form_configs
  add column if not exists config_version integer not null default 1,
  add column if not exists schema_version text not null default 's1',
  add column if not exists conditional_rules jsonb not null default '[]'::jsonb,
  add column if not exists stage_recommendation_rules jsonb not null default '[]'::jsonb,
  add column if not exists published_at timestamptz;

alter table public.intake_form_configs
  drop constraint if exists intake_form_configs_version_check,
  add constraint intake_form_configs_version_check check (config_version > 0);

alter table public.intake_form_configs
  drop constraint if exists intake_form_configs_schema_version_check,
  add constraint intake_form_configs_schema_version_check check (schema_version in ('s1'));

alter table public.intake_form_configs
  drop constraint if exists intake_form_configs_conditional_rules_check,
  add constraint intake_form_configs_conditional_rules_check check (jsonb_typeof(conditional_rules) = 'array');

alter table public.intake_form_configs
  drop constraint if exists intake_form_configs_stage_rules_check,
  add constraint intake_form_configs_stage_rules_check check (jsonb_typeof(stage_recommendation_rules) = 'array');

alter table public.intake_submissions
  add column if not exists intake_config_version integer,
  add column if not exists recommendation_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists duplicate_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists missing_information text[] not null default '{}'::text[],
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists review_note text;

alter table public.intake_submissions
  drop constraint if exists intake_submissions_config_version_check,
  add constraint intake_submissions_config_version_check check (intake_config_version is null or intake_config_version > 0);

alter table public.intake_submissions
  drop constraint if exists intake_submissions_recommendation_snapshot_check,
  add constraint intake_submissions_recommendation_snapshot_check check (jsonb_typeof(recommendation_snapshot) = 'object');

alter table public.intake_submissions
  drop constraint if exists intake_submissions_duplicate_snapshot_check,
  add constraint intake_submissions_duplicate_snapshot_check check (jsonb_typeof(duplicate_snapshot) = 'object');

create table if not exists public.intake_duplicate_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid not null references public.intake_submissions (id) on delete cascade,
  matched_record_type text not null,
  matched_record_id uuid,
  match_type text not null,
  severity text not null default 'warning',
  score numeric(6,2) not null default 0,
  label text not null,
  detail text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_duplicate_matches_type_check check (matched_record_type in ('participant', 'intake_submission', 'guardian', 'enrollment')),
  constraint intake_duplicate_matches_match_check check (match_type in ('same_child_birthdate', 'same_guardian_email', 'similar_child_name', 'active_enrollment')),
  constraint intake_duplicate_matches_severity_check check (severity in ('info', 'warning', 'blocking')),
  constraint intake_duplicate_matches_score_check check (score >= 0 and score <= 100),
  constraint intake_duplicate_matches_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint intake_duplicate_matches_status_check check (status in ('open', 'ignored', 'merged', 'resolved')),
  constraint intake_duplicate_matches_submission_tenant_fk foreign key (intake_submission_id, tenant_id) references public.intake_submissions (id, tenant_id) on delete cascade,
  constraint intake_duplicate_matches_unique_match unique (tenant_id, intake_submission_id, matched_record_type, matched_record_id, match_type)
);

create index if not exists intake_form_configs_program_version_idx
  on public.intake_form_configs (tenant_id, program_id, config_version desc);

create index if not exists intake_duplicate_matches_submission_idx
  on public.intake_duplicate_matches (tenant_id, intake_submission_id, status);

create index if not exists intake_duplicate_matches_severity_idx
  on public.intake_duplicate_matches (tenant_id, severity, status);

drop trigger if exists intake_duplicate_matches_set_updated_at on public.intake_duplicate_matches;
create trigger intake_duplicate_matches_set_updated_at
  before update on public.intake_duplicate_matches
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.intake_duplicate_matches to authenticated;
grant all on public.intake_duplicate_matches to service_role;

alter table public.intake_duplicate_matches enable row level security;

drop policy if exists "Tenant staff can view intake duplicate matches" on public.intake_duplicate_matches;
create policy "Tenant staff can view intake duplicate matches"
  on public.intake_duplicate_matches
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can create intake duplicate matches" on public.intake_duplicate_matches;
create policy "Tenant staff can create intake duplicate matches"
  on public.intake_duplicate_matches
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update intake duplicate matches" on public.intake_duplicate_matches;
create policy "Tenant staff can update intake duplicate matches"
  on public.intake_duplicate_matches
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

drop trigger if exists intake_duplicate_matches_audit_events on public.intake_duplicate_matches;
create trigger intake_duplicate_matches_audit_events
  after insert or update or delete on public.intake_duplicate_matches
  for each row execute function app_private.record_audit_event();

update public.intake_form_configs
set published_at = coalesce(published_at, now())
where status = 'active';

do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  select id into diploma_a_program_id
  from public.programs
  where tenant_id = demo_tenant_id
    and code = 'zwemdiploma-a';

  if diploma_a_program_id is null then
    return;
  end if;

  update public.intake_form_configs
  set config_version = greatest(config_version, 2),
      schema_version = 's1',
      published_at = coalesce(published_at, now()),
      custom_questions = '[
        {
          "name": "zwemervaring",
          "label": "Hoeveel zwemervaring heeft je kind?",
          "type": "swim_experience_scale",
          "required": true,
          "helpText": "Dit helpt ons om een startniveau te adviseren."
        },
        {
          "name": "watervrij",
          "label": "Is je kind watervrij?",
          "type": "yes_no",
          "required": true
        },
        {
          "name": "zonder_bandjes",
          "label": "Kan je kind al kort zonder bandjes drijven of bewegen?",
          "type": "yes_no",
          "required": false,
          "condition": {
            "question": "watervrij",
            "operator": "equals",
            "value": "yes"
          }
        },
        {
          "name": "eerdere_lessen",
          "label": "Heeft je kind eerder zwemles gehad?",
          "type": "single_select",
          "required": true,
          "options": [
            { "label": "Nee, nog niet", "value": "none" },
            { "label": "Ja, enkele lessen", "value": "some" },
            { "label": "Ja, langere periode", "value": "longer" }
          ]
        },
        {
          "name": "aandachtspunten",
          "label": "Zijn er aandachtspunten waar de instructeur rekening mee moet houden?",
          "type": "free_text",
          "required": false
        },
        {
          "name": "toestemming_contact",
          "label": "Ik geef toestemming dat de zwemschool contact opneemt over deze intake.",
          "type": "consent",
          "required": true
        }
      ]'::jsonb,
      conditional_rules = '[
        {
          "target": "zonder_bandjes",
          "question": "watervrij",
          "operator": "equals",
          "value": "yes"
        }
      ]'::jsonb,
      stage_recommendation_rules = '[
        {
          "stage_code": "badje-1",
          "label": "Start in Badje 1",
          "base_score": 55,
          "conditions": [
            { "question": "zwemervaring", "operator": "equals", "value": "none", "points": 20, "reason": "Geen zwemervaring ingevuld." },
            { "question": "watervrij", "operator": "equals", "value": "no", "points": 15, "reason": "Watervrijheid vraagt begeleiding vanaf de basis." }
          ]
        },
        {
          "stage_code": "badje-2",
          "label": "Mogelijk Badje 2",
          "base_score": 50,
          "conditions": [
            { "question": "zwemervaring", "operator": "in", "value": ["some", "longer"], "points": 20, "reason": "Er is al zwemervaring." },
            { "question": "watervrij", "operator": "equals", "value": "yes", "points": 15, "reason": "Watervrijheid is positief voor instroom." }
          ]
        },
        {
          "stage_code": "badje-3",
          "label": "Handmatige check voor Badje 3",
          "base_score": 40,
          "conditions": [
            { "question": "zwemervaring", "operator": "equals", "value": "longer", "points": 25, "reason": "Langere zwemleservaring opgegeven." },
            { "question": "zonder_bandjes", "operator": "equals", "value": "yes", "points": 15, "reason": "Kan al kort zonder bandjes bewegen." }
          ]
        }
      ]'::jsonb
  where tenant_id = demo_tenant_id
    and program_id = diploma_a_program_id;
end $$;
