-- Persistent curriculum wizard, deterministic validation and explicit,
-- previewable curriculum migration. All payloads are structured JSON; no
-- tenant-provided executable code is evaluated.

alter table public.tenant_swim_rollouts
  drop constraint tenant_swim_rollouts_feature_key_check,
  add constraint tenant_swim_rollouts_feature_key_check
    check (feature_key ~ '^swim\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$');

alter table public.swim_assessment_observations
  drop constraint swim_assessment_observations_source_check,
  add constraint swim_assessment_observations_source_check
    check (source in (
      'manual',
      'offline',
      'import',
      'admin_command',
      'carryover_command',
      'curriculum_migration'
    ));

create table public.curriculum_draft_revisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  curriculum_version_id uuid not null,
  revision integer not null,
  wizard_step text not null,
  payload_json jsonb not null default '{}'::jsonb,
  saved_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint curriculum_draft_revisions_version_fk
    foreign key (tenant_id, curriculum_version_id)
    references public.curriculum_versions (tenant_id, id) on delete cascade,
  constraint curriculum_draft_revisions_revision_check check (revision > 0),
  constraint curriculum_draft_revisions_payload_check check (jsonb_typeof(payload_json) = 'object'),
  constraint curriculum_draft_revisions_unique unique (tenant_id, curriculum_version_id, revision),
  constraint curriculum_draft_revisions_tenant_id_id_unique unique (tenant_id, id)
);

create index curriculum_draft_revisions_version_idx
  on public.curriculum_draft_revisions (tenant_id, curriculum_version_id, revision desc);

create or replace function app_private.user_has_swim_permission(
  target_user_id uuid,
  target_tenant_id uuid,
  target_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  membership_role text;
  explicit_grant boolean;
begin
  if target_user_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.role in ('platform_owner', 'platform_admin')
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.platform_memberships membership
    where membership.user_id = target_user_id
      and membership.status = 'active'
      and membership.role = 'platform_support'
  ) then
    return target_permission_key like '%.read';
  end if;

  select membership.role
    into membership_role
  from public.tenant_memberships membership
  where membership.tenant_id = target_tenant_id
    and membership.user_id = target_user_id
    and membership.status = 'active'
  order by case membership.role
    when 'tenant_owner' then 1
    when 'tenant_admin' then 2
    when 'coordinator' then 3
    when 'tenant_staff' then 4
    when 'instructor' then 5
    when 'parent' then 6
    else 7
  end
  limit 1;

  if membership_role is null then
    return false;
  end if;

  select override.is_granted
    into explicit_grant
  from public.tenant_role_permission_overrides override
  where override.tenant_id = target_tenant_id
    and override.role = membership_role
    and override.permission_key = target_permission_key;

  if explicit_grant is not null then
    return explicit_grant;
  end if;
  if membership_role in ('tenant_owner', 'tenant_admin') then
    return true;
  end if;
  if membership_role in ('coordinator', 'tenant_staff') then
    return target_permission_key not in ('curriculum.publish', 'badge.publish');
  end if;
  if membership_role = 'instructor' then
    return target_permission_key in (
      'curriculum.read',
      'assessment.read',
      'assessment.record',
      'assessment.correct',
      'transition.review',
      'carryover.complete_previous',
      'badge.read',
      'badge.award',
      'group.read'
    );
  end if;
  return target_permission_key in ('curriculum.read', 'assessment.read', 'badge.read', 'group.read');
end;
$$;

revoke all on function app_private.user_has_swim_permission(uuid, uuid, text) from public, anon, authenticated;
grant execute on function app_private.user_has_swim_permission(uuid, uuid, text) to service_role;

