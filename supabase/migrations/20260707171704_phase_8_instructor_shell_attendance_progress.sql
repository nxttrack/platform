create table public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  status text not null default 'present',
  marked_by_user_id uuid references auth.users (id) on delete set null,
  marked_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_attendance_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint session_attendance_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint session_attendance_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint session_attendance_status_check check (status in ('present', 'absent', 'late', 'excused', 'trial')),
  constraint session_attendance_unique unique (tenant_id, session_id, participant_id)
);

create table public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid,
  session_id uuid,
  instructor_user_id uuid references auth.users (id) on delete set null,
  visibility text not null default 'internal',
  note text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_notes_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint progress_notes_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint progress_notes_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint progress_notes_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint progress_notes_status_check check (status in ('active', 'archived'))
);

create table public.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid,
  stage_id uuid,
  code text,
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_definitions_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint badge_definitions_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint badge_definitions_status_check check (status in ('active', 'archived')),
  constraint badge_definitions_tenant_id_id_unique unique (tenant_id, id),
  constraint badge_definitions_tenant_code_unique unique (tenant_id, code)
);

create table public.participant_badge_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid,
  badge_definition_id uuid,
  awarded_by_user_id uuid references auth.users (id) on delete set null,
  source_session_id uuid,
  title text not null,
  note text,
  visibility text not null default 'parent_visible',
  status text not null default 'awarded',
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_badge_awards_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint participant_badge_awards_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete restrict,
  constraint participant_badge_awards_definition_fk foreign key (tenant_id, badge_definition_id) references public.badge_definitions (tenant_id, id) on delete restrict,
  constraint participant_badge_awards_session_fk foreign key (tenant_id, source_session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint participant_badge_awards_visibility_check check (visibility in ('internal', 'parent_visible')),
  constraint participant_badge_awards_status_check check (status in ('awarded', 'revoked')),
  constraint participant_badge_awards_tenant_id_id_unique unique (tenant_id, id)
);

create index session_attendance_session_idx on public.session_attendance (tenant_id, session_id, status);
create index session_attendance_participant_idx on public.session_attendance (tenant_id, participant_id, marked_at desc);
create index progress_notes_participant_idx on public.progress_notes (tenant_id, participant_id, created_at desc);
create index progress_notes_session_idx on public.progress_notes (tenant_id, session_id, created_at desc);
create index badge_definitions_tenant_status_idx on public.badge_definitions (tenant_id, status, name);
create index participant_badge_awards_participant_idx on public.participant_badge_awards (tenant_id, participant_id, awarded_at desc);

create trigger session_attendance_set_updated_at
  before update on public.session_attendance
  for each row execute function app_private.set_updated_at();

create trigger progress_notes_set_updated_at
  before update on public.progress_notes
  for each row execute function app_private.set_updated_at();

create trigger badge_definitions_set_updated_at
  before update on public.badge_definitions
  for each row execute function app_private.set_updated_at();

create trigger participant_badge_awards_set_updated_at
  before update on public.participant_badge_awards
  for each row execute function app_private.set_updated_at();

create function app_private.current_user_can_instruct_participant(target_participant_id uuid)
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
        app_private.current_user_can_manage_tenant_domain(participant.tenant_id)
        or exists (
          select 1
          from public.group_memberships membership
          join public.group_instructor_assignments assignment
            on assignment.tenant_id = membership.tenant_id
           and assignment.group_id = membership.group_id
           and assignment.instructor_user_id = (select auth.uid())
           and assignment.status = 'active'
          where membership.tenant_id = participant.tenant_id
            and membership.participant_id = participant.id
            and membership.status in ('active', 'trial')
        )
      )
  );
$$;

create function app_private.current_user_can_record_session_for_participant(target_session_id uuid, target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sessions session
    join public.group_memberships membership
      on membership.tenant_id = session.tenant_id
     and membership.group_id = session.group_id
     and membership.participant_id = target_participant_id
     and membership.status in ('active', 'trial')
    where session.id = target_session_id
      and (
        app_private.current_user_can_manage_tenant_domain(session.tenant_id)
        or app_private.current_user_is_assigned_to_session(session.id)
      )
  );
$$;

revoke all on function app_private.current_user_can_instruct_participant(uuid) from public;
revoke all on function app_private.current_user_can_record_session_for_participant(uuid, uuid) from public;

grant execute on function app_private.current_user_can_instruct_participant(uuid) to authenticated;
grant execute on function app_private.current_user_can_record_session_for_participant(uuid, uuid) to authenticated;
grant execute on function app_private.current_user_can_instruct_participant(uuid) to service_role;
grant execute on function app_private.current_user_can_record_session_for_participant(uuid, uuid) to service_role;

grant select, insert, update, delete on public.session_attendance to authenticated;
grant select, insert, update, delete on public.progress_notes to authenticated;
grant select, insert, update, delete on public.badge_definitions to authenticated;
grant select, insert, update, delete on public.participant_badge_awards to authenticated;

grant all on public.session_attendance to service_role;
grant all on public.progress_notes to service_role;
grant all on public.badge_definitions to service_role;
grant all on public.participant_badge_awards to service_role;

alter table public.session_attendance enable row level security;
alter table public.progress_notes enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.participant_badge_awards enable row level security;

create policy "Assigned instructors can manage session attendance"
  on public.session_attendance
  for all
  to authenticated
  using (app_private.current_user_can_record_session_for_participant(session_id, participant_id))
  with check (app_private.current_user_can_record_session_for_participant(session_id, participant_id));

create policy "Scoped users can view progress notes"
  on public.progress_notes
  for select
  to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or (
      visibility = 'parent_visible'
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Assigned instructors can manage progress notes"
  on public.progress_notes
  for all
  to authenticated
  using (app_private.current_user_can_instruct_participant(participant_id))
  with check (app_private.current_user_can_instruct_participant(participant_id));

create policy "Tenant members can view badge definitions"
  on public.badge_definitions
  for select
  to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Tenant staff and instructors can manage badge definitions"
  on public.badge_definitions
  for all
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );

create policy "Scoped users can view badge awards"
  on public.participant_badge_awards
  for select
  to authenticated
  using (
    app_private.current_user_can_instruct_participant(participant_id)
    or (
      visibility = 'parent_visible'
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Assigned instructors can manage badge awards"
  on public.participant_badge_awards
  for all
  to authenticated
  using (app_private.current_user_can_instruct_participant(participant_id))
  with check (app_private.current_user_can_instruct_participant(participant_id));
