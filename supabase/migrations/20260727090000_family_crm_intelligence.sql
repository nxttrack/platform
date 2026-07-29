-- Family planning, explainable lead intelligence, first-party conversion lineage
-- and a controlled make-up marketplace. All decisions remain human-reviewed.

alter table public.waitlist_entries
  add column if not exists participant_id uuid,
  add column if not exists guardian_user_id uuid references auth.users (id) on delete set null;

alter table public.waitlist_entries
  add constraint waitlist_entries_participant_fk
  foreign key (tenant_id, participant_id)
  references public.participants (tenant_id, id)
  on delete set null (participant_id);

create index waitlist_entries_guardian_idx
  on public.waitlist_entries (tenant_id, guardian_user_id, status);
create index waitlist_entries_participant_idx
  on public.waitlist_entries (tenant_id, participant_id, status);

create table public.participant_schedule_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  weekday integer not null,
  starts_after time,
  ends_before time,
  preference_weight integer not null default 1,
  source text not null default 'manual',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_schedule_preferences_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint participant_schedule_preferences_weekday_check check (weekday between 1 and 7),
  constraint participant_schedule_preferences_time_check
    check (starts_after is null or ends_before is null or starts_after < ends_before),
  constraint participant_schedule_preferences_weight_check check (preference_weight between 1 and 5),
  constraint participant_schedule_preferences_source_check
    check (source in ('manual', 'waitlist', 'import', 'journey_simulation_bot')),
  constraint participant_schedule_preferences_test_marker_check
    check (
      (journey_run_id is null and not is_test and source <> 'journey_simulation_bot')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint participant_schedule_preferences_unique
    unique (tenant_id, participant_id, weekday, starts_after, ends_before),
  constraint participant_schedule_preferences_tenant_id_id_unique unique (tenant_id, id)
);

create table public.guardian_communication_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  guardian_user_id uuid not null references auth.users (id) on delete cascade,
  make_up_in_app_enabled boolean not null default true,
  make_up_email_enabled boolean not null default true,
  automatic_make_up_invites_enabled boolean not null default false,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardian_communication_preferences_unique unique (tenant_id, guardian_user_id),
  constraint guardian_communication_preferences_tenant_id_id_unique unique (tenant_id, id)
);

create table public.makeup_marketplace_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  participant_id uuid not null,
  credit_id uuid not null,
  catch_up_request_id uuid,
  status text not null default 'suggested',
  score numeric(7, 2) not null,
  reasons_json jsonb not null default '[]'::jsonb,
  suggested_action text not null,
  expires_soon boolean not null default false,
  invited_at timestamptz,
  decided_at timestamptz,
  decided_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'makeup_marketplace',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint makeup_marketplace_decisions_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id)
    on delete cascade,
  constraint makeup_marketplace_decisions_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint makeup_marketplace_decisions_credit_fk
    foreign key (tenant_id, credit_id)
    references public.catch_up_credits (tenant_id, id)
    on delete cascade,
  constraint makeup_marketplace_decisions_request_fk
    foreign key (tenant_id, catch_up_request_id)
    references public.catch_up_requests (tenant_id, id)
    on delete set null (catch_up_request_id),
  constraint makeup_marketplace_decisions_status_check
    check (status in ('suggested', 'invited', 'booked', 'ignored', 'expired')),
  constraint makeup_marketplace_decisions_reasons_check
    check (jsonb_typeof(reasons_json) = 'array'),
  constraint makeup_marketplace_decisions_source_check
    check (source in ('makeup_marketplace', 'journey_simulation_bot')),
  constraint makeup_marketplace_decisions_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'makeup_marketplace')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint makeup_marketplace_decisions_unique
    unique (tenant_id, session_id, credit_id),
  constraint makeup_marketplace_decisions_tenant_id_id_unique unique (tenant_id, id)
);

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid not null,
  attribution_channel text not null,
  attribution_source text not null,
  attribution_medium text,
  attribution_campaign text,
  attribution_content text,
  attribution_term text,
  attribution_referrer_host text,
  attribution_landing_path text not null default '/',
  first_seen_at timestamptz,
  analytics_consent text not null default 'unknown',
  analytics_consent_version text,
  source text not null default 'public_intake',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_sources_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint lead_sources_channel_check
    check (attribution_channel in ('direct', 'organic_search', 'paid_search', 'organic_social', 'paid_social', 'email', 'referral', 'campaign')),
  constraint lead_sources_consent_check check (analytics_consent in ('unknown', 'denied', 'granted')),
  constraint lead_sources_landing_check
    check (attribution_landing_path like '/%' and position('?' in attribution_landing_path) = 0 and char_length(attribution_landing_path) <= 300),
  constraint lead_sources_length_check
    check (
      char_length(attribution_source) <= 120
      and (attribution_medium is null or char_length(attribution_medium) <= 120)
      and (attribution_campaign is null or char_length(attribution_campaign) <= 160)
      and (attribution_content is null or char_length(attribution_content) <= 160)
      and (attribution_term is null or char_length(attribution_term) <= 160)
      and (attribution_referrer_host is null or char_length(attribution_referrer_host) <= 255)
    ),
  constraint lead_sources_source_check check (source in ('public_intake', 'journey_simulation_bot')),
  constraint lead_sources_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'public_intake')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint lead_sources_unique_intake unique (tenant_id, intake_submission_id),
  constraint lead_sources_tenant_id_id_unique unique (tenant_id, id)
);

