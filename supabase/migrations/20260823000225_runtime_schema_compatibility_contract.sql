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
    1,
    '4e3784649767be4c197db624b33995b3d1502f65'::text,
    'c21d353eed62463814087c3edc7bdf63a11522141131052641b8d9972ef02ab7'::text,
    '20260823000225'::text;
$$;

revoke all on function public.runtime_schema_compatibility() from public, anon, authenticated;
grant execute on function public.runtime_schema_compatibility() to service_role;

comment on function public.runtime_schema_compatibility() is
  'Stable service-only application/schema compatibility handshake. The fingerprint is SHA-256 over the ordered 143-migration minimum schema lineage.';
