begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '13000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'planning-admin@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '13000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'planning-instructor-a@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '13000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'planning-instructor-b@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.tenants (id, slug, name)
values ('23000000-0000-4000-8000-000000000001', 'planning-v3-test', 'Planning v3 Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000001', 'tenant_admin', 'active'),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 'instructor', 'active'),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', 'instructor', 'active');

insert into public.programs (id, tenant_id, name, code, status)
values (
  '33000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  'Zwem-ABC planning',
  'planning-abc',
  'active'
);

insert into public.program_stages (id, tenant_id, program_id, name, code, status)
values (
  '43000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  'Badje één',
  'badje-een',
  'active'
);

insert into public.resources (
  id, tenant_id, parent_resource_id, kind, name, code, capacity, safety_capacity, status
) values
  (
    '53000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000001',
    null, 'location', 'Zwembad Noord', 'noord', 80, 80, 'active'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '23000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000001',
    'pool', 'Instructiebad', 'instructiebad', 16, 16, 'active'
  ),
  (
    '53000000-0000-4000-8000-000000000003',
    '23000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000002',
    'lane', 'Baan A', 'baan-a', 8, 8, 'active'
  ),
  (
    '53000000-0000-4000-8000-000000000004',
    '23000000-0000-4000-8000-000000000001',
    '53000000-0000-4000-8000-000000000002',
    'lane', 'Baan B', 'baan-b', 8, 8, 'active'
  );

insert into public.resource_opening_hours (
  tenant_id, resource_id, weekday, opens_at, closes_at
) values
  ('23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000003', 1, '14:00', '19:00'),
  ('23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000004', 1, '14:00', '19:00'),
  ('23000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000002', 1, '14:00', '19:00');

insert into public.instructor_qualifications (
  tenant_id, instructor_user_id, program_id, qualification_key, name,
  status, valid_from, valid_until, verified_by_user_id, verified_at
) values
  (
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000001',
    'zwemonderwijzer', 'Zwemonderwijzer', 'active',
    '2026-01-01', '2027-12-31',
    '13000000-0000-4000-8000-000000000001', now()
  ),
  (
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000003',
    '33000000-0000-4000-8000-000000000001',
    'zwemonderwijzer', 'Zwemonderwijzer', 'active',
    '2026-01-01', '2027-12-31',
    '13000000-0000-4000-8000-000000000001', now()
  );

insert into public.instructor_availability (
  tenant_id, instructor_user_id, weekday, starts_at, ends_at, status
) values
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000002', 1, '14:00', '19:00', 'active'),
  ('23000000-0000-4000-8000-000000000001', '13000000-0000-4000-8000-000000000003', 1, '14:00', '19:00', 'active');

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '13000000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table planning_test_results (
  result_key text primary key,
  result_json jsonb not null
);

insert into planning_test_results values (
  'preview-a',
  public.preview_group_schedule(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'name', 'Maandag Badje één A',
      'code', 'ma-b1-a',
      'programId', '33000000-0000-4000-8000-000000000001',
      'stageId', '43000000-0000-4000-8000-000000000001',
      'resourceId', '53000000-0000-4000-8000-000000000003',
      'instructorUserIds', jsonb_build_array('13000000-0000-4000-8000-000000000002'),
      'weekday', 1,
      'startTime', '16:00',
      'endTime', '16:45',
      'startsOn', '2026-10-19',
      'endsOn', '2026-11-02',
      'recurrenceIntervalWeeks', 1,
      'regularCapacity', 2,
      'flexCapacity', 1,
      'trialCapacity', 1,
      'hardCapacity', 4,
      'capacityBorrowing', 'none',
      'offeringType', 'regular',
      'reason', 'Integratietest planning'
    )
  )
);

do $$
begin
  if not ((select result_json from planning_test_results where result_key = 'preview-a') ->> 'canPublish')::boolean then
    raise exception 'Valid structured schedule did not pass advisory preview';
  end if;
  if ((select result_json from planning_test_results where result_key = 'preview-a') ->> 'occurrenceCount')::integer <> 3 then
    raise exception 'Expected three timezone occurrences across DST';
  end if;
end;
$$;

