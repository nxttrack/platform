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
  '11000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'swim-canon-guardian@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.tenants (id, slug, name)
values ('21000000-0000-4000-8000-000000000001', 'swim-badge-test', 'Swim Badge Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status)
values (
  '21000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'parent',
  'active'
);

insert into public.participants (
  id,
  tenant_id,
  display_name,
  guardian_user_id,
  gender
) values (
  '81000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Badgezwemmer',
  '11000000-0000-4000-8000-000000000001',
  'unknown_legacy'
);

insert into public.badge_catalog_definitions (
  id,
  badge_key,
  name_default,
  description_default,
  category,
  badge_type,
  audience,
  icon_name,
  is_surprise,
  status
) values
  (
    '31000000-0000-4000-8000-000000000001',
    'canon_badge_visible',
    'Zichtbare canonbadge',
    'Een zichtbare testbadge.',
    'specials',
    'manual',
    'all',
    'award',
    false,
    'active'
  ),
  (
    '31000000-0000-4000-8000-000000000002',
    'canon_badge_surprise',
    'Geheime canonbadge',
    'Een geheime testbadge.',
    'specials',
    'manual',
    'all',
    'sparkles',
    true,
    'active'
  ),
  (
    '31000000-0000-4000-8000-000000000003',
    'canon_badge_boys_only',
    'Jongensbadge',
    'Alleen expliciet voor jongens.',
    'specials',
    'manual',
    'boys',
    'award',
    false,
    'active'
  );

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.badge_catalog_definitions
    where badge_key = 'canon_badge_surprise'
  ) <> 0 then
    raise exception 'Unearned surprise catalog row leaked to guardian';
  end if;
  if (
    select count(*)
    from public.badge_definition_releases
    where stable_key = 'canon_badge_surprise'
  ) <> 0 then
    raise exception 'Unearned surprise release leaked to guardian';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);

create temporary table badge_batch_test_results (
  result_key text primary key,
  result_id uuid not null
);

insert into badge_batch_test_results
select
  'aggregate',
  public.award_badge_batch(
    '21000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    null,
    array(
      select id
      from public.badge_definition_releases
      where stable_key in ('canon_badge_visible', 'canon_badge_surprise')
      order by stable_key
    ),
    'remaining_badges',
    'integration_bulk',
    null,
    null,
    'Integratietest verzameltoekenning',
    'parent_visible',
    null,
    'badge-batch-integration-aggregate'
  );

do $$
declare
  retry_result uuid;
begin
  if (
    select awarded_count
    from public.badge_award_batches
    where id = (select result_id from badge_batch_test_results where result_key = 'aggregate')
  ) <> 2 then
    raise exception 'Expected two awards in one batch';
  end if;
  if (
    select count(*)
    from public.badge_batch_notifications
    where batch_id = (select result_id from badge_batch_test_results where result_key = 'aggregate')
  ) <> 1 then
    raise exception 'Expected exactly one aggregate notification';
  end if;
  if (
    select count(*)
    from public.tenant_notifications
    where related_badge_award_batch_id = (select result_id from badge_batch_test_results where result_key = 'aggregate')
  ) <> 1 then
    raise exception 'Expected exactly one tenant notification';
  end if;
  if exists (
    select 1
    from public.swim_progress_projections
    where participant_id = '81000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'Badge command changed swim progress';
  end if;

  retry_result := public.award_badge_batch(
    '21000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    null,
    array(
      select id
      from public.badge_definition_releases
      where stable_key in ('canon_badge_visible', 'canon_badge_surprise')
      order by stable_key
    ),
    'remaining_badges',
    'integration_bulk',
    null,
    null,
    'Integratietest verzameltoekenning',
    'parent_visible',
    null,
    'badge-batch-integration-aggregate'
  );
  if retry_result <> (select result_id from badge_batch_test_results where result_key = 'aggregate') then
    raise exception 'Idempotent batch retry returned another batch';
  end if;
end;
$$;

insert into badge_batch_test_results
select
  'audience',
  public.award_badge_batch(
    '21000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    null,
    array(
      select id
      from public.badge_definition_releases
      where stable_key = 'canon_badge_boys_only'
    ),
    'manual',
    'integration_audience',
    null,
    null,
    'Audiencecheck',
    'parent_visible',
    null,
    'badge-batch-integration-audience'
  );

do $$
begin
  if (
    select skipped_count
    from public.badge_award_batches
    where id = (select result_id from badge_batch_test_results where result_key = 'audience')
  ) <> 1 then
    raise exception 'unknown_legacy did not remain ineligible for boys-only badge';
  end if;
  if (
    select notification_count
    from public.badge_award_batches
    where id = (select result_id from badge_batch_test_results where result_key = 'audience')
  ) <> 0 then
    raise exception 'Ineligible batch unexpectedly produced a notification';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '11000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*)
    from public.badge_catalog_definitions
    where badge_key = 'canon_badge_surprise'
  ) <> 1 then
    raise exception 'Earned surprise catalog row is not visible to guardian';
  end if;
  if (
    select count(*)
    from public.badge_definition_releases
    where stable_key = 'canon_badge_surprise'
  ) <> 1 then
    raise exception 'Earned surprise release is not visible to guardian';
  end if;
end;
$$;

reset role;

do $$
begin
  begin
    update public.badge_definition_releases
    set name_default = 'Verboden wijziging'
    where stable_key = 'canon_badge_visible';
    raise exception 'Published badge release remained mutable';
  exception
    when others then
      if sqlerrm <> 'Published badge releases and referenced artwork are immutable' then
        raise;
      end if;
  end;
end;
$$;

rollback;
