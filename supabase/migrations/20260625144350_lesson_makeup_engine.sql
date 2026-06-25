alter table public.sessions
  add column if not exists cancelled_by_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists makeup_policy_snapshot jsonb not null default '{}'::jsonb;

alter table public.sessions
  drop constraint if exists sessions_makeup_policy_snapshot_check,
  add constraint sessions_makeup_policy_snapshot_check check (jsonb_typeof(makeup_policy_snapshot) = 'object');

create table public.tenant_lesson_cancellation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  rule_key text not null default 'default',
  name text not null default 'Standaard afmeld- en inhaalbeleid',
  who_may_cancel text[] not null default array['parent', 'tenant_admin', 'tenant_staff']::text[],
  deadline_hours integer not null default 24,
  allowed_reasons text[] not null default array['ziek', 'vakantie', 'familie', 'school', 'overig']::text[],
  makeup_credit_granted boolean not null default true,
  requires_admin_approval boolean not null default true,
  max_active_credits_per_enrollment integer not null default 3,
  credit_valid_days integer not null default 90,
  auto_credit_attendance_statuses text[] not null default array['absent', 'excused']::text[],
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_lesson_cancellation_rules_unique unique (tenant_id, rule_key),
  constraint tenant_lesson_cancellation_rules_id_tenant_unique unique (id, tenant_id),
  constraint tenant_lesson_cancellation_rules_who_check check (who_may_cancel <@ array['parent', 'athlete', 'instructor', 'tenant_admin', 'tenant_staff']::text[]),
  constraint tenant_lesson_cancellation_rules_deadline_check check (deadline_hours >= 0 and deadline_hours <= 720),
  constraint tenant_lesson_cancellation_rules_max_credits_check check (max_active_credits_per_enrollment >= 0 and max_active_credits_per_enrollment <= 50),
  constraint tenant_lesson_cancellation_rules_valid_days_check check (credit_valid_days >= 1 and credit_valid_days <= 730),
  constraint tenant_lesson_cancellation_rules_statuses_check check (auto_credit_attendance_statuses <@ array['absent', 'excused']::text[]),
  constraint tenant_lesson_cancellation_rules_status_check check (status in ('active', 'paused', 'disabled')),
  constraint tenant_lesson_cancellation_rules_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create table public.makeup_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  source_session_id uuid references public.sessions (id) on delete set null,
  source_attendance_id uuid references public.session_attendance (id) on delete set null,
  source_request_id uuid,
  rule_id uuid references public.tenant_lesson_cancellation_rules (id) on delete set null,
  credit_code text not null default ('MK-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status text not null default 'available',
  reason text,
  granted_by text not null default 'attendance',
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  used_session_id uuid references public.sessions (id) on delete set null,
  used_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint makeup_credits_status_check check (status in ('available', 'reserved', 'used', 'expired', 'cancelled')),
  constraint makeup_credits_granted_by_check check (granted_by in ('attendance', 'parent_cancel', 'admin')),
  constraint makeup_credits_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint makeup_credits_id_tenant_unique unique (id, tenant_id),
  constraint makeup_credits_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint makeup_credits_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint makeup_credits_source_session_tenant_fk foreign key (source_session_id, tenant_id) references public.sessions (id, tenant_id),
  constraint makeup_credits_source_attendance_tenant_fk foreign key (source_attendance_id, tenant_id) references public.session_attendance (id, tenant_id),
  constraint makeup_credits_rule_tenant_fk foreign key (rule_id, tenant_id) references public.tenant_lesson_cancellation_rules (id, tenant_id),
  constraint makeup_credits_used_session_tenant_fk foreign key (used_session_id, tenant_id) references public.sessions (id, tenant_id)
);

