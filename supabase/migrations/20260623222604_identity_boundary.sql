create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sector text not null default 'swim_school',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint tenants_sector_check check (sector in ('swim_school', 'football_school', 'sports_club', 'martial_arts_school', 'dance_school', 'generic_lessons')),
  constraint tenants_status_check check (status in ('active', 'inactive', 'suspended'))
);

create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  hostname text not null unique,
  kind text not null default 'subdomain',
  status text not null default 'pending',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_domains_hostname_lowercase check (hostname = lower(hostname)),
  constraint tenant_domains_kind_check check (kind in ('subdomain', 'custom_domain')),
  constraint tenant_domains_status_check check (status in ('pending', 'verified', 'disabled'))
);

create unique index tenant_domains_one_primary_per_tenant
  on public.tenant_domains (tenant_id)
  where is_primary;

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  terminology_sector text not null default 'swim_school',
  locale text not null default 'nl-NL',
  timezone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_settings_sector_check check (terminology_sector in ('swim_school', 'football_school', 'sports_club', 'martial_arts_school', 'dance_school', 'generic_lessons'))
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  status text not null default 'active',
  invited_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_role_check check (role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete')),
  constraint tenant_memberships_status_check check (status in ('invited', 'active', 'suspended')),
  constraint tenant_memberships_unique_role unique (tenant_id, user_id, role)
);

create index tenant_memberships_user_id_idx on public.tenant_memberships (user_id);
create index tenant_memberships_tenant_id_idx on public.tenant_memberships (tenant_id);

create table public.platform_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_memberships_role_check check (role in ('platform_owner', 'platform_admin', 'platform_support')),
  constraint platform_memberships_status_check check (status in ('active', 'suspended')),
  constraint platform_memberships_unique_role unique (user_id, role)
);

create index platform_memberships_user_id_idx on public.platform_memberships (user_id);

create function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app_private.set_updated_at();

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function app_private.set_updated_at();

create trigger tenant_domains_set_updated_at
  before update on public.tenant_domains
  for each row execute function app_private.set_updated_at();

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function app_private.set_updated_at();

create trigger tenant_memberships_set_updated_at
  before update on public.tenant_memberships
  for each row execute function app_private.set_updated_at();

create trigger platform_memberships_set_updated_at
  before update on public.platform_memberships
  for each row execute function app_private.set_updated_at();

create function app_private.current_user_has_platform_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(required_roles)
  );
$$;

create function app_private.current_user_has_tenant_role(target_tenant_id uuid, required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any(required_roles)
  );
$$;

create function app_private.current_user_can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or exists (
      select 1
      from public.tenant_memberships viewer
      join public.tenant_memberships target
        on target.tenant_id = viewer.tenant_id
      where viewer.user_id = (select auth.uid())
        and target.user_id = target_user_id
        and viewer.status = 'active'
        and target.status = 'active'
        and viewer.role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor')
    );
$$;

revoke all on function app_private.set_updated_at() from public;
revoke all on function app_private.current_user_has_platform_role(text[]) from public;
revoke all on function app_private.current_user_has_tenant_role(uuid, text[]) from public;
revoke all on function app_private.current_user_can_view_profile(uuid) from public;

grant execute on function app_private.current_user_has_platform_role(text[]) to authenticated;
grant execute on function app_private.current_user_has_tenant_role(uuid, text[]) to authenticated;
grant execute on function app_private.current_user_can_view_profile(uuid) to authenticated;
grant execute on function app_private.current_user_has_platform_role(text[]) to service_role;
grant execute on function app_private.current_user_has_tenant_role(uuid, text[]) to service_role;
grant execute on function app_private.current_user_can_view_profile(uuid) to service_role;

grant usage on schema public to authenticated;
grant usage on schema public to service_role;
grant usage on schema app_private to service_role;

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

grant select on public.tenants to authenticated;
grant select on public.tenant_domains to authenticated;
grant select on public.tenant_settings to authenticated;
grant select on public.tenant_memberships to authenticated;
grant select on public.platform_memberships to authenticated;

grant all on public.profiles to service_role;
grant all on public.tenants to service_role;
grant all on public.tenant_domains to service_role;
grant all on public.tenant_settings to service_role;
grant all on public.tenant_memberships to service_role;
grant all on public.platform_memberships to service_role;

alter table public.profiles enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_domains enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.platform_memberships enable row level security;

create policy "Profiles are visible to self and scoped staff"
  on public.profiles
  for select
  to authenticated
  using (app_private.current_user_can_view_profile(id));

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Tenant members can view their tenants"
  on public.tenants
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view tenant domains"
  on public.tenant_domains
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view tenant settings"
  on public.tenant_settings
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Users can view scoped tenant memberships"
  on public.tenant_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Platform members can view platform memberships"
  on public.platform_memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );
