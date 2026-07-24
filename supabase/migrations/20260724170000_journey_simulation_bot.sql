-- Staging-only Journey Simulation Bot control plane, audit trail and test-data markers.

create table public.journey_bot_configs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enabled boolean not null default false,
  paused boolean not null default false,
  scenario_mode text not null default 'intake_only',
  min_interval_minutes integer not null default 5,
  max_interval_minutes integer not null default 15,
  max_journeys_per_run integer not null default 1,
  max_active_journeys integer not null default 3,
  max_journeys_per_day integer not null default 25,
  active_days_json jsonb not null default '[1,2,3,4,5]'::jsonb,
  active_time_windows_json jsonb not null default '[{"start":"00:00","end":"23:59"}]'::jsonb,
  program_ids_json jsonb not null default '[]'::jsonb,
  run_speed text not null default 'fast',
  suppress_external_notifications boolean not null default true,
  suppress_real_payments boolean not null default true,
  use_fallback_placement boolean not null default false,
  cleanup_after_days integer not null default 14,
  run_until timestamptz,
  stop_after_journeys integer,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  lock_token uuid,
  locked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_bot_configs_environment_check check (environment in ('development', 'dev', 'staging', 'production')),
  constraint journey_bot_configs_scenario_check check (
    scenario_mode in ('intake_only', 'intake_to_placement', 'placement_to_next_stage', 'full_journey_to_diploma', 'stress_mix')
  ),
  constraint journey_bot_configs_speed_check check (run_speed in ('fast', 'balanced', 'realistic')),
  constraint journey_bot_configs_intervals_check check (
    min_interval_minutes between 1 and 1440
    and max_interval_minutes between min_interval_minutes and 1440
  ),
  constraint journey_bot_configs_limits_check check (
    max_journeys_per_run between 1 and 25
    and max_active_journeys between 1 and 100
    and max_journeys_per_day between 1 and 1000
    and cleanup_after_days between 1 and 365
    and (stop_after_journeys is null or stop_after_journeys > 0)
  ),
  constraint journey_bot_configs_json_check check (
    jsonb_typeof(active_days_json) = 'array'
    and jsonb_typeof(active_time_windows_json) = 'array'
    and jsonb_typeof(program_ids_json) = 'array'
  ),
  constraint journey_bot_configs_environment_tenant_unique unique (environment, tenant_id)
);

create table public.journey_bot_runs (
  id uuid primary key default gen_random_uuid(),
  config_id uuid not null references public.journey_bot_configs (id) on delete restrict,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  environment text not null,
  scenario_mode text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  started_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  issue_count integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  constraint journey_bot_runs_status_check check (status in ('running', 'completed', 'partial', 'failed', 'stopped')),
  constraint journey_bot_runs_scenario_check check (
    scenario_mode in ('intake_only', 'intake_to_placement', 'placement_to_next_stage', 'full_journey_to_diploma', 'stress_mix')
  ),
  constraint journey_bot_runs_environment_check check (environment in ('development', 'dev', 'staging', 'production')),
  constraint journey_bot_runs_counts_check check (
    started_count >= 0 and completed_count >= 0 and failed_count >= 0 and issue_count >= 0
  )
);

