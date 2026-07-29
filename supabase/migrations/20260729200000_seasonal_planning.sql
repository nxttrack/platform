-- Human-controlled seasonal planning and recoverable holiday schedules.

create table public.planning_seasons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_seasons_name_check check (length(trim(name)) between 3 and 120),
  constraint planning_seasons_period_check check (starts_on <= ends_on),
  constraint planning_seasons_status_check check (status in ('draft', 'active', 'archived')),
  constraint planning_seasons_tenant_id_id_unique unique (tenant_id, id)
);

create table public.season_blackout_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  season_id uuid not null,
  resource_id uuid,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  session_handling text not null default 'review',
  status text not null default 'draft',
  reason text,
  published_by_user_id uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint season_blackout_periods_season_fk
    foreign key (tenant_id, season_id)
    references public.planning_seasons (tenant_id, id)
    on delete cascade,
  constraint season_blackout_periods_resource_fk
    foreign key (tenant_id, resource_id)
    references public.resources (tenant_id, id)
    on delete restrict,
  constraint season_blackout_periods_name_check check (length(trim(name)) between 3 and 120),
  constraint season_blackout_periods_period_check check (starts_at < ends_at),
  constraint season_blackout_periods_handling_check check (session_handling in ('review', 'cancel')),
  constraint season_blackout_periods_status_check check (status in ('draft', 'published', 'closed')),
  constraint season_blackout_periods_publish_check check (
    (status = 'published' and published_by_user_id is not null and published_at is not null)
    or status <> 'published'
  ),
  constraint season_blackout_periods_tenant_id_id_unique unique (tenant_id, id)
);

create table public.season_schedule_change_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  blackout_id uuid not null,
  session_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  before_status text not null,
  after_status text not null,
  status text not null default 'applied',
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_user_id uuid references auth.users (id) on delete set null,
  constraint season_schedule_change_events_blackout_fk
    foreign key (tenant_id, blackout_id)
    references public.season_blackout_periods (tenant_id, id)
    on delete cascade,
  constraint season_schedule_change_events_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id)
    on delete cascade,
  constraint season_schedule_change_events_status_check check (status in ('applied', 'undone', 'superseded')),
  constraint season_schedule_change_events_unique unique (tenant_id, blackout_id, session_id)
);

create index planning_seasons_period_idx on public.planning_seasons (tenant_id, starts_on, ends_on);
create index season_blackout_periods_period_idx on public.season_blackout_periods (tenant_id, starts_at, ends_at);
create index season_schedule_change_events_blackout_idx on public.season_schedule_change_events (tenant_id, blackout_id, created_at desc);

create trigger planning_seasons_set_updated_at before update on public.planning_seasons
  for each row execute function app_private.set_updated_at();
create trigger season_blackout_periods_set_updated_at before update on public.season_blackout_periods
  for each row execute function app_private.set_updated_at();

create function app_private.publish_season_blackout(
  target_tenant_id uuid,
  target_blackout_id uuid,
  target_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  blackout public.season_blackout_periods%rowtype;
  changed_count integer := 0;
begin
  select * into blackout
  from public.season_blackout_periods
  where tenant_id = target_tenant_id and id = target_blackout_id
  for update;
  if not found or blackout.status <> 'draft' then raise exception 'blackout is not publishable'; end if;

  if blackout.session_handling = 'cancel' then
    insert into public.season_schedule_change_events (
      tenant_id, blackout_id, session_id, actor_user_id, before_status, after_status
    )
    select target_tenant_id, blackout.id, session.id, target_actor_user_id, session.status, 'cancelled'
    from public.sessions session
    join public.groups lesson_group on lesson_group.tenant_id = session.tenant_id and lesson_group.id = session.group_id
    where session.tenant_id = target_tenant_id
      and session.status = 'scheduled'
      and session.starts_at < blackout.ends_at
      and session.ends_at > blackout.starts_at
      and (blackout.resource_id is null or coalesce(session.resource_id, lesson_group.default_resource_id) = blackout.resource_id);

    update public.sessions session
    set status = 'cancelled'
    from public.season_schedule_change_events event
    where event.tenant_id = target_tenant_id
      and event.blackout_id = blackout.id
      and event.session_id = session.id
      and event.status = 'applied';
    get diagnostics changed_count = row_count;
  end if;

  update public.season_blackout_periods
  set status = 'published', published_by_user_id = target_actor_user_id, published_at = now()
  where tenant_id = target_tenant_id and id = target_blackout_id;
  return changed_count;
end;
$$;

create function app_private.undo_season_blackout(
  target_tenant_id uuid,
  target_blackout_id uuid,
  target_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_count integer := 0;
begin
  update public.sessions session
  set status = event.before_status
  from public.season_schedule_change_events event
  where event.tenant_id = target_tenant_id
    and event.blackout_id = target_blackout_id
    and event.session_id = session.id
    and event.status = 'applied'
    and session.status = event.after_status;
  get diagnostics changed_count = row_count;

  update public.season_schedule_change_events
  set status = 'undone', undone_at = now(), undone_by_user_id = target_actor_user_id
  where tenant_id = target_tenant_id and blackout_id = target_blackout_id and status = 'applied';
  update public.season_blackout_periods
  set status = 'closed'
  where tenant_id = target_tenant_id and id = target_blackout_id and status = 'published';
  return changed_count;
end;
$$;

revoke all on function app_private.publish_season_blackout(uuid, uuid, uuid) from public, authenticated;
revoke all on function app_private.undo_season_blackout(uuid, uuid, uuid) from public, authenticated;
grant execute on function app_private.publish_season_blackout(uuid, uuid, uuid) to service_role;
grant execute on function app_private.undo_season_blackout(uuid, uuid, uuid) to service_role;

grant select, insert, update, delete on public.planning_seasons to authenticated;
grant select, insert, update, delete on public.season_blackout_periods to authenticated;
grant select on public.season_schedule_change_events to authenticated;
grant all on public.planning_seasons to service_role;
grant all on public.season_blackout_periods to service_role;
grant all on public.season_schedule_change_events to service_role;

alter table public.planning_seasons enable row level security;
alter table public.planning_seasons force row level security;
alter table public.season_blackout_periods enable row level security;
alter table public.season_blackout_periods force row level security;
alter table public.season_schedule_change_events enable row level security;
alter table public.season_schedule_change_events force row level security;

create policy "Tenant administrators manage planning seasons"
  on public.planning_seasons for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));
create policy "Tenant administrators manage seasonal blackout periods"
  on public.season_blackout_periods for all to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']))
  with check (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));
create policy "Tenant administrators view seasonal change audit"
  on public.season_schedule_change_events for select to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

comment on function app_private.publish_season_blackout(uuid, uuid, uuid) is
  'Service-only atomic publication. Cancels sessions only after a tenant admin confirmation in the application.';