create table public.intake_conversion_lineage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  lead_source_id uuid not null,
  intake_submission_id uuid not null,
  guardian_user_id uuid references auth.users (id) on delete set null,
  participant_id uuid not null,
  enrollment_id uuid not null,
  group_membership_id uuid,
  placement_method text not null,
  placement_evidence_id uuid not null,
  placed_at timestamptz not null,
  source text not null default 'placement',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint intake_conversion_lineage_source_fk
    foreign key (tenant_id, lead_source_id)
    references public.lead_sources (tenant_id, id)
    on delete cascade,
  constraint intake_conversion_lineage_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint intake_conversion_lineage_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint intake_conversion_lineage_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id)
    on delete cascade,
  constraint intake_conversion_lineage_membership_fk
    foreign key (tenant_id, group_membership_id)
    references public.group_memberships (tenant_id, id)
    on delete set null (group_membership_id),
  constraint intake_conversion_lineage_method_check
    check (placement_method in ('slot_offer', 'direct_placement')),
  constraint intake_conversion_lineage_source_check
    check (source in ('placement', 'journey_simulation_bot')),
  constraint intake_conversion_lineage_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'placement')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint intake_conversion_lineage_unique_intake unique (tenant_id, intake_submission_id),
  constraint intake_conversion_lineage_unique_enrollment unique (tenant_id, enrollment_id),
  constraint intake_conversion_lineage_tenant_id_id_unique unique (tenant_id, id)
);

create table public.lead_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid not null,
  score_band text not null,
  score integer not null,
  confidence numeric(5, 4) not null,
  reasons_json jsonb not null default '[]'::jsonb,
  blockers_json jsonb not null default '[]'::jsonb,
  suggested_next_action text not null,
  model_version text not null,
  calculated_at timestamptz not null default now(),
  source text not null default 'lead_scoring',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  constraint lead_score_snapshots_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint lead_score_snapshots_band_check
    check (score_band in ('high', 'average', 'low', 'waiting_for_information', 'not_placeable')),
  constraint lead_score_snapshots_score_check check (score between 0 and 100),
  constraint lead_score_snapshots_confidence_check check (confidence between 0 and 1),
  constraint lead_score_snapshots_reasons_check check (jsonb_typeof(reasons_json) = 'array'),
  constraint lead_score_snapshots_blockers_check check (jsonb_typeof(blockers_json) = 'array'),
  constraint lead_score_snapshots_source_check
    check (source in ('lead_scoring', 'journey_simulation_bot')),
  constraint lead_score_snapshots_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'lead_scoring')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint lead_score_snapshots_unique unique (tenant_id, intake_submission_id, model_version),
  constraint lead_score_snapshots_tenant_id_id_unique unique (tenant_id, id)
);

