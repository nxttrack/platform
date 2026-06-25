alter table public.waitlist_entries
  add column if not exists waitlist_score numeric(6,2),
  add column if not exists score_reasons jsonb not null default '[]'::jsonb,
  add column if not exists score_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists smart_decision_id uuid references public.smart_decisions (id) on delete set null,
  add column if not exists admin_priority text not null default 'normal',
  add column if not exists priority_reason text,
  add column if not exists urgency_reason text,
  add column if not exists tenant_reason_code text,
  add column if not exists family_key text,
  add column if not exists sibling_participant_id uuid references public.participants (id) on delete set null,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists last_contact_channel text,
  add column if not exists duplicate_risk text not null default 'unknown',
  add column if not exists reevaluation_requested_at timestamptz,
  add column if not exists evaluated_at timestamptz;

alter table public.waitlist_entries
  add constraint waitlist_entries_score_check check (waitlist_score is null or (waitlist_score >= 0 and waitlist_score <= 100)),
  add constraint waitlist_entries_score_reasons_check check (jsonb_typeof(score_reasons) = 'array'),
  add constraint waitlist_entries_score_snapshot_check check (jsonb_typeof(score_snapshot) = 'object'),
  add constraint waitlist_entries_admin_priority_check check (admin_priority in ('low', 'normal', 'high', 'urgent')),
  add constraint waitlist_entries_priority_reason_check check (admin_priority not in ('high', 'urgent') or nullif(trim(priority_reason), '') is not null),
  add constraint waitlist_entries_duplicate_risk_check check (duplicate_risk in ('unknown', 'none', 'warning', 'blocking')),
  add constraint waitlist_entries_last_contact_channel_check check (last_contact_channel is null or last_contact_channel in ('internal', 'email', 'phone', 'sms', 'whatsapp', 'manual'));

create table public.waitlist_entry_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  waitlist_entry_id uuid not null references public.waitlist_entries (id) on delete cascade,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint waitlist_entry_events_entry_tenant_fk foreign key (waitlist_entry_id, tenant_id) references public.waitlist_entries (id, tenant_id) on delete cascade,
  constraint waitlist_entry_events_type_check check (event_type in (
    'created',
    'scored',
    'priority_updated',
    'status_changed',
    'contacted',
    'reevaluation_requested',
    'placement_suggested',
    'placement_rejected',
    'slot_offered',
    'placed',
    'cancelled'
  )),
  constraint waitlist_entry_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index waitlist_entries_rank_idx
  on public.waitlist_entries (tenant_id, status, waitlist_score desc, priority_date asc, created_at asc);

create index waitlist_entries_filter_idx
  on public.waitlist_entries (tenant_id, program_id, recommended_stage_id, status, admin_priority, duplicate_risk);

create index waitlist_entries_preferred_days_gin_idx
  on public.waitlist_entries using gin (preferred_days);

create index waitlist_entries_last_contact_idx
  on public.waitlist_entries (tenant_id, last_contacted_at desc nulls last);

create index waitlist_entries_reevaluation_idx
  on public.waitlist_entries (tenant_id, reevaluation_requested_at desc nulls last)
  where reevaluation_requested_at is not null;

create index waitlist_entry_events_entry_created_idx
  on public.waitlist_entry_events (tenant_id, waitlist_entry_id, created_at desc);

create index waitlist_entry_events_type_created_idx
  on public.waitlist_entry_events (tenant_id, event_type, created_at desc);

drop trigger if exists waitlist_entry_events_audit_events on public.waitlist_entry_events;
create trigger waitlist_entry_events_audit_events
  after insert or update or delete on public.waitlist_entry_events
  for each row execute function app_private.record_audit_event();

grant select, insert, update on public.waitlist_entry_events to authenticated;
grant all on public.waitlist_entry_events to service_role;

alter table public.waitlist_entry_events enable row level security;

