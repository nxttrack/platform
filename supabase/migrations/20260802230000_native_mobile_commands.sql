-- Authenticated, actor-bound and idempotent commands used by the native
-- instructor and parent clients. WebViews and service-role impersonation are
-- deliberately not part of this boundary.

alter table public.tenant_role_permission_overrides
  drop constraint tenant_role_permission_overrides_key_check,
  add constraint tenant_role_permission_overrides_key_check
    check (permission_key in (
      'curriculum.read',
      'curriculum.draft.manage',
      'curriculum.publish',
      'curriculum.migrate.preview',
      'curriculum.migrate.execute',
      'assessment.read',
      'assessment.record',
      'assessment.correct',
      'attendance.record',
      'transition.review',
      'transition.approve',
      'transition.execute',
      'carryover.complete_previous',
      'badge.read',
      'badge.definition.manage',
      'badge.publish',
      'badge.award',
      'badge.award_remaining',
      'badge.revoke',
      'group.read',
      'group.manage',
      'group.publish',
      'planning.manage',
      'holiday.manage',
      'billing.read',
      'billing.manage',
      'invoice.issue',
      'invoice.credit',
      'analytics.read',
      'forecast.read',
      'forecast.hold.manage'
    ));

alter table public.tenant_notifications
  add column if not exists dedupe_key text,
  add constraint tenant_notifications_dedupe_key_check
    check (dedupe_key is null or length(dedupe_key) between 8 and 200),
  add constraint tenant_notifications_dedupe_unique
    unique (tenant_id, recipient_user_id, dedupe_key);

