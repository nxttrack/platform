import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRuntimeSchemaCompatible } from "../../apps/web/lib/release/schema-compatibility";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260823000225_runtime_schema_compatibility_contract.sql");
const secureGrantMigration = read("supabase/migrations/20260823001941_secure_default_function_grants.sql");
const health = read("apps/web/app/api/health/route.ts");
const proxy = read("apps/web/proxy.ts");
const deploy = read(".github/workflows/deploy.yml");

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

test("health fails closed unless database and application contracts match", () => {
  assert.match(health, /runtime_schema_compatibility/);
  assert.match(health, /schemaCompatibility/);
  assert.match(health, /status: ok \? 200 : 503/);
});

test("the application validator rejects absent, old and tampered schema contracts", () => {
  const valid = {
    contract_version: 3,
    minimum_compatible_app_sha: "4e3784649767be4c197db624b33995b3d1502f65",
    minimum_schema_fingerprint: "761d27a977c53c6037c4408b2064557b80b1c301107195c9065f748ef730fff3",
    required_migration_version: "20260823002720"
  };
  assert.equal(isRuntimeSchemaCompatible([valid]), true);
  for (const value of [null, [], { ...valid, contract_version: 0 }, { ...valid, minimum_schema_fingerprint: "old" }]) {
    assert.equal(isRuntimeSchemaCompatible(value), false);
  }
});

test("maintenance mode blocks every unsafe HTTP method before session work", () => {
  assert.match(proxy, /MAINTENANCE_NO_WRITE/);
  assert.match(proxy, /\["GET", "HEAD", "OPTIONS"\]/);
  assert.match(proxy, /maintenance_no_write/);
  assert.ok(proxy.indexOf("MAINTENANCE_NO_WRITE") < proxy.indexOf("const supabase = createServerClient"));
});

test("certification deploys force all effect workers off and assert schema before activation", () => {
  for (const setting of [
    "MAINTENANCE_NO_WRITE",
    "EMAIL_SENDING_ENABLED",
    "NEWSLETTER_DELIVERY_ENABLED",
    "INTERNAL_JOBS_ENABLED"
  ]) assert.match(deploy, new RegExp(`${setting}:`));
  assert.match(deploy, /release:assert-schema-compatibility/);
  assert.match(deploy, /DB_MIGRATION_REPAIR_EXISTING_SCHEMA.*false/);
  assert.match(deploy, /RUN_DB_MIGRATIONS.*production-readiness-certification-sprint-2.*true/);
  assert.match(deploy, /Phase 16 operational flow validation[\s\S]*?if: github\.ref_name != 'codex\/production-readiness-certification-sprint-2'/);
  assert.ok(deploy.indexOf("release:assert-schema-compatibility") < deploy.indexOf("Activate release"));
});
