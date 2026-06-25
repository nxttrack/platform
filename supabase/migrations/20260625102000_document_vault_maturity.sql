alter table public.parent_documents
  add column if not exists share_enabled boolean not null default false,
  add column if not exists share_token text,
  add column if not exists share_created_at timestamptz,
  add column if not exists share_expires_at timestamptz,
  add column if not exists share_revoked_at timestamptz,
  add column if not exists download_count integer not null default 0,
  add column if not exists last_downloaded_at timestamptz;

alter table public.parent_documents
  drop constraint if exists parent_documents_download_count_check;

alter table public.parent_documents
  add constraint parent_documents_download_count_check
  check (download_count >= 0);

create unique index if not exists parent_documents_share_token_idx
  on public.parent_documents (share_token)
  where share_token is not null;

create index if not exists parent_documents_share_status_idx
  on public.parent_documents (tenant_id, share_enabled, share_expires_at)
  where share_token is not null;

create table if not exists public.document_access_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  tenant_document_id uuid references public.tenant_document_records (id) on delete set null,
  parent_document_id uuid references public.parent_documents (id) on delete set null,
  participant_id uuid references public.participants (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  access_channel text not null default 'web',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_access_events_event_type_check check (event_type in ('upload', 'download', 'share_link_created', 'share_link_revoked', 'visibility_synced')),
  constraint document_access_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists document_access_events_tenant_created_idx
  on public.document_access_events (tenant_id, created_at desc);

create index if not exists document_access_events_parent_document_idx
  on public.document_access_events (parent_document_id, created_at desc);

create index if not exists document_access_events_tenant_document_idx
  on public.document_access_events (tenant_document_id, created_at desc);

grant select on public.document_access_events to authenticated;
grant all on public.document_access_events to service_role;

alter table public.document_access_events enable row level security;

create policy "Tenant staff and guardians can view document access events"
  on public.document_access_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
    or (
      participant_id is not null
      and app_private.current_user_can_access_participant(tenant_id, participant_id)
    )
  );

drop trigger if exists parent_documents_audit_events on public.parent_documents;

create trigger parent_documents_audit_events
  after insert or update or delete on public.parent_documents
  for each row execute function app_private.record_audit_event();
