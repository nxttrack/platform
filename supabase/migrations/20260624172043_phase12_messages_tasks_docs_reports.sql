create table public.communication_provider_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  mode text not null default 'test',
  status text not null default 'disabled',
  display_name text not null,
  host text,
  port integer,
  from_email text,
  from_name text,
  username_secret_reference text,
  password_secret_reference text,
  api_key_secret_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_provider_configs_provider_check check (provider in ('smtp', 'sendgrid')),
  constraint communication_provider_configs_mode_check check (mode in ('test', 'live')),
  constraint communication_provider_configs_status_check check (status in ('disabled', 'configured', 'active')),
  constraint communication_provider_configs_port_check check (port is null or port between 1 and 65535),
  constraint communication_provider_configs_id_tenant_unique unique (id, tenant_id),
  constraint communication_provider_configs_unique_provider unique (tenant_id, provider, mode)
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code text not null,
  name text not null,
  channel text not null default 'email',
  audience text not null default 'parent',
  subject_template text,
  body_template text not null,
  status text not null default 'draft',
  tags text[] not null default '{}'::text[],
  sort_order integer not null default 0,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_templates_channel_check check (channel in ('email', 'in_app')),
  constraint message_templates_audience_check check (audience in ('parent', 'instructor', 'tenant_admin', 'all')),
  constraint message_templates_status_check check (status in ('draft', 'active', 'archived')),
  constraint message_templates_code_format check (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint message_templates_id_tenant_unique unique (id, tenant_id),
  constraint message_templates_unique_code unique (tenant_id, code)
);

create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  template_id uuid references public.message_templates (id) on delete set null,
  channel text not null default 'email',
  provider text not null default 'smtp',
  recipient_profile_id uuid references public.profiles (id) on delete set null,
  recipient_email text,
  participant_id uuid references public.participants (id) on delete set null,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  subject text,
  body text not null,
  status text not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_outbox_channel_check check (channel in ('email', 'in_app')),
  constraint message_outbox_provider_check check (provider in ('smtp', 'sendgrid', 'internal')),
  constraint message_outbox_status_check check (status in ('draft', 'queued', 'sent', 'failed', 'cancelled')),
  constraint message_outbox_id_tenant_unique unique (id, tenant_id),
  constraint message_outbox_template_tenant_fk foreign key (template_id, tenant_id) references public.message_templates (id, tenant_id),
  constraint message_outbox_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id),
  constraint message_outbox_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create table public.operational_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null,
  description text,
  task_type text not null default 'general',
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to_profile_id uuid references public.profiles (id) on delete set null,
  participant_id uuid references public.participants (id) on delete set null,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  due_on date,
  completed_at timestamptz,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_tasks_type_check check (task_type in ('general', 'planning', 'placement', 'payment', 'document', 'follow_up')),
  constraint operational_tasks_status_check check (status in ('open', 'in_progress', 'done', 'cancelled')),
  constraint operational_tasks_priority_check check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint operational_tasks_id_tenant_unique unique (id, tenant_id),
  constraint operational_tasks_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id),
  constraint operational_tasks_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id)
);

create table public.tenant_document_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  participant_id uuid references public.participants (id) on delete set null,
  enrollment_id uuid references public.enrollments (id) on delete set null,
  certificate_id uuid references public.certificates (id) on delete set null,
  title text not null,
  document_type text not null default 'document',
  visibility text not null default 'staff',
  status text not null default 'draft',
  storage_bucket text not null default 'tenant-documents',
  file_path text,
  available_on date,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_document_records_type_check check (document_type in ('document', 'policy', 'invoice_notice', 'certificate', 'diploma', 'internal_note')),
  constraint tenant_document_records_visibility_check check (visibility in ('staff', 'parent', 'instructor', 'all')),
  constraint tenant_document_records_status_check check (status in ('draft', 'available', 'archived')),
  constraint tenant_document_records_id_tenant_unique unique (id, tenant_id),
  constraint tenant_document_records_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id),
  constraint tenant_document_records_enrollment_tenant_fk foreign key (enrollment_id, tenant_id) references public.enrollments (id, tenant_id),
  constraint tenant_document_records_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id)
);

