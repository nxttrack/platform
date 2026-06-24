create table public.programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programs_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint programs_status_check check (status in ('draft', 'active', 'archived')),
  constraint programs_unique_code unique (tenant_id, code)
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stages_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint stages_status_check check (status in ('draft', 'active', 'archived')),
  constraint stages_unique_code unique (program_id, code)
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  billing_interval text not null default 'monthly',
  price_cents integer not null default 0,
  currency text not null default 'EUR',
  lesson_frequency_per_week numeric(4, 2) not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint subscription_plans_interval_check check (billing_interval in ('weekly', 'monthly', 'quarterly', 'yearly', 'manual')),
  constraint subscription_plans_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint subscription_plans_price_check check (price_cents >= 0),
  constraint subscription_plans_frequency_check check (lesson_frequency_per_week > 0),
  constraint subscription_plans_status_check check (status in ('draft', 'active', 'archived')),
  constraint subscription_plans_unique_code unique (tenant_id, code)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  resource_type text not null default 'space',
  location_name text,
  capacity integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint resources_capacity_check check (capacity > 0),
  constraint resources_status_check check (status in ('active', 'inactive', 'maintenance')),
  constraint resources_unique_code unique (tenant_id, code)
);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  display_name text not null,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructors_status_check check (status in ('active', 'inactive')),
  constraint instructors_unique_email unique (tenant_id, email)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  stage_id uuid not null references public.stages (id) on delete restrict,
  resource_id uuid references public.resources (id) on delete set null,
  instructor_id uuid references public.instructors (id) on delete set null,
  code text not null,
  name text not null,
  weekday smallint not null,
  starts_at time not null,
  ends_at time not null,
  capacity integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint groups_weekday_check check (weekday between 1 and 7),
  constraint groups_time_check check (starts_at < ends_at),
  constraint groups_capacity_check check (capacity > 0),
  constraint groups_status_check check (status in ('draft', 'active', 'paused', 'archived')),
  constraint groups_unique_code unique (tenant_id, code)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  instructor_id uuid references public.instructors (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_check check (starts_at < ends_at),
  constraint sessions_status_check check (status in ('scheduled', 'completed', 'cancelled')),
  constraint sessions_unique_group_start unique (group_id, starts_at)
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  external_reference text,
  display_name text not null,
  birthdate date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participants_status_check check (status in ('active', 'inactive', 'archived')),
  constraint participants_unique_reference unique (tenant_id, external_reference)
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  external_reference text,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  current_stage_id uuid references public.stages (id) on delete set null,
  subscription_plan_id uuid references public.subscription_plans (id) on delete set null,
  status text not null default 'active',
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollments_dates_check check (ended_on is null or started_on <= ended_on),
  constraint enrollments_status_check check (status in ('pending', 'active', 'paused', 'completed', 'cancelled')),
  constraint enrollments_unique_reference unique (tenant_id, external_reference)
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  status text not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_memberships_dates_check check (ends_on is null or starts_on <= ends_on),
  constraint group_memberships_status_check check (status in ('planned', 'active', 'ended', 'cancelled')),
  constraint group_memberships_unique_start unique (enrollment_id, group_id, starts_on)
);

create table public.progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete set null,
  status text not null default 'observed',
  score numeric(5, 2),
  note text,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint progress_score_check check (score is null or score between 0 and 100),
  constraint progress_status_check check (status in ('observed', 'in_progress', 'passed', 'needs_attention'))
);

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid references public.programs (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badges_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint badges_status_check check (status in ('draft', 'active', 'archived')),
  constraint badges_unique_code unique (tenant_id, code)
);

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  certificate_number text,
  title text not null,
  status text not null default 'draft',
  issued_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint certificates_status_check check (status in ('draft', 'issued', 'revoked')),
  constraint certificates_unique_number unique (tenant_id, certificate_number)
);

create index programs_tenant_id_idx on public.programs (tenant_id);
create index stages_tenant_id_idx on public.stages (tenant_id);
create index stages_program_id_idx on public.stages (program_id);
create index subscription_plans_tenant_id_idx on public.subscription_plans (tenant_id);
create index resources_tenant_id_idx on public.resources (tenant_id);
create index instructors_tenant_id_idx on public.instructors (tenant_id);
create index groups_tenant_id_idx on public.groups (tenant_id);
create index groups_program_stage_idx on public.groups (program_id, stage_id);
create index groups_resource_id_idx on public.groups (resource_id);
create index groups_instructor_id_idx on public.groups (instructor_id);
create index sessions_tenant_id_idx on public.sessions (tenant_id);
create index sessions_group_id_idx on public.sessions (group_id);
create index sessions_starts_at_idx on public.sessions (starts_at);
create index participants_tenant_id_idx on public.participants (tenant_id);
create index enrollments_tenant_id_idx on public.enrollments (tenant_id);
create index enrollments_participant_id_idx on public.enrollments (participant_id);
create index enrollments_program_stage_idx on public.enrollments (program_id, current_stage_id);
create index group_memberships_tenant_id_idx on public.group_memberships (tenant_id);
create index group_memberships_enrollment_id_idx on public.group_memberships (enrollment_id);
create index group_memberships_group_id_idx on public.group_memberships (group_id);
create index progress_tenant_id_idx on public.progress (tenant_id);
create index progress_enrollment_id_idx on public.progress (enrollment_id);
create index badges_tenant_id_idx on public.badges (tenant_id);
create index certificates_tenant_id_idx on public.certificates (tenant_id);
create index certificates_participant_id_idx on public.certificates (participant_id);