create or replace function app_private.assert_swim_command_actor(actor_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app_private.current_request_is_service_role()
    and actor_user_id is distinct from (select auth.uid())
  then
    raise exception 'Actor mismatch';
  end if;
end;
$$;

revoke all on function app_private.assert_swim_command_actor(uuid) from public, anon, authenticated;
grant execute on function app_private.assert_swim_command_actor(uuid) to service_role;

create or replace function app_private.current_user_has_swim_permission(
  target_tenant_id uuid,
  target_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app_private.user_has_swim_permission(
    (select auth.uid()),
    target_tenant_id,
    target_permission_key
  );
$$;

revoke all on function app_private.current_user_has_swim_permission(uuid, text) from public, anon;
grant execute on function app_private.current_user_has_swim_permission(uuid, text) to authenticated, service_role;

create or replace function app_private.create_curriculum_draft(
  target_tenant_id uuid,
  target_program_id uuid,
  target_name text,
  clone_latest boolean,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version_id uuid;
  target_version_number integer;
  source_version public.curriculum_versions%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  source_stage record;
  source_competency record;
  source_item record;
  source_link record;
  source_rule record;
  source_requirement record;
  new_stage_id uuid;
  new_competency_id uuid;
  new_item_id uuid;
  mapped_target_id uuid;
  stage_map jsonb := '{}'::jsonb;
  competency_map jsonb := '{}'::jsonb;
  item_map jsonb := '{}'::jsonb;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if not app_private.user_has_swim_permission(actor_user_id, target_tenant_id, 'curriculum.draft.manage') then
    raise exception 'Insufficient curriculum draft permission';
  end if;
  if length(trim(coalesce(target_name, ''))) < 3 then
    raise exception 'Curriculum name must contain at least three characters';
  end if;

  perform 1
  from public.programs program
  where program.tenant_id = target_tenant_id
    and program.id = target_program_id
  for update;
  if not found then
    raise exception 'Program not found in tenant';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_program_id::text, trim(target_name), clone_latest::text),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'curriculum.draft.create'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  select coalesce(max(version.version_number), 0) + 1
    into target_version_number
  from public.curriculum_versions version
  where version.tenant_id = target_tenant_id
    and version.program_id = target_program_id;

  if clone_latest then
    select * into source_version
    from public.curriculum_versions version
    where version.tenant_id = target_tenant_id
      and version.program_id = target_program_id
      and version.status = 'published'
    order by version.version_number desc
    limit 1;
  end if;

  insert into public.curriculum_versions (
    tenant_id,
    program_id,
    version_number,
    name,
    weighting_enabled,
    wizard_step,
    wizard_state_json,
    source_version_id,
    created_by_user_id
  ) values (
    target_tenant_id,
    target_program_id,
    target_version_number,
    trim(target_name),
    coalesce(source_version.weighting_enabled, false),
    'framework',
    jsonb_build_object(
      'createdFrom', source_version.id,
      'cloneLatest', clone_latest,
      'formulaVersion', 'swim_progress_v3'
    ),
    source_version.id,
    actor_user_id
  )
  returning id into target_version_id;

  if source_version.id is not null then
    for source_stage in
      select * from public.curriculum_stages
      where curriculum_version_id = source_version.id
      order by sort_order, id
    loop
      new_stage_id := gen_random_uuid();
      insert into public.curriculum_stages (
        id, tenant_id, curriculum_version_id, legacy_stage_id, stable_key,
        name, description, color_hex, sort_order
      ) values (
        new_stage_id, target_tenant_id, target_version_id, source_stage.legacy_stage_id,
        source_stage.stable_key, source_stage.name, source_stage.description,
        source_stage.color_hex, source_stage.sort_order
      );
      stage_map := stage_map || jsonb_build_object(source_stage.id::text, new_stage_id::text);
    end loop;

    for source_competency in
      select * from public.curriculum_competencies
      where curriculum_version_id = source_version.id
      order by sort_order, id
    loop
      new_competency_id := gen_random_uuid();
      insert into public.curriculum_competencies (
        id, tenant_id, curriculum_version_id, stable_key, name, description, sort_order
      ) values (
        new_competency_id, target_tenant_id, target_version_id,
        source_competency.stable_key, source_competency.name,
        source_competency.description, source_competency.sort_order
      );
      competency_map := competency_map
        || jsonb_build_object(source_competency.id::text, new_competency_id::text);
    end loop;

    for source_item in
      select * from public.curriculum_items
      where curriculum_version_id = source_version.id
      order by sort_order, id
    loop
      new_item_id := gen_random_uuid();
      insert into public.curriculum_items (
        id, tenant_id, curriculum_version_id, curriculum_stage_id, identity_id,
        legacy_progress_item_id, name, description, context_json, weight,
        mastery_threshold, contributes_to_stage, contributes_to_diploma,
        required_for_transition, required_for_graduation, sort_order
      ) values (
        new_item_id,
        target_tenant_id,
        target_version_id,
        (stage_map ->> source_item.curriculum_stage_id::text)::uuid,
        source_item.identity_id,
        source_item.legacy_progress_item_id,
        source_item.name,
        source_item.description,
        source_item.context_json,
        source_item.weight,
        source_item.mastery_threshold,
        source_item.contributes_to_stage,
        source_item.contributes_to_diploma,
        source_item.required_for_transition,
        source_item.required_for_graduation,
        source_item.sort_order
      );
      item_map := item_map || jsonb_build_object(source_item.id::text, new_item_id::text);
    end loop;

    for source_link in
      select * from public.curriculum_item_competencies
      where curriculum_version_id = source_version.id
    loop
      insert into public.curriculum_item_competencies (
        tenant_id, curriculum_version_id, curriculum_item_id,
        competency_id, contribution_weight
      ) values (
        target_tenant_id,
        target_version_id,
        (item_map ->> source_link.curriculum_item_id::text)::uuid,
        (competency_map ->> source_link.competency_id::text)::uuid,
        source_link.contribution_weight
      );
    end loop;

    for source_rule in
      select * from public.curriculum_transition_rules
      where curriculum_version_id = source_version.id
      order by sort_order, id
    loop
      insert into public.curriculum_transition_rules (
        tenant_id, curriculum_version_id, from_stage_id, to_stage_id,
        rule_key, rule_json, approval_required, sort_order
      ) values (
        target_tenant_id,
        target_version_id,
        (stage_map ->> source_rule.from_stage_id::text)::uuid,
        case when source_rule.to_stage_id is null then null
          else (stage_map ->> source_rule.to_stage_id::text)::uuid end,
        source_rule.rule_key,
        source_rule.rule_json,
        source_rule.approval_required,
        source_rule.sort_order
      );
    end loop;

    for source_requirement in
      select * from public.curriculum_graduation_requirements
      where curriculum_version_id = source_version.id
      order by sort_order, id
    loop
      mapped_target_id := case source_requirement.requirement_kind
        when 'item' then (item_map ->> source_requirement.target_id::text)::uuid
        when 'competency' then (competency_map ->> source_requirement.target_id::text)::uuid
        when 'stage' then (stage_map ->> source_requirement.target_id::text)::uuid
        else source_requirement.target_id
      end;
      insert into public.curriculum_graduation_requirements (
        tenant_id, curriculum_version_id, requirement_key, requirement_kind,
        target_id, threshold, rule_json, sort_order
      ) values (
        target_tenant_id,
        target_version_id,
        source_requirement.requirement_key,
        source_requirement.requirement_kind,
        mapped_target_id,
        source_requirement.threshold,
        source_requirement.rule_json,
        source_requirement.sort_order
      );
    end loop;
  end if;

  insert into public.curriculum_draft_revisions (
    tenant_id, curriculum_version_id, revision, wizard_step, payload_json, saved_by_user_id
  ) values (
    target_tenant_id,
    target_version_id,
    1,
    'framework',
    jsonb_build_object('name', trim(target_name), 'sourceVersionId', source_version.id),
    actor_user_id
  );

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_tenant_id,
    target_idempotency_key,
    'curriculum.draft.create',
    'curriculum_version',
    target_version_id,
    actor_user_id,
    request_hash,
    jsonb_build_object(
      'curriculumVersionId', target_version_id,
      'versionNumber', target_version_number,
      'sourceVersionId', source_version.id
    )
  );

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, after_json
  ) values (
    target_tenant_id,
    actor_user_id,
    'curriculum.draft.manage',
    'curriculum.draft_created',
    'curriculum_version',
    target_version_id,
    jsonb_build_object('versionNumber', target_version_number, 'sourceVersionId', source_version.id)
  );

  return target_version_id;
end;
$$;

