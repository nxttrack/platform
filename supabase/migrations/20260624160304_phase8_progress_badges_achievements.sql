create table public.stage_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_modules_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint stage_modules_status_check check (status in ('draft', 'active', 'archived')),
  constraint stage_modules_id_tenant_unique unique (id, tenant_id),
  constraint stage_modules_unique_code unique (tenant_id, stage_id, code),
  constraint stage_modules_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade,
  constraint stage_modules_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id) on delete cascade
);

create table public.stage_module_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  stage_id uuid not null references public.stages (id) on delete cascade,
  stage_module_id uuid not null references public.stage_modules (id) on delete cascade,
  status text not null default 'in_progress',
  score numeric(5, 2),
  note text,
  assessed_by_profile_id uuid references public.profiles (id) on delete set null,
  assessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_module_progress_status_check check (status in ('observed', 'in_progress', 'passed', 'needs_attention')),
  constraint stage_module_progress_score_check check (score is null or score between 0 and 100),
  constraint stage_module_progress_id_tenant_unique unique (id, tenant_id),
  constraint stage_module_progress_unique_module unique (tenant_id, enrollment_id, stage_module_id),
  constraint stage_module_progress_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint stage_module_progress_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint stage_module_progress_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id) on delete cascade,
  constraint stage_module_progress_module_tenant_fk foreign key (stage_module_id, tenant_id) references public.stage_modules (id, tenant_id) on delete cascade
);

create table public.badge_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  awarded_by_profile_id uuid references public.profiles (id) on delete set null,
  source text not null default 'instructor',
  note text,
  status text not null default 'awarded',
  awarded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint badge_awards_source_check check (source in ('instructor', 'system', 'admin')),
  constraint badge_awards_status_check check (status in ('awarded', 'revoked')),
  constraint badge_awards_id_tenant_unique unique (id, tenant_id),
  constraint badge_awards_unique_active unique (tenant_id, badge_id, participant_id, enrollment_id),
  constraint badge_awards_badge_tenant_fk foreign key (badge_id, tenant_id) references public.badges (id, tenant_id) on delete cascade,
  constraint badge_awards_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint badge_awards_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create table public.achievement_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  badge_award_id uuid references public.badge_awards (id) on delete set null,
  progress_id uuid references public.progress (id) on delete set null,
  stage_module_progress_id uuid references public.stage_module_progress (id) on delete set null,
  card_type text not null default 'progress',
  title text not null,
  body text,
  status text not null default 'published',
  visibility text not null default 'parent_child',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint achievement_cards_type_check check (card_type in ('progress', 'badge', 'compliment', 'milestone')),
  constraint achievement_cards_status_check check (status in ('draft', 'published', 'archived')),
  constraint achievement_cards_visibility_check check (visibility in ('parent_child', 'parent_only', 'internal')),
  constraint achievement_cards_id_tenant_unique unique (id, tenant_id),
  constraint achievement_cards_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint achievement_cards_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  constraint achievement_cards_badge_award_tenant_fk foreign key (badge_award_id, tenant_id) references public.badge_awards (id, tenant_id),
  constraint achievement_cards_progress_tenant_fk foreign key (progress_id, tenant_id) references public.progress (id, tenant_id),
  constraint achievement_cards_module_progress_tenant_fk foreign key (stage_module_progress_id, tenant_id) references public.stage_module_progress (id, tenant_id)
);

create table public.stage_transition_proposals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  from_stage_id uuid references public.stages (id) on delete set null,
  to_stage_id uuid not null references public.stages (id) on delete restrict,
  proposed_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  reason text,
  status text not null default 'proposed',
  proposed_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_transition_proposals_status_check check (status in ('proposed', 'approved', 'rejected', 'applied', 'cancelled')),
  constraint stage_transition_proposals_id_tenant_unique unique (id, tenant_id),
  constraint stage_transition_proposals_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint stage_transition_proposals_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint stage_transition_proposals_from_stage_tenant_fk foreign key (from_stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint stage_transition_proposals_to_stage_tenant_fk foreign key (to_stage_id, tenant_id) references public.stages (id, tenant_id)
);

