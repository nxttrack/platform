-- Premium CRM pipeline. Intake remains the immutable acquisition source;
-- pipeline state, ownership, contact history and duplicate handling are layered
-- on top. No action sends a message or makes a placement decision.

alter table public.intake_submissions
  add column if not exists crm_stage text not null default 'new',
  add column if not exists lead_owner_user_id uuid references auth.users (id) on delete set null,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists sla_due_at timestamptz,
  add column if not exists stage_changed_at timestamptz not null default now(),
  add column if not exists lost_reason text,
  add column if not exists lost_notes text,
  add column if not exists merged_into_intake_id uuid,
  add column if not exists crm_priority text not null default 'normal';

alter table public.intake_submissions
  add constraint intake_submissions_crm_stage_check
    check (crm_stage in ('new', 'contacted', 'trial', 'waitlist', 'offer', 'placed', 'lost')),
  add constraint intake_submissions_crm_priority_check
    check (crm_priority in ('low', 'normal', 'high', 'urgent')),
  add constraint intake_submissions_lost_reason_check
    check (
      lost_reason is null
      or lost_reason in (
        'duplicate', 'no_response', 'not_interested', 'schedule_mismatch',
        'price', 'moved', 'chose_other_provider', 'not_eligible', 'other'
      )
    ),
  add constraint intake_submissions_lost_state_check
    check (
      (crm_stage = 'lost' and lost_reason is not null)
      or (crm_stage <> 'lost' and lost_reason is null and lost_notes is null)
    ),
  add constraint intake_submissions_merge_state_check
    check (
      merged_into_intake_id is null
      or (crm_stage = 'lost' and lost_reason = 'duplicate' and merged_into_intake_id <> id)
    ),
  add constraint intake_submissions_merge_fk
    foreign key (tenant_id, merged_into_intake_id)
    references public.intake_submissions (tenant_id, id)
    on delete restrict;

create index intake_submissions_crm_board_idx
  on public.intake_submissions (tenant_id, crm_stage, crm_priority, stage_changed_at desc)
  where merged_into_intake_id is null;
create index intake_submissions_crm_owner_idx
  on public.intake_submissions (tenant_id, lead_owner_user_id, next_follow_up_at)
  where merged_into_intake_id is null and crm_stage not in ('placed', 'lost');
create index intake_submissions_crm_sla_idx
  on public.intake_submissions (tenant_id, sla_due_at)
  where merged_into_intake_id is null and crm_stage not in ('placed', 'lost');
create index intake_submissions_crm_email_idx
  on public.intake_submissions (tenant_id, lower(parent_email), received_at desc);
create index intake_submissions_crm_phone_idx
  on public.intake_submissions (tenant_id, regexp_replace(coalesce(parent_phone, ''), '[^0-9+]', '', 'g'))
  where parent_phone is not null;

create table public.crm_pipeline_stage_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid not null,
  from_stage text,
  to_stage text not null,
  reason text,
  changed_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'human',
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint crm_pipeline_history_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint crm_pipeline_history_from_check
    check (from_stage is null or from_stage in ('new', 'contacted', 'trial', 'waitlist', 'offer', 'placed', 'lost')),
  constraint crm_pipeline_history_to_check
    check (to_stage in ('new', 'contacted', 'trial', 'waitlist', 'offer', 'placed', 'lost')),
  constraint crm_pipeline_history_source_check
    check (source in ('human', 'conversion', 'duplicate_merge', 'duplicate_undo', 'migration', 'journey_simulation_bot')),
  constraint crm_pipeline_history_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint crm_pipeline_history_tenant_id_id_unique unique (tenant_id, id)
);