insert into planning_test_results values (
  'publish-a',
  public.publish_group_schedule(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'planning-publish-group-a',
    jsonb_build_object(
      'name', 'Maandag Badje één A',
      'code', 'ma-b1-a',
      'programId', '33000000-0000-4000-8000-000000000001',
      'stageId', '43000000-0000-4000-8000-000000000001',
      'resourceId', '53000000-0000-4000-8000-000000000003',
      'instructorUserIds', jsonb_build_array('13000000-0000-4000-8000-000000000002'),
      'weekday', 1,
      'startTime', '16:00',
      'endTime', '16:45',
      'startsOn', '2026-10-19',
      'endsOn', '2026-11-02',
      'recurrenceIntervalWeeks', 1,
      'regularCapacity', 2,
      'flexCapacity', 1,
      'trialCapacity', 1,
      'hardCapacity', 4,
      'capacityBorrowing', 'none',
      'offeringType', 'regular',
      'reason', 'Integratietest planning'
    )
  )
);

do $$
declare
  result_json jsonb := (select planning_test_results.result_json from planning_test_results where result_key = 'publish-a');
  result_retry jsonb;
begin
  result_retry := public.publish_group_schedule(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    'planning-publish-group-a',
    jsonb_build_object(
      'name', 'Maandag Badje één A',
      'code', 'ma-b1-a',
      'programId', '33000000-0000-4000-8000-000000000001',
      'stageId', '43000000-0000-4000-8000-000000000001',
      'resourceId', '53000000-0000-4000-8000-000000000003',
      'instructorUserIds', jsonb_build_array('13000000-0000-4000-8000-000000000002'),
      'weekday', 1, 'startTime', '16:00', 'endTime', '16:45',
      'startsOn', '2026-10-19', 'endsOn', '2026-11-02',
      'recurrenceIntervalWeeks', 1,
      'regularCapacity', 2, 'flexCapacity', 1, 'trialCapacity', 1,
      'hardCapacity', 4, 'capacityBorrowing', 'none',
      'offeringType', 'regular', 'reason', 'Integratietest planning'
    )
  );
  if result_retry ->> 'groupId' <> result_json ->> 'groupId' then
    raise exception 'Idempotent group publication returned another group';
  end if;
  if (
    select count(*) from public.sessions
    where schedule_rule_id = (result_json ->> 'scheduleRuleId')::uuid
  ) <> 3 then
    raise exception 'Published rule did not materialize exactly three sessions';
  end if;
  if exists (
    select 1 from public.sessions
    where schedule_rule_id = (result_json ->> 'scheduleRuleId')::uuid
      and (starts_at at time zone 'Europe/Amsterdam')::time <> '16:00'::time
  ) then
    raise exception 'DST materialization changed the local lesson time';
  end if;
  begin
    update public.group_schedule_rules
    set local_start_time = '16:15'
    where id = (result_json ->> 'scheduleRuleId')::uuid;
    raise exception 'Published schedule rule unexpectedly mutated';
  exception when others then
    if sqlerrm = 'Published schedule rule unexpectedly mutated' then raise; end if;
  end;
end;
$$;

insert into planning_test_results values (
  'ancestor-conflict',
  public.preview_group_schedule(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'name', 'Conflict heel bad', 'code', 'conflict-pool',
      'programId', '33000000-0000-4000-8000-000000000001',
      'stageId', '43000000-0000-4000-8000-000000000001',
      'resourceId', '53000000-0000-4000-8000-000000000002',
      'instructorUserIds', jsonb_build_array('13000000-0000-4000-8000-000000000003'),
      'weekday', 1, 'startTime', '16:00', 'endTime', '16:45',
      'startsOn', '2026-10-19', 'endsOn', '2026-11-02',
      'recurrenceIntervalWeeks', 1,
      'regularCapacity', 2, 'flexCapacity', 0, 'trialCapacity', 0,
      'hardCapacity', 2, 'capacityBorrowing', 'none',
      'offeringType', 'regular'
    )
  )
);