create trigger programs_set_updated_at
  before update on public.programs
  for each row execute function app_private.set_updated_at();

create trigger stages_set_updated_at
  before update on public.stages
  for each row execute function app_private.set_updated_at();

create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function app_private.set_updated_at();

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function app_private.set_updated_at();

create trigger instructors_set_updated_at
  before update on public.instructors
  for each row execute function app_private.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function app_private.set_updated_at();

create trigger sessions_set_updated_at
  before update on public.sessions
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

create trigger progress_set_updated_at
  before update on public.progress
  for each row execute function app_private.set_updated_at();

create trigger badges_set_updated_at
  before update on public.badges
  for each row execute function app_private.set_updated_at();

create trigger certificates_set_updated_at
  before update on public.certificates
  for each row execute function app_private.set_updated_at();

grant select on public.programs to authenticated;
grant select on public.stages to authenticated;
grant select on public.subscription_plans to authenticated;
grant select on public.resources to authenticated;
grant select on public.instructors to authenticated;
grant select on public.groups to authenticated;
grant select on public.sessions to authenticated;
grant select on public.participants to authenticated;
grant select on public.enrollments to authenticated;
grant select on public.group_memberships to authenticated;
grant select on public.progress to authenticated;
grant select on public.badges to authenticated;
grant select on public.certificates to authenticated;

grant all on public.programs to service_role;
grant all on public.stages to service_role;
grant all on public.subscription_plans to service_role;
grant all on public.resources to service_role;
grant all on public.instructors to service_role;
grant all on public.groups to service_role;
grant all on public.sessions to service_role;
grant all on public.participants to service_role;
grant all on public.enrollments to service_role;
grant all on public.group_memberships to service_role;
grant all on public.progress to service_role;
grant all on public.badges to service_role;
grant all on public.certificates to service_role;

alter table public.programs enable row level security;
alter table public.stages enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.resources enable row level security;
alter table public.instructors enable row level security;
alter table public.groups enable row level security;
alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.enrollments enable row level security;
alter table public.group_memberships enable row level security;
alter table public.progress enable row level security;
alter table public.badges enable row level security;
alter table public.certificates enable row level security;

create policy "Tenant members can view programs"
  on public.programs
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view stages"
  on public.stages
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view subscription plans"
  on public.subscription_plans
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view resources"
  on public.resources
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can view instructors"
  on public.instructors
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant members can view groups"
  on public.groups
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant members can view sessions"
  on public.sessions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can view participants"
  on public.participants
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can view enrollments"
  on public.enrollments
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can view group memberships"
  on public.group_memberships
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can view progress"
  on public.progress
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant members can view badges"
  on public.badges
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can view certificates"
  on public.certificates
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
  diploma_b_program_id uuid;
  badje_1_stage_id uuid;
  badje_2_stage_id uuid;
  badje_3_stage_id uuid;
  afzwem_stage_id uuid;
  plan_once_id uuid;
  plan_twice_id uuid;
  lane_1_id uuid;
  lane_2_id uuid;
  sophie_id uuid;
  milan_id uuid;
  zeesterren_group_id uuid;
  dolfijnen_group_id uuid;
  emma_id uuid;
  noah_id uuid;
  emma_enrollment_id uuid;
  noah_enrollment_id uuid;