create table public.report_export_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  report_type text not null,
  export_format text not null default 'csv',
  status text not null default 'requested',
  filters jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  file_path text,
  requested_by_profile_id uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_export_requests_type_check check (report_type in ('occupancy', 'waitlist', 'progress', 'payments')),
  constraint report_export_requests_format_check check (export_format in ('csv', 'xlsx', 'pdf', 'json')),
  constraint report_export_requests_status_check check (status in ('requested', 'processing', 'ready', 'failed', 'cancelled')),
  constraint report_export_requests_id_tenant_unique unique (id, tenant_id)
);

create index communication_provider_configs_tenant_provider_idx on public.communication_provider_configs (tenant_id, provider, mode);
create index message_templates_tenant_status_idx on public.message_templates (tenant_id, status, audience);
create index message_outbox_tenant_status_idx on public.message_outbox (tenant_id, status, scheduled_at);
create index message_outbox_participant_id_idx on public.message_outbox (participant_id);
create index operational_tasks_tenant_status_idx on public.operational_tasks (tenant_id, status, priority, due_on);
create index operational_tasks_assignee_idx on public.operational_tasks (assigned_to_profile_id, status);
create index tenant_document_records_tenant_status_idx on public.tenant_document_records (tenant_id, status, visibility);
create index tenant_document_records_participant_id_idx on public.tenant_document_records (participant_id);
create index report_export_requests_tenant_status_idx on public.report_export_requests (tenant_id, status, report_type);

create trigger communication_provider_configs_set_updated_at
  before update on public.communication_provider_configs
  for each row execute function app_private.set_updated_at();

create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function app_private.set_updated_at();

create trigger message_outbox_set_updated_at
  before update on public.message_outbox
  for each row execute function app_private.set_updated_at();

create trigger operational_tasks_set_updated_at
  before update on public.operational_tasks
  for each row execute function app_private.set_updated_at();

create trigger tenant_document_records_set_updated_at
  before update on public.tenant_document_records
  for each row execute function app_private.set_updated_at();

create trigger report_export_requests_set_updated_at
  before update on public.report_export_requests
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.communication_provider_configs to authenticated;
grant select, insert, update on public.message_templates to authenticated;
grant select, insert, update on public.message_outbox to authenticated;
grant select, insert, update on public.operational_tasks to authenticated;
grant select, insert, update on public.tenant_document_records to authenticated;
grant select, insert, update on public.report_export_requests to authenticated;

grant all on public.communication_provider_configs to service_role;
grant all on public.message_templates to service_role;
grant all on public.message_outbox to service_role;
grant all on public.operational_tasks to service_role;
grant all on public.tenant_document_records to service_role;
grant all on public.report_export_requests to service_role;

alter table public.communication_provider_configs enable row level security;
alter table public.message_templates enable row level security;
alter table public.message_outbox enable row level security;
alter table public.operational_tasks enable row level security;
alter table public.tenant_document_records enable row level security;
alter table public.report_export_requests enable row level security;

create policy "Tenant staff can manage communication provider configs"
  on public.communication_provider_configs
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can manage message templates"
  on public.message_templates
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can manage message outbox"
  on public.message_outbox
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can manage operational tasks"
  on public.operational_tasks
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
  );

