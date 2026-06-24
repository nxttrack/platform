create table public.milestone_readiness_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  stage_id uuid references public.stages (id) on delete set null,
  code text not null,
  name text not null,
  description text,
  min_completed_modules integer not null default 0,
  min_score numeric(5, 2),
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_readiness_criteria_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint milestone_readiness_criteria_modules_check check (min_completed_modules >= 0),
  constraint milestone_readiness_criteria_score_check check (min_score is null or min_score between 0 and 100),
  constraint milestone_readiness_criteria_status_check check (status in ('draft', 'active', 'archived')),
  constraint milestone_readiness_criteria_id_tenant_unique unique (id, tenant_id),
  constraint milestone_readiness_criteria_unique_code unique (tenant_id, program_id, code),
  constraint milestone_readiness_criteria_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade,
  constraint milestone_readiness_criteria_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id)
);

create table public.milestone_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  stage_id uuid references public.stages (id) on delete set null,
  resource_id uuid references public.resources (id) on delete set null,
  event_type text not null default 'certification',
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 1,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_events_type_check check (event_type in ('certification', 'afzwem', 'exam', 'showcase', 'graduation')),
  constraint milestone_events_status_check check (status in ('draft', 'scheduled', 'completed', 'cancelled')),
  constraint milestone_events_time_check check (starts_at < ends_at),
  constraint milestone_events_capacity_check check (capacity > 0),
  constraint milestone_events_id_tenant_unique unique (id, tenant_id),
  constraint milestone_events_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint milestone_events_stage_tenant_fk foreign key (stage_id, tenant_id) references public.stages (id, tenant_id),
  constraint milestone_events_resource_tenant_fk foreign key (resource_id, tenant_id) references public.resources (id, tenant_id)
);

create table public.milestone_event_participants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  milestone_event_id uuid not null references public.milestone_events (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  readiness_criteria_id uuid references public.milestone_readiness_criteria (id) on delete set null,
  invited_by_profile_id uuid references public.profiles (id) on delete set null,
  status text not null default 'invited',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_event_participants_status_check check (status in ('invited', 'confirmed', 'declined', 'attended', 'no_show', 'cancelled')),
  constraint milestone_event_participants_id_tenant_unique unique (id, tenant_id),
  constraint milestone_event_participants_unique_event_enrollment unique (tenant_id, milestone_event_id, enrollment_id),
  constraint milestone_event_participants_event_tenant_fk foreign key (milestone_event_id, tenant_id) references public.milestone_events (id, tenant_id) on delete cascade,
  constraint milestone_event_participants_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint milestone_event_participants_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint milestone_event_participants_criteria_tenant_fk foreign key (readiness_criteria_id, tenant_id) references public.milestone_readiness_criteria (id, tenant_id)
);

create table public.milestone_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  milestone_event_participant_id uuid not null references public.milestone_event_participants (id) on delete cascade,
  milestone_event_id uuid not null references public.milestone_events (id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  result_status text not null default 'pending',
  score numeric(5, 2),
  note text,
  registered_by_profile_id uuid references public.profiles (id) on delete set null,
  registered_at timestamptz not null default now(),
  certificate_id uuid references public.certificates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint milestone_results_status_check check (result_status in ('pending', 'passed', 'failed', 'absent', 'needs_retry')),
  constraint milestone_results_score_check check (score is null or score between 0 and 100),
  constraint milestone_results_id_tenant_unique unique (id, tenant_id),
  constraint milestone_results_unique_participant unique (tenant_id, milestone_event_participant_id),
  constraint milestone_results_event_participant_tenant_fk foreign key (milestone_event_participant_id, tenant_id) references public.milestone_event_participants (id, tenant_id) on delete cascade,
  constraint milestone_results_event_tenant_fk foreign key (milestone_event_id, tenant_id) references public.milestone_events (id, tenant_id) on delete cascade,
  constraint milestone_results_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id) on delete cascade,
  constraint milestone_results_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id) on delete cascade,
  constraint milestone_results_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint milestone_results_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id)
);

