-- Offboarding must remain auditable after the tenant row is deleted and must
-- fail closed when export, object backup, provider cleanup, Auth cleanup or
-- backup-retention completion is not proven.

alter table public.tenant_offboarding_runs
  drop constraint if exists tenant_offboarding_runs_tenant_id_fkey,
  alter column tenant_id drop not null,
  add column if not exists tenant_slug_snapshot text,
  add column if not exists tenant_name_snapshot text,
  add column if not exists export_errors jsonb not null default '[]'::jsonb,
  add column if not exists storage_backup_reference text,
  add column if not exists storage_backup_checksum text,
  add column if not exists storage_backup_completed_at timestamptz,
  add column if not exists erasure_manifest jsonb not null default '{}'::jsonb,
  add column if not exists erasure_error text,
  add column if not exists erased_at timestamptz,
  add column if not exists backup_retention_days integer not null default 30,
  add column if not exists backup_erasure_due_at timestamptz,
  add column if not exists backup_erasure_status text not null default 'not_started',
  add column if not exists backup_erasure_completed_at timestamptz;

alter table public.tenant_offboarding_runs
  add constraint tenant_offboarding_runs_tenant_id_fkey
    foreign key (tenant_id) references public.tenants (id) on delete set null;

alter table public.tenant_offboarding_runs
  drop constraint if exists tenant_offboarding_runs_status_check;

alter table public.tenant_offboarding_runs
  add constraint tenant_offboarding_runs_status_check
    check (status in (
      'requested',
      'export_failed',
      'export_ready',
      'retention',
      'deletion_approved',
      'erasure_in_progress',
      'erasure_attention_required',
      'backup_retention',
      'completed',
      'cancelled'
    )),
  add constraint tenant_offboarding_backup_checksum_check
    check (storage_backup_checksum is null or storage_backup_checksum ~ '^[a-f0-9]{64}$'),
  add constraint tenant_offboarding_backup_erasure_status_check
    check (backup_erasure_status in ('not_started', 'retained', 'expired_confirmed')),
  add constraint tenant_offboarding_backup_retention_days_check
    check (backup_retention_days between 7 and 90);

drop index if exists public.tenant_offboarding_one_active_idx;
create unique index tenant_offboarding_one_active_idx
  on public.tenant_offboarding_runs (tenant_id)
  where tenant_id is not null
    and status not in ('cancelled', 'completed');

alter table public.tenant_deletion_tombstones
  add column if not exists erasure_manifest jsonb not null default '{}'::jsonb,
  add column if not exists backup_erasure_due_at timestamptz,
  add column if not exists backup_erasure_completed_at timestamptz;

create or replace function app_private.export_tenant_dataset(target_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dataset jsonb := '{}'::jsonb;
  table_record record;
  table_rows jsonb;
begin
  if target_tenant_id is null then
    raise exception 'target tenant id is required';
  end if;

  for table_record in
    select distinct table_info.relname as table_name
    from pg_catalog.pg_class table_info
    join pg_catalog.pg_namespace namespace_info
      on namespace_info.oid = table_info.relnamespace
    join pg_catalog.pg_attribute column_info
      on column_info.attrelid = table_info.oid
    where namespace_info.nspname = 'public'
      and table_info.relkind in ('r', 'p')
      and column_info.attname = 'tenant_id'
      and not column_info.attisdropped
    order by table_info.relname
  loop
    begin
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb) from public.%I row_data where tenant_id = $1',
        table_record.table_name
      )
      into table_rows
      using target_tenant_id;
    exception when others then
      raise exception 'tenant export failed for table %: %', table_record.table_name, sqlerrm;
    end;

    dataset := dataset || jsonb_build_object(table_record.table_name, table_rows);
  end loop;

  return dataset;
end;
$$;

revoke all on function app_private.export_tenant_dataset(uuid) from public, anon, authenticated;
grant execute on function app_private.export_tenant_dataset(uuid) to service_role;
