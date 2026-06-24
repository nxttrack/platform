create table public.platform_smtp_settings (
  id text primary key default 'global',
  status text not null default 'configured',
  mode text not null default 'test',
  host text not null default 'smtp.sendgrid.net',
  port integer not null default 587,
  secure boolean not null default false,
  from_email text,
  from_name text,
  reply_to_email text,
  username_secret_reference text not null default 'SMTP_USER',
  password_secret_reference text not null default 'SMTP_PASS',
  test_recipient_email text,
  last_tested_at timestamptz,
  last_test_status text not null default 'not_tested',
  last_test_error text,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_smtp_settings_singleton_check check (id = 'global'),
  constraint platform_smtp_settings_status_check check (status in ('disabled', 'configured', 'active')),
  constraint platform_smtp_settings_mode_check check (mode in ('test', 'live')),
  constraint platform_smtp_settings_port_check check (port between 1 and 65535),
  constraint platform_smtp_settings_last_test_status_check check (last_test_status in ('not_tested', 'sent', 'failed')),
  constraint platform_smtp_settings_from_email_check check (from_email is null or position('@' in from_email) > 1),
  constraint platform_smtp_settings_reply_to_email_check check (reply_to_email is null or position('@' in reply_to_email) > 1),
  constraint platform_smtp_settings_test_recipient_email_check check (test_recipient_email is null or position('@' in test_recipient_email) > 1)
);

create trigger platform_smtp_settings_set_updated_at
  before update on public.platform_smtp_settings
  for each row execute function app_private.set_updated_at();

grant select on public.platform_smtp_settings to authenticated;
grant all on public.platform_smtp_settings to service_role;

alter table public.platform_smtp_settings enable row level security;

create policy "Platform staff can view platform smtp settings"
  on public.platform_smtp_settings
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support']));

insert into public.platform_smtp_settings (
  id,
  status,
  mode,
  host,
  port,
  secure,
  from_email,
  from_name,
  username_secret_reference,
  password_secret_reference,
  metadata
)
values (
  'global',
  'configured',
  'test',
  'smtp.sendgrid.net',
  587,
  false,
  'noreply@nxttrack.nl',
  'NXTTRACK',
  'SMTP_USER',
  'SMTP_PASS',
  '{"scope":"platform_global","provider":"smtp_sendgrid"}'::jsonb
)
on conflict (id) do nothing;
