import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRuntimeSchemaCompatible } from "../../apps/web/lib/release/schema-compatibility";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260823000225_runtime_schema_compatibility_contract.sql");
const secureGrantMigration = read("supabase/migrations/20260823001941_secure_default_function_grants.sql");
const ledgerGrantMigration = read("supabase/migrations/20260823005756_close_service_ledger_default_grants.sql");
const recertificationMigration = read("supabase/migrations/20260908111450_production_readiness_recertification.sql");
const health = read("apps/web/app/api/health/route.ts");
const proxy = read("apps/web/proxy.ts");
const deploy = read(".github/workflows/deploy.yml");
const releaseAssertion = read("scripts/release/assert-runtime-schema-compatibility.mjs");

test("the schema exposes one service-only immutable compatibility contract", () => {
  assert.match(migration, /public\.runtime_schema_compatibility/);
  assert.match(migration, /4e3784649767be4c197db624b33995b3d1502f65/);
  assert.match(migration, /c21d353eed62463814087c3edc7bdf63a11522141131052641b8d9972ef02ab7/);
  assert.match(migration, /revoke all on function public\.runtime_schema_compatibility\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.runtime_schema_compatibility\(\) to service_role/);
});

test("the final secure-default correction revokes recreated trigger functions and rolls the handshake forward", () => {
  for (const name of ["prevent_lead_source_update", "capture_crm_stage_change", "protect_final_billing_invoice", "protect_final_billing_invoice_line"]) {
    assert.match(secureGrantMigration, new RegExp(`revoke all on function app_private\\.${name}\\(\\)`));
  }
  assert.match(secureGrantMigration, /acdf41173cb5e30c6c56fa6c2365ce45d33de624c7b40d90098d54fce32abe26/);
  assert.match(secureGrantMigration, /'20260823001941'/);
});

test("legacy auto-grants are removed from service-owned ledgers", () => {
  for (const table of ["core_write_operations", "import_manifest_entries"]) {
    assert.match(ledgerGrantMigration, new RegExp(`revoke all privileges on table public\\.${table}`));
    assert.match(ledgerGrantMigration, new RegExp(`grant select on table public\\.${table} to authenticated`));
  }
  assert.match(ledgerGrantMigration, /185101b4bfc6c68a98557ae7238c6f3164c139ce910f8a6e7af3bf81b20d70ad/);
  assert.match(ledgerGrantMigration, /'20260823005756'/);
});

test("re-certification rolls the compatibility contract to its compatible application anchor", () => {
  assert.match(recertificationMigration, /352b38cd69958a3d59d31b39aaa798e6de70a77f/);
  assert.match(recertificationMigration, /686f431e1b015f6f4f597137689f4b2dcb9b0c70a070666b26428bdaaebc293e/);
  assert.match(recertificationMigration, /'20260908111450'/);
});

test("health fails closed unless database and application contracts match", () => {
  assert.match(health, /runtime_schema_compatibility/);
  assert.match(health, /schemaCompatibility/);
  assert.match(health, /status: ok \? 200 : 503/);
});

test("the compatibility bridge accepts the immediately previous schema and rejects tampering", () => {
  const valid = {
    contract_version: 5,
    minimum_compatible_app_sha: "352b38cd69958a3d59d31b39aaa798e6de70a77f",
    minimum_schema_fingerprint: "686f431e1b015f6f4f597137689f4b2dcb9b0c70a070666b26428bdaaebc293e",
    required_migration_version: "20260908111450"
  };
  assert.equal(isRuntimeSchemaCompatible([valid]), true);
  assert.equal(isRuntimeSchemaCompatible([{
    contract_version: 4,
    minimum_compatible_app_sha: "4e3784649767be4c197db624b33995b3d1502f65",
    minimum_schema_fingerprint: "185101b4bfc6c68a98557ae7238c6f3164c139ce910f8a6e7af3bf81b20d70ad",
    required_migration_version: "20260823005756"
  }]), true);
  assert.equal(isRuntimeSchemaCompatible([{ ...valid, minimum_compatible_app_sha: "f".repeat(40) }]), true);
  for (const value of [
    null,
    [],
    { ...valid, contract_version: 0 },
    { ...valid, minimum_schema_fingerprint: "old" },
    { ...valid, minimum_compatible_app_sha: "not-a-sha" }
  ]) {
    assert.equal(isRuntimeSchemaCompatible(value), false);
  }
});

test("the release assertion verifies the deployed SHA from the retained checkout", () => {
  assert.match(releaseAssertion, /GITHUB_WORKSPACE/);
  assert.match(releaseAssertion, /DEPLOYED_SOURCE_SHA/);
  assert.match(releaseAssertion, /merge-base.*--is-ancestor.*minimumAppSha.*deployedSourceSha/);
});

test("maintenance mode blocks every unsafe HTTP method before session work", () => {
  assert.match(proxy, /MAINTENANCE_NO_WRITE/);
  assert.match(proxy, /\["GET", "HEAD", "OPTIONS"\]/);
  assert.match(proxy, /maintenance_no_write/);
  assert.ok(proxy.indexOf("MAINTENANCE_NO_WRITE") < proxy.indexOf("const supabase = createServerClient"));
});

test("certification deploys force all effect workers off and assert schema before activation", () => {
  assert.match(deploy, /Checkout[\s\S]*?fetch-depth: 0[\s\S]*?Setup certified Node/);
  assert.match(deploy, /Setup certified Node[\s\S]*?node-version: "24\.18\.0"/);
  assert.match(deploy, /corepack prepare pnpm@10\.24\.0 --activate/);
  for (const setting of [
    "MAINTENANCE_NO_WRITE",
    "EMAIL_SENDING_ENABLED",
    "NEWSLETTER_DELIVERY_ENABLED",
    "INTERNAL_JOBS_ENABLED"
  ]) assert.match(deploy, new RegExp(`${setting}:`));
  assert.match(deploy, /release:assert-schema-compatibility/);
  assert.match(deploy, /Run certification post-migration read-only verification/);
  assert.match(deploy, /DB_MIGRATION_REPAIR_EXISTING_SCHEMA.*false/);
  assert.match(deploy, /RUN_DB_MIGRATIONS.*production-readiness-certification-sprint-2.*true/);
  assert.match(deploy, /Phase 16 operational flow validation[\s\S]*?if: github\.ref_name != 'codex\/production-readiness-certification-sprint-2'/);
  assert.ok(deploy.indexOf("release:assert-schema-compatibility") < deploy.indexOf("Activate release"));
  assert.ok(deploy.indexOf("Run database migrations") < deploy.indexOf("Run certification post-migration read-only verification"));
  assert.ok(deploy.indexOf("Run certification post-migration read-only verification") < deploy.indexOf("Activate release"));
});
