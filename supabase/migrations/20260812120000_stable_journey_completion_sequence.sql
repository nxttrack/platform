-- Stable active-chapter journey ordering. A completion receives one immutable
-- sequence number on the first final rating-5 observation. Later corrections
-- may change the current score, but never silently rewrite historical position.

create table public.portal_journey_item_completions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null,
  participant_id uuid not null,
  curriculum_version_id uuid not null,
  curriculum_stage_id uuid not null,
  curriculum_item_id uuid not null,
  completion_observation_id uuid not null,
  completion_sequence integer not null,
  completed_at timestamptz not null,
  order_status text not null default 'event_sequence',
  created_at timestamptz not null default now(),
  foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id) on delete cascade,
  foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete restrict,
  foreign key (tenant_id, curriculum_stage_id)
    references public.curriculum_stages (tenant_id, id) on delete restrict,
  foreign key (tenant_id, curriculum_item_id)
    references public.curriculum_items (tenant_id, id) on delete restrict,
  foreign key (tenant_id, completion_observation_id)
    references public.swim_assessment_observations (tenant_id, id) on delete restrict,
  constraint portal_journey_item_completions_sequence_check check (completion_sequence > 0),
  constraint portal_journey_item_completions_status_check
    check (order_status in ('event_sequence', 'legacy_inferred')),
  constraint portal_journey_item_completions_item_unique
    unique (tenant_id, enrollment_id, curriculum_stage_id, curriculum_item_id),
  constraint portal_journey_item_completions_sequence_unique
    unique (tenant_id, enrollment_id, curriculum_stage_id, completion_sequence),
  constraint portal_journey_item_completions_tenant_id_id_unique unique (tenant_id, id)
);

create index portal_journey_item_completions_participant_idx
  on public.portal_journey_item_completions
  (tenant_id, participant_id, curriculum_stage_id, completion_sequence);

grant select on public.portal_journey_item_completions to authenticated;
grant select, insert on public.portal_journey_item_completions to service_role;

alter table public.portal_journey_item_completions enable row level security;
alter table public.portal_journey_item_completions force row level security;

create policy portal_journey_item_completions_read
  on public.portal_journey_item_completions
  for select
  to authenticated
  using (
    app_private.current_user_can_view_participant(participant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
    or app_private.current_user_can_manage_tenant_domain(tenant_id)
  );

create function app_private.capture_portal_journey_item_completion()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  target_stage_id uuid;
  target_sequence integer;
begin
  if new.rating <> 5 then
    return new;
  end if;

  select item.curriculum_stage_id into target_stage_id
  from public.curriculum_items item
  where item.tenant_id = new.tenant_id
    and item.id = new.curriculum_item_id
    and item.curriculum_version_id = new.curriculum_version_id;

  if target_stage_id is null then
    raise exception 'Journey completion item is outside the observation curriculum version';
  end if;

  -- Serialize sequence allocation within one tenant/enrollment/chapter without
  -- locking unrelated tenants or journeys.
  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(':', new.tenant_id::text, new.enrollment_id::text, target_stage_id::text),
      0
    )
  );

  if exists (
    select 1 from public.portal_journey_item_completions completion
    where completion.tenant_id = new.tenant_id
      and completion.enrollment_id = new.enrollment_id
      and completion.curriculum_stage_id = target_stage_id
      and completion.curriculum_item_id = new.curriculum_item_id
  ) then
    return new;
  end if;

  select coalesce(max(completion.completion_sequence), 0) + 1
  into target_sequence
  from public.portal_journey_item_completions completion
  where completion.tenant_id = new.tenant_id
    and completion.enrollment_id = new.enrollment_id
    and completion.curriculum_stage_id = target_stage_id;

  insert into public.portal_journey_item_completions (
    tenant_id,
    enrollment_id,
    participant_id,
    curriculum_version_id,
    curriculum_stage_id,
    curriculum_item_id,
    completion_observation_id,
    completion_sequence,
    completed_at,
    order_status
  ) values (
    new.tenant_id,
    new.enrollment_id,
    new.participant_id,
    new.curriculum_version_id,
    target_stage_id,
    new.curriculum_item_id,
    new.id,
    target_sequence,
    new.observed_at,
    'event_sequence'
  ) on conflict (tenant_id, enrollment_id, curriculum_stage_id, curriculum_item_id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.capture_portal_journey_item_completion()
  from public, anon, authenticated;

create trigger swim_assessment_observation_capture_journey_completion
after insert on public.swim_assessment_observations
for each row execute function app_private.capture_portal_journey_item_completion();

-- Existing rows have no authoritative first-seen event sequence. Freeze one
-- deterministic legacy order exactly once and label it explicitly.
with effective_rating_five as (
  select distinct on (
    observation.tenant_id,
    observation.enrollment_id,
    item.curriculum_stage_id,
    observation.curriculum_item_id
  )
    observation.tenant_id,
    observation.enrollment_id,
    observation.participant_id,
    observation.curriculum_version_id,
    item.curriculum_stage_id,
    observation.curriculum_item_id,
    observation.id as completion_observation_id,
    observation.observed_at as completed_at
  from public.swim_assessment_observations observation
  join public.curriculum_items item
    on item.tenant_id = observation.tenant_id
   and item.id = observation.curriculum_item_id
   and item.curriculum_version_id = observation.curriculum_version_id
  where observation.rating = 5
    and not exists (
      select 1 from public.swim_assessment_retractions retraction
      where retraction.tenant_id = observation.tenant_id
        and retraction.observation_id = observation.id
    )
  order by
    observation.tenant_id,
    observation.enrollment_id,
    item.curriculum_stage_id,
    observation.curriculum_item_id,
    observation.observed_at,
    observation.id
), ranked as (
  select
    effective_rating_five.*,
    row_number() over (
      partition by tenant_id, enrollment_id, curriculum_stage_id
      order by completed_at, completion_observation_id
    )::integer as completion_sequence
  from effective_rating_five
)
insert into public.portal_journey_item_completions (
  tenant_id,
  enrollment_id,
  participant_id,
  curriculum_version_id,
  curriculum_stage_id,
  curriculum_item_id,
  completion_observation_id,
  completion_sequence,
  completed_at,
  order_status
)
select
  tenant_id,
  enrollment_id,
  participant_id,
  curriculum_version_id,
  curriculum_stage_id,
  curriculum_item_id,
  completion_observation_id,
  completion_sequence,
  completed_at,
  'legacy_inferred'
from ranked
on conflict do nothing;

create function app_private.prevent_portal_journey_completion_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Journey completion sequence is append-only';
end;
$$;

revoke all on function app_private.prevent_portal_journey_completion_mutation()
  from public, anon, authenticated;

create trigger portal_journey_item_completions_append_only
before update or delete on public.portal_journey_item_completions
for each row execute function app_private.prevent_portal_journey_completion_mutation();

comment on table public.portal_journey_item_completions is
  'Immutable per-chapter completion sequence for the active journey. Legacy chronology is explicitly labelled and never silently recomputed.';
