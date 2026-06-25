create table if not exists public.platform_settings (
  id text primary key default 'global',
  platform_name text not null default 'NXTTRACK',
  default_locale text not null default 'nl-NL',
  default_timezone text not null default 'Europe/Amsterdam',
  support_email text,
  tenant_domain_suffix text,
  staging_domain text,
  production_domain text,
  maintenance_mode boolean not null default false,
  signup_mode text not null default 'invite_only',
  release_channel text not null default 'staging',
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton_check check (id = 'global'),
  constraint platform_settings_signup_mode_check check (signup_mode in ('invite_only', 'request_access', 'open')),
  constraint platform_settings_release_channel_check check (release_channel in ('staging', 'production', 'maintenance')),
  constraint platform_settings_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint platform_settings_support_email_check check (support_email is null or position('@' in support_email) > 1)
);

create table public.sector_templates (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  code text not null,
  name text not null,
  description text,
  status text not null default 'draft',
  default_locale text not null default 'nl-NL',
  terminology jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  onboarding_checklist jsonb not null default '[]'::jsonb,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sector_templates_sector_check check (sector in ('swim_school', 'football_school', 'sports_club', 'martial_arts_school', 'dance_school', 'generic_lessons')),
  constraint sector_templates_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sector_templates_status_check check (status in ('draft', 'active', 'archived')),
  constraint sector_templates_terminology_check check (jsonb_typeof(terminology) = 'object'),
  constraint sector_templates_feature_flags_check check (jsonb_typeof(feature_flags) = 'object'),
  constraint sector_templates_onboarding_checklist_check check (jsonb_typeof(onboarding_checklist) = 'array'),
  constraint sector_templates_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint sector_templates_unique_code unique (sector, code)
);

