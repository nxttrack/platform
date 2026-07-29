-- Package and entitlement control plane.
-- Commercial evaluation is deliberately shadow-only: it can measure and explain,
-- but it cannot deny access. Turning enforcement on requires a future reviewed migration.

create table public.platform_release_flags (
  key text primary key,
  name text not null,
  description text not null,
  category text not null,
  rollout_state text not null default 'enabled',
  owner_team text not null default 'platform',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_release_flags_key_check check (key ~ '^[a-z0-9_]{3,80}$'),
  constraint platform_release_flags_name_check check (length(trim(name)) between 3 and 120),
  constraint platform_release_flags_description_check check (length(trim(description)) between 10 and 500),
  constraint platform_release_flags_category_check check (category in ('core', 'operations', 'engagement', 'insights', 'governance')),
  constraint platform_release_flags_state_check check (rollout_state in ('disabled', 'shadow', 'enabled'))
);

create table public.platform_commercial_features (
  key text primary key,
  name text not null,
  description text not null,
  category text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_commercial_features_key_check check (key ~ '^[a-z0-9_]{3,80}$'),
  constraint platform_commercial_features_name_check check (length(trim(name)) between 3 and 120),
  constraint platform_commercial_features_description_check check (length(trim(description)) between 10 and 500),
  constraint platform_commercial_features_category_check check (category in ('core', 'operations', 'engagement', 'insights', 'governance')),
  constraint platform_commercial_features_status_check check (status in ('active', 'retired'))
);

create table public.platform_package_catalog (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null,
  status text not null default 'draft',
  is_legacy_full_access boolean not null default false,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_package_catalog_key_check check (key ~ '^[a-z0-9_]{3,80}$'),
  constraint platform_package_catalog_name_check check (length(trim(name)) between 3 and 120),
  constraint platform_package_catalog_description_check check (length(trim(description)) between 10 and 500),
  constraint platform_package_catalog_status_check check (status in ('draft', 'active', 'archived')),
  constraint platform_package_catalog_legacy_check check (not is_legacy_full_access or status = 'active')
);

create unique index platform_package_catalog_one_legacy_idx
  on public.platform_package_catalog (is_legacy_full_access)
  where is_legacy_full_access;

create table public.platform_package_entitlements (
  package_id uuid not null references public.platform_package_catalog (id) on delete cascade,
  feature_key text not null references public.platform_commercial_features (key) on delete restrict,
  included_in_simulation boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (package_id, feature_key),
  constraint platform_package_entitlements_settings_check check (jsonb_typeof(settings_json) = 'object')
);

create table public.platform_package_limits (
  package_id uuid not null references public.platform_package_catalog (id) on delete cascade,
  metric_key text not null,
  soft_limit bigint not null,
  unit text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (package_id, metric_key),
  constraint platform_package_limits_metric_check check (metric_key in ('active_participants', 'active_staff', 'locations', 'private_storage_gb')),
  constraint platform_package_limits_value_check check (soft_limit > 0),
  constraint platform_package_limits_unit_check check (unit in ('count', 'gigabytes'))
);

create table public.tenant_package_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  package_id uuid not null references public.platform_package_catalog (id) on delete restrict,
  evaluation_mode text not null default 'shadow',
  assigned_by_user_id uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_package_assignments_shadow_only_check check (evaluation_mode = 'shadow')
);

create index tenant_package_assignments_package_idx
  on public.tenant_package_assignments (package_id, assigned_at desc);

create trigger platform_release_flags_set_updated_at
  before update on public.platform_release_flags
  for each row execute function app_private.set_updated_at();
create trigger platform_commercial_features_set_updated_at
  before update on public.platform_commercial_features
  for each row execute function app_private.set_updated_at();
create trigger platform_package_catalog_set_updated_at
  before update on public.platform_package_catalog
  for each row execute function app_private.set_updated_at();
create trigger platform_package_entitlements_set_updated_at
  before update on public.platform_package_entitlements
  for each row execute function app_private.set_updated_at();
create trigger platform_package_limits_set_updated_at
  before update on public.platform_package_limits
  for each row execute function app_private.set_updated_at();
create trigger tenant_package_assignments_set_updated_at
  before update on public.tenant_package_assignments
  for each row execute function app_private.set_updated_at();

