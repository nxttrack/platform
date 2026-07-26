create table public.email_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  recipient_user_id uuid references auth.users (id) on delete set null,
  recipient_email text not null,
  provider text not null default 'not_configured',
  provider_source text,
  template_key text not null default 'custom',
  subject text not null,
  status text not null default 'pending',
  error_message text,
  related_type text,
  related_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_delivery_attempts_provider_check check (provider in ('not_configured', 'sendgrid_api', 'smtp')),
  constraint email_delivery_attempts_provider_source_check check (provider_source is null or provider_source in ('env', 'platform_settings')),
  constraint email_delivery_attempts_status_check check (status in ('pending', 'sent', 'failed', 'skipped')),
  constraint email_delivery_attempts_email_check check (recipient_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index email_delivery_attempts_tenant_idx on public.email_delivery_attempts (tenant_id, created_at desc);
create index email_delivery_attempts_status_idx on public.email_delivery_attempts (tenant_id, status, created_at desc);
create index email_delivery_attempts_related_idx on public.email_delivery_attempts (related_type, related_id);
create index email_delivery_attempts_recipient_idx on public.email_delivery_attempts (recipient_user_id, created_at desc);

create trigger email_delivery_attempts_set_updated_at
  before update on public.email_delivery_attempts
  for each row execute function app_private.set_updated_at();

alter table public.tenant_notifications
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivery_error text,
  add column if not exists delivered_at timestamptz,
  add column if not exists email_delivery_attempt_id uuid references public.email_delivery_attempts (id) on delete set null;

alter table public.tenant_notifications
  drop constraint if exists tenant_notifications_delivery_status_check,
  add constraint tenant_notifications_delivery_status_check check (delivery_status in ('pending', 'sent', 'failed', 'skipped'));

create index if not exists tenant_notifications_delivery_idx on public.tenant_notifications (tenant_id, delivery_status, created_at desc);

alter table public.tenant_documents
  add column if not exists storage_bucket text not null default 'tenant-documents',
  add column if not exists storage_status text not null default 'metadata',
  add column if not exists uploaded_at timestamptz;

alter table public.tenant_documents
  drop constraint if exists tenant_documents_storage_bucket_check,
  add constraint tenant_documents_storage_bucket_check check (storage_bucket in ('tenant-documents')),
  drop constraint if exists tenant_documents_storage_status_check,
  add constraint tenant_documents_storage_status_check check (storage_status in ('metadata', 'stored', 'missing', 'archived'));

create index if not exists tenant_documents_storage_idx on public.tenant_documents (tenant_id, storage_status, created_at desc);

alter table public.certificate_records
  add column if not exists storage_bucket text not null default 'diploma-vault',
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes integer,
  add column if not exists storage_status text not null default 'metadata',
  add column if not exists uploaded_at timestamptz;

alter table public.certificate_records
  drop constraint if exists certificate_records_storage_bucket_check,
  add constraint certificate_records_storage_bucket_check check (storage_bucket in ('diploma-vault')),
  drop constraint if exists certificate_records_storage_status_check,
  add constraint certificate_records_storage_status_check check (storage_status in ('metadata', 'stored', 'missing', 'archived')),
  drop constraint if exists certificate_records_size_check,
  add constraint certificate_records_size_check check (size_bytes is null or size_bytes >= 0);

create index if not exists certificate_records_storage_idx on public.certificate_records (tenant_id, storage_status, issued_on desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'tenant-documents',
    'tenant-documents',
    false,
    20971520,
    array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/svg+xml',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]::text[]
  ),
  (
    'diploma-vault',
    'diploma-vault',
    false,
    20971520,
    array[
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/svg+xml'
    ]::text[]
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

create function app_private.uuid_path_segment(object_name text, segment_index integer)
returns uuid
language sql
stable
as $$
  select case
    when split_part(object_name, '/', segment_index) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(object_name, '/', segment_index)::uuid
    else null
  end;
$$;

revoke all on function app_private.uuid_path_segment(text, integer) from public;
grant execute on function app_private.uuid_path_segment(text, integer) to authenticated;
grant execute on function app_private.uuid_path_segment(text, integer) to service_role;

grant select, insert, update on public.email_delivery_attempts to authenticated;
grant all on public.email_delivery_attempts to service_role;

alter table public.email_delivery_attempts enable row level security;

create policy "Scoped users can view email delivery attempts"
  on public.email_delivery_attempts
  for select
  to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (
      tenant_id is not null
      and app_private.current_user_can_manage_tenant_domain(tenant_id)
    )
    or (
      tenant_id is null
      and app_private.current_user_has_platform_role(array['platform_owner'])
    )
  );

create policy "Tenant staff and platform owners can create email delivery attempts"
  on public.email_delivery_attempts
  for insert
  to authenticated
  with check (
    (
      tenant_id is not null
      and app_private.current_user_can_manage_tenant_domain(tenant_id)
    )
    or (
      tenant_id is null
      and app_private.current_user_has_platform_role(array['platform_owner'])
    )
  );

create policy "Tenant staff and platform owners can update email delivery attempts"
  on public.email_delivery_attempts
  for update
  to authenticated
  using (
    (
      tenant_id is not null
      and app_private.current_user_can_manage_tenant_domain(tenant_id)
    )
    or (
      tenant_id is null
      and app_private.current_user_has_platform_role(array['platform_owner'])
    )
  )
  with check (
    (
      tenant_id is not null
      and app_private.current_user_can_manage_tenant_domain(tenant_id)
    )
    or (
      tenant_id is null
      and app_private.current_user_has_platform_role(array['platform_owner'])
    )
  );

create policy "Tenant document files are scoped to organization roles"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and exists (
      select 1
      from public.tenant_documents document
      where document.tenant_id = app_private.uuid_path_segment(storage.objects.name, 1)
        and document.id = app_private.uuid_path_segment(storage.objects.name, 3)
        and document.file_path = storage.objects.name
        and (
          app_private.current_user_can_manage_tenant_domain(document.tenant_id)
          or (
            document.status = 'active'
            and document.audience in ('instructors', 'all_tenant')
            and app_private.current_user_has_tenant_role(document.tenant_id, array['instructor'])
          )
          or (
            document.status = 'active'
            and document.visibility = 'portal'
            and document.audience in ('parents', 'all_tenant')
            and app_private.current_user_has_tenant_role(document.tenant_id, array['parent'])
          )
        )
    )
  );

