-- Make Journey Bot outcomes, budgets and scheduler health explicit and auditable.

alter table public.journey_bot_configs
  add column journeys_started_total integer not null default 0,
  add column budget_started_at timestamptz not null default now(),
  add constraint journey_bot_configs_started_total_check check (journeys_started_total >= 0);

update public.journey_bot_configs as config
set journeys_started_total = coalesce((
  select sum(run.started_count)::integer
  from public.journey_bot_runs as run
  where run.config_id = config.id
), 0);

alter table public.journey_bot_runs
  add column passed_count integer not null default 0,
  add column expected_blocked_count integer not null default 0,
  add column degraded_count integer not null default 0,
  add column technical_failure_count integer not null default 0,
  add column unexpected_issue_count integer not null default 0,
  add column health_status text not null default 'unknown',
  add column issue_summary_json jsonb not null default '{}'::jsonb,
  add constraint journey_bot_runs_health_status_check check (health_status in ('unknown', 'healthy', 'degraded', 'failed')),
  add constraint journey_bot_runs_advanced_counts_check check (
    passed_count >= 0
    and expected_blocked_count >= 0
    and degraded_count >= 0
    and technical_failure_count >= 0
    and unexpected_issue_count >= 0
  );

update public.journey_bot_runs
set passed_count = completed_count,
    degraded_count = failed_count,
    unexpected_issue_count = issue_count,
    health_status = case
      when status = 'completed' then 'healthy'
      when status = 'failed' then 'failed'
      when status = 'partial' then 'degraded'
      else 'unknown'
    end,
    issue_summary_json = jsonb_build_object(
      'legacy', true,
      'unexpected', issue_count
    );

alter table public.journey_bot_child_journeys
  add column outcome_classification text not null default 'unknown',
  add column expected_outcome boolean not null default false,
  add constraint journey_bot_child_outcome_classification_check check (
    outcome_classification in ('unknown', 'passed', 'expected_blocker', 'degraded', 'technical_failure')
  );

update public.journey_bot_child_journeys
set outcome_classification = case
      when journey_status like 'completed_%' then 'passed'
      when journey_status in ('blocked_until_eligible', 'blocked_no_capacity') then 'expected_blocker'
      when journey_status = 'partial' then 'degraded'
      when journey_status = 'failed' then 'technical_failure'
      else 'unknown'
    end,
    expected_outcome = journey_status in ('blocked_until_eligible', 'blocked_no_capacity');

alter table public.journey_bot_issues
  add column expected boolean not null default false,
  add column step text,
  add column fingerprint text;

create index journey_bot_runs_health_started_idx
  on public.journey_bot_runs (environment, health_status, started_at desc);

create index journey_bot_issues_unexpected_open_idx
  on public.journey_bot_issues (expected, resolved, severity, created_at desc)
  where not expected;

create or replace function app_private.claim_journey_bot_config(
  target_config_id uuid,
  target_lock_token uuid,
  lock_timeout_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_count integer;
begin
  if lock_timeout_seconds < 30 or lock_timeout_seconds > 3600 then
    return false;
  end if;

  update public.journey_bot_configs
  set lock_token = target_lock_token,
      locked_at = now()
  where id = target_config_id
    and enabled
    and not paused
    and suppress_external_notifications
    and suppress_real_payments
    and (
      lock_token is null
      or locked_at is null
      or locked_at < now() - make_interval(secs => lock_timeout_seconds)
    );

  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

comment on column public.journey_bot_runs.health_status is
  'Technical health: expected business blockers keep a run healthy; only unexpected degradation or failures change this value.';

comment on column public.journey_bot_issues.expected is
  'True only for a deliberately exercised and verified blocker, never for an unexpected application error.';

comment on column public.journey_bot_configs.journeys_started_total is
  'Monotonic within the current budget window and used to enforce stop_after_journeys exactly.';