create table public.journey_bot_child_journeys (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.journey_bot_runs (id) on delete restrict,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  environment text not null,
  participant_id uuid,
  guardian_id uuid references auth.users (id) on delete set null,
  intake_submission_id uuid,
  waitlist_entry_id uuid,
  enrollment_id uuid,
  current_program_id uuid,
  current_stage_id uuid,
  current_group_id uuid,
  scenario_mode text not null,
  journey_status text not null default 'running',
  child_display_name text not null,
  guardian_display_name text not null,
  birth_date date not null,
  is_under_minimum_age boolean not null default false,
  eligible_from date,
  smoke_run_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary_log text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  archived_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_bot_child_environment_check check (environment in ('development', 'dev', 'staging', 'production')),
  constraint journey_bot_child_scenario_check check (
    scenario_mode in ('intake_only', 'intake_to_placement', 'placement_to_next_stage', 'full_journey_to_diploma', 'stress_mix')
  ),
  constraint journey_bot_child_status_check check (
    journey_status in (
      'running', 'blocked_until_eligible', 'blocked_no_capacity', 'completed_intake',
      'completed_placement', 'completed_transfer', 'completed_full_journey', 'partial', 'failed', 'stopped', 'archived'
    )
  ),
  constraint journey_bot_child_participant_fk foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete set null,
  constraint journey_bot_child_intake_fk foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id) on delete set null,
  constraint journey_bot_child_waitlist_fk foreign key (tenant_id, waitlist_entry_id)
    references public.waitlist_entries (tenant_id, id) on delete set null,
  constraint journey_bot_child_enrollment_fk foreign key (tenant_id, enrollment_id)
    references public.enrollments (tenant_id, id) on delete set null,
  constraint journey_bot_child_program_fk foreign key (tenant_id, current_program_id)
    references public.programs (tenant_id, id) on delete set null,
  constraint journey_bot_child_stage_fk foreign key (tenant_id, current_stage_id)
    references public.program_stages (tenant_id, id) on delete set null,
  constraint journey_bot_child_group_fk foreign key (tenant_id, current_group_id)
    references public.groups (tenant_id, id) on delete set null
);

create table public.journey_bot_child_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  child_journey_id uuid not null references public.journey_bot_child_journeys (id) on delete cascade,
  participant_id uuid,
  event_type text not null,
  event_status text not null default 'completed',
  message text not null,
  context_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint journey_bot_child_events_status_check check (event_status in ('started', 'completed', 'skipped', 'blocked', 'failed')),
  constraint journey_bot_child_events_participant_fk foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete set null
);

create table public.journey_bot_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  run_id uuid references public.journey_bot_runs (id) on delete cascade,
  child_journey_id uuid references public.journey_bot_child_journeys (id) on delete cascade,
  severity text not null,
  issue_type text not null,
  message text not null,
  context_json jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint journey_bot_issues_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint journey_bot_issues_resolution_check check ((resolved and resolved_at is not null) or not resolved)
);

create index journey_bot_configs_due_idx on public.journey_bot_configs (environment, enabled, paused, next_run_at);
create index journey_bot_runs_config_started_idx on public.journey_bot_runs (config_id, started_at desc);
create index journey_bot_runs_tenant_started_idx on public.journey_bot_runs (tenant_id, started_at desc);
create index journey_bot_children_run_idx on public.journey_bot_child_journeys (run_id, started_at desc);
create index journey_bot_children_tenant_status_idx on public.journey_bot_child_journeys (tenant_id, journey_status, started_at desc);
create index journey_bot_events_child_idx on public.journey_bot_child_events (child_journey_id, created_at);
create index journey_bot_issues_open_idx on public.journey_bot_issues (resolved, severity, created_at desc);

create trigger journey_bot_configs_set_updated_at
  before update on public.journey_bot_configs
  for each row execute function app_private.set_updated_at();
create trigger journey_bot_child_journeys_set_updated_at
  before update on public.journey_bot_child_journeys
  for each row execute function app_private.set_updated_at();

alter table public.intake_submissions
  add column source text not null default 'public_intake',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add column archived_at timestamptz,
  add column archived_reason text,
  add constraint intake_submissions_source_check check (source in ('public_intake', 'journey_simulation_bot'));

alter table public.participants
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add column archived_at timestamptz,
  add column archived_reason text,
  add constraint participants_source_check check (source in ('manual', 'intake', 'import', 'journey_simulation_bot'));

alter table public.waitlist_entries
  drop constraint waitlist_entries_source_check,
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add column eligible_from date,
  add column minimum_age_blocked boolean not null default false,
  add column waitlist_reason text,
  add column archived_at timestamptz,
  add column archived_reason text,
  add constraint waitlist_entries_source_check check (source in ('intake', 'manual', 'import', 'journey_simulation_bot')),
  add constraint waitlist_entries_minimum_age_check check (
    (not minimum_age_blocked)
    or (eligible_from is not null and waitlist_reason = 'under_minimum_age')
  );

