-- Platform-wide service evidence and explainable tenant health.

create table public.platform_service_heartbeats (
  id uuid primary key default gen_random_uuid(),
  service_key text not null,
  environment text not null,
  status text not null,
  detail text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  commit_sha text,
  checked_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_service_heartbeats_key_check check (service_key ~ '^[a-z0-9_]{3,80}$'),
  constraint platform_service_heartbeats_environment_check check (environment in ('development', 'staging', 'production')),
  constraint platform_service_heartbeats_status_check check (status in ('pass', 'degraded', 'fail')),
  constraint platform_service_heartbeats_detail_check check (length(trim(detail)) between 3 and 500),
  constraint platform_service_heartbeats_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint platform_service_heartbeats_time_check check (checked_at <= expires_at),
  constraint platform_service_heartbeats_scope_unique unique (environment, service_key)
);

create table public.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  title text not null,
  summary text not null,
  severity text not null,
  status text not null default 'open',
  source text not null default 'manual',
  created_by_user_id uuid references auth.users (id) on delete set null,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_incidents_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint platform_incidents_status_check check (status in ('open', 'monitoring', 'resolved')),
  constraint platform_incidents_source_check check (source in ('manual', 'monitor', 'customer_support', 'security')),
  constraint platform_incidents_resolution_check check (
    (status = 'resolved' and resolved_by_user_id is not null and resolved_at is not null)
    or (status <> 'resolved' and resolved_by_user_id is null and resolved_at is null)
  ),
  constraint platform_incidents_title_check check (length(trim(title)) between 3 and 160),
  constraint platform_incidents_summary_check check (length(trim(summary)) between 3 and 2000),
  constraint platform_incidents_tenant_id_id_unique unique (tenant_id, id)
);

create index platform_heartbeats_status_idx on public.platform_service_heartbeats (environment, status, expires_at);
create index platform_incidents_status_idx on public.platform_incidents (status, severity, opened_at desc);
create index platform_incidents_tenant_idx on public.platform_incidents (tenant_id, status, opened_at desc);

create trigger platform_service_heartbeats_set_updated_at
  before update on public.platform_service_heartbeats
  for each row execute function app_private.set_updated_at();
create trigger platform_incidents_set_updated_at
  before update on public.platform_incidents
  for each row execute function app_private.set_updated_at();

alter table public.platform_admin_audit_events
  drop constraint if exists platform_admin_audit_subject_type_check;
alter table public.platform_admin_audit_events
  add constraint platform_admin_audit_subject_type_check
  check (subject_type in ('tenant', 'tenant_domain', 'tenant_membership', 'auth_invitation', 'auth_user', 'platform_incident'));

grant select on public.platform_service_heartbeats to authenticated;
grant select, insert, update on public.platform_incidents to authenticated;
grant all on public.platform_service_heartbeats to service_role;
grant all on public.platform_incidents to service_role;

alter table public.platform_service_heartbeats enable row level security;
alter table public.platform_service_heartbeats force row level security;
alter table public.platform_incidents enable row level security;
alter table public.platform_incidents force row level security;

create policy "Platform staff view service health"
  on public.platform_service_heartbeats for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform staff view incidents"
  on public.platform_incidents for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
create policy "Platform administrators create incidents"
  on public.platform_incidents for insert to authenticated
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform administrators update incidents"
  on public.platform_incidents for update to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

comment on table public.platform_service_heartbeats is
  'Latest service evidence per environment. Writes are service-role only; UI users cannot manufacture healthy state.';
comment on table public.platform_incidents is
  'Auditable platform or tenant incident register used by the customer-success health cockpit.';