alter table public.certificates
  add column source_event_id uuid references public.milestone_events (id) on delete set null,
  add column source_result_id uuid references public.milestone_results (id) on delete set null,
  add column file_path text,
  add column download_status text not null default 'pending',
  add column share_token text,
  add column share_enabled boolean not null default false,
  add column share_expires_at timestamptz,
  add column vault_status text not null default 'draft',
  add column metadata jsonb not null default '{}'::jsonb,
  add constraint certificates_download_status_check check (download_status in ('pending', 'ready', 'blocked')),
  add constraint certificates_vault_status_check check (vault_status in ('draft', 'available', 'archived')),
  add constraint certificates_source_event_tenant_fk foreign key (source_event_id, tenant_id) references public.milestone_events (id, tenant_id),
  add constraint certificates_source_result_tenant_fk foreign key (source_result_id, tenant_id) references public.milestone_results (id, tenant_id),
  add constraint certificates_unique_share_token unique (share_token);

create index milestone_readiness_criteria_tenant_program_idx on public.milestone_readiness_criteria (tenant_id, program_id, status);
create index milestone_events_tenant_starts_idx on public.milestone_events (tenant_id, starts_at desc);
create index milestone_events_program_idx on public.milestone_events (program_id);
create index milestone_event_participants_event_idx on public.milestone_event_participants (milestone_event_id);
create index milestone_event_participants_participant_idx on public.milestone_event_participants (participant_id);
create index milestone_event_participants_status_idx on public.milestone_event_participants (tenant_id, status);
create index milestone_results_participant_idx on public.milestone_results (participant_id);
create index milestone_results_event_idx on public.milestone_results (milestone_event_id);
create index certificates_source_event_idx on public.certificates (source_event_id);
create index certificates_vault_status_idx on public.certificates (tenant_id, vault_status, issued_on desc);

create trigger milestone_readiness_criteria_set_updated_at
  before update on public.milestone_readiness_criteria
  for each row execute function app_private.set_updated_at();

create trigger milestone_events_set_updated_at
  before update on public.milestone_events
  for each row execute function app_private.set_updated_at();

create trigger milestone_event_participants_set_updated_at
  before update on public.milestone_event_participants
  for each row execute function app_private.set_updated_at();

create trigger milestone_results_set_updated_at
  before update on public.milestone_results
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.milestone_readiness_criteria to authenticated;
grant select, insert, update on public.milestone_events to authenticated;
grant select, insert, update on public.milestone_event_participants to authenticated;
grant select, insert, update on public.milestone_results to authenticated;
grant insert (tenant_id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on, source_event_id, source_result_id, file_path, download_status, share_token, share_enabled, share_expires_at, vault_status, metadata) on public.certificates to authenticated;
grant update (certificate_number, title, status, issued_on, source_event_id, source_result_id, file_path, download_status, share_token, share_enabled, share_expires_at, vault_status, metadata) on public.certificates to authenticated;

grant all on public.milestone_readiness_criteria to service_role;
grant all on public.milestone_events to service_role;
grant all on public.milestone_event_participants to service_role;
grant all on public.milestone_results to service_role;

alter table public.milestone_readiness_criteria enable row level security;
alter table public.milestone_events enable row level security;
alter table public.milestone_event_participants enable row level security;
alter table public.milestone_results enable row level security;

create policy "Tenant members can view milestone readiness criteria"
  on public.milestone_readiness_criteria
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can insert milestone readiness criteria"
  on public.milestone_readiness_criteria
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update milestone readiness criteria"
  on public.milestone_readiness_criteria
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant members can view milestone events"
  on public.milestone_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor', 'parent', 'athlete'])
  );

create policy "Tenant staff can insert milestone events"
  on public.milestone_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update milestone events"
  on public.milestone_events
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Participants and staff can view milestone participants"
  on public.milestone_event_participants
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert milestone participants"
  on public.milestone_event_participants
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update milestone participants"
  on public.milestone_event_participants
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Participants and staff can view milestone results"
  on public.milestone_results
  for select
  to authenticated
  using (app_private.current_user_can_access_enrollment(tenant_id, enrollment_id));

