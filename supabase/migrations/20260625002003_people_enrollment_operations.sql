create table public.tenant_account_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  full_name text,
  role text not null default 'parent',
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
  constraint tenant_account_invitations_email_format check (position('@' in email) > 1),
  constraint tenant_account_invitations_role_check check (role in ('parent', 'athlete', 'instructor', 'tenant_staff')),
  constraint tenant_account_invitations_status_check check (status in ('created', 'sent', 'email_failed', 'accepted', 'revoked')),
  constraint tenant_account_invitations_delivery_provider_check check (delivery_provider is null or delivery_provider in ('smtp', 'sendgrid')),
  constraint tenant_account_invitations_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table public.people_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  participant_id uuid references public.participants (id) on delete set null,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  group_membership_id uuid references public.group_memberships (id) on delete set null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint people_audit_events_type_check check (event_type in (
    'participant_created',
    'participant_updated',
    'guardian_invited',
    'guardian_linked',
    'enrollment_created',
    'enrollment_updated',
    'group_membership_created',
    'group_membership_updated',
    'coherent_flow_created'
  )),
  constraint people_audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index tenant_account_invitations_tenant_status_idx
  on public.tenant_account_invitations (tenant_id, status, created_at desc);

create index tenant_account_invitations_participant_idx
  on public.tenant_account_invitations (tenant_id, participant_id, created_at desc);

create index tenant_account_invitations_email_idx
  on public.tenant_account_invitations (tenant_id, lower(email), created_at desc);

create index people_audit_events_tenant_created_idx
  on public.people_audit_events (tenant_id, created_at desc);

create index people_audit_events_participant_idx
  on public.people_audit_events (tenant_id, participant_id, created_at desc);

create trigger tenant_account_invitations_set_updated_at
  before update on public.tenant_account_invitations
  for each row execute function app_private.set_updated_at();

grant select on public.tenant_account_invitations to authenticated;
grant select, insert on public.people_audit_events to authenticated;

grant all on public.tenant_account_invitations to service_role;
grant all on public.people_audit_events to service_role;

alter table public.tenant_account_invitations enable row level security;
alter table public.people_audit_events enable row level security;

create policy "Tenant staff can view account invitations"
  on public.tenant_account_invitations
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can view people audit"
  on public.people_audit_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert people audit"
  on public.people_audit_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

do $$
declare
  demo_tenant_id uuid;
  demo_actor_id uuid;
  demo_participant record;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  select user_id into demo_actor_id
  from public.tenant_memberships
  where tenant_id = demo_tenant_id
  order by created_at asc
  limit 1;

  for demo_participant in
    select id, display_name
    from public.participants
    where tenant_id = demo_tenant_id
    order by created_at asc
    limit 3
  loop
    insert into public.people_audit_events (
      tenant_id,
      actor_profile_id,
      participant_id,
      event_type,
      summary,
      metadata
    )
    values (
      demo_tenant_id,
      demo_actor_id,
      demo_participant.id,
      'participant_created',
      'Demo audit: leerlingprofiel beschikbaar voor ' || demo_participant.display_name,
      '{"source":"seed"}'::jsonb
    );
  end loop;
end $$;
