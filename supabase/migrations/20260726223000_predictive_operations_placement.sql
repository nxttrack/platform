-- Explainable wait-time predictions, daily next-best actions and Smart Placement 2.0.

alter table public.intake_submissions
  drop constraint intake_submissions_selected_wait_band_check,
  add constraint intake_submissions_selected_wait_band_check
    check (
      selected_wait_band is null
      or selected_wait_band in ('short', 'medium', 'long', 'very_long', 'insufficient_data')
    );

create table public.wait_time_band_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null,
  stage_id uuid,
  preferred_day integer,
  preferred_time_block text,
  location_id uuid,
  band text not null,
  confidence numeric(5, 4) not null,
  sample_size integer not null default 0,
  basis text not null,
  median_weeks numeric(8, 2),
  p75_weeks numeric(8, 2),
  p90_weeks numeric(8, 2),
  inflow_per_week numeric(8, 2) not null default 0,
  outflow_per_week numeric(8, 2) not null default 0,
  current_waitlist integer not null default 0,
  available_capacity numeric(8, 2) not null default 0,
  reasons_json jsonb not null default '[]'::jsonb,
  alternatives_json jsonb not null default '[]'::jsonb,
  admin_explanation text not null,
  parent_explanation text not null,
  include_test_data boolean not null default false,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wait_time_band_snapshots_program_fk
    foreign key (tenant_id, program_id) references public.programs (tenant_id, id) on delete cascade,
  constraint wait_time_band_snapshots_stage_fk
    foreign key (tenant_id, stage_id) references public.program_stages (tenant_id, id) on delete cascade,
  constraint wait_time_band_snapshots_location_fk
    foreign key (tenant_id, location_id) references public.resources (tenant_id, id) on delete cascade,
  constraint wait_time_band_snapshots_band_check
    check (band in ('short', 'medium', 'long', 'very_long', 'insufficient_data')),
  constraint wait_time_band_snapshots_confidence_check check (confidence between 0 and 1),
  constraint wait_time_band_snapshots_sample_check check (sample_size >= 0),
  constraint wait_time_band_snapshots_weekday_check check (preferred_day is null or preferred_day between 1 and 7),
  constraint wait_time_band_snapshots_time_check
    check (preferred_time_block is null or preferred_time_block in ('morning', 'afternoon', 'evening')),
  constraint wait_time_band_snapshots_counts_check
    check (
      inflow_per_week >= 0
      and outflow_per_week >= 0
      and current_waitlist >= 0
      and available_capacity >= 0
    ),
  constraint wait_time_band_snapshots_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint wait_time_band_snapshots_alternatives_check check (jsonb_typeof(alternatives_json) = 'array'),
  constraint wait_time_band_snapshots_scope_unique
    unique nulls not distinct (
      tenant_id,
      program_id,
      stage_id,
      preferred_day,
      preferred_time_block,
      location_id,
      include_test_data
    )
);

create table public.next_best_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  action_type text not null,
  fingerprint text not null,
  title text not null,
  description text not null,
  priority text not null default 'medium',
  status text not null default 'open',
  entity_type text,
  entity_id uuid,
  participant_id uuid,
  guardian_id uuid,
  group_id uuid,
  program_id uuid,
  due_at timestamptz,
  reasons_json jsonb not null default '[]'::jsonb,
  suggested_actions_json jsonb not null default '[]'::jsonb,
  source_href text not null default '/admin',
  confidence numeric(5, 4) not null default 0.5,
  source text not null default 'next_best_action_engine',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  last_generated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by_user_id uuid references auth.users (id) on delete set null,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint next_best_actions_type_check check (
    action_type in (
      'review_new_intakes',
      'slot_offer_expiring',
      'parent_waiting_for_reply',
      'payment_needs_attention',
      'group_full_high_demand',
      'group_running_empty',
      'extra_moment_recommended',
      'instructor_missing',
      'capacity_bottleneck',
      'waitlist_candidate_became_eligible',
      'data_quality_issue',
      'afzwem_ready_waiting',
      'makeup_credit_expiring'
    )
  ),
  constraint next_best_actions_priority_check check (priority in ('high', 'medium', 'low')),
  constraint next_best_actions_status_check check (status in ('open', 'dismissed', 'completed', 'auto_resolved')),
  constraint next_best_actions_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint next_best_actions_suggested_actions_check check (jsonb_typeof(suggested_actions_json) = 'array'),
  constraint next_best_actions_confidence_check check (confidence between 0 and 1),
  constraint next_best_actions_state_check check (
    (status = 'dismissed' and dismissed_at is not null)
    or (status <> 'dismissed' and dismissed_at is null)
  ),
  constraint next_best_actions_completion_check check (
    (status in ('completed', 'auto_resolved') and completed_at is not null)
    or (status not in ('completed', 'auto_resolved') and completed_at is null)
  ),
  constraint next_best_actions_test_marker_check check (journey_run_id is null or is_test),
  constraint next_best_actions_tenant_id_id_unique unique (tenant_id, id),
  constraint next_best_actions_tenant_fingerprint_unique unique (tenant_id, fingerprint)
);

