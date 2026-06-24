create table public.tenant_public_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  status text not null default 'draft',
  hero_title text not null,
  hero_subtitle text not null,
  primary_cta_label text not null default 'Bekijk programma''s',
  secondary_cta_label text not null default 'Start intake',
  intro_title text,
  intro_body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_public_profiles_status_check check (status in ('draft', 'published', 'archived'))
);

create table public.program_public_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  public_slug text not null,
  status text not null default 'draft',
  summary text,
  detail text,
  age_label text,
  duration_label text,
  price_label text,
  capacity_label text,
  trial_enabled boolean not null default false,
  registration_enabled boolean not null default true,
  waitlist_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint program_public_settings_slug_format check (public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint program_public_settings_status_check check (status in ('draft', 'published', 'archived')),
  constraint program_public_settings_unique_program unique (program_id),
  constraint program_public_settings_unique_slug unique (tenant_id, public_slug),
  constraint program_public_settings_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade
);

create table public.intake_form_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  status text not null default 'draft',
  intro text,
  allowed_intake_options text[] not null default array['registration', 'waitlist']::text[],
  custom_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_form_configs_status_check check (status in ('draft', 'active', 'archived')),
  constraint intake_form_configs_options_check check (allowed_intake_options <@ array['trial', 'registration', 'waitlist']::text[]),
  constraint intake_form_configs_questions_check check (jsonb_typeof(custom_questions) = 'array'),
  constraint intake_form_configs_id_tenant_unique unique (id, tenant_id),
  constraint intake_form_configs_unique_program unique (program_id),
  constraint intake_form_configs_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete cascade
);

create table public.intake_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  intake_form_config_id uuid references public.intake_form_configs (id) on delete set null,
  intake_type text not null,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  participant_name text not null,
  participant_birthdate date,
  preferred_days text[] not null default '{}'::text[],
  preferred_time_windows text[] not null default '{}'::text[],
  notes text,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_submissions_type_check check (intake_type in ('trial', 'registration', 'waitlist')),
  constraint intake_submissions_status_check check (status in ('new', 'reviewing', 'matched', 'slot_offered', 'accepted', 'declined', 'cancelled')),
  constraint intake_submissions_preferred_days_check check (preferred_days <@ array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::text[]),
  constraint intake_submissions_answers_check check (jsonb_typeof(answers) = 'object'),
  constraint intake_submissions_id_tenant_unique unique (id, tenant_id),
  constraint intake_submissions_program_tenant_fk foreign key (program_id, tenant_id) references public.programs (id, tenant_id) on delete restrict,
  constraint intake_submissions_config_tenant_fk foreign key (intake_form_config_id, tenant_id) references public.intake_form_configs (id, tenant_id)
);

create table public.intake_submission_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  submission_id uuid not null references public.intake_submissions (id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  constraint intake_submission_events_status_check check (status in ('new', 'reviewing', 'matched', 'slot_offered', 'accepted', 'declined', 'cancelled')),
  constraint intake_submission_events_submission_tenant_fk foreign key (submission_id, tenant_id) references public.intake_submissions (id, tenant_id) on delete cascade
);

create index program_public_settings_tenant_id_idx on public.program_public_settings (tenant_id);
create index program_public_settings_program_id_idx on public.program_public_settings (program_id);
create index intake_form_configs_tenant_id_idx on public.intake_form_configs (tenant_id);
create index intake_form_configs_program_id_idx on public.intake_form_configs (program_id);
create index intake_submissions_tenant_id_idx on public.intake_submissions (tenant_id);
create index intake_submissions_program_id_idx on public.intake_submissions (program_id);
create index intake_submissions_status_idx on public.intake_submissions (status);
create index intake_submission_events_submission_id_idx on public.intake_submission_events (submission_id);

create trigger tenant_public_profiles_set_updated_at
  before update on public.tenant_public_profiles
  for each row execute function app_private.set_updated_at();

create trigger program_public_settings_set_updated_at
  before update on public.program_public_settings
  for each row execute function app_private.set_updated_at();

create trigger intake_form_configs_set_updated_at
  before update on public.intake_form_configs
  for each row execute function app_private.set_updated_at();

create trigger intake_submissions_set_updated_at
  before update on public.intake_submissions
  for each row execute function app_private.set_updated_at();

grant select on public.tenants to anon;
grant select on public.tenant_settings to anon;
grant select on public.tenant_domains to anon;
grant select on public.programs to anon;
grant select on public.stages to anon;

grant select on public.tenant_public_profiles to anon;
grant select, insert, update on public.tenant_public_profiles to authenticated;
grant all on public.tenant_public_profiles to service_role;

grant select on public.program_public_settings to anon;
grant select, insert, update on public.program_public_settings to authenticated;
grant all on public.program_public_settings to service_role;

