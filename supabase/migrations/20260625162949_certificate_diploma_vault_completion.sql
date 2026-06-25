alter table public.certificates
  add column if not exists storage_bucket text not null default 'tenant-documents',
  add column if not exists file_source text not null default 'generated_placeholder',
  add column if not exists current_version_id uuid,
  add column if not exists version_number integer not null default 1,
  add column if not exists retention_until date,
  add column if not exists signed_download_expires_at timestamptz,
  add column if not exists last_downloaded_at timestamptz,
  add column if not exists share_created_at timestamptz,
  add column if not exists share_revoked_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

alter table public.certificates
  drop constraint if exists certificates_file_source_check,
  add constraint certificates_file_source_check check (file_source in ('generated_placeholder', 'admin_upload', 'external_import', 'manual_path')),
  drop constraint if exists certificates_version_number_check,
  add constraint certificates_version_number_check check (version_number >= 1);

create table if not exists public.certificate_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  version_number integer not null,
  storage_bucket text not null default 'tenant-documents',
  file_path text not null,
  file_source text not null default 'admin_upload',
  mime_type text,
  file_size_bytes bigint,
  original_filename text,
  checksum_sha256 text,
  status text not null default 'current',
  retention_until date,
  notes text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint certificate_versions_version_check check (version_number >= 1),
  constraint certificate_versions_file_source_check check (file_source in ('generated_placeholder', 'admin_upload', 'external_import', 'manual_path')),
  constraint certificate_versions_status_check check (status in ('draft', 'current', 'superseded', 'revoked', 'deleted')),
  constraint certificate_versions_size_check check (file_size_bytes is null or file_size_bytes >= 0),
  constraint certificate_versions_id_tenant_unique unique (id, tenant_id),
  constraint certificate_versions_unique_version unique (tenant_id, certificate_id, version_number),
  constraint certificate_versions_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id) on delete cascade
);

alter table public.certificates
  drop constraint if exists certificates_current_version_tenant_fk,
  add constraint certificates_current_version_tenant_fk foreign key (current_version_id, tenant_id) references public.certificate_versions (id, tenant_id);

create table if not exists public.certificate_access_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  certificate_version_id uuid references public.certificate_versions (id) on delete set null,
  participant_id uuid references public.participants (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  access_channel text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint certificate_access_events_type_check check (event_type in (
    'download',
    'share_link_created',
    'share_link_revoked',
    'share_link_used',
    'version_created',
    'revoked',
    'blocked',
    'retention_expired'
  )),
  constraint certificate_access_events_channel_check check (access_channel in ('web', 'share_link', 'admin', 'system')),
  constraint certificate_access_events_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint certificate_access_events_certificate_tenant_fk foreign key (certificate_id, tenant_id) references public.certificates (id, tenant_id) on delete cascade,
  constraint certificate_access_events_version_tenant_fk foreign key (certificate_version_id, tenant_id) references public.certificate_versions (id, tenant_id),
  constraint certificate_access_events_participant_tenant_fk foreign key (participant_id, tenant_id) references public.participants (id, tenant_id)
);

create index if not exists certificate_versions_certificate_idx
  on public.certificate_versions (tenant_id, certificate_id, version_number desc);

create index if not exists certificate_versions_status_idx
  on public.certificate_versions (tenant_id, status, created_at desc);

create index if not exists certificates_vault_completion_idx
  on public.certificates (tenant_id, status, vault_status, download_status, issued_on desc);

create index if not exists certificates_share_token_idx
  on public.certificates (share_token)
  where share_token is not null;

create index if not exists certificate_access_events_certificate_idx
  on public.certificate_access_events (tenant_id, certificate_id, created_at desc);

grant select, insert, update on public.certificate_versions to authenticated;
grant select, insert on public.certificate_access_events to authenticated;
grant update (
  storage_bucket,
  file_source,
  current_version_id,
  version_number,
  retention_until,
  signed_download_expires_at,
  last_downloaded_at,
  share_created_at,
  share_revoked_at,
  revoked_at,
  revoked_reason
) on public.certificates to authenticated;

