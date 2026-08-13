-- Structured group planning, separate capacity buckets and concurrency-safe
-- publication. Existing resources, sessions, availability and qualifications
-- remain authoritative and are extended rather than replaced.

create extension if not exists btree_gist with schema extensions;

alter table public.resources
  add column safety_capacity integer,
  add constraint resources_safety_capacity_check
    check (safety_capacity is null or safety_capacity >= 0);

update public.resources
set safety_capacity = capacity
where safety_capacity is null and capacity is not null;

create table public.resource_location_profiles (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  resource_id uuid not null,
  address_line_1 text not null,
  address_line_2 text,
  postal_code text not null,
  city text not null,
  country_code text not null default 'NL',
  timezone text not null default 'Europe/Amsterdam',
  public_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, resource_id),
  constraint resource_location_profiles_resource_fk
    foreign key (tenant_id, resource_id)
    references public.resources (tenant_id, id) on delete cascade,
  constraint resource_location_profiles_country_check
    check (country_code ~ '^[A-Z]{2}$'),
  constraint resource_location_profiles_text_check check (
    length(trim(address_line_1)) between 1 and 160
    and length(trim(postal_code)) between 2 and 20
    and length(trim(city)) between 1 and 120
  ),
  constraint resource_location_profiles_public_notes_check
    check (public_notes is null or length(public_notes) <= 500)
);

create table public.resource_opening_hours (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  resource_id uuid not null,
  weekday integer not null,
  opens_at time not null,
  closes_at time not null,
  effective_from date,
  effective_until date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_opening_hours_resource_fk
    foreign key (tenant_id, resource_id)
    references public.resources (tenant_id, id) on delete cascade,
  constraint resource_opening_hours_weekday_check check (weekday between 1 and 7),
  constraint resource_opening_hours_time_check check (opens_at < closes_at),
  constraint resource_opening_hours_period_check
    check (effective_from is null or effective_until is null or effective_from <= effective_until),
  constraint resource_opening_hours_status_check check (status in ('active', 'inactive')),
  constraint resource_opening_hours_unique
    unique nulls not distinct (
      tenant_id, resource_id, weekday, opens_at, closes_at, effective_from, effective_until
    ),
  constraint resource_opening_hours_tenant_id_id_unique unique (tenant_id, id)
);

create table public.lesson_time_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  weekday integer not null,
  local_start_time time not null,
  local_end_time time not null,
  recurrence_interval_weeks integer not null default 1,
  status text not null default 'active',
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_time_templates_name_check check (length(trim(name)) between 2 and 120),
  constraint lesson_time_templates_weekday_check check (weekday between 1 and 7),
  constraint lesson_time_templates_time_check check (local_start_time < local_end_time),
  constraint lesson_time_templates_interval_check check (recurrence_interval_weeks between 1 and 8),
  constraint lesson_time_templates_status_check check (status in ('active', 'inactive', 'archived')),
  constraint lesson_time_templates_unique
    unique (tenant_id, weekday, local_start_time, local_end_time, recurrence_interval_weeks),
  constraint lesson_time_templates_tenant_id_id_unique unique (tenant_id, id)
);

create table public.tenant_planning_policies (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  qualification_enforcement text not null default 'blocking',
  opening_hours_enforcement text not null default 'advisory',
  default_capacity_borrowing text not null default 'none',
  maximum_schedule_horizon_days integer not null default 730,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_planning_policies_qualification_check
    check (qualification_enforcement in ('blocking', 'advisory')),
  constraint tenant_planning_policies_opening_check
    check (opening_hours_enforcement in ('blocking', 'advisory')),
  constraint tenant_planning_policies_borrowing_check
    check (default_capacity_borrowing in ('none', 'flex_from_regular', 'bidirectional')),
  constraint tenant_planning_policies_horizon_check
    check (maximum_schedule_horizon_days between 7 and 1095)
);

insert into public.tenant_planning_policies (tenant_id)
select tenant.id from public.tenants tenant
on conflict (tenant_id) do nothing;

create or replace function app_private.ensure_tenant_planning_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.tenant_planning_policies (tenant_id)
  values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

create trigger tenants_ensure_planning_policy
  after insert on public.tenants
  for each row execute function app_private.ensure_tenant_planning_policy();

alter table public.groups
  add column offering_type text not null default 'regular',
  add column regular_capacity integer not null default 8,
  add column flex_capacity integer not null default 0,
  add column trial_capacity integer not null default 0,
  add column hard_capacity integer not null default 8,
  add column capacity_borrowing text not null default 'none';

update public.groups
set regular_capacity = capacity,
    flex_capacity = 0,
    trial_capacity = 0,
    hard_capacity = capacity,
    capacity_borrowing = 'none';

alter table public.groups
  add constraint groups_offering_type_check
    check (offering_type in ('regular', 'vacation_course', 'turbo_course', 'temporary_series')),
  add constraint groups_capacity_buckets_nonnegative_check check (
    regular_capacity >= 0 and flex_capacity >= 0
    and trial_capacity >= 0 and hard_capacity >= 0
  ),
  add constraint groups_capacity_buckets_hard_check
    check (regular_capacity + flex_capacity + trial_capacity <= hard_capacity),
  add constraint groups_hard_capacity_compatibility_check
    check (capacity = hard_capacity),
  add constraint groups_capacity_borrowing_check
    check (capacity_borrowing in ('none', 'flex_from_regular', 'bidirectional'));

alter table public.group_memberships
  add column capacity_bucket text not null default 'regular';

update public.group_memberships
set capacity_bucket = case when status = 'trial' then 'trial' else 'regular' end;

alter table public.group_memberships
  add constraint group_memberships_capacity_bucket_check
    check (capacity_bucket in ('regular', 'flex', 'trial')),
  add constraint group_memberships_trial_bucket_check
    check (status <> 'trial' or capacity_bucket = 'trial');

create table public.group_schedule_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null,
  lesson_time_template_id uuid,
  resource_id uuid not null,
  timezone text not null,
  weekday integer not null,
  local_start_time time not null,
  local_end_time time not null,
  recurrence_interval_weeks integer not null default 1,
  starts_on date not null,
  ends_on date not null,
  revision integer not null default 1,
  status text not null default 'draft',
  published_at timestamptz,
  published_by_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_schedule_rules_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id) on delete restrict,
  constraint group_schedule_rules_template_fk
    foreign key (tenant_id, lesson_time_template_id)
    references public.lesson_time_templates (tenant_id, id) on delete restrict,
  constraint group_schedule_rules_resource_fk
    foreign key (tenant_id, resource_id)
    references public.resources (tenant_id, id) on delete restrict,
  constraint group_schedule_rules_weekday_check check (weekday between 1 and 7),
  constraint group_schedule_rules_time_check check (local_start_time < local_end_time),
  constraint group_schedule_rules_interval_check check (recurrence_interval_weeks between 1 and 8),
  constraint group_schedule_rules_period_check check (starts_on <= ends_on),
  constraint group_schedule_rules_revision_check check (revision > 0),
  constraint group_schedule_rules_status_check check (status in ('draft', 'published', 'archived')),
  constraint group_schedule_rules_publish_check check (
    (status = 'published' and published_at is not null and published_by_user_id is not null)
    or status <> 'published'
  ),
  constraint group_schedule_rules_unique_revision unique (tenant_id, group_id, revision),
  constraint group_schedule_rules_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.sessions
  add column schedule_rule_id uuid,
  add column local_occurrence_date date,
  add column schedule_revision integer,
  add column published_at timestamptz,
  add constraint sessions_schedule_rule_fk
    foreign key (tenant_id, schedule_rule_id)
    references public.group_schedule_rules (tenant_id, id) on delete restrict,
  add constraint sessions_schedule_revision_check
    check (schedule_revision is null or schedule_revision > 0),
  add constraint sessions_schedule_lineage_check check (
    (schedule_rule_id is null and local_occurrence_date is null and schedule_revision is null)
    or (schedule_rule_id is not null and local_occurrence_date is not null and schedule_revision is not null)
  );

