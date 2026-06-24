create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid references public.intake_submissions (id) on delete set null,
  program_id uuid not null references public.programs (id) on delete restrict,
  recommended_stage_id uuid references public.stages (id) on delete set null,
  status text not null default 'queued',
  priority_date date not null default current_date,
  preferred_days text[] not null default '{}'::text[],
  preferred_time_windows text[] not null default '{}'::text[],
  source text not null default 'intake',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_entries_status_check check (status in ('queued', 'matched', 'offered', 'placed', 'declined', 'rejected', 'cancelled')),
  constraint waitlist_entries_source_check check (source in ('intake', 'manual')),
  constraint waitlist_entries_preferred_days_check check (preferred_days <@ array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::text[]),
  constraint waitlist_entries_id_tenant_unique unique (id, tenant_id),
  constraint waitlist_entries_unique_intake unique (intake_submission_id),
  constraint waitlist_entries_intake_tenant_fk foreign key (intake_submission_id, tenant_id) references public.intake_submissions (id, tenant_id),
  constraint waitlist_entries_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint waitlist_entries_stage_tenant_fk foreign key (recommended_stage_id, tenant_id) references public.stages (id, tenant_id)
);

create table public.placement_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  intake_submission_id uuid references public.intake_submissions (id) on delete set null,
  program_id uuid not null references public.programs (id) on delete restrict,
  stage_id uuid references public.stages (id) on delete set null,
  group_id uuid not null references public.groups (id) on delete restrict,
  resource_id uuid references public.resources (id) on delete set null,
  score integer not null default 0,
  capacity_snapshot jsonb not null default '{}'::jsonb,
  rationale text,
  status text not null default 'suggested',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_suggestions_status_check check (status in ('suggested', 'approved', 'rejected', 'offered', 'placed', 'expired')),
  constraint placement_suggestions_score_check check (score >= 0 and score <= 100),
  constraint placement_suggestions_capacity_snapshot_check check (jsonb_typeof(capacity_snapshot) = 'object'),
  constraint placement_suggestions_id_tenant_unique unique (id, tenant_id),
  constraint placement_suggestions_waitlist_tenant_fk foreign key (waitlist_entry_id, tenant_id) references public.waitlist_entries (id, tenant_id) on delete cascade,
  constraint placement_suggestions_intake_tenant_fk foreign key (intake_submission_id, tenant_id) references public.intake_submissions (id, tenant_id),
  constraint placement_suggestions_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint placement_suggestions_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint placement_suggestions_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete restrict,
  constraint placement_suggestions_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id)
);

create table public.slot_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  placement_suggestion_id uuid not null references public.placement_suggestions (id) on delete cascade,
  waitlist_entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  intake_submission_id uuid references public.intake_submissions (id) on delete set null,
  program_id uuid not null references public.programs (id) on delete restrict,
  stage_id uuid references public.stages (id) on delete set null,
  group_id uuid not null references public.groups (id) on delete restrict,
  offer_token text not null default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  parent_responded_at timestamptz,
  parent_response_note text,
  participant_id uuid references public.participants (id) on delete set null,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  group_membership_id uuid references public.group_memberships (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slot_offers_status_check check (status in ('sent', 'accepted', 'declined', 'expired', 'cancelled')),
  constraint slot_offers_dates_check check (sent_at <= expires_at),
  constraint slot_offers_token_format check (offer_token ~ '^[a-zA-Z0-9_-]{16,128}$'),
  constraint slot_offers_unique_token unique (offer_token),
  constraint slot_offers_unique_suggestion unique (placement_suggestion_id),
  constraint slot_offers_id_tenant_unique unique (id, tenant_id),
  constraint slot_offers_suggestion_tenant_fk foreign key (placement_suggestion_id, tenant_id) references public.placement_suggestions (id, tenant_id) on delete cascade,
  constraint slot_offers_waitlist_tenant_fk foreign key (waitlist_entry_id, tenant_id) references public.waitlist_entries (id, tenant_id) on delete cascade,
  constraint slot_offers_intake_tenant_fk foreign key (intake_submission_id, tenant_id) references public.intake_submissions (id, tenant_id),
  constraint slot_offers_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint slot_offers_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint slot_offers_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete restrict,
  constraint slot_offers_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id),
  constraint slot_offers_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  constraint slot_offers_group_membership_tenant_fk foreign key (group_membership_id, tenant_id) references public.group_memberships (id, tenant_id)
);