create policy "Tenant staff can upload tenant document files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tenant-documents'
    and split_part(name, '/', 2) = 'documents'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );

create policy "Tenant staff can update tenant document files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  )
  with check (
    bucket_id = 'tenant-documents'
    and split_part(name, '/', 2) = 'documents'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );

create policy "Tenant staff can delete tenant document files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );

create policy "Diploma vault files are scoped to certificate access"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'diploma-vault'
    and exists (
      select 1
      from public.certificate_records certificate
      where certificate.tenant_id = app_private.uuid_path_segment(storage.objects.name, 1)
        and certificate.id = app_private.uuid_path_segment(storage.objects.name, 3)
        and certificate.file_path = storage.objects.name
        and (
          app_private.current_user_can_manage_tenant_domain(certificate.tenant_id)
          or app_private.current_user_can_instruct_participant(certificate.participant_id)
          or (
            certificate.status = 'issued'
            and app_private.current_user_can_view_participant(certificate.participant_id)
          )
        )
    )
  );

create policy "Tenant staff can upload diploma vault files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'diploma-vault'
    and split_part(name, '/', 2) = 'certificates'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );

create policy "Tenant staff can update diploma vault files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'diploma-vault'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  )
  with check (
    bucket_id = 'diploma-vault'
    and split_part(name, '/', 2) = 'certificates'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );

create policy "Tenant staff can delete diploma vault files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'diploma-vault'
    and app_private.current_user_can_manage_tenant_domain(app_private.uuid_path_segment(name, 1))
  );
