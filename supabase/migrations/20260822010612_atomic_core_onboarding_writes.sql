create table public.core_write_operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  operation_type text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'running',
  attempt_count integer not null default 1,
  result_json jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint core_write_operations_type_check check (
    operation_type in ('participant_graph', 'intake_submission', 'group_placement')
  ),
  constraint core_write_operations_key_check check (char_length(idempotency_key) between 16 and 200),
  constraint core_write_operations_fingerprint_check check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint core_write_operations_status_check check (status in ('running', 'completed', 'failed')),
  constraint core_write_operations_attempt_check check (attempt_count > 0),
  constraint core_write_operations_result_check check (result_json is null or jsonb_typeof(result_json) = 'object'),
  constraint core_write_operations_business_unique unique (tenant_id, operation_type, idempotency_key)
);

comment on table public.core_write_operations is
  'Service-only idempotency ledger for atomic participant, intake and placement writes; payloads and PII are never stored here.';

create index core_write_operations_tenant_status_idx
  on public.core_write_operations (tenant_id, status, updated_at desc);

create unique index group_memberships_one_live_enrollment_per_group_idx
  on public.group_memberships (tenant_id, group_id, enrollment_id)
  where status in ('active', 'trial');

alter table public.core_write_operations enable row level security;
alter table public.core_write_operations force row level security;

create policy "Client roles cannot read core write operations"
  on public.core_write_operations for select to authenticated
  using (false);

grant select on public.core_write_operations to authenticated;
grant all on public.core_write_operations to service_role;

create function public.create_participant_graph_atomic(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_idempotency_key text,
  target_request_fingerprint text,
  target_participant jsonb,
  target_enrollment jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  operation_row public.core_write_operations%rowtype;
  created_participant_id uuid;
  created_enrollment_id uuid;
  guardian_user_id uuid := nullif(target_participant ->> 'guardianUserId', '')::uuid;
  selected_program_id uuid := nullif(target_enrollment ->> 'programId', '')::uuid;
  selected_stage_id uuid := nullif(target_enrollment ->> 'stageId', '')::uuid;
  operation_result jsonb;
  failure_step text := current_setting('nxttrack.test_core_write_failure', true);
begin
  if target_idempotency_key is null or char_length(target_idempotency_key) not between 16 and 200
    or target_request_fingerprint !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(target_participant) <> 'object'
    or jsonb_typeof(target_enrollment) <> 'object'
  then
    raise exception 'Invalid participant graph command';
  end if;

  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) then
    raise exception 'Actor is not allowed to create participant graphs';
  end if;

  insert into public.core_write_operations (
    tenant_id, operation_type, idempotency_key, request_fingerprint, actor_user_id
  ) values (
    target_tenant_id, 'participant_graph', target_idempotency_key,
    target_request_fingerprint, target_actor_user_id
  )
  on conflict (tenant_id, operation_type, idempotency_key) do nothing;

  select * into operation_row
  from public.core_write_operations operation
  where operation.tenant_id = target_tenant_id
    and operation.operation_type = 'participant_graph'
    and operation.idempotency_key = target_idempotency_key
  for update;

  if operation_row.request_fingerprint is distinct from target_request_fingerprint then
    raise exception 'Participant operation key was reused with different input';
  end if;
  if operation_row.status = 'completed' then
    return operation_row.result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  update public.core_write_operations
  set status = 'running', attempt_count = operation_row.attempt_count + case when operation_row.status = 'failed' then 1 else 0 end,
      error_code = null, updated_at = now()
  where id = operation_row.id;

  if not exists (
    select 1 from public.programs program
    where program.tenant_id = target_tenant_id and program.id = selected_program_id and program.status = 'active'
  ) then
    raise exception 'Program does not belong to the active tenant';
  end if;
  if selected_stage_id is not null and not exists (
    select 1 from public.program_stages stage
    where stage.tenant_id = target_tenant_id and stage.id = selected_stage_id
      and stage.program_id = selected_program_id and stage.status = 'active'
  ) then
    raise exception 'Stage does not belong to the selected program';
  end if;
  if guardian_user_id is not null and not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = guardian_user_id
      and membership.role = 'parent'
      and membership.status = 'active'
  ) then
    raise exception 'Guardian does not belong to the tenant';
  end if;

  begin
    insert into public.participants (
      tenant_id, guardian_user_id, display_name, birth_date, gender, status, source
    ) values (
      target_tenant_id,
      guardian_user_id,
      trim(target_participant ->> 'displayName'),
      nullif(target_participant ->> 'birthDate', '')::date,
      coalesce(nullif(target_participant ->> 'gender', ''), 'unknown_legacy'),
      'active',
      'manual'
    ) returning id into created_participant_id;
    if failure_step = 'participant' then raise exception 'Injected participant failure'; end if;

    if guardian_user_id is not null then
      insert into public.participant_guardians (
        tenant_id, participant_id, guardian_user_id, relationship, access_level, status
      ) values (
        target_tenant_id, created_participant_id, guardian_user_id, 'parent', 'primary', 'active'
      );
    end if;
    if failure_step = 'guardian' then raise exception 'Injected guardian failure'; end if;

    insert into public.enrollments (
      tenant_id, participant_id, guardian_user_id, program_id, current_stage_id,
      status, source, starts_on
    ) values (
      target_tenant_id, created_participant_id, guardian_user_id, selected_program_id, selected_stage_id,
      'active', 'manual', coalesce(nullif(target_enrollment ->> 'startsOn', '')::date, current_date)
    ) returning id into created_enrollment_id;
    if failure_step = 'enrollment' then raise exception 'Injected enrollment failure'; end if;

    insert into public.swim_audit_events (
      tenant_id, actor_user_id, permission_key, event_type, subject_type,
      subject_id, reason, after_json, correlation_id
    ) values (
      target_tenant_id, target_actor_user_id, 'participant.manage',
      'participant.graph_created', 'participant', created_participant_id,
      'Atomic participant onboarding',
      jsonb_build_object('participantId', created_participant_id, 'enrollmentId', created_enrollment_id, 'guardianLinked', guardian_user_id is not null),
      operation_row.id
    );
    if failure_step = 'participant_audit' then raise exception 'Injected participant audit failure'; end if;

    operation_result := jsonb_build_object(
      'outcome', 'created', 'operationId', operation_row.id,
      'participantId', created_participant_id, 'enrollmentId', created_enrollment_id,
      'idempotentReplay', false
    );
  exception when others then
    update public.core_write_operations
    set status = 'failed', error_code = 'participant_graph_write_failed', result_json = null, updated_at = now()
    where id = operation_row.id;
    return jsonb_build_object('outcome', 'write_failed', 'operationId', operation_row.id);
  end;

  update public.core_write_operations
  set status = 'completed', result_json = operation_result, error_code = null,
      completed_at = now(), updated_at = now()
  where id = operation_row.id;
  return operation_result;
