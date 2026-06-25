alter table public.slot_offers
  add column if not exists reminder_schedule jsonb not null default '[]'::jsonb,
  add column if not exists next_reminder_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count integer not null default 0,
  add column if not exists resent_count integer not null default 0,
  add column if not exists processing_status text not null default 'idle',
  add column if not exists processing_error text,
  add column if not exists placement_completed_at timestamptz,
  add column if not exists placement_result jsonb not null default '{}'::jsonb,
  add column if not exists decline_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

alter table public.slot_offers
  drop constraint if exists slot_offers_reminder_schedule_check,
  drop constraint if exists slot_offers_placement_result_check,
  drop constraint if exists slot_offers_processing_status_check,
  drop constraint if exists slot_offers_reminder_count_check,
  drop constraint if exists slot_offers_resent_count_check;

alter table public.slot_offers
  add constraint slot_offers_reminder_schedule_check check (jsonb_typeof(reminder_schedule) = 'array'),
  add constraint slot_offers_placement_result_check check (jsonb_typeof(placement_result) = 'object'),
  add constraint slot_offers_processing_status_check check (processing_status in ('idle', 'processing', 'completed', 'failed')),
  add constraint slot_offers_reminder_count_check check (reminder_count >= 0),
  add constraint slot_offers_resent_count_check check (resent_count >= 0);

alter table public.slot_offer_responses
  add column if not exists decline_reason text,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz;

alter table public.slot_offer_responses
  drop constraint if exists slot_offer_responses_processing_status_check;

alter table public.slot_offer_responses
  add constraint slot_offer_responses_processing_status_check check (processing_status in ('pending', 'processed', 'failed'));

alter table public.slot_offer_events
  drop constraint if exists slot_offer_events_type_check;

alter table public.slot_offer_events
  add constraint slot_offer_events_type_check check (
    event_type in (
      'sent',
      'resent',
      'accepted',
      'declined',
      'expired',
      'cancelled',
      'placement_created',
      'placement_completed',
      'reminder_scheduled',
      'reminder_sent',
      'processing_failed',
      'response_ignored'
    )
  );

create index if not exists slot_offers_next_reminder_idx
  on public.slot_offers (tenant_id, status, next_reminder_at)
  where status = 'sent' and next_reminder_at is not null;

create index if not exists slot_offers_processing_status_idx
  on public.slot_offers (tenant_id, processing_status, updated_at desc);

create index if not exists slot_offer_responses_processed_idx
  on public.slot_offer_responses (slot_offer_id, response, processing_status, created_at desc);

grant insert (offer_token, response, parent_note, decline_reason) on public.slot_offer_responses to anon, authenticated;

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
  notification_recipient record;
  response_note text;
  failure_message text;