create table public.crm_follow_up_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid,
  guardian_user_id uuid references auth.users (id) on delete set null,
  participant_id uuid,
  signal_type text not null,
  fingerprint text not null,
  status text not null default 'open',
  reason text not null,
  evidence_json jsonb not null default '[]'::jsonb,
  suggested_action text not null,
  draft_subject text,
  draft_body text,
  human_review_required boolean not null default true,
  content_classification text not null default 'personal',
  classification_reasons jsonb not null default '["crm_personal_draft"]'::jsonb,
  last_contacted_at timestamptz,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'crm_follow_up',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete cascade,
  test_metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_items_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint crm_follow_up_items_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint crm_follow_up_items_signal_check
    check (signal_type in ('intake_unfollowed', 'offer_unanswered', 'trial_unfollowed', 'placeable_uncontacted', 'payment_missing', 'parent_waiting')),
  constraint crm_follow_up_items_status_check check (status in ('open', 'done', 'dismissed')),
  constraint crm_follow_up_items_evidence_check check (jsonb_typeof(evidence_json) = 'array'),
  constraint crm_follow_up_items_human_review_check check (human_review_required),
  constraint crm_follow_up_items_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint crm_follow_up_items_classification_reasons_check
    check (jsonb_typeof(classification_reasons) = 'array'),
  constraint crm_follow_up_items_completion_check
    check ((status = 'done' and completed_at is not null) or status <> 'done'),
  constraint crm_follow_up_items_source_check
    check (source in ('crm_follow_up', 'journey_simulation_bot')),
  constraint crm_follow_up_items_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'crm_follow_up')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint crm_follow_up_items_unique unique (tenant_id, fingerprint),
  constraint crm_follow_up_items_tenant_id_id_unique unique (tenant_id, id)
);

alter table public.tenant_tasks
  add column if not exists intake_submission_id uuid,
  add column if not exists crm_follow_up_item_id uuid,
  add column if not exists is_test boolean not null default false,
  add column if not exists journey_run_id uuid references public.journey_bot_runs (id) on delete cascade;

alter table public.tenant_tasks
  add constraint tenant_tasks_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  add constraint tenant_tasks_crm_follow_up_fk
    foreign key (tenant_id, crm_follow_up_item_id)
    references public.crm_follow_up_items (tenant_id, id)
    on delete cascade,
  add constraint tenant_tasks_test_marker_check
    check (journey_run_id is null or is_test);

alter table public.next_best_actions
  drop constraint next_best_actions_type_check,
  add constraint next_best_actions_type_check check (
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
      'makeup_credit_expiring',
      'attendance_follow_up',
      'progress_bottleneck_review',
      'forecast_capacity_review',
      'lead_follow_up'
    )
  );

create index participant_schedule_preferences_lookup_idx
  on public.participant_schedule_preferences (tenant_id, participant_id, weekday);
create index makeup_marketplace_decisions_session_idx
  on public.makeup_marketplace_decisions (tenant_id, session_id, status, score desc);
create index lead_sources_campaign_idx
  on public.lead_sources (tenant_id, attribution_channel, attribution_source, attribution_medium, attribution_campaign);
create index intake_conversion_lineage_participant_idx
  on public.intake_conversion_lineage (tenant_id, participant_id, placed_at);
create index lead_score_snapshots_intake_idx
  on public.lead_score_snapshots (tenant_id, intake_submission_id, calculated_at desc);
create index crm_follow_up_items_status_idx
  on public.crm_follow_up_items (tenant_id, status, signal_type, created_at);
create index tenant_tasks_intake_idx
  on public.tenant_tasks (tenant_id, intake_submission_id, status);

create trigger participant_schedule_preferences_set_updated_at
  before update on public.participant_schedule_preferences
  for each row execute function app_private.set_updated_at();
create trigger guardian_communication_preferences_set_updated_at
  before update on public.guardian_communication_preferences
  for each row execute function app_private.set_updated_at();
create trigger makeup_marketplace_decisions_set_updated_at
  before update on public.makeup_marketplace_decisions
  for each row execute function app_private.set_updated_at();