create table public.crm_contact_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  intake_submission_id uuid not null,
  event_type text not null,
  direction text not null default 'outbound',
  channel text not null,
  subject text,
  summary text not null,
  outcome text,
  occurred_at timestamptz not null default now(),
  next_follow_up_at timestamptz,
  recorded_by_user_id uuid references auth.users (id) on delete set null,
  content_classification text not null default 'personal',
  human_confirmed boolean not null default true,
  external_delivery_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint crm_contact_events_intake_fk
    foreign key (tenant_id, intake_submission_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint crm_contact_events_type_check
    check (event_type in ('note', 'call', 'email', 'in_app', 'meeting', 'trial', 'status_update', 'reminder')),
  constraint crm_contact_events_direction_check check (direction in ('inbound', 'outbound', 'internal')),
  constraint crm_contact_events_channel_check check (channel in ('phone', 'email', 'in_app', 'in_person', 'system')),
  constraint crm_contact_events_outcome_check
    check (outcome is null or outcome in ('connected', 'left_message', 'no_answer', 'replied', 'scheduled', 'completed', 'needs_follow_up')),
  constraint crm_contact_events_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint crm_contact_events_human_check check (human_confirmed),
  constraint crm_contact_events_metadata_check check (jsonb_typeof(metadata_json) = 'object'),
  constraint crm_contact_events_tenant_id_id_unique unique (tenant_id, id)
);

create table public.crm_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_intake_id uuid not null,
  candidate_intake_id uuid not null,
  match_score integer not null,
  match_reasons_json jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_duplicate_source_fk
    foreign key (tenant_id, source_intake_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint crm_duplicate_candidate_fk
    foreign key (tenant_id, candidate_intake_id)
    references public.intake_submissions (tenant_id, id)
    on delete cascade,
  constraint crm_duplicate_pair_check check (source_intake_id <> candidate_intake_id),
  constraint crm_duplicate_score_check check (match_score between 0 and 100),
  constraint crm_duplicate_reasons_check check (jsonb_typeof(match_reasons_json) = 'array'),
  constraint crm_duplicate_status_check check (status in ('open', 'dismissed', 'merged')),
  constraint crm_duplicate_review_check
    check ((status = 'open' and reviewed_at is null) or (status <> 'open' and reviewed_at is not null)),
  constraint crm_duplicate_pair_unique unique (tenant_id, source_intake_id, candidate_intake_id),
  constraint crm_duplicate_tenant_id_id_unique unique (tenant_id, id)
);

create table public.crm_merge_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_intake_id uuid not null,
  target_intake_id uuid not null,
  status text not null default 'active',
  source_snapshot_json jsonb not null,
  reason text not null,
  merged_by_user_id uuid references auth.users (id) on delete set null,
  merged_at timestamptz not null default now(),
  reverted_by_user_id uuid references auth.users (id) on delete set null,
  reverted_at timestamptz,
  constraint crm_merge_source_fk
    foreign key (tenant_id, source_intake_id)
    references public.intake_submissions (tenant_id, id)
    on delete restrict,
  constraint crm_merge_target_fk
    foreign key (tenant_id, target_intake_id)
    references public.intake_submissions (tenant_id, id)
    on delete restrict,
  constraint crm_merge_pair_check check (source_intake_id <> target_intake_id),
  constraint crm_merge_status_check check (status in ('active', 'reverted')),
  constraint crm_merge_snapshot_check check (jsonb_typeof(source_snapshot_json) = 'object'),
  constraint crm_merge_revert_check
    check (
      (status = 'active' and reverted_at is null and reverted_by_user_id is null)
      or (status = 'reverted' and reverted_at is not null and reverted_by_user_id is not null)
    ),
  constraint crm_merge_tenant_id_id_unique unique (tenant_id, id)
);

create unique index crm_merge_one_active_source_idx
  on public.crm_merge_events (tenant_id, source_intake_id)
  where status = 'active';

create table public.crm_sla_policies (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  first_response_hours integer not null default 24,
  follow_up_hours integer not null default 48,
  offer_follow_up_hours integer not null default 24,
  trial_follow_up_hours integer not null default 24,
  working_days integer[] not null default array[1,2,3,4,5],
  timezone text not null default 'Europe/Amsterdam',
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_sla_first_response_check check (first_response_hours between 1 and 168),
  constraint crm_sla_follow_up_check check (follow_up_hours between 1 and 336),
  constraint crm_sla_offer_check check (offer_follow_up_hours between 1 and 168),
  constraint crm_sla_trial_check check (trial_follow_up_hours between 1 and 168),
  constraint crm_sla_working_days_check
    check (cardinality(working_days) between 1 and 7 and working_days <@ array[1,2,3,4,5,6,7]::integer[])
);