create unique index sessions_schedule_occurrence_unique
  on public.sessions (tenant_id, schedule_rule_id, local_occurrence_date)
  where schedule_rule_id is not null;

create table public.session_resource_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  resource_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at timestamptz not null default now(),
  constraint session_resource_reservations_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete cascade,
  constraint session_resource_reservations_resource_fk
    foreign key (tenant_id, resource_id)
    references public.resources (tenant_id, id) on delete restrict,
  constraint session_resource_reservations_time_check check (starts_at < ends_at),
  constraint session_resource_reservations_status_check check (status in ('active', 'released')),
  constraint session_resource_reservations_unique unique (tenant_id, session_id, resource_id),
  constraint session_resource_reservations_tenant_id_id_unique unique (tenant_id, id),
  exclude using gist (
    tenant_id with =,
    resource_id with =,
    slot with &&
  ) where (status = 'active')
);

create table public.session_instructor_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  instructor_user_id uuid not null references auth.users (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active',
  slot tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at timestamptz not null default now(),
  constraint session_instructor_reservations_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id) on delete cascade,
  constraint session_instructor_reservations_time_check check (starts_at < ends_at),
  constraint session_instructor_reservations_status_check check (status in ('active', 'released')),
  constraint session_instructor_reservations_unique
    unique (tenant_id, session_id, instructor_user_id),
  constraint session_instructor_reservations_tenant_id_id_unique unique (tenant_id, id),
  exclude using gist (
    tenant_id with =,
    instructor_user_id with =,
    slot with &&
  ) where (status = 'active')
);

create table public.planning_conflict_evaluations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  evaluation_mode text not null,
  request_hash text not null,
  input_json jsonb not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint planning_conflict_evaluations_mode_check
    check (evaluation_mode in ('advisory', 'transactional')),
  constraint planning_conflict_evaluations_hash_check
    check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint planning_conflict_evaluations_input_check check (jsonb_typeof(input_json) = 'object'),
  constraint planning_conflict_evaluations_result_check check (jsonb_typeof(result_json) = 'object'),
  constraint planning_conflict_evaluations_tenant_id_id_unique unique (tenant_id, id)
);

create index resource_opening_hours_lookup_idx
  on public.resource_opening_hours (tenant_id, resource_id, weekday, status);
create index lesson_time_templates_lookup_idx
  on public.lesson_time_templates (tenant_id, status, weekday, local_start_time);
create index group_schedule_rules_lookup_idx
  on public.group_schedule_rules (tenant_id, status, starts_on, ends_on);
create index session_resource_reservations_lookup_idx
  on public.session_resource_reservations (tenant_id, resource_id, starts_at, ends_at)
  where status = 'active';
create index session_instructor_reservations_lookup_idx
  on public.session_instructor_reservations (tenant_id, instructor_user_id, starts_at, ends_at)
  where status = 'active';
create index planning_conflict_evaluations_tenant_idx
  on public.planning_conflict_evaluations (tenant_id, created_at desc);
create index group_memberships_bucket_idx
  on public.group_memberships (tenant_id, group_id, capacity_bucket, status);

create trigger resource_location_profiles_set_updated_at
  before update on public.resource_location_profiles
  for each row execute function app_private.set_updated_at();
create trigger resource_opening_hours_set_updated_at
  before update on public.resource_opening_hours
  for each row execute function app_private.set_updated_at();
create trigger lesson_time_templates_set_updated_at
  before update on public.lesson_time_templates
  for each row execute function app_private.set_updated_at();
create trigger tenant_planning_policies_set_updated_at
  before update on public.tenant_planning_policies
  for each row execute function app_private.set_updated_at();
create trigger group_schedule_rules_set_updated_at
  before update on public.group_schedule_rules
  for each row execute function app_private.set_updated_at();

create or replace function app_private.enforce_group_capacity_contract()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resource_limit integer;
begin
  if tg_op = 'INSERT'
    and new.capacity <> new.hard_capacity
    and new.regular_capacity = 8
    and new.flex_capacity = 0
    and new.trial_capacity = 0
    and new.hard_capacity = 8
  then
    new.regular_capacity := new.capacity;
    new.hard_capacity := new.capacity;
  elsif tg_op = 'UPDATE'
    and new.capacity <> old.capacity
    and new.hard_capacity = old.hard_capacity
  then
    new.hard_capacity := new.capacity;
  else
    new.capacity := new.hard_capacity;
  end if;

  if new.regular_capacity + new.flex_capacity + new.trial_capacity > new.hard_capacity then
    raise exception 'Capacity buckets exceed the physical hard capacity';
  end if;

  if new.default_resource_id is not null then
    select coalesce(resource.safety_capacity, resource.capacity)
      into resource_limit
    from public.resources resource
    where resource.tenant_id = new.tenant_id
      and resource.id = new.default_resource_id
      and resource.status = 'active';
    if not found then
      raise exception 'Active structured resource not found';
    end if;
    if resource_limit is not null and new.hard_capacity > resource_limit then
      raise exception 'Group hard capacity exceeds resource safety capacity';
    end if;
  end if;
  return new;
end;
$$;

create trigger groups_capacity_contract
  before insert or update of capacity, hard_capacity, regular_capacity, flex_capacity,
    trial_capacity, default_resource_id
  on public.groups
  for each row execute function app_private.enforce_group_capacity_contract();

create or replace function app_private.enforce_membership_capacity_bucket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group public.groups%rowtype;
  regular_used numeric := 0;
  flex_used numeric := 0;
  trial_used numeric := 0;
  total_used numeric := 0;
  bucket_limit numeric := 0;
begin
  if new.status not in ('active', 'trial') then
    return new;
  end if;
  if new.status = 'trial' and new.capacity_bucket <> 'trial' then
    raise exception 'Trial memberships must use the trial capacity bucket';
  end if;

  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id and lesson_group.id = new.group_id
  for update;
  if target_group.id is null then raise exception 'Group not found'; end if;

  select
    coalesce(sum(membership.capacity_weight) filter (where membership.capacity_bucket = 'regular'), 0),
    coalesce(sum(membership.capacity_weight) filter (where membership.capacity_bucket = 'flex'), 0),
    coalesce(sum(membership.capacity_weight) filter (where membership.capacity_bucket = 'trial'), 0),
    coalesce(sum(membership.capacity_weight), 0)
  into regular_used, flex_used, trial_used, total_used
  from public.group_memberships membership
  where membership.tenant_id = new.tenant_id
    and membership.group_id = new.group_id
    and membership.status in ('active', 'trial')
    and (tg_op = 'INSERT' or membership.id <> new.id);

  if total_used + new.capacity_weight > target_group.hard_capacity then
    raise exception 'Physical group capacity exceeded';
  end if;

  bucket_limit := case new.capacity_bucket
    when 'regular' then target_group.regular_capacity
    when 'flex' then target_group.flex_capacity
    else target_group.trial_capacity
  end;
  if new.capacity_bucket = 'flex'
    and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional')
  then
    bucket_limit := bucket_limit + greatest(target_group.regular_capacity - regular_used, 0);
  elsif new.capacity_bucket = 'regular'
    and target_group.capacity_borrowing = 'bidirectional'
  then
    bucket_limit := bucket_limit + greatest(target_group.flex_capacity - flex_used, 0);
  end if;

  if (
    case new.capacity_bucket
      when 'regular' then regular_used
      when 'flex' then flex_used
      else trial_used
    end
  ) + new.capacity_weight > bucket_limit then
    raise exception 'Requested capacity bucket is full';
  end if;
  return new;
