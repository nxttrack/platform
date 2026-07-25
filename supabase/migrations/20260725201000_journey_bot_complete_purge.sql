-- Transactional purge for all product and telemetry records created by one staging Journey Bot run.

create table public.journey_bot_purge_receipts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  config_id uuid not null,
  tenant_id uuid not null,
  environment text not null default 'staging',
  status text not null default 'pending',
  pending_auth_user_ids uuid[] not null default '{}',
  deleted_auth_users integer not null default 0,
  deleted_counts_json jsonb not null default '{}'::jsonb,
  purged_by uuid references auth.users (id) on delete set null,
  purge_started_at timestamptz not null default now(),
  purged_at timestamptz,
  constraint journey_bot_purge_receipts_environment_check check (environment = 'staging'),
  constraint journey_bot_purge_receipts_status_check check (status in ('pending', 'completed')),
  constraint journey_bot_purge_receipts_auth_count_check check (deleted_auth_users >= 0),
  constraint journey_bot_purge_receipts_completion_check check (
    (status = 'pending' and purged_at is null)
    or (status = 'completed' and purged_at is not null and cardinality(pending_auth_user_ids) = 0)
  )
);

alter table public.journey_bot_purge_receipts enable row level security;
alter table public.journey_bot_purge_receipts force row level security;

grant select on public.journey_bot_purge_receipts to authenticated;
grant all on public.journey_bot_purge_receipts to service_role;

create policy journey_bot_purge_receipts_platform_select
  on public.journey_bot_purge_receipts
  for select
  to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));

create or replace function app_private.purge_journey_bot_run(
  target_run_id uuid,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_run public.journey_bot_runs%rowtype;
  deleted_count integer;
  deleted_counts jsonb := '{}'::jsonb;
  remaining_count bigint;
  marked_table record;
  purge_receipt public.journey_bot_purge_receipts%rowtype;
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
$$;

revoke all on function app_private.purge_journey_bot_run(uuid, uuid) from public;
revoke all on function app_private.purge_journey_bot_run(uuid, uuid) from anon;
revoke all on function app_private.purge_journey_bot_run(uuid, uuid) from authenticated;
grant execute on function app_private.purge_journey_bot_run(uuid, uuid) to service_role;

comment on function app_private.purge_journey_bot_run(uuid, uuid) is
  'Fail-closed, transactional removal of all product and telemetry records linked to one completed staging Journey Bot run.';

create or replace function public.purge_journey_bot_run(
  target_run_id uuid,
  actor_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.purge_journey_bot_run(target_run_id, actor_user_id);
$$;

revoke all on function public.purge_journey_bot_run(uuid, uuid) from public;
revoke all on function public.purge_journey_bot_run(uuid, uuid) from anon;
revoke all on function public.purge_journey_bot_run(uuid, uuid) from authenticated;
grant execute on function public.purge_journey_bot_run(uuid, uuid) to service_role;
