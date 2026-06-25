create table public.deployment_releases (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  deployment_target text,
  commit_sha text not null,
  version text,
  release_path text,
  github_run_id text not null default 'manual',
  github_run_number text,
  github_ref_name text,
  app_url text,
  tenant_domain_suffix text,
  status text not null default 'activated',
  health_status text not null default 'unknown',
  activated_at timestamptz,
  verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deployment_releases_environment_check check (environment in ('development', 'staging', 'production', 'test')),
  constraint deployment_releases_status_check check (status in ('activated', 'verified', 'failed', 'rolled_back')),
  constraint deployment_releases_health_status_check check (health_status in ('unknown', 'healthy', 'ready', 'degraded', 'failed')),
  constraint deployment_releases_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint deployment_releases_unique_run unique (environment, github_run_id, commit_sha)
);

create index deployment_releases_environment_created_idx
  on public.deployment_releases (environment, created_at desc);

create trigger deployment_releases_set_updated_at
  before update on public.deployment_releases
  for each row execute function app_private.set_updated_at();

grant select on public.deployment_releases to authenticated;
grant all on public.deployment_releases to service_role;

alter table public.deployment_releases enable row level security;

create policy "Platform staff can view deployment releases"
  on public.deployment_releases
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

create trigger deployment_releases_audit_events
  after insert or update or delete on public.deployment_releases
  for each row execute function app_private.record_audit_event();

insert into public.platform_integration_statuses (
  integration_key,
  category,
  label,
  status,
  mode,
  endpoint_label,
  metadata
)
values
  ('structured-log-sink', 'observability', 'Structured log sink', 'warning', 'global', 'OBSERVABILITY_LOG_SINK_URL', '{"required_env":["OBSERVABILITY_LOG_SINK_URL"],"optional_env":["OBSERVABILITY_LOG_SINK_TOKEN","OBSERVABILITY_LOG_SINK_PROVIDER"]}'::jsonb),
  ('error-reporting', 'observability', 'Error reporting', 'warning', 'global', 'ERROR_REPORTING_URL', '{"required_env":["ERROR_REPORTING_URL"],"optional_env":["ERROR_REPORTING_TOKEN","ERROR_REPORTING_PROVIDER"]}'::jsonb),
  ('uptime-ready-checks', 'observability', 'Uptime en ready checks', 'ready', 'global', '/api/health,/api/health/ready', '{"monitor_paths":["/api/health","/api/health/ready"]}'::jsonb),
  ('deployment-release-metadata', 'deployment', 'Deployment release metadata', 'ready', 'global', 'deployment_releases', '{"source":"github_runner"}'::jsonb)
on conflict (integration_key) do update
  set category = excluded.category,
      label = excluded.label,
      status = excluded.status,
      mode = excluded.mode,
      endpoint_label = excluded.endpoint_label,
      metadata = public.platform_integration_statuses.metadata || excluded.metadata;