grant select on public.intake_form_configs to anon;
grant select, insert, update on public.intake_form_configs to authenticated;
grant all on public.intake_form_configs to service_role;

grant insert on public.intake_submissions to anon;
grant select, insert, update on public.intake_submissions to authenticated;
grant all on public.intake_submissions to service_role;

grant insert on public.intake_submission_events to anon;
grant select, insert, update on public.intake_submission_events to authenticated;
grant all on public.intake_submission_events to service_role;

alter table public.tenant_public_profiles enable row level security;
alter table public.program_public_settings enable row level security;
alter table public.intake_form_configs enable row level security;
alter table public.intake_submissions enable row level security;
alter table public.intake_submission_events enable row level security;

create policy "Public can view active tenants"
  on public.tenants
  for select
  to authenticated, anon
  using (status = 'active');

create policy "Public can view active tenant settings"
  on public.tenant_settings
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.tenants tenant
      where tenant.id = tenant_settings.tenant_id
        and tenant.status = 'active'
    )
  );

create policy "Public can view verified tenant domains"
  on public.tenant_domains
  for select
  to authenticated, anon
  using (
    status = 'verified'
    and exists (
      select 1
      from public.tenants tenant
      where tenant.id = tenant_domains.tenant_id
        and tenant.status = 'active'
    )
  );

create policy "Public can view active programs"
  on public.programs
  for select
  to authenticated, anon
  using (
    status = 'active'
    and exists (
      select 1
      from public.tenants tenant
      where tenant.id = programs.tenant_id
        and tenant.status = 'active'
    )
  );

create policy "Public can view active stages"
  on public.stages
  for select
  to authenticated, anon
  using (
    status = 'active'
    and exists (
      select 1
      from public.programs program
      where program.id = stages.program_id
        and program.tenant_id = stages.tenant_id
        and program.status = 'active'
    )
  );

create policy "Public can view published tenant profiles"
  on public.tenant_public_profiles
  for select
  to authenticated, anon
  using (
    status = 'published'
    and exists (
      select 1
      from public.tenants tenant
      where tenant.id = tenant_public_profiles.tenant_id
        and tenant.status = 'active'
    )
  );

create policy "Tenant staff can insert tenant public profiles"
  on public.tenant_public_profiles
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update tenant public profiles"
  on public.tenant_public_profiles
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

create policy "Public can view published program settings"
  on public.program_public_settings
  for select
  to authenticated, anon
  using (
    status = 'published'
    and exists (
      select 1
      from public.programs program
      where program.id = program_public_settings.program_id
        and program.tenant_id = program_public_settings.tenant_id
        and program.status = 'active'
    )
  );

create policy "Tenant staff can insert program public settings"
  on public.program_public_settings
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update program public settings"
  on public.program_public_settings
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

create policy "Public can view active intake configs"
  on public.intake_form_configs
  for select
  to authenticated, anon
  using (
    status = 'active'
    and exists (
      select 1
      from public.programs program
      where program.id = intake_form_configs.program_id
        and program.tenant_id = intake_form_configs.tenant_id
        and program.status = 'active'
    )
  );

create policy "Tenant staff can insert intake configs"
  on public.intake_form_configs
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update intake configs"
  on public.intake_form_configs
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

create policy "Public can insert intake submissions"
  on public.intake_submissions
  for insert
  to authenticated, anon
  with check (
    status = 'new'
    and exists (
      select 1
      from public.intake_form_configs config
      where config.id = intake_submissions.intake_form_config_id
        and config.tenant_id = intake_submissions.tenant_id
        and config.program_id = intake_submissions.program_id
        and config.status = 'active'
        and intake_submissions.intake_type = any(config.allowed_intake_options)
    )
  );

create policy "Tenant staff can view intake submissions"
  on public.intake_submissions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update intake submissions"
  on public.intake_submissions
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

create policy "Public can insert initial intake events"
  on public.intake_submission_events
  for insert
  to authenticated, anon
  with check (status = 'new');

create policy "Tenant staff can view intake events"
  on public.intake_submission_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update intake events"
  on public.intake_submission_events
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

