alter table public.groups
  add column if not exists reserved_spots integer not null default 0,
  add column if not exists trial_spots integer not null default 0,
  add column if not exists makeup_spots integer not null default 0,
  add column if not exists overbooking_policy text not null default 'blocked',
  add column if not exists capacity_policy jsonb not null default '{}'::jsonb;

alter table public.groups
  drop constraint if exists groups_reserved_spots_check,
  add constraint groups_reserved_spots_check check (reserved_spots >= 0),
  drop constraint if exists groups_trial_spots_check,
  add constraint groups_trial_spots_check check (trial_spots >= 0),
  drop constraint if exists groups_makeup_spots_check,
  add constraint groups_makeup_spots_check check (makeup_spots >= 0),
  drop constraint if exists groups_overbooking_policy_check,
  add constraint groups_overbooking_policy_check check (overbooking_policy in ('blocked', 'warn', 'allow')),
  drop constraint if exists groups_capacity_policy_check,
  add constraint groups_capacity_policy_check check (jsonb_typeof(capacity_policy) = 'object');

create table public.capacity_holds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  placement_suggestion_id uuid references public.placement_suggestions (id) on delete set null,
  slot_offer_id uuid references public.slot_offers (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  hold_type text not null default 'slot_offer',
  status text not null default 'active',
  quantity integer not null default 1,
  starts_on date not null default current_date,
  ends_on date,
  expires_at timestamptz not null default (now() + interval '14 days'),
  released_at timestamptz,
  release_reason text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capacity_holds_quantity_check check (quantity > 0),
  constraint capacity_holds_dates_check check (ends_on is null or starts_on <= ends_on),
  constraint capacity_holds_release_check check ((status = 'active' and released_at is null) or status <> 'active'),
  constraint capacity_holds_type_check check (hold_type in ('slot_offer', 'flow_through', 'trial', 'makeup', 'manual')),
  constraint capacity_holds_status_check check (status in ('active', 'released', 'expired', 'cancelled', 'converted')),
  constraint capacity_holds_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint capacity_holds_id_tenant_unique unique (id, tenant_id),
  constraint capacity_holds_group_tenant_fk foreign key (group_id, tenant_id) references public.groups (id, tenant_id) on delete cascade,
  constraint capacity_holds_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id),
  constraint capacity_holds_suggestion_tenant_fk foreign key (placement_suggestion_id, tenant_id) references public.placement_suggestions (id, tenant_id),
  constraint capacity_holds_slot_offer_tenant_fk foreign key (slot_offer_id, tenant_id) references public.slot_offers (id, tenant_id) on delete cascade,
  constraint capacity_holds_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create index capacity_holds_tenant_group_status_idx
  on public.capacity_holds (tenant_id, group_id, status, expires_at);

create index capacity_holds_slot_offer_idx
  on public.capacity_holds (slot_offer_id)
  where slot_offer_id is not null;

create unique index capacity_holds_active_slot_offer_unique
  on public.capacity_holds (slot_offer_id)
  where slot_offer_id is not null and status = 'active';

create trigger capacity_holds_set_updated_at
  before update on public.capacity_holds
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.capacity_holds to authenticated;
grant all on public.capacity_holds to service_role;

grant insert (tenant_id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, capacity_policy, status) on public.groups to authenticated;
grant update (program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, capacity_policy, status) on public.groups to authenticated;

alter table public.capacity_holds enable row level security;

create policy "Tenant staff can view capacity holds"
  on public.capacity_holds
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can create capacity holds"
  on public.capacity_holds
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update capacity holds"
  on public.capacity_holds
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

create trigger capacity_holds_audit_events
  after insert or update or delete on public.capacity_holds
  for each row execute function app_private.record_audit_event();

insert into public.capacity_holds (
  tenant_id,
  group_id,
  resource_id,
  placement_suggestion_id,
  slot_offer_id,
  hold_type,
  status,
  quantity,
  starts_on,
  expires_at,
  metadata
)
select
  offer.tenant_id,
  offer.group_id,
  suggestion.resource_id,
  offer.placement_suggestion_id,
  offer.id,
  'slot_offer',
  'active',
  1,
  current_date,
  offer.expires_at,
  jsonb_build_object('source', 's2_backfill', 'offer_status', offer.status)
from public.slot_offers offer
left join public.placement_suggestions suggestion
  on suggestion.id = offer.placement_suggestion_id
 and suggestion.tenant_id = offer.tenant_id
where offer.status = 'sent'
  and offer.expires_at > now()
on conflict do nothing;

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
  'capacity',
  'semi_automatic',
  'capacity-v1',
  '{"group_capacity":35,"resource_capacity":25,"active_memberships":20,"holds":15,"conflicts":5}'::jsonb,
  '{"minimum_open_spots":1,"warning_open_spots":2}'::jsonb,
  '{}'::jsonb,
  '{"slot_offer_hold_days":14,"flow_through_hold_days":7,"release_on_decline":true,"release_on_expiry":true}'::jsonb,
  '{"admin_capacity_warning":true}'::jsonb,
  '{"rule_family":"capacity","seeded_by":"smart_capacity_s2"}'::jsonb
from public.tenants tenant
on conflict (tenant_id, engine_key) do update
  set rule_version = excluded.rule_version,
      weights = public.tenant_smart_engine_settings.weights || excluded.weights,
      thresholds = public.tenant_smart_engine_settings.thresholds || excluded.thresholds,
      hold_settings = public.tenant_smart_engine_settings.hold_settings || excluded.hold_settings,
      notification_settings = public.tenant_smart_engine_settings.notification_settings || excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata;

create or replace function app_private.process_slot_offer_response()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  current_offer public.slot_offers%rowtype;
  current_intake public.intake_submissions%rowtype;
  target_group public.groups%rowtype;
  target_resource public.resources%rowtype;
  active_memberships integer;
  active_holds integer;
  capacity_limit integer;
  used_capacity integer;
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

    update public.capacity_holds
      set status = 'expired',
          released_at = now(),
          release_reason = 'slot offer expired before response'
    where slot_offer_id = current_offer.id
      and tenant_id = current_offer.tenant_id
      and status = 'active';

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
      and membership.starts_on <= current_date
      and (membership.ends_on is null or membership.ends_on >= current_date);

    select coalesce(sum(hold.quantity), 0)::integer
      into active_holds
    from public.capacity_holds hold
    where hold.group_id = target_group.id
      and hold.tenant_id = current_offer.tenant_id
      and hold.status = 'active'
      and hold.expires_at > now()
      and (hold.slot_offer_id is null or hold.slot_offer_id <> current_offer.id);

    capacity_limit := target_group.capacity;

    if target_resource.id is not null and target_resource.capacity < capacity_limit then
      capacity_limit := target_resource.capacity;
    end if;

    used_capacity := active_memberships
      + active_holds
      + target_group.reserved_spots
      + target_group.trial_spots
      + target_group.makeup_spots;

    if used_capacity >= capacity_limit and target_group.overbooking_policy = 'blocked' then
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

    update public.capacity_holds
      set status = 'converted',
          released_at = now(),
          release_reason = 'slot offer accepted',
          metadata = metadata || jsonb_build_object('group_membership_id', created_membership_id)
    where slot_offer_id = current_offer.id
      and tenant_id = current_offer.tenant_id
      and status = 'active';

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
    update public.capacity_holds
      set status = 'released',
          released_at = now(),
          release_reason = 'slot offer declined'
    where slot_offer_id = current_offer.id
      and tenant_id = current_offer.tenant_id
      and status = 'active';

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