create table public.slot_offer_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slot_offer_id uuid not null references public.slot_offers (id) on delete cascade,
  event_type text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint slot_offer_events_type_check check (event_type in ('sent', 'accepted', 'declined', 'expired', 'cancelled', 'placement_created')),
  constraint slot_offer_events_offer_tenant_fk foreign key (slot_offer_id, tenant_id) references public.slot_offers (id, tenant_id) on delete cascade
);

create table public.slot_offer_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  slot_offer_id uuid,
  offer_token text not null,
  response text not null,
  parent_note text,
  created_at timestamptz not null default now(),
  constraint slot_offer_responses_response_check check (response in ('accepted', 'declined')),
  constraint slot_offer_responses_token_format check (offer_token ~ '^[a-zA-Z0-9_-]{16,128}$'),
  constraint slot_offer_responses_offer_tenant_fk foreign key (slot_offer_id, tenant_id) references public.slot_offers (id, tenant_id) on delete cascade
);

create index waitlist_entries_tenant_id_idx on public.waitlist_entries (tenant_id);
create index waitlist_entries_status_idx on public.waitlist_entries (status);
create index waitlist_entries_program_id_idx on public.waitlist_entries (program_id);
create index placement_suggestions_tenant_id_idx on public.placement_suggestions (tenant_id);
create index placement_suggestions_status_idx on public.placement_suggestions (status);
create index placement_suggestions_group_id_idx on public.placement_suggestions (group_id);
create index slot_offers_tenant_id_idx on public.slot_offers (tenant_id);
create index slot_offers_status_idx on public.slot_offers (status);
create index slot_offers_group_id_idx on public.slot_offers (group_id);
create index slot_offer_events_offer_id_idx on public.slot_offer_events (slot_offer_id);
create index slot_offer_responses_offer_token_idx on public.slot_offer_responses (offer_token);

create trigger waitlist_entries_set_updated_at
  before update on public.waitlist_entries
  for each row execute function app_private.set_updated_at();

create trigger placement_suggestions_set_updated_at
  before update on public.placement_suggestions
  for each row execute function app_private.set_updated_at();

create trigger slot_offers_set_updated_at
  before update on public.slot_offers
  for each row execute function app_private.set_updated_at();

create or replace function app_private.process_slot_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  current_offer public.slot_offers%rowtype;
  current_intake public.intake_submissions%rowtype;
  target_group public.groups%rowtype;
  target_resource public.resources%rowtype;
  active_memberships integer;
  capacity_limit integer;
  created_participant_id uuid;
  created_enrollment_id uuid;
  created_membership_id uuid;