create policy "Tenant staff can insert milestone results"
  on public.milestone_results
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update milestone results"
  on public.milestone_results
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can insert certificates"
  on public.certificates
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update certificates"
  on public.certificates
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create or replace function app_private.notify_guardians_for_milestone_participant()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_participant public.participants%rowtype;
  target_event public.milestone_events%rowtype;
  guardian record;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  select * into target_event
  from public.milestone_events
  where id = new.milestone_event_id
    and tenant_id = new.tenant_id;

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      new.participant_id,
      new.enrollment_id,
      case when new.status = 'invited' then 'Afzwemmoment gepland' else 'Afzwemmoment bijgewerkt' end,
      coalesce(target_participant.display_name, 'Leerling') || ': ' || coalesce(target_event.title, 'moment') || ' - ' || new.status,
      'general',
      'unread'
    );
  end loop;

  return new;
end $$;

revoke all on function app_private.notify_guardians_for_milestone_participant() from public;

create or replace function app_private.publish_milestone_result()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_participant public.participants%rowtype;
  target_program public.programs%rowtype;
  target_event public.milestone_events%rowtype;
  target_certificate_id uuid;
  generated_number text;
  guardian record;
begin
  if tg_op = 'UPDATE'
    and old.result_status is not distinct from new.result_status
    and old.score is not distinct from new.score
    and old.note is not distinct from new.note then
    return new;
  end if;

  select * into target_participant
  from public.participants
  where id = new.participant_id
    and tenant_id = new.tenant_id;

  select * into target_program
  from public.programs
  where id = new.program_id
    and tenant_id = new.tenant_id;

  select * into target_event
  from public.milestone_events
  where id = new.milestone_event_id
    and tenant_id = new.tenant_id;

  if new.result_status = 'passed' then
    select id into target_certificate_id
    from public.certificates
    where tenant_id = new.tenant_id
      and source_result_id = new.id
    limit 1;

    if target_certificate_id is null then
      generated_number := 'CERT-' || upper(substr(new.id::text, 1, 8));

      insert into public.certificates (
        tenant_id,
        enrollment_id,
        participant_id,
        program_id,
        certificate_number,
        title,
        status,
        issued_on,
        source_event_id,
        source_result_id,
        file_path,
        download_status,
        share_token,
        share_enabled,
        vault_status,
        metadata
      )
      values (
        new.tenant_id,
        new.enrollment_id,
        new.participant_id,
        new.program_id,
        generated_number,
        coalesce(target_program.name, 'Certificate'),
        'issued',
        current_date,
        new.milestone_event_id,
        new.id,
        'diplomas/' || new.tenant_id::text || '/' || new.participant_id::text || '/' || generated_number || '.pdf',
        'ready',
        replace(gen_random_uuid()::text, '-', ''),
        false,
        'available',
        jsonb_build_object('source', 'milestone_result', 'event_type', coalesce(target_event.event_type, 'certification'))
      )
      returning id into target_certificate_id;
    end if;

    update public.milestone_results
    set certificate_id = target_certificate_id
    where id = new.id
      and tenant_id = new.tenant_id
      and certificate_id is distinct from target_certificate_id;

    insert into public.parent_documents (
      tenant_id,
      participant_id,
      enrollment_id,
      certificate_id,
      title,
      document_type,
      status,
      file_path,
      available_on
    )
    select
      new.tenant_id,
      new.participant_id,
      new.enrollment_id,
      target_certificate_id,
      'Diploma ' || coalesce(target_program.name, 'certificate'),
      'diploma',
      'available',
      certificates.file_path,
      current_date
    from public.certificates
    where certificates.id = target_certificate_id
      and certificates.tenant_id = new.tenant_id
      and not exists (
        select 1
        from public.parent_documents existing
        where existing.tenant_id = new.tenant_id
          and existing.certificate_id = target_certificate_id
      );
  end if;

  for guardian in
    select profile_id
    from public.participant_guardians
    where tenant_id = new.tenant_id
      and participant_id = new.participant_id
      and status = 'active'
  loop
    insert into public.parent_notifications (
      tenant_id,
      recipient_profile_id,
      participant_id,
      enrollment_id,
      title,
      body,
      notification_type,
      status
    )
    values (
      new.tenant_id,
      guardian.profile_id,
      new.participant_id,
      new.enrollment_id,
      case when new.result_status = 'passed' then 'Diploma beschikbaar' else 'Afzwemresultaat geregistreerd' end,
      coalesce(target_participant.display_name, 'Leerling') || ': ' || new.result_status || coalesce(' - score ' || new.score::text || '%', ''),
      case when new.result_status = 'passed' then 'document' else 'progress' end,
      'unread'
    );
  end loop;

  return new;
