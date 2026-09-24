begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '12000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'curriculum-admin@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.tenants (id, slug, name)
values ('22000000-0000-4000-8000-000000000001', 'curriculum-wizard-test', 'Curriculum Wizard Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status)
values (
  '22000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',
  'tenant_admin',
  'active'
);

insert into public.programs (id, tenant_id, name, code, status)
values (
  '32000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Zwem-ABC',
  'zwem-abc-wizard',
  'active'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '12000000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table curriculum_wizard_test_ids (
  result_key text primary key,
  result_id uuid not null
);

do $$
declare
  version_id uuid;
  stage_one_id uuid;
  stage_two_id uuid;
  competency_id uuid;
  item_one_id uuid;
  item_two_id uuid;
  step_result jsonb;
  current_revision integer := 1;
  validation_id uuid;
begin
  version_id := public.create_curriculum_draft(
    '22000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    'Zwem-ABC canon v1',
    false,
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-create-v1'
  );
  insert into curriculum_wizard_test_ids values ('version_v1', version_id);

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'stages',
    null,
    jsonb_build_object(
      'stableKey', 'badje_een',
      'name', 'Badje één',
      'description', 'Waterwennen',
      'colorHex', '#22AEEF',
      'sortOrder', 10
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  stage_one_id := (step_result ->> 'entityId')::uuid;
  current_revision := (step_result ->> 'revision')::integer;

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'stages',
    null,
    jsonb_build_object(
      'stableKey', 'badje_twee',
      'name', 'Badje twee',
      'description', 'Diplomavoorbereiding',
      'colorHex', '#0F766E',
      'sortOrder', 20
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  stage_two_id := (step_result ->> 'entityId')::uuid;
  current_revision := (step_result ->> 'revision')::integer;

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'competencies',
    null,
    jsonb_build_object(
      'stableKey', 'waterveiligheid',
      'name', 'Waterveiligheid',
      'description', 'Zelfstandig en veilig handelen in het water.',
      'sortOrder', 10
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  competency_id := (step_result ->> 'entityId')::uuid;
  current_revision := (step_result ->> 'revision')::integer;

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'items',
    null,
    jsonb_build_object(
      'stageId', stage_one_id,
      'stableKey', 'drijven_rug',
      'name', 'Drijven op de rug',
      'description', 'Rustig vijf tellen blijven drijven.',
      'context', jsonb_build_object('waterDepth', 'shallow', 'equipment', 'none'),
      'weight', 1,
      'masteryThreshold', 4,
      'contributesToStage', true,
      'contributesToDiploma', true,
      'requiredForTransition', true,
      'requiredForGraduation', true,
      'competencyIds', jsonb_build_array(competency_id),
      'sortOrder', 10
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  item_one_id := (step_result ->> 'entityId')::uuid;
  current_revision := (step_result ->> 'revision')::integer;

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'items',
    null,
    jsonb_build_object(
      'stageId', stage_two_id,
      'stableKey', 'zelfstandig_baan',
      'name', 'Zelfstandig een baan zwemmen',
      'description', 'Technisch beheerst en zonder hulp.',
      'context', jsonb_build_object('waterDepth', 'deep', 'equipment', 'none'),
      'weight', 1,
      'masteryThreshold', 4,
      'contributesToStage', true,
      'contributesToDiploma', true,
      'requiredForTransition', true,
      'requiredForGraduation', true,
      'competencyIds', jsonb_build_array(competency_id),
      'sortOrder', 10
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  item_two_id := (step_result ->> 'entityId')::uuid;
  current_revision := (step_result ->> 'revision')::integer;

  step_result := public.save_curriculum_draft_step(
    version_id,
    current_revision,
    'policies',
    null,
    jsonb_build_object(
      'transitionThreshold', 4,
      'graduationThreshold', 4,
      'coveragePercent', 100,
      'carryoverMode', 'reference_open_items'
    ),
    '12000000-0000-4000-8000-000000000001'
  );
  current_revision := (step_result ->> 'revision')::integer;

  validation_id := public.validate_curriculum_draft(
    version_id,
    '12000000-0000-4000-8000-000000000001'
  );
  if not (
    select validation.is_valid
    from public.curriculum_publication_validations validation
    where validation.id = validation_id
  ) then
    raise exception 'Complete curriculum draft did not validate';
  end if;

  perform public.publish_curriculum_version(
    version_id,
    current_revision,
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-publish-v1'
  );

  insert into curriculum_wizard_test_ids values
    ('stage_v1', stage_one_id),
    ('item_v1', item_one_id);
end;
$$;

insert into public.participants (
  id, tenant_id, display_name, gender, status
) values (
  '82000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Curriculumzwemmer',
  'unknown_legacy',
  'active'
);

insert into public.enrollments (
  id, tenant_id, participant_id, program_id, status
) values (
  '92000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  'active'
);

do $$
begin
  if (
    select curriculum_version_id
    from public.enrollments
    where id = '92000000-0000-4000-8000-000000000001'
  ) <> (select result_id from curriculum_wizard_test_ids where result_key = 'version_v1') then
    raise exception 'New enrollment was not pinned to latest published curriculum';
  end if;
  if (
    select count(*)
    from public.enrollment_stage_assignments
    where enrollment_id = '92000000-0000-4000-8000-000000000001'
      and status = 'active'
  ) <> 1 then
    raise exception 'Initial curriculum stage assignment was not created';
  end if;
end;
$$;

select app_private.finalize_swim_assessment(
  '22000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  (select result_id from curriculum_wizard_test_ids where result_key = 'item_v1'),
  5,
  'Definitieve observatie vóór curriculummigratie',
  'parent_visible',
  '{"waterDepth":"shallow"}'::jsonb,
  '2026-08-02T12:00:00Z',
  null,
  null,
  null,
  'manual',
  'curriculum-wizard-observation-v1',
  'integration-device',
  '12000000-0000-4000-8000-000000000001',
  'curriculum-wizard-assessment-v1'
);

do $$
declare
  version_v2 uuid;
  validation_v2 uuid;
  migration_plan_id uuid;
begin
  version_v2 := public.create_curriculum_draft(
    '22000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    'Zwem-ABC canon v2',
    true,
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-create-v2'
  );
  insert into curriculum_wizard_test_ids values ('version_v2', version_v2);

  validation_v2 := public.validate_curriculum_draft(
    version_v2,
    '12000000-0000-4000-8000-000000000001'
  );
  if not (
    select validation.is_valid
    from public.curriculum_publication_validations validation
    where validation.id = validation_v2
  ) then
    raise exception 'Cloned curriculum draft did not preserve validation parity';
  end if;
  perform public.publish_curriculum_version(
    version_v2,
    1,
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-publish-v2'
  );

  if (
    select curriculum_version_id
    from public.enrollments
    where id = '92000000-0000-4000-8000-000000000001'
  ) <> (select result_id from curriculum_wizard_test_ids where result_key = 'version_v1') then
    raise exception 'Existing learner moved without explicit migration';
  end if;

  migration_plan_id := public.preview_curriculum_migration(
    (select result_id from curriculum_wizard_test_ids where result_key = 'version_v1'),
    version_v2,
    'Goedgekeurde integratiemigratie met impactpreview',
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-migration-preview'
  );
  insert into curriculum_wizard_test_ids values ('migration_plan', migration_plan_id);
  perform public.approve_curriculum_migration(
    migration_plan_id,
    '12000000-0000-4000-8000-000000000001'
  );
  perform public.execute_curriculum_migration(
    migration_plan_id,
    '12000000-0000-4000-8000-000000000001',
    'curriculum-wizard-migration-execute'
  );
end;
$$;

do $$
declare
  diploma_progress numeric;
begin
  if (
    select curriculum_version_id
    from public.enrollments
    where id = '92000000-0000-4000-8000-000000000001'
  ) <> (select result_id from curriculum_wizard_test_ids where result_key = 'version_v2') then
    raise exception 'Approved curriculum migration did not move enrollment';
  end if;
  if (
    select count(*)
    from public.swim_assessment_observations
    where enrollment_id = '92000000-0000-4000-8000-000000000001'
      and curriculum_version_id = (select result_id from curriculum_wizard_test_ids where result_key = 'version_v2')
      and source = 'curriculum_migration'
  ) <> 1 then
    raise exception 'Effective assessment was not copied with explicit migration lineage';
  end if;
  select progress_fraction into diploma_progress
  from public.swim_progress_projections
  where enrollment_id = '92000000-0000-4000-8000-000000000001'
    and scope_kind = 'diploma';
  if abs(diploma_progress - 0.5) > 0.000000000001 then
    raise exception 'Progress parity failed after curriculum migration: %', diploma_progress;
  end if;
end;
$$;

do $$
begin
  begin
    update public.curriculum_items
    set name = 'Verboden wijziging'
    where curriculum_version_id = (
      select result_id from curriculum_wizard_test_ids where result_key = 'version_v2'
    );
    raise exception 'Published cloned curriculum remained mutable';
  exception
    when others then
      if sqlerrm <> 'Published curriculum contents are immutable' then
        raise;
      end if;
  end;
end;
$$;

rollback;