insert into planning_test_results values (
  'sibling-lane',
  public.preview_group_schedule(
    '23000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'name', 'Parallel Baan B', 'code', 'parallel-b',
      'programId', '33000000-0000-4000-8000-000000000001',
      'stageId', '43000000-0000-4000-8000-000000000001',
      'resourceId', '53000000-0000-4000-8000-000000000004',
      'instructorUserIds', jsonb_build_array('13000000-0000-4000-8000-000000000003'),
      'weekday', 1, 'startTime', '16:00', 'endTime', '16:45',
      'startsOn', '2026-10-19', 'endsOn', '2026-11-02',
      'recurrenceIntervalWeeks', 1,
      'regularCapacity', 2, 'flexCapacity', 0, 'trialCapacity', 0,
      'hardCapacity', 2, 'capacityBorrowing', 'none',
      'offeringType', 'regular'
    )
  )
);

do $$
begin
  if ((select result_json from planning_test_results where result_key = 'ancestor-conflict') ->> 'canPublish')::boolean then
    raise exception 'Parent pool booking did not conflict with a booked child lane';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(
      (select result_json -> 'conflicts' from planning_test_results where result_key = 'ancestor-conflict')
    ) conflict
    where conflict ->> 'code' = 'resource_overlap'
  ) then
    raise exception 'Hierarchy conflict lacks resource_overlap evidence';
  end if;
  if not ((select result_json from planning_test_results where result_key = 'sibling-lane') ->> 'canPublish')::boolean then
    raise exception 'Independent sibling lanes were incorrectly treated as overlapping';
  end if;
end;
$$;

-- Membership capacity is rechecked under a group-row lock, not trusted from a
-- prior application read.
insert into public.participants (id, tenant_id, display_name) values
  ('83000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', 'Regulier één'),
  ('83000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', 'Regulier twee'),
  ('83000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000001', 'Flex één'),
  ('83000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000001', 'Proef één'),
  ('83000000-0000-4000-8000-000000000005', '23000000-0000-4000-8000-000000000001', 'Te veel');

insert into public.enrollments (id, tenant_id, participant_id, program_id, status) values
  ('93000000-0000-4000-8000-000000000001', '23000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '33000000-0000-4000-8000-000000000001', 'active'),
  ('93000000-0000-4000-8000-000000000002', '23000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', '33000000-0000-4000-8000-000000000001', 'active'),
  ('93000000-0000-4000-8000-000000000003', '23000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000003', '33000000-0000-4000-8000-000000000001', 'active'),
  ('93000000-0000-4000-8000-000000000004', '23000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000004', '33000000-0000-4000-8000-000000000001', 'active'),
  ('93000000-0000-4000-8000-000000000005', '23000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000005', '33000000-0000-4000-8000-000000000001', 'active');

insert into public.group_memberships (
  tenant_id, group_id, enrollment_id, participant_id, status, capacity_bucket
) values
  ('23000000-0000-4000-8000-000000000001', ((select result_json from planning_test_results where result_key = 'publish-a') ->> 'groupId')::uuid, '93000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', 'active', 'regular'),
  ('23000000-0000-4000-8000-000000000001', ((select result_json from planning_test_results where result_key = 'publish-a') ->> 'groupId')::uuid, '93000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000002', 'active', 'regular'),
  ('23000000-0000-4000-8000-000000000001', ((select result_json from planning_test_results where result_key = 'publish-a') ->> 'groupId')::uuid, '93000000-0000-4000-8000-000000000003', '83000000-0000-4000-8000-000000000003', 'active', 'flex'),
  ('23000000-0000-4000-8000-000000000001', ((select result_json from planning_test_results where result_key = 'publish-a') ->> 'groupId')::uuid, '93000000-0000-4000-8000-000000000004', '83000000-0000-4000-8000-000000000004', 'trial', 'trial');

do $$
begin
  begin
    insert into public.group_memberships (
      tenant_id, group_id, enrollment_id, participant_id, status, capacity_bucket
    ) values (
      '23000000-0000-4000-8000-000000000001',
      ((select result_json from planning_test_results where result_key = 'publish-a') ->> 'groupId')::uuid,
      '93000000-0000-4000-8000-000000000005',
      '83000000-0000-4000-8000-000000000005',
      'active',
      'regular'
    );
    raise exception 'Fifth membership unexpectedly crossed hard capacity';
  exception when others then
    if sqlerrm = 'Fifth membership unexpectedly crossed hard capacity' then raise; end if;
  end;
end;
$$;

rollback;