insert into public.platform_release_flags (key, name, description, category, rollout_state)
values
  ('premium_backoffice', 'Premium backoffice', 'Technische release-indicator voor de vernieuwde tenant backoffice.', 'core', 'enabled'),
  ('premium_control_plane', 'Premium control plane', 'Technische release-indicator voor het platform command center.', 'governance', 'enabled'),
  ('safe_internal_jobs', 'Veilige interne jobs', 'Technische indicator voor door CRON_SECRET afgeschermde achtergrondtaken.', 'operations', 'enabled'),
  ('web_push_delivery', 'Web-push delivery', 'Technische indicator voor opt-in web-push wanneer VAPID is geconfigureerd.', 'engagement', 'shadow');

insert into public.platform_commercial_features (key, name, description, category)
values
  ('core_backoffice', 'Kernbackoffice', 'Leerlingen, groepen, planning, medewerkers en tenantbeheer.', 'core'),
  ('communication_hub', 'Communicatiehub', 'Berichten, notificaties, nieuwsbrieven en communicatietemplates.', 'engagement'),
  ('premium_badges', 'Badges & zwempaspoort', 'Badgestudio, badgeboek, diploma- en voortgangsmomenten.', 'engagement'),
  ('crm_pipeline', 'CRM-pipeline', 'Leads, contacttijdlijn, SLA, herkomst en conversie-inzichten.', 'engagement'),
  ('website_cms', 'Website Studio', 'Gecontroleerde websitesecties, media, preview en versiegeschiedenis.', 'engagement'),
  ('feedback_nps', 'Feedback & NPS', 'Veilige feedbackcampagnes en uitlegbare signalen.', 'engagement'),
  ('web_push', 'Web-push', 'Expliciete opt-in pushnotificaties voor operationele updates.', 'engagement'),
  ('empty_seat_recovery', 'Empty Seat Recovery', 'Uitlegbare kandidaten voor vrijgekomen lescapaciteit.', 'operations'),
  ('daily_cockpit', 'Dagelijkse cockpit', 'Dagprioriteiten en operationele uitzonderingen in één cockpit.', 'operations'),
  ('instructor_replacement', 'Vervangingsassistent', 'Veilige en uitlegbare instructeurvervanging met bevestiging.', 'operations'),
  ('retention_signals', 'Persoonlijke aandacht', 'Niet-nadelige signalen voor persoonlijk opvolgen en behoud.', 'operations'),
  ('lesson_plans', 'Lesplanassistent', 'Rule-based lesdoelen, oefeningen en aandachtspunten.', 'operations'),
  ('automation_recipes', 'Automation recipes', 'Veilige conceptacties en uitlegbare recipe-runs.', 'operations'),
  ('media_timeline', 'Media-tijdlijn', 'Consent-gebonden voortgangsmedia met expiry en inzagelog.', 'governance'),
  ('audit_explorer', 'Audit Explorer', 'Doorzoekbare en geredigeerde wijzigingshistorie.', 'governance'),
  ('growth_analytics', 'Growth analytics', 'Campagne-, conversie-, cohort- en capaciteitsanalyse.', 'insights'),
  ('capacity_forecast', 'Capaciteitsforecast', 'Uitlegbare capaciteitsvoorspelling voor vier tot twaalf weken.', 'insights'),
  ('management_briefs', 'Management briefs', 'Rule-based wekelijkse managementsamenvattingen als concept.', 'insights');

insert into public.platform_package_catalog (
  key,
  name,
  description,
  status,
  is_legacy_full_access
)
values (
  'legacy_full_access',
  'Volledige toegang',
  'Veilige standaard voor alle bestaande en nieuwe tenants zolang pakketkeuzes alleen worden gesimuleerd.',
  'active',
  true
);

insert into public.platform_package_entitlements (package_id, feature_key, included_in_simulation)
select package.id, feature.key, true
from public.platform_package_catalog package
cross join public.platform_commercial_features feature
where package.key = 'legacy_full_access';

insert into public.tenant_package_assignments (tenant_id, package_id, evaluation_mode)
select tenant.id, package.id, 'shadow'
from public.tenants tenant
cross join public.platform_package_catalog package
where package.key = 'legacy_full_access'
on conflict (tenant_id) do nothing;

