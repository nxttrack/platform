create table public.user_security_requirements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  must_change_password boolean not null default false,
  reason text not null default 'none',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_security_requirements_reason_check check (reason in ('none', 'temporary_password', 'admin_reset'))
);

create table public.tenant_super_admin_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text,
  status text not null default 'created',
  delivery_provider text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  last_sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_super_admin_invitations_email_format check (position('@' in email) > 1),
  constraint tenant_super_admin_invitations_status_check check (status in ('created', 'sent', 'email_failed', 'accepted', 'revoked')),
  constraint tenant_super_admin_invitations_delivery_provider_check check (delivery_provider is null or delivery_provider in ('smtp', 'sendgrid'))
);

create index tenant_super_admin_invitations_tenant_status_idx
  on public.tenant_super_admin_invitations (tenant_id, status, created_at desc);

create index tenant_super_admin_invitations_user_id_idx
  on public.tenant_super_admin_invitations (user_id);

create trigger user_security_requirements_set_updated_at
  before update on public.user_security_requirements
  for each row execute function app_private.set_updated_at();

create trigger tenant_super_admin_invitations_set_updated_at
  before update on public.tenant_super_admin_invitations
  for each row execute function app_private.set_updated_at();

grant select on public.user_security_requirements to authenticated;
grant select on public.tenant_super_admin_invitations to authenticated;

grant all on public.user_security_requirements to service_role;
grant all on public.tenant_super_admin_invitations to service_role;

alter table public.user_security_requirements enable row level security;
alter table public.tenant_super_admin_invitations enable row level security;

create policy "Users and platform staff can view security requirements"
  on public.user_security_requirements
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Platform staff can view tenant super admin invitations"
  on public.tenant_super_admin_invitations
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));
