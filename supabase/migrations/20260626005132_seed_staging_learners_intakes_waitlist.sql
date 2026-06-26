do $$
declare
  v_demo_tenant_id uuid;
  v_diploma_a_program_id uuid;
  v_plan_once_id uuid;
  learner record;
  intake record;
  v_target_group record;
  v_target_stage_id uuid;
  v_intake_config_id uuid;
  v_participant_id uuid;
  v_enrollment_id uuid;
  v_waitlist_id uuid;
begin
  select id into v_demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if v_demo_tenant_id is null then
    return;
  end if;

  select id into v_diploma_a_program_id
  from public.programs
  where tenant_id = v_demo_tenant_id
    and code = 'zwemdiploma-a';

  select id into v_plan_once_id
  from public.subscription_plans
  where tenant_id = v_demo_tenant_id
    and code = 'zwemles-1x-week';

  if v_diploma_a_program_id is null then
    return;
  end if;

  for learner in
    select *
    from (
      values
        ('demo-seed-child-bram-de-jong', 'Bram de Jong', '2019-02-14'::date, 'vrije-instroom-ma-0900-badje-1', '2026-07-06'::date),
        ('demo-seed-child-mila-van-den-berg', 'Mila van den Berg', '2018-06-03'::date, 'vrije-instroom-ma-0900-badje-1', '2026-07-06'::date),
        ('demo-seed-child-daan-smit', 'Daan Smit', '2019-11-21'::date, 'vrije-instroom-ma-0900-badje-1', '2026-07-06'::date),
        ('demo-seed-child-noor-bakker', 'Noor Bakker', '2020-01-09'::date, 'vrije-instroom-ma-0900-badje-1', '2026-07-06'::date),
        ('demo-seed-child-finn-visser', 'Finn Visser', '2018-09-18'::date, 'vrije-instroom-ma-1700-badje-2', '2026-07-06'::date),
        ('demo-seed-child-tess-jansen', 'Tess Jansen', '2017-12-02'::date, 'vrije-instroom-ma-1700-badje-2', '2026-07-06'::date),
        ('demo-seed-child-sam-meijer', 'Sam Meijer', '2018-03-30'::date, 'vrije-instroom-ma-1700-badje-2', '2026-07-06'::date),
        ('demo-seed-child-liv-de-vries', 'Liv de Vries', '2019-07-14'::date, 'vrije-instroom-ma-1700-badje-2', '2026-07-06'::date),
        ('demo-seed-child-sem-mulder', 'Sem Mulder', '2018-10-26'::date, 'vrije-instroom-ma-1700-badje-2', '2026-07-06'::date),
        ('demo-seed-child-isa-peters', 'Isa Peters', '2020-05-05'::date, 'vrije-instroom-di-1545-badje-1', '2026-07-07'::date),
        ('demo-seed-child-mees-bos', 'Mees Bos', '2019-08-19'::date, 'vrije-instroom-di-1545-badje-1', '2026-07-07'::date),
        ('demo-seed-child-lotte-de-boer', 'Lotte de Boer', '2019-01-27'::date, 'vrije-instroom-di-1545-badje-1', '2026-07-07'::date),
        ('demo-seed-child-hugo-van-leeuwen', 'Hugo van Leeuwen', '2017-04-08'::date, 'vrije-instroom-wo-1300-badje-3', '2026-07-08'::date),
        ('demo-seed-child-sara-verhoeven', 'Sara Verhoeven', '2017-09-11'::date, 'vrije-instroom-wo-1300-badje-3', '2026-07-08'::date),
        ('demo-seed-child-niek-kuiper', 'Niek Kuiper', '2018-02-23'::date, 'vrije-instroom-wo-1300-badje-3', '2026-07-08'::date),
        ('demo-seed-child-eva-dekker', 'Eva Dekker', '2017-11-04'::date, 'vrije-instroom-wo-1300-badje-3', '2026-07-08'::date),
        ('demo-seed-child-lucas-groen', 'Lucas Groen', '2018-12-20'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-julia-kramer', 'Julia Kramer', '2019-06-16'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-thijs-van-dongen', 'Thijs van Dongen', '2018-01-12'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-evi-schouten', 'Evi Schouten', '2017-08-01'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-lars-prins', 'Lars Prins', '2018-04-17'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-femke-brouwer', 'Femke Brouwer', '2019-03-06'::date, 'vrije-instroom-do-1800-badje-2', '2026-07-09'::date),
        ('demo-seed-child-bo-van-dam', 'Bo van Dam', '2020-10-10'::date, 'vrije-instroom-za-0945-badje-1', '2026-07-11'::date),
        ('demo-seed-child-saar-hoekstra', 'Saar Hoekstra', '2019-05-28'::date, 'vrije-instroom-za-0945-badje-1', '2026-07-11'::date),
        ('demo-seed-child-luuk-willems', 'Luuk Willems', '2020-02-03'::date, 'vrije-instroom-za-0945-badje-1', '2026-07-11'::date),
        ('demo-seed-child-nova-hendriks', 'Nova Hendriks', '2018-07-07'::date, 'vrije-instroom-za-1030-badje-2', '2026-07-11'::date),
        ('demo-seed-child-gijs-post', 'Gijs Post', '2018-11-13'::date, 'vrije-instroom-za-1030-badje-2', '2026-07-11'::date),
        ('demo-seed-child-feline-jacobs', 'Feline Jacobs', '2019-09-09'::date, 'vrije-instroom-za-1030-badje-2', '2026-07-11'::date),
        ('demo-seed-child-mats-van-rijn', 'Mats van Rijn', '2017-10-22'::date, 'vrije-instroom-za-1030-badje-2', '2026-07-11'::date),
        ('demo-seed-child-yara-blom', 'Yara Blom', '2018-05-31'::date, 'vrije-instroom-za-1030-badje-2', '2026-07-11'::date),
        ('demo-seed-child-tijn-wouters', 'Tijn Wouters', '2017-06-12'::date, 'vrije-instroom-zo-1015-badje-3', '2026-07-12'::date),
        ('demo-seed-child-lieke-vos', 'Lieke Vos', '2018-08-24'::date, 'vrije-instroom-zo-1015-badje-3', '2026-07-12'::date)
    ) as seed(external_reference, display_name, birthdate, group_code, starts_on)
  loop
    select id, program_id, stage_id
      into v_target_group
    from public.groups
    where tenant_id = v_demo_tenant_id
      and code = learner.group_code;

    if v_target_group.id is null then
      continue;
    end if;

    insert into public.participants (tenant_id, external_reference, display_name, birthdate, status)
    values (v_demo_tenant_id, learner.external_reference, learner.display_name, learner.birthdate, 'active')
    on conflict (tenant_id, external_reference) do update
      set display_name = excluded.display_name,
          birthdate = excluded.birthdate,
          status = excluded.status
    returning id into v_participant_id;

    insert into public.enrollments (
      tenant_id,
      external_reference,
      participant_id,
      program_id,
      current_stage_id,
      subscription_plan_id,
      status,
      started_on,
      ended_on
    )
    values (
      v_demo_tenant_id,
      replace(learner.external_reference, 'demo-seed-child-', 'demo-seed-enrollment-'),
      v_participant_id,
      v_target_group.program_id,
      v_target_group.stage_id,
      v_plan_once_id,
      'active',
      learner.starts_on,
      null
    )
    on conflict (tenant_id, external_reference) do update
      set participant_id = excluded.participant_id,
          program_id = excluded.program_id,
          current_stage_id = excluded.current_stage_id,
          subscription_plan_id = excluded.subscription_plan_id,
          status = excluded.status,
          started_on = excluded.started_on,
          ended_on = excluded.ended_on
    returning id into v_enrollment_id;

    insert into public.group_memberships (tenant_id, enrollment_id, group_id, status, starts_on, ends_on)
    values (v_demo_tenant_id, v_enrollment_id, v_target_group.id, 'active', learner.starts_on, null)
    on conflict (enrollment_id, group_id, starts_on) do update
      set status = excluded.status,
          ends_on = excluded.ends_on;
  end loop;

  for intake in
    select *
    from (
      values
        ('00000000-0000-4000-8000-000000010001'::uuid, '00000000-0000-4000-8000-000000020001'::uuid, 'Sanne van Loon', 'sanne.vanloon@example.test', '+31 6 11223301', 'Jip van Loon', '2020-04-18'::date, 'registration', 'badje-1', array['monday','wednesday']::text[], array['morning','afternoon']::text[], 'new', 76.0, 'none', 'normal', null, '{"swim_experience":"Nog geen zwemles gehad, wel watervrij in peuterbad.","medical_notes":"Geen bijzonderheden."}'::jsonb),
        ('00000000-0000-4000-8000-000000010002'::uuid, '00000000-0000-4000-8000-000000020002'::uuid, 'Mark Hendriks', 'mark.hendriks@example.test', '+31 6 11223302', 'Roos Hendriks', '2019-09-03'::date, 'waitlist', 'badje-1', array['saturday']::text[], array['morning','weekend']::text[], 'reviewing', 82.0, 'none', 'high', 'Alleen zaterdag mogelijk door co-ouderschap.', '{"swim_experience":"Watervrij, nog geen techniek.","medical_notes":"Bril tijdens sporten."}'::jsonb),
        ('00000000-0000-4000-8000-000000010003'::uuid, '00000000-0000-4000-8000-000000020003'::uuid, 'Nadia El Amrani', 'nadia.elamrani@example.test', '+31 6 11223303', 'Adam El Amrani', '2018-01-29'::date, 'registration', 'badje-2', array['monday','thursday']::text[], array['evening']::text[], 'matched', 88.0, 'none', 'normal', null, '{"swim_experience":"Kan drijven en korte stukjes zwemmen.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010004'::uuid, '00000000-0000-4000-8000-000000020004'::uuid, 'Thomas de Wit', 'thomas.dewit@example.test', '+31 6 11223304', 'Puck de Wit', '2017-07-15'::date, 'waitlist', 'badje-3', array['wednesday','sunday']::text[], array['afternoon','weekend']::text[], 'new', 73.0, 'warning', 'normal', null, '{"swim_experience":"Heeft eerder zwemles gehad bij andere aanbieder.","medical_notes":"Ouder twijfelt over niveau."}'::jsonb),
        ('00000000-0000-4000-8000-000000010005'::uuid, '00000000-0000-4000-8000-000000020005'::uuid, 'Iris Koster', 'iris.koster@example.test', '+31 6 11223305', 'Floris Koster', '2020-11-02'::date, 'trial', 'badje-1', array['tuesday','saturday']::text[], array['afternoon','weekend']::text[], 'reviewing', 69.0, 'none', 'normal', null, '{"swim_experience":"Spannend in diep water.","medical_notes":"Geen bijzonderheden."}'::jsonb),
        ('00000000-0000-4000-8000-000000010006'::uuid, '00000000-0000-4000-8000-000000020006'::uuid, 'Bas Vermeer', 'bas.vermeer@example.test', '+31 6 11223306', 'Maud Vermeer', '2018-12-08'::date, 'registration', 'badje-2', array['monday','saturday']::text[], array['evening','weekend']::text[], 'matched', 91.0, 'none', 'normal', null, '{"swim_experience":"Enkele maanden zwemles gehad, zoekt doorstroom.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010007'::uuid, '00000000-0000-4000-8000-000000020007'::uuid, 'Laura Smit', 'laura.smit@example.test', '+31 6 11223307', 'Jens Smit', '2019-05-20'::date, 'waitlist', 'badje-1', array['monday','tuesday','thursday']::text[], array['afternoon','evening']::text[], 'new', 78.0, 'warning', 'normal', null, '{"swim_experience":"Geen formele zwemles.","medical_notes":"Mogelijke dubbele aanvraag door tweede ouder."}'::jsonb),
        ('00000000-0000-4000-8000-000000010008'::uuid, '00000000-0000-4000-8000-000000020008'::uuid, 'Pieter Koeman', 'pieter.koeman@example.test', '+31 6 11223308', 'Sofie Koeman', '2017-02-14'::date, 'registration', 'badje-3', array['wednesday','sunday']::text[], array['afternoon','weekend']::text[], 'reviewing', 84.0, 'none', 'high', 'Snelle doorstroom gewenst richting afzwem-ready.', '{"swim_experience":"Bijna klaar met badje 2 volgens vorige school.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010009'::uuid, '00000000-0000-4000-8000-000000020009'::uuid, 'Fatima Aydin', 'fatima.aydin@example.test', '+31 6 11223309', 'Mina Aydin', '2020-06-22'::date, 'trial', 'badje-1', array['saturday','sunday']::text[], array['morning','weekend']::text[], 'new', 71.0, 'none', 'normal', null, '{"swim_experience":"Nieuw in Nederland, wil rustig kennismaken.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010010'::uuid, '00000000-0000-4000-8000-000000020010'::uuid, 'Marieke Vos', 'marieke.vos@example.test', '+31 6 11223310', 'Teun Vos', '2018-03-01'::date, 'waitlist', 'badje-2', array['thursday']::text[], array['evening']::text[], 'reviewing', 86.0, 'none', 'normal', null, '{"swim_experience":"Kan zonder hulpmiddelen korte afstand zwemmen.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010011'::uuid, '00000000-0000-4000-8000-000000020011'::uuid, 'Ruben Scholten', 'ruben.scholten@example.test', '+31 6 11223311', 'Lena Scholten', '2019-10-30'::date, 'registration', 'badje-1', array['monday','saturday']::text[], array['morning','weekend']::text[], 'new', 74.0, 'none', 'normal', null, '{"swim_experience":"Watervrij, vindt onder water gaan spannend.","medical_notes":"Geen."}'::jsonb),
        ('00000000-0000-4000-8000-000000010012'::uuid, '00000000-0000-4000-8000-000000020012'::uuid, 'Kim van Es', 'kim.vanes@example.test', '+31 6 11223312', 'Nora van Es', '2017-12-19'::date, 'waitlist', 'badje-3', array['wednesday','sunday']::text[], array['afternoon','weekend']::text[], 'matched', 89.0, 'none', 'normal', null, '{"swim_experience":"Heeft badje 2 afgerond, zoekt plek voor techniekverdieping.","medical_notes":"Geen."}'::jsonb)
    ) as seed(
      intake_id,
      waitlist_id,
      parent_name,
      parent_email,
      parent_phone,
      participant_name,
      participant_birthdate,
      intake_type,
      stage_code,
      preferred_days,
      preferred_time_windows,
      intake_status,
      score,
      duplicate_risk,
      admin_priority,
      priority_reason,
      answers
    )
  loop
    select id into v_target_stage_id
    from public.stages
    where tenant_id = v_demo_tenant_id
      and program_id = v_diploma_a_program_id
      and code = intake.stage_code;

    select id into v_intake_config_id
    from public.intake_form_configs
    where tenant_id = v_demo_tenant_id
      and program_id = v_diploma_a_program_id
      and status = 'active'
    order by config_version desc
    limit 1;

    insert into public.intake_submissions (
      id,
      tenant_id,
      program_id,
      intake_form_config_id,
      intake_type,
      parent_name,
      parent_email,
      parent_phone,
      participant_name,
      participant_birthdate,
      preferred_days,
      preferred_time_windows,
      notes,
      answers,
      intake_config_version,
      recommendation_snapshot,
      duplicate_snapshot,
      missing_information,
      status
    )
    values (
      intake.intake_id,
      v_demo_tenant_id,
      v_diploma_a_program_id,
      v_intake_config_id,
      intake.intake_type,
      intake.parent_name,
      intake.parent_email,
      intake.parent_phone,
      intake.participant_name,
      intake.participant_birthdate,
      intake.preferred_days,
      intake.preferred_time_windows,
      'Demo seed voor testen van inschrijfformulier, smart intake en plaatsing.',
      intake.answers,
      1,
      jsonb_build_object(
        'action', 'recommend_start_stage',
        'recommended_stage_id', v_target_stage_id,
        'recommended_stage_label', coalesce((select name from public.stages where id = v_target_stage_id), intake.stage_code),
        'score', intake.score,
        'confidence', case when intake.score >= 85 then 'high' when intake.score >= 70 then 'medium' else 'low' end,
        'rule_version', 'demo-seed-v1',
        'parent_summary', 'Demo-inschatting op basis van zwemervaring, voorkeuren en capaciteit.'
      ),
      jsonb_build_object(
        'total', case when intake.duplicate_risk = 'none' then 0 else 1 end,
        'blocking', 0,
        'warning', case when intake.duplicate_risk = 'warning' then 1 else 0 end,
        'checked_at', now()
      ),
      '{}'::text[],
      intake.intake_status
    )
    on conflict (id) do update
      set intake_form_config_id = excluded.intake_form_config_id,
          intake_type = excluded.intake_type,
          parent_name = excluded.parent_name,
          parent_email = excluded.parent_email,
          parent_phone = excluded.parent_phone,
          participant_name = excluded.participant_name,
          participant_birthdate = excluded.participant_birthdate,
          preferred_days = excluded.preferred_days,
          preferred_time_windows = excluded.preferred_time_windows,
          notes = excluded.notes,
          answers = excluded.answers,
          intake_config_version = excluded.intake_config_version,
          recommendation_snapshot = excluded.recommendation_snapshot,
          duplicate_snapshot = excluded.duplicate_snapshot,
          missing_information = excluded.missing_information,
          status = excluded.status;

    delete from public.intake_submission_events
    where tenant_id = v_demo_tenant_id
      and submission_id = intake.intake_id
      and note like 'Demo seed:%';

    insert into public.intake_submission_events (tenant_id, submission_id, status, note)
    values (
      v_demo_tenant_id,
      intake.intake_id,
      intake.intake_status,
      'Demo seed: inschrijfformulier klaar voor testflow.'
    );

    insert into public.waitlist_entries (
      id,
      tenant_id,
      intake_submission_id,
      program_id,
      recommended_stage_id,
      status,
      priority_date,
      preferred_days,
      preferred_time_windows,
      source,
      notes,
      waitlist_score,
      score_reasons,
      score_snapshot,
      admin_priority,
      priority_reason,
      duplicate_risk,
      evaluated_at
    )
    values (
      intake.waitlist_id,
      v_demo_tenant_id,
      intake.intake_id,
      v_diploma_a_program_id,
      v_target_stage_id,
      case when intake.intake_status = 'matched' then 'matched' else 'queued' end,
      current_date - ((right(intake.waitlist_id::text, 1))::integer * 2),
      intake.preferred_days,
      intake.preferred_time_windows,
      'intake',
      'Demo wachtlijstregel met verschillende voorkeuren voor plaatsingstest.',
      intake.score,
      jsonb_build_array(
        jsonb_build_object('code', 'stage_fit', 'label', 'Niveau past', 'detail', 'Aanbevolen niveau komt uit intake seed.'),
        jsonb_build_object('code', 'preference_fit', 'label', 'Voorkeuren bekend', 'detail', 'Dagen en tijdvakken zijn vastgelegd.')
      ),
      jsonb_build_object(
        'source', 'demo-seed',
        'preferred_days', intake.preferred_days,
        'preferred_time_windows', intake.preferred_time_windows,
        'recommended_stage_code', intake.stage_code
      ),
      intake.admin_priority,
      intake.priority_reason,
      intake.duplicate_risk,
      now()
    )
    on conflict (intake_submission_id) do update
      set recommended_stage_id = excluded.recommended_stage_id,
          status = excluded.status,
          priority_date = excluded.priority_date,
          preferred_days = excluded.preferred_days,
          preferred_time_windows = excluded.preferred_time_windows,
          notes = excluded.notes,
          waitlist_score = excluded.waitlist_score,
          score_reasons = excluded.score_reasons,
          score_snapshot = excluded.score_snapshot,
          admin_priority = excluded.admin_priority,
          priority_reason = excluded.priority_reason,
          duplicate_risk = excluded.duplicate_risk,
          evaluated_at = excluded.evaluated_at
    returning id into v_waitlist_id;

    delete from public.waitlist_entry_events
    where tenant_id = v_demo_tenant_id
      and waitlist_entry_id = v_waitlist_id
      and note like 'Demo seed:%';

    insert into public.waitlist_entry_events (tenant_id, waitlist_entry_id, event_type, note, metadata)
    values (
      v_demo_tenant_id,
      v_waitlist_id,
      'scored',
      'Demo seed: wachtlijstscore en voorkeuren toegevoegd.',
      jsonb_build_object('score', intake.score, 'duplicate_risk', intake.duplicate_risk)
    );
  end loop;
end $$;
