create table public.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  code text,
  description text,
  status text not null default 'draft',
  sort_order integer not null default 0,
  min_age_months integer,
  max_age_months integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_status_check check (status in ('draft', 'active', 'archived')),
  constraint programs_age_check check (
    (min_age_months is null or min_age_months >= 0)
    and (max_age_months is null or max_age_months >= 0)
    and (min_age_months is null or max_age_months is null or min_age_months <= max_age_months)
  ),
  constraint programs_tenant_id_id_unique unique (tenant_id, id),
  constraint programs_tenant_code_unique unique (tenant_id, code)
);

create table public.program_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  name text not null,
  code text,
  badge_label text,
  description text,
  color_hex text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_stages_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete cascade,
  constraint program_stages_status_check check (status in ('active', 'archived')),
  constraint program_stages_color_check check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint program_stages_tenant_id_id_unique unique (tenant_id, id),
  constraint program_stages_tenant_program_code_unique unique (tenant_id, program_id, code)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  parent_resource_id uuid,
  kind text not null,
  name text not null,
  code text,
  capacity integer,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_parent_fk foreign key (tenant_id, parent_resource_id) references public.resources (tenant_id, id) on delete restrict,
  constraint resources_kind_check check (kind in ('location', 'pool', 'lane', 'room', 'other')),
  constraint resources_status_check check (status in ('active', 'inactive', 'archived')),
  constraint resources_capacity_check check (capacity is null or capacity >= 0),
  constraint resources_tenant_id_id_unique unique (tenant_id, id),
  constraint resources_tenant_code_unique unique (tenant_id, code)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  stage_id uuid,
  default_resource_id uuid,
  name text not null,
  code text,
  status text not null default 'planned',
  capacity integer not null default 8,
  default_weekday integer,
  default_start_time time,
  default_end_time time,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint groups_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint groups_default_resource_fk foreign key (tenant_id, default_resource_id) references public.resources (tenant_id, id) on delete restrict,
  constraint groups_status_check check (status in ('planned', 'active', 'paused', 'archived')),
  constraint groups_capacity_check check (capacity >= 0),
  constraint groups_weekday_check check (default_weekday is null or default_weekday between 1 and 7),
  constraint groups_default_time_check check (default_start_time is null or default_end_time is null or default_start_time < default_end_time),
  constraint groups_date_check check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint groups_tenant_id_id_unique unique (tenant_id, id),
  constraint groups_tenant_code_unique unique (tenant_id, code)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  resource_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  capacity_override integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_group_fk foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete cascade,
  constraint sessions_resource_fk foreign key (tenant_id, resource_id) references public.resources (tenant_id, id) on delete restrict,
  constraint sessions_status_check check (status in ('draft', 'scheduled', 'completed', 'cancelled')),
  constraint sessions_time_check check (starts_at < ends_at),
  constraint sessions_capacity_check check (capacity_override is null or capacity_override >= 0),
  constraint sessions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.group_instructor_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'primary',
  status text not null default 'active',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_instructor_assignments_group_fk foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete cascade,
  constraint group_instructor_assignments_role_check check (role in ('primary', 'support', 'substitute')),
  constraint group_instructor_assignments_status_check check (status in ('active', 'inactive')),
  constraint group_instructor_assignments_date_check check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint group_instructor_assignments_unique unique (group_id, instructor_user_id, role, starts_on)
);

