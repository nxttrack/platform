-- Explainable retention and personal-attention signals.
-- These records may only propose human contact. They never label a family,
-- unsubscribe a participant, change placement or send communication.

create table public.enrollment_pause_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null,
  participant_id uuid not null,
  starts_on date not null,
  expected_return_on date,
  returned_on date,
  reason_category text not null default 'other',
  status text not null default 'planned',
  internal_note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enrollment_pause_periods_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint enrollment_pause_periods_reason_check
    check (reason_category in ('medical', 'holiday', 'schedule', 'financial', 'family', 'other')),
  constraint enrollment_pause_periods_status_check
    check (status in ('planned', 'active', 'returned', 'cancelled')),
  constraint enrollment_pause_periods_dates_check
    check (
      (expected_return_on is null or starts_on <= expected_return_on)
      and (returned_on is null or starts_on <= returned_on)
    ),
  constraint enrollment_pause_periods_return_check
    check ((status = 'returned' and returned_on is not null) or status <> 'returned'),
  constraint enrollment_pause_periods_note_size_check
    check (internal_note is null or length(internal_note) <= 1000),
  constraint enrollment_pause_periods_tenant_id_id_unique unique (tenant_id, id)
);

create table public.participant_attention_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  enrollment_id uuid,
  signal_type text not null,
  attention_level text not null,
  confidence numeric(5, 4) not null,
  title text not null,
  summary text not null,
  reasons_json jsonb not null default '[]'::jsonb,
  source_data_json jsonb not null default '{}'::jsonb,
  recommended_action text not null,
  source_fingerprint text not null,
  status text not null default 'open',
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_attention_signals_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id) on delete cascade,
  constraint participant_attention_signals_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  constraint participant_attention_signals_type_check
    check (signal_type in (
      'repeated_absence',
      'declining_participation',
      'progress_stall',
      'unpaid_balance',
      'open_parent_question',
      'pause_ending',
      'schedule_friction'
    )),
  constraint participant_attention_signals_level_check
    check (attention_level in ('observe', 'contact_suggested', 'priority_contact')),
  constraint participant_attention_signals_confidence_check check (confidence between 0 and 1),
  constraint participant_attention_signals_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint participant_attention_signals_source_check check (jsonb_typeof(source_data_json) = 'object'),
  constraint participant_attention_signals_status_check
    check (status in ('open', 'reviewed', 'resolved', 'dismissed', 'expired')),
  constraint participant_attention_signals_review_check
    check (
      (status = 'open' and reviewed_at is null and reviewed_by_user_id is null)
      or (status = 'expired' and reviewed_at is null and reviewed_by_user_id is null)
      or (status in ('reviewed', 'resolved', 'dismissed') and reviewed_at is not null and reviewed_by_user_id is not null)
    ),
  constraint participant_attention_signals_expiry_check check (expires_at > last_observed_at),
  constraint participant_attention_signals_test_check
    check ((not is_test and journey_run_id is null) or (is_test and journey_run_id is not null)),
  constraint participant_attention_signals_unique
    unique (tenant_id, participant_id, signal_type, source_fingerprint),
  constraint participant_attention_signals_tenant_id_id_unique unique (tenant_id, id)
);

create table public.participant_attention_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  signal_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  note text,
  occurred_at timestamptz not null default now(),
  constraint participant_attention_events_signal_fk
    foreign key (tenant_id, signal_id)
    references public.participant_attention_signals (tenant_id, id) on delete cascade,
  constraint participant_attention_events_type_check
    check (event_type in ('generated', 'reviewed', 'contact_task_created', 'resolved', 'dismissed', 'expired')),
  constraint participant_attention_events_note_size_check
    check (note is null or length(note) <= 1000),
  constraint participant_attention_events_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_tasks
  add column if not exists participant_attention_signal_id uuid;
alter table public.tenant_tasks
  add constraint tenant_tasks_attention_signal_fk
    foreign key (tenant_id, participant_attention_signal_id)
    references public.participant_attention_signals (tenant_id, id)
    on delete set null (participant_attention_signal_id);

create index enrollment_pause_periods_return_idx
  on public.enrollment_pause_periods (tenant_id, status, expected_return_on);
create index participant_attention_signals_queue_idx
  on public.participant_attention_signals (tenant_id, status, attention_level, last_observed_at desc);
create index participant_attention_signals_participant_idx
  on public.participant_attention_signals (tenant_id, participant_id, status);
create index participant_attention_events_timeline_idx
  on public.participant_attention_events (tenant_id, signal_id, occurred_at desc);
create index tenant_tasks_attention_signal_idx
  on public.tenant_tasks (tenant_id, participant_attention_signal_id)
  where participant_attention_signal_id is not null;

create trigger enrollment_pause_periods_set_updated_at
  before update on public.enrollment_pause_periods
  for each row execute function app_private.set_updated_at();
create trigger participant_attention_signals_set_updated_at
  before update on public.participant_attention_signals
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.enrollment_pause_periods to authenticated;
grant select, insert, update, delete on public.participant_attention_signals to authenticated;
grant select, insert on public.participant_attention_events to authenticated;
grant all on public.enrollment_pause_periods to service_role;
grant all on public.participant_attention_signals to service_role;
grant all on public.participant_attention_events to service_role;

alter table public.enrollment_pause_periods enable row level security;
alter table public.enrollment_pause_periods force row level security;
alter table public.participant_attention_signals enable row level security;
alter table public.participant_attention_signals force row level security;
alter table public.participant_attention_events enable row level security;
alter table public.participant_attention_events force row level security;

create policy "Tenant admins manage enrollment pauses"
  on public.enrollment_pause_periods for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Guardians view own enrollment pauses"
  on public.enrollment_pause_periods for select to authenticated
  using (app_private.current_user_can_view_participant(participant_id));
create policy "Tenant admins manage attention signals"
  on public.participant_attention_signals for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins read attention events"
  on public.participant_attention_events for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins create attention events"
  on public.participant_attention_events for insert to authenticated
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
