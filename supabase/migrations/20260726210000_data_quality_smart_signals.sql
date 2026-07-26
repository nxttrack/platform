-- Tenant-scoped data quality assistant and append-only smart event backbone.

create table public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  issue_type text not null,
  fingerprint text not null,
  severity text not null,
  title text not null,
  description text not null,
  suggested_action text not null,
  status text not null default 'open',
  detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by_user_id uuid references auth.users (id) on delete set null,
  ignored_at timestamptz,
  ignored_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'data_quality_assistant',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_quality_issues_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint data_quality_issues_status_check check (status in ('open', 'ignored', 'resolved', 'auto_resolved')),
  constraint data_quality_issues_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint data_quality_issues_resolution_check check (
    (status in ('resolved', 'auto_resolved') and resolved_at is not null)
    or (status not in ('resolved', 'auto_resolved') and resolved_at is null)
  ),
  constraint data_quality_issues_ignored_check check (
    (status = 'ignored' and ignored_at is not null)
    or (status <> 'ignored' and ignored_at is null)
  ),
  constraint data_quality_issues_tenant_id_id_unique unique (tenant_id, id),
  constraint data_quality_issues_tenant_fingerprint_unique unique (tenant_id, fingerprint)
);

create table public.smart_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  participant_id uuid,
  guardian_id uuid,
  group_id uuid,
  program_id uuid,
  stage_id uuid,
  severity text not null default 'info',
  occurred_at timestamptz not null default now(),
  source text not null,
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  dedupe_key text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint smart_events_event_type_check check (
    event_type in (
      'intake_received',
      'intake_needs_review',
      'waitlist_entry_created',
      'waitlist_entry_eligible',
      'slot_offer_sent',
      'slot_offer_expiring',
      'slot_offer_expired',
      'placement_completed',
      'group_capacity_full',
      'group_capacity_available',
      'participant_absent',
      'participant_no_show',
      'payment_failed',
      'payment_overdue',
      'progress_updated',
      'stage_completed',
      'stage_transfer_needed',
      'afzwem_ready',
      'certificate_issued',
      'data_quality_issue_created'
    )
  ),
  constraint smart_events_severity_check check (severity in ('info', 'warning', 'error', 'critical')),
  constraint smart_events_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint smart_events_test_marker_check check (journey_run_id is null or is_test),
  constraint smart_events_tenant_id_id_unique unique (tenant_id, id),
  constraint smart_events_tenant_dedupe_unique unique (tenant_id, dedupe_key)
);

create table public.smart_signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  signal_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  score numeric(8, 3),
  status text not null,
  reasons_json jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint smart_signal_snapshots_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint smart_signal_snapshots_tenant_id_id_unique unique (tenant_id, id),
  constraint smart_signal_snapshots_scope_unique unique (tenant_id, signal_type, entity_type, entity_id)
);

alter table public.tenant_tasks
  add column data_quality_issue_id uuid,
  add constraint tenant_tasks_data_quality_issue_fk
    foreign key (tenant_id, data_quality_issue_id)
    references public.data_quality_issues (tenant_id, id)
    on delete set null (data_quality_issue_id);

alter table public.tenant_events
  drop constraint tenant_events_event_type_check,
  add constraint tenant_events_event_type_check check (
    event_type in ('intake.received', 'intake.duplicate_confirmed', 'intake.duplicate_dismissed')
  );

create index data_quality_issues_status_idx
  on public.data_quality_issues (tenant_id, status, severity, last_detected_at desc);
create index data_quality_issues_entity_idx
  on public.data_quality_issues (tenant_id, entity_type, entity_id, status);
create index data_quality_issues_journey_idx
  on public.data_quality_issues (tenant_id, journey_run_id)
  where is_test;
create index smart_events_type_idx
  on public.smart_events (tenant_id, event_type, occurred_at desc);
create index smart_events_entity_idx
  on public.smart_events (tenant_id, entity_type, entity_id, occurred_at desc);
create index smart_events_participant_idx
  on public.smart_events (tenant_id, participant_id, occurred_at desc)
  where participant_id is not null;
create index smart_events_group_idx
  on public.smart_events (tenant_id, group_id, occurred_at desc)
  where group_id is not null;
create index smart_events_journey_idx
  on public.smart_events (tenant_id, journey_run_id, occurred_at desc)
  where is_test;
create index smart_signal_snapshots_status_idx
  on public.smart_signal_snapshots (tenant_id, signal_type, status, computed_at desc);
create index smart_signal_snapshots_expiry_idx
  on public.smart_signal_snapshots (tenant_id, expires_at)
  where expires_at is not null;