create index crm_pipeline_history_timeline_idx
  on public.crm_pipeline_stage_history (tenant_id, intake_submission_id, occurred_at desc);
create index crm_contact_events_timeline_idx
  on public.crm_contact_events (tenant_id, intake_submission_id, occurred_at desc);
create index crm_duplicate_candidates_open_idx
  on public.crm_duplicate_candidates (tenant_id, status, match_score desc);

create trigger crm_duplicate_candidates_set_updated_at
  before update on public.crm_duplicate_candidates
  for each row execute function app_private.set_updated_at();
create trigger crm_sla_policies_set_updated_at
  before update on public.crm_sla_policies
  for each row execute function app_private.set_updated_at();

create or replace function app_private.capture_crm_stage_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.crm_stage is distinct from new.crm_stage then
    new.stage_changed_at = now();
    insert into public.crm_pipeline_stage_history (
      tenant_id, intake_submission_id, from_stage, to_stage, reason,
      changed_by_user_id, source, metadata_json
    )
    values (
      new.tenant_id, new.id, old.crm_stage, new.crm_stage,
      nullif(current_setting('app.crm_change_reason', true), ''),
      nullif(current_setting('app.crm_actor_id', true), '')::uuid,
      coalesce(nullif(current_setting('app.crm_change_source', true), ''), 'human'),
      '{}'::jsonb
    );
  end if;
  return new;
end
$$;

create trigger intake_submissions_capture_crm_stage
  before update of crm_stage on public.intake_submissions
  for each row execute function app_private.capture_crm_stage_change();