revoke all on function app_private.create_curriculum_draft(uuid, uuid, text, boolean, uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.create_curriculum_draft(uuid, uuid, text, boolean, uuid, text)
  to service_role;

create or replace function app_private.save_curriculum_draft_step(
  target_version_id uuid,
  expected_revision integer,
  target_step text,
  target_entity_id uuid,
  target_payload jsonb,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version public.curriculum_versions%rowtype;
  saved_entity_id uuid := target_entity_id;
  target_identity_id uuid;
  target_stage_id uuid;
  target_competency_id uuid;
  target_stable_key text;
  target_name text;
  target_context jsonb;
  target_weight numeric;
  target_threshold integer;
  target_sort integer;
  target_competency_ids jsonb;
  transition_threshold integer;
  graduation_threshold integer;
  coverage_percent integer;
  carryover_mode text;
  stage_row record;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  if jsonb_typeof(target_payload) <> 'object' then
    raise exception 'Wizard payload must be a structured object';
  end if;

  select * into target_version
  from public.curriculum_versions version
  where version.id = target_version_id
  for update;
  if target_version.id is null or target_version.status <> 'draft' then
    raise exception 'Editable curriculum draft not found';
  end if;
  if target_version.revision <> expected_revision then
    raise exception 'Curriculum draft revision conflict';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id,
    target_version.tenant_id,
    'curriculum.draft.manage'
  ) then
    raise exception 'Insufficient curriculum draft permission';
  end if;
  if target_step not in ('framework', 'stages', 'competencies', 'items', 'policies') then
    raise exception 'Unsupported curriculum wizard step';
  end if;

  if target_step = 'framework' then
    target_name := trim(coalesce(target_payload ->> 'name', ''));
    if length(target_name) < 3 then
      raise exception 'Curriculum name must contain at least three characters';
    end if;
    update public.curriculum_versions
    set name = target_name,
        weighting_enabled = coalesce((target_payload ->> 'weightingEnabled')::boolean, false),
        wizard_state_json = wizard_state_json || jsonb_build_object(
          'framework', jsonb_build_object(
            'diplomaCode', nullif(trim(target_payload ->> 'diplomaCode'), ''),
            'description', nullif(trim(target_payload ->> 'description'), '')
          )
        )
    where id = target_version_id;

  elsif target_step = 'stages' then
    target_stable_key := trim(coalesce(target_payload ->> 'stableKey', ''));
    target_name := trim(coalesce(target_payload ->> 'name', ''));
    target_sort := coalesce((target_payload ->> 'sortOrder')::integer, 0);
    if target_stable_key !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' or length(target_name) < 2 then
      raise exception 'Stage key or name is invalid';
    end if;
    if saved_entity_id is null then
      insert into public.curriculum_stages (
        tenant_id, curriculum_version_id, legacy_stage_id, stable_key,
        name, description, color_hex, sort_order
      ) values (
        target_version.tenant_id,
        target_version_id,
        nullif(target_payload ->> 'legacyStageId', '')::uuid,
        target_stable_key,
        target_name,
        nullif(trim(target_payload ->> 'description'), ''),
        nullif(trim(target_payload ->> 'colorHex'), ''),
        target_sort
      )
      returning id into saved_entity_id;
    else
      update public.curriculum_stages
      set legacy_stage_id = nullif(target_payload ->> 'legacyStageId', '')::uuid,
          stable_key = target_stable_key,
          name = target_name,
          description = nullif(trim(target_payload ->> 'description'), ''),
          color_hex = nullif(trim(target_payload ->> 'colorHex'), ''),
          sort_order = target_sort
      where tenant_id = target_version.tenant_id
        and curriculum_version_id = target_version_id
        and id = saved_entity_id;
      if not found then raise exception 'Stage not found in curriculum draft'; end if;
    end if;

  elsif target_step = 'competencies' then
    target_stable_key := trim(coalesce(target_payload ->> 'stableKey', ''));
    target_name := trim(coalesce(target_payload ->> 'name', ''));
    target_sort := coalesce((target_payload ->> 'sortOrder')::integer, 0);
    if target_stable_key !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' or length(target_name) < 2 then
      raise exception 'Competency key or name is invalid';
    end if;
    if saved_entity_id is null then
      insert into public.curriculum_competencies (
        tenant_id, curriculum_version_id, stable_key, name, description, sort_order
      ) values (
        target_version.tenant_id,
        target_version_id,
        target_stable_key,
        target_name,
        nullif(trim(target_payload ->> 'description'), ''),
        target_sort
      )
      returning id into saved_entity_id;
    else
      update public.curriculum_competencies
      set stable_key = target_stable_key,
          name = target_name,
          description = nullif(trim(target_payload ->> 'description'), ''),
          sort_order = target_sort
      where tenant_id = target_version.tenant_id
        and curriculum_version_id = target_version_id
        and id = saved_entity_id;
      if not found then raise exception 'Competency not found in curriculum draft'; end if;
    end if;

  elsif target_step = 'items' then
    target_stage_id := (target_payload ->> 'stageId')::uuid;
    target_stable_key := trim(coalesce(target_payload ->> 'stableKey', ''));
    target_name := trim(coalesce(target_payload ->> 'name', ''));
    target_weight := coalesce((target_payload ->> 'weight')::numeric, 1);
    target_threshold := coalesce((target_payload ->> 'masteryThreshold')::integer, 4);
    target_sort := coalesce((target_payload ->> 'sortOrder')::integer, 0);
    target_context := coalesce(target_payload -> 'context', '{}'::jsonb);
    target_competency_ids := coalesce(target_payload -> 'competencyIds', '[]'::jsonb);
    if target_stable_key !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$'
      or length(target_name) < 2
      or target_weight <= 0
      or target_threshold not between 1 and 5
      or jsonb_typeof(target_context) <> 'object'
      or jsonb_typeof(target_competency_ids) <> 'array'
    then
      raise exception 'Curriculum item payload is invalid';
    end if;
    if not exists (
      select 1 from public.curriculum_stages stage
      where stage.tenant_id = target_version.tenant_id
        and stage.curriculum_version_id = target_version_id
        and stage.id = target_stage_id
    ) then
      raise exception 'Item stage is outside curriculum draft';
    end if;

    insert into public.curriculum_item_identities (
      tenant_id, program_id, stable_key
    ) values (
      target_version.tenant_id, target_version.program_id, target_stable_key
    )
    on conflict (tenant_id, program_id, stable_key)
    do update set stable_key = excluded.stable_key
    returning id into target_identity_id;

    if saved_entity_id is null then
      insert into public.curriculum_items (
        tenant_id, curriculum_version_id, curriculum_stage_id, identity_id,
        name, description, context_json, weight, mastery_threshold,
        contributes_to_stage, contributes_to_diploma,
        required_for_transition, required_for_graduation, sort_order
      ) values (
        target_version.tenant_id,
        target_version_id,
        target_stage_id,
        target_identity_id,
        target_name,
        nullif(trim(target_payload ->> 'description'), ''),
        target_context,
        target_weight,
        target_threshold,
        coalesce((target_payload ->> 'contributesToStage')::boolean, true),
        coalesce((target_payload ->> 'contributesToDiploma')::boolean, true),
        coalesce((target_payload ->> 'requiredForTransition')::boolean, true),
        coalesce((target_payload ->> 'requiredForGraduation')::boolean, true),
        target_sort
      )
      returning id into saved_entity_id;
    else
      update public.curriculum_items
      set curriculum_stage_id = target_stage_id,
          identity_id = target_identity_id,
          name = target_name,
          description = nullif(trim(target_payload ->> 'description'), ''),
          context_json = target_context,
          weight = target_weight,
          mastery_threshold = target_threshold,
          contributes_to_stage = coalesce((target_payload ->> 'contributesToStage')::boolean, true),
          contributes_to_diploma = coalesce((target_payload ->> 'contributesToDiploma')::boolean, true),
          required_for_transition = coalesce((target_payload ->> 'requiredForTransition')::boolean, true),
          required_for_graduation = coalesce((target_payload ->> 'requiredForGraduation')::boolean, true),
          sort_order = target_sort
      where tenant_id = target_version.tenant_id
        and curriculum_version_id = target_version_id
        and id = saved_entity_id;
      if not found then raise exception 'Item not found in curriculum draft'; end if;
    end if;

    delete from public.curriculum_item_competencies
    where tenant_id = target_version.tenant_id
      and curriculum_version_id = target_version_id
      and curriculum_item_id = saved_entity_id;
    for target_competency_id in
      select value::uuid
      from jsonb_array_elements_text(target_competency_ids)
    loop
      if not exists (
        select 1 from public.curriculum_competencies competency
        where competency.tenant_id = target_version.tenant_id
          and competency.curriculum_version_id = target_version_id
          and competency.id = target_competency_id
      ) then
        raise exception 'Item competency is outside curriculum draft';
      end if;
      insert into public.curriculum_item_competencies (
        tenant_id, curriculum_version_id, curriculum_item_id, competency_id
      ) values (
        target_version.tenant_id, target_version_id, saved_entity_id, target_competency_id
      );
    end loop;

  elsif target_step = 'policies' then
    transition_threshold := coalesce((target_payload ->> 'transitionThreshold')::integer, 4);
    graduation_threshold := coalesce((target_payload ->> 'graduationThreshold')::integer, 4);
    coverage_percent := coalesce((target_payload ->> 'coveragePercent')::integer, 100);
    carryover_mode := coalesce(target_payload ->> 'carryoverMode', 'reference_open_items');
    if transition_threshold not between 1 and 5
      or graduation_threshold not between 1 and 5
      or coverage_percent not between 1 and 100
      or carryover_mode <> 'reference_open_items'
    then
      raise exception 'Curriculum policy is invalid';
    end if;

    delete from public.curriculum_transition_rules
    where tenant_id = target_version.tenant_id
      and curriculum_version_id = target_version_id;
    delete from public.curriculum_graduation_requirements
    where tenant_id = target_version.tenant_id
      and curriculum_version_id = target_version_id;

    for stage_row in
      select
        stage.id,
        stage.stable_key,
        stage.sort_order,
        lead(stage.id) over (order by stage.sort_order, stage.id) as next_stage_id
      from public.curriculum_stages stage
      where stage.tenant_id = target_version.tenant_id
        and stage.curriculum_version_id = target_version_id
      order by stage.sort_order, stage.id
    loop
      if stage_row.next_stage_id is not null then
        insert into public.curriculum_transition_rules (
          tenant_id, curriculum_version_id, from_stage_id, to_stage_id,
          rule_key, rule_json, approval_required, sort_order
        ) values (
          target_version.tenant_id,
          target_version_id,
          stage_row.id,
          stage_row.next_stage_id,
          'transition_' || stage_row.stable_key,
          jsonb_build_object(
            'kind', 'stage_threshold',
            'minimumRating', transition_threshold,
            'minimumCoveragePercent', coverage_percent,
            'carryoverMode', carryover_mode,
            'automaticMove', false
          ),
          true,
          stage_row.sort_order
        );
      end if;
    end loop;

    insert into public.curriculum_graduation_requirements (
      tenant_id, curriculum_version_id, requirement_key, requirement_kind,
      threshold, rule_json, sort_order
    ) values
      (
        target_version.tenant_id,
        target_version_id,
        'diploma_coverage',
        'coverage',
        null,
        jsonb_build_object(
          'minimumCoveragePercent', coverage_percent,
          'minimumRating', graduation_threshold,
          'automaticCredential', false
        ),
        10
      ),
      (
        target_version.tenant_id,
        target_version_id,
        'human_graduation_review',
        'manual_review',
        null,
        jsonb_build_object('kind', 'manual_review', 'required', true),
        20
      );
    update public.curriculum_versions
    set wizard_state_json = wizard_state_json || jsonb_build_object(
      'policies',
      jsonb_build_object(
        'transitionThreshold', transition_threshold,
        'graduationThreshold', graduation_threshold,
        'coveragePercent', coverage_percent,
        'carryoverMode', carryover_mode
      )
    )
    where id = target_version_id;
  end if;

  update public.curriculum_versions
  set revision = revision + 1,
      wizard_step = target_step
  where id = target_version_id
  returning revision into expected_revision;

  insert into public.curriculum_draft_revisions (
    tenant_id, curriculum_version_id, revision, wizard_step, payload_json, saved_by_user_id
  ) values (
    target_version.tenant_id,
    target_version_id,
    expected_revision,
    target_step,
    target_payload || jsonb_build_object('entityId', saved_entity_id),
    actor_user_id
  );

  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, after_json
  ) values (
    target_version.tenant_id,
    actor_user_id,
    'curriculum.draft.manage',
    'curriculum.draft_step_saved',
    'curriculum_version',
    target_version_id,
    jsonb_build_object('step', target_step, 'revision', expected_revision, 'entityId', saved_entity_id)
  );

  return jsonb_build_object('entityId', saved_entity_id, 'revision', expected_revision);
