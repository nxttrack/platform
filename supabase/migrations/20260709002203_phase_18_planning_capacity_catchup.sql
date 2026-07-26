alter table public.tenant_settings
  add column if not exists catch_up_requires_admin_approval boolean not null default true,
  add column if not exists catch_up_booking_window_days integer not null default 30;

alter table public.tenant_settings
  drop constraint if exists tenant_settings_catch_up_booking_window_check,
  add constraint tenant_settings_catch_up_booking_window_check check (catch_up_booking_window_days between 1 and 180);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catch_up_credits_tenant_id_id_unique'
      and conrelid = 'public.catch_up_credits'::regclass
  ) then
    alter table public.catch_up_credits
      add constraint catch_up_credits_tenant_id_id_unique unique (tenant_id, id);
  end if;
end $$;

create table public.instructor_availability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  instructor_user_id uuid not null references auth.users (id) on delete cascade,
  weekday integer not null,
  starts_at time not null,
  ends_at time not null,
  availability_type text not null default 'available',
  status text not null default 'active',
  starts_on date,
  ends_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_availability_weekday_check check (weekday between 0 and 6),
  constraint instructor_availability_time_check check (starts_at < ends_at),
  constraint instructor_availability_type_check check (availability_type in ('available', 'unavailable')),
  constraint instructor_availability_status_check check (status in ('active', 'inactive')),
  constraint instructor_availability_date_check check (starts_on is null or ends_on is null or starts_on <= ends_on),
  constraint instructor_availability_tenant_id_id_unique unique (tenant_id, id)
);

create table public.catch_up_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  credit_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  requested_by_user_id uuid not null references auth.users (id) on delete restrict,
  preferred_session_id uuid not null,
  assigned_session_id uuid,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users (id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catch_up_requests_credit_fk foreign key (tenant_id, credit_id) references public.catch_up_credits (tenant_id, id) on delete cascade,
  constraint catch_up_requests_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint catch_up_requests_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint catch_up_requests_preferred_session_fk foreign key (tenant_id, preferred_session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint catch_up_requests_assigned_session_fk foreign key (tenant_id, assigned_session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint catch_up_requests_status_check check (status in ('requested', 'approved', 'declined', 'cancelled', 'used')),
  constraint catch_up_requests_decision_check check (
    (status in ('approved', 'declined') and decided_at is not null and decided_by_user_id is not null)
    or status not in ('approved', 'declined')
  ),
  constraint catch_up_requests_assignment_check check (
    (status in ('approved', 'used') and assigned_session_id is not null)
    or status not in ('approved', 'used')
  ),
  constraint catch_up_requests_tenant_id_id_unique unique (tenant_id, id)
);

create unique index catch_up_requests_open_credit_idx
  on public.catch_up_requests (tenant_id, credit_id)
  where status in ('requested', 'approved');

create index instructor_availability_tenant_user_idx on public.instructor_availability (tenant_id, instructor_user_id, weekday, status);
create index instructor_availability_window_idx on public.instructor_availability (tenant_id, weekday, starts_at, ends_at) where status = 'active';
create index catch_up_requests_tenant_status_idx on public.catch_up_requests (tenant_id, status, requested_at desc);
create index catch_up_requests_session_idx on public.catch_up_requests (tenant_id, assigned_session_id, status);
create index catch_up_requests_participant_idx on public.catch_up_requests (tenant_id, participant_id, status);

create trigger instructor_availability_set_updated_at
  before update on public.instructor_availability
  for each row execute function app_private.set_updated_at();

create trigger catch_up_requests_set_updated_at
  before update on public.catch_up_requests
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.instructor_availability to authenticated;
grant select, insert, update, delete on public.catch_up_requests to authenticated;

grant all on public.instructor_availability to service_role;
grant all on public.catch_up_requests to service_role;

alter table public.instructor_availability enable row level security;
alter table public.catch_up_requests enable row level security;

create policy "Tenant staff and instructors can view availability"
  on public.instructor_availability
  for select
  to authenticated
  using (
    instructor_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );

create policy "Tenant staff can manage availability"
  on public.instructor_availability
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Instructors can manage own availability"
  on public.instructor_availability
  for all
  to authenticated
  using (
    instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  )
  with check (
    instructor_user_id = (select auth.uid())
    and app_private.current_user_has_tenant_role(tenant_id, array['instructor'])
  );

create policy "Scoped users can view catch-up requests"
  on public.catch_up_requests
  for select
  to authenticated
  using (
    requested_by_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  );

create policy "Guardians can create catch-up requests"
  on public.catch_up_requests
  for insert
  to authenticated
  with check (
    requested_by_user_id = (select auth.uid())
    and (
      status = 'requested'
      or (
        status = 'approved'
        and preferred_session_id = assigned_session_id
        and decided_at is not null
        and decided_by_user_id = (select auth.uid())
      )
    )
    and app_private.current_user_can_view_participant(participant_id)
  );

create policy "Guardians can cancel own catch-up requests"
  on public.catch_up_requests
  for update
  to authenticated
  using (
    requested_by_user_id = (select auth.uid())
    and status = 'requested'
    and app_private.current_user_can_view_participant(participant_id)
  )
  with check (
    requested_by_user_id = (select auth.uid())
    and status = 'cancelled'
    and app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage catch-up requests"
  on public.catch_up_requests
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
