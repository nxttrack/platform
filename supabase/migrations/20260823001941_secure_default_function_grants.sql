-- These four historical CREATE OR REPLACE statements recreated invoker trigger
-- functions after their earlier privilege hardening and therefore restored the
-- PostgreSQL default PUBLIC EXECUTE grant. Trigger execution does not require a
-- caller EXECUTE grant, so every direct grant is removed.
revoke all on function app_private.prevent_lead_source_update() from public, anon, authenticated, service_role;
revoke all on function app_private.capture_crm_stage_change() from public, anon, authenticated, service_role;
revoke all on function app_private.protect_final_billing_invoice() from public, anon, authenticated, service_role;
revoke all on function app_private.protect_final_billing_invoice_line() from public, anon, authenticated, service_role;

-- Roll the minimum-schema handshake forward to include this corrective
-- migration. The prior version remains useful only during the transaction that
-- applies this migration and is never accepted by the matching application.
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
    2,
    '4e3784649767be4c197db624b33995b3d1502f65'::text,
    'acdf41173cb5e30c6c56fa6c2365ce45d33de624c7b40d90098d54fce32abe26'::text,
    '20260823001941'::text;
$$;

revoke all on function public.runtime_schema_compatibility() from public, anon, authenticated;
grant execute on function public.runtime_schema_compatibility() to service_role;

comment on function public.runtime_schema_compatibility() is
  'Stable service-only application/schema compatibility handshake. The fingerprint is SHA-256 over the ordered 144-migration minimum schema lineage.';