end;
$$;

create trigger group_memberships_capacity_bucket_contract
  before insert or update of group_id, status, capacity_bucket, capacity_weight
  on public.group_memberships
  for each row execute function app_private.enforce_membership_capacity_bucket();

create or replace function app_private.prevent_published_schedule_rule_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (case when tg_op = 'DELETE' then old.status else old.status end) = 'published' then
    raise exception 'Published schedule rules are immutable; create a new revision';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger group_schedule_rules_immutable
  before update or delete on public.group_schedule_rules
  for each row execute function app_private.prevent_published_schedule_rule_mutation();

create or replace function app_private.enforce_session_booking_contract()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_resource_id uuid;
  target_instructor_id uuid;
  conflict_reservation_id uuid;
  lock_resource_id uuid;
begin
  if new.status <> 'scheduled' then return new; end if;
  select coalesce(new.resource_id, lesson_group.default_resource_id)
    into target_resource_id
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id and lesson_group.id = new.group_id;
  if target_resource_id is null then
    raise exception 'Scheduled sessions require a structured resource';
  end if;

  for lock_resource_id in
    with recursive lineage as (
      select resource.id, resource.parent_resource_id
      from public.resources resource
      where resource.tenant_id = new.tenant_id and resource.id = target_resource_id
      union all
      select parent.id, parent.parent_resource_id
      from public.resources parent
      join lineage child on child.parent_resource_id = parent.id
      where parent.tenant_id = new.tenant_id
    )
    select id from lineage order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':resource:' || lock_resource_id::text, 0));
  end loop;

  select reservation.id into conflict_reservation_id
  from public.session_resource_reservations reservation
  where reservation.tenant_id = new.tenant_id
    and reservation.status = 'active'
    and reservation.session_id <> new.id
    and reservation.starts_at < new.ends_at and reservation.ends_at > new.starts_at
    and reservation.resource_id in (
      with recursive ancestors as (
        select resource.id, resource.parent_resource_id
        from public.resources resource
        where resource.tenant_id = new.tenant_id and resource.id = target_resource_id
        union all
        select parent.id, parent.parent_resource_id
        from public.resources parent
        join ancestors child on child.parent_resource_id = parent.id
        where parent.tenant_id = new.tenant_id
      ), descendants as (
        select resource.id
        from public.resources resource
        where resource.tenant_id = new.tenant_id and resource.id = target_resource_id
        union all
        select child.id
        from public.resources child
        join descendants parent on child.parent_resource_id = parent.id
        where child.tenant_id = new.tenant_id
      )
      select id from ancestors union select id from descendants
    )
  limit 1;
  if conflict_reservation_id is not null then
    raise exception 'Transactional resource hierarchy conflict';
  end if;

  if exists (
    select 1 from public.season_blackout_periods blackout
    where blackout.tenant_id = new.tenant_id and blackout.status = 'published'
      and blackout.starts_at < new.ends_at and blackout.ends_at > new.starts_at
      and (blackout.resource_id is null or blackout.resource_id = target_resource_id)
  ) then
    raise exception 'Scheduled session overlaps a published closure';
  end if;

  for target_instructor_id in
    select distinct assignment.instructor_user_id
    from public.group_instructor_assignments assignment
    where assignment.tenant_id = new.tenant_id
      and assignment.group_id = new.group_id
      and assignment.status = 'active'
      and (assignment.starts_on is null or assignment.starts_on <= (new.starts_at at time zone 'UTC')::date)
      and (assignment.ends_on is null or assignment.ends_on >= (new.starts_at at time zone 'UTC')::date)
    order by assignment.instructor_user_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':instructor:' || target_instructor_id::text, 0));
    if exists (
      select 1 from public.session_instructor_reservations reservation
      where reservation.tenant_id = new.tenant_id
        and reservation.instructor_user_id = target_instructor_id
        and reservation.status = 'active'
        and reservation.session_id <> new.id
        and reservation.starts_at < new.ends_at and reservation.ends_at > new.starts_at
    ) then
      raise exception 'Transactional instructor conflict';
    end if;
  end loop;
  return new;
end;
$$;

create trigger sessions_booking_contract
  before insert or update of group_id, resource_id, starts_at, ends_at, status
  on public.sessions
  for each row execute function app_private.enforce_session_booking_contract();

create or replace function app_private.sync_session_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_resource_id uuid;
  target_local_date date;
begin
  if new.status <> 'scheduled' then
    update public.session_resource_reservations
    set status = 'released'
    where tenant_id = new.tenant_id and session_id = new.id and status = 'active';
    update public.session_instructor_reservations
    set status = 'released'
    where tenant_id = new.tenant_id and session_id = new.id and status = 'active';
    return new;
  end if;

  select coalesce(new.resource_id, lesson_group.default_resource_id)
    into target_resource_id
  from public.groups lesson_group
  where lesson_group.tenant_id = new.tenant_id and lesson_group.id = new.group_id;
  target_local_date := coalesce(new.local_occurrence_date, (new.starts_at at time zone 'UTC')::date);

  insert into public.session_resource_reservations (
    tenant_id, session_id, resource_id, starts_at, ends_at, status
  ) values (
    new.tenant_id, new.id, target_resource_id, new.starts_at, new.ends_at, 'active'
  )
  on conflict (tenant_id, session_id, resource_id) do update
  set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'active';

  insert into public.session_instructor_reservations (
    tenant_id, session_id, instructor_user_id, starts_at, ends_at, status
  )
  select
    new.tenant_id, new.id, assignment.instructor_user_id,
    new.starts_at, new.ends_at, 'active'
  from public.group_instructor_assignments assignment
  where assignment.tenant_id = new.tenant_id
    and assignment.group_id = new.group_id
    and assignment.status = 'active'
    and (assignment.starts_on is null or assignment.starts_on <= target_local_date)
    and (assignment.ends_on is null or assignment.ends_on >= target_local_date)
  on conflict (tenant_id, session_id, instructor_user_id) do update
  set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'active';
  return new;
end;
$$;

create trigger sessions_sync_reservations
  after insert or update of group_id, resource_id, starts_at, ends_at, status
  on public.sessions
  for each row execute function app_private.sync_session_reservations();

create or replace function app_private.sync_group_instructor_reservations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.group_instructor_assignments%rowtype;
  target_group public.groups%rowtype;
  qualification_enforcement text := 'blocking';