begin
  select *
    into current_offer
  from public.slot_offers
  where offer_token = new.offer_token
  for update;

  if not found then
    new.processing_status := 'failed';
    new.processing_error := 'Slot offer not found.';
    return new;
  end if;

  new.tenant_id := current_offer.tenant_id;
  new.slot_offer_id := current_offer.id;
  new.decline_reason := nullif(trim(coalesce(new.decline_reason, '')), '');
  response_note := nullif(trim(coalesce(new.parent_note, '')), '');

  if current_offer.status = 'accepted' and new.response = 'accepted' then
    new.processing_status := 'processed';
    new.processing_error := null;
    new.processed_at := now();

    insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
    values (current_offer.tenant_id, current_offer.id, 'response_ignored', 'Duplicate accept response ignored; placement was already completed.');

    return new;
  end if;

  if current_offer.status <> 'sent' then
    new.processing_status := 'failed';
    new.processing_error := 'Slot offer is not open.';

    insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
    values (current_offer.tenant_id, current_offer.id, 'response_ignored', 'Public response ignored because offer status is ' || current_offer.status || '.');

    return new;
  end if;

  if current_offer.expires_at < now() then
    update public.capacity_holds
      set status = 'expired',
          released_at = now(),
          release_reason = 'slot offer expired before response'
    where slot_offer_id = current_offer.id
      and tenant_id = current_offer.tenant_id
      and status = 'active';

    update public.slot_offers
      set status = 'expired',
          processing_status = 'completed',
          processing_error = null,
          parent_responded_at = now(),
          parent_response_note = coalesce(response_note, 'Expired before public response.'),
          next_reminder_at = null
    where id = current_offer.id;

    update public.waitlist_entries
      set status = 'queued',
          reevaluation_requested_at = now()
    where id = current_offer.waitlist_entry_id
      and tenant_id = current_offer.tenant_id;

    update public.intake_submissions
      set status = 'reviewing'
    where id = current_offer.intake_submission_id
      and tenant_id = current_offer.tenant_id;

    insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
    values (current_offer.tenant_id, current_offer.id, 'expired', 'Offer expired before parent response; capacity hold released.');

    new.processing_status := 'failed';
    new.processing_error := 'Slot offer is expired.';
    return new;
  end if;

  update public.slot_offers
    set processing_status = 'processing',
        processing_error = null
  where id = current_offer.id;

  begin
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
            enrollment_id = created_enrollment_id,
            metadata = metadata || jsonb_build_object('group_membership_id', created_membership_id)
      where slot_offer_id = current_offer.id
        and tenant_id = current_offer.tenant_id
        and status = 'active';

      update public.slot_offers
        set status = 'accepted',
            processing_status = 'completed',
            processing_error = null,
            parent_responded_at = now(),
            parent_response_note = response_note,
            participant_id = created_participant_id,
            enrollment_id = created_enrollment_id,
            group_membership_id = created_membership_id,
            placement_completed_at = now(),
            next_reminder_at = null,
            placement_result = jsonb_build_object(
              'participant_id', created_participant_id,
              'enrollment_id', created_enrollment_id,
              'group_membership_id', created_membership_id,
              'waitlist_entry_id', current_offer.waitlist_entry_id,
              'intake_submission_id', current_offer.intake_submission_id
            )
      where id = current_offer.id;

      update public.placement_suggestions
        set status = 'placed',
            reviewed_at = coalesce(reviewed_at, now())
      where id = current_offer.placement_suggestion_id
        and tenant_id = current_offer.tenant_id;

      update public.waitlist_entries
        set status = 'placed'
      where id = current_offer.waitlist_entry_id
        and tenant_id = current_offer.tenant_id;

      update public.intake_submissions
        set status = 'accepted'
      where id = current_offer.intake_submission_id
        and tenant_id = current_offer.tenant_id;

      for notification_recipient in
        select guardian.profile_id
        from public.participant_guardians guardian
        where guardian.tenant_id = current_offer.tenant_id
          and guardian.participant_id = created_participant_id
          and guardian.status = 'active'
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
          current_offer.tenant_id,
          notification_recipient.profile_id,
          created_participant_id,
          created_enrollment_id,
          'Lesplek bevestigd',
          'De lesplek is bevestigd. De lessen verschijnen nu in Mijn lessen.',
          'general',
          'unread'
        );
      end loop;

      insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
      values
        (current_offer.tenant_id, current_offer.id, 'accepted', 'Public offer accepted.'),
        (current_offer.tenant_id, current_offer.id, 'placement_completed', 'Enrollment, group membership, waitlist and intake lifecycle completed.');

      new.processing_status := 'processed';
      new.processing_error := null;
      new.processed_at := now();
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
            processing_status = 'completed',
            processing_error = null,
            parent_responded_at = now(),
            parent_response_note = response_note,
            decline_reason = coalesce(new.decline_reason, response_note),
            next_reminder_at = null,
            placement_result = jsonb_build_object(
              'decline_reason', coalesce(new.decline_reason, response_note),
              'waitlist_entry_id', current_offer.waitlist_entry_id,
              'intake_submission_id', current_offer.intake_submission_id
            )
      where id = current_offer.id;

      update public.placement_suggestions
        set status = 'rejected',
            reviewed_at = coalesce(reviewed_at, now()),
            override_reason = coalesce(new.decline_reason, response_note, override_reason)
      where id = current_offer.placement_suggestion_id
        and tenant_id = current_offer.tenant_id;

      update public.waitlist_entries
        set status = 'declined',
            reevaluation_requested_at = now()
      where id = current_offer.waitlist_entry_id
        and tenant_id = current_offer.tenant_id;

      update public.intake_submissions
        set status = 'declined'
      where id = current_offer.intake_submission_id
        and tenant_id = current_offer.tenant_id;

      insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
      values (current_offer.tenant_id, current_offer.id, 'declined', coalesce('Public offer declined: ' || new.decline_reason, 'Public offer declined.'));

      new.processing_status := 'processed';
      new.processing_error := null;
      new.processed_at := now();
    end if;
  exception
    when others then
      failure_message := sqlerrm;

      update public.slot_offers
        set processing_status = 'failed',
            processing_error = failure_message,
            placement_result = placement_result || jsonb_build_object(
              'failed_at', now(),
              'response', new.response,
              'error', failure_message
            )
      where id = current_offer.id;

      insert into public.slot_offer_events (tenant_id, slot_offer_id, event_type, note)
      values (current_offer.tenant_id, current_offer.id, 'processing_failed', failure_message);

      new.processing_status := 'failed';
      new.processing_error := failure_message;
  end;

  return new;
end $$;

revoke all on function app_private.process_slot_offer_response() from public;
grant execute on function app_private.process_slot_offer_response() to service_role;

update public.slot_offers offer
set reminder_schedule = case
      when jsonb_array_length(offer.reminder_schedule) > 0 then offer.reminder_schedule
      else jsonb_build_array(
        jsonb_build_object('offset_days_before_expiry', 7, 'scheduled_at', greatest(offer.sent_at, offer.expires_at - interval '7 days'), 'status', 'scheduled'),
        jsonb_build_object('offset_days_before_expiry', 2, 'scheduled_at', greatest(offer.sent_at, offer.expires_at - interval '2 days'), 'status', 'scheduled')
      )
    end,
    next_reminder_at = case
      when offer.status = 'sent' then greatest(offer.sent_at, offer.expires_at - interval '7 days')
      else null
    end
where offer.status = 'sent';