begin
  insert into public.tenants (slug, name, sector, status)
  values ('aquaswim-demo', 'AquaSwim Demo', 'swim_school', 'active')
  on conflict (slug) do update
    set name = excluded.name,
        sector = excluded.sector,
        status = excluded.status
  returning id into demo_tenant_id;

  insert into public.tenant_settings (tenant_id, terminology_sector, locale, timezone)
  values (demo_tenant_id, 'swim_school', 'nl-NL', 'Europe/Amsterdam')
  on conflict (tenant_id) do update
    set terminology_sector = excluded.terminology_sector,
        locale = excluded.locale,
        timezone = excluded.timezone;

  insert into public.programs (tenant_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, 'zwemdiploma-a', 'Zwemdiploma A', 'Basistraject richting diploma A.', 'active', 10)
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into diploma_a_program_id;

  insert into public.programs (tenant_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, 'zwemdiploma-b', 'Zwemdiploma B', 'Vervolgtraject na diploma A.', 'active', 20)
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into diploma_b_program_id;

  insert into public.stages (tenant_id, program_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, diploma_a_program_id, 'badje-1', 'Badje 1', 'Watergewenning en veilig bewegen in het water.', 'active', 10)
  on conflict (program_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into badje_1_stage_id;

  insert into public.stages (tenant_id, program_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, diploma_a_program_id, 'badje-2', 'Badje 2', 'Drijven, draaien en eerste technische zwemslagen.', 'active', 20)
  on conflict (program_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into badje_2_stage_id;

  insert into public.stages (tenant_id, program_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, diploma_a_program_id, 'badje-3', 'Badje 3', 'Techniek verdiepen en zelfstandig baantjes zwemmen.', 'active', 30)
  on conflict (program_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into badje_3_stage_id;

  insert into public.stages (tenant_id, program_id, code, name, description, status, sort_order)
  values
    (demo_tenant_id, diploma_a_program_id, 'afzwem-ready', 'Afzwem-ready', 'Leerling is klaar voor het afzwemmoment.', 'active', 40)
  on conflict (program_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        status = excluded.status,
        sort_order = excluded.sort_order
  returning id into afzwem_stage_id;

  insert into public.subscription_plans (tenant_id, code, name, description, billing_interval, price_cents, currency, lesson_frequency_per_week, status)
  values
    (demo_tenant_id, 'zwemles-1x-week', 'Zwemles 1x per week', 'Handmatig gefactureerd maandabonnement voor een wekelijkse les.', 'monthly', 6995, 'EUR', 1, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        billing_interval = excluded.billing_interval,
        price_cents = excluded.price_cents,
        currency = excluded.currency,
        lesson_frequency_per_week = excluded.lesson_frequency_per_week,
        status = excluded.status
  returning id into plan_once_id;

  insert into public.subscription_plans (tenant_id, code, name, description, billing_interval, price_cents, currency, lesson_frequency_per_week, status)
  values
    (demo_tenant_id, 'zwemles-2x-week', 'Zwemles 2x per week', 'Handmatig gefactureerd maandabonnement voor twee lessen per week.', 'monthly', 11995, 'EUR', 2, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        billing_interval = excluded.billing_interval,
        price_cents = excluded.price_cents,
        currency = excluded.currency,
        lesson_frequency_per_week = excluded.lesson_frequency_per_week,
        status = excluded.status
  returning id into plan_twice_id;

  insert into public.resources (tenant_id, code, name, resource_type, location_name, capacity, status)
  values
    (demo_tenant_id, 'bad-1-baan-1', 'Bad 1 - baan 1', 'lane', 'Sportbad', 8, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        resource_type = excluded.resource_type,
        location_name = excluded.location_name,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into lane_1_id;

  insert into public.resources (tenant_id, code, name, resource_type, location_name, capacity, status)
  values
    (demo_tenant_id, 'bad-1-baan-2', 'Bad 1 - baan 2', 'lane', 'Sportbad', 8, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        resource_type = excluded.resource_type,
        location_name = excluded.location_name,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into lane_2_id;

  insert into public.instructors (tenant_id, display_name, email, status)
  values
    (demo_tenant_id, 'Sophie Jansen', 'sophie@aquaswim-demo.nl', 'active')
  on conflict (tenant_id, email) do update
    set display_name = excluded.display_name,
        status = excluded.status
  returning id into sophie_id;

  insert into public.instructors (tenant_id, display_name, email, status)
  values
    (demo_tenant_id, 'Milan de Vries', 'milan@aquaswim-demo.nl', 'active')
  on conflict (tenant_id, email) do update
    set display_name = excluded.display_name,
        status = excluded.status
  returning id into milan_id;

  insert into public.groups (tenant_id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_1_stage_id, lane_1_id, sophie_id, 'zeesterren-a1', 'Zeesterren A1', 3, '15:30', '16:15', 8, 'active')
  on conflict (tenant_id, code) do update
    set program_id = excluded.program_id,
        stage_id = excluded.stage_id,
        resource_id = excluded.resource_id,
        instructor_id = excluded.instructor_id,
        name = excluded.name,
        weekday = excluded.weekday,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into zeesterren_group_id;

  insert into public.groups (tenant_id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_2_stage_id, lane_2_id, milan_id, 'dolfijnen-a2', 'Dolfijnen A2', 5, '16:30', '17:15', 8, 'active')
  on conflict (tenant_id, code) do update
    set program_id = excluded.program_id,
        stage_id = excluded.stage_id,
        resource_id = excluded.resource_id,
        instructor_id = excluded.instructor_id,
        name = excluded.name,
        weekday = excluded.weekday,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into dolfijnen_group_id;

  insert into public.sessions (tenant_id, group_id, resource_id, instructor_id, starts_at, ends_at, status)
  values
    (demo_tenant_id, zeesterren_group_id, lane_1_id, sophie_id, '2026-07-01 15:30:00+02', '2026-07-01 16:15:00+02', 'scheduled'),
    (demo_tenant_id, dolfijnen_group_id, lane_2_id, milan_id, '2026-07-03 16:30:00+02', '2026-07-03 17:15:00+02', 'scheduled')
  on conflict (group_id, starts_at) do update
    set resource_id = excluded.resource_id,
        instructor_id = excluded.instructor_id,
        ends_at = excluded.ends_at,
        status = excluded.status;

  insert into public.participants (tenant_id, external_reference, display_name, birthdate, status)
  values
    (demo_tenant_id, 'child-emma-devries', 'Emma de Vries', '2019-04-12', 'active')
  on conflict (tenant_id, external_reference) do update
    set display_name = excluded.display_name,
        birthdate = excluded.birthdate,
        status = excluded.status
  returning id into emma_id;

  insert into public.participants (tenant_id, external_reference, display_name, birthdate, status)
  values
    (demo_tenant_id, 'child-noah-bakker', 'Noah Bakker', '2018-11-02', 'active')
  on conflict (tenant_id, external_reference) do update
    set display_name = excluded.display_name,
        birthdate = excluded.birthdate,
        status = excluded.status
  returning id into noah_id;

  insert into public.enrollments (tenant_id, external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on)
  values
    (demo_tenant_id, 'enrollment-emma-a', emma_id, diploma_a_program_id, badje_1_stage_id, plan_once_id, 'active', '2026-06-01')
  on conflict (tenant_id, external_reference) do update
    set participant_id = excluded.participant_id,
        program_id = excluded.program_id,
        current_stage_id = excluded.current_stage_id,
        subscription_plan_id = excluded.subscription_plan_id,
        status = excluded.status,
        started_on = excluded.started_on
  returning id into emma_enrollment_id;

  insert into public.enrollments (tenant_id, external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on)
  values
    (demo_tenant_id, 'enrollment-noah-a', noah_id, diploma_a_program_id, badje_2_stage_id, plan_once_id, 'active', '2026-05-15')
  on conflict (tenant_id, external_reference) do update
    set participant_id = excluded.participant_id,
        program_id = excluded.program_id,
        current_stage_id = excluded.current_stage_id,
        subscription_plan_id = excluded.subscription_plan_id,
        status = excluded.status,
        started_on = excluded.started_on
  returning id into noah_enrollment_id;

  insert into public.group_memberships (tenant_id, enrollment_id, group_id, status, starts_on)
  values
    (demo_tenant_id, emma_enrollment_id, zeesterren_group_id, 'active', '2026-06-01'),
    (demo_tenant_id, noah_enrollment_id, dolfijnen_group_id, 'active', '2026-05-15')
  on conflict (enrollment_id, group_id, starts_on) do update
    set status = excluded.status;

  insert into public.progress (tenant_id, enrollment_id, stage_id, status, score, note, assessed_at)
  values
    (demo_tenant_id, emma_enrollment_id, badje_1_stage_id, 'in_progress', 42, 'Watergewenning gaat goed; drijven blijft aandachtspunt.', '2026-06-18 16:00:00+02'),
    (demo_tenant_id, noah_enrollment_id, badje_2_stage_id, 'passed', 88, 'Klaar om door te stromen naar Badje 3.', '2026-06-20 17:00:00+02');

  insert into public.badges (tenant_id, program_id, stage_id, code, name, description, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_1_stage_id, 'waterheld', 'Waterheld', 'Eerste zelfverzekerde stappen in het water.', 'active'),
    (demo_tenant_id, diploma_a_program_id, badje_2_stage_id, 'super-drijver', 'Super drijver', 'Mooi stabiel drijven op buik en rug.', 'active')
  on conflict (tenant_id, code) do update
    set program_id = excluded.program_id,
        stage_id = excluded.stage_id,
        name = excluded.name,
        description = excluded.description,
        status = excluded.status;

  insert into public.certificates (tenant_id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on)
  values
    (demo_tenant_id, noah_enrollment_id, noah_id, diploma_a_program_id, 'AQUA-DEMO-A-0001', 'Zwemdiploma A', 'draft', null)
  on conflict (tenant_id, certificate_number) do update
    set enrollment_id = excluded.enrollment_id,
        participant_id = excluded.participant_id,
        program_id = excluded.program_id,
        title = excluded.title,
        status = excluded.status,
        issued_on = excluded.issued_on;
end $$;