create or replace function app_private.current_user_has_swim_permission(
  target_tenant_id uuid,
  target_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  membership_role text;
  explicit_grant boolean;
begin
  if app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']) then
    return true;
  end if;
  if app_private.current_user_has_platform_role(array['platform_support']) then
    return target_permission_key like '%.read';
  end if;

  select membership.role
    into membership_role
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.user_id = (select auth.uid())
    and membership.status = 'active'
  order by case membership.role
    when 'tenant_owner' then 1
    when 'tenant_admin' then 2
    when 'coordinator' then 3
    when 'tenant_staff' then 4
    when 'instructor' then 5
    when 'parent' then 6
    else 7
  end
  limit 1;

  if membership_role is null then return false; end if;
  select override.is_granted
    into explicit_grant
  from public.tenant_role_permission_overrides override
  where override.tenant_id = target_tenant_id
    and override.role = membership_role
    and override.permission_key = target_permission_key;
  if explicit_grant is not null then return explicit_grant; end if;

  if membership_role in ('tenant_owner', 'tenant_admin') then return true; end if;
  if membership_role in ('coordinator', 'tenant_staff') then
    return target_permission_key not in ('curriculum.publish', 'badge.publish');
  end if;
  if membership_role = 'instructor' then
    return target_permission_key in (
      'curriculum.read',
      'assessment.read',
      'assessment.record',
      'assessment.correct',
      'attendance.record',
      'transition.review',
      'carryover.complete_previous',
      'badge.read',
      'badge.award',
      'group.read'
    );
  end if;
  return target_permission_key in (
    'curriculum.read',
    'assessment.read',
    'badge.read',
    'group.read'
  );
end;
$$;

create or replace function app_private.native_command_request_hash(
  target_payload jsonb
)
returns text
language sql
immutable
security definer
set search_path = public, pg_temp
as $$
  select encode(
    extensions.digest(coalesce(target_payload, '{}'::jsonb)::text, 'sha256'),
    'hex'
  );
$$;

create or replace function app_private.mark_native_attendance(
  target_tenant_id uuid,
  target_session_id uuid,
  target_participant_id uuid,
  target_status text,
  target_note text,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_session public.sessions%rowtype;
  target_enrollment_id uuid;
  target_attendance_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  existing_attendance public.session_attendance%rowtype;
  request_hash text;
  result_json jsonb;
  actor_has_session_access boolean := false;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then
    raise exception 'Authenticated actor mismatch';
  end if;
  if not app_private.current_user_has_swim_permission(
    target_tenant_id,
    'attendance.record'
  ) then
    raise exception 'Insufficient attendance permission';
  end if;
  if target_status not in ('present', 'absent', 'late', 'excused', 'trial')
    or length(target_idempotency_key) not between 8 and 200
    or length(coalesce(target_note, '')) > 2000
  then
    raise exception 'Invalid attendance command';
  end if;

  select * into target_session
  from public.sessions session
  where session.tenant_id = target_tenant_id
    and session.id = target_session_id
    and session.status in ('scheduled', 'completed')
    and session.starts_at >= now() - interval '30 days'
    and session.starts_at <= now() + interval '24 hours'
  for update;
  if target_session.id is null then raise exception 'Session not available'; end if;

  actor_has_session_access :=
    app_private.current_user_can_manage_tenant_domain(target_tenant_id)
    or exists (
      select 1
      from public.session_instructor_assignments assignment
      where assignment.tenant_id = target_tenant_id
        and assignment.session_id = target_session.id
        and assignment.instructor_user_id = target_actor_user_id
        and assignment.status = 'active'
    )
    or exists (
      select 1
      from public.group_instructor_assignments assignment
      where assignment.tenant_id = target_tenant_id
        and assignment.group_id = target_session.group_id
        and assignment.instructor_user_id = target_actor_user_id
        and assignment.status = 'active'
    );
  if not actor_has_session_access then
    raise exception 'Instructor is not assigned to this session';
  end if;

  select membership.enrollment_id into target_enrollment_id
  from public.group_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.group_id = target_session.group_id
    and membership.participant_id = target_participant_id
    and membership.status in ('active', 'trial')
  order by membership.starts_on desc
  limit 1;
  if target_enrollment_id is null then
    select request.enrollment_id into target_enrollment_id
    from public.catch_up_requests request
    where request.tenant_id = target_tenant_id
      and request.assigned_session_id = target_session.id
      and request.participant_id = target_participant_id
      and request.status = 'approved'
    limit 1;
  end if;
  if target_enrollment_id is null then
    raise exception 'Participant is not on this session roster';
  end if;

  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'sessionId', target_session_id,
    'participantId', target_participant_id,
    'status', target_status,
    'note', nullif(trim(coalesce(target_note, '')), '')
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'attendance.mark'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.result_json;
  end if;

  select * into existing_attendance
  from public.session_attendance attendance
  where attendance.tenant_id = target_tenant_id
    and attendance.session_id = target_session_id
    and attendance.participant_id = target_participant_id
  for update;

  insert into public.session_attendance (
    tenant_id, session_id, participant_id, enrollment_id, status, note,
    marked_by_user_id, marked_at
  ) values (
    target_tenant_id, target_session_id, target_participant_id,
    target_enrollment_id, target_status,
    nullif(trim(coalesce(target_note, '')), ''),
    target_actor_user_id, now()
  )
  on conflict (tenant_id, session_id, participant_id)
  do update set
    enrollment_id = excluded.enrollment_id,
    status = excluded.status,
    note = excluded.note,
    marked_by_user_id = excluded.marked_by_user_id,
    marked_at = excluded.marked_at
  returning id into target_attendance_id;

  result_json := jsonb_build_object(
    'attendanceId', target_attendance_id,
    'status', target_status
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'attendance.mark',
    'session_attendance', target_attendance_id, target_actor_user_id,
    request_hash, result_json
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type, subject_type,
    subject_id, reason, before_json, after_json
  ) values (
    target_tenant_id, target_actor_user_id, 'attendance.record',
    'attendance.marked', 'session_attendance', target_attendance_id,
    'Native poolside attendance command',
    case when existing_attendance.id is null then '{}'::jsonb else
      jsonb_build_object('status', existing_attendance.status) end,
    jsonb_build_object(
      'status', target_status,
      'sessionId', target_session_id,
      'participantId', target_participant_id
    )
  );
  return result_json;
end;
$$;

create or replace function app_private.cancel_native_lesson(
  target_tenant_id uuid,
  target_session_id uuid,
  target_participant_id uuid,
  target_reason text,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_session public.sessions%rowtype;
  target_enrollment_id uuid;
  target_cancellation_id uuid;
  target_credit_id uuid;
  target_cutoff_hours integer := 12;
  target_credit_window_days integer := 60;
  target_grants_credit boolean := true;
  target_on_time boolean;
  target_eligible_for_credit boolean;
  existing_receipt public.domain_command_receipts%rowtype;
  existing_cancellation public.lesson_cancellations%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then
    raise exception 'Authenticated actor mismatch';
  end if;
  if length(target_idempotency_key) not between 8 and 200
    or length(coalesce(target_reason, '')) > 2000
  then
    raise exception 'Invalid lesson cancellation command';
  end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = target_actor_user_id
      and membership.role = 'parent'
      and membership.status = 'active'
  ) then
    raise exception 'Parent tenant membership required';
  end if;
  if not (
    exists (
      select 1 from public.participants participant
      where participant.tenant_id = target_tenant_id
        and participant.id = target_participant_id
        and participant.guardian_user_id = target_actor_user_id
    )
    or exists (
      select 1 from public.participant_guardians guardian
      where guardian.tenant_id = target_tenant_id
        and guardian.participant_id = target_participant_id
        and guardian.guardian_user_id = target_actor_user_id
        and guardian.status = 'active'
        and guardian.access_level in ('primary', 'secondary')
    )
  ) then
    raise exception 'Mutable guardian access required';
  end if;

  select * into target_session
  from public.sessions session
  where session.tenant_id = target_tenant_id
    and session.id = target_session_id
  for update;
  if target_session.id is null
    or target_session.status <> 'scheduled'
    or target_session.starts_at <= now()
  then
    raise exception 'Lesson is not cancellable';
  end if;
  select membership.enrollment_id into target_enrollment_id
  from public.group_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.group_id = target_session.group_id
    and membership.participant_id = target_participant_id
    and membership.status in ('active', 'trial')
  order by membership.starts_on desc
  limit 1;
  if target_enrollment_id is null then
    raise exception 'Participant is not enrolled in this lesson';
  end if;

  select
    coalesce(settings.lesson_cancellation_cutoff_hours, 12),
    coalesce(settings.lesson_cancellation_credit_window_days, 60),
    coalesce(settings.lesson_cancellation_grants_credit, true)
  into target_cutoff_hours, target_credit_window_days, target_grants_credit
  from public.tenant_settings settings
  where settings.tenant_id = target_tenant_id;
  if not found then
    target_cutoff_hours := 12;
    target_credit_window_days := 60;
    target_grants_credit := true;
  end if;
  target_on_time :=
    target_session.starts_at - now() >= make_interval(hours => target_cutoff_hours);
  target_eligible_for_credit := target_on_time and target_grants_credit;

  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'sessionId', target_session_id,
    'participantId', target_participant_id,
    'reason', nullif(trim(coalesce(target_reason, '')), '')
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'lesson.cancel'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.result_json;
  end if;

  select * into existing_cancellation
  from public.lesson_cancellations cancellation
  where cancellation.tenant_id = target_tenant_id
    and cancellation.session_id = target_session_id
    and cancellation.participant_id = target_participant_id
  for update;
  if existing_cancellation.id is not null then
    target_cancellation_id := existing_cancellation.id;
    select credit.id into target_credit_id
    from public.catch_up_credits credit
    where credit.tenant_id = target_tenant_id
      and credit.source_cancellation_id = existing_cancellation.id
    limit 1;
    result_json := jsonb_build_object(
      'cancellationId', target_cancellation_id,
      'creditId', target_credit_id,
      'existing', true,
      'status', existing_cancellation.status
    );
  else
    insert into public.lesson_cancellations (
      tenant_id, session_id, participant_id, enrollment_id, parent_user_id,
      status, policy_status, reason, eligible_for_credit
    ) values (
      target_tenant_id, target_session_id, target_participant_id,
      target_enrollment_id, target_actor_user_id,
      case when target_on_time then 'accepted' else 'late_cancelled' end,
      case when target_on_time then 'on_time' else 'late' end,
      nullif(trim(coalesce(target_reason, '')), ''),
      target_eligible_for_credit
    ) returning id into target_cancellation_id;

    if target_eligible_for_credit then
      insert into public.catch_up_credits (
        tenant_id, participant_id, enrollment_id, source_cancellation_id,
        status, credit_type, expires_on
      ) values (
        target_tenant_id, target_participant_id, target_enrollment_id,
        target_cancellation_id, 'available', 'lesson_cancellation',
        (now() at time zone 'UTC')::date + target_credit_window_days
      ) returning id into target_credit_id;
    end if;
    result_json := jsonb_build_object(
      'cancellationId', target_cancellation_id,
      'creditId', target_credit_id,
      'existing', false,
      'status', case when target_on_time then 'accepted' else 'late_cancelled' end
    );
  end if;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'lesson.cancel',
    'lesson_cancellation', target_cancellation_id, target_actor_user_id,
    request_hash, result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'lesson.cancelled', 'lesson_cancellation',
    target_cancellation_id, target_actor_user_id,
    jsonb_build_object(
      'participantId', target_participant_id,
      'sessionId', target_session_id,
      'eligibleForCredit', target_credit_id is not null
    )
  );
  return result_json;
end;
$$;

create or replace function app_private.respond_native_graduation_invite(
  target_tenant_id uuid,
  target_event_participant_id uuid,
  target_response text,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invite public.graduation_event_participants%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if target_response not in ('confirmed', 'declined')
    or length(target_idempotency_key) not between 8 and 200
  then raise exception 'Invalid graduation response'; end if;

  select * into target_invite
  from public.graduation_event_participants invite
  where invite.tenant_id = target_tenant_id
    and invite.id = target_event_participant_id
  for update;
  if target_invite.id is null then raise exception 'Graduation invite not found'; end if;
  if not (
    exists (
      select 1 from public.participants participant
      where participant.tenant_id = target_tenant_id
        and participant.id = target_invite.participant_id
        and participant.guardian_user_id = target_actor_user_id
    )
    or exists (
      select 1 from public.participant_guardians guardian
      where guardian.tenant_id = target_tenant_id
        and guardian.participant_id = target_invite.participant_id
        and guardian.guardian_user_id = target_actor_user_id
        and guardian.status = 'active'
        and guardian.access_level in ('primary', 'secondary')
    )
  ) then raise exception 'Mutable guardian access required'; end if;

  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'eventParticipantId', target_event_participant_id,
    'response', target_response
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'graduation.respond'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;

  update public.graduation_event_participants
  set invite_status = target_response,
      status = target_response,
      responded_at = now()
  where tenant_id = target_tenant_id
    and id = target_invite.id;
  result_json := jsonb_build_object(
    'eventParticipantId', target_invite.id,
    'response', target_response
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'graduation.respond',
    'graduation_event_participant', target_invite.id, target_actor_user_id,
    request_hash, result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'graduation.invite_responded',
    'graduation_event_participant', target_invite.id, target_actor_user_id,
    jsonb_build_object('response', target_response)
  );
  return result_json;
end;
$$;

create or replace function app_private.mark_native_notification_read(
  target_tenant_id uuid,
  target_notification_id uuid,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_notification public.tenant_notifications%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if length(target_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid notification command';
  end if;
  select * into target_notification
  from public.tenant_notifications notification
  where notification.tenant_id = target_tenant_id
    and notification.id = target_notification_id
    and notification.recipient_user_id = target_actor_user_id
  for update;
  if target_notification.id is null then raise exception 'Notification not found'; end if;
  request_hash := app_private.native_command_request_hash(
    jsonb_build_object('notificationId', target_notification_id)
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'notification.read'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;
  update public.tenant_notifications
  set status = 'read',
      read_at = coalesce(read_at, now())
  where tenant_id = target_tenant_id
    and id = target_notification_id;
  result_json := jsonb_build_object(
    'notificationId', target_notification_id,
    'status', 'read'
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'notification.read',
    'tenant_notification', target_notification_id, target_actor_user_id,
    request_hash, result_json
  );
  return result_json;
end;
$$;

create or replace function app_private.reply_native_message_thread(
  target_tenant_id uuid,
  target_thread_id uuid,
  target_plain_text text,
  target_content_classification text,
  target_classification_reasons jsonb,
  target_human_confirmed boolean,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_thread public.message_threads%rowtype;
  target_settings public.tenant_settings%rowtype;
  actor_is_admin boolean := false;
  actor_is_parent boolean := false;
  actor_is_assigned_instructor boolean := false;
  actor_is_group_instructor boolean := false;
  sender_type text;
  target_message_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if not target_human_confirmed
    or length(trim(coalesce(target_plain_text, ''))) not between 1 and 8000
    or target_content_classification not in (
      'operational', 'personal', 'sensitive', 'restricted'
    )
    or jsonb_typeof(coalesce(target_classification_reasons, '[]'::jsonb)) <> 'array'
    or length(target_idempotency_key) not between 8 and 200
  then raise exception 'Invalid message reply command'; end if;

  select * into target_thread
  from public.message_threads thread
  where thread.tenant_id = target_tenant_id
    and thread.id = target_thread_id
    and thread.status not in ('closed', 'archived')
    and not thread.is_test
  for update;
  if target_thread.id is null then raise exception 'Message thread not available'; end if;
  select * into target_settings
  from public.tenant_settings settings
  where settings.tenant_id = target_tenant_id;

  actor_is_admin := app_private.current_user_can_manage_tenant_domain(target_tenant_id);
  actor_is_parent := target_thread.guardian_user_id = target_actor_user_id;
  actor_is_assigned_instructor :=
    target_thread.assigned_instructor_user_id = target_actor_user_id
    or target_thread.assigned_staff_user_id = target_actor_user_id;
  actor_is_group_instructor :=
    target_settings.instructors_can_view_parent_threads = 'own_groups'
    and target_thread.group_id is not null
    and exists (
      select 1 from public.group_instructor_assignments assignment
      where assignment.tenant_id = target_tenant_id
        and assignment.group_id = target_thread.group_id
        and assignment.instructor_user_id = target_actor_user_id
        and assignment.status = 'active'
    );
  if actor_is_parent and target_thread.participant_id is not null and not (
    exists (
      select 1 from public.participants participant
      where participant.tenant_id = target_tenant_id
        and participant.id = target_thread.participant_id
        and participant.guardian_user_id = target_actor_user_id
    )
    or exists (
      select 1 from public.participant_guardians guardian
      where guardian.tenant_id = target_tenant_id
        and guardian.participant_id = target_thread.participant_id
        and guardian.guardian_user_id = target_actor_user_id
        and guardian.status = 'active'
        and guardian.access_level in ('primary', 'secondary')
    )
  ) then raise exception 'Parent has read-only thread access'; end if;
  if not actor_is_admin
    and not actor_is_parent
    and not actor_is_assigned_instructor
    and not actor_is_group_instructor
  then raise exception 'Message thread access denied'; end if;
  if (actor_is_assigned_instructor or actor_is_group_instructor)
    and not actor_is_admin
    and coalesce(target_settings.instructors_can_reply_to_parents, false) is not true
  then raise exception 'Instructor replies are disabled'; end if;

  sender_type := case
    when actor_is_parent then 'parent'
    when actor_is_admin then 'staff'
    else 'instructor'
  end;
  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'threadId', target_thread_id,
    'plainText', trim(target_plain_text),
    'classification', target_content_classification
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'message.reply'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;

  insert into public.messages (
    tenant_id, thread_id, sender_type, sender_user_id, body_json, body_html,
    plain_text, visibility, status, content_classification,
    classification_reasons, human_confirmed_at, sent_at, is_test, source
  ) values (
    target_tenant_id, target_thread_id, sender_type, target_actor_user_id,
    jsonb_build_object(
      'type', 'doc',
      'content', jsonb_build_array(jsonb_build_object(
        'type', 'paragraph',
        'content', jsonb_build_array(jsonb_build_object(
          'type', 'text',
          'text', trim(target_plain_text)
        ))
      ))
    ),
    null,
    trim(target_plain_text),
    'public_to_thread',
    'sent',
    target_content_classification,
    coalesce(target_classification_reasons, '[]'::jsonb),
    now(),
    now(),
    false,
    'manual'
  ) returning id into target_message_id;
  update public.message_threads
  set last_message_at = now(),
      status = case
        when actor_is_parent then 'waiting_for_school'
        else 'waiting_for_parent'
      end
  where tenant_id = target_tenant_id
    and id = target_thread_id;
  update public.message_thread_participants
  set last_read_at = now()
  where tenant_id = target_tenant_id
    and thread_id = target_thread_id
    and user_id = target_actor_user_id
    and status = 'active';

  result_json := jsonb_build_object(
    'messageId', target_message_id,
    'threadId', target_thread_id,
    'status', 'sent'
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'message.reply',
    'message', target_message_id, target_actor_user_id, request_hash,
    result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'communication.thread_replied', 'message',
    target_message_id, target_actor_user_id,
    jsonb_build_object(
      'threadId', target_thread_id,
      'senderType', sender_type,
      'contentClassification', target_content_classification
    )
  );
  return result_json;
end;
$$;

create or replace function app_private.record_native_media_consent(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_decision text,
  target_policy_version text,
  target_authority text,
  target_human_confirmed boolean,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_consent_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if not target_human_confirmed
    or target_decision not in ('granted', 'denied', 'withdrawn')
    or target_authority not in ('guardian', 'legal_representative')
    or target_policy_version <> '2026-07'
    or length(target_idempotency_key) not between 8 and 200
  then raise exception 'Invalid media consent command'; end if;

  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'participantId', target_participant_id,
    'decision', target_decision,
    'policyVersion', target_policy_version,
    'authority', target_authority
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'media.consent'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;

  target_consent_id := app_private.record_private_progress_media_consent(
    target_tenant_id,
    target_participant_id,
    target_decision,
    target_policy_version,
    target_authority
  );
  result_json := jsonb_build_object(
    'consentId', target_consent_id,
    'decision', target_decision,
    'participantId', target_participant_id,
    'policyVersion', target_policy_version
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'media.consent',
    'media_consent', target_consent_id, target_actor_user_id, request_hash,
    result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'media.consent_recorded', 'media_consent',
    target_consent_id, target_actor_user_id,
    jsonb_build_object(
      'participantId', target_participant_id,
      'decision', target_decision,
      'policyVersion', target_policy_version
    )
  );
  return result_json;
end;
$$;

create or replace function app_private.submit_native_parent_feedback(
  target_tenant_id uuid,
  target_request_id uuid,
  target_score integer,
  target_comment text,
  target_follow_up_allowed boolean,
  target_content_classification text,
  target_human_confirmed boolean,
  target_idempotency_key text,
  target_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.feedback_survey_requests%rowtype;
  target_response_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  result_json jsonb;
begin
  if target_actor_user_id is null
    or target_actor_user_id is distinct from (select auth.uid())
  then raise exception 'Authenticated actor mismatch'; end if;
  if not target_human_confirmed
    or target_score not between 0 and 10
    or length(coalesce(target_comment, '')) > 2000
    or target_content_classification not in (
      'operational', 'personal', 'sensitive'
    )
    or length(target_idempotency_key) not between 8 and 200
  then raise exception 'Invalid feedback command'; end if;

  request_hash := app_private.native_command_request_hash(jsonb_build_object(
    'requestId', target_request_id,
    'score', target_score,
    'comment', nullif(trim(coalesce(target_comment, '')), ''),
    'followUpAllowed', target_follow_up_allowed,
    'classification', target_content_classification
  ));
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.actor_user_id is distinct from target_actor_user_id
      or existing_receipt.command_type <> 'feedback.submit'
      or existing_receipt.request_hash <> request_hash
    then raise exception 'Idempotency key was already used for another command'; end if;
    return existing_receipt.result_json;
  end if;

  select * into target_request
  from public.feedback_survey_requests request
  where request.tenant_id = target_tenant_id
    and request.id = target_request_id
    and request.guardian_user_id = target_actor_user_id
  for update;
  if target_request.id is null
    or target_request.status <> 'open'
    or target_request.expires_at <= now()
    or not app_private.current_user_has_tenant_role(
      target_tenant_id,
      array['parent']
    )
  then raise exception 'Feedback request not available'; end if;

  insert into public.feedback_survey_responses (
    tenant_id, request_id, guardian_user_id, score, comment,
    follow_up_allowed, content_classification
  ) values (
    target_tenant_id, target_request.id, target_actor_user_id, target_score,
    nullif(trim(coalesce(target_comment, '')), ''),
    target_follow_up_allowed, target_content_classification
  ) returning id into target_response_id;
  update public.feedback_survey_requests
  set status = 'completed',
      completed_at = now()
  where tenant_id = target_tenant_id
    and id = target_request.id
    and status = 'open';

  result_json := jsonb_build_object(
    'requestId', target_request.id,
    'responseId', target_response_id,
    'status', 'completed'
  );
  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id, target_idempotency_key, 'feedback.submit',
    'feedback_survey_response', target_response_id, target_actor_user_id,
    request_hash, result_json
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id,
    payload_json
  ) values (
    target_tenant_id, 'feedback.submitted', 'feedback_survey_response',
    target_response_id, target_actor_user_id,
    jsonb_build_object(
      'requestId', target_request.id,
      'score', target_score,
      'followUpAllowed', target_follow_up_allowed
    )
  );
  return result_json;
end;
$$;

create or replace function public.mark_native_attendance(
  target_tenant_id uuid,
  target_session_id uuid,
  target_participant_id uuid,
  target_status text,
  target_note text,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.mark_native_attendance(
    target_tenant_id, target_session_id, target_participant_id,
    target_status, target_note, target_idempotency_key, (select auth.uid())
  );
$$;

create or replace function public.cancel_native_lesson(
  target_tenant_id uuid,
  target_session_id uuid,
  target_participant_id uuid,
  target_reason text,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.cancel_native_lesson(
    target_tenant_id, target_session_id, target_participant_id,
    target_reason, target_idempotency_key, (select auth.uid())
  );
$$;

create or replace function public.respond_native_graduation_invite(
  target_tenant_id uuid,
  target_event_participant_id uuid,
  target_response text,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.respond_native_graduation_invite(
    target_tenant_id, target_event_participant_id, target_response,
    target_idempotency_key, (select auth.uid())
  );
$$;

create or replace function public.mark_native_notification_read(
  target_tenant_id uuid,
  target_notification_id uuid,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.mark_native_notification_read(
    target_tenant_id, target_notification_id, target_idempotency_key,
    (select auth.uid())
  );
$$;

create or replace function public.reply_native_message_thread(
  target_tenant_id uuid,
  target_thread_id uuid,
  target_plain_text text,
  target_content_classification text,
  target_classification_reasons jsonb,
  target_human_confirmed boolean,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.reply_native_message_thread(
    target_tenant_id, target_thread_id, target_plain_text,
    target_content_classification, target_classification_reasons,
    target_human_confirmed, target_idempotency_key, (select auth.uid())
  );
$$;

create or replace function public.record_native_media_consent(
  target_tenant_id uuid,
  target_participant_id uuid,
  target_decision text,
  target_policy_version text,
  target_authority text,
  target_human_confirmed boolean,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.record_native_media_consent(
    target_tenant_id, target_participant_id, target_decision,
    target_policy_version, target_authority, target_human_confirmed,
    target_idempotency_key, (select auth.uid())
  );
$$;

create or replace function public.submit_native_parent_feedback(
  target_tenant_id uuid,
  target_request_id uuid,
  target_score integer,
  target_comment text,
  target_follow_up_allowed boolean,
  target_content_classification text,
  target_human_confirmed boolean,
  target_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.submit_native_parent_feedback(
    target_tenant_id, target_request_id, target_score, target_comment,
    target_follow_up_allowed, target_content_classification,
    target_human_confirmed, target_idempotency_key, (select auth.uid())
  );
$$;

revoke all on function app_private.native_command_request_hash(jsonb)
  from public, anon, authenticated;
revoke all on function app_private.mark_native_attendance(
  uuid, uuid, uuid, text, text, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.cancel_native_lesson(
  uuid, uuid, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.respond_native_graduation_invite(
  uuid, uuid, text, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.mark_native_notification_read(
  uuid, uuid, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.reply_native_message_thread(
  uuid, uuid, text, text, jsonb, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.record_native_media_consent(
  uuid, uuid, text, text, text, boolean, text, uuid
) from public, anon, authenticated;
revoke all on function app_private.submit_native_parent_feedback(
  uuid, uuid, integer, text, boolean, text, boolean, text, uuid
) from public, anon, authenticated;
grant execute on function app_private.native_command_request_hash(jsonb)
  to authenticated, service_role;
grant execute on function app_private.mark_native_attendance(
  uuid, uuid, uuid, text, text, text, uuid
) to authenticated, service_role;
grant execute on function app_private.cancel_native_lesson(
  uuid, uuid, uuid, text, text, uuid
) to authenticated, service_role;
grant execute on function app_private.respond_native_graduation_invite(
  uuid, uuid, text, text, uuid
) to authenticated, service_role;
grant execute on function app_private.mark_native_notification_read(
  uuid, uuid, text, uuid
) to authenticated, service_role;
grant execute on function app_private.reply_native_message_thread(
  uuid, uuid, text, text, jsonb, boolean, text, uuid
) to authenticated, service_role;
grant execute on function app_private.record_native_media_consent(
  uuid, uuid, text, text, text, boolean, text, uuid
) to authenticated, service_role;
grant execute on function app_private.submit_native_parent_feedback(
  uuid, uuid, integer, text, boolean, text, boolean, text, uuid
) to authenticated, service_role;

revoke all on function public.mark_native_attendance(
  uuid, uuid, uuid, text, text, text
) from public, anon;
revoke all on function public.cancel_native_lesson(
  uuid, uuid, uuid, text, text
) from public, anon;
revoke all on function public.respond_native_graduation_invite(
  uuid, uuid, text, text
) from public, anon;
revoke all on function public.mark_native_notification_read(
  uuid, uuid, text
) from public, anon;
revoke all on function public.reply_native_message_thread(
  uuid, uuid, text, text, jsonb, boolean, text
) from public, anon;
revoke all on function public.record_native_media_consent(
  uuid, uuid, text, text, text, boolean, text
) from public, anon;
revoke all on function public.submit_native_parent_feedback(
  uuid, uuid, integer, text, boolean, text, boolean, text
) from public, anon;
grant execute on function public.mark_native_attendance(
  uuid, uuid, uuid, text, text, text
) to authenticated;
grant execute on function public.cancel_native_lesson(
  uuid, uuid, uuid, text, text
) to authenticated;
grant execute on function public.respond_native_graduation_invite(
  uuid, uuid, text, text
) to authenticated;
grant execute on function public.mark_native_notification_read(
  uuid, uuid, text
) to authenticated;
grant execute on function public.reply_native_message_thread(
  uuid, uuid, text, text, jsonb, boolean, text
) to authenticated;
grant execute on function public.record_native_media_consent(
  uuid, uuid, text, text, text, boolean, text
) to authenticated;
grant execute on function public.submit_native_parent_feedback(
  uuid, uuid, integer, text, boolean, text, boolean, text
) to authenticated;

comment on function public.mark_native_attendance(
  uuid, uuid, uuid, text, text, text
) is
  'Actor-bound native attendance command with assignment, roster, window, idempotency and audit checks.';
comment on function public.cancel_native_lesson(
  uuid, uuid, uuid, text, text
) is
  'Transactional parent cancellation command that applies the tenant cutoff and creates at most one catch-up credit.';
comment on function public.reply_native_message_thread(
  uuid, uuid, text, text, jsonb, boolean, text
) is
  'Human-confirmed native thread reply; access and instructor reply policy are rechecked transactionally.';
comment on function public.record_native_media_consent(
  uuid, uuid, text, text, text, boolean, text
) is
  'Version-bound, guardian-owned and idempotent native consent command for private minor media.';
comment on function public.submit_native_parent_feedback(
  uuid, uuid, integer, text, boolean, text, boolean, text
) is
  'Idempotent native guardian feedback command with ownership, expiry and content-classification checks.';

notify pgrst, 'reload schema';