begin
  if tg_op = 'DELETE' then
    assignment_row := old;
  else
    assignment_row := new;
  end if;
  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = assignment_row.tenant_id
    and lesson_group.id = assignment_row.group_id;
  select coalesce(policy.qualification_enforcement, 'blocking')
    into qualification_enforcement
  from public.tenant_planning_policies policy
  where policy.tenant_id = assignment_row.tenant_id;

  if tg_op <> 'DELETE' and new.status = 'active' then
    if qualification_enforcement = 'blocking' and not exists (
      select 1 from public.instructor_qualifications qualification
      where qualification.tenant_id = new.tenant_id
        and qualification.instructor_user_id = new.instructor_user_id
        and qualification.status = 'active'
        and (qualification.program_id is null or qualification.program_id = target_group.program_id)
        and (qualification.stage_id is null or qualification.stage_id = target_group.stage_id)
        and (qualification.resource_id is null or qualification.resource_id = target_group.default_resource_id)
        and (qualification.valid_from is null or qualification.valid_from <= coalesce(new.starts_on, target_group.starts_on, current_date))
        and (qualification.valid_until is null or qualification.valid_until >= coalesce(new.ends_on, target_group.ends_on, current_date))
    ) then
      raise exception 'Active group assignment requires a matching verified qualification';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':instructor:' || new.instructor_user_id::text, 0));
    insert into public.session_instructor_reservations (
      tenant_id, session_id, instructor_user_id, starts_at, ends_at, status
    )
    select new.tenant_id, session.id, new.instructor_user_id,
      session.starts_at, session.ends_at, 'active'
    from public.sessions session
    where session.tenant_id = new.tenant_id
      and session.group_id = new.group_id
      and session.status = 'scheduled'
      and (new.starts_on is null or new.starts_on <= coalesce(session.local_occurrence_date, (session.starts_at at time zone 'UTC')::date))
      and (new.ends_on is null or new.ends_on >= coalesce(session.local_occurrence_date, (session.starts_at at time zone 'UTC')::date))
    on conflict (tenant_id, session_id, instructor_user_id) do update
    set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'active';
  else
    update public.session_instructor_reservations reservation
    set status = 'released'
    from public.sessions session
    where reservation.tenant_id = assignment_row.tenant_id
      and reservation.instructor_user_id = assignment_row.instructor_user_id
      and reservation.session_id = session.id
      and session.group_id = assignment_row.group_id
      and not exists (
        select 1 from public.group_instructor_assignments remaining
        where remaining.tenant_id = assignment_row.tenant_id
          and remaining.group_id = assignment_row.group_id
          and remaining.instructor_user_id = assignment_row.instructor_user_id
          and remaining.status = 'active'
          and (tg_op = 'DELETE' or remaining.id <> assignment_row.id)
      );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger group_instructor_assignments_sync_reservations_insert_delete
  after insert or delete
  on public.group_instructor_assignments
  for each row execute function app_private.sync_group_instructor_reservations();
create trigger group_instructor_assignments_sync_reservations_update
  after update of status, starts_on, ends_on
  on public.group_instructor_assignments
  for each row execute function app_private.sync_group_instructor_reservations();

create or replace function app_private.sync_session_instructor_reservation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row public.session_instructor_assignments%rowtype;
  target_session public.sessions%rowtype;
  target_group public.groups%rowtype;
  qualification_enforcement text := 'blocking';
  target_local_date date;
begin
  if tg_op = 'DELETE' then assignment_row := old;
  else assignment_row := new;
  end if;
  select * into target_session
  from public.sessions session
  where session.tenant_id = assignment_row.tenant_id
    and session.id = assignment_row.session_id;
  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = assignment_row.tenant_id
    and lesson_group.id = target_session.group_id;
  target_local_date := coalesce(
    target_session.local_occurrence_date,
    (target_session.starts_at at time zone 'UTC')::date
  );
  select coalesce(policy.qualification_enforcement, 'blocking')
    into qualification_enforcement
  from public.tenant_planning_policies policy
  where policy.tenant_id = assignment_row.tenant_id;

  if tg_op <> 'DELETE' and new.status = 'active' and target_session.status = 'scheduled' then
    if qualification_enforcement = 'blocking' and not exists (
      select 1 from public.instructor_qualifications qualification
      where qualification.tenant_id = new.tenant_id
        and qualification.instructor_user_id = new.instructor_user_id
        and qualification.status = 'active'
        and (qualification.program_id is null or qualification.program_id = target_group.program_id)
        and (qualification.stage_id is null or qualification.stage_id = target_group.stage_id)
        and (
          qualification.resource_id is null
          or qualification.resource_id = coalesce(target_session.resource_id, target_group.default_resource_id)
        )
        and (qualification.valid_from is null or qualification.valid_from <= target_local_date)
        and (qualification.valid_until is null or qualification.valid_until >= target_local_date)
    ) then
      raise exception 'Active session assignment requires a matching verified qualification';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':instructor:' || new.instructor_user_id::text, 0));
    insert into public.session_instructor_reservations (
      tenant_id, session_id, instructor_user_id, starts_at, ends_at, status
    ) values (
      new.tenant_id, new.session_id, new.instructor_user_id,
      target_session.starts_at, target_session.ends_at, 'active'
    )
    on conflict (tenant_id, session_id, instructor_user_id) do update
    set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'active';
  else
    update public.session_instructor_reservations reservation
    set status = 'released'
    where reservation.tenant_id = assignment_row.tenant_id
      and reservation.session_id = assignment_row.session_id
      and reservation.instructor_user_id = assignment_row.instructor_user_id
      and not exists (
        select 1 from public.session_instructor_assignments remaining
        where remaining.tenant_id = assignment_row.tenant_id
          and remaining.session_id = assignment_row.session_id
          and remaining.instructor_user_id = assignment_row.instructor_user_id
          and remaining.status = 'active'
          and (tg_op = 'DELETE' or remaining.id <> assignment_row.id)
      )
      and not exists (
        select 1 from public.group_instructor_assignments group_assignment
        where group_assignment.tenant_id = assignment_row.tenant_id
          and group_assignment.group_id = target_session.group_id
          and group_assignment.instructor_user_id = assignment_row.instructor_user_id
          and group_assignment.status = 'active'
          and (group_assignment.starts_on is null or group_assignment.starts_on <= target_local_date)
          and (group_assignment.ends_on is null or group_assignment.ends_on >= target_local_date)
      );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger session_instructor_assignments_sync_reservation_insert_delete
  after insert or delete
  on public.session_instructor_assignments
  for each row execute function app_private.sync_session_instructor_reservation();
create trigger session_instructor_assignments_sync_reservation_update
  after update of status, instructor_user_id, session_id
  on public.session_instructor_assignments
  for each row execute function app_private.sync_session_instructor_reservation();