create trigger crm_follow_up_items_set_updated_at
  before update on public.crm_follow_up_items
  for each row execute function app_private.set_updated_at();

create or replace function app_private.prevent_lead_source_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = '55000', message = 'lead_source_is_immutable';
end
$$;

create trigger lead_sources_immutable
  before update on public.lead_sources
  for each row execute function app_private.prevent_lead_source_update();

create or replace function app_private.capture_intake_lead_source()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.lead_sources (
    tenant_id, intake_submission_id, attribution_channel, attribution_source,
    attribution_medium, attribution_campaign, attribution_content, attribution_term,
    attribution_referrer_host, attribution_landing_path, first_seen_at,
    analytics_consent, analytics_consent_version, source, is_test, journey_run_id,
    test_metadata_json
  )
  values (
    new.tenant_id, new.id, new.attribution_channel, new.attribution_source,
    new.attribution_medium, new.attribution_campaign, new.attribution_content, new.attribution_term,
    new.attribution_referrer_host, new.attribution_landing_path, new.attribution_captured_at,
    new.analytics_consent, new.analytics_consent_version,
    case when new.is_test then 'journey_simulation_bot' else 'public_intake' end,
    new.is_test, new.journey_run_id, new.test_metadata_json
  )
  on conflict (tenant_id, intake_submission_id) do nothing;
  return new;
end
$$;

create trigger intake_submissions_capture_lead_source
  after insert on public.intake_submissions
  for each row execute function app_private.capture_intake_lead_source();

revoke all on function app_private.capture_intake_lead_source() from public, anon, authenticated;

insert into public.lead_sources (
  tenant_id, intake_submission_id, attribution_channel, attribution_source,
  attribution_medium, attribution_campaign, attribution_content, attribution_term,
  attribution_referrer_host, attribution_landing_path, first_seen_at,
  analytics_consent, analytics_consent_version, source, is_test, journey_run_id,
  test_metadata_json, created_at
)
select
  intake.tenant_id, intake.id, intake.attribution_channel, intake.attribution_source,
  intake.attribution_medium, intake.attribution_campaign, intake.attribution_content, intake.attribution_term,
  intake.attribution_referrer_host, intake.attribution_landing_path, intake.attribution_captured_at,
  intake.analytics_consent, intake.analytics_consent_version,
  case when intake.is_test then 'journey_simulation_bot' else 'public_intake' end,
  intake.is_test, intake.journey_run_id, intake.test_metadata_json, intake.received_at
from public.intake_submissions intake
where not intake.is_test or intake.journey_run_id is not null
on conflict (tenant_id, intake_submission_id) do nothing;

create or replace function app_private.capture_slot_offer_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_entry public.waitlist_entries%rowtype;
  target_source public.lead_sources%rowtype;
  target_enrollment public.enrollments%rowtype;
begin
  if new.status <> 'accepted'
    or new.accepted_participant_id is null
    or new.accepted_enrollment_id is null
  then
    return new;
  end if;

  select * into target_entry
  from public.waitlist_entries
  where tenant_id = new.tenant_id and id = new.waitlist_entry_id;
  if target_entry.id is null or target_entry.intake_submission_id is null then return new; end if;

  select * into target_source
  from public.lead_sources
  where tenant_id = new.tenant_id and intake_submission_id = target_entry.intake_submission_id;
  select * into target_enrollment
  from public.enrollments
  where tenant_id = new.tenant_id
    and id = new.accepted_enrollment_id
    and participant_id = new.accepted_participant_id;
  if target_source.id is null or target_enrollment.id is null then return new; end if;

  update public.waitlist_entries
  set participant_id = new.accepted_participant_id,
      guardian_user_id = target_enrollment.guardian_user_id
  where tenant_id = new.tenant_id and id = new.waitlist_entry_id;

  insert into public.intake_conversion_lineage (
    tenant_id, lead_source_id, intake_submission_id, guardian_user_id,
    participant_id, enrollment_id, group_membership_id, placement_method,
    placement_evidence_id, placed_at, source, is_test, journey_run_id, test_metadata_json
  )
  values (
    new.tenant_id, target_source.id, target_entry.intake_submission_id,
    target_enrollment.guardian_user_id, new.accepted_participant_id,
    new.accepted_enrollment_id, new.accepted_group_membership_id, 'slot_offer',
    new.id, coalesce(new.responded_at, now()),
    case when target_entry.is_test then 'journey_simulation_bot' else 'placement' end,
    target_entry.is_test, target_entry.journey_run_id, target_entry.test_metadata_json
  )
  on conflict (tenant_id, intake_submission_id) do nothing;
  return new;