create table public.placement_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid,
  waitlist_entry_id uuid,
  intake_submission_id uuid,
  target_program_id uuid not null,
  target_stage_id uuid,
  group_id uuid not null,
  score numeric(6, 2) not null,
  confidence numeric(5, 4) not null,
  status text not null default 'suggested',
  reasons_json jsonb not null default '[]'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  capacity_snapshot_json jsonb not null default '{}'::jsonb,
  source text not null default 'smart_placement_2',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint placement_suggestions_participant_fk
    foreign key (tenant_id, participant_id) references public.participants (tenant_id, id) on delete cascade,
  constraint placement_suggestions_waitlist_fk
    foreign key (tenant_id, waitlist_entry_id) references public.waitlist_entries (tenant_id, id) on delete cascade,
  constraint placement_suggestions_intake_fk
    foreign key (tenant_id, intake_submission_id) references public.intake_submissions (tenant_id, id) on delete cascade,
  constraint placement_suggestions_program_fk
    foreign key (tenant_id, target_program_id) references public.programs (tenant_id, id) on delete cascade,
  constraint placement_suggestions_stage_fk
    foreign key (tenant_id, target_stage_id) references public.program_stages (tenant_id, id) on delete cascade,
  constraint placement_suggestions_group_fk
    foreign key (tenant_id, group_id) references public.groups (tenant_id, id) on delete cascade,
  constraint placement_suggestions_score_check check (score between 0 and 100),
  constraint placement_suggestions_confidence_check check (confidence between 0 and 1),
  constraint placement_suggestions_status_check check (status in ('suggested', 'offered', 'accepted', 'rejected', 'expired')),
  constraint placement_suggestions_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint placement_suggestions_blockers_check check (jsonb_typeof(blockers_json) = 'array'),
  constraint placement_suggestions_capacity_check check (jsonb_typeof(capacity_snapshot_json) = 'object'),
  constraint placement_suggestions_scope_check
    check (participant_id is not null or waitlist_entry_id is not null or intake_submission_id is not null),
  constraint placement_suggestions_test_marker_check check (journey_run_id is null or is_test),
  constraint placement_suggestions_tenant_id_id_unique unique (tenant_id, id)
);

create unique index placement_suggestions_active_scope_idx
  on public.placement_suggestions (tenant_id, waitlist_entry_id, group_id)
  where status = 'suggested' and waitlist_entry_id is not null;

alter table public.tenant_tasks
  add column next_best_action_id uuid,
  add column placement_suggestion_id uuid,
  add constraint tenant_tasks_next_best_action_fk
    foreign key (tenant_id, next_best_action_id)
    references public.next_best_actions (tenant_id, id)
    on delete set null (next_best_action_id),
  add constraint tenant_tasks_placement_suggestion_fk
    foreign key (tenant_id, placement_suggestion_id)
    references public.placement_suggestions (tenant_id, id)
    on delete set null (placement_suggestion_id);

create index wait_time_band_snapshots_lookup_idx
  on public.wait_time_band_snapshots (
    tenant_id,
    program_id,
    stage_id,
    preferred_day,
    preferred_time_block,
    computed_at desc
  );
create index next_best_actions_status_idx
  on public.next_best_actions (tenant_id, status, priority, due_at, last_generated_at desc);
create index next_best_actions_entity_idx
  on public.next_best_actions (tenant_id, entity_type, entity_id, status);
create index next_best_actions_journey_idx
  on public.next_best_actions (tenant_id, journey_run_id)
  where is_test;
create index placement_suggestions_waitlist_idx
  on public.placement_suggestions (tenant_id, waitlist_entry_id, score desc, computed_at desc);
create index placement_suggestions_journey_idx
  on public.placement_suggestions (tenant_id, journey_run_id)
  where is_test;
create index tenant_tasks_next_best_action_idx
  on public.tenant_tasks (tenant_id, next_best_action_id)
  where next_best_action_id is not null;
create index tenant_tasks_placement_suggestion_idx
  on public.tenant_tasks (tenant_id, placement_suggestion_id)
  where placement_suggestion_id is not null;

create trigger wait_time_band_snapshots_set_updated_at
  before update on public.wait_time_band_snapshots
  for each row execute function app_private.set_updated_at();
create trigger next_best_actions_set_updated_at
  before update on public.next_best_actions
  for each row execute function app_private.set_updated_at();
create trigger placement_suggestions_set_updated_at
  before update on public.placement_suggestions
  for each row execute function app_private.set_updated_at();