create function app_private.assign_default_shadow_package()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  default_package_id uuid;
begin
  select package.id
    into default_package_id
  from public.platform_package_catalog package
  where package.is_legacy_full_access
  limit 1;

  if default_package_id is not null then
    insert into public.tenant_package_assignments (
      tenant_id,
      package_id,
      evaluation_mode
    )
    values (new.id, default_package_id, 'shadow')
    on conflict (tenant_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger tenants_assign_default_shadow_package
  after insert on public.tenants
  for each row execute function app_private.assign_default_shadow_package();

create function app_private.replace_shadow_package_configuration(
  target_package_id uuid,
  target_entitlements jsonb,
  target_limits jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if jsonb_typeof(target_entitlements) <> 'object'
     or jsonb_typeof(target_limits) <> 'object' then
    raise exception 'Package configuration must be JSON objects';
  end if;

  if not exists (
    select 1
    from public.platform_package_catalog package
    where package.id = target_package_id
      and package.status = 'draft'
      and not package.is_legacy_full_access
  ) then
    raise exception 'Only draft simulation packages are editable';
  end if;

  delete from public.platform_package_entitlements
  where package_id = target_package_id;

  insert into public.platform_package_entitlements (
    package_id,
    feature_key,
    included_in_simulation
  )
  select
    target_package_id,
    feature.key,
    coalesce((target_entitlements ->> feature.key)::boolean, false)
  from public.platform_commercial_features feature
  where feature.status = 'active';

  delete from public.platform_package_limits
  where package_id = target_package_id;

  insert into public.platform_package_limits (
    package_id,
    metric_key,
    soft_limit,
    unit
  )
  select
    target_package_id,
    metric.key,
    (target_limits ->> metric.key)::bigint,
    case when metric.key = 'private_storage_gb' then 'gigabytes' else 'count' end
  from (
    values
      ('active_participants'),
      ('active_staff'),
      ('locations'),
      ('private_storage_gb')
  ) as metric(key)
  where target_limits ? metric.key
    and (target_limits ->> metric.key)::bigint > 0;
end;
$$;

revoke all on function app_private.assign_default_shadow_package() from public, anon, authenticated;
revoke all on function app_private.replace_shadow_package_configuration(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function app_private.assign_default_shadow_package() to service_role;
grant execute on function app_private.replace_shadow_package_configuration(uuid, jsonb, jsonb) to service_role;

grant select on public.platform_release_flags to authenticated;
grant select on public.platform_commercial_features to authenticated;
grant select on public.platform_package_catalog to authenticated;
grant select on public.platform_package_entitlements to authenticated;
grant select on public.platform_package_limits to authenticated;
grant select on public.tenant_package_assignments to authenticated;

grant all on public.platform_release_flags to service_role;
grant all on public.platform_commercial_features to service_role;
grant all on public.platform_package_catalog to service_role;
grant all on public.platform_package_entitlements to service_role;
grant all on public.platform_package_limits to service_role;
grant all on public.tenant_package_assignments to service_role;

alter table public.platform_release_flags enable row level security;
alter table public.platform_commercial_features enable row level security;
alter table public.platform_package_catalog enable row level security;
alter table public.platform_package_entitlements enable row level security;
alter table public.platform_package_limits enable row level security;
alter table public.tenant_package_assignments enable row level security;

alter table public.platform_release_flags force row level security;
alter table public.platform_commercial_features force row level security;
alter table public.platform_package_catalog force row level security;
alter table public.platform_package_entitlements force row level security;
alter table public.platform_package_limits force row level security;
alter table public.tenant_package_assignments force row level security;

create policy platform_release_flags_platform_read
  on public.platform_release_flags for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy platform_commercial_features_platform_read
  on public.platform_commercial_features for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy platform_package_catalog_platform_read
  on public.platform_package_catalog for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy platform_package_entitlements_platform_read
  on public.platform_package_entitlements for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy platform_package_limits_platform_read
  on public.platform_package_limits for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy tenant_package_assignments_platform_read
  on public.tenant_package_assignments for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

alter table public.platform_admin_audit_events
  drop constraint if exists platform_admin_audit_subject_type_check;
alter table public.platform_admin_audit_events
  add constraint platform_admin_audit_subject_type_check
  check (
    subject_type in (
      'tenant',
      'tenant_domain',
      'tenant_membership',
      'auth_invitation',
      'auth_user',
      'platform_incident',
      'support_access',
      'package_config',
      'tenant_package_assignment'
    )
  );

comment on table public.platform_release_flags is
  'Technical rollout inventory, kept strictly separate from commercial package entitlement simulation.';
comment on table public.platform_package_catalog is
  'Neutral package catalog without prices. Packages remain simulation inputs until a future reviewed enforcement migration.';
comment on table public.tenant_package_assignments is
  'Shadow-only package assignment. The database constraint prevents these rows from being used as an enforcement mode.';
comment on function app_private.replace_shadow_package_configuration(uuid, jsonb, jsonb) is
  'Atomically replaces the simulation entitlements and soft limits for an editable draft package.';
