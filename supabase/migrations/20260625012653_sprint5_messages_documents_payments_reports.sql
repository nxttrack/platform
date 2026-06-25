alter table public.message_templates
  add column if not exists required_variables text[] not null default array[]::text[],
  add column if not exists last_preview_context jsonb not null default '{}'::jsonb,
  add column if not exists last_preview_subject text,
  add column if not exists last_preview_body text,
  add column if not exists last_previewed_at timestamptz;

alter table public.message_outbox
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists provider_message_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists render_context jsonb not null default '{}'::jsonb,
  add column if not exists template_variables text[] not null default array[]::text[],
  add column if not exists validation_errors text[] not null default array[]::text[];

alter table public.message_outbox
  drop constraint if exists message_outbox_status_check;

alter table public.message_outbox
  add constraint message_outbox_status_check
  check (status in ('draft', 'queued', 'sending', 'retrying', 'sent', 'failed', 'cancelled'));

alter table public.message_outbox
  drop constraint if exists message_outbox_delivery_status_check;

alter table public.message_outbox
  add constraint message_outbox_delivery_status_check
  check (delivery_status in ('pending', 'prepared', 'sending', 'sent', 'failed', 'cancelled', 'skipped'));

alter table public.message_outbox
  drop constraint if exists message_outbox_retry_count_check;

alter table public.message_outbox
  add constraint message_outbox_retry_count_check
  check (retry_count >= 0 and max_attempts between 1 and 10);

create index if not exists message_outbox_due_dispatch_idx
  on public.message_outbox (tenant_id, status, next_retry_at, scheduled_at);

alter table public.tenant_document_records
  add column if not exists parent_document_id uuid references public.parent_documents (id) on delete set null,
  add column if not exists version_number integer not null default 1,
  add column if not exists upload_status text not null default 'pending',
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists original_filename text,
  add column if not exists retention_until date,
  add column if not exists signed_download_expires_at timestamptz,
  add column if not exists last_downloaded_at timestamptz;

alter table public.tenant_document_records
  drop constraint if exists tenant_document_records_upload_status_check;

alter table public.tenant_document_records
  add constraint tenant_document_records_upload_status_check
  check (upload_status in ('pending', 'uploaded', 'failed', 'external'));

alter table public.tenant_document_records
  drop constraint if exists tenant_document_records_version_number_check;

alter table public.tenant_document_records
  add constraint tenant_document_records_version_number_check
  check (version_number >= 1);

create index if not exists tenant_document_records_parent_document_id_idx
  on public.tenant_document_records (parent_document_id);

create index if not exists tenant_document_records_upload_status_idx
  on public.tenant_document_records (tenant_id, upload_status, visibility);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-documents',
  'tenant-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/csv',
    'application/json',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Tenant staff can read tenant document objects"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

create policy "Tenant staff can insert tenant document objects"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tenant-documents'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );

create policy "Tenant staff can update tenant document objects"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tenant-documents'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  )
  with check (
    bucket_id = 'tenant-documents'
    and name ~ '^[0-9a-fA-F-]{36}/'
    and (
      app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
      or app_private.current_user_has_tenant_role(((storage.foldername(name))[1])::uuid, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    )
  );
