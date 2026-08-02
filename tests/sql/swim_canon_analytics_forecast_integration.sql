begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '17000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'analytics-admin@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '17000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'analytics-parent@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.tenants (id, slug, name)
values ('27000000-0000-4000-8000-000000000001', 'analytics-v3-test', 'Analytics v3 Test');

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000001',
    'tenant_admin',
    'active'
  ),
  (
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'parent',
    'active'
  );

update public.tenant_settings
set timezone = 'Europe/Amsterdam'
where tenant_id = '27000000-0000-4000-8000-000000000001';

insert into public.programs (id, tenant_id, name, code, status)
values (
  '37000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  'Zwem-ABC analytics',
  'analytics-abc',
  'active'
);

insert into public.program_stages (id, tenant_id, program_id, name, code, status)
values (
  '47000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  'Badje analytics',
  'analytics-badje',
  'active'
);

insert into public.groups (
  id, tenant_id, program_id, stage_id, name, code, status, capacity,
  regular_capacity, flex_capacity, trial_capacity, hard_capacity
) values (
  '57000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001',
  'Analytics groep',
  'analytics-groep',
  'active',
  2,
  2,
  0,
  0,
  2
);

insert into public.participants (
  id, tenant_id, guardian_user_id, display_name, status
) values
  (
    '67000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'Analytics zwemmer één',
    'active'
  ),
  (
    '67000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    'Analytics zwemmer twee',
    'active'
  );

insert into public.enrollments (
  id, tenant_id, participant_id, guardian_user_id, program_id, current_stage_id,
  status, starts_on
) values
  (
    '77000000-0000-4000-8000-000000000001',
    '27000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000001',
    '17000000-0000-4000-8000-000000000002',
    '37000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    'active',
    current_date - 60
  ),
  (
    '77000000-0000-4000-8000-000000000002',
    '27000000-0000-4000-8000-000000000001',
    '67000000-0000-4000-8000-000000000002',
    '17000000-0000-4000-8000-000000000002',
    '37000000-0000-4000-8000-000000000001',
    '47000000-0000-4000-8000-000000000001',
    'active',
    current_date - 30
  );

insert into public.group_memberships (
  id, tenant_id, group_id, enrollment_id, participant_id, status, starts_on,
  capacity_bucket
) values (
  '87000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001',
  '67000000-0000-4000-8000-000000000001',
  'active',
  current_date - 30,
  'regular'
);

insert into public.waitlist_entries (
  id, tenant_id, program_id, recommended_stage_id, parent_name, parent_email,
  participant_name, selected_option, status, source, participant_id
) values (
  '97000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001',
  'Analytics ouder',
  'analytics-parent@example.test',
  'Analytics zwemmer twee',
  'waitlist',
  'waiting',
  'manual',
  '67000000-0000-4000-8000-000000000002'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '17000000-0000-4000-8000-000000000001',
    'role', 'service_role'
  )::text,
  true
);
select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  before_count integer;
  reconciled_count integer;
  after_count integer;
begin
  select count(*) into before_count
  from public.swim_lifecycle_events
  where tenant_id = '27000000-0000-4000-8000-000000000001';
  select app_private.reconcile_swim_lifecycle_events(
    '27000000-0000-4000-8000-000000000001'
  ) into reconciled_count;
  select count(*) into after_count
  from public.swim_lifecycle_events
  where tenant_id = '27000000-0000-4000-8000-000000000001';
  if reconciled_count <> 0 or after_count <> before_count then
    raise exception 'Lifecycle reconciliation is not idempotent';
  end if;
  if not exists (
    select 1
    from public.swim_lifecycle_events
    where tenant_id = '27000000-0000-4000-8000-000000000001'
      and event_type = 'waitlist.entered'
      and tenant_timezone = 'Europe/Amsterdam'
      and formula_version = 'swim_flow_v3.0.0'
  ) then
    raise exception 'Waitlist lifecycle event lacks tenant-local formula evidence';
  end if;
  begin
    update public.swim_lifecycle_events
    set payload_json = '{"mutated":true}'::jsonb
    where id = (
      select id
      from public.swim_lifecycle_events
      where tenant_id = '27000000-0000-4000-8000-000000000001'
      limit 1
    );
    raise exception 'Append-only lifecycle event unexpectedly mutated';
  exception when others then
    if sqlerrm = 'Append-only lifecycle event unexpectedly mutated' then raise; end if;
  end;
end;
$$;

create temporary table analytics_v3_results (
  result_key text primary key,
  result_id uuid not null
);

insert into analytics_v3_results values (
  'soft-hold',
  public.create_capacity_soft_reservation(
    '27000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    null,
    'regular',
    1,
    now() + interval '2 hours',
    'Planner controleert verwachte plek',
    'analytics-soft-hold-v3'
  )
);

do $$
declare
  reservation_id uuid := (
    select result_id
    from analytics_v3_results
    where result_key = 'soft-hold'
  );
  retry_id uuid;
