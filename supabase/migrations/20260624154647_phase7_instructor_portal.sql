create or replace function app_private.current_user_can_manage_instruction(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(target_tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor']);
$$;

revoke all on function app_private.current_user_can_manage_instruction(uuid) from public;
grant execute on function app_private.current_user_can_manage_instruction(uuid) to authenticated;
grant execute on function app_private.current_user_can_manage_instruction(uuid) to service_role;

create table public.session_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  status text not null default 'present',
  note text,
  recorded_by_profile_id uuid references public.profiles (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_attendance_status_check check (status in ('present', 'absent', 'late', 'excused')),
  constraint session_attendance_id_tenant_unique unique (id, tenant_id),
  constraint session_attendance_unique_session_enrollment unique (tenant_id, session_id, enrollment_id),
  constraint session_attendance_session_tenant_fk foreign key (session_id, tenant_id) references public.sessions (id, tenant_id) on delete cascade,
  constraint session_attendance_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint session_attendance_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade
);

create table public.instructor_student_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  note_type text not null default 'internal',
  body text not null,
  author_profile_id uuid references public.profiles (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_student_notes_type_check check (note_type in ('internal', 'parent_visible', 'compliment')),
  constraint instructor_student_notes_status_check check (status in ('active', 'archived')),
  constraint instructor_student_notes_id_tenant_unique unique (id, tenant_id),
  constraint instructor_student_notes_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint instructor_student_notes_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create index session_attendance_tenant_id_idx on public.session_attendance (tenant_id);
create index session_attendance_session_id_idx on public.session_attendance (session_id);
create index session_attendance_enrollment_id_idx on public.session_attendance (enrollment_id);
create index session_attendance_participant_id_idx on public.session_attendance (participant_id);
create index instructor_student_notes_tenant_id_idx on public.instructor_student_notes (tenant_id);
create index instructor_student_notes_participant_id_idx on public.instructor_student_notes (participant_id);
create index instructor_student_notes_enrollment_id_idx on public.instructor_student_notes (enrollment_id);
create index instructor_student_notes_type_idx on public.instructor_student_notes (tenant_id, note_type, created_at desc);

create trigger session_attendance_set_updated_at
  before update on public.session_attendance
  for each row execute function app_private.set_updated_at();

create trigger instructor_student_notes_set_updated_at
  before update on public.instructor_student_notes
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.session_attendance to authenticated;
grant select, insert, update on public.instructor_student_notes to authenticated;
grant insert (tenant_id, enrollment_id, stage_id, status, score, note, assessed_at) on public.progress to authenticated;
grant update (stage_id, status, score, note, assessed_at) on public.progress to authenticated;

grant all on public.session_attendance to service_role;
grant all on public.instructor_student_notes to service_role;

alter table public.session_attendance enable row level security;
alter table public.instructor_student_notes enable row level security;

create policy "Instruction team can view session attendance"
  on public.session_attendance
  for select
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can insert session attendance"
  on public.session_attendance
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update session attendance"
  on public.session_attendance
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can view student notes"
  on public.instructor_student_notes
  for select
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can insert student notes"
  on public.instructor_student_notes
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update student notes"
  on public.instructor_student_notes
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instructors can insert progress"
  on public.progress
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instructors can update progress"
  on public.progress
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

do $$
declare
  demo_tenant_id uuid;
  demo_roster record;
  demo_enrollment_id uuid;
  demo_participant_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  for demo_roster in
    select
      session.id as session_id,
      enrollment.id as enrollment_id,
      enrollment.participant_id,
      participant.display_name,
      groups.code as group_code
    from public.sessions session
    join public.groups groups
      on groups.id = session.group_id
     and groups.tenant_id = session.tenant_id
    join public.group_memberships membership
      on membership.group_id = groups.id
     and membership.tenant_id = groups.tenant_id
     and membership.status in ('planned', 'active')
    join public.enrollments enrollment
      on enrollment.id = membership.enrollment_id
     and enrollment.tenant_id = membership.tenant_id
    join public.participants participant
      on participant.id = enrollment.participant_id
     and participant.tenant_id = enrollment.tenant_id
    where session.tenant_id = demo_tenant_id
  loop
    insert into public.session_attendance (
      tenant_id,
      session_id,
      enrollment_id,
      participant_id,
      status,
      note,
      recorded_at
    )
    values (
      demo_tenant_id,
      demo_roster.session_id,
      demo_roster.enrollment_id,
      demo_roster.participant_id,
      case when demo_roster.group_code = 'dolfijnen-a2' then 'present' else 'late' end,
      case when demo_roster.group_code = 'dolfijnen-a2' then 'Demo: actief meegedaan.' else 'Demo: vijf minuten later ingestroomd.' end,
      now()
    )
    on conflict (tenant_id, session_id, enrollment_id) do update
      set status = excluded.status,
          note = excluded.note,
          recorded_at = excluded.recorded_at;
  end loop;

  select enrollment.id, enrollment.participant_id
    into demo_enrollment_id, demo_participant_id
  from public.enrollments enrollment
  join public.participants participant
    on participant.id = enrollment.participant_id
   and participant.tenant_id = enrollment.tenant_id
  where enrollment.tenant_id = demo_tenant_id
    and participant.external_reference = 'child-emma-devries'
  limit 1;

  if demo_enrollment_id is not null and demo_participant_id is not null then
    insert into public.instructor_student_notes (
      tenant_id,
      participant_id,
      enrollment_id,
      note_type,
      body,
      status
    )
    values (
      demo_tenant_id,
      demo_participant_id,
      demo_enrollment_id,
      'compliment',
      'Demo-compliment: Emma durfde zelfstandig door het hoepeltje te zwemmen.',
      'active'
    );
  end if;
end $$;
