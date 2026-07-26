create table public.platform_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete set null,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_admin_audit_event_type_check check (event_type ~ '^platform\.[a-z0-9_]+$'),
  constraint platform_admin_audit_subject_type_check check (subject_type in ('tenant', 'tenant_domain', 'tenant_membership', 'auth_invitation', 'auth_user'))
);

create index platform_admin_audit_tenant_created_idx
  on public.platform_admin_audit_events (tenant_id, created_at desc);

create index platform_admin_audit_actor_created_idx
  on public.platform_admin_audit_events (actor_user_id, created_at desc);

grant select on public.platform_admin_audit_events to authenticated;
grant all on public.platform_admin_audit_events to service_role;

alter table public.platform_admin_audit_events enable row level security;
alter table public.platform_admin_audit_events force row level security;

create policy "Platform administrators view control-plane audit events"
  on public.platform_admin_audit_events
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

comment on table public.platform_admin_audit_events is
  'Service-managed control-plane audit trail for tenant, membership, invitation, domain and Auth administration.';