end $$;

revoke all on function app_private.publish_milestone_result() from public;

create trigger milestone_event_participants_notify_guardians
  after insert or update on public.milestone_event_participants
  for each row execute function app_private.notify_guardians_for_milestone_participant();

create trigger milestone_results_publish
  after insert or update on public.milestone_results
  for each row execute function app_private.publish_milestone_result();

do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
  afzwem_stage_id uuid;
  lane_1_id uuid;
  noah_id uuid;
  noah_enrollment_id uuid;
  criteria_id uuid;
  event_id uuid;
  event_participant_record_id uuid;
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

  select id into afzwem_stage_id
  from public.stages
  where tenant_id = demo_tenant_id
    and code = 'afzwem-ready';

  select id into lane_1_id
  from public.resources
  where tenant_id = demo_tenant_id
    and code = 'bad-1-baan-1';

  select id into noah_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-noah-bakker';

  select id into noah_enrollment_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = noah_id
  limit 1;

  if diploma_a_program_id is null or noah_id is null or noah_enrollment_id is null then
    return;
  end if;

  insert into public.milestone_readiness_criteria (
    tenant_id,
    program_id,
    stage_id,
    code,
    name,
    description,
    min_completed_modules,
    min_score,
    status,
    metadata
  )
  values (
    demo_tenant_id,
    diploma_a_program_id,
    afzwem_stage_id,
    'diploma-a-afzwem-ready',
    'Diploma A afzwem-ready',
    'Demo-criteria: modules afgerond, instructeur akkoord en planning beschikbaar.',
    2,
    80,
    'active',
    '{"sector_label":"Afzwem-ready"}'::jsonb
  )
  on conflict (tenant_id, program_id, code) do update
    set stage_id = excluded.stage_id,
        name = excluded.name,
        description = excluded.description,
        min_completed_modules = excluded.min_completed_modules,
        min_score = excluded.min_score,
        status = excluded.status,
        metadata = excluded.metadata
  returning id into criteria_id;

  insert into public.milestone_events (
    tenant_id,
    program_id,
    stage_id,
    resource_id,
    event_type,
    title,
    description,
    starts_at,
    ends_at,
    capacity,
    status
  )
  values (
    demo_tenant_id,
    diploma_a_program_id,
    afzwem_stage_id,
    lane_1_id,
    'afzwem',
    'Afzwemmen Diploma A - Demo',
    'Demo afzwemmoment voor Diploma A.',
    '2026-07-18 10:00:00+02',
    '2026-07-18 11:30:00+02',
    12,
    'scheduled'
  )
  on conflict do nothing
  returning id into event_id;

  if event_id is null then
    select id into event_id
    from public.milestone_events
    where tenant_id = demo_tenant_id
      and title = 'Afzwemmen Diploma A - Demo'
    limit 1;
  end if;

  if event_id is not null then
    insert into public.milestone_event_participants (
      tenant_id,
      milestone_event_id,
      enrollment_id,
      participant_id,
      readiness_criteria_id,
      status,
      note
    )
    values (
      demo_tenant_id,
      event_id,
      noah_enrollment_id,
      noah_id,
      criteria_id,
      'confirmed',
      'Demo: klaar voor afzwemmen volgens criteria.'
    )
    on conflict (tenant_id, milestone_event_id, enrollment_id) do update
      set readiness_criteria_id = excluded.readiness_criteria_id,
          status = excluded.status,
          note = excluded.note
    returning id into event_participant_record_id;
  end if;
end $$;
