-- Legacy Supabase projects may auto-grant new public tables. These ledgers are
-- mutated exclusively inside service-only RPCs; RLS is not a substitute for
-- removing direct client privileges.
revoke all privileges on table public.core_write_operations
  from public, anon, authenticated;
revoke all privileges on table public.import_manifest_entries
  from public, anon, authenticated;

grant select on table public.core_write_operations to authenticated;
grant select on table public.import_manifest_entries to authenticated;
grant all privileges on table public.core_write_operations to service_role;
grant all privileges on table public.import_manifest_entries to service_role;

create or replace function public.runtime_schema_compatibility()
returns table (
  contract_version integer,
  minimum_compatible_app_sha text,
  minimum_schema_fingerprint text,
  required_migration_version text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    4,
    '4e3784649767be4c197db624b33995b3d1502f65'::text,
    '185101b4bfc6c68a98557ae7238c6f3164c139ce910f8a6e7af3bf81b20d70ad'::text,
    '20260823005756'::text;
$$;

revoke all on function public.runtime_schema_compatibility() from public, anon, authenticated;
grant execute on function public.runtime_schema_compatibility() to service_role;

comment on function public.runtime_schema_compatibility() is
  'Stable service-only application/schema compatibility handshake. The fingerprint is SHA-256 over the ordered 146-migration minimum schema lineage.';