end
$$;

create trigger slot_offers_capture_lineage
  after insert or update of status, accepted_participant_id, accepted_enrollment_id
  on public.slot_offers
  for each row execute function app_private.capture_slot_offer_lineage();

revoke all on function app_private.capture_slot_offer_lineage() from public, anon, authenticated;

create or replace function app_private.capture_direct_placement_lineage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_entry public.waitlist_entries%rowtype;
  target_source public.lead_sources%rowtype;
  target_enrollment public.enrollments%rowtype;
  target_participant_id uuid;
  target_enrollment_id uuid;
  target_membership_id uuid;
begin
  if new.event_type <> 'placement.direct' then return new; end if;
  select * into target_entry
  from public.waitlist_entries
  where tenant_id = new.tenant_id and id = new.waitlist_entry_id;
  if target_entry.id is null or target_entry.intake_submission_id is null then return new; end if;

  target_participant_id := nullif(new.payload ->> 'participantId', '')::uuid;
  target_enrollment_id := nullif(new.payload ->> 'enrollmentId', '')::uuid;
  target_membership_id := nullif(new.payload ->> 'groupMembershipId', '')::uuid;
  select * into target_source
  from public.lead_sources
  where tenant_id = new.tenant_id and intake_submission_id = target_entry.intake_submission_id;
  select * into target_enrollment
  from public.enrollments
  where tenant_id = new.tenant_id
    and id = target_enrollment_id
    and participant_id = target_participant_id;
  if target_source.id is null or target_enrollment.id is null then return new; end if;

  update public.waitlist_entries
  set participant_id = target_participant_id,
      guardian_user_id = target_enrollment.guardian_user_id
  where tenant_id = new.tenant_id and id = target_entry.id;

  insert into public.intake_conversion_lineage (
    tenant_id, lead_source_id, intake_submission_id, guardian_user_id,
    participant_id, enrollment_id, group_membership_id, placement_method,
    placement_evidence_id, placed_at, source, is_test, journey_run_id, test_metadata_json
  )
  values (
    new.tenant_id, target_source.id, target_entry.intake_submission_id,
    target_enrollment.guardian_user_id, target_participant_id, target_enrollment_id,
    target_membership_id, 'direct_placement', new.id, new.created_at,
    case when target_entry.is_test then 'journey_simulation_bot' else 'placement' end,
    target_entry.is_test, target_entry.journey_run_id, target_entry.test_metadata_json
  )
  on conflict (tenant_id, intake_submission_id) do nothing;
  return new;
end
$$;

create trigger placement_audit_capture_direct_lineage
  after insert on public.placement_audit_events
  for each row execute function app_private.capture_direct_placement_lineage();

revoke all on function app_private.capture_direct_placement_lineage() from public, anon, authenticated;

-- Backfill only relation-backed accepted offers. Direct placement JSON is deliberately
-- not guessed here; new direct placements are captured by the trusted trigger above.
update public.waitlist_entries entry
set participant_id = offer.accepted_participant_id,
    guardian_user_id = enrollment.guardian_user_id
from public.slot_offers offer
join public.enrollments enrollment
  on enrollment.tenant_id = offer.tenant_id
 and enrollment.id = offer.accepted_enrollment_id
 and enrollment.participant_id = offer.accepted_participant_id
where offer.tenant_id = entry.tenant_id
  and offer.waitlist_entry_id = entry.id
  and offer.status = 'accepted'
  and offer.accepted_participant_id is not null
  and offer.accepted_enrollment_id is not null;

