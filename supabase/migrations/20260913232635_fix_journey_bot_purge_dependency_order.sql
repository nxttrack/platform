-- Keep ordinary lifecycle rows and all UPDATEs append-only. The narrow DELETE
-- exception is for service-role retention of proven test rows in a prepared
-- staging purge, after its synthetic Auth identities have been removed.
create or replace function app_private.prevent_swim_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('role', true) = 'service_role'
    and old.is_test
    and old.journey_run_id is not null
    and current_setting('nxttrack.journey_bot_purge_run_id', true) = old.journey_run_id::text
    and exists (
      select 1
      from public.journey_bot_runs run
      join public.journey_bot_purge_receipts receipt
        on receipt.run_id = run.id
       and receipt.tenant_id = run.tenant_id
       and receipt.config_id = run.config_id
      where run.id = old.journey_run_id
        and run.tenant_id = old.tenant_id
        and run.environment = 'staging'
        and run.status <> 'running'
        and receipt.environment = 'staging'
        and receipt.status = 'pending'
        and not exists (
          select 1 from auth.users auth_user
          where auth_user.id = any(receipt.pending_auth_user_ids)
        )
    )
  then
    return old;
  end if;
  raise exception 'Swim lifecycle events are append-only';
end;
$$;

-- Preserve the existing purge guards, signature, ownership and grants.
-- Delete dependent Journey Bot telemetry before deleting enrollment/intake/
-- participant rows, while retaining counters in the durable purge receipt.
CREATE OR REPLACE FUNCTION app_private.purge_journey_bot_run(target_run_id uuid, actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  target_run public.journey_bot_runs%rowtype;
  deleted_count integer;
  deleted_counts jsonb := '{}'::jsonb;
  remaining_count bigint;
  marked_table record;
  purge_receipt public.journey_bot_purge_receipts%rowtype;
  previous_purge_scope text;
begin
  select *
  into target_run
  from public.journey_bot_runs
  where id = target_run_id
  for update;

  if target_run.id is null then
    raise exception using errcode = 'P0002', message = 'Journey Bot run does not exist or was already purged.';
  end if;
  if target_run.environment <> 'staging' then
    raise exception using errcode = '23514', message = 'Only staging Journey Bot runs can be purged.';
  end if;
  if target_run.status = 'running' then
    raise exception using errcode = '55000', message = 'Stop the active Journey Bot run before purging it.';
  end if;

  select *
  into purge_receipt
  from public.journey_bot_purge_receipts
  where run_id = target_run_id
  for update;

  if purge_receipt.id is null or purge_receipt.status <> 'pending' then
    raise exception using
      errcode = '55000',
      message = 'A pending Journey Bot purge receipt is required before product data can be removed.';
  end if;
  if exists (
    select 1
    from auth.users
    where id = any(purge_receipt.pending_auth_user_ids)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Journey Bot purge refused partial completion: one or more synthetic Auth users still exist.';
  end if;

  -- Only this validated, pending staging purge may remove its synthetic lifecycle
  -- events. Reset the transaction-local scope before other product deletions.
  previous_purge_scope := current_setting('nxttrack.journey_bot_purge_run_id', true);
  perform set_config('nxttrack.journey_bot_purge_run_id', target_run_id::text, true);
  delete from public.swim_lifecycle_events event
  where event.tenant_id = target_run.tenant_id
    and event.journey_run_id = target_run_id
    and event.is_test;
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('swim_lifecycle_events', deleted_count);
  perform set_config('nxttrack.journey_bot_purge_run_id', coalesce(previous_purge_scope, ''), true);

  -- Remove this run's telemetry before its referenced product rows. The composite
  -- telemetry foreign keys would otherwise SET NULL on the required tenant_id.
  -- These deletes and their counts remain in the same transaction: any later
  -- ownership/residual-row refusal rolls them back with the product deletions.
  select count(*) into deleted_count
  from public.journey_bot_child_events event
  join public.journey_bot_child_journeys journey on journey.id = event.child_journey_id
  where journey.run_id = target_run_id;
  deleted_counts := deleted_counts || jsonb_build_object('journey_bot_child_events', deleted_count);

  select count(*) into deleted_count
  from public.journey_bot_issues
  where run_id = target_run_id
     or child_journey_id in (
       select id from public.journey_bot_child_journeys where run_id = target_run_id
     );
  deleted_counts := deleted_counts || jsonb_build_object('journey_bot_issues', deleted_count);

  delete from public.journey_bot_child_journeys where run_id = target_run_id;
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('journey_bot_child_journeys', deleted_count);

  delete from public.certificate_records
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('certificate_records', deleted_count);

  delete from public.graduation_event_participants
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('graduation_event_participants', deleted_count);

  delete from public.graduation_events
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('graduation_events', deleted_count);

  delete from public.graduation_readiness
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('graduation_readiness', deleted_count);

  delete from public.participant_badge_awards
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('participant_badge_awards', deleted_count);

  delete from public.participant_progress_scores
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('participant_progress_scores', deleted_count);

  delete from public.session_attendance
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('session_attendance', deleted_count);

  delete from public.group_memberships
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('group_memberships', deleted_count);

  delete from public.enrollments
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('enrollments', deleted_count);

  delete from public.sessions
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('sessions', deleted_count);

  delete from public.waitlist_entries
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('waitlist_entries', deleted_count);

  delete from public.intake_submissions
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('intake_submissions', deleted_count);

  delete from public.participants
  where journey_run_id = target_run_id and is_test and source = 'journey_simulation_bot';
  get diagnostics deleted_count = row_count;
  deleted_counts := deleted_counts || jsonb_build_object('participants', deleted_count);

  -- Refuse a partial success if a new or marker-drifted product table still refers to this run.
  for marked_table in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name in ('journey_run_id', 'is_test', 'source')
    group by table_name
    having count(distinct column_name) = 3
  loop
    execute format(
      'select count(*) from public.%I where journey_run_id = $1',
      marked_table.table_name
    )
    into remaining_count
    using target_run_id;

    if remaining_count > 0 then
      raise exception using
        errcode = '23514',
        message = format(
          'Journey Bot purge refused partial completion: %s still contains %s row(s) for run %s.',
          marked_table.table_name,
          remaining_count,
          target_run_id
        );
    end if;
  end loop;


  delete from public.journey_bot_runs where id = target_run_id;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception using errcode = 'P0002', message = 'Journey Bot run disappeared during purge.';
  end if;
  deleted_counts := deleted_counts || jsonb_build_object('journey_bot_runs', deleted_count);

  update public.journey_bot_purge_receipts
  set status = 'completed',
      pending_auth_user_ids = '{}',
      deleted_auth_users = cardinality(purge_receipt.pending_auth_user_ids),
      deleted_counts_json = deleted_counts,
      purged_by = actor_user_id,
      purged_at = now()
  where id = purge_receipt.id;

  return jsonb_build_object(
    'run_id', target_run_id,
    'deleted_auth_users', cardinality(purge_receipt.pending_auth_user_ids),
    'deleted_counts', deleted_counts,
    'purged_at', now()
  );
end
$function$
;