create table public.makeup_candidate_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  makeup_credit_id uuid not null references public.makeup_credits (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  score integer not null default 0,
  status text not null default 'suggested',
  reasons jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  capacity_snapshot jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  selected_by_profile_id uuid references public.profiles (id) on delete set null,
  selected_at timestamptz,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint makeup_candidate_sessions_unique unique (tenant_id, makeup_credit_id, session_id),
  constraint makeup_candidate_sessions_id_tenant_unique unique (id, tenant_id),
  constraint makeup_candidate_sessions_score_check check (score >= 0 and score <= 100),
  constraint makeup_candidate_sessions_status_check check (status in ('suggested', 'selected', 'approved', 'rejected', 'expired')),
  constraint makeup_candidate_sessions_reasons_check check (jsonb_typeof(reasons) = 'array'),
  constraint makeup_candidate_sessions_blockers_check check (jsonb_typeof(blockers) = 'array'),
  constraint makeup_candidate_sessions_capacity_check check (jsonb_typeof(capacity_snapshot) = 'object'),
  constraint makeup_candidate_sessions_credit_tenant_fk foreign key (makeup_credit_id, tenant_id) references public.makeup_credits (id, tenant_id) on delete cascade,
  constraint makeup_candidate_sessions_session_tenant_fk foreign key (session_id, tenant_id) references public.sessions (id, tenant_id) on delete cascade,
  constraint makeup_candidate_sessions_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete cascade
);

create table public.lesson_makeup_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  makeup_credit_id uuid references public.makeup_credits (id) on delete cascade,
  catch_up_request_id uuid references public.lesson_catch_up_requests (id) on delete cascade,
  candidate_session_id uuid references public.makeup_candidate_sessions (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  event_type text not null,
  summary text not null,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lesson_makeup_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint lesson_makeup_events_credit_tenant_fk foreign key (makeup_credit_id, tenant_id) references public.makeup_credits (id, tenant_id) on delete cascade,
  constraint lesson_makeup_events_request_tenant_fk foreign key (catch_up_request_id, tenant_id) references public.lesson_catch_up_requests (id, tenant_id) on delete cascade,
  constraint lesson_makeup_events_candidate_tenant_fk foreign key (candidate_session_id, tenant_id) references public.makeup_candidate_sessions (id, tenant_id) on delete cascade,
  constraint lesson_makeup_events_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint lesson_makeup_events_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

alter table public.makeup_credits
  add constraint makeup_credits_source_request_tenant_fk foreign key (source_request_id, tenant_id) references public.lesson_catch_up_requests (id, tenant_id) on delete set null;

alter table public.session_attendance
  add column if not exists makeup_credit_id uuid,
  add column if not exists makeup_eligible boolean not null default false,
  add column if not exists makeup_reason text,
  add column if not exists makeup_processed_at timestamptz;

alter table public.session_attendance
  drop constraint if exists session_attendance_makeup_credit_tenant_fk,
  add constraint session_attendance_makeup_credit_tenant_fk foreign key (makeup_credit_id, tenant_id) references public.makeup_credits (id, tenant_id) on delete set null;

alter table public.lesson_catch_up_requests
  add column if not exists makeup_credit_id uuid,
  add column if not exists target_session_id uuid,
  add column if not exists candidate_session_id uuid,
  add column if not exists approval_mode text not null default 'admin',
  add column if not exists decision_reason text,
  add column if not exists admin_note text;

alter table public.lesson_catch_up_requests
  drop constraint if exists lesson_catch_up_requests_makeup_credit_tenant_fk,
  add constraint lesson_catch_up_requests_makeup_credit_tenant_fk foreign key (makeup_credit_id, tenant_id) references public.makeup_credits (id, tenant_id) on delete set null,
  drop constraint if exists lesson_catch_up_requests_target_session_tenant_fk,
  add constraint lesson_catch_up_requests_target_session_tenant_fk foreign key (target_session_id, tenant_id) references public.sessions (id, tenant_id) on delete set null,
  drop constraint if exists lesson_catch_up_requests_candidate_session_tenant_fk,
  add constraint lesson_catch_up_requests_candidate_session_tenant_fk foreign key (candidate_session_id, tenant_id) references public.makeup_candidate_sessions (id, tenant_id) on delete set null,
  drop constraint if exists lesson_catch_up_requests_approval_mode_check,
  add constraint lesson_catch_up_requests_approval_mode_check check (approval_mode in ('admin', 'parent_choice', 'manual'));

create unique index makeup_credits_source_attendance_unique
  on public.makeup_credits (tenant_id, source_attendance_id)
  where source_attendance_id is not null;

create unique index makeup_credits_source_request_unique
  on public.makeup_credits (tenant_id, source_request_id)
  where source_request_id is not null;

create index tenant_lesson_cancellation_rules_tenant_status_idx
  on public.tenant_lesson_cancellation_rules (tenant_id, status);

create index makeup_credits_tenant_enrollment_status_idx
  on public.makeup_credits (tenant_id, enrollment_id, status, expires_at);

create index makeup_credits_participant_idx
  on public.makeup_credits (participant_id, status);

create index makeup_candidate_sessions_credit_status_idx
  on public.makeup_candidate_sessions (tenant_id, makeup_credit_id, status, score desc);

create index makeup_candidate_sessions_session_idx
  on public.makeup_candidate_sessions (session_id, status);

create index lesson_makeup_events_credit_idx
  on public.lesson_makeup_events (tenant_id, makeup_credit_id, created_at desc);

create index lesson_makeup_events_request_idx
  on public.lesson_makeup_events (tenant_id, catch_up_request_id, created_at desc);

create index session_attendance_makeup_credit_idx
  on public.session_attendance (tenant_id, makeup_credit_id)
  where makeup_credit_id is not null;

create trigger tenant_lesson_cancellation_rules_set_updated_at
  before update on public.tenant_lesson_cancellation_rules
  for each row execute function app_private.set_updated_at();

create trigger makeup_credits_set_updated_at
  before update on public.makeup_credits
  for each row execute function app_private.set_updated_at();

create trigger makeup_candidate_sessions_set_updated_at
  before update on public.makeup_candidate_sessions
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.tenant_lesson_cancellation_rules to authenticated;
grant select, insert, update on public.makeup_credits to authenticated;
grant select, insert, update on public.makeup_candidate_sessions to authenticated;
grant select, insert on public.lesson_makeup_events to authenticated;

grant all on public.tenant_lesson_cancellation_rules to service_role;
grant all on public.makeup_credits to service_role;
grant all on public.makeup_candidate_sessions to service_role;
grant all on public.lesson_makeup_events to service_role;

alter table public.tenant_lesson_cancellation_rules enable row level security;
alter table public.makeup_credits enable row level security;
alter table public.makeup_candidate_sessions enable row level security;
alter table public.lesson_makeup_events enable row level security;

create policy "Tenant staff can view cancellation rules"
  on public.tenant_lesson_cancellation_rules
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant admins can manage cancellation rules"
  on public.tenant_lesson_cancellation_rules
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin'])
  );

