alter table public.placement_suggestions
  add column if not exists assistant_mode text not null default 'candidate_to_groups',
  add column if not exists suggested_action text not null default 'offer_slot',
  add column if not exists match_reasons jsonb not null default '[]'::jsonb,
  add column if not exists match_blockers jsonb not null default '[]'::jsonb,
  add column if not exists match_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists start_date date,
  add column if not exists batch_id uuid,
  add column if not exists reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists override_reason text,
  add column if not exists assistant_metadata jsonb not null default '{}'::jsonb;

alter table public.placement_suggestions
  add constraint placement_suggestions_assistant_mode_check check (assistant_mode in ('candidate_to_groups', 'group_to_candidates', 'manual')),
  add constraint placement_suggestions_suggested_action_check check (suggested_action in ('offer_slot', 'request_more_info', 'keep_waiting', 'manual_review')),
  add constraint placement_suggestions_match_reasons_check check (jsonb_typeof(match_reasons) = 'array'),
  add constraint placement_suggestions_match_blockers_check check (jsonb_typeof(match_blockers) = 'array'),
  add constraint placement_suggestions_match_snapshot_check check (jsonb_typeof(match_snapshot) = 'object'),
  add constraint placement_suggestions_assistant_metadata_check check (jsonb_typeof(assistant_metadata) = 'object'),
  add constraint placement_suggestions_override_reason_check check (status <> 'rejected' or override_reason is null or nullif(trim(override_reason), '') is not null);

create table public.placement_suggestion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  placement_suggestion_id uuid not null references public.placement_suggestions (id) on delete cascade,
  event_type text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint placement_suggestion_events_suggestion_tenant_fk foreign key (placement_suggestion_id, tenant_id) references public.placement_suggestions (id, tenant_id) on delete cascade,
  constraint placement_suggestion_events_type_check check (event_type in (
    'created',
    'batch_created',
    'approved',
    'rejected',
    'overridden',
    'offer_sent',
    'request_more_info',
    'keep_waiting',
    'manual_review'
  )),
  constraint placement_suggestion_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index placement_suggestions_assistant_idx
  on public.placement_suggestions (tenant_id, assistant_mode, suggested_action, score desc, created_at desc);

create index placement_suggestions_batch_idx
  on public.placement_suggestions (tenant_id, batch_id, created_at desc)
  where batch_id is not null;

create index placement_suggestion_events_suggestion_created_idx
  on public.placement_suggestion_events (tenant_id, placement_suggestion_id, created_at desc);

create index placement_suggestion_events_type_created_idx
  on public.placement_suggestion_events (tenant_id, event_type, created_at desc);

drop trigger if exists placement_suggestion_events_audit_events on public.placement_suggestion_events;
create trigger placement_suggestion_events_audit_events
  after insert or update or delete on public.placement_suggestion_events
  for each row execute function app_private.record_audit_event();

grant select, insert, update on public.placement_suggestion_events to authenticated;
grant all on public.placement_suggestion_events to service_role;

alter table public.placement_suggestion_events enable row level security;

create policy "Tenant staff can view placement suggestion events"
  on public.placement_suggestion_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert placement suggestion events"
  on public.placement_suggestion_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update placement suggestion events"
  on public.placement_suggestion_events
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
  'placement',
  'semi_automatic',
  'placement-v2',
  '{
    "program_match": 20,
    "stage_match": 20,
    "preferred_day_fit": 12,
    "preferred_time_fit": 10,
    "capacity_availability": 18,
    "resource_availability": 6,
    "instructor_availability": 6,
    "waitlist_priority": 15,
    "start_date_fit": 5,
    "blockers": -30
  }'::jsonb,
  '{"offer_slot":75,"manual_review":50,"request_more_info":35}'::jsonb,
  '{"suggestion_stale_days":14}'::jsonb,
  '{"capacity_hold_days":14}'::jsonb,
  '{"notify_admin_on_blocker":true,"notify_parent_on_suggestion":false}'::jsonb,
  '{"source":"phase_s4_placement_assistant_2"}'::jsonb,
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

update public.placement_suggestions suggestion
set assistant_mode = coalesce(nullif(suggestion.assistant_mode, ''), 'candidate_to_groups'),
    suggested_action = case
      when suggestion.status in ('suggested', 'approved', 'offered', 'placed') and suggestion.score >= 70 then 'offer_slot'
      when suggestion.score >= 45 then 'manual_review'
      else 'keep_waiting'
    end,
    match_reasons = case
      when jsonb_array_length(suggestion.match_reasons) > 0 then suggestion.match_reasons
      else jsonb_build_array(
        jsonb_build_object('code', 'legacy_score', 'label', 'Bestaande score', 'detail', coalesce(suggestion.rationale, 'Historisch plaatsingsvoorstel.'), 'weight', suggestion.score)
      )
    end,
    match_blockers = case
      when jsonb_array_length(suggestion.match_blockers) > 0 then suggestion.match_blockers
      else coalesce(suggestion.capacity_snapshot->'blockers', '[]'::jsonb)
    end,
    match_snapshot = case
      when suggestion.match_snapshot <> '{}'::jsonb then suggestion.match_snapshot
      else jsonb_build_object(
        'rule_version', 'placement-v2',
        'backfilled', true,
        'capacity_snapshot', suggestion.capacity_snapshot,
        'score', suggestion.score
      )
    end,
    assistant_metadata = suggestion.assistant_metadata || jsonb_build_object('backfilled_phase', 's4')
where suggestion.created_at is not null;

insert into public.placement_suggestion_events (
  tenant_id,
  placement_suggestion_id,
  event_type,
  note,
  metadata
)
select
  suggestion.tenant_id,
  suggestion.id,
  'created',
  'Historisch plaatsingsvoorstel opgenomen in Placement Assistant 2.0.',
  jsonb_build_object('score', suggestion.score, 'rule_version', 'placement-v2', 'source', 'phase_s4_migration')
from public.placement_suggestions suggestion
where not exists (
  select 1
  from public.placement_suggestion_events event
  where event.placement_suggestion_id = suggestion.id
    and event.event_type = 'created'
);