begin
  select public.create_capacity_soft_reservation(
    '27000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    null,
    'regular',
    1,
    (
      select expires_at
      from public.capacity_soft_reservations
      where id = reservation_id
    ),
    'Planner controleert verwachte plek',
    'analytics-soft-hold-v3'
  ) into retry_id;
  if retry_id <> reservation_id then
    raise exception 'Soft reservation request is not idempotent';
  end if;
  if (
    select status
    from public.capacity_soft_reservations
    where id = reservation_id
  ) <> 'pending_approval' then
    raise exception 'Soft reservation skipped planner review';
  end if;

  perform public.review_capacity_soft_reservation(
    reservation_id,
    true,
    'Capaciteit en kandidaat gecontroleerd'
  );
  if (
    select status
    from public.capacity_soft_reservations
    where id = reservation_id
  ) <> 'approved' then
    raise exception 'Reviewed soft reservation was not approved';
  end if;

  begin
    insert into public.group_memberships (
      tenant_id, group_id, enrollment_id, participant_id, status, starts_on,
      capacity_bucket
    ) values (
      '27000000-0000-4000-8000-000000000001',
      '57000000-0000-4000-8000-000000000001',
      '77000000-0000-4000-8000-000000000002',
      '67000000-0000-4000-8000-000000000002',
      'active',
      current_date,
      'regular'
    );
    raise exception 'Approved soft hold did not protect physical capacity';
  exception when others then
    if sqlerrm = 'Approved soft hold did not protect physical capacity' then raise; end if;
  end;

  if app_private.expire_capacity_soft_reservations(now() + interval '3 hours') <> 1 then
    raise exception 'Approved soft hold expiry did not release exactly one row';
  end if;
  if (
    select status
    from public.capacity_soft_reservations
    where id = reservation_id
  ) <> 'released' then
    raise exception 'Expired approved hold was not released';
  end if;
end;
$$;

insert into public.group_memberships (
  id, tenant_id, group_id, enrollment_id, participant_id, status, starts_on,
  capacity_bucket
) values (
  '87000000-0000-4000-8000-000000000002',
  '27000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000002',
  '67000000-0000-4000-8000-000000000002',
  'active',
  current_date,
  'regular'
);

insert into public.swim_flow_metric_snapshots (
  tenant_id, grain, snapshot_date, window_start, window_end, tenant_timezone,
  metric_key, formula_version, metric_json, cohorts_json, data_quality_json,
  source_event_count, source_event_watermark
) values
  (
    '27000000-0000-4000-8000-000000000001',
    'daily',
    current_date,
    (current_date - interval '12 months')::date,
    current_date + 1,
    'Europe/Amsterdam',
    'wait_time',
    'swim_flow_v3.0.0',
    '{"sampleSize":5,"medianDays":21,"p75Days":30,"p90Days":40}'::jsonb,
    '[{"month":"2026-08","sampleSize":5}]'::jsonb,
    '{"cohortSize":"sufficient","completenessPercentage":100}'::jsonb,
    (
      select count(*)
      from public.swim_lifecycle_events
      where tenant_id = '27000000-0000-4000-8000-000000000001'
    ),
    now()
  ),
  (
    '27000000-0000-4000-8000-000000000001',
    'monthly',
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date)::date - interval '12 months')::date,
    current_date + 1,
    'Europe/Amsterdam',
    'wait_time',
    'swim_flow_v3.0.0',
    '{"sampleSize":5,"medianDays":21,"p75Days":30,"p90Days":40}'::jsonb,
    '[{"month":"2026-08","sampleSize":5}]'::jsonb,
    '{"cohortSize":"sufficient","completenessPercentage":100}'::jsonb,
    1,
    now()
  );

insert into public.capacity_forecast_runs (
  id, tenant_id, horizon_weeks, as_of_date, tenant_timezone,
  input_fingerprint, status, result_count, data_quality_json, completed_at
) values (
  'a7000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  8,
  current_date,
  'Europe/Amsterdam',
  repeat('a', 64),
  'completed',
  1,
  '{"historySampleSize":8,"issueCount":0}'::jsonb,
  now()
);

insert into public.capacity_forecast_results (
  id, tenant_id, run_id, group_id, current_capacity, current_occupied,
  active_soft_reservations, waitlist_demand, expected_openings,
  expected_bottlenecks, conservative_openings, likely_openings,
  optimistic_openings, earliest_availability_on, likely_availability_on,
  latest_availability_on, risk_level, confidence_label, confidence_score,
  reasons_json, data_quality_json
) values (
  'b7000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  2,
  2,
  0,
  1,
  1,
  1,
  0,
  1,
  2,
  current_date + 7,
  current_date + 14,
  current_date + 28,
  'watch',
  'hoog',
  0.82,
  '[{"code":"history"}]'::jsonb,
  '{"historicalExitSampleSize":8,"issueCount":0}'::jsonb
);

insert into public.capacity_forecast_accuracy (
  tenant_id, forecast_result_id, actual_first_opening_on, absolute_error_days,
  within_predicted_range, evaluation_status, model_version
) values (
  '27000000-0000-4000-8000-000000000001',
  'b7000000-0000-4000-8000-000000000001',
  current_date + 16,
  2,
  true,
  'observed',
  'capacity_forecast_v3.0.0'
);

do $$
begin
  if (
    select count(*)
    from public.group_memberships
    where tenant_id = '27000000-0000-4000-8000-000000000001'
      and group_id = '57000000-0000-4000-8000-000000000001'
      and status = 'active'
  ) <> 2 then
    raise exception 'Forecast data moved or removed a learner';
  end if;
  if (
    select absolute_error_days
    from public.capacity_forecast_accuracy
    where forecast_result_id = 'b7000000-0000-4000-8000-000000000001'
  ) <> 2 then
    raise exception 'Forecast accuracy evidence was not retained';
  end if;
end;
$$;

rollback;
