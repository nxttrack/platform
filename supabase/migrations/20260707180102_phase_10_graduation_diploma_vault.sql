alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_type_check,
  add constraint tenant_notifications_type_check check (type in ('progress_score', 'badge_award', 'graduation_invite', 'certificate_issued', 'system'));

create table public.graduation_readiness (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  program_id uuid not null,
  stage_id uuid not null,
  status text not null default 'not_ready',
  readiness_score numeric(5, 2),
  checklist_summary text,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  next_review_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_readiness_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint graduation_readiness_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint graduation_readiness_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint graduation_readiness_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint graduation_readiness_status_check check (status in ('not_ready', 'nearly_ready', 'ready', 'invited', 'completed', 'blocked')),
  constraint graduation_readiness_score_check check (readiness_score is null or (readiness_score >= 0 and readiness_score <= 100)),
  constraint graduation_readiness_tenant_id_id_unique unique (tenant_id, id),
  constraint graduation_readiness_unique unique (tenant_id, enrollment_id, stage_id)
);

create table public.graduation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid,
  stage_id uuid,
  resource_id uuid,
  title text not null,
  status text not null default 'planned',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer,
  notes text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_events_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint graduation_events_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint graduation_events_resource_fk foreign key (tenant_id, resource_id) references public.resources (tenant_id, id) on delete restrict,
  constraint graduation_events_status_check check (status in ('planned', 'published', 'completed', 'cancelled')),
  constraint graduation_events_time_check check (starts_at < ends_at),
  constraint graduation_events_capacity_check check (capacity is null or capacity >= 0),
  constraint graduation_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.graduation_event_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  readiness_id uuid,
  invite_status text not null default 'draft',
  status text not null default 'invited',
  invited_at timestamptz,
  responded_at timestamptz,
  result text not null default 'pending',
  result_registered_by_user_id uuid references auth.users (id) on delete set null,
  result_registered_at timestamptz,
  result_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint graduation_event_participants_event_fk foreign key (tenant_id, event_id) references public.graduation_events (tenant_id, id) on delete cascade,
  constraint graduation_event_participants_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint graduation_event_participants_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint graduation_event_participants_readiness_fk foreign key (tenant_id, readiness_id) references public.graduation_readiness (tenant_id, id) on delete restrict,
  constraint graduation_event_participants_invite_status_check check (invite_status in ('draft', 'sent', 'confirmed', 'declined')),
  constraint graduation_event_participants_status_check check (status in ('invited', 'confirmed', 'declined', 'attended', 'passed', 'failed', 'deferred', 'no_show', 'cancelled')),
  constraint graduation_event_participants_result_check check (result in ('pending', 'passed', 'failed', 'deferred')),
  constraint graduation_event_participants_tenant_id_id_unique unique (tenant_id, id),
  constraint graduation_event_participants_unique unique (tenant_id, event_id, participant_id)
);

create table public.certificate_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  program_id uuid not null,
  stage_id uuid not null,
  event_participant_id uuid,
  certificate_number text,
  title text not null,
  status text not null default 'issued',
  issued_on date not null default current_date,
  issued_by_user_id uuid references auth.users (id) on delete set null,
  file_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificate_records_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint certificate_records_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint certificate_records_program_fk foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete restrict,
  constraint certificate_records_stage_fk foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete restrict,
  constraint certificate_records_event_participant_fk foreign key (tenant_id, event_participant_id) references public.graduation_event_participants (tenant_id, id) on delete restrict,
  constraint certificate_records_status_check check (status in ('draft', 'issued', 'revoked')),
  constraint certificate_records_tenant_id_id_unique unique (tenant_id, id),
  constraint certificate_records_tenant_number_unique unique (tenant_id, certificate_number),
  constraint certificate_records_event_participant_unique unique (tenant_id, event_participant_id)
);

create index graduation_readiness_participant_idx on public.graduation_readiness (tenant_id, participant_id, status);
create index graduation_readiness_stage_idx on public.graduation_readiness (tenant_id, program_id, stage_id, status);
create index graduation_events_tenant_starts_idx on public.graduation_events (tenant_id, starts_at, status);
create index graduation_event_participants_event_idx on public.graduation_event_participants (tenant_id, event_id, status);
create index graduation_event_participants_participant_idx on public.graduation_event_participants (tenant_id, participant_id, status);
create index certificate_records_participant_idx on public.certificate_records (tenant_id, participant_id, issued_on desc);
create index certificate_records_status_idx on public.certificate_records (tenant_id, status, issued_on desc);

create trigger graduation_readiness_set_updated_at
  before update on public.graduation_readiness
  for each row execute function app_private.set_updated_at();

create trigger graduation_events_set_updated_at
  before update on public.graduation_events
  for each row execute function app_private.set_updated_at();

create trigger graduation_event_participants_set_updated_at
  before update on public.graduation_event_participants
  for each row execute function app_private.set_updated_at();

create trigger certificate_records_set_updated_at
  before update on public.certificate_records
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.graduation_readiness to authenticated;
grant select, insert, update, delete on public.graduation_events to authenticated;
grant select, insert, update, delete on public.graduation_event_participants to authenticated;
grant select, insert, update, delete on public.certificate_records to authenticated;

grant all on public.graduation_readiness to service_role;
grant all on public.graduation_events to service_role;
grant all on public.graduation_event_participants to service_role;
grant all on public.certificate_records to service_role;

alter table public.graduation_readiness enable row level security;
alter table public.graduation_events enable row level security;
alter table public.graduation_event_participants enable row level security;
alter table public.certificate_records enable row level security;

create policy "Scoped users can view graduation readiness"
  on public.graduation_readiness
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
    or (
      status in ('ready', 'invited', 'completed')
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Tenant staff and assigned instructors can manage graduation readiness"
  on public.graduation_readiness
  for all
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  );

create policy "Tenant members can view graduation events"
  on public.graduation_events
  for select
  to authenticated
  using (
    app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
    or app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
  );

create policy "Tenant staff can manage graduation events"
  on public.graduation_events
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Scoped users can view graduation event participants"
  on public.graduation_event_participants
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff and assigned instructors can manage graduation event participants"
  on public.graduation_event_participants
  for all
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  )
  with check (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  );

create policy "Scoped users can view certificate records"
  on public.certificate_records
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
    or (
      status = 'issued'
      and app_private.current_user_can_view_participant(participant_id)
    )
  );

create policy "Tenant staff can manage certificate records"
  on public.certificate_records
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