create policy "Tenant staff can view waitlist entry events"
  on public.waitlist_entry_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert waitlist entry events"
  on public.waitlist_entry_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update waitlist entry events"
  on public.waitlist_entry_events
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

insert into public.tenant_smart_engine_settings (
  tenant_id,
  engine_key,
  mode,
  rule_version,
  weights,
  thresholds,
  expiry_settings,
  hold_settings,
  notification_settings,
  metadata,
  status
)
select
  tenant.id,
  'waitlist',
  'semi_automatic',
  'waitlist-v1',
  '{
    "priority_date": 30,
    "stage_match": 20,
    "preferred_day_match": 15,
    "preferred_time_match": 10,
    "family_policy": 8,
    "registration_preference": 7,
    "admin_priority": 18,
    "tenant_urgency": 5,
    "duplicate_safety": 4
  }'::jsonb,
  '{"high_confidence":80,"review":55,"blocking_duplicate_penalty":15}'::jsonb,
  '{"stale_contact_days":30,"reevaluation_window_minutes":5}'::jsonb,
  '{"capacity_hold_days":14}'::jsonb,
  '{"notify_admin_on_high_priority":true,"notify_parent_on_rank_change":false}'::jsonb,
  '{"source":"phase_s3_smart_waitlist"}'::jsonb,
  'active'
from public.tenants tenant
on conflict (tenant_id, engine_key) do update
  set rule_version = excluded.rule_version,
      weights = excluded.weights,
      thresholds = excluded.thresholds,
      expiry_settings = excluded.expiry_settings,
      hold_settings = excluded.hold_settings,
      notification_settings = excluded.notification_settings,
      metadata = public.tenant_smart_engine_settings.metadata || excluded.metadata,
      updated_at = now();

update public.waitlist_entries entry
set duplicate_risk = case
      when exists (
        select 1
        from public.intake_duplicate_matches match
        where match.tenant_id = entry.tenant_id
          and match.intake_submission_id = entry.intake_submission_id
          and match.status = 'open'
          and match.severity = 'blocking'
      ) then 'blocking'
      when exists (
        select 1
        from public.intake_duplicate_matches match
        where match.tenant_id = entry.tenant_id
          and match.intake_submission_id = entry.intake_submission_id
          and match.status = 'open'
      ) then 'warning'
      when entry.intake_submission_id is not null then 'none'
      else 'unknown'
    end,
    waitlist_score = least(
      100,
      greatest(
        0,
        35
        + least(30, greatest(0, (current_date - entry.priority_date::date)))
        + case when entry.recommended_stage_id is not null then 10 else 0 end
        + case when coalesce(array_length(entry.preferred_days, 1), 0) > 0 then 8 else 0 end
        + case when coalesce(array_length(entry.preferred_time_windows, 1), 0) > 0 then 5 else 0 end
        + case when entry.source = 'manual' then 4 else 0 end
        - case
            when exists (
              select 1
              from public.intake_duplicate_matches match
              where match.tenant_id = entry.tenant_id
                and match.intake_submission_id = entry.intake_submission_id
                and match.status = 'open'
                and match.severity = 'blocking'
            ) then 15
            when exists (
              select 1
              from public.intake_duplicate_matches match
              where match.tenant_id = entry.tenant_id
                and match.intake_submission_id = entry.intake_submission_id
                and match.status = 'open'
            ) then 6
            else 0
          end
      )
    ),
    score_reasons = jsonb_build_array(
      jsonb_build_object('code', 'priority_date', 'label', 'Prioriteitsdatum', 'detail', 'Oudere aanmeldingen krijgen eerlijkheidsgewicht.', 'weight', least(30, greatest(0, (current_date - entry.priority_date::date)))),
      jsonb_build_object('code', 'stage_signal', 'label', 'Niveau bekend', 'detail', case when entry.recommended_stage_id is null then 'Nog geen aanbevolen niveau.' else 'Er is een aanbevolen niveau bekend.' end, 'weight', case when entry.recommended_stage_id is null then 0 else 10 end),
      jsonb_build_object('code', 'preference_signal', 'label', 'Voorkeuren', 'detail', 'Dag- en tijdvoorkeuren zijn meegenomen voor matching.', 'weight', coalesce(array_length(entry.preferred_days, 1), 0) + coalesce(array_length(entry.preferred_time_windows, 1), 0))
    ),
    score_snapshot = jsonb_build_object(
      'rule_version', 'waitlist-v1',
      'priority_date', entry.priority_date,
      'preferred_days', entry.preferred_days,
      'preferred_time_windows', entry.preferred_time_windows,
      'source', entry.source,
      'backfilled', true
    ),
    evaluated_at = coalesce(entry.evaluated_at, now())