do $$
declare
  demo_tenant_id uuid;
  diploma_a_program_id uuid;
  diploma_b_program_id uuid;
  a_config_id uuid;
  b_config_id uuid;
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

  select id into diploma_b_program_id
  from public.programs
  where tenant_id = demo_tenant_id
    and code = 'zwemdiploma-b';

  insert into public.tenant_public_profiles (tenant_id, status, hero_title, hero_subtitle, primary_cta_label, secondary_cta_label, intro_title, intro_body)
  values (
    demo_tenant_id,
    'published',
    'AquaSwim Demo zwemschool',
    'Zwemlessen met heldere niveaus, vaste groepen en een intake die direct de juiste route helpt kiezen.',
    'Bekijk programma''s',
    'Start intake',
    'Van eerste plons tot diploma',
    'Kies een programma, geef je voorkeuren door en wij matchen je kind met het juiste niveau, moment en bad.'
  )
  on conflict (tenant_id) do update
    set status = excluded.status,
        hero_title = excluded.hero_title,
        hero_subtitle = excluded.hero_subtitle,
        primary_cta_label = excluded.primary_cta_label,
        secondary_cta_label = excluded.secondary_cta_label,
        intro_title = excluded.intro_title,
        intro_body = excluded.intro_body;

  if diploma_a_program_id is not null then
    insert into public.program_public_settings (
      tenant_id,
      program_id,
      public_slug,
      status,
      summary,
      detail,
      age_label,
      duration_label,
      price_label,
      capacity_label,
      trial_enabled,
      registration_enabled,
      waitlist_enabled,
      sort_order
    )
    values (
      demo_tenant_id,
      diploma_a_program_id,
      'zwemdiploma-a',
      'published',
      'Het complete traject richting Zwemdiploma A.',
      'Voor kinderen die veilig en zelfverzekerd willen leren zwemmen. De intake bepaalt het startniveau en voorkeurstijden.',
      'Vanaf 4 jaar',
      '45 minuten per les',
      'Vanaf EUR 69,95 per maand',
      'Beperkte plekken per groep',
      true,
      true,
      true,
      10
    )
    on conflict (program_id) do update
      set public_slug = excluded.public_slug,
          status = excluded.status,
          summary = excluded.summary,
          detail = excluded.detail,
          age_label = excluded.age_label,
          duration_label = excluded.duration_label,
          price_label = excluded.price_label,
          capacity_label = excluded.capacity_label,
          trial_enabled = excluded.trial_enabled,
          registration_enabled = excluded.registration_enabled,
          waitlist_enabled = excluded.waitlist_enabled,
          sort_order = excluded.sort_order;

    insert into public.intake_form_configs (tenant_id, program_id, status, intro, allowed_intake_options, custom_questions)
    values (
      demo_tenant_id,
      diploma_a_program_id,
      'active',
      'Vertel ons kort over je kind en jullie voorkeursmomenten. Daarna maken we een passende plaatsingssuggestie.',
      array['trial', 'registration', 'waitlist']::text[],
      '[{"name":"swim_experience","label":"Heeft je kind al zwemervaring?","type":"textarea","required":false},{"name":"medical_notes","label":"Zijn er medische aandachtspunten?","type":"textarea","required":false}]'::jsonb
    )
    on conflict (program_id) do update
      set status = excluded.status,
          intro = excluded.intro,
          allowed_intake_options = excluded.allowed_intake_options,
          custom_questions = excluded.custom_questions
    returning id into a_config_id;
  end if;

  if diploma_b_program_id is not null then
    insert into public.program_public_settings (
      tenant_id,
      program_id,
      public_slug,
      status,
      summary,
      detail,
      age_label,
      duration_label,
      price_label,
      capacity_label,
      trial_enabled,
      registration_enabled,
      waitlist_enabled,
      sort_order
    )
    values (
      demo_tenant_id,
      diploma_b_program_id,
      'zwemdiploma-b',
      'published',
      'Vervolglessen na Zwemdiploma A.',
      'Voor kinderen die hun techniek, conditie en veiligheid verder willen versterken richting Diploma B.',
      'Na Diploma A',
      '45 minuten per les',
      'Vanaf EUR 69,95 per maand',
      'Instroom op basis van niveau',
      false,
      true,
      true,
      20
    )
    on conflict (program_id) do update
      set public_slug = excluded.public_slug,
          status = excluded.status,
          summary = excluded.summary,
          detail = excluded.detail,
          age_label = excluded.age_label,
          duration_label = excluded.duration_label,
          price_label = excluded.price_label,
          capacity_label = excluded.capacity_label,
          trial_enabled = excluded.trial_enabled,
          registration_enabled = excluded.registration_enabled,
          waitlist_enabled = excluded.waitlist_enabled,
          sort_order = excluded.sort_order;

    insert into public.intake_form_configs (tenant_id, program_id, status, intro, allowed_intake_options, custom_questions)
    values (
      demo_tenant_id,
      diploma_b_program_id,
      'active',
      'Laat ons weten wanneer je kind Diploma A heeft behaald en welke momenten passen.',
      array['registration', 'waitlist']::text[],
      '[{"name":"previous_diploma_date","label":"Wanneer is Diploma A behaald?","type":"text","required":false}]'::jsonb
    )
    on conflict (program_id) do update
      set status = excluded.status,
          intro = excluded.intro,
          allowed_intake_options = excluded.allowed_intake_options,
          custom_questions = excluded.custom_questions
    returning id into b_config_id;
  end if;
end $$;