create or replace function app_private.evaluate_group_schedule(
  target_tenant_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  target_program_id uuid := (target_payload ->> 'programId')::uuid;
  target_stage_id uuid := nullif(target_payload ->> 'stageId', '')::uuid;
  target_resource_id uuid := (target_payload ->> 'resourceId')::uuid;
  target_weekday integer := (target_payload ->> 'weekday')::integer;
  target_start_time time := (target_payload ->> 'startTime')::time;
  target_end_time time := (target_payload ->> 'endTime')::time;
  target_starts_on date := (target_payload ->> 'startsOn')::date;
  target_ends_on date := (target_payload ->> 'endsOn')::date;
  target_interval integer := coalesce((target_payload ->> 'recurrenceIntervalWeeks')::integer, 1);
  regular_capacity integer := coalesce((target_payload ->> 'regularCapacity')::integer, 0);
  flex_capacity integer := coalesce((target_payload ->> 'flexCapacity')::integer, 0);
  trial_capacity integer := coalesce((target_payload ->> 'trialCapacity')::integer, 0);
  hard_capacity integer := coalesce((target_payload ->> 'hardCapacity')::integer, 0);
  instructor_ids uuid[] := '{}'::uuid[];
  tenant_timezone text := 'Europe/Amsterdam';
  qualification_enforcement text := 'blocking';
  opening_enforcement text := 'advisory';
  maximum_horizon integer := 730;
  resource_limit integer;
  occurrence_date date;
  occurrence_start timestamptz;
  occurrence_end timestamptz;
  instructor_id uuid;
  conflict_session_id uuid;
  conflict_blackout_id uuid;
  occurrence_count integer := 0;
  hard_count integer := 0;
  warning_count integer := 0;
  opening_count integer := 0;
  conflicts jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into instructor_ids
  from jsonb_array_elements_text(coalesce(target_payload -> 'instructorUserIds', '[]'::jsonb)) value;

  select
    coalesce(settings.timezone, 'Europe/Amsterdam'),
    coalesce(policy.qualification_enforcement, 'blocking'),
    coalesce(policy.opening_hours_enforcement, 'advisory'),
    coalesce(policy.maximum_schedule_horizon_days, 730)
  into tenant_timezone, qualification_enforcement, opening_enforcement, maximum_horizon
  from public.tenant_planning_policies policy
  left join public.tenant_settings settings on settings.tenant_id = policy.tenant_id
  where policy.tenant_id = target_tenant_id;

  if target_weekday not between 1 and 7
    or target_start_time >= target_end_time
    or target_starts_on > target_ends_on
    or target_interval not between 1 and 8
  then
    raise exception 'Invalid schedule window';
  end if;
  if target_ends_on - target_starts_on > maximum_horizon then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'schedule_horizon_exceeded', 'severity', 'hard', 'blocking', true,
      'title', 'Roosterperiode te lang',
      'detail', format('De maximale roosterhorizon is %s dagen.', maximum_horizon)
    ));
    hard_count := hard_count + 1;
  end if;
  if regular_capacity < 0 or flex_capacity < 0 or trial_capacity < 0
    or hard_capacity < 0
    or regular_capacity + flex_capacity + trial_capacity > hard_capacity
  then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'capacity_buckets_invalid', 'severity', 'hard', 'blocking', true,
      'title', 'Capaciteitsverdeling ongeldig',
      'detail', 'Regulier, flex en proef moeten afzonderlijk binnen de fysieke limiet passen.'
    ));
    hard_count := hard_count + 1;
  end if;

  if not exists (
    select 1 from public.programs program
    where program.tenant_id = target_tenant_id and program.id = target_program_id
      and program.status = 'active'
  ) then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'program_inactive', 'severity', 'hard', 'blocking', true,
      'title', 'Programma niet actief', 'detail', 'Kies actieve programmamasterdata.'
    ));
    hard_count := hard_count + 1;
  end if;
  if target_stage_id is not null and not exists (
    select 1 from public.program_stages stage
    where stage.tenant_id = target_tenant_id and stage.id = target_stage_id
      and stage.program_id = target_program_id and stage.status = 'active'
  ) then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'stage_program_mismatch', 'severity', 'hard', 'blocking', true,
      'title', 'Badje hoort niet bij programma', 'detail', 'Kies een badje uit het geselecteerde programma.'
    ));
    hard_count := hard_count + 1;
  end if;

  select coalesce(resource.safety_capacity, resource.capacity)
    into resource_limit
  from public.resources resource
  where resource.tenant_id = target_tenant_id and resource.id = target_resource_id
    and resource.status = 'active';
  if not found then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'resource_inactive', 'severity', 'hard', 'blocking', true,
      'title', 'Resource niet actief', 'detail', 'Kies een actieve locatie, bad of baan.'
    ));
    hard_count := hard_count + 1;
  elsif resource_limit is not null and hard_capacity > resource_limit then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'resource_safety_capacity', 'severity', 'hard', 'blocking', true,
      'title', 'Fysieke veiligheidslimiet overschreden',
      'detail', format('De resource staat maximaal %s zwemmers toe.', resource_limit)
    ));
    hard_count := hard_count + 1;
  end if;

  if cardinality(instructor_ids) = 0 then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'instructor_required', 'severity', 'hard', 'blocking', true,
      'title', 'Instructeur ontbreekt', 'detail', 'Een gepubliceerde groep heeft minimaal één instructeur.'
    ));
    hard_count := hard_count + 1;
  end if;

  foreach instructor_id in array instructor_ids loop
    if not exists (
      select 1 from public.tenant_memberships membership
      where membership.tenant_id = target_tenant_id
        and membership.user_id = instructor_id
        and membership.role = 'instructor'
        and membership.status = 'active'
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'instructor_not_active', 'severity', 'hard', 'blocking', true,
        'title', 'Instructeur niet actief', 'detail', 'Een gekozen instructeur heeft geen actieve instructeursrol.',
        'instructorUserId', instructor_id
      ));
      hard_count := hard_count + 1;
    elsif not exists (
      select 1 from public.instructor_qualifications qualification
      where qualification.tenant_id = target_tenant_id
        and qualification.instructor_user_id = instructor_id
        and qualification.status = 'active'
        and (qualification.valid_from is null or qualification.valid_from <= target_starts_on)
        and (qualification.valid_until is null or qualification.valid_until >= target_ends_on)
        and (qualification.program_id is null or qualification.program_id = target_program_id)
        and (qualification.stage_id is null or qualification.stage_id = target_stage_id)
        and (qualification.resource_id is null or qualification.resource_id = target_resource_id)
    ) then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'qualification_missing',
        'severity', case when qualification_enforcement = 'blocking' then 'hard' else 'warning' end,
        'blocking', qualification_enforcement = 'blocking',
        'title', 'Geverifieerde kwalificatie ontbreekt',
        'detail', 'Leg eerst passende kwalificatiemasterdata vast of pas het expliciete tenantbeleid aan.',
        'instructorUserId', instructor_id
      ));
      if qualification_enforcement = 'blocking' then hard_count := hard_count + 1;
      else warning_count := warning_count + 1; end if;
    end if;
  end loop;

  select count(*) into opening_count
  from public.resource_opening_hours opening
  where opening.tenant_id = target_tenant_id
    and opening.resource_id = target_resource_id
    and opening.status = 'active'
    and opening.weekday = target_weekday
    and (opening.effective_from is null or opening.effective_from <= target_ends_on)
    and (opening.effective_until is null or opening.effective_until >= target_starts_on);
  if opening_count = 0 then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'opening_hours_missing',
      'severity', case when opening_enforcement = 'blocking' then 'hard' else 'warning' end,
      'blocking', opening_enforcement = 'blocking',
      'title', 'Openingstijden ontbreken',
      'detail', 'Leg openingstijden vast voor een controleerbare planning.'
    ));
    if opening_enforcement = 'blocking' then hard_count := hard_count + 1;
    else warning_count := warning_count + 1; end if;
  elsif not exists (
    select 1 from public.resource_opening_hours opening
    where opening.tenant_id = target_tenant_id
      and opening.resource_id = target_resource_id
      and opening.status = 'active'
      and opening.weekday = target_weekday
      and opening.opens_at <= target_start_time
      and opening.closes_at >= target_end_time
      and (opening.effective_from is null or opening.effective_from <= target_starts_on)
      and (opening.effective_until is null or opening.effective_until >= target_ends_on)
  ) then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'outside_opening_hours', 'severity', 'hard', 'blocking', true,
      'title', 'Buiten openingstijden', 'detail', 'De gekozen lestijd valt niet volledig binnen de openingstijden.'
    ));
    hard_count := hard_count + 1;
  end if;

  for occurrence_date in
    select day::date
    from generate_series(target_starts_on, target_ends_on, interval '1 day') day
    where extract(isodow from day)::integer = target_weekday
      and ((day::date - target_starts_on) / 7) % target_interval = 0
    order by day
  loop
    occurrence_count := occurrence_count + 1;
    occurrence_start := (occurrence_date + target_start_time) at time zone tenant_timezone;
    occurrence_end := (occurrence_date + target_end_time) at time zone tenant_timezone;

    select session.id into conflict_session_id
    from public.sessions session
    join public.groups lesson_group
      on lesson_group.tenant_id = session.tenant_id and lesson_group.id = session.group_id
    where session.tenant_id = target_tenant_id
      and session.status = 'scheduled'
      and session.starts_at < occurrence_end and session.ends_at > occurrence_start
      and coalesce(session.resource_id, lesson_group.default_resource_id) in (
        with recursive ancestors as (
          select resource.id, resource.parent_resource_id
          from public.resources resource
          where resource.tenant_id = target_tenant_id and resource.id = target_resource_id
          union all
          select parent.id, parent.parent_resource_id
          from public.resources parent
          join ancestors child on child.parent_resource_id = parent.id
          where parent.tenant_id = target_tenant_id
        ), descendants as (
          select resource.id
          from public.resources resource
          where resource.tenant_id = target_tenant_id and resource.id = target_resource_id
          union all
          select child.id
          from public.resources child
          join descendants parent on child.parent_resource_id = parent.id
          where child.tenant_id = target_tenant_id
        )
        select id from ancestors union select id from descendants
      )
    order by session.starts_at
    limit 1;
    if conflict_session_id is not null and jsonb_array_length(conflicts) < 100 then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'resource_overlap', 'severity', 'hard', 'blocking', true,
        'title', 'Resourceconflict',
        'detail', format('De resourcehiërarchie is al geboekt op %s.', occurrence_date),
        'occurrenceDate', occurrence_date, 'relatedSessionId', conflict_session_id
      ));
      hard_count := hard_count + 1;
      conflict_session_id := null;
    end if;

    select blackout.id into conflict_blackout_id
    from public.season_blackout_periods blackout
    where blackout.tenant_id = target_tenant_id
      and blackout.status = 'published'
      and blackout.starts_at < occurrence_end and blackout.ends_at > occurrence_start
      and (
        blackout.resource_id is null
        or blackout.resource_id in (
          with recursive ancestors as (
            select resource.id, resource.parent_resource_id
            from public.resources resource
            where resource.tenant_id = target_tenant_id and resource.id = target_resource_id
            union all
            select parent.id, parent.parent_resource_id
            from public.resources parent
            join ancestors child on child.parent_resource_id = parent.id
            where parent.tenant_id = target_tenant_id
          )
          select id from ancestors
        )
      )
    limit 1;
    if conflict_blackout_id is not null and jsonb_array_length(conflicts) < 100 then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object(
        'code', 'published_closure', 'severity', 'hard', 'blocking', true,
        'title', 'Gepubliceerde sluiting',
        'detail', format('Op %s geldt een vakantie- of sluitingsperiode.', occurrence_date),
        'occurrenceDate', occurrence_date, 'blackoutId', conflict_blackout_id
      ));
      hard_count := hard_count + 1;
      conflict_blackout_id := null;
    end if;

    foreach instructor_id in array instructor_ids loop
      select session.id into conflict_session_id
      from public.sessions session
      where session.tenant_id = target_tenant_id
        and session.status = 'scheduled'
        and session.starts_at < occurrence_end and session.ends_at > occurrence_start
        and (
          exists (
            select 1 from public.session_instructor_assignments assignment
            where assignment.tenant_id = target_tenant_id
              and assignment.session_id = session.id
              and assignment.instructor_user_id = instructor_id
              and assignment.status = 'active'
          )
          or exists (
            select 1 from public.group_instructor_assignments assignment
            where assignment.tenant_id = target_tenant_id
              and assignment.group_id = session.group_id
              and assignment.instructor_user_id = instructor_id
              and assignment.status = 'active'
              and (assignment.starts_on is null or assignment.starts_on <= occurrence_date)
              and (assignment.ends_on is null or assignment.ends_on >= occurrence_date)
          )
        )
      limit 1;
      if conflict_session_id is not null and jsonb_array_length(conflicts) < 100 then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'code', 'instructor_overlap', 'severity', 'hard', 'blocking', true,
          'title', 'Instructeur dubbel gepland',
          'detail', format('Een instructeur heeft al een les op %s.', occurrence_date),
          'occurrenceDate', occurrence_date, 'instructorUserId', instructor_id,
          'relatedSessionId', conflict_session_id
        ));
        hard_count := hard_count + 1;
        conflict_session_id := null;
      end if;

      if not exists (
        select 1 from public.instructor_availability availability
        where availability.tenant_id = target_tenant_id
          and availability.instructor_user_id = instructor_id
          and availability.status = 'active'
          and availability.availability_type = 'available'
          and availability.weekday = case when target_weekday = 7 then 0 else target_weekday end
          and availability.starts_at <= target_start_time
          and availability.ends_at >= target_end_time
          and (availability.starts_on is null or availability.starts_on <= occurrence_date)
          and (availability.ends_on is null or availability.ends_on >= occurrence_date)
      ) and jsonb_array_length(conflicts) < 100 then
        conflicts := conflicts || jsonb_build_array(jsonb_build_object(
          'code', 'availability_missing', 'severity', 'warning', 'blocking', false,
          'title', 'Beschikbaarheid niet bevestigd',
          'detail', format('Er is geen passende beschikbaarheid op %s.', occurrence_date),
          'occurrenceDate', occurrence_date, 'instructorUserId', instructor_id
        ));
        warning_count := warning_count + 1;
      end if;
    end loop;
  end loop;

  if occurrence_count = 0 then
    conflicts := conflicts || jsonb_build_array(jsonb_build_object(
      'code', 'no_occurrences', 'severity', 'hard', 'blocking', true,
      'title', 'Geen lesmomenten', 'detail', 'De datumperiode bevat geen gekozen lesdag.'
    ));
    hard_count := hard_count + 1;
  end if;

  return jsonb_build_object(
    'contractVersion', 'planning_conflicts_v3',
    'timezone', tenant_timezone,
    'occurrenceCount', occurrence_count,
    'hardConflictCount', hard_count,
    'warningCount', warning_count,
    'canPublish', hard_count = 0,
    'truncated', jsonb_array_length(conflicts) >= 100,
    'conflicts', conflicts
  );