create index stage_modules_tenant_id_idx on public.stage_modules (tenant_id);
create index stage_modules_stage_id_idx on public.stage_modules (stage_id);
create index stage_module_progress_tenant_id_idx on public.stage_module_progress (tenant_id);
create index stage_module_progress_enrollment_id_idx on public.stage_module_progress (enrollment_id);
create index stage_module_progress_participant_id_idx on public.stage_module_progress (participant_id);
create index badge_awards_tenant_id_idx on public.badge_awards (tenant_id);
create index badge_awards_participant_id_idx on public.badge_awards (participant_id);
create index badge_awards_badge_id_idx on public.badge_awards (badge_id);
create index achievement_cards_participant_id_idx on public.achievement_cards (participant_id);
create index achievement_cards_tenant_status_idx on public.achievement_cards (tenant_id, status, published_at desc);
create index stage_transition_proposals_enrollment_id_idx on public.stage_transition_proposals (enrollment_id);
create index stage_transition_proposals_status_idx on public.stage_transition_proposals (tenant_id, status);

create trigger stage_modules_set_updated_at
  before update on public.stage_modules
  for each row execute function app_private.set_updated_at();

create trigger stage_module_progress_set_updated_at
  before update on public.stage_module_progress
  for each row execute function app_private.set_updated_at();

create trigger badge_awards_set_updated_at
  before update on public.badge_awards
  for each row execute function app_private.set_updated_at();

create trigger achievement_cards_set_updated_at
  before update on public.achievement_cards
  for each row execute function app_private.set_updated_at();

create trigger stage_transition_proposals_set_updated_at
  before update on public.stage_transition_proposals
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.stage_modules to authenticated;
grant select, insert, update on public.stage_module_progress to authenticated;
grant select, insert, update on public.badge_awards to authenticated;
grant select, insert, update on public.achievement_cards to authenticated;
grant select, insert, update on public.stage_transition_proposals to authenticated;
grant insert (tenant_id, program_id, stage_id, code, name, description, status) on public.badges to authenticated;
grant update (program_id, stage_id, code, name, description, status) on public.badges to authenticated;

grant all on public.stage_modules to service_role;
grant all on public.stage_module_progress to service_role;
grant all on public.badge_awards to service_role;
grant all on public.achievement_cards to service_role;
grant all on public.stage_transition_proposals to service_role;

alter table public.stage_modules enable row level security;
alter table public.stage_module_progress enable row level security;
alter table public.badge_awards enable row level security;
alter table public.achievement_cards enable row level security;
alter table public.stage_transition_proposals enable row level security;

create policy "Tenant members can view stage modules"
  on public.stage_modules
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can insert stage modules"
  on public.stage_modules
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update stage modules"
  on public.stage_modules
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

create policy "Participants and instruction team can view module progress"
  on public.stage_module_progress
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Instruction team can insert module progress"
  on public.stage_module_progress
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update module progress"
  on public.stage_module_progress
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Participants and instruction team can view badge awards"
  on public.badge_awards
  for select
  to authenticated
  using (app_private.current_user_can_access_participant(tenant_id, participant_id));

create policy "Instruction team can insert badge awards"
  on public.badge_awards
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update badge awards"
  on public.badge_awards
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Participants and instruction team can view achievement cards"
  on public.achievement_cards
  for select
  to authenticated
  using (
    status = 'published'
    and app_private.current_user_can_access_participant(tenant_id, participant_id)
  );

create policy "Instruction team can insert achievement cards"
  on public.achievement_cards
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update achievement cards"
  on public.achievement_cards
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Participants and instruction team can view stage transition proposals"
  on public.stage_transition_proposals
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Instruction team can insert stage transition proposals"
  on public.stage_transition_proposals
  for insert
  to authenticated
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Instruction team can update stage transition proposals"
  on public.stage_transition_proposals
  for update
  to authenticated
  using (app_private.current_user_can_manage_instruction(tenant_id))
  with check (app_private.current_user_can_manage_instruction(tenant_id));

create policy "Tenant staff can insert badge definitions"
  on public.badges
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update badge definitions"
  on public.badges
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

create or replace function app_private.notify_guardians_for_progress()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_enrollment public.enrollments%rowtype;
  target_participant public.participants%rowtype;
  target_stage public.stages%rowtype;
  guardian record;
begin
  select * into target_enrollment
  from public.enrollments
  where id = new.enrollment_id
    and tenant_id = new.tenant_id;

  if not found then
    return new;
  end if;

  select * into target_participant
  from public.participants
  where id = target_enrollment.participant_id
    and tenant_id = new.tenant_id;

  select * into target_stage
  from public.stages
  where id = new.stage_id
    and tenant_id = new.tenant_id;

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = target_enrollment.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      target_enrollment.participant_id,
      new.enrollment_id,
      'Nieuwe voortgang voor ' || coalesce(target_participant.display_name, 'leerling'),
      coalesce(target_stage.name, 'Voortgang') || ': ' || new.status || coalesce(' - score ' || new.score::text || '%', ''),
      'progress',
      'unread'
    );
  end loop;

  return new;