create policy "Participants and staff can view makeup credits"
  on public.makeup_credits
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

create policy "Tenant staff can create makeup credits"
  on public.makeup_credits
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can update makeup credits"
  on public.makeup_credits
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Participants and staff can view makeup candidates"
  on public.makeup_candidate_sessions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or exists (
      select 1
      from public.makeup_credits credit
      where credit.id = makeup_candidate_sessions.makeup_credit_id
        and credit.tenant_id = makeup_candidate_sessions.tenant_id
        and app_private.current_user_can_access_participant(credit.tenant_id, credit.participant_id)
    )
  );

create policy "Tenant staff can create makeup candidates"
  on public.makeup_candidate_sessions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update makeup candidates"
  on public.makeup_candidate_sessions
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Participants and staff can view makeup events"
  on public.lesson_makeup_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

create policy "Tenant staff can create makeup events"
  on public.lesson_makeup_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create or replace function app_private.expire_makeup_credits(target_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expired_count integer;
begin
  update public.makeup_credits
     set status = 'expired',
         updated_at = now()
   where tenant_id = target_tenant_id
     and status in ('available', 'reserved')
     and expires_at < now();

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function app_private.create_makeup_credit_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_rule public.tenant_lesson_cancellation_rules%rowtype;
  active_credit_count integer;
  existing_credit_id uuid;
  created_credit_id uuid;
  guardian_record record;
begin
  if tg_op = 'UPDATE'
     and old.status in ('absent', 'excused')
     and new.status not in ('absent', 'excused')
     and new.makeup_credit_id is not null
     and new.makeup_eligible = true then
    update public.makeup_credits
       set status = 'cancelled',
           metadata = metadata || jsonb_build_object('cancelled_by_attendance_status', new.status),
           updated_at = now()
     where tenant_id = new.tenant_id
       and id = new.makeup_credit_id
       and status in ('available', 'reserved');

    update public.session_attendance
       set makeup_eligible = false,
           makeup_reason = 'attendance_status_changed',
           makeup_processed_at = now()
     where tenant_id = new.tenant_id
       and id = new.id
       and makeup_eligible = true;

    insert into public.lesson_makeup_events (
      tenant_id,
      makeup_credit_id,
      participant_id,
      enrollment_id,
      event_type,
      summary,
      metadata
    )
    values (
      new.tenant_id,
      new.makeup_credit_id,
      new.participant_id,
      new.enrollment_id,
      'credit_cancelled',
      'Inhaalcredit geannuleerd doordat aanwezigheid is aangepast.',
      jsonb_build_object('attendance_status', new.status)
    );

    return new;
  end if;

  if new.status not in ('absent', 'excused') or new.makeup_credit_id is not null or new.makeup_processed_at is not null then
    return new;
  end if;

  select *
    into active_rule
  from public.tenant_lesson_cancellation_rules rule
  where rule.tenant_id = new.tenant_id
    and rule.status = 'active'
    and rule.makeup_credit_granted = true
    and new.status = any(rule.auto_credit_attendance_statuses)
  order by case when rule.rule_key = 'default' then 0 else 1 end, rule.created_at
  limit 1;

  if active_rule.id is null then
    return new;
  end if;

  select count(*)
    into active_credit_count
  from public.makeup_credits credit
  where credit.tenant_id = new.tenant_id
    and credit.enrollment_id = new.enrollment_id
    and credit.status in ('available', 'reserved');

  if active_credit_count >= active_rule.max_active_credits_per_enrollment then
    update public.session_attendance
       set makeup_eligible = false,
           makeup_reason = 'max_active_credits_reached',
           makeup_processed_at = now()
     where tenant_id = new.tenant_id
       and id = new.id
       and makeup_processed_at is null;

    return new;
  end if;

  select credit.id
    into existing_credit_id
  from public.makeup_credits credit
  where credit.tenant_id = new.tenant_id
    and credit.source_attendance_id = new.id
  limit 1;

  if existing_credit_id is null then
    insert into public.makeup_credits (
      tenant_id,
      participant_id,
      enrollment_id,
      source_session_id,
      source_attendance_id,
      rule_id,
      status,
      reason,
      granted_by,
      expires_at,
      metadata
    )
    values (
      new.tenant_id,
      new.participant_id,
      new.enrollment_id,
      new.session_id,
      new.id,
      active_rule.id,
      'available',
      coalesce(new.note, case when new.status = 'excused' then 'Afmelding geregistreerd.' else 'Afwezigheid geregistreerd.' end),
      'attendance',
      now() + make_interval(days => active_rule.credit_valid_days),
      jsonb_build_object(
        'source', 'attendance_trigger',
        'attendance_status', new.status,
        'rule_key', active_rule.rule_key,
        'requires_admin_approval', active_rule.requires_admin_approval
      )
    )
    returning id into created_credit_id;
  else
    created_credit_id := existing_credit_id;
  end if;

  update public.session_attendance
     set makeup_credit_id = created_credit_id,
         makeup_eligible = true,
         makeup_reason = 'attendance_credit_granted',
         makeup_processed_at = now()
   where tenant_id = new.tenant_id
     and id = new.id
     and makeup_credit_id is null;

  insert into public.lesson_makeup_events (
    tenant_id,
    makeup_credit_id,
    participant_id,
    enrollment_id,
    event_type,
    summary,
    metadata
  )
  values (
    new.tenant_id,
    created_credit_id,
    new.participant_id,
    new.enrollment_id,
    'credit_created',
    'Inhaalcredit automatisch aangemaakt op basis van aanwezigheid.',
    jsonb_build_object('attendance_id', new.id, 'attendance_status', new.status)
  );

  for guardian_record in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian_record.profile_id,
      new.participant_id,
      new.enrollment_id,
      'Inhaalles beschikbaar',
      'Er is een inhaalcredit aangemaakt. Kies een passend moment of wacht op goedkeuring van de zwemschool.',
      'catch_up',
      'unread'
    );
  end loop;

  return new;
