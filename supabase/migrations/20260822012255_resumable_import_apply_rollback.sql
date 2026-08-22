alter table public.import_jobs
  add column apply_idempotency_key text,
  add column apply_claim_token uuid,
  add column apply_lease_expires_at timestamptz,
  add column apply_attempts integer not null default 0,
  add column apply_error_code text,
  add column reconciliation_state text not null default 'clean',
  add column rollback_state text not null default 'not_requested',
  add column rollback_claim_token uuid,
  add column rollback_lease_expires_at timestamptz,
  add column rollback_attempts integer not null default 0,
  add column rollback_error_code text,
  add constraint import_jobs_apply_key_check
    check (apply_idempotency_key is null or apply_idempotency_key ~ '^[a-f0-9]{64}$'),
  add constraint import_jobs_apply_attempts_check check (apply_attempts between 0 and 100),
  add constraint import_jobs_rollback_attempts_check check (rollback_attempts between 0 and 100),
  add constraint import_jobs_error_code_bounds_check check (
    (apply_error_code is null or length(apply_error_code) <= 100)
    and (rollback_error_code is null or length(rollback_error_code) <= 100)
  ),
  add constraint import_jobs_reconciliation_state_check
    check (reconciliation_state in ('clean', 'needs_attention', 'reconciling')),
  add constraint import_jobs_rollback_state_check
    check (rollback_state in ('not_requested', 'rolling_back', 'completed', 'needs_attention'));

create unique index import_jobs_apply_idempotency_unique
  on public.import_jobs (tenant_id, apply_idempotency_key)
  where apply_idempotency_key is not null;

alter table public.import_rows
  add column apply_attempts integer not null default 0,
  add column applied_at timestamptz,
  add constraint import_rows_apply_attempts_check check (apply_attempts between 0 and 100),
  add constraint import_rows_tenant_job_id_unique unique (tenant_id, import_job_id, id);

alter table public.import_job_events
  add column event_key text;

create unique index import_job_events_key_unique
  on public.import_job_events (import_job_id, event_key)
  where event_key is not null;

alter table public.auth_invitations
  add column import_job_id uuid,
  add column import_row_id uuid,
  add constraint auth_invitations_import_job_fk
    foreign key (tenant_id, import_job_id) references public.import_jobs (tenant_id, id) on delete cascade,
  add constraint auth_invitations_import_row_fk
    foreign key (tenant_id, import_row_id) references public.import_rows (tenant_id, id) on delete cascade,
  add constraint auth_invitations_import_job_row_fk
    foreign key (tenant_id, import_job_id, import_row_id)
    references public.import_rows (tenant_id, import_job_id, id) on delete cascade,
  add constraint auth_invitations_import_pair_check
    check ((import_job_id is null) = (import_row_id is null));

create unique index auth_invitations_import_row_unique
  on public.auth_invitations (tenant_id, import_job_id, import_row_id)
  where import_job_id is not null and import_row_id is not null;

create table public.import_manifest_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  import_job_id uuid not null,
  import_row_id uuid not null,
  record_type text not null,
  target_table text not null,
  target_id uuid not null,
  created_by_import boolean not null default true,
  apply_attempt integer not null,
  compensation_status text not null default 'pending',
  compensation_attempts integer not null default 0,
  compensation_error_code text,
  applied_at timestamptz not null default now(),
  compensated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_manifest_job_fk foreign key (tenant_id, import_job_id)
    references public.import_jobs (tenant_id, id) on delete cascade,
  constraint import_manifest_row_fk foreign key (tenant_id, import_row_id)
    references public.import_rows (tenant_id, id) on delete cascade,
  constraint import_manifest_job_row_fk foreign key (tenant_id, import_job_id, import_row_id)
    references public.import_rows (tenant_id, import_job_id, id) on delete cascade,
  constraint import_manifest_record_type_check
    check (record_type in ('participants', 'guardians', 'groups', 'enrollments', 'payments')),
  constraint import_manifest_target_table_check check (
    target_table in (
      'participants', 'auth_invitations', 'tenant_memberships', 'email_outbox',
      'groups', 'enrollments', 'manual_payments'
    )
  ),
  constraint import_manifest_apply_attempt_check check (apply_attempt between 1 and 100),
  constraint import_manifest_compensation_status_check
    check (compensation_status in ('pending', 'compensated', 'failed')),
  constraint import_manifest_compensation_attempts_check check (compensation_attempts between 0 and 100),
  constraint import_manifest_compensation_error_check
    check (compensation_error_code is null or length(compensation_error_code) <= 100),
  constraint import_manifest_row_target_unique unique (tenant_id, import_job_id, import_row_id, target_table)
);