create table public.session_instructor_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'primary',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_instructor_assignments_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint session_instructor_assignments_role_check check (role in ('primary', 'support', 'substitute')),
  constraint session_instructor_assignments_status_check check (status in ('active', 'inactive')),
  constraint session_instructor_assignments_unique unique (session_id, instructor_user_id, role)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  guardian_user_id uuid references auth.users (id) on delete set null,
  display_name text not null,
  birth_date date,
  external_reference text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_status_check check (status in ('active', 'inactive', 'archived')),
  constraint participants_tenant_id_id_unique unique (tenant_id, id),
  constraint participants_tenant_external_reference_unique unique (tenant_id, external_reference)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  program_id uuid not null,
  current_stage_id uuid,
  status text not null default 'active',
  source text not null default 'manual',
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint enrollments_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint enrollments_stage_fk foreign key (tenant_id, current_stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint enrollments_status_check check (status in ('active', 'paused', 'completed', 'cancelled')),
  constraint enrollments_source_check check (source in ('manual', 'intake', 'import')),
  constraint enrollments_date_check check (ends_on is null or starts_on <= ends_on),
  constraint enrollments_tenant_id_id_unique unique (tenant_id, id),
  constraint enrollments_tenant_id_id_participant_unique unique (tenant_id, id, participant_id)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  enrollment_id uuid not null,
  participant_id uuid not null,
  status text not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  capacity_weight numeric(4, 2) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_memberships_group_fk foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete cascade,
  constraint group_memberships_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint group_memberships_status_check check (status in ('active', 'trial', 'paused', 'completed', 'cancelled')),
  constraint group_memberships_date_check check (ends_on is null or starts_on <= ends_on),
  constraint group_memberships_capacity_weight_check check (capacity_weight >= 0 and capacity_weight <= 1),
  constraint group_memberships_unique_active unique (group_id, enrollment_id, status)
);

create index programs_tenant_id_idx on public.programs (tenant_id);
create index program_stages_tenant_program_idx on public.program_stages (tenant_id, program_id, sort_order);
create index resources_tenant_kind_idx on public.resources (tenant_id, kind, sort_order);
create index groups_tenant_program_stage_idx on public.groups (tenant_id, program_id, stage_id);
create index groups_tenant_status_idx on public.groups (tenant_id, status);
create index sessions_tenant_group_starts_idx on public.sessions (tenant_id, group_id, starts_at);
create index sessions_tenant_resource_starts_idx on public.sessions (tenant_id, resource_id, starts_at);
create index group_instructor_assignments_user_idx on public.group_instructor_assignments (instructor_user_id);
create index session_instructor_assignments_user_idx on public.session_instructor_assignments (instructor_user_id);
create index participants_tenant_guardian_idx on public.participants (tenant_id, guardian_user_id);
create index enrollments_tenant_participant_idx on public.enrollments (tenant_id, participant_id);
create index enrollments_tenant_program_stage_idx on public.enrollments (tenant_id, program_id, current_stage_id);
create index group_memberships_tenant_group_idx on public.group_memberships (tenant_id, group_id, status);
create index group_memberships_tenant_participant_idx on public.group_memberships (tenant_id, participant_id, status);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function app_private.set_updated_at();

create trigger program_stages_set_updated_at
  before update on public.program_stages
  for each row execute function app_private.set_updated_at();

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function app_private.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function app_private.set_updated_at();

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function app_private.set_updated_at();

create trigger group_instructor_assignments_set_updated_at
  before update on public.group_instructor_assignments
  for each row execute function app_private.set_updated_at();

create trigger session_instructor_assignments_set_updated_at
  before update on public.session_instructor_assignments
  for each row execute function app_private.set_updated_at();

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function app_private.set_updated_at();

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function app_private.set_updated_at();

create trigger group_memberships_set_updated_at
  before update on public.group_memberships
  for each row execute function app_private.set_updated_at();

create function app_private.current_user_can_manage_tenant_domain(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff']);
$$;

create function app_private.current_user_is_assigned_to_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.group_instructor_assignments assignment
    join public.tenant_memberships membership
      on membership.tenant_id = assignment.tenant_id
     and membership.user_id = assignment.instructor_user_id
     and membership.role = 'instructor'
     and membership.status = 'active'
    where assignment.group_id = target_group_id
      and assignment.instructor_user_id = (select auth.uid())
      and assignment.status = 'active'
  );
$$;

create function app_private.current_user_is_assigned_to_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.session_instructor_assignments assignment
    join public.tenant_memberships membership
      on membership.tenant_id = assignment.tenant_id
     and membership.user_id = assignment.instructor_user_id
     and membership.role = 'instructor'
     and membership.status = 'active'
    where assignment.session_id = target_session_id
      and assignment.instructor_user_id = (select auth.uid())
      and assignment.status = 'active'
  )
  or exists (
    select 1
    from public.sessions session
    where session.id = target_session_id
      and app_private.current_user_is_assigned_to_group(session.group_id)
  );
$$;