end;
$$;

revoke all on function app_private.save_curriculum_draft_step(uuid, integer, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function app_private.save_curriculum_draft_step(uuid, integer, text, uuid, jsonb, uuid)
  to service_role;

create or replace function app_private.validate_curriculum_draft(
  target_version_id uuid,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version public.curriculum_versions%rowtype;
  target_validation_id uuid;
  stage_count integer;
  item_count integer;
  competency_count integer;
  empty_stage_count integer;
  unlinked_competency_count integer;
  transition_gap_count integer;
  requirement_count integer;
  active_enrollment_count integer;
  coverage_matrix jsonb;
  competency_matrix jsonb;
  findings jsonb := '[]'::jsonb;
  diff_json jsonb;
  is_valid boolean;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  select * into target_version
  from public.curriculum_versions version
  where version.id = target_version_id;
  if target_version.id is null or target_version.status <> 'draft' then
    raise exception 'Curriculum draft not found';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id,
    target_version.tenant_id,
    'curriculum.draft.manage'
  ) then
    raise exception 'Insufficient curriculum validation permission';
  end if;

  select count(*) into stage_count
  from public.curriculum_stages stage
  where stage.curriculum_version_id = target_version_id;
  select count(*) into item_count
  from public.curriculum_items item
  where item.curriculum_version_id = target_version_id;
  select count(*) into competency_count
  from public.curriculum_competencies competency
  where competency.curriculum_version_id = target_version_id;
  select count(*) into empty_stage_count
  from public.curriculum_stages stage
  where stage.curriculum_version_id = target_version_id
    and not exists (
      select 1 from public.curriculum_items item
      where item.curriculum_version_id = target_version_id
        and item.curriculum_stage_id = stage.id
        and item.contributes_to_stage
    );
  select count(*) into unlinked_competency_count
  from public.curriculum_competencies competency
  where competency.curriculum_version_id = target_version_id
    and not exists (
      select 1 from public.curriculum_item_competencies link
      where link.curriculum_version_id = target_version_id
        and link.competency_id = competency.id
    );
  select greatest(stage_count - 1, 0) - count(*) into transition_gap_count
  from public.curriculum_transition_rules rule
  where rule.curriculum_version_id = target_version_id
    and rule.to_stage_id is not null;
  select count(*) into requirement_count
  from public.curriculum_graduation_requirements requirement
  where requirement.curriculum_version_id = target_version_id
    and requirement.requirement_kind in ('coverage', 'manual_review');
  select count(*) into active_enrollment_count
  from public.enrollments enrollment
  where enrollment.tenant_id = target_version.tenant_id
    and enrollment.curriculum_version_id = target_version.source_version_id
    and enrollment.status = 'active';

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'stageId', stage.id,
      'stableKey', stage.stable_key,
      'name', stage.name,
      'itemCount', (
        select count(*) from public.curriculum_items item
        where item.curriculum_stage_id = stage.id
      ),
      'requiredTransitionCount', (
        select count(*) from public.curriculum_items item
        where item.curriculum_stage_id = stage.id and item.required_for_transition
      ),
      'requiredDiplomaCount', (
        select count(*) from public.curriculum_items item
        where item.curriculum_stage_id = stage.id and item.required_for_graduation
      )
    ) order by stage.sort_order, stage.id
  ), '[]'::jsonb) into coverage_matrix
  from public.curriculum_stages stage
  where stage.curriculum_version_id = target_version_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'competencyId', competency.id,
      'stableKey', competency.stable_key,
      'name', competency.name,
      'linkedItemCount', (
        select count(*) from public.curriculum_item_competencies link
        where link.competency_id = competency.id
      )
    ) order by competency.sort_order, competency.id
  ), '[]'::jsonb) into competency_matrix
  from public.curriculum_competencies competency
  where competency.curriculum_version_id = target_version_id;

  if stage_count = 0 then
    findings := findings || jsonb_build_array(jsonb_build_object('code', 'no_stages', 'severity', 'error'));
  end if;
  if item_count = 0 then
    findings := findings || jsonb_build_array(jsonb_build_object('code', 'no_items', 'severity', 'error'));
  end if;
  if empty_stage_count > 0 then
    findings := findings || jsonb_build_array(jsonb_build_object(
      'code', 'empty_stages', 'severity', 'error', 'count', empty_stage_count
    ));
  end if;
  if competency_count = 0 then
    findings := findings || jsonb_build_array(jsonb_build_object('code', 'no_competencies', 'severity', 'error'));
  elsif unlinked_competency_count > 0 then
    findings := findings || jsonb_build_array(jsonb_build_object(
      'code', 'unlinked_competencies', 'severity', 'error', 'count', unlinked_competency_count
    ));
  end if;
  if transition_gap_count <> 0 then
    findings := findings || jsonb_build_array(jsonb_build_object(
      'code', 'transition_gaps', 'severity', 'error', 'count', transition_gap_count
    ));
  end if;
  if requirement_count < 2 then
    findings := findings || jsonb_build_array(jsonb_build_object(
      'code', 'graduation_contract_incomplete', 'severity', 'error'
    ));
  end if;

  is_valid := jsonb_array_length(findings) = 0;
  diff_json := jsonb_build_object(
    'sourceVersionId', target_version.source_version_id,
    'stages', stage_count,
    'competencies', competency_count,
    'items', item_count,
    'transitionRules', greatest(stage_count - 1, 0),
    'graduationRequirements', requirement_count
  );

  insert into public.curriculum_publication_validations (
    tenant_id, curriculum_version_id, revision, is_valid,
    coverage_json, impact_json, diff_json, findings_json, validated_by_user_id
  ) values (
    target_version.tenant_id,
    target_version_id,
    target_version.revision,
    is_valid,
    jsonb_build_object(
      'stages', coverage_matrix,
      'competencies', competency_matrix,
      'examples', jsonb_build_array(
        jsonb_build_object('rating', 1, 'itemProgressFraction', 0.2),
        jsonb_build_object('rating', 3, 'itemProgressFraction', 0.6),
        jsonb_build_object('rating', 5, 'itemProgressFraction', 1.0),
        jsonb_build_object(
          'label', 'one_of_six_at_five',
          'diplomaProgressFraction', (1::numeric / 6),
          'displayPercentOneDecimal', 16.7
        )
      )
    ),
    jsonb_build_object(
      'activeEnrollmentsOnSourceVersion', active_enrollment_count,
      'automaticMigration', false,
      'requiresSeparatePreviewApproval', active_enrollment_count > 0
    ),
    diff_json,
    findings,
    actor_user_id
  )
  returning id into target_validation_id;

  return target_validation_id;