end $$;

create or replace function app_private.publish_stage_module_progress()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_module public.stage_modules%rowtype;
  target_participant public.participants%rowtype;
  guardian record;
begin
  if tg_op = 'UPDATE'
    and old.status is not distinct from new.status
    and old.score is not distinct from new.score
    and old.note is not distinct from new.note then
    return new;
  end if;

  select * into target_module
  from public.stage_modules
  where id = new.stage_module_id
    and tenant_id = new.tenant_id;

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  if new.status = 'passed'
    and not exists (
      select 1
      from public.achievement_cards
      where tenant_id = new.tenant_id
        and stage_module_progress_id = new.id
        and status <> 'archived'
    ) then
    insert into public.achievement_cards (
      tenant_id,
      participant_id,
      enrollment_id,
      stage_module_progress_id,
      card_type,
      title,
      body,
      status,
      visibility
    )
    values (
      new.tenant_id,
      new.participant_id,
      new.enrollment_id,
      new.id,
      'progress',
      coalesce(target_module.name, 'Module') || ' behaald',
      coalesce(target_participant.display_name, 'Leerling') || ' heeft een onderdeel afgerond.',
      'published',
      'parent_child'
    );
  end if;

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      new.participant_id,
      new.enrollment_id,
      'Module-update voor ' || coalesce(target_participant.display_name, 'leerling'),
      coalesce(target_module.name, 'Module') || ': ' || new.status || coalesce(' - score ' || new.score::text || '%', ''),
      'progress',
      'unread'
    );
  end loop;

  return new;
end $$;

create or replace function app_private.publish_badge_award()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_badge public.badges%rowtype;
  target_participant public.participants%rowtype;
  guardian record;
begin
  select * into target_badge
  from public.badges
  where id = new.badge_id
    and tenant_id = new.tenant_id;

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  insert into public.achievement_cards (
    tenant_id,
    participant_id,
    enrollment_id,
    badge_award_id,
    card_type,
    title,
    body,
    status,
    visibility
  )
  values (
    new.tenant_id,
    new.participant_id,
    new.enrollment_id,
    new.id,
    'badge',
    coalesce(target_badge.name, 'Nieuwe badge'),
    coalesce(new.note, target_badge.description, 'Er is een nieuwe badge verdiend.'),
    'published',
    'parent_child'
  );

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      new.participant_id,
      new.enrollment_id,
      coalesce(target_participant.display_name, 'Leerling') || ' heeft een badge verdiend',
      coalesce(target_badge.name, 'Nieuwe badge') || coalesce(': ' || new.note, ''),
      'progress',
      'unread'
    );
  end loop;

  return new;
end $$;

create trigger progress_notify_guardians
  after insert on public.progress
  for each row execute function app_private.notify_guardians_for_progress();

create trigger stage_module_progress_publish
  after insert or update on public.stage_module_progress
  for each row execute function app_private.publish_stage_module_progress();

create trigger badge_awards_publish
  after insert on public.badge_awards
  for each row execute function app_private.publish_badge_award();