grant select on public.wait_time_band_snapshots to authenticated;
grant select on public.next_best_actions to authenticated;
grant select on public.placement_suggestions to authenticated;
grant all on public.wait_time_band_snapshots to service_role;
grant all on public.next_best_actions to service_role;
grant all on public.placement_suggestions to service_role;

alter table public.wait_time_band_snapshots enable row level security;
alter table public.next_best_actions enable row level security;
alter table public.placement_suggestions enable row level security;
alter table public.wait_time_band_snapshots force row level security;
alter table public.next_best_actions force row level security;
alter table public.placement_suggestions force row level security;

create policy "Tenant staff can view wait time predictions"
  on public.wait_time_band_snapshots
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view next best actions"
  on public.next_best_actions
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view placement suggestions"
  on public.placement_suggestions
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

comment on table public.wait_time_band_snapshots is
  'Explainable wait-time bands. Parent-facing text intentionally avoids exact promises.';
comment on table public.next_best_actions is
  'Idempotent daily proposals for tenant staff; never executes the suggested mutation.';
comment on table public.placement_suggestions is
  'Explainable Smart Placement 2.0 candidates. A hard blocker always requires a new calculation or human correction.';

-- Extend the fail-closed Journey Bot cleanup with predictive records derived from one run.
create or replace function public.purge_journey_bot_run(
  target_run_id uuid,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  deleted_action_count integer;
  deleted_event_count integer;
  deleted_issue_count integer;
  deleted_snapshot_count integer;
  deleted_suggestion_count integer;
  purge_result jsonb;
begin
  delete from public.placement_suggestions
  where journey_run_id = target_run_id
    and is_test
    and source = 'journey_simulation_bot';
  get diagnostics deleted_suggestion_count = row_count;

  delete from public.next_best_actions
  where journey_run_id = target_run_id
    and is_test
    and source = 'journey_simulation_bot';
  get diagnostics deleted_action_count = row_count;

  delete from public.smart_signal_snapshots snapshot
  where snapshot.tenant_id = (
      select run.tenant_id
      from public.journey_bot_runs run
      where run.id = target_run_id
    )
    and (
      (
        snapshot.signal_type = 'waitlist_eligibility'
        and snapshot.entity_type = 'waitlist_entry'
        and snapshot.entity_id in (
          select entry.id
          from public.waitlist_entries entry
          where entry.journey_run_id = target_run_id
            and entry.is_test
            and entry.source = 'journey_simulation_bot'
        )
      )
      or (
        snapshot.signal_type = 'slot_offer_lifecycle'
        and snapshot.entity_type = 'slot_offer'
        and snapshot.entity_id in (
          select offer.id
          from public.slot_offers offer
          join public.waitlist_entries entry
            on entry.tenant_id = offer.tenant_id
           and entry.id = offer.waitlist_entry_id
          where entry.journey_run_id = target_run_id
            and entry.is_test
            and entry.source = 'journey_simulation_bot'
        )
      )
      or (
        snapshot.signal_type = 'group_capacity'
        and snapshot.entity_type = 'group'
        and snapshot.entity_id in (
          select membership.group_id
          from public.group_memberships membership
          where membership.journey_run_id = target_run_id
            and membership.is_test
            and membership.source = 'journey_simulation_bot'
        )
      )
    );
  get diagnostics deleted_snapshot_count = row_count;

  delete from public.data_quality_issues
  where journey_run_id = target_run_id
    and is_test
    and source = 'journey_simulation_bot';
  get diagnostics deleted_issue_count = row_count;

  delete from public.smart_events
  where journey_run_id = target_run_id
    and is_test;
  get diagnostics deleted_event_count = row_count;

  purge_result := app_private.purge_journey_bot_run(target_run_id, actor_user_id);

  update public.journey_bot_purge_receipts
  set deleted_counts_json = deleted_counts_json || jsonb_build_object(
    'data_quality_issues', deleted_issue_count,
    'next_best_actions', deleted_action_count,
    'placement_suggestions', deleted_suggestion_count,
    'smart_events', deleted_event_count,
    'smart_signal_snapshots', deleted_snapshot_count
  )
  where run_id = target_run_id;

  return jsonb_set(
    purge_result,
    '{deleted_counts}',
    coalesce(purge_result -> 'deleted_counts', '{}'::jsonb) || jsonb_build_object(
      'data_quality_issues', deleted_issue_count,
      'next_best_actions', deleted_action_count,
      'placement_suggestions', deleted_suggestion_count,
      'smart_events', deleted_event_count,
      'smart_signal_snapshots', deleted_snapshot_count
    )
  );
end
$$;

revoke all on function public.purge_journey_bot_run(uuid, uuid) from public;
revoke all on function public.purge_journey_bot_run(uuid, uuid) from anon;
revoke all on function public.purge_journey_bot_run(uuid, uuid) from authenticated;
grant execute on function public.purge_journey_bot_run(uuid, uuid) to service_role;
