begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'swim-canon-admin@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.tenants (id, slug, name)
values ('20000000-0000-4000-8000-000000000001', 'swim-canon-test', 'Swim Canon Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'tenant_admin',
  'active'
);

insert into public.programs (id, tenant_id, name, code, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Diploma A',
  'diploma-a',
  'active'
);

insert into public.curriculum_versions (
  id,
  tenant_id,
  program_id,
  version_number,
  name,
  created_by_user_id
) values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  1,
  'Diploma A v1',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.curriculum_stages (
  id,
  tenant_id,
  curriculum_version_id,
  stable_key,
  name
) values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'badje-a',
  'Badje A'
);

insert into public.curriculum_item_identities (id, tenant_id, program_id, stable_key)
select
  ('60000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  '30000000-0000-4000-8000-000000000001'::uuid,
  'onderdeel-' || item_number
from generate_series(1, 6) item_number;

insert into public.curriculum_items (
  id,
  tenant_id,
  curriculum_version_id,
  curriculum_stage_id,
  identity_id,
  name,
  sort_order
)
select
  ('70000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  '20000000-0000-4000-8000-000000000001'::uuid,
  '40000000-0000-4000-8000-000000000001'::uuid,
  '50000000-0000-4000-8000-000000000001'::uuid,
  ('60000000-0000-4000-8000-' || lpad(item_number::text, 12, '0'))::uuid,
  'Onderdeel ' || item_number,
  item_number
from generate_series(1, 6) item_number;

insert into public.participants (id, tenant_id, display_name)
values (
  '80000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'Testzwemmer'
);

insert into public.enrollments (
  id,
  tenant_id,
  participant_id,
  program_id,
  curriculum_version_id,
  status
) values (
  '90000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'active'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '10000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

select app_private.publish_curriculum_version(
  '40000000-0000-4000-8000-000000000001',
  1,
  '10000000-0000-4000-8000-000000000001',
  'publish-curriculum-test-v1'
);

do $$
begin
  if (select status from public.curriculum_versions where id = '40000000-0000-4000-8000-000000000001') <> 'published' then
    raise exception 'Curriculum was not published';
  end if;
end;
$$;

create temporary table swim_test_results (
  result_key text primary key,
  result_id uuid not null
);

insert into swim_test_results
select
  'first',
  app_private.finalize_swim_assessment(
    '20000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    5,
    'Eerste definitieve observatie',
    'parent_visible',
    '{"waterDepth":"deep"}'::jsonb,
    '2026-08-02T10:00:00Z',
    null,
    null,
    null,
    'manual',
    'device-op-first',
    'integration-device',
    '10000000-0000-4000-8000-000000000001',
    'assessment-first-idempotency'
  );

do $$
declare
  diploma_progress numeric;
  diploma_coverage numeric;
  duplicate_result uuid;
begin
  select progress_fraction, coverage_fraction
    into diploma_progress, diploma_coverage
  from public.swim_progress_projections
  where enrollment_id = '90000000-0000-4000-8000-000000000001'
    and scope_kind = 'diploma';

  if abs(diploma_progress - (1::numeric / 6)) > 0.000000000001 then
    raise exception 'Expected diploma progress 1/6, got %', diploma_progress;
  end if;
  if abs(diploma_coverage - (1::numeric / 6)) > 0.000000000001 then
    raise exception 'Expected diploma coverage 1/6, got %', diploma_coverage;
  end if;

  duplicate_result := app_private.finalize_swim_assessment(
    '20000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    5,
    'Eerste definitieve observatie',
    'parent_visible',
    '{"waterDepth":"deep"}'::jsonb,
    '2026-08-02T10:00:00Z',
    null,
    null,
    null,
    'manual',
    'device-op-first',
    'integration-device',
    '10000000-0000-4000-8000-000000000001',
    'assessment-first-idempotency'
  );

  if duplicate_result <> (select result_id from swim_test_results where result_key = 'first') then
    raise exception 'Idempotent retry returned another observation';
  end if;
end;
$$;

insert into swim_test_results
select
  'correction',
  app_private.finalize_swim_assessment(
    '20000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    3,
    'Gecorrigeerde lagere score',
    'parent_visible',
    '{"waterDepth":"deep"}'::jsonb,
    '2026-08-02T10:00:00Z',
    null,
    (select result_id from swim_test_results where result_key = 'first'),
    'Score administratief gecorrigeerd',
    'admin_command',
    'device-op-correction',
    'integration-device',
    '10000000-0000-4000-8000-000000000001',
    'assessment-correction-idempotency'
  );

do $$
declare
  diploma_progress numeric;
begin
  select progress_fraction into diploma_progress
  from public.swim_progress_projections
  where enrollment_id = '90000000-0000-4000-8000-000000000001'
    and scope_kind = 'diploma';

  if abs(diploma_progress - 0.1) > 0.000000000001 then
    raise exception 'Expected lowered diploma progress 0.1, got %', diploma_progress;
  end if;
end;
$$;

insert into swim_test_results
select
  'retraction',
  app_private.retract_swim_assessment(
    (select result_id from swim_test_results where result_key = 'correction'),
    'Correctie bleek zelf onjuist',
    '10000000-0000-4000-8000-000000000001',
    'assessment-retraction-idempotency'
  );

do $$
declare
  diploma_progress numeric;
begin
  select progress_fraction into diploma_progress
  from public.swim_progress_projections
  where enrollment_id = '90000000-0000-4000-8000-000000000001'
    and scope_kind = 'diploma';

  if abs(diploma_progress - (1::numeric / 6)) > 0.000000000001 then
    raise exception 'Expected predecessor restoration after retraction, got %', diploma_progress;
  end if;
  if (select count(*) from public.swim_assessment_observations) <> 2 then
    raise exception 'Canonical observations were overwritten instead of appended';
  end if;
  if (select count(*) from public.domain_command_receipts) <> 4 then
    raise exception 'Unexpected command receipt count';
  end if;
end;
$$;

reset role;

do $$
begin
  begin
    update public.curriculum_items
    set name = 'Verboden wijziging'
    where id = '70000000-0000-4000-8000-000000000001';
    raise exception 'Published curriculum content remained mutable';
  exception
    when others then
      if sqlerrm <> 'Published curriculum contents are immutable' then
        raise;
      end if;
  end;
end;
$$;

rollback;
