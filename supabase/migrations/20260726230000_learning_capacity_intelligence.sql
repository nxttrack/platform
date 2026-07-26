-- Explainable learning intelligence: append-only assessments, safe contact drafts
-- and compact lesson-focus cards. Every operational decision remains human-owned.

alter table public.progress_items
  add column required_for_completion boolean not null default true,
  add column completion_threshold integer not null default 4,
  add constraint progress_items_completion_threshold_check
    check (completion_threshold between 1 and 5);

create table public.participant_progress_assessments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_score_id uuid not null,
  participant_id uuid not null,
  enrollment_id uuid,
  program_id uuid,
  stage_id uuid,
  module_id uuid not null,
  item_id uuid not null,
  session_id uuid,
  group_id uuid,
  score integer not null,
  positive_label text not null,
  visibility text not null default 'parent_visible',
  assessed_by_user_id uuid references auth.users (id) on delete set null,
  assessed_at timestamptz not null default now(),
  source text not null default 'manual',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint participant_progress_assessments_source_score_fk
    foreign key (tenant_id, source_score_id)
    references public.participant_progress_scores (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_enrollment_fk
    foreign key (tenant_id, enrollment_id, participant_id)
    references public.enrollments (tenant_id, id, participant_id)
    on delete cascade,
  constraint participant_progress_assessments_program_fk
    foreign key (tenant_id, program_id)
    references public.programs (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_stage_fk
    foreign key (tenant_id, stage_id)
    references public.program_stages (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_module_fk
    foreign key (tenant_id, module_id)
    references public.progress_modules (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_item_fk
    foreign key (tenant_id, module_id, item_id)
    references public.progress_items (tenant_id, module_id, id)
    on delete cascade,
  constraint participant_progress_assessments_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_group_fk
    foreign key (tenant_id, group_id)
    references public.groups (tenant_id, id)
    on delete cascade,
  constraint participant_progress_assessments_score_check check (score between 1 and 5),
  constraint participant_progress_assessments_visibility_check
    check (visibility in ('internal', 'parent_visible')),
  constraint participant_progress_assessments_source_check
    check (source in ('manual', 'import', 'journey_simulation_bot')),
  constraint participant_progress_assessments_test_marker_check
    check (
      (journey_run_id is null and not is_test)
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint participant_progress_assessments_tenant_id_id_unique unique (tenant_id, id)
);

insert into public.participant_progress_assessments (
  tenant_id,
  source_score_id,
  participant_id,
  enrollment_id,
  program_id,
  stage_id,
  module_id,
  item_id,
  session_id,
  group_id,
  score,
  positive_label,
  visibility,
  assessed_by_user_id,
  assessed_at,
  source,
  is_test,
  journey_run_id
)
select
  score.tenant_id,
  score.id,
  score.participant_id,
  score.enrollment_id,
  module.program_id,
  module.stage_id,
  score.module_id,
  score.item_id,
  score.session_id,
  session.group_id,
  score.score,
  score.positive_label,
  score.visibility,
  score.scored_by_user_id,
  score.scored_at,
  score.source,
  score.is_test,
  score.journey_run_id
from public.participant_progress_scores score
join public.progress_modules module
  on module.tenant_id = score.tenant_id
 and module.id = score.module_id
left join public.sessions session
  on session.tenant_id = score.tenant_id
 and session.id = score.session_id;

create function app_private.capture_progress_assessment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_group_id uuid;
  target_program_id uuid;
  target_stage_id uuid;
begin
  select module.program_id, module.stage_id
  into target_program_id, target_stage_id
  from public.progress_modules module
  where module.tenant_id = new.tenant_id
    and module.id = new.module_id;

  if new.session_id is not null then
    select session.group_id
    into target_group_id
    from public.sessions session
    where session.tenant_id = new.tenant_id
      and session.id = new.session_id;
  end if;

  insert into public.participant_progress_assessments (
    tenant_id,
    source_score_id,
    participant_id,
    enrollment_id,
    program_id,
    stage_id,
    module_id,
    item_id,
    session_id,
    group_id,
    score,
    positive_label,
    visibility,
    assessed_by_user_id,
    assessed_at,
    source,
    is_test,
    journey_run_id
  ) values (
    new.tenant_id,
    new.id,
    new.participant_id,
    new.enrollment_id,
    target_program_id,
    target_stage_id,
    new.module_id,
    new.item_id,
    new.session_id,
    target_group_id,
    new.score,
    new.positive_label,
    new.visibility,
    new.scored_by_user_id,
    new.scored_at,
    new.source,
    new.is_test,
    new.journey_run_id
  );

  return new;
end
$$;

revoke all on function app_private.capture_progress_assessment() from public;

create trigger participant_progress_scores_capture_assessment
  after insert or update of score, positive_label, visibility, scored_by_user_id, scored_at
  on public.participant_progress_scores
  for each row execute function app_private.capture_progress_assessment();

create table public.lesson_focus_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null,
  participant_id uuid not null,
  focus_points_json jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  generated_at timestamptz not null default now(),
  treated_at timestamptz,
  treated_by_user_id uuid references auth.users (id) on delete set null,
  source text not null default 'lesson_focus_engine',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_focus_cards_session_fk
    foreign key (tenant_id, session_id)
    references public.sessions (tenant_id, id)
    on delete cascade,
  constraint lesson_focus_cards_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint lesson_focus_cards_points_check
    check (
      jsonb_typeof(focus_points_json) = 'array'
      and jsonb_array_length(focus_points_json) between 1 and 3
    ),
  constraint lesson_focus_cards_status_check
    check (status in ('active', 'treated', 'dismissed')),
  constraint lesson_focus_cards_treated_check
    check (
      (status = 'treated' and treated_at is not null and treated_by_user_id is not null)
      or (status <> 'treated' and treated_at is null and treated_by_user_id is null)
    ),
  constraint lesson_focus_cards_source_check
    check (source in ('lesson_focus_engine', 'manual', 'journey_simulation_bot')),
  constraint lesson_focus_cards_test_marker_check
    check (
      (journey_run_id is null and not is_test and source <> 'journey_simulation_bot')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint lesson_focus_cards_tenant_id_id_unique unique (tenant_id, id),
  constraint lesson_focus_cards_session_participant_unique
    unique (tenant_id, session_id, participant_id)
);

create table public.participant_contact_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null,
  recipient_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid not null references auth.users (id) on delete restrict,
  title text not null,
  body text not null,
  source_type text not null,
  source_fingerprint text not null,
  status text not null default 'draft',
  content_classification text not null default 'personal',
  classification_reasons jsonb not null default '[]'::jsonb,
  source text not null default 'learning_intelligence',
  is_test boolean not null default false,
  journey_run_id uuid references public.journey_bot_runs (id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_contact_drafts_participant_fk
    foreign key (tenant_id, participant_id)
    references public.participants (tenant_id, id)
    on delete cascade,
  constraint participant_contact_drafts_source_type_check
    check (source_type in ('attendance_risk', 'progress_bottleneck', 'diploma_readiness')),
  constraint participant_contact_drafts_status_check
    check (status in ('draft', 'reviewed', 'archived')),
  constraint participant_contact_drafts_classification_check
    check (content_classification in ('operational', 'personal', 'sensitive', 'restricted')),
  constraint participant_contact_drafts_classification_reasons_check
    check (jsonb_typeof(classification_reasons) = 'array'),
  constraint participant_contact_drafts_source_check
    check (source in ('learning_intelligence', 'journey_simulation_bot')),
  constraint participant_contact_drafts_test_marker_check
    check (
      (journey_run_id is null and not is_test and source = 'learning_intelligence')
      or (journey_run_id is not null and is_test and source = 'journey_simulation_bot')
    ),
  constraint participant_contact_drafts_tenant_id_id_unique unique (tenant_id, id)
);

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
      'forecast_capacity_review'
    )
  );

create index participant_progress_assessments_participant_idx
  on public.participant_progress_assessments
  (tenant_id, participant_id, item_id, assessed_at desc);
create index participant_progress_assessments_scope_idx
  on public.participant_progress_assessments
  (tenant_id, program_id, stage_id, group_id, item_id, assessed_at desc);
create index participant_progress_assessments_journey_idx
  on public.participant_progress_assessments (tenant_id, journey_run_id)
  where is_test;
create index lesson_focus_cards_session_idx
  on public.lesson_focus_cards (tenant_id, session_id, status, generated_at desc);
create index lesson_focus_cards_participant_idx
  on public.lesson_focus_cards (tenant_id, participant_id, generated_at desc);
create index lesson_focus_cards_journey_idx
  on public.lesson_focus_cards (tenant_id, journey_run_id)
  where is_test;
create index participant_contact_drafts_participant_idx
  on public.participant_contact_drafts (tenant_id, participant_id, status, created_at desc);
create unique index participant_contact_drafts_open_fingerprint_idx
  on public.participant_contact_drafts (tenant_id, source_fingerprint)
  where status in ('draft', 'reviewed');
create index participant_contact_drafts_journey_idx
  on public.participant_contact_drafts (tenant_id, journey_run_id)
  where is_test;

create trigger lesson_focus_cards_set_updated_at
  before update on public.lesson_focus_cards
  for each row execute function app_private.set_updated_at();
create trigger participant_contact_drafts_set_updated_at
  before update on public.participant_contact_drafts
  for each row execute function app_private.set_updated_at();

grant select on public.participant_progress_assessments to authenticated;
grant select on public.lesson_focus_cards to authenticated;
grant select on public.participant_contact_drafts to authenticated;
grant all on public.participant_progress_assessments to service_role;
grant all on public.lesson_focus_cards to service_role;
grant all on public.participant_contact_drafts to service_role;

alter table public.participant_progress_assessments enable row level security;
alter table public.lesson_focus_cards enable row level security;
alter table public.participant_contact_drafts enable row level security;
alter table public.participant_progress_assessments force row level security;
alter table public.lesson_focus_cards force row level security;
alter table public.participant_contact_drafts force row level security;

create policy "Scoped staff can view assessment history"
  on public.participant_progress_assessments
  for select
  to authenticated
  using (app_private.current_user_can_instruct_participant(participant_id));

create policy "Scoped staff can view lesson focus cards"
  on public.lesson_focus_cards
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_record_session_for_participant(session_id, participant_id)
  );

create policy "Scoped staff can view participant contact drafts"
  on public.participant_contact_drafts
  for select
  to authenticated
  using (
    app_private.current_user_can_manage_tenant_domain(tenant_id)
    or app_private.current_user_can_instruct_participant(participant_id)
  );

comment on table public.participant_progress_assessments is
  'Append-only assessment observations used for explainable trends and stability. Parent visibility remains governed by the source workflow.';
comment on table public.lesson_focus_cards is
  'At most three positive pre-lesson prompts per participant. Cards never contain medical or restricted dossier text.';
comment on table public.participant_contact_drafts is
  'Participant-scoped drafts for human review. This table deliberately has no send state or automatic delivery path.';