end;
$$;

create function public.create_intake_submission_atomic(
  target_tenant_id uuid,
  target_idempotency_key text,
  target_request_fingerprint text,
  target_dedupe_key text,
  target_submission jsonb,
  target_answers jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  operation_row public.core_write_operations%rowtype;
  created_submission_id uuid;
  duplicate_submission_id uuid;
  duplicate_state text := 'unique';
  operation_result jsonb;
  answer_count integer := 0;
  selected_program_id uuid := nullif(target_submission ->> 'programId', '')::uuid;
  selected_form_id uuid := nullif(target_submission ->> 'formId', '')::uuid;
  selected_group_id uuid := nullif(target_submission ->> 'selectedGroupId', '')::uuid;
  intake_option text := target_submission ->> 'selectedOption';
  failure_step text := current_setting('nxttrack.test_core_write_failure', true);
begin
  if target_idempotency_key is null or char_length(target_idempotency_key) not between 16 and 200
    or target_request_fingerprint !~ '^[a-f0-9]{64}$'
    or target_dedupe_key !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(target_submission) <> 'object'
    or jsonb_typeof(target_answers) <> 'array'
    or jsonb_array_length(target_answers) > 100
  then
    raise exception 'Invalid intake command';
  end if;

  if not exists (
    select 1 from public.tenants tenant
    where tenant.id = target_tenant_id and tenant.status = 'active'
  ) then
    raise exception 'Intake tenant is not active';
  end if;

  insert into public.core_write_operations (
    tenant_id, operation_type, idempotency_key, request_fingerprint
  ) values (
    target_tenant_id, 'intake_submission', target_idempotency_key, target_request_fingerprint
  )
  on conflict (tenant_id, operation_type, idempotency_key) do nothing;

  select * into operation_row
  from public.core_write_operations operation
  where operation.tenant_id = target_tenant_id
    and operation.operation_type = 'intake_submission'
    and operation.idempotency_key = target_idempotency_key
  for update;

  if operation_row.request_fingerprint is distinct from target_request_fingerprint then
    raise exception 'Intake operation key was reused with different input';
  end if;
  if operation_row.status = 'completed' then
    return operation_row.result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  update public.core_write_operations
  set status = 'running', attempt_count = operation_row.attempt_count + case when operation_row.status = 'failed' then 1 else 0 end,
      error_code = null, updated_at = now()
  where id = operation_row.id;

  if intake_option not in ('enrollment', 'trial', 'waitlist', 'information_request') then
    raise exception 'Invalid intake option';
  end if;
  if selected_program_id is not null and not exists (
    select 1 from public.programs program
    where program.tenant_id = target_tenant_id and program.id = selected_program_id and program.status = 'active'
  ) then
    raise exception 'Intake program does not belong to tenant';
  end if;
  if selected_form_id is not null and not exists (
    select 1 from public.intake_forms form
    where form.tenant_id = target_tenant_id and form.id = selected_form_id and form.status = 'active'
      and intake_option = any(form.allowed_options)
      and (form.program_id is null or form.program_id = selected_program_id)
  ) then
    raise exception 'Intake form does not belong to program';
  end if;
  if selected_group_id is not null and not exists (
    select 1 from public.groups lesson_group
    where lesson_group.tenant_id = target_tenant_id and lesson_group.id = selected_group_id
      and lesson_group.program_id = selected_program_id and lesson_group.status = 'active'
  ) then
    raise exception 'Selected group does not belong to program';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(target_answers) answer
    where coalesce(answer ->> 'fieldKey', '') !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
       or (
         nullif(answer ->> 'questionId', '') is not null
         and not exists (
           select 1 from public.intake_questions question
           where question.tenant_id = target_tenant_id
             and question.id = (answer ->> 'questionId')::uuid
             and question.form_id = selected_form_id
             and question.field_key = answer ->> 'fieldKey'
         )
       )
  ) then
    raise exception 'Intake answer does not belong to form';
  end if;
  if exists (
    select 1 from jsonb_array_elements(target_answers) answer
    group by answer ->> 'fieldKey' having count(*) > 1
  ) then
    raise exception 'Duplicate intake answer field';
  end if;

  begin
    select intake.id into duplicate_submission_id
    from public.intake_submissions intake
    where intake.tenant_id = target_tenant_id
      and intake.dedupe_key = target_dedupe_key
      and intake.received_at >= now() - interval '30 days'
    order by intake.received_at desc
    limit 1;
    if duplicate_submission_id is not null then duplicate_state := 'possible_duplicate'; end if;

    insert into public.intake_submissions (
      tenant_id, form_id, program_id, selected_option,
      parent_name, parent_email, parent_phone,
      secondary_parent_name, secondary_parent_email, secondary_parent_phone,
      participant_name, participant_birth_date, participant_gender,
      preferred_days, preferred_dayparts, preferred_notes, message,
      content_classification, classification_reasons, swimming_experience,
      recommendation_snapshot, selected_group_id, selected_wait_band, recommendation_version,
      consent_given, source_hostname, dedupe_key, duplicate_state, duplicate_of_submission_id,
      abuse_fingerprint, attribution_channel, attribution_source, attribution_medium,
      attribution_campaign, attribution_content, attribution_term, attribution_referrer_host,
      attribution_landing_path, attribution_has_ad_click_id, attribution_captured_at,
      analytics_consent, analytics_consent_version
    ) values (
      target_tenant_id, selected_form_id, selected_program_id, intake_option,
      target_submission ->> 'parentName', target_submission ->> 'parentEmail', nullif(target_submission ->> 'parentPhone', ''),
      nullif(target_submission ->> 'secondaryParentName', ''), nullif(target_submission ->> 'secondaryParentEmail', ''), nullif(target_submission ->> 'secondaryParentPhone', ''),
      target_submission ->> 'participantName', nullif(target_submission ->> 'participantBirthDate', '')::date,
      target_submission ->> 'participantGender',
      coalesce(array(select jsonb_array_elements_text(target_submission -> 'preferredDays')), '{}'),
      coalesce(target_submission -> 'preferredDayparts', '{}'::jsonb), nullif(target_submission ->> 'preferredNotes', ''), nullif(target_submission ->> 'message', ''),
      target_submission ->> 'contentClassification', coalesce(target_submission -> 'classificationReasons', '[]'::jsonb), nullif(target_submission ->> 'swimmingExperience', ''),
      coalesce(target_submission -> 'recommendationSnapshot', '[]'::jsonb), selected_group_id,
      nullif(target_submission ->> 'selectedWaitBand', ''), nullif(target_submission ->> 'recommendationVersion', ''),
      coalesce((target_submission ->> 'consentGiven')::boolean, false), nullif(target_submission ->> 'sourceHostname', ''),
      target_dedupe_key, duplicate_state, duplicate_submission_id, nullif(target_submission ->> 'abuseFingerprint', ''),
      target_submission ->> 'attributionChannel', target_submission ->> 'attributionSource', nullif(target_submission ->> 'attributionMedium', ''),
      nullif(target_submission ->> 'attributionCampaign', ''), nullif(target_submission ->> 'attributionContent', ''), nullif(target_submission ->> 'attributionTerm', ''),
      nullif(target_submission ->> 'attributionReferrerHost', ''), target_submission ->> 'attributionLandingPath',
      coalesce((target_submission ->> 'attributionHasAdClickId')::boolean, false), nullif(target_submission ->> 'attributionCapturedAt', '')::timestamptz,
      target_submission ->> 'analyticsConsent', target_submission ->> 'analyticsConsentVersion'
    ) returning id into created_submission_id;
    if failure_step = 'intake_submission' then raise exception 'Injected intake submission failure'; end if;

    insert into public.intake_answers (
      tenant_id, submission_id, question_id, field_key, answer_text, answer_json,
      content_classification, classification_reasons
    )
    select
      target_tenant_id, created_submission_id, nullif(answer ->> 'questionId', '')::uuid,
      answer ->> 'fieldKey', nullif(answer ->> 'answerText', ''),
      case when answer -> 'answerJson' = 'null'::jsonb then null else answer -> 'answerJson' end,
      answer ->> 'contentClassification', coalesce(answer -> 'classificationReasons', '[]'::jsonb)
    from jsonb_array_elements(target_answers) answer;
    get diagnostics answer_count = row_count;
    if failure_step = 'intake_answers' then raise exception 'Injected intake answers failure'; end if;

    insert into public.tenant_events (
      tenant_id, event_type, subject_type, subject_id,
      content_classification, classification_reasons, payload
    ) values (
      target_tenant_id, 'intake.received', 'intake_submission', created_submission_id,
      target_submission ->> 'contentClassification', coalesce(target_submission -> 'classificationReasons', '[]'::jsonb),
      jsonb_build_object(
        'operationId', operation_row.id,
        'selectedOption', intake_option, 'programId', selected_program_id,
        'duplicateState', duplicate_state, 'duplicateOfSubmissionId', duplicate_submission_id,
        'selectedGroupId', selected_group_id, 'recommendationVersion', target_submission ->> 'recommendationVersion',
        'analyticsConsent', target_submission ->> 'analyticsConsent'
      )
    );
    if failure_step = 'intake_audit' then raise exception 'Injected intake audit failure'; end if;

    operation_result := jsonb_build_object(
      'outcome', 'submitted', 'operationId', operation_row.id,
      'submissionId', created_submission_id, 'answerCount', answer_count,
      'duplicateState', duplicate_state, 'idempotentReplay', false
    );
  exception when others then
    update public.core_write_operations
    set status = 'failed', error_code = 'intake_write_failed', result_json = null, updated_at = now()
    where id = operation_row.id;
    return jsonb_build_object('outcome', 'write_failed', 'operationId', operation_row.id);
  end;

  update public.core_write_operations
  set status = 'completed', result_json = operation_result, error_code = null,
      completed_at = now(), updated_at = now()
  where id = operation_row.id;
  return operation_result;