end;
$$;

create or replace function app_private.refresh_makeup_candidate_sessions(target_tenant_id uuid, target_makeup_credit_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  credit_record record;
  current_stage_sort integer;
  inserted_count integer := 0;
begin
  select
    credit.id,
    credit.tenant_id,
    credit.participant_id,
    credit.enrollment_id,
    credit.source_session_id,
    credit.status,
    enrollment.program_id,
    enrollment.current_stage_id
  into credit_record
  from public.makeup_credits credit
  join public.enrollments enrollment
    on enrollment.id = credit.enrollment_id
   and enrollment.tenant_id = credit.tenant_id
  where credit.tenant_id = target_tenant_id
    and credit.id = target_makeup_credit_id
    and credit.status in ('available', 'reserved')
  limit 1;

  if credit_record.id is null then
    return 0;
  end if;

  select sort_order
    into current_stage_sort
  from public.stages
  where tenant_id = target_tenant_id
    and id = credit_record.current_stage_id;

  with latest_request as (
    select request.preferred_time_windows
    from public.lesson_catch_up_requests request
    where request.tenant_id = target_tenant_id
      and request.makeup_credit_id = target_makeup_credit_id
      and request.status in ('requested', 'approved')
    order by request.requested_at desc
    limit 1
  ),
  roster as (
    select
      membership.group_id,
      count(*) filter (
        where membership.status in ('planned', 'active')
          and membership.starts_on <= current_date
          and (membership.ends_on is null or membership.ends_on >= current_date)
      ) as active_memberships
    from public.group_memberships membership
    where membership.tenant_id = target_tenant_id
    group by membership.group_id
  ),
  approved_makeups as (
    select
      candidate.session_id,
      count(*) as used_makeup_spots
    from public.makeup_candidate_sessions candidate
    where candidate.tenant_id = target_tenant_id
      and candidate.status in ('selected', 'approved')
    group by candidate.session_id
  ),
  candidates as (
    select
      session.id as session_id,
      session.group_id,
      groups.name as group_name,
      groups.program_id,
      groups.stage_id,
      groups.resource_id,
      groups.instructor_id,
      groups.capacity,
      groups.makeup_spots,
      coalesce(roster.active_memberships, 0) as active_memberships,
      coalesce(approved_makeups.used_makeup_spots, 0) as used_makeup_spots,
      stages.sort_order as stage_sort_order,
      latest_request.preferred_time_windows,
      case
        when extract(hour from session.starts_at) < 12 then 'morning'
        when extract(hour from session.starts_at) < 17 then 'afternoon'
        else 'evening'
      end as time_window,
      case when groups.program_id = credit_record.program_id then 30 else 0 end
        + case when groups.stage_id = credit_record.current_stage_id then 25 when current_stage_sort is not null and abs(stages.sort_order - current_stage_sort) <= 1 then 15 else 0 end
        + case when groups.makeup_spots > coalesce(approved_makeups.used_makeup_spots, 0) then 20 when groups.capacity > coalesce(roster.active_memberships, 0) then 10 else 0 end
        + case when latest_request.preferred_time_windows is null or latest_request.preferred_time_windows = '{}'::text[] then 5 when (
            case
              when extract(hour from session.starts_at) < 12 then 'morning'
              when extract(hour from session.starts_at) < 17 then 'afternoon'
              else 'evening'
            end
          ) = any(latest_request.preferred_time_windows) then 15 else 0 end
        + case when session.starts_at >= now() + interval '1 day' then 10 else 0 end as score
    from public.sessions session
    join public.groups groups
      on groups.id = session.group_id
     and groups.tenant_id = session.tenant_id
    left join public.stages stages
      on stages.id = groups.stage_id
     and stages.tenant_id = groups.tenant_id
    left join roster
      on roster.group_id = groups.id
    left join approved_makeups
      on approved_makeups.session_id = session.id
    left join latest_request on true
    where session.tenant_id = target_tenant_id
      and session.status = 'scheduled'
      and session.starts_at > now()
      and session.id <> coalesce(credit_record.source_session_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and groups.status = 'active'
      and groups.program_id = credit_record.program_id
      and (
        groups.stage_id = credit_record.current_stage_id
        or current_stage_sort is null
        or abs(coalesce(stages.sort_order, current_stage_sort) - current_stage_sort) <= 1
      )
    order by score desc, session.starts_at asc
    limit 12
  )
  insert into public.makeup_candidate_sessions (
    tenant_id,
    makeup_credit_id,
    session_id,
    group_id,
    score,
    status,
    reasons,
    blockers,
    capacity_snapshot,
    expires_at
  )
  select
    target_tenant_id,
    credit_record.id,
    candidate.session_id,
    candidate.group_id,
    least(100, greatest(0, candidate.score)),
    'suggested',
    jsonb_build_array(
      jsonb_build_object('code', 'program_match', 'label', 'Programma match', 'detail', 'De les hoort bij hetzelfde programma.'),
      jsonb_build_object('code', 'stage_fit', 'label', 'Niveau match', 'detail', case when candidate.stage_id = credit_record.current_stage_id then 'Exact hetzelfde niveau.' else 'Compatibel aangrenzend niveau.' end),
      jsonb_build_object('code', 'time_window', 'label', 'Tijdvak', 'detail', 'Moment valt in of nabij de voorkeur.')
    ),
    case
      when candidate.makeup_spots <= candidate.used_makeup_spots and candidate.capacity <= candidate.active_memberships then
        jsonb_build_array(jsonb_build_object('code', 'no_makeup_capacity', 'label', 'Geen inhaalcapaciteit', 'detail', 'Groep heeft geen vrije inhaalplek.'))
      else '[]'::jsonb
    end,
    jsonb_build_object(
      'group_id', candidate.group_id,
      'group', candidate.group_name,
      'capacity', candidate.capacity,
      'active_memberships', candidate.active_memberships,
      'makeup_spots', candidate.makeup_spots,
      'used_makeup_spots', candidate.used_makeup_spots,
      'available_makeup_spots', greatest(0, candidate.makeup_spots - candidate.used_makeup_spots),
      'time_window', candidate.time_window,
      'rule_version', 'makeup-candidate-v1'
    ),
    now() + interval '14 days'
  from candidates candidate
  on conflict (tenant_id, makeup_credit_id, session_id) do update
    set score = excluded.score,
        reasons = excluded.reasons,
        blockers = excluded.blockers,
        capacity_snapshot = excluded.capacity_snapshot,
        expires_at = excluded.expires_at,
        updated_at = now()
  where public.makeup_candidate_sessions.status = 'suggested';

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function app_private.expire_makeup_credits(uuid) from public;
revoke all on function app_private.create_makeup_credit_from_attendance() from public;
revoke all on function app_private.refresh_makeup_candidate_sessions(uuid, uuid) from public;

grant execute on function app_private.expire_makeup_credits(uuid) to authenticated;
grant execute on function app_private.refresh_makeup_candidate_sessions(uuid, uuid) to authenticated;
grant execute on function app_private.expire_makeup_credits(uuid) to service_role;
grant execute on function app_private.create_makeup_credit_from_attendance() to service_role;
grant execute on function app_private.refresh_makeup_candidate_sessions(uuid, uuid) to service_role;

drop trigger if exists session_attendance_makeup_credit_trigger on public.session_attendance;
create trigger session_attendance_makeup_credit_trigger
  after insert or update of status on public.session_attendance
  for each row execute function app_private.create_makeup_credit_from_attendance();

drop trigger if exists tenant_lesson_cancellation_rules_audit_events on public.tenant_lesson_cancellation_rules;
create trigger tenant_lesson_cancellation_rules_audit_events
  after insert or update or delete on public.tenant_lesson_cancellation_rules
  for each row execute function app_private.record_audit_event();

drop trigger if exists makeup_credits_audit_events on public.makeup_credits;
create trigger makeup_credits_audit_events
  after insert or update or delete on public.makeup_credits
  for each row execute function app_private.record_audit_event();

drop trigger if exists makeup_candidate_sessions_audit_events on public.makeup_candidate_sessions;
create trigger makeup_candidate_sessions_audit_events
  after insert or update or delete on public.makeup_candidate_sessions
  for each row execute function app_private.record_audit_event();

drop trigger if exists lesson_makeup_events_audit_events on public.lesson_makeup_events;
create trigger lesson_makeup_events_audit_events
  after insert or update or delete on public.lesson_makeup_events
  for each row execute function app_private.record_audit_event();

drop trigger if exists lesson_catch_up_requests_audit_events on public.lesson_catch_up_requests;
create trigger lesson_catch_up_requests_audit_events
  after insert or update or delete on public.lesson_catch_up_requests
  for each row execute function app_private.record_audit_event();

drop trigger if exists session_attendance_audit_events on public.session_attendance;
create trigger session_attendance_audit_events
  after insert or update or delete on public.session_attendance
  for each row execute function app_private.record_audit_event();

insert into public.tenant_lesson_cancellation_rules (
  tenant_id,
  rule_key,
  name,
  who_may_cancel,
  deadline_hours,
  allowed_reasons,
  makeup_credit_granted,
  requires_admin_approval,
  max_active_credits_per_enrollment,
  credit_valid_days,
  auto_credit_attendance_statuses,
  metadata
)
select
  tenant.id,
  'default',
  'Standaard inhaalbeleid',
  array['parent', 'tenant_admin', 'tenant_staff']::text[],
  24,
  array['ziek', 'vakantie', 'familie', 'school', 'overig']::text[],
  true,
  true,
  3,
  90,
  array['absent', 'excused']::text[],
  jsonb_build_object('source', 'phase_s6_default')
from public.tenants tenant
on conflict (tenant_id, rule_key) do update
  set name = excluded.name,
      who_may_cancel = excluded.who_may_cancel,
      deadline_hours = excluded.deadline_hours,
      allowed_reasons = excluded.allowed_reasons,
      makeup_credit_granted = excluded.makeup_credit_granted,
      requires_admin_approval = excluded.requires_admin_approval,
      max_active_credits_per_enrollment = excluded.max_active_credits_per_enrollment,
      credit_valid_days = excluded.credit_valid_days,
      auto_credit_attendance_statuses = excluded.auto_credit_attendance_statuses,
      metadata = public.tenant_lesson_cancellation_rules.metadata || excluded.metadata,
      updated_at = now();

insert into public.tenant_smart_engine_settings (
  tenant_id,
  engine_key,
  mode,
  rule_version,
  weights,
  thresholds,
  expiry_settings,
  hold_settings,
  notification_settings,
  metadata
)
select
  tenant.id,
  'lesson',
  'semi_automatic',
  'makeup-v1',
  '{"attendance":30,"stage":20,"time_preference":15,"capacity":25,"admin_policy":10}'::jsonb,
  '{"candidate_minimum":55,"auto_credit":true}'::jsonb,
  '{"credit_valid_days":90,"candidate_days":14}'::jsonb,
  '{"requires_admin_approval":true}'::jsonb,
  '{"parent_credit_created":true,"admin_review":true,"instructor_visibility":true}'::jsonb,
  '{"rule_family":"lesson_makeup","phase":"S6"}'::jsonb
from public.tenants tenant
on conflict (tenant_id, engine_key) do update
  set rule_version = excluded.rule_version,
      weights = excluded.weights,
      thresholds = excluded.thresholds,
      expiry_settings = excluded.expiry_settings,
      hold_settings = excluded.hold_settings,
      notification_settings = excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata,
      updated_at = now();