alter table public.enrollments
  drop constraint enrollments_source_check,
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add column archived_at timestamptz,
  add column archived_reason text,
  add constraint enrollments_source_check check (source in ('manual', 'intake', 'import', 'journey_simulation_bot'));

alter table public.group_memberships
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add column archived_at timestamptz,
  add column archived_reason text,
  add constraint group_memberships_source_check check (source in ('manual', 'intake', 'import', 'journey_simulation_bot'));

alter table public.sessions
  add column source text not null default 'schedule',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint sessions_source_check check (source in ('schedule', 'manual', 'import', 'journey_simulation_bot'));

alter table public.session_attendance
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint session_attendance_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.participant_progress_scores
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint participant_progress_scores_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.participant_badge_awards
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint participant_badge_awards_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.graduation_readiness
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint graduation_readiness_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.graduation_events
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint graduation_events_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.graduation_event_participants
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint graduation_event_participants_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

alter table public.certificate_records
  add column source text not null default 'manual',
  add column is_test boolean not null default false,
  add column journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  add column test_metadata_json jsonb not null default '{}'::jsonb,
  add constraint certificate_records_source_check check (source in ('manual', 'import', 'journey_simulation_bot'));

create index intake_submissions_journey_test_idx on public.intake_submissions (tenant_id, journey_run_id) where is_test;
create index participants_journey_test_idx on public.participants (tenant_id, journey_run_id) where is_test;
create index waitlist_entries_eligible_fifo_idx
  on public.waitlist_entries (tenant_id, eligible_from, priority_date, created_at)
  where status = 'waiting';
create index enrollments_journey_test_idx on public.enrollments (tenant_id, journey_run_id) where is_test;
create index group_memberships_journey_test_idx on public.group_memberships (tenant_id, journey_run_id) where is_test;

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
    and (
      lock_token is null
      or locked_at is null
      or locked_at < now() - make_interval(secs => lock_timeout_seconds)
    );

  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

create or replace function public.claim_journey_bot_config(
  target_config_id uuid,
  target_lock_token uuid,
  lock_timeout_seconds integer default 900
)
returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.claim_journey_bot_config(target_config_id, target_lock_token, lock_timeout_seconds);
$$;

revoke all on function app_private.claim_journey_bot_config(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function app_private.claim_journey_bot_config(uuid, uuid, integer) to service_role;
revoke all on function public.claim_journey_bot_config(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_journey_bot_config(uuid, uuid, integer) to service_role;

grant select, insert, update, delete on public.journey_bot_configs to authenticated;
grant select on public.journey_bot_runs to authenticated;
grant select on public.journey_bot_child_journeys to authenticated;
grant select on public.journey_bot_child_events to authenticated;
grant select, update on public.journey_bot_issues to authenticated;
grant all on public.journey_bot_configs to service_role;
grant all on public.journey_bot_runs to service_role;
grant all on public.journey_bot_child_journeys to service_role;
grant all on public.journey_bot_child_events to service_role;
grant all on public.journey_bot_issues to service_role;

alter table public.journey_bot_configs enable row level security;
alter table public.journey_bot_runs enable row level security;
alter table public.journey_bot_child_journeys enable row level security;
alter table public.journey_bot_child_events enable row level security;
alter table public.journey_bot_issues enable row level security;
alter table public.journey_bot_configs force row level security;
alter table public.journey_bot_runs force row level security;
alter table public.journey_bot_child_journeys force row level security;
alter table public.journey_bot_child_events force row level security;
alter table public.journey_bot_issues force row level security;

create policy "Platform admins manage journey bot configs" on public.journey_bot_configs
  for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform admins view journey bot runs" on public.journey_bot_runs
  for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform admins view journey bot children" on public.journey_bot_child_journeys
  for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform admins view journey bot events" on public.journey_bot_child_events
  for select to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
create policy "Platform admins manage journey bot issues" on public.journey_bot_issues
  for all to authenticated
  using (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']))
  with check (app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin']));
