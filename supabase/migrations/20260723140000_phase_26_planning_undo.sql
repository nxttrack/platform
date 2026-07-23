create table public.planning_change_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  before_state jsonb not null,
  after_state jsonb not null,
  status text not null default 'applied',
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_user_id uuid references auth.users (id) on delete set null,
  constraint planning_change_events_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint planning_change_events_status_check check (status in ('applied', 'undone', 'superseded')),
  constraint planning_change_events_tenant_id_id_unique unique (tenant_id, id)
);
create index planning_change_events_session_idx on public.planning_change_events (tenant_id, session_id, created_at desc);
grant select, insert, update on public.planning_change_events to authenticated;
grant all on public.planning_change_events to service_role;
alter table public.planning_change_events enable row level security;
alter table public.planning_change_events force row level security;
create policy "Tenant admins manage planning changes" on public.planning_change_events for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
