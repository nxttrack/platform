begin;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '19000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'native-instructor@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '19000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'native-parent@example.test',
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.tenants (id, slug, name)
values (
  '29000000-0000-4000-8000-000000000001',
  'native-command-test',
  'Native command test'
);

insert into public.tenant_memberships (tenant_id, user_id, role, status) values
  (
    '29000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000001',
    'instructor',
    'active'
  ),
  (
    '29000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002',
    'parent',
    'active'
  );

insert into public.programs (id, tenant_id, name, code, status)
values (
  '39000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  'Native Zwem-ABC',
  'native-abc',
  'active'
);

insert into public.program_stages (id, tenant_id, program_id, name, code)
values (
  '49000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  'Badje één',
  'badje-een'
);

insert into public.resources (
  id, tenant_id, kind, name, code, capacity, safety_capacity, status
) values (
  '51000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  'pool',
  'Native instructiebad',
  'native-bad',
  8,
  8,
  'active'
);

insert into public.groups (
  id, tenant_id, program_id, stage_id, default_resource_id, name, code, status,
  capacity, regular_capacity, flex_capacity, trial_capacity, hard_capacity
) values (
  '59000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  'Native maandag',
  'native-ma',
  'active',
  8, 8, 0, 0, 8
);

insert into public.sessions (
  id, tenant_id, group_id, resource_id, starts_at, ends_at, status
) values (
  '69000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  now() + interval '18 hours',
  now() + interval '19 hours',
  'scheduled'
);

insert into public.participants (
  id, tenant_id, guardian_user_id, display_name
) values (
  '79000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  'Native leerling'
);

insert into public.participant_guardians (
  tenant_id, participant_id, guardian_user_id, relationship, access_level, status
) values (
  '29000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  'parent',
  'primary',
  'active'
) on conflict (tenant_id, participant_id, guardian_user_id) do nothing;

insert into public.enrollments (
  id, tenant_id, participant_id, guardian_user_id, program_id,
  current_stage_id, status
) values (
  '89000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  '39000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.group_memberships (
  tenant_id, group_id, enrollment_id, participant_id, status
) values (
  '29000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  'active'
);

insert into public.instructor_qualifications (
  tenant_id, instructor_user_id, program_id, qualification_key, name,
  status, valid_from, valid_until, verified_by_user_id, verified_at
) values (
  '29000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  'zwemonderwijzer',
  'Zwemonderwijzer',
  'active',
  current_date - 30,
  current_date + 365,
  '19000000-0000-4000-8000-000000000001',
  now()
);

insert into public.group_instructor_assignments (
  tenant_id, group_id, instructor_user_id, role, status
) values (
  '29000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  'primary',
  'active'
);

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19000000-0000-4000-8000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

create temporary table native_results (
  result_key text primary key,
  result_json jsonb not null
);

insert into native_results values (
  'attendance',
  public.mark_native_attendance(
    '29000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'present',
    'Poolside geregistreerd',
    'native-attendance-command-001'
  )
);

do $$
declare
  retried jsonb;
begin
  retried := public.mark_native_attendance(
    '29000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'present',
    'Poolside geregistreerd',
    'native-attendance-command-001'
  );
  if retried <> (
    select result_json from native_results where result_key = 'attendance'
  ) then
    raise exception 'Attendance retry returned another result';
  end if;
  if (
    select count(*) from public.session_attendance
    where tenant_id = '29000000-0000-4000-8000-000000000001'
      and session_id = '69000000-0000-4000-8000-000000000001'
      and participant_id = '79000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Attendance retry created duplicate state';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '19000000-0000-4000-8000-000000000002',
    'role', 'authenticated'
  )::text,
  true
);

insert into native_results values (
  'cancellation',
  public.cancel_native_lesson(
    '29000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'Kind is verhinderd',
    'native-cancel-command-0001'
  )
);

do $$
declare
  retried jsonb;