create index tenant_tasks_data_quality_issue_idx
  on public.tenant_tasks (tenant_id, data_quality_issue_id)
  where data_quality_issue_id is not null;

create trigger data_quality_issues_set_updated_at
  before update on public.data_quality_issues
  for each row execute function app_private.set_updated_at();
create trigger smart_signal_snapshots_set_updated_at
  before update on public.smart_signal_snapshots
  for each row execute function app_private.set_updated_at();

grant select on public.data_quality_issues to authenticated;
grant select on public.smart_events to authenticated;
grant select on public.smart_signal_snapshots to authenticated;
grant all on public.data_quality_issues to service_role;
grant all on public.smart_events to service_role;
grant all on public.smart_signal_snapshots to service_role;

alter table public.data_quality_issues enable row level security;
alter table public.smart_events enable row level security;
alter table public.smart_signal_snapshots enable row level security;
alter table public.data_quality_issues force row level security;
alter table public.smart_events force row level security;
alter table public.smart_signal_snapshots force row level security;

create policy "Tenant staff can view data quality issues"
  on public.data_quality_issues
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view smart events"
  on public.smart_events
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Tenant staff can view smart signal snapshots"
  on public.smart_signal_snapshots
  for select
  to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

comment on table public.data_quality_issues is
  'Explainable, tenant-scoped findings. Source records are never changed automatically.';
comment on table public.smart_events is
  'Append-only domain signals for explainable product intelligence; this table does not dispatch notifications.';
comment on table public.smart_signal_snapshots is
  'Mutable current-state signals used to deduplicate transition events.';

create or replace function app_private.reject_smart_event_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'smart_events are append-only and cannot be updated.';
end
$$;

revoke all on function app_private.reject_smart_event_update() from public;
revoke all on function app_private.reject_smart_event_update() from anon;
revoke all on function app_private.reject_smart_event_update() from authenticated;

create trigger smart_events_reject_update
  before update on public.smart_events
  for each row execute function app_private.reject_smart_event_update();

