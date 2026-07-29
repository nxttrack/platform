-- Governance foundation: two-party, time-limited support access and
-- cross-device dashboard composition.

create table public.platform_support_access_grants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  requested_by_user_id uuid not null references auth.users (id) on delete restrict,
  approved_by_user_id uuid references auth.users (id) on delete set null,
  revoked_by_user_id uuid references auth.users (id) on delete set null,
  reason text not null,
  scope text not null default 'diagnostics_read_only',
  status text not null default 'requested',
  duration_minutes integer not null default 60,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  active_until timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_support_access_reason_check check (length(trim(reason)) between 10 and 1000),
  constraint platform_support_access_scope_check check (scope in ('diagnostics_read_only')),
  constraint platform_support_access_status_check check (status in ('requested', 'active', 'denied', 'revoked', 'expired')),
  constraint platform_support_access_duration_check check (duration_minutes between 15 and 120),
  constraint platform_support_access_activation_check check (
    (status = 'active' and approved_by_user_id is not null and approved_at is not null and active_until is not null)
    or status <> 'active'
  ),
  constraint platform_support_access_revocation_check check (
    (status = 'revoked' and revoked_by_user_id is not null and revoked_at is not null)
    or status <> 'revoked'
  ),
  constraint platform_support_access_tenant_id_id_unique unique (tenant_id, id)
);

create unique index platform_support_one_pending_idx
  on public.platform_support_access_grants (tenant_id, requested_by_user_id)
  where status in ('requested', 'active');
create index platform_support_access_active_idx
  on public.platform_support_access_grants (tenant_id, status, active_until desc);

create table public.dashboard_widget_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dashboard_key text not null,
  widget_key text not null,
  position integer not null,
  width text not null default 'medium',
  visible boolean not null default true,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_widget_preferences_dashboard_check check (dashboard_key ~ '^[a-z0-9_]{3,80}$'),
  constraint dashboard_widget_preferences_widget_check check (widget_key ~ '^[a-z0-9_]{3,80}$'),
  constraint dashboard_widget_preferences_position_check check (position between 0 and 100),
  constraint dashboard_widget_preferences_width_check check (width in ('small', 'medium', 'large', 'full')),
  constraint dashboard_widget_preferences_settings_check check (jsonb_typeof(settings_json) = 'object' and octet_length(settings_json::text) <= 8192),
  constraint dashboard_widget_preferences_scope_unique unique nulls not distinct (tenant_id, user_id, dashboard_key, widget_key)
);

create trigger platform_support_access_grants_set_updated_at
  before update on public.platform_support_access_grants
  for each row execute function app_private.set_updated_at();
create trigger dashboard_widget_preferences_set_updated_at
  before update on public.dashboard_widget_preferences
  for each row execute function app_private.set_updated_at();

alter table public.platform_admin_audit_events
  drop constraint if exists platform_admin_audit_subject_type_check;
alter table public.platform_admin_audit_events
  add constraint platform_admin_audit_subject_type_check
  check (subject_type in ('tenant', 'tenant_domain', 'tenant_membership', 'auth_invitation', 'auth_user', 'platform_incident', 'support_access'));

grant select on public.platform_support_access_grants to authenticated;
grant select, insert, update, delete on public.dashboard_widget_preferences to authenticated;
grant all on public.platform_support_access_grants to service_role;
grant all on public.dashboard_widget_preferences to service_role;

alter table public.platform_support_access_grants enable row level security;
alter table public.platform_support_access_grants force row level security;
alter table public.dashboard_widget_preferences enable row level security;
alter table public.dashboard_widget_preferences force row level security;

create policy "Authorized staff view support access"
  on public.platform_support_access_grants for select to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );
create policy "Users manage own dashboard widgets"
  on public.dashboard_widget_preferences for all to authenticated
  using (
    user_id = auth.uid()
    and (
      tenant_id is null
      or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent'])
    )
  )
  with check (
    user_id = auth.uid()
    and (
      tenant_id is null
      or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'instructor', 'parent'])
    )
  );

comment on table public.platform_support_access_grants is
  'Two-party approval for a read-only support diagnostic window. Never creates tenant membership or impersonates a user.';
comment on table public.dashboard_widget_preferences is
  'Per-user, cross-device widget order and visibility; does not alter authorization or source data.';