create or replace function app_private.merge_crm_leads(
  p_tenant_id uuid,
  p_source_intake_id uuid,
  p_target_intake_id uuid,
  p_actor_user_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_row public.intake_submissions%rowtype;
  target_row public.intake_submissions%rowtype;
  merge_id uuid;
begin
  if p_source_intake_id = p_target_intake_id then
    raise exception using errcode = '22023', message = 'crm_merge_same_lead';
  end if;

  select * into source_row
  from public.intake_submissions
  where tenant_id = p_tenant_id and id = p_source_intake_id
  for update;
  select * into target_row
  from public.intake_submissions
  where tenant_id = p_tenant_id and id = p_target_intake_id
  for update;

  if source_row.id is null or target_row.id is null then
    raise exception using errcode = 'P0002', message = 'crm_merge_lead_not_found';
  end if;
  if source_row.merged_into_intake_id is not null or target_row.merged_into_intake_id is not null then
    raise exception using errcode = '55000', message = 'crm_merge_lead_already_merged';
  end if;
  if source_row.is_test is distinct from target_row.is_test then
    raise exception using errcode = '22023', message = 'crm_merge_test_boundary';
  end if;

  perform set_config('app.crm_actor_id', p_actor_user_id::text, true);
  perform set_config('app.crm_change_source', 'duplicate_merge', true);
  perform set_config('app.crm_change_reason', left(p_reason, 500), true);

  insert into public.crm_merge_events (
    tenant_id, source_intake_id, target_intake_id, source_snapshot_json,
    reason, merged_by_user_id
  )
  values (
    p_tenant_id, p_source_intake_id, p_target_intake_id,
    jsonb_build_object(
      'crm_stage', source_row.crm_stage,
      'status', source_row.status,
      'lost_reason', source_row.lost_reason,
      'lost_notes', source_row.lost_notes,
      'lead_owner_user_id', source_row.lead_owner_user_id,
      'next_follow_up_at', source_row.next_follow_up_at,
      'sla_due_at', source_row.sla_due_at,
      'crm_priority', source_row.crm_priority
    ),
    left(p_reason, 1000), p_actor_user_id
  )
  returning id into merge_id;

  update public.intake_submissions
  set crm_stage = 'lost',
      status = 'closed',
      lost_reason = 'duplicate',
      lost_notes = left(p_reason, 2000),
      merged_into_intake_id = p_target_intake_id,
      next_follow_up_at = null,
      sla_due_at = null
  where tenant_id = p_tenant_id and id = p_source_intake_id;

  update public.crm_duplicate_candidates
  set status = 'merged', reviewed_by_user_id = p_actor_user_id, reviewed_at = now()
  where tenant_id = p_tenant_id
    and status = 'open'
    and (
      (source_intake_id = p_source_intake_id and candidate_intake_id = p_target_intake_id)
      or (source_intake_id = p_target_intake_id and candidate_intake_id = p_source_intake_id)
    );

  return merge_id;
end
$$;

create or replace function app_private.update_crm_lead(
  p_tenant_id uuid,
  p_intake_id uuid,
  p_actor_user_id uuid,
  p_stage text,
  p_priority text,
  p_owner_user_id uuid,
  p_next_follow_up_at timestamptz,
  p_sla_due_at timestamptz,
  p_lost_reason text,
  p_lost_notes text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.intake_submissions%rowtype;
begin
  if p_stage not in ('new', 'contacted', 'trial', 'waitlist', 'offer', 'placed', 'lost') then
    raise exception using errcode = '22023', message = 'crm_stage_invalid';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception using errcode = '22023', message = 'crm_priority_invalid';
  end if;
  if p_stage = 'lost' and p_lost_reason not in (
    'no_response', 'not_interested', 'schedule_mismatch', 'price', 'moved',
    'chose_other_provider', 'not_eligible', 'other'
  ) then
    raise exception using errcode = '22023', message = 'crm_lost_reason_required';
  end if;
  if p_stage <> 'lost' and (p_lost_reason is not null or p_lost_notes is not null) then
    raise exception using errcode = '22023', message = 'crm_lost_fields_invalid';
  end if;
  if p_owner_user_id is not null and not exists (
    select 1 from public.tenant_memberships
    where tenant_id = p_tenant_id
      and user_id = p_owner_user_id
      and status = 'active'
      and role in ('tenant_owner', 'tenant_admin', 'tenant_staff')
  ) then
    raise exception using errcode = '42501', message = 'crm_owner_not_allowed';
  end if;

  select * into current_row
  from public.intake_submissions
  where tenant_id = p_tenant_id and id = p_intake_id
  for update;
  if current_row.id is null or current_row.merged_into_intake_id is not null then
    raise exception using errcode = '55000', message = 'crm_lead_not_editable';
  end if;

  perform set_config('app.crm_actor_id', p_actor_user_id::text, true);
  perform set_config('app.crm_change_source', 'human', true);
  perform set_config('app.crm_change_reason', 'Pipeline bijgewerkt', true);

  update public.intake_submissions
  set crm_stage = p_stage,
      crm_priority = p_priority,
      lead_owner_user_id = p_owner_user_id,
      next_follow_up_at = case when p_stage in ('placed', 'lost') then null else p_next_follow_up_at end,
      sla_due_at = case when p_stage in ('placed', 'lost') then null else p_sla_due_at end,
      lost_reason = case when p_stage = 'lost' then p_lost_reason else null end,
      lost_notes = case when p_stage = 'lost' then nullif(left(p_lost_notes, 2000), '') else null end,
      status = case
        when p_stage = 'placed' then 'converted'
        when p_stage = 'lost' then 'closed'
        when p_stage = 'new' then 'received'
        else 'reviewing'
      end,
      reviewed_at = case when p_stage = 'new' then reviewed_at else coalesce(reviewed_at, now()) end
  where tenant_id = p_tenant_id and id = p_intake_id;
end
$$;

create or replace function app_private.record_crm_contact(
  p_tenant_id uuid,
  p_intake_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_direction text,
  p_channel text,
  p_subject text,
  p_summary text,
  p_outcome text,
  p_occurred_at timestamptz,
  p_next_follow_up_at timestamptz,
  p_content_classification text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_row public.intake_submissions%rowtype;
  event_id uuid;
begin
  select * into current_row
  from public.intake_submissions
  where tenant_id = p_tenant_id and id = p_intake_id
  for update;
  if current_row.id is null or current_row.merged_into_intake_id is not null then
    raise exception using errcode = '55000', message = 'crm_lead_not_editable';
  end if;

  insert into public.crm_contact_events (
    tenant_id, intake_submission_id, event_type, direction, channel, subject,
    summary, outcome, occurred_at, next_follow_up_at, recorded_by_user_id,
    content_classification, human_confirmed
  )
  values (
    p_tenant_id, p_intake_id, p_event_type, p_direction, p_channel,
    nullif(left(p_subject, 180), ''), left(p_summary, 4000), p_outcome,
    coalesce(p_occurred_at, now()), p_next_follow_up_at, p_actor_user_id,
    p_content_classification, true
  )
  returning id into event_id;

  perform set_config('app.crm_actor_id', p_actor_user_id::text, true);
  perform set_config('app.crm_change_source', 'human', true);
  perform set_config('app.crm_change_reason', 'Eerste contact vastgelegd', true);

  update public.intake_submissions
  set crm_stage = case when crm_stage = 'new' then 'contacted' else crm_stage end,
      reviewed_at = coalesce(reviewed_at, now()),
      next_follow_up_at = p_next_follow_up_at,
      sla_due_at = case
        when p_next_follow_up_at is null then null
        else p_next_follow_up_at + interval '24 hours'
      end
  where tenant_id = p_tenant_id and id = p_intake_id;

  return event_id;
end
$$;

create or replace function app_private.revert_crm_lead_merge(
  p_tenant_id uuid,
  p_merge_event_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  merge_row public.crm_merge_events%rowtype;
begin
  select * into merge_row
  from public.crm_merge_events
  where tenant_id = p_tenant_id and id = p_merge_event_id
  for update;
  if merge_row.id is null or merge_row.status <> 'active' then
    raise exception using errcode = '55000', message = 'crm_merge_not_active';
  end if;

  perform set_config('app.crm_actor_id', p_actor_user_id::text, true);
  perform set_config('app.crm_change_source', 'duplicate_undo', true);
  perform set_config('app.crm_change_reason', 'Duplicate merge hersteld', true);

  update public.intake_submissions
  set crm_stage = merge_row.source_snapshot_json->>'crm_stage',
      status = merge_row.source_snapshot_json->>'status',
      lost_reason = nullif(merge_row.source_snapshot_json->>'lost_reason', ''),
      lost_notes = nullif(merge_row.source_snapshot_json->>'lost_notes', ''),
      lead_owner_user_id = nullif(merge_row.source_snapshot_json->>'lead_owner_user_id', '')::uuid,
      next_follow_up_at = nullif(merge_row.source_snapshot_json->>'next_follow_up_at', '')::timestamptz,
      sla_due_at = nullif(merge_row.source_snapshot_json->>'sla_due_at', '')::timestamptz,
      crm_priority = coalesce(merge_row.source_snapshot_json->>'crm_priority', 'normal'),
      merged_into_intake_id = null
  where tenant_id = p_tenant_id and id = merge_row.source_intake_id;

  update public.crm_merge_events
  set status = 'reverted', reverted_by_user_id = p_actor_user_id, reverted_at = now()
  where id = merge_row.id;
end
$$;

revoke all on function app_private.merge_crm_leads(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function app_private.update_crm_lead(uuid, uuid, uuid, text, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function app_private.record_crm_contact(uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function app_private.revert_crm_lead_merge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.merge_crm_leads(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function app_private.update_crm_lead(uuid, uuid, uuid, text, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function app_private.record_crm_contact(uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function app_private.revert_crm_lead_merge(uuid, uuid, uuid) to service_role;

create or replace function public.merge_crm_leads(
  p_tenant_id uuid, p_source_intake_id uuid, p_target_intake_id uuid,
  p_actor_user_id uuid, p_reason text
)
returns uuid language sql security invoker set search_path = public, pg_temp
as $$ select app_private.merge_crm_leads(p_tenant_id, p_source_intake_id, p_target_intake_id, p_actor_user_id, p_reason); $$;
create or replace function public.update_crm_lead(
  p_tenant_id uuid, p_intake_id uuid, p_actor_user_id uuid, p_stage text,
  p_priority text, p_owner_user_id uuid, p_next_follow_up_at timestamptz,
  p_sla_due_at timestamptz, p_lost_reason text, p_lost_notes text
)
returns void language sql security invoker set search_path = public, pg_temp
as $$ select app_private.update_crm_lead(p_tenant_id, p_intake_id, p_actor_user_id, p_stage, p_priority, p_owner_user_id, p_next_follow_up_at, p_sla_due_at, p_lost_reason, p_lost_notes); $$;
create or replace function public.record_crm_contact(
  p_tenant_id uuid, p_intake_id uuid, p_actor_user_id uuid, p_event_type text,
  p_direction text, p_channel text, p_subject text, p_summary text, p_outcome text,
  p_occurred_at timestamptz, p_next_follow_up_at timestamptz, p_content_classification text
)
returns uuid language sql security invoker set search_path = public, pg_temp
as $$ select app_private.record_crm_contact(p_tenant_id, p_intake_id, p_actor_user_id, p_event_type, p_direction, p_channel, p_subject, p_summary, p_outcome, p_occurred_at, p_next_follow_up_at, p_content_classification); $$;
create or replace function public.revert_crm_lead_merge(
  p_tenant_id uuid, p_merge_event_id uuid, p_actor_user_id uuid
)
returns void language sql security invoker set search_path = public, pg_temp
as $$ select app_private.revert_crm_lead_merge(p_tenant_id, p_merge_event_id, p_actor_user_id); $$;

revoke all on function public.merge_crm_leads(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.update_crm_lead(uuid, uuid, uuid, text, text, uuid, timestamptz, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.record_crm_contact(uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated;
revoke all on function public.revert_crm_lead_merge(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_crm_leads(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.update_crm_lead(uuid, uuid, uuid, text, text, uuid, timestamptz, timestamptz, text, text) to service_role;
grant execute on function public.record_crm_contact(uuid, uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.revert_crm_lead_merge(uuid, uuid, uuid) to service_role;

grant select, insert, update, delete on public.crm_pipeline_stage_history to authenticated;
grant select, insert, update, delete on public.crm_contact_events to authenticated;
grant select, insert, update, delete on public.crm_duplicate_candidates to authenticated;
grant select on public.crm_merge_events to authenticated;
grant select, insert, update, delete on public.crm_sla_policies to authenticated;
grant all on public.crm_pipeline_stage_history to service_role;
grant all on public.crm_contact_events to service_role;
grant all on public.crm_duplicate_candidates to service_role;
grant all on public.crm_merge_events to service_role;
grant all on public.crm_sla_policies to service_role;

alter table public.crm_pipeline_stage_history enable row level security;
alter table public.crm_pipeline_stage_history force row level security;
alter table public.crm_contact_events enable row level security;
alter table public.crm_contact_events force row level security;
alter table public.crm_duplicate_candidates enable row level security;
alter table public.crm_duplicate_candidates force row level security;
alter table public.crm_merge_events enable row level security;
alter table public.crm_merge_events force row level security;
alter table public.crm_sla_policies enable row level security;
alter table public.crm_sla_policies force row level security;

create policy "Tenant admins manage CRM stage history"
  on public.crm_pipeline_stage_history for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage CRM contact events"
  on public.crm_contact_events for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage CRM duplicate candidates"
  on public.crm_duplicate_candidates for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins view CRM merge events"
  on public.crm_merge_events for select to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id));
create policy "Tenant admins manage CRM SLA policies"
  on public.crm_sla_policies for all to authenticated
  using (app_private.current_user_can_manage_tenant_domain(tenant_id))
  with check (app_private.current_user_can_manage_tenant_domain(tenant_id));

-- Backfill the board without rewriting historical intake status.
update public.intake_submissions
set crm_stage = case
    when status = 'converted' then 'placed'
    when status = 'closed' then 'lost'
    when selected_option = 'trial' and status = 'reviewing' then 'trial'
    when selected_option = 'waitlist' and status = 'reviewing' then 'waitlist'
    when status = 'reviewing' then 'contacted'
    else 'new'
  end,
  lost_reason = case when status = 'closed' then 'other' else null end,
  stage_changed_at = coalesce(reviewed_at, received_at, created_at),
  sla_due_at = case
    when status in ('received', 'reviewing') then coalesce(received_at, created_at) + interval '24 hours'
    else null
  end
where crm_stage = 'new';