end;
$$;

revoke all on function app_private.validate_curriculum_draft(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.validate_curriculum_draft(uuid, uuid)
  to service_role;

create or replace function app_private.publish_curriculum_version_validated(
  target_version_id uuid,
  expected_revision integer,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_version public.curriculum_versions%rowtype;
  target_validation_id uuid;
  target_validation public.curriculum_publication_validations%rowtype;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  select * into target_version
  from public.curriculum_versions version
  where version.id = target_version_id
  for update;
  if target_version.id is null or target_version.status <> 'draft' then
    raise exception 'Curriculum draft not found';
  end if;
  if target_version.revision <> expected_revision then
    raise exception 'Curriculum revision conflict';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id,
    target_version.tenant_id,
    'curriculum.publish'
  ) then
    raise exception 'Insufficient curriculum publication permission';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_version_id::text, expected_revision::text, actor_user_id::text),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_version.tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'curriculum.publish'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  target_validation_id := app_private.validate_curriculum_draft(target_version_id, actor_user_id);
  select * into target_validation
  from public.curriculum_publication_validations validation
  where validation.id = target_validation_id;
  if not target_validation.is_valid then
    raise exception 'Curriculum publication validation failed';
  end if;

  perform set_config('app.swim_publish_authorized', target_version_id::text, true);
  update public.curriculum_versions
  set status = 'published',
      published_at = now(),
      published_by_user_id = actor_user_id
  where id = target_version_id;

  insert into public.curriculum_version_lifecycle (
    tenant_id, curriculum_version_id, availability, reason, changed_by_user_id
  ) values (
    target_version.tenant_id,
    target_version_id,
    'available',
    'Validated immutable publication',
    actor_user_id
  );

  if target_version.source_version_id is not null then
    insert into public.curriculum_version_lifecycle (
      tenant_id, curriculum_version_id, availability, reason, changed_by_user_id
    ) values (
      target_version.tenant_id,
      target_version.source_version_id,
      'not_for_new_enrollments',
      'Superseded for new enrollments; existing learners remain pinned',
      actor_user_id
    );
  end if;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_version.tenant_id,
    target_idempotency_key,
    'curriculum.publish',
    'curriculum_version',
    target_version_id,
    actor_user_id,
    request_hash,
    jsonb_build_object(
      'curriculumVersionId', target_version_id,
      'revision', expected_revision,
      'validationId', target_validation_id
    )
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id,
    actor_user_id, formula_version, payload_json
  ) values (
    target_version.tenant_id,
    'curriculum.published',
    'curriculum_version',
    target_version_id,
    actor_user_id,
    target_version.formula_version,
    jsonb_build_object(
      'programId', target_version.program_id,
      'versionNumber', target_version.version_number,
      'validationId', target_validation_id,
      'automaticLearnerMigration', false
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, before_json, after_json
  ) values (
    target_version.tenant_id,
    actor_user_id,
    'curriculum.publish',
    'curriculum.published',
    'curriculum_version',
    target_version_id,
    jsonb_build_object('status', 'draft', 'revision', expected_revision),
    jsonb_build_object(
      'status', 'published',
      'formulaVersion', target_version.formula_version,
      'validationId', target_validation_id
    )
  );

  insert into public.tenant_swim_rollouts (
    tenant_id, feature_key, status, readiness_json, activated_at, activated_by_user_id
  ) values (
    target_version.tenant_id,
    'swim.curriculum_v3',
    'pilot',
    jsonb_build_object('publishedVersionId', target_version_id, 'validationId', target_validation_id),
    now(),
    actor_user_id
  )
  on conflict (tenant_id, feature_key)
  do update set
    status = 'pilot',
    readiness_json = excluded.readiness_json,
    activated_at = excluded.activated_at,
    activated_by_user_id = excluded.activated_by_user_id;

  return target_version_id;
end;
$$;

revoke all on function app_private.publish_curriculum_version_validated(uuid, integer, uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.publish_curriculum_version_validated(uuid, integer, uuid, text)
  to service_role;

create or replace function app_private.preview_curriculum_migration(
  target_from_version_id uuid,
  target_to_version_id uuid,
  target_reason text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  from_version public.curriculum_versions%rowtype;
  to_version public.curriculum_versions%rowtype;
  target_plan_id uuid;
  active_enrollments integer;
  unmapped_current_stages integer;
  mapped_items integer;
  unmapped_assessed_items integer;
  mapping_json jsonb;
  impact_json jsonb;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  select * into from_version
  from public.curriculum_versions version
  where version.id = target_from_version_id
  for share;
  select * into to_version
  from public.curriculum_versions version
  where version.id = target_to_version_id
  for share;
  if from_version.id is null or to_version.id is null
    or from_version.status <> 'published' or to_version.status <> 'published'
    or from_version.tenant_id <> to_version.tenant_id
    or from_version.program_id <> to_version.program_id
    or from_version.id = to_version.id
  then
    raise exception 'Curriculum migration versions are incompatible';
  end if;
  if length(trim(coalesce(target_reason, ''))) < 3 then
    raise exception 'Migration reason is required';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id, from_version.tenant_id, 'curriculum.migrate.preview'
  ) then
    raise exception 'Insufficient curriculum migration preview permission';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_from_version_id::text, target_to_version_id::text, trim(target_reason)),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = from_version.tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'curriculum.migration.preview'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;

  select count(*) into active_enrollments
  from public.enrollments enrollment
  where enrollment.tenant_id = from_version.tenant_id
    and enrollment.curriculum_version_id = from_version.id
    and enrollment.status = 'active';

  select count(*) into unmapped_current_stages
  from public.enrollment_stage_assignments assignment
  join public.curriculum_stages source_stage on source_stage.id = assignment.curriculum_stage_id
  where assignment.tenant_id = from_version.tenant_id
    and assignment.curriculum_version_id = from_version.id
    and assignment.status = 'active'
    and not exists (
      select 1 from public.curriculum_stages target_stage
      where target_stage.curriculum_version_id = to_version.id
        and target_stage.stable_key = source_stage.stable_key
    );

  select count(*) into mapped_items
  from public.curriculum_items source_item
  join public.curriculum_items target_item
    on target_item.curriculum_version_id = to_version.id
   and target_item.identity_id = source_item.identity_id
  where source_item.curriculum_version_id = from_version.id;

  select count(distinct observation.curriculum_item_id) into unmapped_assessed_items
  from public.swim_assessment_observations observation
  join public.enrollments enrollment
    on enrollment.tenant_id = observation.tenant_id
   and enrollment.id = observation.enrollment_id
  join public.curriculum_items source_item on source_item.id = observation.curriculum_item_id
  where observation.tenant_id = from_version.tenant_id
    and observation.curriculum_version_id = from_version.id
    and enrollment.status = 'active'
    and not exists (
      select 1 from public.curriculum_items target_item
      where target_item.curriculum_version_id = to_version.id
        and target_item.identity_id = source_item.identity_id
    );

  select jsonb_build_object(
    'stages', coalesce(jsonb_agg(
      jsonb_build_object(
        'stableKey', source_stage.stable_key,
        'fromStageId', source_stage.id,
        'toStageId', target_stage.id
      ) order by source_stage.sort_order, source_stage.id
    ) filter (where source_stage.id is not null), '[]'::jsonb),
    'items', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'identityId', source_item.identity_id,
          'fromItemId', source_item.id,
          'toItemId', target_item.id
        ) order by source_item.sort_order, source_item.id
      ), '[]'::jsonb)
      from public.curriculum_items source_item
      join public.curriculum_items target_item
        on target_item.curriculum_version_id = to_version.id
       and target_item.identity_id = source_item.identity_id
      where source_item.curriculum_version_id = from_version.id
    )
  ) into mapping_json
  from public.curriculum_stages source_stage
  left join public.curriculum_stages target_stage
    on target_stage.curriculum_version_id = to_version.id
   and target_stage.stable_key = source_stage.stable_key
  where source_stage.curriculum_version_id = from_version.id;

  impact_json := jsonb_build_object(
    'activeEnrollments', active_enrollments,
    'unmappedCurrentStages', unmapped_current_stages,
    'mappedItems', mapped_items,
    'unmappedAssessedItems', unmapped_assessed_items,
    'assessmentStrategy', 'copy_latest_effective_observation',
    'progressRecalculation', true,
    'automaticExecution', false
  );

  insert into public.curriculum_migration_plans (
    tenant_id, program_id, from_version_id, to_version_id,
    status, impact_json, mapping_json, reason, previewed_at, created_by_user_id
  ) values (
    from_version.tenant_id,
    from_version.program_id,
    from_version.id,
    to_version.id,
    'previewed',
    impact_json,
    mapping_json,
    trim(target_reason),
    now(),
    actor_user_id
  )
  returning id into target_plan_id;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    from_version.tenant_id,
    target_idempotency_key,
    'curriculum.migration.preview',
    'curriculum_migration_plan',
    target_plan_id,
    actor_user_id,
    request_hash,
    jsonb_build_object('planId', target_plan_id, 'impact', impact_json)
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, reason, after_json
  ) values (
    from_version.tenant_id,
    actor_user_id,
    'curriculum.migrate.preview',
    'curriculum.migration_previewed',
    'curriculum_migration_plan',
    target_plan_id,
    trim(target_reason),
    impact_json
  );

  return target_plan_id;
