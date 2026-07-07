alter table public.profiles
  add column if not exists email text;

create unique index if not exists profiles_email_lower_unique
  on public.profiles (lower(email))
  where email is not null;

create table public.user_security (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  must_change_password boolean not null default false,
  password_changed_at timestamptz,
  last_invited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_security_email_lower_unique
  on public.user_security (lower(email))
  where email is not null;

create table public.auth_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  tenant_id uuid references public.tenants (id) on delete cascade,
  role text not null,
  invited_user_id uuid references auth.users (id) on delete set null,
  invited_by_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending',
  delivery_status text not null default 'pending',
  delivery_error text,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_invitations_role_check check (role in ('platform_owner', 'platform_admin', 'platform_support', 'tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete')),
  constraint auth_invitations_status_check check (status in ('pending', 'accepted', 'expired', 'revoked')),
  constraint auth_invitations_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed', 'skipped')),
  constraint auth_invitations_tenant_role_check check (
    (tenant_id is null and role in ('platform_owner', 'platform_admin', 'platform_support'))
    or (tenant_id is not null and role in ('tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'))
  )
);

create index auth_invitations_email_idx on public.auth_invitations (lower(email));
create index auth_invitations_tenant_id_idx on public.auth_invitations (tenant_id);
create index auth_invitations_invited_user_id_idx on public.auth_invitations (invited_user_id);

create table public.password_reset_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id uuid references auth.users (id) on delete cascade,
  code_hash text not null,
  purpose text not null default 'password_reset',
  status text not null default 'pending',
  attempts integer not null default 0,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_reset_challenges_purpose_check check (purpose in ('password_reset')),
  constraint password_reset_challenges_status_check check (status in ('pending', 'used', 'expired', 'revoked')),
  constraint password_reset_challenges_attempts_check check (attempts >= 0 and attempts <= 5)
);

create index password_reset_challenges_email_idx on public.password_reset_challenges (lower(email));
create index password_reset_challenges_user_id_idx on public.password_reset_challenges (user_id);
create index password_reset_challenges_pending_idx
  on public.password_reset_challenges (lower(email), created_at desc)
  where status = 'pending';

create trigger user_security_set_updated_at
  before update on public.user_security
  for each row execute function app_private.set_updated_at();

create trigger auth_invitations_set_updated_at
  before update on public.auth_invitations
  for each row execute function app_private.set_updated_at();

create trigger password_reset_challenges_set_updated_at
  before update on public.password_reset_challenges
  for each row execute function app_private.set_updated_at();

grant select on public.user_security to authenticated;
grant select on public.auth_invitations to authenticated;
grant select on public.password_reset_challenges to authenticated;

grant all on public.user_security to service_role;
grant all on public.auth_invitations to service_role;
grant all on public.password_reset_challenges to service_role;

alter table public.user_security enable row level security;
alter table public.auth_invitations enable row level security;
alter table public.password_reset_challenges enable row level security;

create policy "Users can view their own security state"
  on public.user_security
  for select
  to authenticated
  using (user_id = (select auth.uid()));