create function app_private.current_user_can_view_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.participants participant
    where participant.id = target_participant_id
      and (
        participant.guardian_user_id = (select auth.uid())
        or app_private.current_user_can_manage_tenant_domain(participant.tenant_id)
        or exists (
          select 1
          from public.group_memberships membership
          join public.group_instructor_assignments assignment
            on assignment.group_id = membership.group_id
           and assignment.instructor_user_id = (select auth.uid())
           and assignment.status = 'active'
          where membership.participant_id = participant.id
            and membership.status in ('active', 'trial')
        )
      )
  );
$$;

revoke all on function app_private.current_user_can_manage_tenant_domain(uuid) from public;
revoke all on function app_private.current_user_is_assigned_to_group(uuid) from public;
revoke all on function app_private.current_user_is_assigned_to_session(uuid) from public;
revoke all on function app_private.current_user_can_view_participant(uuid) from public;

grant execute on function app_private.current_user_can_manage_tenant_domain(uuid) to authenticated;
grant execute on function app_private.current_user_is_assigned_to_group(uuid) to authenticated;
grant execute on function app_private.current_user_is_assigned_to_session(uuid) to authenticated;
grant execute on function app_private.current_user_can_view_participant(uuid) to authenticated;
grant execute on function app_private.current_user_can_manage_tenant_domain(uuid) to service_role;
grant execute on function app_private.current_user_is_assigned_to_group(uuid) to service_role;
grant execute on function app_private.current_user_is_assigned_to_session(uuid) to service_role;
grant execute on function app_private.current_user_can_view_participant(uuid) to service_role;

grant select, insert, update, delete on public.programs to authenticated;
grant select, insert, update, delete on public.program_stages to authenticated;
grant select, insert, update, delete on public.resources to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.sessions to authenticated;
grant select, insert, update, delete on public.group_instructor_assignments to authenticated;
grant select, insert, update, delete on public.session_instructor_assignments to authenticated;
grant select, insert, update, delete on public.participants to authenticated;
grant select, insert, update, delete on public.enrollments to authenticated;
grant select, insert, update, delete on public.group_memberships to authenticated;

grant all on public.programs to service_role;
grant all on public.program_stages to service_role;
grant all on public.resources to service_role;
grant all on public.groups to service_role;
grant all on public.sessions to service_role;
grant all on public.group_instructor_assignments to service_role;
grant all on public.session_instructor_assignments to service_role;
grant all on public.participants to service_role;
grant all on public.enrollments to service_role;
grant all on public.group_memberships to service_role;

alter table public.programs enable row level security;
alter table public.program_stages enable row level security;
alter table public.resources enable row level security;
alter table public.groups enable row level security;
alter table public.sessions enable row level security;
alter table public.group_instructor_assignments enable row level security;
alter table public.session_instructor_assignments enable row level security;
alter table public.participants enable row level security;
alter table public.enrollments enable row level security;
alter table public.group_memberships enable row level security;

create policy "Tenant members can view programs"
  on public.programs
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can manage programs"
  on public.programs
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant members can view program stages"
  on public.program_stages
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can manage program stages"
  on public.program_stages
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant members can view resources"
  on public.resources
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent'])
  );

create policy "Tenant staff can manage resources"
  on public.resources
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant members can view groups"
  on public.groups
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'parent'])
    or app_private.current_user_is_assigned_to_group(id)
  );

create policy "Tenant staff can manage groups"
  on public.groups
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view sessions"
  on public.sessions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'parent'])
    or app_private.current_user_is_assigned_to_session(id)
  );

create policy "Tenant staff can manage sessions"
  on public.sessions
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view group instructor assignments"
  on public.group_instructor_assignments
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or instructor_user_id = (select auth.uid())
  );

create policy "Tenant staff can manage group instructor assignments"
  on public.group_instructor_assignments
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view session instructor assignments"
  on public.session_instructor_assignments
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or instructor_user_id = (select auth.uid())
  );

create policy "Tenant staff can manage session instructor assignments"
  on public.session_instructor_assignments
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view participants"
  on public.participants
  for select
  to authenticated
  using (app_private.current_user_can_view_participant(id));

create policy "Tenant staff can manage participants"
  on public.participants
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view enrollments"
  on public.enrollments
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or guardian_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage enrollments"
  on public.enrollments
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view group memberships"
  on public.group_memberships
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_is_assigned_to_group(group_id)
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage group memberships"
  on public.group_memberships
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
