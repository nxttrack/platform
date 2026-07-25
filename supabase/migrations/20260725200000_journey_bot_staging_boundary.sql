-- Make the Journey Simulation Bot structurally staging-only.

do $$
begin
  if exists (
    select 1
    from public.journey_bot_configs
    where environment <> 'staging'
  ) or exists (
    select 1
    from public.journey_bot_runs
    where environment <> 'staging'
  ) or exists (
    select 1
    from public.journey_bot_child_journeys
    where environment <> 'staging'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Journey Bot migration refused: non-staging bot data must be purged before this boundary can be installed.';
  end if;
end
$$;

alter table public.journey_bot_configs
  drop constraint journey_bot_configs_environment_check,
  add constraint journey_bot_configs_environment_check check (environment = 'staging'),
  add constraint journey_bot_configs_external_side_effects_check check (
    suppress_external_notifications
    and suppress_real_payments
  );

alter table public.journey_bot_runs
  drop constraint journey_bot_runs_environment_check,
  add constraint journey_bot_runs_environment_check check (environment = 'staging');

alter table public.journey_bot_child_journeys
  drop constraint journey_bot_child_environment_check,
  add constraint journey_bot_child_environment_check check (environment = 'staging');

comment on table public.journey_bot_configs is
  'Staging-only Journey Simulation Bot configuration. Production and development rows are rejected by constraint.';
