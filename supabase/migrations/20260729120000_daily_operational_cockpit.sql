-- Cross-device review state for the daily operational cockpit.
-- Source signals remain derived from canonical domain data. This table only
-- records human triage and never performs a customer-facing mutation.

create table public.operational_signal_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  signal_key text not null,
  signal_type text not null,
  source_entity_type text not null,
  source_entity_id uuid,
  source_fingerprint text not null,
  status text not null default 'open',
  assigned_to_user_id uuid references auth.users (id) on delete set null,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  snoozed_until timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_signal_states_key_check
    check (signal_key ~ '^[a-z0-9_:-]{3,180}$'),
  constraint operational_signal_states_type_check
    check (signal_type in (
      'crm_follow_up',
      'session_without_instructor',
      'empty_seat',
      'missing_attendance',
      'expiring_offer',
      'failed_payment',
      'parent_question',
      'expiring_media',
      'automation_failure',
      'configuration_drift',
      'retention_risk'
    )),
  constraint operational_signal_states_entity_type_check
    check (source_entity_type in (
      'intake',
      'session',
      'recovery_snapshot',
      'slot_offer',
      'payment_attempt',
      'message_thread',
      'participant_media',
      'automation_run',
      'tenant',
      'participant'
    )),
  constraint operational_signal_states_status_check
    check (status in ('open', 'acknowledged', 'snoozed', 'resolved')),
  constraint operational_signal_states_review_check
    check (
      (status = 'open' and reviewed_at is null and reviewed_by_user_id is null)
      or (status <> 'open' and reviewed_at is not null and reviewed_by_user_id is not null)
    ),
  constraint operational_signal_states_snooze_check
    check (
      (status = 'snoozed' and snoozed_until is not null)
      or (status <> 'snoozed' and snoozed_until is null)
    ),
  constraint operational_signal_states_note_size_check
    check (review_note is null or length(review_note) <= 1000),
  constraint operational_signal_states_tenant_key_unique unique (tenant_id, signal_key),
  constraint operational_signal_states_tenant_id_id_unique unique (tenant_id, id)
);

create table public.operational_signal_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  signal_state_id uuid not null,
  event_type text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  note text,
  occurred_at timestamptz not null default now(),
  constraint operational_signal_events_state_fk
    foreign key (tenant_id, signal_state_id)
    references public.operational_signal_states (tenant_id, id)
    on delete cascade,
  constraint operational_signal_events_type_check
    check (event_type in ('created', 'reopened', 'acknowledged', 'snoozed', 'resolved', 'assigned')),
  constraint operational_signal_events_note_size_check
    check (note is null or length(note) <= 1000),
  constraint operational_signal_events_tenant_id_id_unique unique (tenant_id, id)
);

create index operational_signal_states_work_queue_idx
  on public.operational_signal_states (tenant_id, status, snoozed_until, updated_at desc);
create index operational_signal_states_assignee_idx
  on public.operational_signal_states (tenant_id, assigned_to_user_id, status);
create index operational_signal_events_timeline_idx
  on public.operational_signal_events (tenant_id, signal_state_id, occurred_at desc);

create trigger operational_signal_states_set_updated_at
  before update on public.operational_signal_states
  for each row execute function app_private.set_updated_at();

grant select, insert, update, delete on public.operational_signal_states to authenticated;
grant select, insert on public.operational_signal_events to authenticated;
grant all on public.operational_signal_states to service_role;
grant all on public.operational_signal_events to service_role;

alter table public.operational_signal_states enable row level security;
alter table public.operational_signal_states force row level security;
alter table public.operational_signal_events enable row level security;
alter table public.operational_signal_events force row level security;

create policy "Tenant admins manage operational signal states"
  on public.operational_signal_states for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant admins read operational signal events"
  on public.operational_signal_events for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant admins create operational signal events"
  on public.operational_signal_events for insert to authenticated
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
