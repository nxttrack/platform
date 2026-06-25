do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
  badje_1_stage_id uuid;
  badje_2_stage_id uuid;
  badje_3_stage_id uuid;
  lane_1_id uuid;
  lane_2_id uuid;
  lane_3_id uuid;
  instructie_id uuid;
  sophie_id uuid;
  milan_id uuid;
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
    and program_id = diploma_a_program_id
    and code = 'badje-1';

  select id into badje_2_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and program_id = diploma_a_program_id
    and code = 'badje-2';

  select id into badje_3_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and program_id = diploma_a_program_id
    and code = 'badje-3';

  if diploma_a_program_id is null
    or badje_1_stage_id is null
    or badje_2_stage_id is null
    or badje_3_stage_id is null
  then
    return;
  end if;

  select id into lane_1_id
  from public.resources
  where tenant_id = demo_tenant_id
    and code = 'bad-1-baan-1';

  select id into lane_2_id
  from public.resources
  where tenant_id = demo_tenant_id
    and code = 'bad-1-baan-2';

  insert into public.resources (tenant_id, code, name, resource_type, location_name, capacity, status)
  values
    (demo_tenant_id, 'bad-1-baan-3', 'Bad 1 - baan 3', 'lane', 'Sportbad', 8, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        resource_type = excluded.resource_type,
        location_name = excluded.location_name,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into lane_3_id;

  insert into public.resources (tenant_id, code, name, resource_type, location_name, capacity, status)
  values
    (demo_tenant_id, 'instructiebad-baan-1', 'Instructiebad - baan 1', 'lane', 'Instructiebad', 6, 'active')
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        resource_type = excluded.resource_type,
        location_name = excluded.location_name,
        capacity = excluded.capacity,
        status = excluded.status
  returning id into instructie_id;

  select id into sophie_id
  from public.instructors
  where tenant_id = demo_tenant_id
    and email = 'sophie@aquaswim-demo.nl';

  select id into milan_id
  from public.instructors
  where tenant_id = demo_tenant_id
    and email = 'milan@aquaswim-demo.nl';

  insert into public.groups (
    tenant_id,
    program_id,
    stage_id,
    resource_id,
    instructor_id,
    code,
    name,
    weekday,
    starts_at,
    ends_at,
    capacity,
    reserved_spots,
    trial_spots,
    makeup_spots,
    overbooking_policy,
    capacity_policy,
    status
  )
  values
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_1_stage_id,
      instructie_id,
      sophie_id,
      'vrije-instroom-ma-0900-badje-1',
      'Vrije instroom maandag 09:00 - Badje 1',
      1,
      '09:00'::time,
      '09:45'::time,
      6,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"regular","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_2_stage_id,
      lane_2_id,
      milan_id,
      'vrije-instroom-ma-1700-badje-2',
      'Vrije instroom maandag 17:00 - Badje 2',
      1,
      '17:00'::time,
      '17:45'::time,
      8,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"regular","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_1_stage_id,
      lane_1_id,
      sophie_id,
      'vrije-instroom-di-1545-badje-1',
      'Vrije instroom dinsdag 15:45 - Badje 1',
      2,
      '15:45'::time,
      '16:30'::time,
      8,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"regular","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_3_stage_id,
      lane_3_id,
      milan_id,
      'vrije-instroom-wo-1300-badje-3',
      'Vrije instroom woensdag 13:00 - Badje 3',
      3,
      '13:00'::time,
      '13:45'::time,
      8,
      0,
      0,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"regular","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_2_stage_id,
      lane_2_id,
      sophie_id,
      'vrije-instroom-do-1800-badje-2',
      'Vrije instroom donderdag 18:00 - Badje 2',
      4,
      '18:00'::time,
      '18:45'::time,
      8,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"regular","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_1_stage_id,
      instructie_id,
      milan_id,
      'vrije-instroom-za-0945-badje-1',
      'Vrije instroom zaterdag 09:45 - Badje 1',
      6,
      '09:45'::time,
      '10:30'::time,
      6,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"weekend","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_2_stage_id,
      lane_3_id,
      sophie_id,
      'vrije-instroom-za-1030-badje-2',
      'Vrije instroom zaterdag 10:30 - Badje 2',
      6,
      '10:30'::time,
      '11:15'::time,
      8,
      0,
      1,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"weekend","empty_demo_group":true}'::jsonb,
      'active'
    ),
    (
      demo_tenant_id,
      diploma_a_program_id,
      badje_3_stage_id,
      instructie_id,
      milan_id,
      'vrije-instroom-zo-1015-badje-3',
      'Vrije instroom zondag 10:15 - Badje 3',
      7,
      '10:15'::time,
      '11:00'::time,
      6,
      0,
      0,
      1,
      'blocked',
      '{"seed":"staging-empty-groups","slot_type":"weekend","empty_demo_group":true}'::jsonb,
      'active'
    )
  on conflict (tenant_id, code) do update
    set program_id = excluded.program_id,
        stage_id = excluded.stage_id,
        resource_id = excluded.resource_id,
        instructor_id = excluded.instructor_id,
        name = excluded.name,
        weekday = excluded.weekday,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        capacity = excluded.capacity,
        reserved_spots = excluded.reserved_spots,
        trial_spots = excluded.trial_spots,
        makeup_spots = excluded.makeup_spots,
        overbooking_policy = excluded.overbooking_policy,
        capacity_policy = excluded.capacity_policy,
        status = excluded.status;
end $$;
