create table public.platform_email_settings (
  id boolean primary key default true,
  enabled boolean not null default false,
  provider text not null default 'sendgrid_api',
  from_email text,
  from_name text not null default 'NXTTRACK',
  sendgrid_api_key_encrypted text,
  smtp_host text,
  smtp_port integer not null default 587,
  smtp_secure boolean not null default false,
  smtp_user text,
  smtp_password_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid references auth.users (id) on delete set null,
  constraint platform_email_settings_singleton check (id),
  constraint platform_email_settings_provider_check check (provider in ('sendgrid_api', 'smtp')),
  constraint platform_email_settings_port_check check (smtp_port between 1 and 65535),
  constraint platform_email_settings_from_email_check check (from_email is null or from_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create trigger platform_email_settings_set_updated_at
  before update on public.platform_email_settings
  for each row execute function app_private.set_updated_at();

insert into public.platform_email_settings (id, enabled, provider, from_name)
values (true, false, 'sendgrid_api', 'NXTTRACK')
on conflict (id) do nothing;

grant select (
  id,
  enabled,
  provider,
  from_email,
  from_name,
  smtp_host,
  smtp_port,
  smtp_secure,
  smtp_user,
  created_at,
  updated_at,
  updated_by_user_id
) on table public.platform_email_settings to authenticated;

grant all on public.platform_email_settings to service_role;

alter table public.platform_email_settings enable row level security;

create policy "Platform owners can view email settings"
  on public.platform_email_settings
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner']));