create or replace function app_private.record_smart_event(
  target_tenant_id uuid,
  target_event_type text,
  target_entity_type text,
  target_entity_id uuid,
  target_participant_id uuid default null,
  target_guardian_id uuid default null,
  target_group_id uuid default null,
  target_program_id uuid default null,
  target_stage_id uuid default null,
  target_severity text default 'info',
  target_source text default 'database_trigger',
  target_is_test boolean default false,
  target_journey_run_id uuid default null,
  target_dedupe_key text default null,
  target_metadata_json jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_id uuid;
begin
  insert into public.smart_events (
    tenant_id,
    event_type,
    entity_type,
    entity_id,
    participant_id,
    guardian_id,
    group_id,
    program_id,
    stage_id,
    severity,
    source,
    is_test,
    journey_run_id,
    dedupe_key,
    metadata_json
  )
  values (
    target_tenant_id,
    target_event_type,
    target_entity_type,
    target_entity_id,
    target_participant_id,
    target_guardian_id,
    target_group_id,
    target_program_id,
    target_stage_id,
    target_severity,
    target_source,
    target_is_test,
    case when target_is_test then target_journey_run_id else null end,
    target_dedupe_key,
    coalesce(target_metadata_json, '{}'::jsonb)
  )
  on conflict (tenant_id, dedupe_key) do nothing
  returning id into inserted_id;

  return inserted_id;
end
$$;

revoke all on function app_private.record_smart_event(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean, uuid, text, jsonb
) from public;
revoke all on function app_private.record_smart_event(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean, uuid, text, jsonb
) from anon;
revoke all on function app_private.record_smart_event(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean, uuid, text, jsonb
) from authenticated;
grant execute on function app_private.record_smart_event(
  uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, boolean, uuid, text, jsonb
) to service_role;

create or replace function app_private.capture_domain_smart_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_record jsonb := to_jsonb(new);
  previous_record jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  record_source text := coalesce(nullif(current_record ->> 'source', ''), 'database_trigger');
  record_is_test boolean := coalesce((current_record ->> 'is_test')::boolean, false);
  record_journey_run_id uuid := nullif(current_record ->> 'journey_run_id', '')::uuid;
  record_participant_id uuid := nullif(current_record ->> 'participant_id', '')::uuid;
  related_is_test boolean;
  related_source text;
  related_journey_run_id uuid;
begin
  case tg_table_name
    when 'intake_submissions' then
      if tg_op = 'INSERT' then
        perform app_private.record_smart_event(
          new.tenant_id, 'intake_received', 'intake_submission', new.id,
          null, null, null, new.program_id, null, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('status', new.status, 'duplicate_state', new.duplicate_state)
        );
      end if;
      if (new.status = 'reviewing' or new.duplicate_state = 'possible_duplicate')
        and (
          tg_op = 'INSERT'
          or previous_record ->> 'status' is distinct from new.status
          or previous_record ->> 'duplicate_state' is distinct from new.duplicate_state
        ) then
        perform app_private.record_smart_event(
          new.tenant_id, 'intake_needs_review', 'intake_submission', new.id,
          null, null, null, new.program_id, null, 'warning', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object(
            'status', new.status,
            'duplicate_state', new.duplicate_state,
            'reason',
              case
                when new.duplicate_state = 'possible_duplicate'
                  then 'De intake lijkt op een bestaande aanvraag en vraagt menselijke beoordeling.'
                else 'De intake is gemarkeerd voor menselijke beoordeling.'
              end
          )
        );
      end if;

    when 'waitlist_entries' then
      if tg_op = 'INSERT' then
        perform app_private.record_smart_event(
          new.tenant_id, 'waitlist_entry_created', 'waitlist_entry', new.id,
          null, null, null, new.program_id, new.recommended_stage_id, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('status', new.status)
        );
      end if;
      if new.status in ('waiting', 'reviewing')
        and not new.minimum_age_blocked
        and new.recommended_stage_id is not null
        and (
          tg_op = 'INSERT'
          or previous_record ->> 'status' is distinct from new.status
          or previous_record ->> 'minimum_age_blocked' is distinct from 'false'
          or previous_record ->> 'recommended_stage_id' is distinct from new.recommended_stage_id::text
        ) then
        perform app_private.record_smart_event(
          new.tenant_id, 'waitlist_entry_eligible', 'waitlist_entry', new.id,
          null, null, null, new.program_id, new.recommended_stage_id, 'info', record_source,
          record_is_test, record_journey_run_id,
          format('waitlist-eligible:%s:%s', new.id, new.recommended_stage_id),
          jsonb_build_object('status', new.status, 'reason', 'Programma, niveau en minimumleeftijd zijn beschikbaar.')
        );
      end if;

    when 'slot_offers' then
      select entry.is_test, entry.source, entry.journey_run_id
      into related_is_test, related_source, related_journey_run_id
      from public.waitlist_entries entry
      where entry.tenant_id = new.tenant_id and entry.id = new.waitlist_entry_id;
      record_is_test := coalesce(related_is_test, false);
      record_source := coalesce(related_source, 'placement');
      record_journey_run_id := related_journey_run_id;

      if new.status = 'sent'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'slot_offer_sent', 'slot_offer', new.id,
          null, null, new.group_id, null, null, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('waitlist_entry_id', new.waitlist_entry_id, 'delivery_status', new.delivery_status, 'expires_at', new.expires_at)
        );
      elsif new.status = 'expired'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'slot_offer_expired', 'slot_offer', new.id,
          null, null, new.group_id, null, null, 'warning', record_source,
          record_is_test, record_journey_run_id,
          format('slot-offer-expired:%s', new.id),
          jsonb_build_object('waitlist_entry_id', new.waitlist_entry_id, 'expired_at', now())
        );
      elsif new.status = 'accepted'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'placement_completed', 'slot_offer', new.id,
          new.accepted_participant_id, null, new.group_id, null, null, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object(
            'waitlist_entry_id', new.waitlist_entry_id,
            'enrollment_id', new.accepted_enrollment_id,
            'group_membership_id', new.accepted_group_membership_id
          )
        );
      end if;

    when 'session_attendance' then
      if new.status = 'absent'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'participant_absent', 'session_attendance', new.id,
          new.participant_id, null, null, null, null, 'warning', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('session_id', new.session_id, 'enrollment_id', new.enrollment_id, 'status', new.status)
        );
      end if;

    when 'graduation_event_participants' then
      if new.status = 'no_show'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'participant_no_show', 'graduation_event_participant', new.id,
          new.participant_id, null, null, null, null, 'warning', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('graduation_event_id', new.event_id, 'status', new.status)
        );
      end if;

    when 'payment_sessions' then
      select participant.is_test, participant.source, participant.journey_run_id
      into related_is_test, related_source, related_journey_run_id
      from public.participants participant
      where participant.tenant_id = new.tenant_id and participant.id = new.participant_id;
      if new.status = 'failed'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'payment_failed', 'payment_session', new.id,
          new.participant_id, new.guardian_user_id, null, null, null, 'error',
          coalesce(related_source, 'billing'), coalesce(related_is_test, false), related_journey_run_id, null,
          jsonb_build_object(
            'manual_payment_id', new.manual_payment_id,
            'subscription_id', new.subscription_id,
            'failure_code', new.failure_code
          )
        );
      end if;

    when 'manual_payments' then
      select participant.is_test, participant.source, participant.journey_run_id
      into related_is_test, related_source, related_journey_run_id
      from public.participants participant
      where participant.tenant_id = new.tenant_id and participant.id = new.participant_id;
      if new.status = 'overdue'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'payment_overdue', 'manual_payment', new.id,
          new.participant_id, new.guardian_user_id, null, null, null, 'warning',
          coalesce(related_source, 'billing'), coalesce(related_is_test, false), related_journey_run_id,
          format('payment-overdue:%s', new.id),
          jsonb_build_object('subscription_id', new.subscription_id, 'due_on', new.due_on, 'status', new.status)
        );
      end if;

    when 'participant_progress_scores' then
      if tg_op = 'INSERT'
        or previous_record ->> 'score' is distinct from new.score::text
        or previous_record ->> 'status' is distinct from new.status then
        perform app_private.record_smart_event(
          new.tenant_id, 'progress_updated', 'progress_score', new.id,
          new.participant_id, null, null, null, null, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('enrollment_id', new.enrollment_id, 'session_id', new.session_id, 'score', new.score, 'status', new.status)
        );
      end if;

    when 'graduation_readiness' then
      if new.status = 'ready'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'afzwem_ready', 'graduation_readiness', new.id,
          new.participant_id, null, null, new.program_id, new.stage_id, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('enrollment_id', new.enrollment_id, 'readiness_score', new.readiness_score, 'reason', 'De readiness is door een medewerker op klaar gezet.')
        );
      elsif new.status = 'completed'
        and (tg_op = 'INSERT' or previous_record ->> 'status' is distinct from new.status) then
        perform app_private.record_smart_event(
          new.tenant_id, 'stage_completed', 'graduation_readiness', new.id,
          new.participant_id, null, null, new.program_id, new.stage_id, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('enrollment_id', new.enrollment_id, 'status', new.status)
        );
        perform app_private.record_smart_event(
          new.tenant_id, 'stage_transfer_needed', 'enrollment', new.enrollment_id,
          new.participant_id, null, null, new.program_id, new.stage_id, 'warning', record_source,
          record_is_test, record_journey_run_id,
          format('stage-transfer-needed:%s:%s', new.enrollment_id, new.stage_id),
          jsonb_build_object('completed_stage_id', new.stage_id, 'reason', 'Het niveau is afgerond; een medewerker moet de vervolgstap beoordelen.')
        );
      end if;

    when 'certificate_records' then
      if tg_op = 'INSERT' and new.status = 'issued' then
        perform app_private.record_smart_event(
          new.tenant_id, 'certificate_issued', 'certificate', new.id,
          new.participant_id, null, null, new.program_id, new.stage_id, 'info', record_source,
          record_is_test, record_journey_run_id, null,
          jsonb_build_object('enrollment_id', new.enrollment_id, 'issued_on', new.issued_on, 'status', new.status)
        );
      end if;
  end case;

  return new;