end;
$$;

create or replace function app_private.preview_group_schedule(
  target_tenant_id uuid,
  actor_user_id uuid,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_json jsonb;
  request_hash text;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'planning.manage') then
    raise exception 'Insufficient planning permission';
  end if;
  result_json := app_private.evaluate_group_schedule(target_tenant_id, target_payload);
  request_hash := encode(extensions.digest(target_payload::text, 'sha256'), 'hex');
  insert into public.planning_conflict_evaluations (
    tenant_id, actor_user_id, evaluation_mode, request_hash, input_json, result_json
  ) values (
    target_tenant_id, actor_user_id, 'advisory', request_hash, target_payload, result_json
  );
  return result_json;
end;
$$;

create or replace function app_private.publish_group_schedule(
  target_tenant_id uuid,
  actor_user_id uuid,
  target_idempotency_key text,
  target_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_receipt public.domain_command_receipts%rowtype;
  result_json jsonb;
  request_hash text;
  target_group_id uuid;
  target_rule_id uuid;
  target_program_id uuid := (target_payload ->> 'programId')::uuid;
  target_stage_id uuid := nullif(target_payload ->> 'stageId', '')::uuid;
  target_resource_id uuid := (target_payload ->> 'resourceId')::uuid;
  target_template_id uuid := nullif(target_payload ->> 'lessonTimeTemplateId', '')::uuid;
  target_weekday integer := (target_payload ->> 'weekday')::integer;
  target_start_time time := (target_payload ->> 'startTime')::time;
  target_end_time time := (target_payload ->> 'endTime')::time;
  target_starts_on date := (target_payload ->> 'startsOn')::date;
  target_ends_on date := (target_payload ->> 'endsOn')::date;
  target_interval integer := coalesce((target_payload ->> 'recurrenceIntervalWeeks')::integer, 1);
  tenant_timezone text := 'Europe/Amsterdam';
  instructor_ids uuid[] := '{}'::uuid[];
  instructor_id uuid;
  lock_resource_id uuid;
  occurrence_date date;
  occurrence_start timestamptz;
  occurrence_end timestamptz;
  target_session_id uuid;
  occurrence_count integer := 0;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'group.publish')
    or not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'planning.manage')
  then
    raise exception 'Insufficient group publication permission';
  end if;
  if length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid idempotency key';
  end if;
  request_hash := encode(extensions.digest(target_payload::text, 'sha256'), 'hex');
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'group.schedule.publish'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.result_json;
  end if;

  select coalesce(array_agg(value::uuid order by value), '{}'::uuid[])
    into instructor_ids
  from jsonb_array_elements_text(coalesce(target_payload -> 'instructorUserIds', '[]'::jsonb)) value;
  select coalesce((
    select settings.timezone
    from public.tenant_settings settings
    where settings.tenant_id = target_tenant_id
  ), 'Europe/Amsterdam') into tenant_timezone;

  -- Lock every ancestor and the selected resource in deterministic order.
  for lock_resource_id in
    with recursive lineage as (
      select resource.id, resource.parent_resource_id
      from public.resources resource
      where resource.tenant_id = target_tenant_id and resource.id = target_resource_id
      union all
      select parent.id, parent.parent_resource_id
      from public.resources parent
      join lineage child on child.parent_resource_id = parent.id
      where parent.tenant_id = target_tenant_id
    )
    select id from lineage order by id
  loop
    perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':resource:' || lock_resource_id::text, 0));
  end loop;
  foreach instructor_id in array instructor_ids loop
    perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':instructor:' || instructor_id::text, 0));
  end loop;

  result_json := app_private.evaluate_group_schedule(target_tenant_id, target_payload);
  insert into public.planning_conflict_evaluations (
    tenant_id, actor_user_id, evaluation_mode, request_hash, input_json, result_json
  ) values (
    target_tenant_id, actor_user_id, 'transactional', request_hash, target_payload, result_json
  );
  if not coalesce((result_json ->> 'canPublish')::boolean, false) then
    raise exception 'Transactional planning conflict';
  end if;

  insert into public.groups (
    tenant_id, program_id, stage_id, default_resource_id, name, code, status,
    capacity, regular_capacity, flex_capacity, trial_capacity, hard_capacity,
    capacity_borrowing, offering_type, default_weekday, default_start_time,
    default_end_time, starts_on, ends_on
  ) values (
    target_tenant_id, target_program_id, target_stage_id, target_resource_id,
    trim(target_payload ->> 'name'), nullif(trim(target_payload ->> 'code'), ''),
    'active', (target_payload ->> 'hardCapacity')::integer,
    (target_payload ->> 'regularCapacity')::integer,
    (target_payload ->> 'flexCapacity')::integer,
    (target_payload ->> 'trialCapacity')::integer,
    (target_payload ->> 'hardCapacity')::integer,
    coalesce(target_payload ->> 'capacityBorrowing', 'none'),
    coalesce(target_payload ->> 'offeringType', 'regular'),
    target_weekday, target_start_time, target_end_time, target_starts_on, target_ends_on
  ) returning id into target_group_id;

  insert into public.group_schedule_rules (
    tenant_id, group_id, lesson_time_template_id, resource_id, timezone,
    weekday, local_start_time, local_end_time, recurrence_interval_weeks,
    starts_on, ends_on, revision, status, published_at, published_by_user_id,
    created_by_user_id
  ) values (
    target_tenant_id, target_group_id, target_template_id, target_resource_id,
    tenant_timezone, target_weekday, target_start_time, target_end_time,
    target_interval, target_starts_on, target_ends_on, 1, 'published', now(),
    actor_user_id, actor_user_id
  ) returning id into target_rule_id;

  foreach instructor_id in array instructor_ids loop
    insert into public.group_instructor_assignments (
      tenant_id, group_id, instructor_user_id, role, status, starts_on, ends_on
    ) values (
      target_tenant_id, target_group_id, instructor_id,
      case when instructor_id = instructor_ids[1] then 'primary' else 'support' end,
      'active', target_starts_on, target_ends_on
    );
  end loop;

  for occurrence_date in
    select day::date
    from generate_series(target_starts_on, target_ends_on, interval '1 day') day
    where extract(isodow from day)::integer = target_weekday
      and ((day::date - target_starts_on) / 7) % target_interval = 0
    order by day
  loop
    occurrence_start := (occurrence_date + target_start_time) at time zone tenant_timezone;
    occurrence_end := (occurrence_date + target_end_time) at time zone tenant_timezone;
    insert into public.sessions (
      tenant_id, group_id, resource_id, starts_at, ends_at, status,
      schedule_rule_id, local_occurrence_date, schedule_revision, published_at
    ) values (
      target_tenant_id, target_group_id, target_resource_id, occurrence_start,
      occurrence_end, 'scheduled', target_rule_id, occurrence_date, 1, now()
    ) returning id into target_session_id;
    insert into public.session_resource_reservations (
      tenant_id, session_id, resource_id, starts_at, ends_at
    ) values (
      target_tenant_id, target_session_id, target_resource_id,
      occurrence_start, occurrence_end
    ) on conflict (tenant_id, session_id, resource_id) do nothing;
    foreach instructor_id in array instructor_ids loop
      insert into public.session_instructor_reservations (
        tenant_id, session_id, instructor_user_id, starts_at, ends_at
      ) values (
        target_tenant_id, target_session_id, instructor_id,
        occurrence_start, occurrence_end
      ) on conflict (tenant_id, session_id, instructor_user_id) do nothing;
    end loop;
    occurrence_count := occurrence_count + 1;
  end loop;

  result_json := result_json || jsonb_build_object(
    'groupId', target_group_id,
    'scheduleRuleId', target_rule_id,
    'occurrenceCount', occurrence_count,
    'published', true
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'group.schedule.publish',
    'group', target_group_id, actor_user_id, request_hash, result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    formula_version, payload_json
  ) values (
    target_tenant_id, 'group.schedule.published', 'group', target_group_id,
    actor_user_id, 'planning_conflicts_v3',
    jsonb_build_object(
      'groupId', target_group_id, 'scheduleRuleId', target_rule_id,
      'occurrenceCount', occurrence_count, 'timezone', tenant_timezone
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, after_json
  ) values (
    target_tenant_id, actor_user_id, 'group.publish', 'group.schedule.published',
    'group', target_group_id, trim(target_payload ->> 'reason'), result_json
  );
  return result_json;
end;
$$;

create or replace function public.preview_group_schedule(
  target_tenant_id uuid,
  actor_user_id uuid,
  target_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.preview_group_schedule(target_tenant_id, actor_user_id, target_payload);
$$;

create or replace function public.publish_group_schedule(
  target_tenant_id uuid,
  actor_user_id uuid,
  target_idempotency_key text,
  target_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.publish_group_schedule(
    target_tenant_id, actor_user_id, target_idempotency_key, target_payload
  );
$$;

revoke all on function app_private.enforce_group_capacity_contract() from public, anon, authenticated;
revoke all on function app_private.enforce_membership_capacity_bucket() from public, anon, authenticated;
revoke all on function app_private.prevent_published_schedule_rule_mutation() from public, anon, authenticated;
revoke all on function app_private.ensure_tenant_planning_policy() from public, anon, authenticated;
revoke all on function app_private.enforce_session_booking_contract() from public, anon, authenticated;
revoke all on function app_private.sync_session_reservations() from public, anon, authenticated;
revoke all on function app_private.sync_group_instructor_reservations() from public, anon, authenticated;
revoke all on function app_private.sync_session_instructor_reservation() from public, anon, authenticated;
revoke all on function app_private.evaluate_group_schedule(uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.preview_group_schedule(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function app_private.publish_group_schedule(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function app_private.enforce_group_capacity_contract() to service_role;
grant execute on function app_private.enforce_membership_capacity_bucket() to service_role;
grant execute on function app_private.prevent_published_schedule_rule_mutation() to service_role;
grant execute on function app_private.ensure_tenant_planning_policy() to service_role;
grant execute on function app_private.enforce_session_booking_contract() to service_role;
grant execute on function app_private.sync_session_reservations() to service_role;
grant execute on function app_private.sync_group_instructor_reservations() to service_role;
grant execute on function app_private.sync_session_instructor_reservation() to service_role;
grant execute on function app_private.evaluate_group_schedule(uuid, jsonb) to service_role;
grant execute on function app_private.preview_group_schedule(uuid, uuid, jsonb) to service_role;
grant execute on function app_private.publish_group_schedule(uuid, uuid, text, jsonb) to service_role;
revoke all on function public.preview_group_schedule(uuid, uuid, jsonb) from public, anon;
revoke all on function public.publish_group_schedule(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.preview_group_schedule(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.publish_group_schedule(uuid, uuid, text, jsonb) to authenticated, service_role;

grant select, insert, update, delete on public.resource_location_profiles to authenticated;
grant select, insert, update, delete on public.resource_opening_hours to authenticated;
grant select, insert, update, delete on public.lesson_time_templates to authenticated;
grant select, insert, update on public.tenant_planning_policies to authenticated;
grant select on public.group_schedule_rules to authenticated;
grant select on public.session_resource_reservations to authenticated;
grant select on public.session_instructor_reservations to authenticated;
grant select on public.planning_conflict_evaluations to authenticated;
grant all on public.resource_location_profiles to service_role;
grant all on public.resource_opening_hours to service_role;
grant all on public.lesson_time_templates to service_role;
grant all on public.tenant_planning_policies to service_role;
grant all on public.group_schedule_rules to service_role;
grant all on public.session_resource_reservations to service_role;
grant all on public.session_instructor_reservations to service_role;
grant all on public.planning_conflict_evaluations to service_role;

alter table public.resource_location_profiles enable row level security;
alter table public.resource_location_profiles force row level security;
alter table public.resource_opening_hours enable row level security;
alter table public.resource_opening_hours force row level security;
alter table public.lesson_time_templates enable row level security;
alter table public.lesson_time_templates force row level security;
alter table public.tenant_planning_policies enable row level security;
alter table public.tenant_planning_policies force row level security;
alter table public.group_schedule_rules enable row level security;
alter table public.group_schedule_rules force row level security;
alter table public.session_resource_reservations enable row level security;
alter table public.session_resource_reservations force row level security;
alter table public.session_instructor_reservations enable row level security;
alter table public.session_instructor_reservations force row level security;
alter table public.planning_conflict_evaluations enable row level security;
alter table public.planning_conflict_evaluations force row level security;

create policy resource_location_profiles_read
  on public.resource_location_profiles for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy resource_location_profiles_manage
  on public.resource_location_profiles for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'));
create policy resource_opening_hours_read
  on public.resource_opening_hours for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy resource_opening_hours_manage
  on public.resource_opening_hours for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'));
create policy lesson_time_templates_read
  on public.lesson_time_templates for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy lesson_time_templates_manage
  on public.lesson_time_templates for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'));
create policy tenant_planning_policies_read
  on public.tenant_planning_policies for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy tenant_planning_policies_manage
  on public.tenant_planning_policies for all to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'))
  with check (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'));
create policy group_schedule_rules_read
  on public.group_schedule_rules for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy session_resource_reservations_read
  on public.session_resource_reservations for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy session_instructor_reservations_read
  on public.session_instructor_reservations for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'group.read'));
create policy planning_conflict_evaluations_read
  on public.planning_conflict_evaluations for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'planning.manage'));

insert into public.tenant_swim_rollouts (
  tenant_id, feature_key, status, readiness_json, config_json
)
select tenant.id, 'swim.planning_v3', 'shadow',
  jsonb_build_object(
    'structuredResources', true,
    'capacityBuckets', true,
    'transactionalConflicts', true,
    'timezoneOccurrences', true
  ),
  jsonb_build_object('publicationContract', 'planning_conflicts_v3')
from public.tenants tenant
on conflict (tenant_id, feature_key) do nothing;

comment on table public.group_schedule_rules is
  'Versioned immutable published recurrence rules; local wall-clock values are materialized into sessions in the tenant timezone.';
comment on table public.session_resource_reservations is
  'Authoritative occurrence-level resource bookings; hierarchy conflicts are serialized and checked by publish_group_schedule.';
comment on table public.session_instructor_reservations is
  'Authoritative occurrence-level instructor bookings with an exclusion constraint against concurrent overlap.';
comment on function public.preview_group_schedule(uuid, uuid, jsonb) is
  'Advisory structured conflict preview. Publication repeats the same contract under deterministic resource and instructor locks.';
comment on function public.publish_group_schedule(uuid, uuid, text, jsonb) is
  'Idempotent transaction that rechecks conflicts, publishes a group rule, materializes timezone-safe occurrences and creates reservations.';
