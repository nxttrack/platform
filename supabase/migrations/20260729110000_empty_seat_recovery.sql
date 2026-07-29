-- Explainable empty-seat recovery. Snapshots and candidates are advisory:
-- no offer, booking, message or placement is created by this module.

create table public.empty_seat_recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  group_id uuid not null,
  available_seats integer not null,
  cancellation_seats integer not null default 0,
  candidate_count integer not null default 0,
  actionable_candidate_count integer not null default 0,
  recovery_band text not null,
  confidence numeric(5, 4) not null,
  summary text not null,
  reasons_json jsonb not null default '[]'::jsonb,
  source_fingerprint text not null,
  status text not null default 'open',
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empty_seat_recovery_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id)
    on delete cascade,
  constraint empty_seat_recovery_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id)
    on delete cascade,
  constraint empty_seat_recovery_capacity_check
    check (available_seats > 0 and cancellation_seats >= 0),
  constraint empty_seat_recovery_counts_check
    check (candidate_count >= 0 and actionable_candidate_count between 0 and candidate_count),
  constraint empty_seat_recovery_band_check
    check (recovery_band in ('within_24h', 'within_48h', 'within_72h', 'manual_outreach', 'no_match')),
  constraint empty_seat_recovery_confidence_check check (confidence between 0 and 1),
  constraint empty_seat_recovery_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint empty_seat_recovery_status_check check (status in ('open', 'reviewed', 'resolved', 'dismissed', 'expired')),
  constraint empty_seat_recovery_expiry_check check (expires_at > generated_at),
  constraint empty_seat_recovery_review_check
    check ((status = 'open' and reviewed_at is null) or status <> 'open'),
  constraint empty_seat_recovery_test_check
    check ((not is_test and journey_run_id is null) or (is_test and journey_run_id is not null)),
  constraint empty_seat_recovery_fingerprint_unique unique (tenant_id, source_fingerprint),
  constraint empty_seat_recovery_tenant_id_id_unique unique (tenant_id, id)
);

create table public.empty_seat_recovery_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  snapshot_id uuid not null,
  candidate_type text not null,
  waitlist_entry_id uuid,
  catch_up_credit_id uuid,
  participant_id uuid,
  display_name text not null,
  score integer not null,
  confidence numeric(5, 4) not null,
  fifo_rank integer,
  reasons_json jsonb not null default '[]'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  family_context_json jsonb not null default '{}'::jsonb,
  suggested_action text not null,
  status text not null default 'suggested',
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empty_seat_candidates_snapshot_fk
    foreign key (tenant_id, snapshot_id)
    references public.empty_seat_recovery_snapshots (tenant_id, id)
    on delete cascade,
  constraint empty_seat_candidates_waitlist_fk
    foreign key (tenant_id, waitlist_entry_id)
    references public.waitlist_entries (tenant_id, id)
    on delete cascade,
  constraint empty_seat_candidates_credit_fk
    foreign key (tenant_id, catch_up_credit_id)
    references public.catch_up_credits (tenant_id, id)
    on delete cascade,
  constraint empty_seat_candidates_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint empty_seat_candidates_type_check check (candidate_type in ('waitlist', 'makeup')),
  constraint empty_seat_candidates_source_check check (
    (candidate_type = 'waitlist' and waitlist_entry_id is not null and catch_up_credit_id is null)
    or (candidate_type = 'makeup' and catch_up_credit_id is not null and participant_id is not null and waitlist_entry_id is null)
  ),
  constraint empty_seat_candidates_score_check check (score between 0 and 100),
  constraint empty_seat_candidates_confidence_check check (confidence between 0 and 1),
  constraint empty_seat_candidates_fifo_check check (fifo_rank is null or fifo_rank > 0),
  constraint empty_seat_candidates_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint empty_seat_candidates_blockers_check check (jsonb_typeof(blockers_json) = 'array'),
  constraint empty_seat_candidates_family_check check (jsonb_typeof(family_context_json) = 'object'),
  constraint empty_seat_candidates_status_check
    check (status in ('suggested', 'review_task_created', 'opened', 'dismissed', 'booked', 'offered', 'expired')),
  constraint empty_seat_candidates_test_check
    check ((not is_test and journey_run_id is null) or (is_test and journey_run_id is not null)),
  constraint empty_seat_candidates_unique
    unique (tenant_id, snapshot_id, candidate_type, waitlist_entry_id, catch_up_credit_id),
  constraint empty_seat_candidates_tenant_id_id_unique unique (tenant_id, id)
);

create table public.empty_seat_recovery_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  snapshot_id uuid not null,
  candidate_id uuid,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint empty_seat_events_snapshot_fk
    foreign key (tenant_id, snapshot_id)
    references public.empty_seat_recovery_snapshots (tenant_id, id)
    on delete cascade,
  constraint empty_seat_events_candidate_fk
    foreign key (tenant_id, candidate_id)
    references public.empty_seat_recovery_candidates (tenant_id, id)
    on delete cascade,
  constraint empty_seat_events_type_check
    check (event_type in ('generated', 'reviewed', 'task_created', 'opened_source', 'dismissed', 'resolved', 'expired')),
  constraint empty_seat_events_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint empty_seat_events_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_tasks
  add column if not exists empty_seat_recovery_candidate_id uuid;
alter table public.tenant_tasks
  add constraint tenant_tasks_empty_seat_candidate_fk
    foreign key (tenant_id, empty_seat_recovery_candidate_id)
    references public.empty_seat_recovery_candidates (tenant_id, id)
    on delete set null (empty_seat_recovery_candidate_id);

create index empty_seat_recovery_open_idx
  on public.empty_seat_recovery_snapshots (tenant_id, status, generated_at desc)
  where status = 'open';
create index empty_seat_recovery_session_idx
  on public.empty_seat_recovery_snapshots (tenant_id, session_id, generated_at desc);
create index empty_seat_candidates_rank_idx
  on public.empty_seat_recovery_candidates (tenant_id, snapshot_id, score desc);
create index empty_seat_events_timeline_idx
  on public.empty_seat_recovery_events (tenant_id, snapshot_id, occurred_at desc);
create index tenant_tasks_empty_seat_candidate_idx
  on public.tenant_tasks (tenant_id, empty_seat_recovery_candidate_id)
  where empty_seat_recovery_candidate_id is not null;

create trigger empty_seat_recovery_snapshots_set_updated_at
  before update on public.empty_seat_recovery_snapshots
  for each row execute function app_private.set_updated_at();
create trigger empty_seat_recovery_candidates_set_updated_at
  before update on public.empty_seat_recovery_candidates
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.empty_seat_recovery_snapshots to authenticated;
grant select, insert, update, delete on public.empty_seat_recovery_candidates to authenticated;
grant select, insert, update, delete on public.empty_seat_recovery_events to authenticated;
grant all on public.empty_seat_recovery_snapshots to service_role;
grant all on public.empty_seat_recovery_candidates to service_role;
grant all on public.empty_seat_recovery_events to service_role;

alter table public.empty_seat_recovery_snapshots enable row level security;
alter table public.empty_seat_recovery_snapshots force row level security;
alter table public.empty_seat_recovery_candidates enable row level security;
alter table public.empty_seat_recovery_candidates force row level security;
alter table public.empty_seat_recovery_events enable row level security;
alter table public.empty_seat_recovery_events force row level security;

create policy "Tenant admins manage empty seat recovery snapshots"
  on public.empty_seat_recovery_snapshots for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage empty seat recovery candidates"
  on public.empty_seat_recovery_candidates for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage empty seat recovery events"
  on public.empty_seat_recovery_events for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