end;
$$;

revoke all on function app_private.preview_curriculum_migration(uuid, uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.preview_curriculum_migration(uuid, uuid, text, uuid, text)
  to service_role;

create or replace function app_private.approve_curriculum_migration(
  target_plan_id uuid,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_plan public.curriculum_migration_plans%rowtype;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  select * into target_plan
  from public.curriculum_migration_plans plan
  where plan.id = target_plan_id
  for update;
  if target_plan.id is null or target_plan.status <> 'previewed' then
    raise exception 'Previewed curriculum migration plan not found';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id, target_plan.tenant_id, 'curriculum.migrate.execute'
  ) then
    raise exception 'Insufficient curriculum migration approval permission';
  end if;
  if coalesce((target_plan.impact_json ->> 'unmappedCurrentStages')::integer, 0) > 0
    or coalesce((target_plan.impact_json ->> 'unmappedAssessedItems')::integer, 0) > 0
  then
    raise exception 'Migration mapping has unresolved historical impact';
  end if;

  update public.curriculum_migration_plans
  set status = 'approved',
      approved_at = now(),
      approved_by_user_id = actor_user_id
  where id = target_plan_id;
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, reason, after_json
  ) values (
    target_plan.tenant_id,
    actor_user_id,
    'curriculum.migrate.execute',
    'curriculum.migration_approved',
    'curriculum_migration_plan',
    target_plan_id,
    target_plan.reason,
    target_plan.impact_json
  );
  return target_plan_id;
end;
$$;

revoke all on function app_private.approve_curriculum_migration(uuid, uuid)
  from public, anon, authenticated;
grant execute on function app_private.approve_curriculum_migration(uuid, uuid)
  to service_role;