do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
  badje_1_stage_id uuid;
  badje_2_stage_id uuid;
  badje_3_stage_id uuid;
  water_module_id uuid;
  drijven_module_id uuid;
  ademhaling_module_id uuid;
  emma_id uuid;
  emma_enrollment_id uuid;
  noah_id uuid;
  noah_enrollment_id uuid;
  waterheld_badge_id uuid;
  super_drijver_badge_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  select id into diploma_a_program_id
  from public.programs
  where tenant_id = demo_tenant_id
    and code = 'zwemdiploma-a';

  select id into badje_1_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and code = 'badje-1';

  select id into badje_2_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and code = 'badje-2';

  select id into badje_3_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and code = 'badje-3';

  if diploma_a_program_id is null or badje_1_stage_id is null then
    return;
  end if;

  insert into public.stage_modules (tenant_id, program_id, stage_id, code, name, description, sort_order, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_1_stage_id, 'watergewenning', 'Watergewenning', 'Ontspannen en veilig bewegen in het water.', 10, 'active')
  on conflict (tenant_id, stage_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        sort_order = excluded.sort_order,
        status = excluded.status
  returning id into water_module_id;

  insert into public.stage_modules (tenant_id, program_id, stage_id, code, name, description, sort_order, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_1_stage_id, 'drijven', 'Drijven', 'Zelfstandig drijven op buik en rug.', 20, 'active')
  on conflict (tenant_id, stage_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        sort_order = excluded.sort_order,
        status = excluded.status
  returning id into drijven_module_id;

  insert into public.stage_modules (tenant_id, program_id, stage_id, code, name, description, sort_order, status)
  values
    (demo_tenant_id, diploma_a_program_id, badje_2_stage_id, 'ademhaling', 'Ademhaling', 'Rustig uitblazen onder water en ritme vinden.', 10, 'active')
  on conflict (tenant_id, stage_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        sort_order = excluded.sort_order,
        status = excluded.status
  returning id into ademhaling_module_id;

  select id into emma_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-emma-devries';

  select id into noah_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-noah-bakker';

  select id into emma_enrollment_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = emma_id
  limit 1;

  select id into noah_enrollment_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = noah_id
  limit 1;

  select id into waterheld_badge_id
  from public.badges
  where tenant_id = demo_tenant_id
    and code = 'waterheld';

  select id into super_drijver_badge_id
  from public.badges
  where tenant_id = demo_tenant_id
    and code = 'super-drijver';

  if emma_enrollment_id is not null and emma_id is not null and water_module_id is not null then
    insert into public.stage_module_progress (
      tenant_id,
      enrollment_id,
      participant_id,
      stage_id,
      stage_module_id,
      status,
      score,
      note,
      assessed_at
    )
    values (
      demo_tenant_id,
      emma_enrollment_id,
      emma_id,
      badje_1_stage_id,
      water_module_id,
      'passed',
      92,
      'Demo: Emma beweegt ontspannen door het water.',
      now()
    )
    on conflict (tenant_id, enrollment_id, stage_module_id) do update
      set status = excluded.status,
          score = excluded.score,
          note = excluded.note,
          assessed_at = excluded.assessed_at;

    if waterheld_badge_id is not null then
      insert into public.badge_awards (
        tenant_id,
        badge_id,
        participant_id,
        enrollment_id,
        source,
        note,
        status
      )
      values (
        demo_tenant_id,
        waterheld_badge_id,
        emma_id,
        emma_enrollment_id,
        'system',
        'Demo: watergewenning afgerond.',
        'awarded'
      )
      on conflict (tenant_id, badge_id, participant_id, enrollment_id) do nothing;
    end if;
  end if;

  if noah_enrollment_id is not null and noah_id is not null and ademhaling_module_id is not null then
    insert into public.stage_module_progress (
      tenant_id,
      enrollment_id,
      participant_id,
      stage_id,
      stage_module_id,
      status,
      score,
      note,
      assessed_at
    )
    values (
      demo_tenant_id,
      noah_enrollment_id,
      noah_id,
      badje_2_stage_id,
      ademhaling_module_id,
      'passed',
      88,
      'Demo: ademhaling is stabiel genoeg voor de volgende stap.',
      now()
    )
    on conflict (tenant_id, enrollment_id, stage_module_id) do update
      set status = excluded.status,
          score = excluded.score,
          note = excluded.note,
          assessed_at = excluded.assessed_at;

    if super_drijver_badge_id is not null then
      insert into public.badge_awards (
        tenant_id,
        badge_id,
        participant_id,
        enrollment_id,
        source,
        note,
        status
      )
      values (
        demo_tenant_id,
        super_drijver_badge_id,
        noah_id,
        noah_enrollment_id,
        'system',
        'Demo: mooie controle in Badje 2.',
        'awarded'
      )
      on conflict (tenant_id, badge_id, participant_id, enrollment_id) do nothing;
    end if;

    if badje_3_stage_id is not null then
      insert into public.stage_transition_proposals (
        tenant_id,
        enrollment_id,
        participant_id,
        from_stage_id,
        to_stage_id,
        reason,
        status
      )
      values (
        demo_tenant_id,
        noah_enrollment_id,
        noah_id,
        badje_2_stage_id,
        badje_3_stage_id,
        'Demo: module-progress en score wijzen op doorstroom naar Badje 3. Subscription blijft ongewijzigd.',
        'proposed'
      );
    end if;
  end if;
end $$;