begin
  select *
    into current_offer
  from public.slot_offers
  where offer_token = new.offer_token
  for update;

  if not found then
    raise exception 'Slot offer not found.';
  end if;

  if current_offer.status <> 'sent' then
    raise exception 'Slot offer is not open.';
  end if;

  if current_offer.expires_at < now() then
    update public.slot_offers
      set status = 'expired',
          parent_responded_at = now(),
          parent_response_note = 'Expired before public response.'
    where id = current_offer.id;

    raise exception 'Slot offer is expired.';
  end if;

  new.tenant_id := current_offer.tenant_id;
  new.slot_offer_id := current_offer.id;

  if new.response = 'accepted' then
    select *
      into current_intake
    from public.intake_submissions
    where id = current_offer.intake_submission_id
      and tenant_id = current_offer.tenant_id;

    if not found then
      raise exception 'Linked intake submission not found.';
    end if;

    select *
      into target_group
    from public.groups
    where id = current_offer.group_id
      and tenant_id = current_offer.tenant_id
      and status = 'active';

    if not found then
      raise exception 'Target group is not active.';
    end if;

    select *
      into target_resource
    from public.resources
    where id = target_group.resource_id
      and tenant_id = current_offer.tenant_id;

    select count(*)
      into active_memberships
    from public.group_memberships membership
    where membership.group_id = target_group.id
      and membership.tenant_id = current_offer.tenant_id
      and membership.status in ('planned', 'active')
      and (membership.ends_on is null or membership.ends_on >= current_date);

    capacity_limit := target_group.capacity;

    if target_resource.id is not null and target_resource.capacity < capacity_limit then
      capacity_limit := target_resource.capacity;
    end if;

    if active_memberships >= capacity_limit then
      raise exception 'Target group has no available capacity.';
    end if;

    insert into public.participants (tenant_id, display_name, birthdate, external_reference, status)
    values (
      current_offer.tenant_id,
      current_intake.participant_name,
      current_intake.participant_birthdate,
      'intake-' || current_intake.id::text,
      'active'
    )
    on conflict (tenant_id, external_reference) do update
      set display_name = excluded.display_name,
          birthdate = excluded.birthdate,
          status = 'active'
    returning id into created_participant_id;

    insert into public.enrollments (
      tenant_id,
      external_reference,
      participant_id,
      program_id,
      current_stage_id,
      subscription_plan_id,
      status,
      started_on
    )
    values (
      current_offer.tenant_id,
      'offer-' || current_offer.id::text,
      created_participant_id,
      current_offer.program_id,
      current_offer.stage_id,
      null,
      'active',
      current_date
    )
    on conflict (tenant_id, external_reference) do update
      set participant_id = excluded.participant_id,
          program_id = excluded.program_id,
          current_stage_id = excluded.current_stage_id,
          status = 'active',
          ended_on = null
    returning id into created_enrollment_id;

    insert into public.group_memberships (tenant_id, enrollment_id, group_id, status, starts_on)
    values (current_offer.tenant_id, created_enrollment_id, current_offer.group_id, 'active', current_date)
    on conflict (enrollment_id, group_id, starts_on) do update
      set status = 'active',
          ends_on = null
    returning id into created_membership_id;

    update public.slot_offers
      set status = 'accepted',
          parent_responded_at = now(),
          parent_response_note = new.parent_note,
          participant_id = created_participant_id,
          enrollment_id = created_enrollment_id,
          group_membership_id = created_membership_id
    where id = current_offer.id;

    update public.placement_suggestions
      set status = 'placed',
          reviewed_at = coalesce(reviewed_at, now())
    where id = current_offer.placement_suggestion_id;

    update public.waitlist_entries
      set status = 'placed'
    where id = current_offer.waitlist_entry_id;

    update public.intake_submissions
      set status = 'accepted'
    where id = current_offer.intake_submission_id
      and tenant_id = current_offer.tenant_id;

    insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
    values (current_offer.tenant_id, current_offer.id, 'accepted', 'Public offer accepted; enrollment and group membership created.');
  else
    update public.slot_offers
      set status = 'declined',
          parent_responded_at = now(),
          parent_response_note = new.parent_note
    where id = current_offer.id;

    update public.placement_suggestions
      set status = 'rejected',
          reviewed_at = coalesce(reviewed_at, now())
    where id = current_offer.placement_suggestion_id;

    update public.waitlist_entries
      set status = 'declined'
    where id = current_offer.waitlist_entry_id;

    update public.intake_submissions
      set status = 'declined'
    where id = current_offer.intake_submission_id
      and tenant_id = current_offer.tenant_id;

    insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
    values (current_offer.tenant_id, current_offer.id, 'declined', 'Public offer declined.');
  end if;

  return new;
end $$;

create trigger slot_offer_responses_process
  before insert on public.slot_offer_responses
  for each row execute function app_private.process_slot_offer_response();

grant select, insert, update on public.waitlist_entries to authenticated;
grant all on public.waitlist_entries to service_role;

grant select, insert, update on public.placement_suggestions to authenticated;
grant all on public.placement_suggestions to service_role;

grant select, insert, update on public.slot_offers to authenticated;
grant all on public.slot_offers to service_role;

grant select, insert, update on public.slot_offer_events to authenticated;
grant all on public.slot_offer_events to service_role;

grant select on public.slot_offer_responses to authenticated;
grant insert (offer_token, response, parent_note) on public.slot_offer_responses to anon, authenticated;
grant all on public.slot_offer_responses to service_role;

alter table public.waitlist_entries enable row level security;
alter table public.placement_suggestions enable row level security;
alter table public.slot_offers enable row level security;
alter table public.slot_offer_events enable row level security;
alter table public.slot_offer_responses enable row level security;

