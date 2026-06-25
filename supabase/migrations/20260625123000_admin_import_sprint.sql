create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  import_type text not null,
  source_name text,
  status text not null default 'draft',
  mapping jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_batches_type_check check (import_type in ('participants', 'guardians', 'groups', 'payments')),
  constraint import_batches_status_check check (status in ('draft', 'previewed', 'applying', 'applied', 'failed', 'rolled_back')),
  constraint import_batches_mapping_check check (jsonb_typeof(mapping) = 'object'),
  constraint import_batches_summary_check check (jsonb_typeof(summary) = 'object')
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  mapped_data jsonb not null default '{}'::jsonb,
  validation_errors text[] not null default '{}'::text[],
  duplicate_warnings text[] not null default '{}'::text[],
  status text not null default 'preview',
  created_table text,
  created_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_rows_number_check check (row_number > 0),
  constraint import_rows_status_check check (status in ('preview', 'invalid', 'duplicate', 'ready', 'applied', 'skipped', 'rolled_back', 'failed')),
  constraint import_rows_raw_data_check check (jsonb_typeof(raw_data) = 'object'),
  constraint import_rows_mapped_data_check check (jsonb_typeof(mapped_data) = 'object'),
  constraint import_rows_unique_number unique (batch_id, row_number)
);

create table public.import_audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_id uuid references public.import_rows (id) on delete set null,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_audit_events_type_check check (
    event_type in (
      'preview_created',
      'row_applied',
      'row_failed',
      'batch_applied',
      'rollback_started',
      'row_rolled_back',
      'rollback_failed',
      'batch_rolled_back'
    )
  ),
  constraint import_audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index import_batches_tenant_created_idx
  on public.import_batches (tenant_id, created_at desc);

create index import_rows_batch_status_idx
  on public.import_rows (batch_id, status, row_number);

create index import_audit_events_batch_created_idx
  on public.import_audit_events (batch_id, created_at desc);

create trigger import_batches_set_updated_at
  before update on public.import_batches
  for each row execute function app_private.set_updated_at();

create trigger import_rows_set_updated_at
  before update on public.import_rows
  for each row execute function app_private.set_updated_at();

grant select, insert, update on public.import_batches to authenticated;
grant select, insert, update on public.import_rows to authenticated;
grant select, insert on public.import_audit_events to authenticated;

grant all on public.import_batches to service_role;
grant all on public.import_rows to service_role;
grant all on public.import_audit_events to service_role;

alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_audit_events enable row level security;

create policy "Tenant staff can view import batches"
  on public.import_batches
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can create import batches"
  on public.import_batches
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update import batches"
  on public.import_batches
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

create policy "Tenant staff can view import rows"
  on public.import_rows
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can create import rows"
  on public.import_rows
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can update import rows"
  on public.import_rows
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

create policy "Tenant staff can view import audit events"
  on public.import_audit_events
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create policy "Tenant staff can create import audit events"
  on public.import_audit_events
  for insert
  to authenticated
  with check (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

create trigger import_batches_audit_events
  after insert or update or delete on public.import_batches
  for each row execute function app_private.record_audit_event();

create trigger import_rows_audit_events
  after insert or update or delete on public.import_rows
  for each row execute function app_private.record_audit_event();