insert into public.intake_conversion_lineage (
  tenant_id, lead_source_id, intake_submission_id, guardian_user_id,
  participant_id, enrollment_id, group_membership_id, placement_method,
  placement_evidence_id, placed_at, source, is_test, journey_run_id, test_metadata_json
)
select
  entry.tenant_id, source.id, entry.intake_submission_id, enrollment.guardian_user_id,
  offer.accepted_participant_id, offer.accepted_enrollment_id,
  offer.accepted_group_membership_id, 'slot_offer', offer.id,
  coalesce(offer.responded_at, offer.offered_at),
  case when entry.is_test then 'journey_simulation_bot' else 'placement' end,
  entry.is_test, entry.journey_run_id, entry.test_metadata_json
from public.slot_offers offer
join public.waitlist_entries entry
  on entry.tenant_id = offer.tenant_id and entry.id = offer.waitlist_entry_id
join public.lead_sources source
  on source.tenant_id = entry.tenant_id and source.intake_submission_id = entry.intake_submission_id
join public.enrollments enrollment
  on enrollment.tenant_id = offer.tenant_id
 and enrollment.id = offer.accepted_enrollment_id
 and enrollment.participant_id = offer.accepted_participant_id
where offer.status = 'accepted'
  and offer.accepted_participant_id is not null
  and offer.accepted_enrollment_id is not null
on conflict (tenant_id, intake_submission_id) do nothing;

grant select on public.participant_schedule_preferences to authenticated;
grant select, insert, update, delete on public.guardian_communication_preferences to authenticated;
grant select on public.makeup_marketplace_decisions to authenticated;
grant select on public.lead_sources to authenticated;
grant select on public.intake_conversion_lineage to authenticated;
grant select on public.lead_score_snapshots to authenticated;
grant select on public.crm_follow_up_items to authenticated;

grant all on public.participant_schedule_preferences to service_role;
grant all on public.guardian_communication_preferences to service_role;
grant all on public.makeup_marketplace_decisions to service_role;
grant all on public.lead_sources to service_role;
grant all on public.intake_conversion_lineage to service_role;
grant all on public.lead_score_snapshots to service_role;
grant all on public.crm_follow_up_items to service_role;

alter table public.participant_schedule_preferences enable row level security;
alter table public.guardian_communication_preferences enable row level security;
alter table public.makeup_marketplace_decisions enable row level security;
alter table public.lead_sources enable row level security;
alter table public.intake_conversion_lineage enable row level security;
alter table public.lead_score_snapshots enable row level security;
alter table public.crm_follow_up_items enable row level security;

alter table public.participant_schedule_preferences force row level security;
alter table public.guardian_communication_preferences force row level security;
alter table public.makeup_marketplace_decisions force row level security;
alter table public.lead_sources force row level security;
alter table public.intake_conversion_lineage force row level security;
alter table public.lead_score_snapshots force row level security;
alter table public.crm_follow_up_items force row level security;

create policy "Tenant staff view schedule preferences"
  on public.participant_schedule_preferences for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

create policy "Guardians and tenant staff view communication preferences"
  on public.guardian_communication_preferences for select to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );
create policy "Guardians and tenant staff manage communication preferences"
  on public.guardian_communication_preferences for all to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  )
  with check (
    guardian_user_id = (select auth.uid())
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create policy "Tenant staff view marketplace decisions"
  on public.makeup_marketplace_decisions for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant staff view lead sources"
  on public.lead_sources for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant staff view conversion lineage"
  on public.intake_conversion_lineage for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant staff view lead scores"
  on public.lead_score_snapshots for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant staff view CRM follow-up"
  on public.crm_follow_up_items for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));

comment on table public.lead_sources is
  'Immutable, privacy-minimised first-touch snapshot created only when an intake is actually submitted.';
comment on table public.intake_conversion_lineage is
  'Relation-backed intake to placement lineage. Converted status alone is intentionally insufficient.';
comment on table public.lead_score_snapshots is
  'Explainable operational follow-up priority; never a judgement about a child or family.';
comment on table public.crm_follow_up_items is
  'Rule-based follow-up suggestions and editable drafts. This table never dispatches messages.';
comment on table public.makeup_marketplace_decisions is
  'Human-controlled marketplace decision history; automatic external invitations are disabled by default.';