create policy "Tenant staff can view waitlist entries"
  on public.waitlist_entries
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert waitlist entries"
  on public.waitlist_entries
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update waitlist entries"
  on public.waitlist_entries
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can view placement suggestions"
  on public.placement_suggestions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert placement suggestions"
  on public.placement_suggestions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update placement suggestions"
  on public.placement_suggestions
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can view slot offers"
  on public.slot_offers
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert slot offers"
  on public.slot_offers
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update slot offers"
  on public.slot_offers
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can view slot offer events"
  on public.slot_offer_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert slot offer events"
  on public.slot_offer_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update slot offer events"
  on public.slot_offer_events
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can view slot offer responses"
  on public.slot_offer_responses
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Public can insert slot offer responses"
  on public.slot_offer_responses
  for insert
  to authenticated, anon
  with check (
    response in ('accepted', 'declined')
    and slot_offer_id is not null
    and tenant_id is not null
  );

do $$
declare
  demo_tenant_id uuid;
  demo_intake_id uuid;
  demo_waitlist_id uuid;
  demo_suggestion_id uuid;
  diploma_a_program_id uuid;
  badje_1_stage_id uuid;
  zeesterren_group_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  select id into diploma_a_program_id
  from public.programs
  where tenant_id = demo_tenant_id
    and code = 'zwemdiploma-a';

  select id into badje_1_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and code = 'badje-1';

  select id into zeesterren_group_id
  from public.groups
  where tenant_id = demo_tenant_id
    and code = 'zeesterren-a1';

  if diploma_a_program_id is null or zeesterren_group_id is null then
    return;
  end if;

  insert into public.intake_submissions (
    tenant_id,
    program_id,
    intake_type,
    parent_name,
    parent_email,
    parent_phone,
    participant_name,
    participant_birthdate,
    preferred_days,
    preferred_time_windows,
    notes,
    answers,
    status
  )
  values (
    demo_tenant_id,
    diploma_a_program_id,
    'waitlist',
    'Samira Demo',
    'samira.demo@example.test',
    '+31600000000',
    'Luca Demo',
    '2020-04-12',
    array['monday', 'wednesday']::text[],
    array['afternoon']::text[],
    'Demo voor Phase 5 waitlist en plaatsingsvoorstel.',
    '{"swim_experience":"Watervrij, nog geen diploma."}'::jsonb,
    'matched'
  )
  on conflict do nothing
  returning id into demo_intake_id;

  if demo_intake_id is null then
    select id into demo_intake_id
    from public.intake_submissions
    where tenant_id = demo_tenant_id
      and parent_email = 'samira.demo@example.test'
      and participant_name = 'Luca Demo'
    limit 1;
  end if;

  if demo_intake_id is null then
    return;
  end if;

  insert into public.waitlist_entries (
    tenant_id,
    intake_submission_id,
    program_id,
    recommended_stage_id,
    status,
    priority_date,
    preferred_days,
    preferred_time_windows,
    source,
    notes
  )
  values (
    demo_tenant_id,
    demo_intake_id,
    diploma_a_program_id,
    badje_1_stage_id,
    'matched',
    current_date,
    array['monday', 'wednesday']::text[],
    array['afternoon']::text[],
    'intake',
    'Demo wachtlijstregel voor Phase 5.'
  )
  on conflict (intake_submission_id) do update
    set status = excluded.status,
        recommended_stage_id = excluded.recommended_stage_id,
        preferred_days = excluded.preferred_days,
        preferred_time_windows = excluded.preferred_time_windows
  returning id into demo_waitlist_id;

  insert into public.placement_suggestions (
    tenant_id,
    waitlist_entry_id,
    intake_submission_id,
    program_id,
    stage_id,
    group_id,
    score,
    capacity_snapshot,
    rationale,
    status
  )
  values (
    demo_tenant_id,
    demo_waitlist_id,
    demo_intake_id,
    diploma_a_program_id,
    badje_1_stage_id,
    zeesterren_group_id,
    86,
    '{"group_capacity":8,"active_memberships":1,"available_spots":7,"resource_capacity":8}'::jsonb,
    'Demo match: programma, startstage en voorkeursmoment passen bij Zeesterren A1.',
    'suggested'
  )
  on conflict do nothing
  returning id into demo_suggestion_id;
end $$;