comment on table public.import_manifest_entries is
  'Durable create-only import manifest. Entries remain after compensation as reconciliation evidence.';

create index import_manifest_job_compensation_idx
  on public.import_manifest_entries (tenant_id, import_job_id, compensation_status, created_at desc);

create trigger import_manifest_entries_set_updated_at
  before update on public.import_manifest_entries
  for each row execute function app_private.set_updated_at();

alter table public.import_manifest_entries enable row level security;
alter table public.import_manifest_entries force row level security;

create policy "Tenant admins view import manifest"
  on public.import_manifest_entries for select to authenticated
  using (app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin']));

grant select on public.import_manifest_entries to authenticated;
grant all on public.import_manifest_entries to service_role;

create function public.update_import_validation_chunk(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_updates jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  row_id uuid;
  updated_count integer := 0;
begin
  if jsonb_typeof(target_updates) <> 'array'
    or jsonb_array_length(target_updates) < 1
    or jsonb_array_length(target_updates) > 250
  then
    raise exception 'Validation chunk must contain between 1 and 250 rows';
  end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then
    raise exception 'Tenant administrator required';
  end if;
  if not exists (
    select 1 from public.import_jobs job
    where job.tenant_id = target_tenant_id and job.id = target_job_id
      and job.status in ('mapping', 'validated', 'ready')
  ) then
    raise exception 'Import job is not available for validation';
  end if;

  for item in select value from jsonb_array_elements(target_updates)
  loop
    row_id := (item ->> 'rowId')::uuid;
    if item ->> 'status' not in ('valid', 'invalid', 'duplicate')
      or jsonb_typeof(item -> 'normalizedData') <> 'object'
      or jsonb_typeof(item -> 'errors') <> 'array'
    then
      raise exception 'Invalid import validation row';
    end if;
    update public.import_rows
    set normalized_data = item -> 'normalizedData',
        validation_status = item ->> 'status',
        validation_errors = item -> 'errors',
        duplicate_key = nullif(item ->> 'duplicateKey', '')
    where tenant_id = target_tenant_id and import_job_id = target_job_id and id = row_id;
    if not found then raise exception 'Import validation row is outside job scope'; end if;
    updated_count := updated_count + 1;
  end loop;
  return updated_count;
end;
$$;

create function public.complete_import_validation(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_report jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  valid_rows integer;
  invalid_rows integer;
  duplicate_rows integer;
  total_rows integer;
begin
  if jsonb_typeof(target_report) <> 'object' then raise exception 'Invalid validation report'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select
    count(*) filter (where validation_status = 'valid')::integer,
    count(*) filter (where validation_status = 'invalid')::integer,
    count(*) filter (where validation_status = 'duplicate')::integer,
    count(*)::integer
  into valid_rows, invalid_rows, duplicate_rows, total_rows
  from public.import_rows
  where tenant_id = target_tenant_id and import_job_id = target_job_id;

  update public.import_jobs
  set status = 'validated', valid_count = valid_rows, invalid_count = invalid_rows,
      duplicate_count = duplicate_rows, validation_report = target_report
  where tenant_id = target_tenant_id and id = target_job_id
    and status in ('mapping', 'validated', 'ready');
  if not found then raise exception 'Import job is not available for validation completion'; end if;

  insert into public.import_job_events (
    tenant_id, import_job_id, event_type, actor_user_id, details, event_key
  ) values (
    target_tenant_id, target_job_id, 'validated', target_actor_user_id,
    jsonb_build_object('valid', valid_rows, 'invalid', invalid_rows, 'duplicates', duplicate_rows, 'total', total_rows),
    'validation:' || md5(target_report::text)
  ) on conflict (import_job_id, event_key) where event_key is not null do nothing;

  return jsonb_build_object('valid', valid_rows, 'invalid', invalid_rows, 'duplicates', duplicate_rows, 'total', total_rows);
end;
$$;

create function public.claim_import_apply(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_idempotency_key text,
  target_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  claim_token uuid;
begin
  if target_idempotency_key !~ '^[a-f0-9]{64}$' or target_lease_seconds not between 30 and 900 then
    raise exception 'Invalid import apply claim';
  end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id
  for update;
  if job.id is null then raise exception 'Import job not found'; end if;
  if job.apply_idempotency_key is not null and job.apply_idempotency_key <> target_idempotency_key then
    raise exception 'Import apply key was reused with different input';
  end if;
  if job.status = 'completed' then
    return jsonb_build_object('outcome', 'completed', 'idempotentReplay', true);
  end if;
  if job.rollback_state <> 'not_requested' then raise exception 'Import rollback has already started'; end if;
  if job.status = 'applying' and job.apply_lease_expires_at > now() then
    return jsonb_build_object('outcome', 'busy', 'idempotentReplay', true);
  end if;
  if job.status not in ('ready', 'failed', 'applying') then raise exception 'Import job is not ready to apply'; end if;
  if job.apply_attempts >= 100 then raise exception 'Import apply attempts exhausted'; end if;

  claim_token := gen_random_uuid();
  update public.import_jobs
  set status = 'applying', apply_idempotency_key = target_idempotency_key,
      apply_claim_token = claim_token,
      apply_lease_expires_at = now() + make_interval(secs => target_lease_seconds),
      apply_attempts = apply_attempts + 1, applied_by_user_id = target_actor_user_id,
      apply_error_code = null, reconciliation_state = case when reconciliation_state = 'needs_attention' then 'reconciling' else reconciliation_state end
  where id = target_job_id;

  return jsonb_build_object('outcome', 'claimed', 'claimToken', claim_token, 'attempt', job.apply_attempts + 1, 'idempotentReplay', job.apply_attempts > 0);
end;
$$;

create function public.apply_import_chunk(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid,
  target_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
          where stage.tenant_id = target_tenant_id and stage.program_id = program_id and stage.code = data ->> 'stage_code';
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
          where stage.tenant_id = target_tenant_id and stage.program_id = program_id and stage.code = data ->> 'stage_code';
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
        where subscription.tenant_id = target_tenant_id and subscription.participant_id = participant_id and subscription.status = 'active'
        order by subscription.created_at, subscription.id limit 1;
        select enrollment.id into enrollment_id from public.enrollments enrollment
        where enrollment.tenant_id = target_tenant_id and enrollment.participant_id = participant_id and enrollment.status = 'active'
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
$$;

create function public.materialize_import_guardian_invitation(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_invitation_id uuid,
  target_user_id uuid,
  target_is_new_account boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  invitation public.auth_invitations%rowtype;
  existing_membership_id uuid;
  membership_id uuid;
  already_materialized boolean := false;
begin
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;

  select * into invitation from public.auth_invitations candidate
  where candidate.id = target_invitation_id and candidate.tenant_id = target_tenant_id
    and candidate.import_job_id = target_job_id
  for update;
  if invitation.id is null or invitation.status <> 'pending' then raise exception 'Import invitation is not pending'; end if;
  if not exists (
    select 1 from public.import_jobs job
    where job.id = target_job_id and job.tenant_id = target_tenant_id
      and job.status in ('applying', 'failed', 'completed') and job.rollback_state = 'not_requested'
  ) then raise exception 'Import job is not available for identity materialization'; end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> target_user_id then raise exception 'Import invitation is bound to another Auth user'; end if;
    already_materialized := true;
  end if;

  if not already_materialized then
    insert into public.profiles (id, email, full_name)
    values (target_user_id, lower(invitation.email), invitation.invitee_name)
    on conflict (id) do update set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name);
    insert into public.user_security (user_id, email, must_change_password, last_invited_at)
    values (target_user_id, lower(invitation.email), target_is_new_account, now())
    on conflict (user_id) do update set email = excluded.email,
      must_change_password = public.user_security.must_change_password or excluded.must_change_password,
      last_invited_at = excluded.last_invited_at;

    select membership.id into existing_membership_id from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_user_id and membership.role = 'parent';
    insert into public.tenant_memberships (
      tenant_id, user_id, role, status, invited_email, invitation_id, invitation_expires_at
    ) values (
      target_tenant_id, target_user_id, 'parent', 'invited', lower(invitation.email), invitation.id, invitation.expires_at
    ) on conflict (tenant_id, user_id, role) do update
    set status = case when public.tenant_memberships.status = 'active' then 'active' else 'invited' end,
        invited_email = excluded.invited_email,
        invitation_id = case when public.tenant_memberships.status = 'active' then public.tenant_memberships.invitation_id else excluded.invitation_id end,
        invitation_expires_at = case when public.tenant_memberships.status = 'active' then public.tenant_memberships.invitation_expires_at else excluded.invitation_expires_at end
    returning id into membership_id;

    update public.auth_invitations
    set invited_user_id = target_user_id, requires_password_setup = target_is_new_account,
        identity_status = 'ready', identity_error_code = null
    where id = invitation.id;

    insert into public.import_manifest_entries (
      tenant_id, import_job_id, import_row_id, record_type, target_table, target_id,
      created_by_import, apply_attempt, compensation_status, compensated_at
    )
    select target_tenant_id, target_job_id, invitation.import_row_id, 'guardians',
      'tenant_memberships', membership_id, existing_membership_id is null, greatest(job.apply_attempts, 1),
      case when existing_membership_id is null then 'pending' else 'compensated' end,
      case when existing_membership_id is null then null else now() end
    from public.import_jobs job where job.id = target_job_id
    on conflict (tenant_id, import_job_id, import_row_id, target_table) do nothing;
  end if;

  return jsonb_build_object('outcome', 'ready', 'invitationId', invitation.id,
    'membershipId', membership_id, 'alreadyMaterialized', already_materialized);
end;
$$;

create function public.mark_import_reconciliation_attention(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_invitation_id uuid,
  target_error_code text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if length(target_error_code) not between 1 and 100 then raise exception 'Invalid import reconciliation error'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  update public.auth_invitations set identity_status = 'attention_required', identity_error_code = target_error_code
  where id = target_invitation_id and tenant_id = target_tenant_id and import_job_id = target_job_id;
  if not found then raise exception 'Import invitation not found'; end if;
  update public.import_jobs set status = 'failed', reconciliation_state = 'needs_attention',
    apply_error_code = target_error_code, apply_claim_token = null, apply_lease_expires_at = null
  where id = target_job_id and tenant_id = target_tenant_id;
  insert into public.import_job_events (
    tenant_id, import_job_id, event_type, actor_user_id, details, event_key
  ) values (
    target_tenant_id, target_job_id, 'failed', target_actor_user_id,
    jsonb_build_object('errorCode', target_error_code, 'invitationId', target_invitation_id),
    'identity-failed:' || target_invitation_id::text
  ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
end;
$$;

create function public.complete_import_apply(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  manifest_count integer;
begin
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.status = 'completed' then return jsonb_build_object('outcome', 'completed', 'idempotentReplay', true); end if;
  if job.status <> 'applying' or job.apply_claim_token <> target_claim_token then raise exception 'Import apply claim is invalid'; end if;
  if exists (
    select 1 from public.import_rows row_record
    where row_record.tenant_id = target_tenant_id and row_record.import_job_id = target_job_id
      and row_record.validation_status = 'valid'
  ) then raise exception 'Import still has unapplied valid rows'; end if;
  if exists (
    select 1 from public.auth_invitations invitation
    where invitation.tenant_id = target_tenant_id and invitation.import_job_id = target_job_id
      and (
        invitation.identity_status <> 'ready' or invitation.invited_user_id is null
        or invitation.status <> 'pending' or invitation.expires_at <= now()
        or not exists (
          select 1 from public.email_outbox outbox
          where outbox.tenant_id = target_tenant_id
            and outbox.payload_reference_type = 'auth_invitation'
            and outbox.payload_reference_id = invitation.id
            and outbox.status in ('queued', 'retry')
        )
      )
  ) then
    update public.import_jobs
    set status = 'failed', reconciliation_state = 'needs_attention',
        apply_error_code = 'guardian_invitation_incomplete', apply_claim_token = null,
        apply_lease_expires_at = null
    where id = target_job_id;
    insert into public.import_job_events (
      tenant_id, import_job_id, event_type, actor_user_id, details, event_key
    ) values (
      target_tenant_id, target_job_id, 'failed', target_actor_user_id,
      jsonb_build_object('errorCode', 'guardian_invitation_incomplete'),
      'apply-incomplete:v1'
    ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'guardian_invitation_incomplete');
  end if;

  select count(*)::integer into manifest_count from public.import_manifest_entries manifest
  where manifest.tenant_id = target_tenant_id and manifest.import_job_id = target_job_id;
  update public.email_outbox outbox
  set next_attempt_at = now()
  from public.auth_invitations invitation
  where invitation.import_job_id = target_job_id and invitation.tenant_id = target_tenant_id
    and invitation.id = outbox.payload_reference_id
    and outbox.payload_reference_type = 'auth_invitation'
    and outbox.tenant_id = target_tenant_id and outbox.status in ('queued', 'retry');
  update public.import_jobs
  set status = 'completed', reconciliation_state = 'clean', applied_at = now(),
      apply_claim_token = null, apply_lease_expires_at = null, apply_error_code = null,
      rollback_manifest = jsonb_build_array(jsonb_build_object('durableManifestEntries', manifest_count))
  where id = target_job_id;
  insert into public.import_job_events (
    tenant_id, import_job_id, event_type, actor_user_id, details, event_key
  ) values (
    target_tenant_id, target_job_id, 'applied', target_actor_user_id,
    jsonb_build_object('manifestEntries', manifest_count), 'apply-completed:v1'
  ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
  return jsonb_build_object('outcome', 'completed', 'manifestEntries', manifest_count, 'idempotentReplay', false);
end;
$$;

create function public.claim_import_rollback(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_lease_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  claim_token uuid;
begin
  if target_lease_seconds not between 30 and 900 then raise exception 'Invalid rollback lease'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.id is null then raise exception 'Import job not found'; end if;
  if job.status = 'rolled_back' and job.rollback_state = 'completed' then
    return jsonb_build_object('outcome', 'completed', 'idempotentReplay', true);
  end if;
  if job.rollback_state = 'rolling_back' and job.rollback_lease_expires_at > now() then
    return jsonb_build_object('outcome', 'busy', 'idempotentReplay', true);
  end if;
  if job.status not in ('completed', 'failed') or job.rollback_state not in ('not_requested', 'rolling_back', 'needs_attention') then
    raise exception 'Import job cannot be rolled back';
  end if;
  if not exists (
    select 1 from public.import_manifest_entries manifest
    where manifest.tenant_id = target_tenant_id and manifest.import_job_id = target_job_id
  ) then raise exception 'Import job has no durable manifest'; end if;
  if job.rollback_attempts >= 100 then raise exception 'Import rollback attempts exhausted'; end if;
  claim_token := gen_random_uuid();
  update public.import_jobs
  set rollback_state = 'rolling_back', reconciliation_state = 'reconciling',
      rollback_claim_token = claim_token,
      rollback_lease_expires_at = now() + make_interval(secs => target_lease_seconds),
      rollback_attempts = rollback_attempts + 1, rollback_error_code = null,
      rolled_back_by_user_id = target_actor_user_id
  where id = target_job_id;
  return jsonb_build_object('outcome', 'claimed', 'claimToken', claim_token,
    'attempt', job.rollback_attempts + 1, 'idempotentReplay', job.rollback_attempts > 0);
end;
$$;

create function public.rollback_import_chunk(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid,
  target_limit integer default 250
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  manifest public.import_manifest_entries%rowtype;
  current_manifest_id uuid;
  current_target_status text;
  compensated_count integer := 0;
  remaining_count integer;
  failure_marker text := current_setting('nxttrack.test_import_rollback_failure', true);
begin
  if target_limit not between 1 and 250 then raise exception 'Invalid rollback chunk size'; end if;
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.id is null or job.rollback_state <> 'rolling_back' or job.rollback_claim_token <> target_claim_token
    or job.rollback_lease_expires_at <= now()
  then raise exception 'Import rollback claim is invalid or expired'; end if;

  begin
    for manifest in
      select candidate.* from public.import_manifest_entries candidate
      where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
        and candidate.created_by_import and candidate.compensation_status in ('pending', 'failed')
      order by case candidate.target_table
        when 'manual_payments' then 1 when 'enrollments' then 2 when 'groups' then 3
        when 'participants' then 4 when 'tenant_memberships' then 5
        when 'email_outbox' then 6 when 'auth_invitations' then 7 else 99 end,
        candidate.applied_at desc, candidate.id
      limit target_limit
      for update
    loop
      current_manifest_id := manifest.id;
      if failure_marker = manifest.target_table then raise exception 'Injected rollback failure'; end if;
      if manifest.target_table = 'manual_payments' then
        delete from public.manual_payments where tenant_id = target_tenant_id and id = manifest.target_id;
      elsif manifest.target_table = 'enrollments' then
        delete from public.enrollments where tenant_id = target_tenant_id and id = manifest.target_id;
      elsif manifest.target_table = 'groups' then
        delete from public.groups where tenant_id = target_tenant_id and id = manifest.target_id;
      elsif manifest.target_table = 'participants' then
        delete from public.participants where tenant_id = target_tenant_id and id = manifest.target_id;
      elsif manifest.target_table = 'tenant_memberships' then
        select membership.status into current_target_status
        from public.tenant_memberships membership
        where membership.tenant_id = target_tenant_id and membership.id = manifest.target_id
        for update;
        if current_target_status = 'active' then
          raise exception 'Accepted import membership cannot be automatically removed';
        end if;
        delete from public.tenant_memberships where tenant_id = target_tenant_id and id = manifest.target_id;
      elsif manifest.target_table = 'email_outbox' then
        current_target_status := null;
        select outbox.status into current_target_status from public.email_outbox outbox
        where outbox.id = manifest.target_id for update;
        if current_target_status in ('processing', 'accepted') then
          raise exception 'Import invitation mail can no longer be safely cancelled';
        end if;
        update public.email_outbox
        set status = 'cancelled', claim_token = null, claimed_at = null, lease_expires_at = null
        where id = manifest.target_id and status in ('queued', 'retry');
        if found then
          insert into public.email_outbox_events (outbox_id, tenant_id, event_type, attempt_number, details)
          select outbox.id, outbox.tenant_id, 'cancelled', outbox.attempts, jsonb_build_object('reason', 'import_rollback')
          from public.email_outbox outbox where outbox.id = manifest.target_id;
        end if;
      elsif manifest.target_table = 'auth_invitations' then
        current_target_status := null;
        select invitation.status into current_target_status from public.auth_invitations invitation
        where invitation.id = manifest.target_id and invitation.tenant_id = target_tenant_id for update;
        if current_target_status = 'accepted' then
          raise exception 'Accepted import invitation cannot be automatically revoked';
        end if;
        update public.auth_invitations set status = 'revoked', code_hash = null,
          identity_status = case when identity_status = 'ready' then 'ready' else 'attention_required' end,
          identity_error_code = case when identity_status = 'ready' then null else 'import_rolled_back' end
        where id = manifest.target_id and tenant_id = target_tenant_id and status = 'pending';
      else
        raise exception 'Unsupported import compensation target';
      end if;
      update public.import_manifest_entries
      set compensation_status = 'compensated', compensation_attempts = compensation_attempts + 1,
          compensation_error_code = null, compensated_at = now()
      where id = manifest.id;
      compensated_count := compensated_count + 1;
    end loop;
  exception when others then
    update public.import_manifest_entries
    set compensation_status = 'failed', compensation_attempts = compensation_attempts + 1,
        compensation_error_code = 'compensation_failed'
    where id = current_manifest_id;
    update public.import_jobs
    set rollback_state = 'needs_attention', reconciliation_state = 'needs_attention',
        rollback_error_code = 'compensation_failed', rollback_claim_token = null,
        rollback_lease_expires_at = null
    where id = target_job_id;
    insert into public.import_job_events (
      tenant_id, import_job_id, event_type, actor_user_id, details, event_key
    ) values (
      target_tenant_id, target_job_id, 'failed', target_actor_user_id,
      jsonb_build_object('errorCode', 'compensation_failed', 'manifestEntryId', current_manifest_id, 'attempt', job.rollback_attempts),
      'rollback-failed:' || job.rollback_attempts::text || ':' || coalesce(current_manifest_id::text, 'unknown')
    ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
    return jsonb_build_object('outcome', 'needs_attention', 'errorCode', 'compensation_failed', 'manifestEntryId', current_manifest_id);
  end;

  select count(*)::integer into remaining_count from public.import_manifest_entries candidate
  where candidate.tenant_id = target_tenant_id and candidate.import_job_id = target_job_id
    and candidate.created_by_import and candidate.compensation_status in ('pending', 'failed');
  update public.import_jobs set rollback_lease_expires_at = now() + interval '5 minutes' where id = target_job_id;
  return jsonb_build_object('outcome', 'compensated', 'processed', compensated_count,
    'remaining', remaining_count, 'done', remaining_count = 0);
end;
$$;

create function public.complete_import_rollback(
  target_actor_user_id uuid,
  target_tenant_id uuid,
  target_job_id uuid,
  target_claim_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  job public.import_jobs%rowtype;
  manifest_count integer;
begin
  if not exists (
    select 1 from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id and membership.user_id = target_actor_user_id
      and membership.status = 'active' and membership.role in ('tenant_owner', 'tenant_admin')
  ) then raise exception 'Tenant administrator required'; end if;
  select * into job from public.import_jobs candidate
  where candidate.tenant_id = target_tenant_id and candidate.id = target_job_id for update;
  if job.status = 'rolled_back' and job.rollback_state = 'completed' then
    return jsonb_build_object('outcome', 'rolled_back', 'idempotentReplay', true);
  end if;
  if job.rollback_state <> 'rolling_back' or job.rollback_claim_token <> target_claim_token then
    raise exception 'Import rollback claim is invalid';
  end if;
  if exists (
    select 1 from public.import_manifest_entries manifest
    where manifest.tenant_id = target_tenant_id and manifest.import_job_id = target_job_id
      and manifest.created_by_import and manifest.compensation_status <> 'compensated'
  ) then raise exception 'Import manifest still requires compensation'; end if;
  select count(*)::integer into manifest_count from public.import_manifest_entries manifest
  where manifest.tenant_id = target_tenant_id and manifest.import_job_id = target_job_id;
  update public.import_rows set validation_status = 'rolled_back'
  where tenant_id = target_tenant_id and import_job_id = target_job_id and validation_status in ('valid', 'applied');
  update public.import_jobs
  set status = 'rolled_back', rollback_state = 'completed', reconciliation_state = 'clean',
      rollback_claim_token = null, rollback_lease_expires_at = null, rollback_error_code = null,
      rolled_back_at = now()
  where id = target_job_id;
  insert into public.import_job_events (
    tenant_id, import_job_id, event_type, actor_user_id, details, event_key
  ) values (
    target_tenant_id, target_job_id, 'rolled_back', target_actor_user_id,
    jsonb_build_object('manifestEntries', manifest_count), 'rollback-completed:v1'
  ) on conflict (import_job_id, event_key) where event_key is not null do nothing;
  return jsonb_build_object('outcome', 'rolled_back', 'manifestEntries', manifest_count, 'idempotentReplay', false);
end;
$$;

revoke all on function public.update_import_validation_chunk(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_import_validation(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_import_apply(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.apply_import_chunk(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.materialize_import_guardian_invitation(uuid, uuid, uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.mark_import_reconciliation_attention(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_import_apply(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.claim_import_rollback(uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.rollback_import_chunk(uuid, uuid, uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_import_rollback(uuid, uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.update_import_validation_chunk(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.complete_import_validation(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.claim_import_apply(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.apply_import_chunk(uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.materialize_import_guardian_invitation(uuid, uuid, uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.mark_import_reconciliation_attention(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.complete_import_apply(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.claim_import_rollback(uuid, uuid, uuid, integer) to service_role;
grant execute on function public.rollback_import_chunk(uuid, uuid, uuid, uuid, integer) to service_role;
grant execute on function public.complete_import_rollback(uuid, uuid, uuid, uuid) to service_role;
