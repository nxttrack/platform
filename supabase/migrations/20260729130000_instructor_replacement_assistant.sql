-- Instructor replacement assistant.
-- Qualifications, workload limits and replacement evidence are explicit.
-- Suggestions and draft requests never change the roster automatically.

create table public.instructor_qualifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid,
  stage_id uuid,
  resource_id uuid,
  qualification_key text not null,
  name text not null,
  status text not null default 'active',
  valid_from date,
  valid_until date,
  evidence_note text,
  verified_by_user_id uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_qualifications_program_fk
    foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete cascade,
  constraint instructor_qualifications_stage_fk
    foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete cascade,
  constraint instructor_qualifications_resource_fk
    foreign key (tenant_id, resource_id) references public.resources (tenant_id, id) on delete cascade,
  constraint instructor_qualifications_key_check
    check (qualification_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint instructor_qualifications_status_check
    check (status in ('draft', 'active', 'expired', 'suspended')),
  constraint instructor_qualifications_scope_check
    check (program_id is not null or stage_id is not null or resource_id is not null),
  constraint instructor_qualifications_dates_check
    check (valid_from is null or valid_until is null or valid_from <= valid_until),
  constraint instructor_qualifications_verification_check
    check (
      (status = 'active' and verified_by_user_id is not null and verified_at is not null)
      or status <> 'active'
    ),
  constraint instructor_qualifications_unique
    unique nulls not distinct (
      tenant_id, instructor_user_id, qualification_key, program_id, stage_id, resource_id
    ),
  constraint instructor_qualifications_tenant_id_id_unique unique (tenant_id, id)
);

create table public.instructor_workload_limits (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  max_weekly_minutes integer not null default 1200,
  max_daily_minutes integer not null default 360,
  max_consecutive_minutes integer not null default 180,
  max_sessions_per_day integer not null default 8,
  minimum_break_minutes integer not null default 15,
  cross_location_buffer_minutes integer not null default 45,
  effective_from date not null default current_date,
  effective_until date,
  status text not null default 'active',
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, instructor_user_id),
  constraint instructor_workload_limits_minutes_check check (
    max_weekly_minutes between 45 and 3600
    and max_daily_minutes between 45 and 720
    and max_consecutive_minutes between 45 and 360
    and minimum_break_minutes between 0 and 180
    and cross_location_buffer_minutes between 0 and 240
  ),
  constraint instructor_workload_limits_sessions_check
    check (max_sessions_per_day between 1 and 16),
  constraint instructor_workload_limits_dates_check
    check (effective_until is null or effective_from <= effective_until),
  constraint instructor_workload_limits_status_check
    check (status in ('active', 'inactive'))
);

create table public.instructor_absences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null,
  reason_category text not null,
  private_note text,
  status text not null default 'reported',
  reported_by_user_id uuid references auth.users (id) on delete set null,
  reported_at timestamptz not null default now(),
  covered_by_user_id uuid references auth.users (id) on delete set null,
  covered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_absences_session_fk
    foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint instructor_absences_reason_check
    check (reason_category in ('illness', 'emergency', 'leave', 'training', 'unavailable', 'other')),
  constraint instructor_absences_status_check
    check (status in ('reported', 'reviewing', 'covered', 'cancelled')),
  constraint instructor_absences_coverage_check
    check (
      (status = 'covered' and covered_by_user_id is not null and covered_at is not null)
      or (status <> 'covered' and covered_by_user_id is null and covered_at is null)
    ),
  constraint instructor_absences_note_size_check
    check (private_note is null or length(private_note) <= 1000),
  constraint instructor_absences_open_unique unique (tenant_id, session_id, instructor_user_id),
  constraint instructor_absences_tenant_id_id_unique unique (tenant_id, id)
);