create table public.platform_integration_statuses (
  id uuid primary key default gen_random_uuid(),
  integration_key text not null unique,
  category text not null,
  label text not null,
  status text not null default 'unknown',
  mode text not null default 'staging',
  endpoint_label text,
  last_checked_at timestamptz,
  last_error text,
  runbook_url text,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_integration_statuses_category_check check (category in ('email', 'payments', 'storage', 'deployment', 'database', 'domains', 'observability')),
  constraint platform_integration_statuses_status_check check (status in ('unknown', 'ready', 'warning', 'incident', 'disabled')),
  constraint platform_integration_statuses_mode_check check (mode in ('staging', 'production', 'global')),
  constraint platform_integration_statuses_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index platform_integration_statuses_category_idx
  on public.platform_integration_statuses (category, status, updated_at desc);

create index sector_templates_sector_status_idx
  on public.sector_templates (sector, status, updated_at desc);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function app_private.set_updated_at();

create trigger sector_templates_set_updated_at
  before update on public.sector_templates
  for each row execute function app_private.set_updated_at();

create trigger platform_integration_statuses_set_updated_at
  before update on public.platform_integration_statuses
  for each row execute function app_private.set_updated_at();

grant select on public.platform_settings to authenticated;
grant select on public.sector_templates to authenticated;
grant select on public.platform_integration_statuses to authenticated;
grant all on public.platform_settings to service_role;
grant all on public.sector_templates to service_role;
grant all on public.platform_integration_statuses to service_role;

alter table public.platform_settings enable row level security;
alter table public.sector_templates enable row level security;
alter table public.platform_integration_statuses enable row level security;

create policy "Platform staff can view platform settings"
  on public.platform_settings
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

create policy "Platform staff can view sector templates"
  on public.sector_templates
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

create policy "Platform staff can view integration statuses"
  on public.platform_integration_statuses
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

create trigger platform_settings_audit_events
  after insert or update or delete on public.platform_settings
  for each row execute function app_private.record_audit_event();

create trigger sector_templates_audit_events
  after insert or update or delete on public.sector_templates
  for each row execute function app_private.record_audit_event();

create trigger platform_integration_statuses_audit_events
  after insert or update or delete on public.platform_integration_statuses
  for each row execute function app_private.record_audit_event();

do $$
declare
  platform_settings_id_type text;
begin
  select udt_name into platform_settings_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'platform_settings'
    and column_name = 'id';

  if exists (select 1 from public.platform_settings) then
    return;
  end if;

  if platform_settings_id_type = 'uuid' then
    insert into public.platform_settings (
      id,
      platform_name,
      default_locale,
      default_timezone,
      support_email,
      tenant_domain_suffix,
      staging_domain,
      production_domain,
      release_channel,
      metadata
    )
    values (
      '00000000-0000-0000-0000-000000000001'::uuid,
      'NXTTRACK',
      'nl-NL',
      'Europe/Amsterdam',
      'support@nxttrack.nl',
      'staging.nxttrack.nl',
      'staging.nxttrack.nl',
      'nxttrack.nl',
      'staging',
      '{"source":"platform_admin_completion"}'::jsonb
    );
  else
    insert into public.platform_settings (
      id,
      platform_name,
      default_locale,
      default_timezone,
      support_email,
      tenant_domain_suffix,
      staging_domain,
      production_domain,
      release_channel,
      metadata
    )
    values (
      'global',
      'NXTTRACK',
      'nl-NL',
      'Europe/Amsterdam',
      'support@nxttrack.nl',
      'staging.nxttrack.nl',
      'staging.nxttrack.nl',
      'nxttrack.nl',
      'staging',
      '{"source":"platform_admin_completion"}'::jsonb
    );
  end if;
end $$;

insert into public.sector_templates (
  sector,
  code,
  name,
  description,
  status,
  terminology,
  feature_flags,
  onboarding_checklist,
  metadata
)
values
  (
    'swim_school',
    'swim-start',
    'Swim Start',
    'Basisconfiguratie voor zwemscholen: programma, intake, lessen, voortgang, betalingen en documenten.',
    'active',
    '{"participant":"leerling","guardian":"ouder/verzorger","instructor":"instructeur","group":"groep","session":"zwemles","stage":"badje/niveau"}'::jsonb,
    '{"public_site":true,"intake":true,"waitlist":true,"parent_portal":true,"instructor_portal":true,"manual_payments":true}'::jsonb,
    '["Branding instellen","Programmas controleren","Groepen en resources aanmaken","SMTP testen","Demo intake uitvoeren"]'::jsonb,
    '{"commercial_focus":"zwemscholen"}'::jsonb
  ),
  (
    'football_school',
    'football-foundation',
    'Football Foundation',
    'Voorbereide template voor voetbalscholen, zonder swim-only kernmodellen.',
    'draft',
    '{"participant":"speler","guardian":"ouder/verzorger","instructor":"trainer","group":"team/groep","session":"training","stage":"niveau"}'::jsonb,
    '{"public_site":true,"intake":true,"waitlist":true,"parent_portal":true,"instructor_portal":true,"manual_payments":true}'::jsonb,
    '["Sectorlabels controleren","Locaties/velden inrichten","Programmas bepalen"]'::jsonb,
    '{}'::jsonb
  ),
  (
    'generic_lessons',
    'generic-lessons',
    'Generic Lessons',
    'Neutrale sector-template voor les- en trainingsorganisaties.',
    'draft',
    '{"participant":"deelnemer","guardian":"contactpersoon","instructor":"begeleider","group":"groep","session":"les","stage":"niveau"}'::jsonb,
    '{"public_site":true,"intake":true,"waitlist":true,"parent_portal":true,"instructor_portal":true,"manual_payments":true}'::jsonb,
    '["Terminologie kiezen","Aanbod configureren","Public site publiceren"]'::jsonb,
    '{}'::jsonb
  )
on conflict (sector, code) do nothing;

insert into public.platform_integration_statuses (
  integration_key,
  category,
  label,
  status,
  mode,
  endpoint_label,
  runbook_url,
  metadata
)
values
  ('smtp-global', 'email', 'Globale SMTP', 'warning', 'global', 'platform_smtp_settings', null, '{"owner":"platform"}'::jsonb),
  ('sendgrid-adapter', 'email', 'SendGrid adapter', 'warning', 'global', 'SENDGRID_API_KEY', null, '{"activation":"after_smtp_stable"}'::jsonb),
  ('supabase-db', 'database', 'Supabase database', 'ready', 'staging', 'NEXT_PUBLIC_SUPABASE_URL', null, '{}'::jsonb),
  ('tenant-domains', 'domains', 'Tenant domeinen', 'warning', 'staging', 'tenant_domains', null, '{"checks":"manual_dns"}'::jsonb),
  ('mollie-adapter', 'payments', 'Mollie/iDEAL adapter', 'disabled', 'global', 'MOLLIE_API_KEY', null, '{"activation":"manual_payments_first"}'::jsonb),
  ('github-runner', 'deployment', 'GitHub runner', 'ready', 'staging', 'Deploy NXTTRACK', null, '{}'::jsonb),
  ('caddy-systemd', 'deployment', 'Caddy/systemd VPS', 'ready', 'staging', 'staging.nxttrack.nl', null, '{}'::jsonb),
  ('observability', 'observability', 'Logging en health checks', 'warning', 'staging', '/api/health/ready', null, '{}'::jsonb)
on conflict (integration_key) do nothing;
