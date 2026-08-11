begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '12000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'swim-transition-admin@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.tenants (id, slug, name)
values ('22000000-0000-4000-8000-000000000001', 'swim-transition-test', 'Swim Transition Test');

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
  'Diploma Transit',
  'diploma-transit',
  'active'
);

insert into public.curriculum_versions (
  id, tenant_id, program_id, version_number, name, created_by_user_id
) values (
  '42000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  1,
  'Diploma Transit v1',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.curriculum_stages (
  id, tenant_id, curriculum_version_id, stable_key, name, sort_order
) values
  (
    '52000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    'badje-een',
    'Badje één',
    1
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    'badje-twee',
    'Badje twee',
    2
  );

insert into public.curriculum_item_identities (
  id, tenant_id, program_id, stable_key
) values
  (
    '62000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    'open-onderdeel'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    'beheerst-onderdeel'
  ),
  (
    '62000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    'volgend-onderdeel'
  );

insert into public.curriculum_items (
  id, tenant_id, curriculum_version_id, curriculum_stage_id, identity_id, name, sort_order
) values
  (
    '72000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'Open onderdeel',
    1
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000002',
    'Beheerst onderdeel',
    2
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '22000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000002',
    '62000000-0000-4000-8000-000000000003',
    'Volgend onderdeel',
    3
  );

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '12000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select app_private.publish_curriculum_version(
  '42000000-0000-4000-8000-000000000001',
  1,
  '12000000-0000-4000-8000-000000000001',
  'publish-transition-curriculum'
);

insert into public.participants (id, tenant_id, display_name)
values (
  '82000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Doorstroomzwemmer'
);

insert into public.enrollments (
  id, tenant_id, participant_id, program_id, curriculum_version_id, status
) values (
  '92000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  'active'
);

select public.finalize_swim_assessment(
  '22000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  3,
  'Nog verder oefenen',
  'parent_visible',
  '{}'::jsonb,
  now(),
  null,
  null,
  null,
  'manual',
  'transition-item-one',
  'integration',
  'transition-assessment-one'
);

select public.finalize_swim_assessment(
  '22000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  5,
  'Beheerst',
  'parent_visible',
  '{}'::jsonb,
  now(),
  null,
  null,
  null,
  'manual',
  'transition-item-two',
  'integration',
  'transition-assessment-two'
);

create temporary table transition_test_results (
  result_key text primary key,
  result_id uuid not null
);

insert into transition_test_results
select
  'case',
  public.preview_swim_transition(
    '22000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001'
  );

do $$
begin
  if (
    select eligibility_status
    from public.swim_transition_cases
    where id = (select result_id from transition_test_results where result_key = 'case')
  ) <> 'not_eligible' then
    raise exception 'Open work unexpectedly made the learner eligible';
  end if;
end;
$$;

select public.review_swim_transition(
  (select result_id from transition_test_results where result_key = 'case'),
  'Menselijke review met expliciete carryover'
);
select public.approve_swim_transition(
  (select result_id from transition_test_results where result_key = 'case'),
  true,
  'Doorstroom is veilig met begeleide carryover'
);
select public.execute_swim_transition(
  (select result_id from transition_test_results where result_key = 'case'),
  'Goedgekeurde doorstroom uitvoeren',
  'transition-execute-integration'
);

do $$
begin
  if (
    select curriculum_stage_id
    from public.enrollment_stage_assignments
    where enrollment_id = '92000000-0000-4000-8000-000000000001'
      and status = 'active'
  ) <> '52000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'Approved transition did not activate the next stage';
  end if;
  if (
    select count(*)
    from public.swim_item_carryovers
    where enrollment_id = '92000000-0000-4000-8000-000000000001'
      and status = 'open'
  ) <> 1 then
    raise exception 'Expected exactly one referenced open carryover';
  end if;
  if (select count(*) from public.curriculum_items where curriculum_version_id = '42000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'Transition duplicated a curriculum item';
  end if;
end;
$$;

insert into transition_test_results
select
  'carryover-batch',
  public.complete_previous_stage_items(
    '22000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'carryoverId', (
          select id
          from public.swim_item_carryovers
          where enrollment_id = '92000000-0000-4000-8000-000000000001'
            and status = 'open'
        ),
        'rating', 4,
        'visibility', 'parent_visible',
        'note', 'Afgerond vanuit vorig badje',
        'context', jsonb_build_object('waterDepth', 'deep')
      )
    ),
    'Begeleid afgerond in het huidige badje',
    'carryover-complete-integration'
  );

do $$
declare
  retry_result uuid;
begin
  if (
    select count(*)
    from public.swim_item_carryovers
    where enrollment_id = '92000000-0000-4000-8000-000000000001'
      and status = 'completed'
      and curriculum_item_id = '72000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Original carryover reference was not completed';
  end if;
  if (
    select count(*)
    from public.swim_carryover_completion_items
    where batch_id = (select result_id from transition_test_results where result_key = 'carryover-batch')
  ) <> 1 then
    raise exception 'Carryover batch did not record its item';
  end if;

  retry_result := public.complete_previous_stage_items(
    '22000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'carryoverId', (
          select carryover_id
          from public.swim_carryover_completion_items
          where batch_id = (select result_id from transition_test_results where result_key = 'carryover-batch')
        ),
        'rating', 4,
        'visibility', 'parent_visible',
        'note', 'Afgerond vanuit vorig badje',
        'context', jsonb_build_object('waterDepth', 'deep')
      )
    ),
    'Begeleid afgerond in het huidige badje',
    'carryover-complete-integration'
  );
  if retry_result <> (select result_id from transition_test_results where result_key = 'carryover-batch') then
    raise exception 'Idempotent carryover retry returned another batch';
  end if;
end;
$$;

rollback;