grant all on public.certificate_versions to service_role;
grant all on public.certificate_access_events to service_role;

alter table public.certificate_versions enable row level security;
alter table public.certificate_access_events enable row level security;

drop policy if exists "Tenant members can view certificate versions" on public.certificate_versions;
create policy "Tenant members can view certificate versions"
  on public.certificate_versions
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff', 'instructor'])
    or exists (
      select 1
      from public.certificates certificate
      where certificate.id = certificate_versions.certificate_id
        and certificate.tenant_id = certificate_versions.tenant_id
        and certificate.enrollment_id is not null
        and app_private.current_user_can_access_enrollment(certificate.tenant_id, certificate.enrollment_id)
    )
  );

drop policy if exists "Tenant staff can insert certificate versions" on public.certificate_versions;
create policy "Tenant staff can insert certificate versions"
  on public.certificate_versions
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can update certificate versions" on public.certificate_versions;
create policy "Tenant staff can update certificate versions"
  on public.certificate_versions
  for update
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  )
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant members can view certificate access events" on public.certificate_access_events;
create policy "Tenant members can view certificate access events"
  on public.certificate_access_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    or exists (
      select 1
      from public.certificates certificate
      where certificate.id = certificate_access_events.certificate_id
        and certificate.tenant_id = certificate_access_events.tenant_id
        and certificate.enrollment_id is not null
        and app_private.current_user_can_access_enrollment(certificate.tenant_id, certificate.enrollment_id)
    )
  );

drop policy if exists "Tenant staff can insert certificate access events" on public.certificate_access_events;
create policy "Tenant staff can insert certificate access events"
  on public.certificate_access_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    or exists (
      select 1
      from public.certificates certificate
      where certificate.id = certificate_access_events.certificate_id
        and certificate.tenant_id = certificate_access_events.tenant_id
        and certificate.enrollment_id is not null
        and app_private.current_user_can_access_enrollment(certificate.tenant_id, certificate.enrollment_id)
    )
  );

drop trigger if exists certificate_versions_audit_events on public.certificate_versions;
create trigger certificate_versions_audit_events
  after insert or update or delete on public.certificate_versions
  for each row execute function app_private.record_audit_event();

drop trigger if exists certificate_access_events_audit_events on public.certificate_access_events;
create trigger certificate_access_events_audit_events
  after insert or update or delete on public.certificate_access_events
  for each row execute function app_private.record_audit_event();

with current_certificates as (
  select
    certificates.id,
    certificates.tenant_id,
    certificates.file_path,
    certificates.storage_bucket,
    certificates.file_source,
    certificates.version_number,
    certificates.retention_until
  from public.certificates certificates
  where certificates.file_path is not null
)
insert into public.certificate_versions (
  tenant_id,
  certificate_id,
  version_number,
  storage_bucket,
  file_path,
  file_source,
  status,
  retention_until,
  notes
)
select
  current_certificates.tenant_id,
  current_certificates.id,
  current_certificates.version_number,
  current_certificates.storage_bucket,
  current_certificates.file_path,
  current_certificates.file_source,
  'current',
  current_certificates.retention_until,
  'Initial S10 certificate version backfill.'
from current_certificates
on conflict (tenant_id, certificate_id, version_number) do update
  set storage_bucket = excluded.storage_bucket,
      file_path = excluded.file_path,
      file_source = excluded.file_source,
      status = excluded.status,
      retention_until = excluded.retention_until;

update public.certificates certificates
set current_version_id = versions.id
from public.certificate_versions versions
where versions.tenant_id = certificates.tenant_id
  and versions.certificate_id = certificates.id
  and versions.version_number = certificates.version_number
  and certificates.current_version_id is null;
