-- Retire the simulation bot. Keep historical rows and their test-data lineage;
-- they must never be reclassified as live participants or delivery candidates.
do $$
begin
  if exists (select 1 from public.journey_bot_runs where status = 'running') then
    raise exception using errcode = '55000',
      message = 'Stop active Journey Bot runs before retiring the bot.';
  end if;
end;
$$;

update public.journey_bot_configs
set enabled = false, paused = true, next_run_at = null, run_until = null
where enabled or not paused or next_run_at is not null or run_until is not null;

-- Application roles can inspect retained evidence, but cannot recreate or
-- mutate the retired runner, its configuration, telemetry or purge receipts.
revoke insert, update, delete, truncate, references, trigger on table
  public.journey_bot_configs,
  public.journey_bot_runs,
  public.journey_bot_child_journeys,
  public.journey_bot_child_events,
  public.journey_bot_issues,
  public.journey_bot_purge_receipts
from public, anon, authenticated, service_role;

-- Remove the obsolete service RPCs and their private implementations.
-- RESTRICT is intentional: an unexpected database dependency must stop rollout.
drop function public.claim_journey_bot_config(uuid, uuid, integer) restrict;
drop function public.purge_journey_bot_run(uuid, uuid) restrict;
drop function app_private.claim_journey_bot_config(uuid, uuid, integer) restrict;
drop function app_private.purge_journey_bot_run(uuid, uuid) restrict;

-- The preceding staging recovery migration is retained as applied history.
-- Its synthetic-purge exception is no longer needed after the bot is retired.
create or replace function app_private.prevent_swim_lifecycle_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Swim lifecycle events are append-only';
end;
$$;

comment on table public.journey_bot_configs is
  'Retired Journey Bot configuration. Application roles are read-only; historical test-data lineage is retained.';
