-- FASE 0.2: forward-only corrections to the existing three SQL flows.
-- Preserve all 147 certified migrations, RPC signatures, grants and schema floor.

CREATE OR REPLACE FUNCTION app_private.execute_due_portal_theme_schedules(target_limit integer DEFAULT 50)
 RETURNS TABLE(schedule_id uuid, assignment_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private', 'pg_temp'
AS $function$
declare
  scheduled public.tenant_portal_theme_schedule%rowtype;
  activated_assignment_id uuid;
begin
  for scheduled in
    select schedule.*
    from public.tenant_portal_theme_schedule as schedule
    where schedule.status = 'scheduled' and schedule.scheduled_for <= now()
    order by schedule.scheduled_for
    for update skip locked
    limit greatest(1, least(target_limit, 200))
  loop
    begin
      activated_assignment_id := app_private.activate_tenant_portal_theme(
        scheduled.tenant_id,
        scheduled.theme_key,
        scheduled.theme_release,
        scheduled.created_by_platform_admin_id,
        scheduled.reason,
        scheduled.ticket_reference,
        scheduled.id::text,
        'activated'
      );
      update public.tenant_portal_theme_schedule
      set status = 'executed', executed_at = now()
      where id = scheduled.id;
      schedule_id := scheduled.id;
      assignment_id := activated_assignment_id;
      status := 'executed';
      return next;
    exception when others then
      update public.tenant_portal_theme_schedule
      set status = 'failed'
      where id = scheduled.id;
      schedule_id := scheduled.id;
      assignment_id := null;
      status := 'failed';
      return next;
    end;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION app_private.execute_due_portal_theme_schedules(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.execute_due_portal_theme_schedules(integer) TO service_role;

CREATE OR REPLACE FUNCTION app_private.undo_season_blackout_v3(target_tenant_id uuid, target_blackout_id uuid, actor_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  changed_count integer := 0;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'holiday.manage') then
    raise exception 'Insufficient holiday management permission';
  end if;
  perform 1 from public.season_blackout_periods
  where tenant_id = target_tenant_id and id = target_blackout_id
  for update;
  if not found then raise exception 'Blackout not found in tenant'; end if;

  -- Release this closure under its row lock before the booking trigger validates
  -- restored sessions. Any later error rolls this status change back as well.
  update public.season_blackout_periods
  set status = 'closed'
  where tenant_id = target_tenant_id
    and id = target_blackout_id
    and status = 'published';

  update public.sessions session
  set status = exception.before_status
  from public.schedule_occurrence_exceptions exception
  where exception.tenant_id = target_tenant_id
    and exception.blackout_id = target_blackout_id
    and exception.session_id = session.id
    and exception.status = 'applied'
    and session.status = exception.effective_status;
  get diagnostics changed_count = row_count;
  update public.schedule_occurrence_exceptions
  set status = 'reversed', reversed_at = now(), reversed_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'applied';
  update public.season_schedule_change_events
  set status = 'undone', undone_at = now(), undone_by_user_id = undo_season_blackout_v3.actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'applied';
  update public.season_financial_adjustment_proposals
  set status = 'dismissed', reviewed_at = now(), reviewed_by_user_id = actor_user_id
  where tenant_id = target_tenant_id
    and blackout_id = target_blackout_id
    and status = 'proposed';
  return changed_count;
end;
$function$;

REVOKE ALL ON FUNCTION app_private.undo_season_blackout_v3(uuid,uuid,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.undo_season_blackout_v3(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_import_chunk(target_actor_user_id uuid, target_tenant_id uuid, target_job_id uuid, target_claim_token uuid, target_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
<<import_chunk>>
declare
  job public.import_jobs%rowtype;
  import_row public.import_rows%rowtype;
  command jsonb;
  data jsonb;
  record_type text;
  created_target_id uuid;
  invitation_id uuid;
  outbox_id uuid;
  guardian_user_id uuid;
  program_id uuid;
  stage_id uuid;
  resource_id uuid;
  participant_id uuid;
  subscription_id uuid;
  enrollment_id uuid;
  payment_status text;
  capacity_value integer;
  processed_count integer := 0;
  invitations jsonb := '[]'::jsonb;
  failed_row_number integer;
  failure_marker text := current_setting('nxttrack.test_import_failure', true);
begin
  if jsonb_typeof(target_rows) <> 'array'
    or jsonb_array_length(target_rows) < 1
    or jsonb_array_length(target_rows) > 250
  then raise exception 'Apply chunk must contain between 1 and 250 rows'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id
  for update;
  if job.id is null or job.status <> 'applying' or job.apply_claim_token <> target_claim_token
    or job.apply_lease_expires_at <= now()
  then raise exception 'Import apply claim is invalid or expired'; end if;

  begin
    for command in select value from jsonb_array_elements(target_rows)
    loop
      select * into import_row from public.import_rows candidate
      where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
        and candidate.id = (command ->> 'rowId')::uuid
      for update;
      if import_row.id is null then raise exception 'Import row outside claimed job'; end if;
      if import_row.validation_status = 'applied' then continue; end if;
      if import_row.validation_status <> 'valid' then raise exception 'Only valid import rows can be applied'; end if;
      failed_row_number := import_row.row_number;
      data := import_row.normalized_data;
      record_type := data ->> 'record_type';
      if record_type not in ('participants', 'guardians', 'groups', 'enrollments', 'payments') then
        raise exception 'Unsupported import record type';
      end if;

      if record_type = 'guardians' then
        if jsonb_typeof(command -> 'invitation') <> 'object'
          or lower(trim(command #>> '{invitation,email}')) <> lower(trim(data ->> 'email'))
          or command #>> '{invitation,codeHash}' !~ '^[a-f0-9]{64}$'
          or jsonb_typeof(command #> '{invitation,message}') <> 'object'
        then raise exception 'Guardian invitation command is invalid'; end if;
        insert into public.auth_invitations (
          email, tenant_id, role, invited_by_user_id, status, delivery_status,
          expires_at, code_hash, requires_password_setup, invitee_name, identity_status,
          import_job_id, import_row_id
        ) values (
          lower(trim(data ->> 'email')), target_tenant_id, 'parent', target_actor_user_id,
          'pending', 'pending', (command #>> '{invitation,expiresAt}')::timestamptz,
          command #>> '{invitation,codeHash}', false, trim(data ->> 'full_name'), 'pending',
          target_job_id, import_row.id
        ) returning id into invitation_id;

        select public.enqueue_email_outbox(
          target_tenant_id, 'auth.invitation',
          'import:' || target_job_id::text || ':' || import_row.id::text,
          (command #> '{invitation,message}') || jsonb_build_object(
            'recipientUserId', null, 'relatedId', invitation_id,
            'relatedType', 'auth_invitation', 'tenantId', target_tenant_id,
            'to', lower(trim(data ->> 'email'))
          ),
          'auth_invitation', invitation_id, 5
        ) into outbox_id;
        update public.email_outbox set next_attempt_at = now() + interval '100 years' where id = outbox_id;

        insert into public.import_manifest_entries (
          tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
        ) values
          (target_tenant_id, target_job_id, import_row.id, record_type, 'auth_invitations', invitation_id, job.apply_attempts),
          (target_tenant_id, target_job_id, import_row.id, record_type, 'email_outbox', outbox_id, job.apply_attempts);
        created_target_id := invitation_id;
        invitations := invitations || jsonb_build_array(jsonb_build_object(
          'invitationId', invitation_id, 'email', lower(trim(data ->> 'email')),
          'fullName', trim(data ->> 'full_name'), 'rowId', import_row.id
        ));
      elsif record_type = 'participants' then
        guardian_user_id := null;
        if nullif(trim(data ->> 'guardian_email'), '') is not null then
          select profile.id into guardian_user_id
          from public.profiles profile
          join public.tenant_memberships membership
            on membership.user_id = profile.id and membership.tenant_id = target_tenant_id
           and membership.role = 'parent' and membership.status in ('invited', 'active')
          where lower(profile.email) = lower(trim(data ->> 'guardian_email'))
          order by membership.created_at, membership.id limit 1;
          if guardian_user_id is null then raise exception 'Participant guardian identity is not ready'; end if;
        end if;
        insert into public.participants (
          tenant_id, guardian_user_id, display_name, birth_date, external_reference, status, source
        ) values (
          target_tenant_id, guardian_user_id, trim(data ->> 'display_name'),
          nullif(data ->> 'birth_date', '')::date, nullif(trim(data ->> 'external_reference'), ''),
          'active', 'import'
        ) returning id into created_target_id;
        if guardian_user_id is not null then
          insert into public.participant_guardians (
            tenant_id, participant_id, guardian_user_id, relationship, access_level, status
          ) values (target_tenant_id, created_target_id, guardian_user_id, 'parent', 'primary', 'active');
        end if;
        insert into public.import_manifest_entries (
          tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
        ) values (target_tenant_id, target_job_id, import_row.id, record_type, 'participants', created_target_id, job.apply_attempts);
      elsif record_type = 'groups' then
        select program.id into program_id from public.programs program
        where program.tenant_id = target_tenant_id and program.code = data ->> 'program_code' and program.status = 'active';
        if program_id is null then raise exception 'Import group program not found'; end if;
        stage_id := null;
        if nullif(trim(data ->> 'stage_code'), '') is not null then
          select stage.id into stage_id from public.program_stages stage
          where stage.tenant_id = target_tenant_id and stage.program_id = import_chunk.program_id and stage.code = data ->> 'stage_code';
          if stage_id is null then raise exception 'Import group stage not found'; end if;
        end if;
        resource_id := null;
        if nullif(trim(data ->> 'resource_code'), '') is not null then
          select resource.id into resource_id from public.resources resource
          where resource.tenant_id = target_tenant_id and resource.code = data ->> 'resource_code';
          if resource_id is null then raise exception 'Import group resource not found'; end if;
        end if;
        capacity_value := greatest(coalesce(nullif(data ->> 'capacity', '')::integer, 10), 0);
        insert into public.groups (
          tenant_id, program_id, stage_id, default_resource_id, name, code, status,
          capacity, regular_capacity, flex_capacity, trial_capacity, hard_capacity,
          capacity_borrowing, default_weekday, default_start_time, default_end_time
        ) values (
          target_tenant_id, program_id, stage_id, resource_id, trim(data ->> 'name'), trim(data ->> 'code'), 'active',
          capacity_value, capacity_value, 0, 0, capacity_value, 'none',
          coalesce(nullif(data ->> 'weekday', '')::integer, 1),
          nullif(data ->> 'start_time', '')::time, nullif(data ->> 'end_time', '')::time
        ) returning id into created_target_id;
        insert into public.import_manifest_entries (
          tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
        ) values (target_tenant_id, target_job_id, import_row.id, record_type, 'groups', created_target_id, job.apply_attempts);
      elsif record_type = 'enrollments' then
        select participant.id into participant_id from public.participants participant
        where participant.tenant_id = target_tenant_id and (
          participant.external_reference = data ->> 'participant_reference'
          or lower(trim(participant.display_name)) = lower(trim(data ->> 'participant_reference'))
        ) order by participant.created_at, participant.id limit 1;
        select program.id into program_id from public.programs program
        where program.tenant_id = target_tenant_id and program.code = data ->> 'program_code' and program.status = 'active';
        if participant_id is null or program_id is null then raise exception 'Import enrollment reference not found'; end if;
        stage_id := null;
        if nullif(trim(data ->> 'stage_code'), '') is not null then
          select stage.id into stage_id from public.program_stages stage
          where stage.tenant_id = target_tenant_id and stage.program_id = import_chunk.program_id and stage.code = data ->> 'stage_code';
          if stage_id is null then raise exception 'Import enrollment stage not found'; end if;
        end if;
        select participant.guardian_user_id into guardian_user_id from public.participants participant where participant.id = participant_id;
        insert into public.enrollments (
          tenant_id, participant_id, guardian_user_id, program_id, current_stage_id, status, source, starts_on
        ) values (
          target_tenant_id, participant_id, guardian_user_id, program_id, stage_id, 'active', 'import',
          coalesce(nullif(data ->> 'starts_on', '')::date, current_date)
        ) returning id into created_target_id;
        insert into public.import_manifest_entries (
          tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
        ) values (target_tenant_id, target_job_id, import_row.id, record_type, 'enrollments', created_target_id, job.apply_attempts);
      else
        select participant.id into participant_id from public.participants participant
        where participant.tenant_id = target_tenant_id and (
          participant.external_reference = data ->> 'participant_reference'
          or lower(trim(participant.display_name)) = lower(trim(data ->> 'participant_reference'))
        ) order by participant.created_at, participant.id limit 1;
        select subscription.id into subscription_id from public.subscriptions subscription
        where subscription.tenant_id = target_tenant_id and subscription.participant_id = import_chunk.participant_id and subscription.status = 'active'
        order by subscription.created_at, subscription.id limit 1;
        select enrollment.id into enrollment_id from public.enrollments enrollment
        where enrollment.tenant_id = target_tenant_id and enrollment.participant_id = import_chunk.participant_id and enrollment.status = 'active'
        order by enrollment.created_at, enrollment.id limit 1;
        if participant_id is null or subscription_id is null or enrollment_id is null then raise exception 'Import payment reference not found'; end if;
        select participant.guardian_user_id into guardian_user_id from public.participants participant where participant.id = participant_id;
        payment_status := case when data ->> 'status' in ('due', 'overdue', 'paid', 'waived', 'cancelled') then data ->> 'status' else 'due' end;
        insert into public.manual_payments (
          tenant_id, subscription_id, participant_id, enrollment_id, guardian_user_id,
          amount_cents, currency, due_on, paid_on, status, method, recorded_by_user_id
        ) values (
          target_tenant_id, subscription_id, participant_id, enrollment_id, guardian_user_id,
          round(replace(data ->> 'amount_eur', ',', '.')::numeric * 100)::integer,
          'EUR', (data ->> 'due_on')::date,
          case when payment_status = 'paid' then current_date else null end,
          payment_status, 'import', target_actor_user_id
        ) returning id into created_target_id;
        insert into public.import_manifest_entries (
          tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
        ) values (target_tenant_id, target_job_id, import_row.id, record_type, 'manual_payments', created_target_id, job.apply_attempts);
      end if;

      if failure_marker = 'row:' || import_row.row_number::text then raise exception 'Injected import row failure'; end if;
      update public.import_rows
      set validation_status = 'applied', target_table = case record_type
            when 'guardians' then 'auth_invitations' when 'payments' then 'manual_payments' else record_type end,
          target_id = created_target_id, apply_attempts = apply_attempts + 1, applied_at = now()
      where id = import_row.id;
      processed_count := processed_count + 1;
    end loop;
  exception when others then
    update public.import_jobs
    set status = 'failed', reconciliation_state = 'needs_attention',
        apply_error_code = 'chunk_write_failed', apply_claim_token = null, apply_lease_expires_at = null
    where id = target_job_id;
    insert into public.import_job_events (
      tenant_id, import_job_id, event_type, actor_user_id, details, event_key
    ) values (
      target_tenant_id, target_job_id, 'failed', target_actor_user_id,
      jsonb_build_object('errorCode', 'chunk_write_failed', 'rowNumber', failed_row_number, 'attempt', job.apply_attempts),
      'apply-failed:' || job.apply_attempts::text || ':' || coalesce(failed_row_number::text, 'unknown')
    ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'chunk_write_failed', 'rowNumber', failed_row_number);
  end;

  update public.import_jobs
  set apply_lease_expires_at = now() + interval '5 minutes' where id = target_job_id;
  return jsonb_build_object('outcome', 'applied', 'processed', processed_count, 'invitations', invitations);
end;
$function$;

REVOKE ALL ON FUNCTION public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb) TO service_role;