end
$$;

revoke all on function app_private.capture_domain_smart_event() from public;
revoke all on function app_private.capture_domain_smart_event() from anon;
revoke all on function app_private.capture_domain_smart_event() from authenticated;
grant execute on function app_private.capture_domain_smart_event() to service_role;

create trigger intake_submissions_capture_smart_event
  after insert or update on public.intake_submissions
  for each row execute function app_private.capture_domain_smart_event();
create trigger waitlist_entries_capture_smart_event
  after insert or update on public.waitlist_entries
  for each row execute function app_private.capture_domain_smart_event();
create trigger slot_offers_capture_smart_event
  after insert or update on public.slot_offers
  for each row execute function app_private.capture_domain_smart_event();
create trigger session_attendance_capture_smart_event
  after insert or update on public.session_attendance
  for each row execute function app_private.capture_domain_smart_event();
create trigger graduation_event_participants_capture_smart_event
  after insert or update on public.graduation_event_participants
  for each row execute function app_private.capture_domain_smart_event();
create trigger payment_sessions_capture_smart_event
  after insert or update on public.payment_sessions
  for each row execute function app_private.capture_domain_smart_event();
create trigger manual_payments_capture_smart_event
  after insert or update on public.manual_payments
  for each row execute function app_private.capture_domain_smart_event();
create trigger participant_progress_scores_capture_smart_event
  after insert or update on public.participant_progress_scores
  for each row execute function app_private.capture_domain_smart_event();
create trigger graduation_readiness_capture_smart_event
  after insert or update on public.graduation_readiness
  for each row execute function app_private.capture_domain_smart_event();
