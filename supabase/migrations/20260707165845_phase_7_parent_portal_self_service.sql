alter table public.profiles
  add column if not exists phone text;

grant update (full_name, avatar_url, phone) on public.profiles to authenticated;

alter table public.tenant_settings
  add column lesson_cancellation_cutoff_hours integer not null default 12,
  add column lesson_cancellation_credit_window_days integer not null default 60,
  add column lesson_cancellation_grants_credit boolean not null default true,
  add constraint tenant_settings_lesson_cancellation_cutoff_check check (lesson_cancellation_cutoff_hours >= 0 and lesson_cancellation_cutoff_hours <= 168),
  add constraint tenant_settings_lesson_cancellation_credit_window_check check (lesson_cancellation_credit_window_days >= 1 and lesson_cancellation_credit_window_days <= 365);

create table public.participant_guardians (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  relationship text not null default 'parent',
  access_level text not null default 'primary',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_guardians_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint participant_guardians_relationship_check check (relationship in ('parent', 'guardian', 'athlete_self', 'other')),
  constraint participant_guardians_access_level_check check (access_level in ('primary', 'secondary', 'view_only')),
  constraint participant_guardians_status_check check (status in ('active', 'inactive', 'revoked')),
  constraint participant_guardians_unique unique (tenant_id, participant_id, guardian_user_id)
);

insert into public.participant_guardians (tenant_id, participant_id, guardian_user_id, relationship, access_level, status)
select participant.tenant_id, participant.id, participant.guardian_user_id, 'parent', 'primary', 'active'
from public.participants participant
where participant.guardian_user_id is not null
on conflict (tenant_id, participant_id, guardian_user_id) do nothing;

create table public.lesson_cancellations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  parent_user_id uuid not null references auth.users (id) on delete restrict,
  status text not null default 'accepted',
  policy_status text not null default 'on_time',
  reason text,
  eligible_for_credit boolean not null default false,
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_cancellations_session_fk foreign key (tenant_id, session_id) references public.sessions (tenant_id, id) on delete cascade,
  constraint lesson_cancellations_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint lesson_cancellations_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint lesson_cancellations_status_check check (status in ('accepted', 'late_cancelled', 'reversed')),
  constraint lesson_cancellations_policy_status_check check (policy_status in ('on_time', 'late', 'manual')),
  constraint lesson_cancellations_tenant_id_id_unique unique (tenant_id, id),
  constraint lesson_cancellations_unique unique (tenant_id, session_id, participant_id)
);

create table public.catch_up_credits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid not null,
  source_cancellation_id uuid,
  status text not null default 'available',
  credit_type text not null default 'lesson_cancellation',
  granted_at timestamptz not null default now(),
  expires_on date,
  used_session_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catch_up_credits_participant_fk foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint catch_up_credits_enrollment_fk foreign key (tenant_id, enrollment_id, participant_id) references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint catch_up_credits_cancellation_fk foreign key (tenant_id, source_cancellation_id) references public.lesson_cancellations (tenant_id, id) on delete restrict,
  constraint catch_up_credits_used_session_fk foreign key (tenant_id, used_session_id) references public.sessions (tenant_id, id) on delete restrict,
  constraint catch_up_credits_status_check check (status in ('available', 'reserved', 'used', 'expired', 'void')),
  constraint catch_up_credits_type_check check (credit_type in ('lesson_cancellation', 'manual')),
  constraint catch_up_credits_unique_cancellation unique (tenant_id, source_cancellation_id)
);

create index participant_guardians_user_idx on public.participant_guardians (guardian_user_id, status);
create index participant_guardians_participant_idx on public.participant_guardians (tenant_id, participant_id, status);
create index lesson_cancellations_parent_idx on public.lesson_cancellations (tenant_id, parent_user_id, requested_at desc);
create index lesson_cancellations_session_idx on public.lesson_cancellations (tenant_id, session_id, participant_id);
create index catch_up_credits_participant_status_idx on public.catch_up_credits (tenant_id, participant_id, status, expires_on);

create trigger participant_guardians_set_updated_at
  before update on public.participant_guardians
  for each row execute function app_private.set_updated_at();

create trigger lesson_cancellations_set_updated_at
  before update on public.lesson_cancellations
  for each row execute function app_private.set_updated_at();

create trigger catch_up_credits_set_updated_at
  before update on public.catch_up_credits
  for each row execute function app_private.set_updated_at();

create or replace function app_private.current_user_can_view_participant(target_participant_id uuid)
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
        or exists (
          select 1
          from public.participant_guardians guardian
          where guardian.tenant_id = participant.tenant_id
            and guardian.participant_id = participant.id
            and guardian.guardian_user_id = (select auth.uid())
            and guardian.status = 'active'
        )
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

revoke all on function app_private.current_user_can_view_participant(uuid) from public;
grant execute on function app_private.current_user_can_view_participant(uuid) to authenticated;
grant execute on function app_private.current_user_can_view_participant(uuid) to service_role;

grant select, insert, update, delete on public.participant_guardians to authenticated;
grant select, insert, update, delete on public.lesson_cancellations to authenticated;
grant select, insert, update, delete on public.catch_up_credits to authenticated;

grant all on public.participant_guardians to service_role;
grant all on public.lesson_cancellations to service_role;
grant all on public.catch_up_credits to service_role;

alter table public.participant_guardians enable row level security;
alter table public.lesson_cancellations enable row level security;
alter table public.catch_up_credits enable row level security;

create policy "Guardians can view participant guardian links"
  on public.participant_guardians
  for select
  to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Tenant staff can manage participant guardian links"
  on public.participant_guardians
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Guardians can view own lesson cancellations"
  on public.lesson_cancellations
  for select
  to authenticated
  using (
    parent_user_id = (select auth.uid())
    or app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Guardians can create own lesson cancellations"
  on public.lesson_cancellations
  for insert
  to authenticated
  with check (
    parent_user_id = (select auth.uid())
    and app_private.current_user_can_view_participant(participant_id)
  );

create policy "Tenant staff can manage lesson cancellations"
  on public.lesson_cancellations
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Guardians can view own catch-up credits"
  on public.catch_up_credits
  for select
  to authenticated
  using (
    app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Tenant staff can manage catch-up credits"
  on public.catch_up_credits
  for all
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