end;
$$;

create function public.place_group_membership_atomic(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_idempotency_key text,
  target_request_fingerprint text,
  target_group_id uuid,
  target_enrollment_id uuid,
  target_status text,
  target_capacity_bucket text,
  target_capacity_weight numeric,
  target_starts_on date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  operation_row public.core_write_operations%rowtype;
  target_group public.groups%rowtype;
  target_enrollment public.enrollments%rowtype;
  existing_membership_id uuid;
  membership_id uuid;
  regular_used numeric := 0;
  flex_used numeric := 0;
  trial_used numeric := 0;
  total_used numeric := 0;
  bucket_limit numeric := 0;
  bucket_used numeric := 0;
  operation_result jsonb;
  failure_step text := current_setting('nxttrack.test_core_write_failure', true);
begin
  if target_idempotency_key is null or char_length(target_idempotency_key) not between 16 and 200
    or target_request_fingerprint !~ '^[a-f0-9]{64}$'
    or target_status not in ('active', 'trial', 'paused')
    or target_capacity_bucket not in ('regular', 'flex', 'trial')
    or target_capacity_weight < 0 or target_capacity_weight > 1
    or (target_status = 'trial' and target_capacity_bucket <> 'trial')
  then
    raise exception 'Invalid group placement command';
  end if;

  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = target_actor_user_id
      and membership.status = 'active'
      and membership.role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) then
    raise exception 'Actor is not allowed to place participants';
  end if;

  insert into public.core_write_operations (
    tenant_id, operation_type, idempotency_key, request_fingerprint, actor_user_id
  ) values (
    target_tenant_id, 'group_placement', target_idempotency_key,
    target_request_fingerprint, target_actor_user_id
  )
  on conflict (tenant_id, operation_type, idempotency_key) do nothing;

  select * into operation_row
  from public.core_write_operations operation
  where operation.tenant_id = target_tenant_id
    and operation.operation_type = 'group_placement'
    and operation.idempotency_key = target_idempotency_key
  for update;

  if operation_row.request_fingerprint is distinct from target_request_fingerprint then
    raise exception 'Placement operation key was reused with different input';
  end if;
  if operation_row.status = 'completed' then
    return operation_row.result_json || jsonb_build_object('idempotentReplay', true);
  end if;

  update public.core_write_operations
  set status = 'running', attempt_count = operation_row.attempt_count + case when operation_row.status = 'failed' then 1 else 0 end,
      error_code = null, updated_at = now()
  where id = operation_row.id;

  select * into target_group
  from public.groups lesson_group
  where lesson_group.tenant_id = target_tenant_id and lesson_group.id = target_group_id
  for update;
  if target_group.id is null or target_group.status <> 'active' then
    raise exception 'Group does not belong to active tenant scope';
  end if;

  select * into target_enrollment
  from public.enrollments enrollment
  where enrollment.tenant_id = target_tenant_id and enrollment.id = target_enrollment_id;
  if target_enrollment.id is null or target_enrollment.status <> 'active'
    or target_enrollment.program_id <> target_group.program_id
  then
    raise exception 'Enrollment does not belong to group program';
  end if;

  if target_status in ('active', 'trial') then
    select membership.id into existing_membership_id
    from public.group_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.group_id = target_group_id
      and membership.enrollment_id = target_enrollment_id
      and membership.status in ('active', 'trial')
    limit 1;
  end if;
  if existing_membership_id is not null then
    operation_result := jsonb_build_object(
      'outcome', 'already_placed', 'operationId', operation_row.id,
      'membershipId', existing_membership_id, 'idempotentReplay', false
    );
    update public.core_write_operations
    set status = 'completed', result_json = operation_result, completed_at = now(), updated_at = now()
    where id = operation_row.id;
    return operation_result;
  end if;

  if target_status in ('active', 'trial') then
    select
      coalesce(sum(source.weight) filter (where source.bucket = 'regular'), 0),
      coalesce(sum(source.weight) filter (where source.bucket = 'flex'), 0),
      coalesce(sum(source.weight) filter (where source.bucket = 'trial'), 0),
      coalesce(sum(source.weight), 0)
    into regular_used, flex_used, trial_used, total_used
    from (
      select membership.capacity_bucket as bucket, membership.capacity_weight as weight
      from public.group_memberships membership
      where membership.tenant_id = target_tenant_id
        and membership.group_id = target_group_id
        and membership.status in ('active', 'trial')
      union all
      select registration.capacity_bucket, 1::numeric
      from public.offering_registrations registration
      where registration.tenant_id = target_tenant_id
        and registration.group_id = target_group_id
        and registration.status in ('held', 'pending_payment', 'payment_review')
        and (registration.hold_expires_at is null or registration.hold_expires_at > now())
      union all
      select reservation.capacity_bucket, reservation.capacity_weight
      from public.capacity_soft_reservations reservation
      where reservation.tenant_id = target_tenant_id
        and reservation.group_id = target_group_id
        and reservation.status = 'approved'
        and reservation.expires_at > now()
    ) source;

    bucket_limit := case target_capacity_bucket
      when 'regular' then target_group.regular_capacity
      when 'flex' then target_group.flex_capacity
      else target_group.trial_capacity
    end;
    if target_capacity_bucket = 'flex' and target_group.capacity_borrowing in ('flex_from_regular', 'bidirectional') then
      bucket_limit := bucket_limit + greatest(target_group.regular_capacity - regular_used, 0);
    elsif target_capacity_bucket = 'regular' and target_group.capacity_borrowing = 'bidirectional' then
      bucket_limit := bucket_limit + greatest(target_group.flex_capacity - flex_used, 0);
    end if;
    bucket_used := case target_capacity_bucket
      when 'regular' then regular_used when 'flex' then flex_used else trial_used
    end;

    if total_used + target_capacity_weight > target_group.hard_capacity
      or bucket_used + target_capacity_weight > bucket_limit
    then
      operation_result := jsonb_build_object(
        'outcome', 'capacity_full', 'operationId', operation_row.id,
        'groupId', target_group_id, 'idempotentReplay', false
      );
      update public.core_write_operations
      set status = 'completed', result_json = operation_result, completed_at = now(), updated_at = now()
      where id = operation_row.id;
      return operation_result;
    end if;
  end if;
  if failure_step = 'placement_capacity' then raise exception 'Injected placement capacity failure'; end if;

  begin
    insert into public.group_memberships (
      tenant_id, group_id, enrollment_id, participant_id, status,
      starts_on, capacity_weight, capacity_bucket, source
    ) values (
      target_tenant_id, target_group_id, target_enrollment_id, target_enrollment.participant_id,
      target_status, coalesce(target_starts_on, current_date), target_capacity_weight,
      target_capacity_bucket, 'manual'
    ) returning id into membership_id;
    if failure_step = 'placement_membership' then raise exception 'Injected placement membership failure'; end if;

    insert into public.swim_audit_events (
      tenant_id, actor_user_id, permission_key, event_type, subject_type,
      subject_id, reason, after_json, correlation_id
    ) values (
      target_tenant_id, target_actor_user_id, 'group.membership.manage',
      'group.membership_placed', 'group_membership', membership_id,
      'Atomic capacity claim',
      jsonb_build_object(
        'groupId', target_group_id, 'enrollmentId', target_enrollment_id,
        'status', target_status, 'capacityBucket', target_capacity_bucket,
        'capacityWeight', target_capacity_weight
      ),
      operation_row.id
    );
    if failure_step = 'placement_audit' then raise exception 'Injected placement audit failure'; end if;

    operation_result := jsonb_build_object(
      'outcome', 'placed', 'operationId', operation_row.id,
      'membershipId', membership_id, 'idempotentReplay', false
    );
  exception
    when unique_violation then
      operation_result := jsonb_build_object(
        'outcome', 'conflict', 'operationId', operation_row.id,
        'idempotentReplay', false
      );
    when others then
      update public.core_write_operations
      set status = 'failed', error_code = 'placement_write_failed', result_json = null, updated_at = now()
      where id = operation_row.id;
      return jsonb_build_object('outcome', 'write_failed', 'operationId', operation_row.id);
  end;

  update public.core_write_operations
  set status = 'completed', result_json = operation_result, error_code = null,
      completed_at = now(), updated_at = now()
  where id = operation_row.id;
  return operation_result;
end;
$$;

revoke all on function public.create_participant_graph_atomic(uuid, uuid, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_intake_submission_atomic(uuid, text, text, text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.place_group_membership_atomic(uuid, uuid, text, text, uuid, uuid, text, text, numeric, date)
  from public, anon, authenticated;

grant execute on function public.create_participant_graph_atomic(uuid, uuid, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.create_intake_submission_atomic(uuid, text, text, text, jsonb, jsonb)
  to service_role;
grant execute on function public.place_group_membership_atomic(uuid, uuid, text, text, uuid, uuid, text, text, numeric, date)
  to service_role;