begin
  retried := public.cancel_native_lesson(
    '29000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'Kind is verhinderd',
    'native-cancel-command-0001'
  );
  if retried <> (
    select result_json from native_results where result_key = 'cancellation'
  ) then
    raise exception 'Cancellation retry returned another result';
  end if;
  if (
    select count(*) from public.lesson_cancellations
    where tenant_id = '29000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Cancellation retry created duplicate state';
  end if;
  if (
    select count(*) from public.catch_up_credits
    where tenant_id = '29000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'On-time cancellation did not create exactly one credit';
  end if;
  begin
    perform public.mark_native_attendance(
      '29000000-0000-4000-8000-000000000001',
      '69000000-0000-4000-8000-000000000001',
      '79000000-0000-4000-8000-000000000001',
      'absent',
      null,
      'native-parent-forbidden-001'
    );
    raise exception 'Parent unexpectedly recorded attendance';
  exception when others then
    if sqlerrm = 'Parent unexpectedly recorded attendance' then raise; end if;
  end;
end;
$$;

reset role;
insert into public.tenant_notifications (
  id, tenant_id, recipient_user_id, type, title, message, status
) values (
  '99000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  'system',
  'Native bericht',
  'Leesbevestiging',
  'unread'
);
insert into public.tenant_feedback_campaigns (
  id, tenant_id, name, trigger_type, status, prompt, follow_up_question,
  created_by_user_id
) values (
  'a9000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  'Native evaluatie',
  'manual',
  'active',
  'Hoe waarschijnlijk is een aanbeveling?',
  'Wat wil je toelichten?',
  '19000000-0000-4000-8000-000000000001'
);
insert into public.feedback_survey_requests (
  id, tenant_id, campaign_id, participant_id, guardian_user_id, status,
  source_entity_type, requested_by_user_id, expires_at
) values (
  'b9000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  'a9000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000002',
  'open',
  'manual',
  '19000000-0000-4000-8000-000000000001',
  now() + interval '30 days'
);
set local role authenticated;

select public.mark_native_notification_read(
  '29000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000001',
  'native-notification-read-001'
);

do $$
begin
  if (
    select status from public.tenant_notifications
    where id = '99000000-0000-4000-8000-000000000001'
  ) <> 'read' then
    raise exception 'Notification was not marked read';
  end if;
end;
$$;

insert into native_results values (
  'media-consent',
  public.record_native_media_consent(
    '29000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'granted',
    '2026-07',
    'guardian',
    true,
    'native-media-consent-0001'
  )
);

do $$
declare
  retried jsonb;
begin
  retried := public.record_native_media_consent(
    '29000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'granted',
    '2026-07',
    'guardian',
    true,
    'native-media-consent-0001'
  );
  if retried <> (
    select result_json from native_results where result_key = 'media-consent'
  ) then
    raise exception 'Media consent retry returned another result';
  end if;
  if (
    select count(*) from public.media_consents
    where tenant_id = '29000000-0000-4000-8000-000000000001'
      and participant_id = '79000000-0000-4000-8000-000000000001'
      and guardian_user_id = '19000000-0000-4000-8000-000000000002'
      and status = 'granted'
  ) <> 1 then
    raise exception 'Media consent retry created duplicate state';
  end if;
  if (
    select count(*) from public.media_consent_events
    where tenant_id = '29000000-0000-4000-8000-000000000001'
      and participant_id = '79000000-0000-4000-8000-000000000001'
      and guardian_user_id = '19000000-0000-4000-8000-000000000002'
  ) <> 1 then
    raise exception 'Media consent retry created duplicate audit events';
  end if;
end;
$$;

insert into native_results values (
  'feedback',
  public.submit_native_parent_feedback(
    '29000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001',
    9,
    'Fijne begeleiding',
    true,
    'personal',
    true,
    'native-feedback-command-001'
  )
);

do $$
declare
  retried jsonb;
begin
  retried := public.submit_native_parent_feedback(
    '29000000-0000-4000-8000-000000000001',
    'b9000000-0000-4000-8000-000000000001',
    9,
    'Fijne begeleiding',
    true,
    'personal',
    true,
    'native-feedback-command-001'
  );
  if retried <> (
    select result_json from native_results where result_key = 'feedback'
  ) then
    raise exception 'Feedback retry returned another result';
  end if;
  if (
    select count(*) from public.feedback_survey_responses
    where tenant_id = '29000000-0000-4000-8000-000000000001'
      and request_id = 'b9000000-0000-4000-8000-000000000001'
  ) <> 1 then
    raise exception 'Feedback retry created duplicate responses';
  end if;
  if (
    select status from public.feedback_survey_requests
    where id = 'b9000000-0000-4000-8000-000000000001'
  ) <> 'completed' then
    raise exception 'Feedback request was not completed atomically';
  end if;
end;
$$;

rollback;