create table public.instructor_replacement_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  absence_id uuid,
  session_id uuid not null,
  original_instructor_user_id uuid references auth.users (id) on delete set null,
  replacement_instructor_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'draft',
  score integer not null,
  confidence numeric(5, 4) not null,
  reasons_json jsonb not null default '[]'::jsonb,
  source_data_json jsonb not null default '{}'::jsonb,
  proposed_message text not null,
  requested_by_user_id uuid references auth.users (id) on delete set null,
  human_confirmed_at timestamptz,
  confirmed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_replacement_requests_absence_fk
    foreign key (tenant_id, absence_id) references public.instructor_absences (tenant_id, id) on delete set null (absence_id),
  constraint instructor_replacement_requests_session_fk
    foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint instructor_replacement_requests_status_check
    check (status in ('draft', 'ready', 'confirmed', 'declined', 'cancelled', 'superseded')),
  constraint instructor_replacement_requests_score_check check (score between 0 and 100),
  constraint instructor_replacement_requests_confidence_check check (confidence between 0 and 1),
  constraint instructor_replacement_requests_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint instructor_replacement_requests_source_check check (jsonb_typeof(source_data_json) = 'object'),
  constraint instructor_replacement_requests_message_size_check
    check (length(trim(proposed_message)) between 1 and 2000),
  constraint instructor_replacement_requests_confirmation_check
    check (
      (status = 'confirmed' and human_confirmed_at is not null and confirmed_by_user_id is not null)
      or status <> 'confirmed'
    ),
  constraint instructor_replacement_requests_distinct_check
    check (original_instructor_user_id is null or original_instructor_user_id <> replacement_instructor_user_id),
  constraint instructor_replacement_requests_tenant_id_id_unique unique (tenant_id, id)
);

create table public.instructor_replacement_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  request_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  message text not null,
  evidence_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint instructor_replacement_events_request_fk
    foreign key (tenant_id, request_id)
    references public.instructor_replacement_requests (tenant_id, id) on delete cascade,
  constraint instructor_replacement_events_type_check
    check (event_type in ('drafted', 'validated', 'confirmed', 'declined', 'cancelled', 'superseded')),
  constraint instructor_replacement_events_evidence_check check (jsonb_typeof(evidence_json) = 'object'),
  constraint instructor_replacement_events_tenant_id_id_unique unique (tenant_id, id)
);

create index instructor_qualifications_lookup_idx
  on public.instructor_qualifications (tenant_id, instructor_user_id, status, valid_until);
create index instructor_absences_session_idx
  on public.instructor_absences (tenant_id, session_id, status);
create index instructor_replacement_requests_session_idx
  on public.instructor_replacement_requests (tenant_id, session_id, status, created_at desc);
create index instructor_replacement_events_timeline_idx
  on public.instructor_replacement_events (tenant_id, request_id, occurred_at desc);

create trigger instructor_qualifications_set_updated_at
  before update on public.instructor_qualifications
  for each row execute function app_private.set_updated_at();
create trigger instructor_workload_limits_set_updated_at
  before update on public.instructor_workload_limits
  for each row execute function app_private.set_updated_at();
create trigger instructor_absences_set_updated_at
  before update on public.instructor_absences
  for each row execute function app_private.set_updated_at();
create trigger instructor_replacement_requests_set_updated_at
  before update on public.instructor_replacement_requests
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.instructor_qualifications to authenticated;
grant select, insert, update, delete on public.instructor_workload_limits to authenticated;
grant select, insert, update, delete on public.instructor_absences to authenticated;
grant select, insert, update, delete on public.instructor_replacement_requests to authenticated;
grant select, insert on public.instructor_replacement_events to authenticated;
grant all on public.instructor_qualifications to service_role;
grant all on public.instructor_workload_limits to service_role;
grant all on public.instructor_absences to service_role;
grant all on public.instructor_replacement_requests to service_role;
grant all on public.instructor_replacement_events to service_role;

alter table public.instructor_qualifications enable row level security;
alter table public.instructor_qualifications force row level security;
alter table public.instructor_workload_limits enable row level security;
alter table public.instructor_workload_limits force row level security;
alter table public.instructor_absences enable row level security;
alter table public.instructor_absences force row level security;
alter table public.instructor_replacement_requests enable row level security;
alter table public.instructor_replacement_requests force row level security;
alter table public.instructor_replacement_events enable row level security;
alter table public.instructor_replacement_events force row level security;

create policy "Tenant admins manage instructor qualifications"
  on public.instructor_qualifications for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Instructors view own qualifications"
  on public.instructor_qualifications for select to authenticated
  using (
    instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );
create policy "Tenant admins manage instructor workload limits"
  on public.instructor_workload_limits for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Instructors view own workload limits"
  on public.instructor_workload_limits for select to authenticated
  using (
    instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );
create policy "Tenant admins manage instructor absences"
  on public.instructor_absences for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Instructors view own absences"
  on public.instructor_absences for select to authenticated
  using (
    instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );
create policy "Tenant admins manage replacement requests"
  on public.instructor_replacement_requests for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Replacement instructors view confirmed requests"
  on public.instructor_replacement_requests for select to authenticated
  using (
    status = 'confirmed'
    and replacement_instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );
create policy "Tenant admins read replacement events"
  on public.instructor_replacement_events for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins create replacement events"
  on public.instructor_replacement_events for insert to authenticated
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