create trigger certificate_records_capture_smart_event
  after insert or update on public.certificate_records
  for each row execute function app_private.capture_domain_smart_event();

create or replace function app_private.refresh_group_capacity_signal(
  target_tenant_id uuid,
  target_group_id uuid,
  target_is_test boolean default false,
  target_journey_run_id uuid default null,
  target_source text default 'planning'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  group_capacity numeric;
  used_capacity numeric;
  previous_status text;
  next_status text;
begin
  select capacity
  into group_capacity
  from public.groups
  where tenant_id = target_tenant_id and id = target_group_id;

  if group_capacity is null then
    return;
  end if;

  select coalesce(sum(capacity_weight), 0)
  into used_capacity
  from public.group_memberships
  where tenant_id = target_tenant_id
    and group_id = target_group_id
    and status in ('active', 'trial');

  next_status := case when used_capacity >= group_capacity then 'full' else 'available' end;

  select status
  into previous_status
  from public.smart_signal_snapshots
  where tenant_id = target_tenant_id
    and signal_type = 'group_capacity'
    and entity_type = 'group'
    and entity_id = target_group_id;

  insert into public.smart_signal_snapshots (
    tenant_id, signal_type, entity_type, entity_id, score, status, reasons_json, computed_at
  )
  values (
    target_tenant_id,
    'group_capacity',
    'group',
    target_group_id,
    case when group_capacity = 0 then 1 else used_capacity / group_capacity end,
    next_status,
    jsonb_build_array(
      jsonb_build_object('used', used_capacity, 'capacity', group_capacity)
    ),
    now()
  )
  on conflict (tenant_id, signal_type, entity_type, entity_id)
  do update set
    score = excluded.score,
    status = excluded.status,
    reasons_json = excluded.reasons_json,
    computed_at = excluded.computed_at;

  if previous_status is distinct from next_status then
    perform app_private.record_smart_event(
      target_tenant_id,
      case when next_status = 'full' then 'group_capacity_full' else 'group_capacity_available' end,
      'group',
      target_group_id,
      null,
      null,
      target_group_id,
      null,
      null,
      case when next_status = 'full' then 'warning' else 'info' end,
      target_source,
      target_is_test,
      target_journey_run_id,
      null,
      jsonb_build_object(
        'used', used_capacity,
        'capacity', group_capacity,
        'previous_status', previous_status,
        'status', next_status
      )
    );
  end if;
end
$$;

revoke all on function app_private.refresh_group_capacity_signal(uuid, uuid, boolean, uuid, text) from public;
revoke all on function app_private.refresh_group_capacity_signal(uuid, uuid, boolean, uuid, text) from anon;
revoke all on function app_private.refresh_group_capacity_signal(uuid, uuid, boolean, uuid, text) from authenticated;
grant execute on function app_private.refresh_group_capacity_signal(uuid, uuid, boolean, uuid, text) to service_role;

create or replace function app_private.capture_group_capacity_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.source <> 'journey_simulation_bot' then
      perform app_private.refresh_group_capacity_signal(
        old.tenant_id, old.group_id, old.is_test, old.journey_run_id, old.source
      );
    end if;
    return old;
  end if;

  perform app_private.refresh_group_capacity_signal(
    new.tenant_id, new.group_id, new.is_test, new.journey_run_id, new.source
  );

  if tg_op = 'UPDATE' and old.group_id <> new.group_id then
    perform app_private.refresh_group_capacity_signal(
      old.tenant_id, old.group_id, old.is_test, old.journey_run_id, old.source
    );
  end if;

  return new;
end
$$;

revoke all on function app_private.capture_group_capacity_signal() from public;
revoke all on function app_private.capture_group_capacity_signal() from anon;
revoke all on function app_private.capture_group_capacity_signal() from authenticated;
grant execute on function app_private.capture_group_capacity_signal() to service_role;

create trigger group_memberships_capture_capacity_signal
  after insert or update or delete on public.group_memberships
  for each row execute function app_private.capture_group_capacity_signal();

-- Keep the existing fail-closed Journey Bot purge complete for the new marked tables.
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
  deleted_event_count integer;
  deleted_issue_count integer;
  deleted_snapshot_count integer;
  purge_result jsonb;
begin
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
    'smart_events', deleted_event_count,
    'smart_signal_snapshots', deleted_snapshot_count
  )
  where run_id = target_run_id;

  return jsonb_set(
    purge_result,
    '{deleted_counts}',
    coalesce(purge_result -> 'deleted_counts', '{}'::jsonb) || jsonb_build_object(
      'data_quality_issues', deleted_issue_count,
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