create policy "Tenant staff can manage document records"
  on public.tenant_document_records
  for all
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or (visibility in ('parent', 'all') and participant_id is not null and app_private.current_user_can_access_participant(tenant_id, participant_id))
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can manage report exports"
  on public.report_export_requests
  for all
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
  emma_id uuid;
  emma_enrollment_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  insert into public.communication_provider_configs (
    tenant_id,
    provider,
    mode,
    status,
    display_name,
    host,
    port,
    from_email,
    from_name,
    username_secret_reference,
    password_secret_reference,
    api_key_secret_reference,
    metadata
  )
  values
    (demo_tenant_id, 'smtp', 'test', 'configured', 'SMTP via SendGrid', 'smtp.sendgrid.net', 587, 'noreply@nxttrack.nl', 'NXTTRACK demo', 'SMTP_USER', 'SMTP_PASS', null, '{"phase":"smtp_first"}'::jsonb),
    (demo_tenant_id, 'sendgrid', 'test', 'disabled', 'SendGrid API voorbereiding', null, null, 'noreply@nxttrack.nl', 'NXTTRACK demo', null, null, 'SENDGRID_API_KEY', '{"adapter":"prepared_no_live_calls"}'::jsonb)
  on conflict (tenant_id, provider, mode) do update
    set status = excluded.status,
        display_name = excluded.display_name,
        host = excluded.host,
        port = excluded.port,
        from_email = excluded.from_email,
        from_name = excluded.from_name,
        username_secret_reference = excluded.username_secret_reference,
        password_secret_reference = excluded.password_secret_reference,
        api_key_secret_reference = excluded.api_key_secret_reference,
        metadata = excluded.metadata;

  insert into public.message_templates (
    tenant_id,
    code,
    name,
    channel,
    audience,
    subject_template,
    body_template,
    status,
    tags,
    sort_order,
    metadata
  )
  values
    (demo_tenant_id, 'slot-offer-reminder', 'Slot offer reminder', 'email', 'parent', 'Herinnering: plek voor {{participant_name}}', 'Beste {{parent_name}}, er staat nog een plek open voor {{participant_name}}. Bevestig de plek via de link in NXTTRACK.', 'active', array['placement', 'parent'], 10, '{"phase":"phase12"}'::jsonb),
    (demo_tenant_id, 'payment-follow-up', 'Betaling opvolgen', 'email', 'parent', 'Openstaande betaling {{invoice_number}}', 'Beste {{parent_name}}, er staat nog een betaling open. De zwemschool registreert betalingen handmatig in deze fase.', 'draft', array['payment', 'manual'], 20, '{"phase":"phase12"}'::jsonb),
    (demo_tenant_id, 'progress-update', 'Voortgang update', 'email', 'parent', 'Nieuwe voortgang voor {{participant_name}}', '{{participant_name}} heeft nieuwe voortgang in NXTTRACK. Bekijk het ouderportaal voor details.', 'active', array['progress', 'parent'], 30, '{"phase":"phase12"}'::jsonb)
  on conflict (tenant_id, code) do update
    set name = excluded.name,
        channel = excluded.channel,
        audience = excluded.audience,
        subject_template = excluded.subject_template,
        body_template = excluded.body_template,
        status = excluded.status,
        tags = excluded.tags,
        sort_order = excluded.sort_order,
        metadata = excluded.metadata;

  select id into emma_id
  from public.participants
  where tenant_id = demo_tenant_id
    and external_reference = 'child-emma-devries';

  select id into emma_enrollment_id
  from public.enrollments
  where tenant_id = demo_tenant_id
    and participant_id = emma_id
  limit 1;

  insert into public.operational_tasks (
    tenant_id,
    title,
    description,
    task_type,
    status,
    priority,
    participant_id,
    enrollment_id,
    due_on,
    metadata
  )
  values
    (demo_tenant_id, 'Controleer ouderkoppelingen', 'Controleer of alle actieve kinderen een ouder/guardian koppeling hebben.', 'follow_up', 'open', 'high', emma_id, emma_enrollment_id, '2026-06-30', '{"phase":"phase12"}'::jsonb),
    (demo_tenant_id, 'Plan document upload', 'Koppel zwemschool huisregels als document record voordat storage actief wordt.', 'document', 'in_progress', 'normal', null, null, '2026-07-05', '{"phase":"phase12"}'::jsonb);

  insert into public.tenant_document_records (
    tenant_id,
    participant_id,
    enrollment_id,
    title,
    document_type,
    visibility,
    status,
    file_path,
    available_on,
    metadata
  )
  values
    (demo_tenant_id, emma_id, emma_enrollment_id, 'Huisregels zwemles', 'policy', 'parent', 'available', 'demo/house-rules.pdf', '2026-06-24', '{"phase":"phase12","storage":"prepared"}'::jsonb),
    (demo_tenant_id, null, null, 'Intern protocol afzwemmen', 'internal_note', 'staff', 'draft', null, null, '{"phase":"phase12","storage":"prepared"}'::jsonb);

  insert into public.report_export_requests (
    tenant_id,
    report_type,
    export_format,
    status,
    filters,
    file_path,
    metadata
  )
  values
    (demo_tenant_id, 'occupancy', 'csv', 'ready', '{"scope":"all_groups"}'::jsonb, 'exports/demo/occupancy.csv', '{"phase":"phase12"}'::jsonb),
    (demo_tenant_id, 'payments', 'csv', 'requested', '{"status":"open"}'::jsonb, null, '{"phase":"phase12"}'::jsonb);
end $$;