where entry.waitlist_score is null;

insert into public.waitlist_entry_events (
  tenant_id,
  waitlist_entry_id,
  event_type,
  note,
  metadata
)
select
  entry.tenant_id,
  entry.id,
  'scored',
  'Wachtlijstscore gebackfilled met waitlist-v1.',
  jsonb_build_object('score', entry.waitlist_score, 'rule_version', 'waitlist-v1', 'source', 'phase_s3_migration')
from public.waitlist_entries entry
where entry.waitlist_score is not null
  and not exists (
    select 1
    from public.waitlist_entry_events event
    where event.waitlist_entry_id = entry.id
      and event.event_type = 'scored'
  );

create or replace function app_private.request_waitlist_reevaluation_for_group_capacity()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and (
      old.capacity is distinct from new.capacity
      or old.reserved_spots is distinct from new.reserved_spots
      or old.trial_spots is distinct from new.trial_spots
      or old.makeup_spots is distinct from new.makeup_spots
      or old.overbooking_policy is distinct from new.overbooking_policy
      or old.status is distinct from new.status
      or old.program_id is distinct from new.program_id
      or old.stage_id is distinct from new.stage_id
      or old.weekday is distinct from new.weekday
      or old.starts_at is distinct from new.starts_at
      or old.ends_at is distinct from new.ends_at
    )
  then
    update public.waitlist_entries entry
      set reevaluation_requested_at = now()
    where entry.tenant_id = new.tenant_id
      and entry.program_id = new.program_id
      and (entry.recommended_stage_id is null or entry.recommended_stage_id = new.stage_id)
      and entry.status in ('queued', 'matched');

    insert into public.waitlist_entry_events (
      tenant_id,
      waitlist_entry_id,
      event_type,
      note,
      metadata
    )
    select
      entry.tenant_id,
      entry.id,
      'reevaluation_requested',
      'Groepscapaciteit of planning is gewijzigd; kandidaat moet opnieuw beoordeeld worden.',
      jsonb_build_object(
        'group_id', new.id,
        'program_id', new.program_id,
        'stage_id', new.stage_id,
        'old_capacity', old.capacity,
        'new_capacity', new.capacity
      )
    from public.waitlist_entries entry
    where entry.tenant_id = new.tenant_id
      and entry.program_id = new.program_id
      and (entry.recommended_stage_id is null or entry.recommended_stage_id = new.stage_id)
      and entry.status in ('queued', 'matched')
      and not exists (
        select 1
        from public.waitlist_entry_events event
        where event.waitlist_entry_id = entry.id
          and event.event_type = 'reevaluation_requested'
          and event.created_at > now() - interval '5 minutes'
      );
  end if;

  return new;
end $$;

revoke all on function app_private.request_waitlist_reevaluation_for_group_capacity() from public;
grant execute on function app_private.request_waitlist_reevaluation_for_group_capacity() to service_role;

drop trigger if exists groups_waitlist_reevaluation on public.groups;
create trigger groups_waitlist_reevaluation
  after update of capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, status, program_id, stage_id, weekday, starts_at, ends_at on public.groups
  for each row execute function app_private.request_waitlist_reevaluation_for_group_capacity();