create or replace function app_private.execute_curriculum_migration(
  target_plan_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_plan public.curriculum_migration_plans%rowtype;
  enrollment_row record;
  observation_row record;
  source_stage_key text;
  target_stage_id uuid;
  target_item_id uuid;
  existing_receipt public.domain_command_receipts%rowtype;
  request_hash text;
  migrated_enrollment_count integer := 0;
  copied_observation_count integer := 0;
begin
  perform app_private.assert_swim_command_actor(actor_user_id);
  select * into target_plan
  from public.curriculum_migration_plans plan
  where plan.id = target_plan_id
  for update;
  if target_plan.id is null or target_plan.status not in ('approved', 'completed') then
    raise exception 'Approved curriculum migration plan not found';
  end if;
  if not app_private.user_has_swim_permission(
    actor_user_id, target_plan.tenant_id, 'curriculum.migrate.execute'
  ) then
    raise exception 'Insufficient curriculum migration execution permission';
  end if;

  request_hash := encode(
    extensions.digest(
      concat_ws(':', target_plan_id::text, actor_user_id::text),
      'sha256'
    ),
    'hex'
  );
  select * into existing_receipt
  from public.domain_command_receipts receipt
  where receipt.tenant_id = target_plan.tenant_id
    and receipt.idempotency_key = target_idempotency_key;
  if existing_receipt.id is not null then
    if existing_receipt.command_type <> 'curriculum.migration.execute'
      or existing_receipt.request_hash <> request_hash
    then
      raise exception 'Idempotency key was already used for another command';
    end if;
    return existing_receipt.aggregate_id;
  end if;
  if target_plan.status = 'completed' then
    raise exception 'Completed migration requires its original idempotency key';
  end if;

  update public.curriculum_migration_plans
  set status = 'executing'
  where id = target_plan_id;

  for enrollment_row in
    select enrollment.*
    from public.enrollments enrollment
    where enrollment.tenant_id = target_plan.tenant_id
      and enrollment.curriculum_version_id = target_plan.from_version_id
      and enrollment.status = 'active'
    order by enrollment.id
    for update
  loop
    source_stage_key := null;
    target_stage_id := null;
    select stage.stable_key
      into source_stage_key
    from public.enrollment_stage_assignments assignment
    join public.curriculum_stages stage on stage.id = assignment.curriculum_stage_id
    where assignment.tenant_id = target_plan.tenant_id
      and assignment.enrollment_id = enrollment_row.id
      and assignment.status = 'active'
    limit 1;
    if source_stage_key is not null then
      select stage.id into target_stage_id
      from public.curriculum_stages stage
      where stage.curriculum_version_id = target_plan.to_version_id
        and stage.stable_key = source_stage_key;
      if target_stage_id is null then
        raise exception 'Current stage mapping changed after preview';
      end if;
    end if;

    for observation_row in
      select distinct on (observation.curriculum_item_id)
        observation.*
      from public.swim_assessment_observations observation
      where observation.tenant_id = target_plan.tenant_id
        and observation.enrollment_id = enrollment_row.id
        and observation.curriculum_version_id = target_plan.from_version_id
        and not exists (
          select 1 from public.swim_assessment_retractions retraction
          where retraction.tenant_id = observation.tenant_id
            and retraction.observation_id = observation.id
        )
        and not exists (
          select 1
          from public.swim_assessment_observations correction
          where correction.tenant_id = observation.tenant_id
            and correction.corrects_observation_id = observation.id
            and not exists (
              select 1 from public.swim_assessment_retractions correction_retraction
              where correction_retraction.tenant_id = correction.tenant_id
                and correction_retraction.observation_id = correction.id
            )
        )
      order by observation.curriculum_item_id, observation.observed_at desc, observation.finalized_at desc
    loop
      select target_item.id into target_item_id
      from public.curriculum_items source_item
      join public.curriculum_items target_item
        on target_item.curriculum_version_id = target_plan.to_version_id
       and target_item.identity_id = source_item.identity_id
      where source_item.id = observation_row.curriculum_item_id;
      if target_item_id is null then
        raise exception 'Assessed item mapping changed after preview';
      end if;

      insert into public.swim_assessment_observations (
        tenant_id, participant_id, enrollment_id, curriculum_version_id,
        curriculum_item_id, rating, scale_version, source_scale_version,
        source_value, positive_label, note, visibility, context_json,
        source, observed_at, finalized_at, assessed_by_user_id,
        session_id, client_operation_id, device_id
      ) values (
        target_plan.tenant_id,
        observation_row.participant_id,
        observation_row.enrollment_id,
        target_plan.to_version_id,
        target_item_id,
        observation_row.rating,
        'five_point_v1',
        observation_row.source_scale_version,
        observation_row.source_value,
        observation_row.positive_label,
        observation_row.note,
        observation_row.visibility,
        observation_row.context_json || jsonb_build_object(
          'migrationPlanId', target_plan.id,
          'sourceObservationId', observation_row.id
        ),
        'curriculum_migration',
        observation_row.observed_at,
        now(),
        actor_user_id,
        observation_row.session_id,
        'curriculum-migration:' || target_plan.id::text || ':' || observation_row.id::text,
        'server-curriculum-migration'
      )
      on conflict (tenant_id, assessed_by_user_id, client_operation_id)
        where client_operation_id is not null
      do nothing;
      if found then copied_observation_count := copied_observation_count + 1; end if;
    end loop;

    update public.enrollments
    set curriculum_version_id = target_plan.to_version_id
    where tenant_id = target_plan.tenant_id
      and id = enrollment_row.id;
    update public.enrollment_stage_assignments
    set status = 'superseded',
        ends_at = now()
    where tenant_id = target_plan.tenant_id
      and enrollment_id = enrollment_row.id
      and status = 'active';
    if target_stage_id is not null then
      insert into public.enrollment_stage_assignments (
        tenant_id, enrollment_id, participant_id, curriculum_version_id,
        curriculum_stage_id, status, assigned_by_user_id
      ) values (
        target_plan.tenant_id,
        enrollment_row.id,
        enrollment_row.participant_id,
        target_plan.to_version_id,
        target_stage_id,
        'active',
        actor_user_id
      );
    end if;
    perform app_private.refresh_swim_progress_projections(
      target_plan.tenant_id,
      enrollment_row.id,
      null
    );
    migrated_enrollment_count := migrated_enrollment_count + 1;
  end loop;

  update public.curriculum_migration_plans
  set status = 'completed',
      executed_at = now(),
      executed_by_user_id = actor_user_id,
      impact_json = impact_json || jsonb_build_object(
        'migratedEnrollments', migrated_enrollment_count,
        'copiedEffectiveObservations', copied_observation_count
      )
  where id = target_plan_id;

  insert into public.domain_command_receipts (
    tenant_id, idempotency_key, command_type, aggregate_type, aggregate_id,
    actor_user_id, request_hash, result_json
  ) values (
    target_plan.tenant_id,
    target_idempotency_key,
    'curriculum.migration.execute',
    'curriculum_migration_plan',
    target_plan_id,
    actor_user_id,
    request_hash,
    jsonb_build_object(
      'planId', target_plan_id,
      'migratedEnrollments', migrated_enrollment_count,
      'copiedEffectiveObservations', copied_observation_count
    )
  );
  insert into public.domain_outbox_events (
    tenant_id, event_type, aggregate_type, aggregate_id, actor_user_id, payload_json
  ) values (
    target_plan.tenant_id,
    'curriculum.migration_completed',
    'curriculum_migration_plan',
    target_plan_id,
    actor_user_id,
    jsonb_build_object(
      'fromVersionId', target_plan.from_version_id,
      'toVersionId', target_plan.to_version_id,
      'migratedEnrollments', migrated_enrollment_count,
      'copiedEffectiveObservations', copied_observation_count
    )
  );
  insert into public.swim_audit_events (
    tenant_id, actor_user_id, permission_key, event_type,
    subject_type, subject_id, reason, after_json
  ) values (
    target_plan.tenant_id,
    actor_user_id,
    'curriculum.migrate.execute',
    'curriculum.migration_completed',
    'curriculum_migration_plan',
    target_plan_id,
    target_plan.reason,
    jsonb_build_object(
      'migratedEnrollments', migrated_enrollment_count,
      'copiedEffectiveObservations', copied_observation_count
    )
  );

  return target_plan_id;
end;
$$;

revoke all on function app_private.execute_curriculum_migration(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function app_private.execute_curriculum_migration(uuid, uuid, text)
  to service_role;

create or replace function public.create_curriculum_draft(
  target_tenant_id uuid,
  target_program_id uuid,
  target_name text,
  clone_latest boolean,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.create_curriculum_draft(
    target_tenant_id,
    target_program_id,
    target_name,
    clone_latest,
    actor_user_id,
    target_idempotency_key
  );
$$;

create or replace function public.save_curriculum_draft_step(
  target_version_id uuid,
  expected_revision integer,
  target_step text,
  target_entity_id uuid,
  target_payload jsonb,
  actor_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.save_curriculum_draft_step(
    target_version_id,
    expected_revision,
    target_step,
    target_entity_id,
    target_payload,
    actor_user_id
  );
$$;

create or replace function public.validate_curriculum_draft(
  target_version_id uuid,
  actor_user_id uuid
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.validate_curriculum_draft(target_version_id, actor_user_id);
$$;

create or replace function public.publish_curriculum_version(
  target_version_id uuid,
  expected_revision integer,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.publish_curriculum_version_validated(
    target_version_id,
    expected_revision,
    actor_user_id,
    target_idempotency_key
  );
$$;

create or replace function public.preview_curriculum_migration(
  target_from_version_id uuid,
  target_to_version_id uuid,
  target_reason text,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.preview_curriculum_migration(
    target_from_version_id,
    target_to_version_id,
    target_reason,
    actor_user_id,
    target_idempotency_key
  );
$$;

create or replace function public.approve_curriculum_migration(
  target_plan_id uuid,
  actor_user_id uuid
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.approve_curriculum_migration(target_plan_id, actor_user_id);
$$;

create or replace function public.execute_curriculum_migration(
  target_plan_id uuid,
  actor_user_id uuid,
  target_idempotency_key text
)
returns uuid
language sql
security invoker
set search_path = public, pg_temp
as $$
  select app_private.execute_curriculum_migration(
    target_plan_id,
    actor_user_id,
    target_idempotency_key
  );
$$;

revoke all on function public.create_curriculum_draft(uuid, uuid, text, boolean, uuid, text)
  from public, anon;
revoke all on function public.save_curriculum_draft_step(uuid, integer, text, uuid, jsonb, uuid)
  from public, anon;
revoke all on function public.validate_curriculum_draft(uuid, uuid)
  from public, anon;
revoke all on function public.publish_curriculum_version(uuid, integer, uuid, text)
  from public, anon;
revoke all on function public.preview_curriculum_migration(uuid, uuid, text, uuid, text)
  from public, anon;
revoke all on function public.approve_curriculum_migration(uuid, uuid)
  from public, anon;
revoke all on function public.execute_curriculum_migration(uuid, uuid, text)
  from public, anon;

grant execute on function public.create_curriculum_draft(uuid, uuid, text, boolean, uuid, text)
  to authenticated, service_role;
grant execute on function public.save_curriculum_draft_step(uuid, integer, text, uuid, jsonb, uuid)
  to authenticated, service_role;
grant execute on function public.validate_curriculum_draft(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.publish_curriculum_version(uuid, integer, uuid, text)
  to authenticated, service_role;
grant execute on function public.preview_curriculum_migration(uuid, uuid, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.approve_curriculum_migration(uuid, uuid)
  to authenticated, service_role;
grant execute on function public.execute_curriculum_migration(uuid, uuid, text)
  to authenticated, service_role;

create or replace function app_private.assign_latest_curriculum_to_new_enrollment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.curriculum_version_id is null then
    select version.id into new.curriculum_version_id
    from public.curriculum_versions version
    where version.tenant_id = new.tenant_id
      and version.program_id = new.program_id
      and version.status = 'published'
      and not exists (
        select 1
        from public.curriculum_version_lifecycle lifecycle
        where lifecycle.curriculum_version_id = version.id
          and lifecycle.effective_at = (
            select max(latest.effective_at)
            from public.curriculum_version_lifecycle latest
            where latest.curriculum_version_id = version.id
          )
          and lifecycle.availability <> 'available'
      )
    order by version.version_number desc
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function app_private.assign_latest_curriculum_to_new_enrollment()
  from public, anon, authenticated;
grant execute on function app_private.assign_latest_curriculum_to_new_enrollment()
  to service_role;

create trigger enrollments_assign_latest_curriculum
  before insert on public.enrollments
  for each row execute function app_private.assign_latest_curriculum_to_new_enrollment();

create or replace function app_private.create_initial_curriculum_stage_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_stage_id uuid;
begin
  if new.curriculum_version_id is null then
    return new;
  end if;
  select stage.id into target_stage_id
  from public.curriculum_stages stage
  where stage.curriculum_version_id = new.curriculum_version_id
    and (
      new.current_stage_id is null
      or stage.legacy_stage_id = new.current_stage_id
    )
  order by
    case when stage.legacy_stage_id = new.current_stage_id then 0 else 1 end,
    stage.sort_order,
    stage.id
  limit 1;
  if target_stage_id is not null then
    insert into public.enrollment_stage_assignments (
      tenant_id, enrollment_id, participant_id, curriculum_version_id,
      curriculum_stage_id, status
    ) values (
      new.tenant_id,
      new.id,
      new.participant_id,
      new.curriculum_version_id,
      target_stage_id,
      case when new.status = 'active' then 'active' else 'planned' end
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function app_private.create_initial_curriculum_stage_assignment()
  from public, anon, authenticated;
grant execute on function app_private.create_initial_curriculum_stage_assignment()
  to service_role;

create trigger enrollments_create_initial_curriculum_stage
  after insert on public.enrollments
  for each row execute function app_private.create_initial_curriculum_stage_assignment();

grant select on public.curriculum_draft_revisions to authenticated;
grant all on public.curriculum_draft_revisions to service_role;
alter table public.curriculum_draft_revisions enable row level security;
alter table public.curriculum_draft_revisions force row level security;

create policy curriculum_draft_revisions_read
  on public.curriculum_draft_revisions for select to authenticated
  using (app_private.current_user_has_swim_permission(tenant_id, 'curriculum.read'));

comment on table public.curriculum_draft_revisions is
  'Immutable wizard save history used for optimistic concurrency, audit and draft recovery.';
comment on function public.validate_curriculum_draft(uuid, uuid) is
  'Builds coverage, example calculations, impact, diff and blocking findings without publishing.';
comment on function public.preview_curriculum_migration(uuid, uuid, text, uuid, text) is
  'Creates a non-mutating impact preview. Existing learners remain pinned until approval and execution.';
