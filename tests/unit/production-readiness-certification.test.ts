import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260822225251_production_readiness_certification.sql", import.meta.url),
  "utf8"
);
const outboxWorker = readFileSync(new URL("../../apps/web/lib/email/outbox.ts", import.meta.url), "utf8");
const upgradePreflight = readFileSync(
  new URL("../../scripts/db/preflight-production-readiness-upgrade.mjs", import.meta.url),
  "utf8"
);
const upgradeFixture = readFileSync(
  new URL("../../scripts/db/seed-production-readiness-upgrade-fixture.mjs", import.meta.url),
  "utf8"
);
const platformTenantBoundaryMigration = readFileSync(
  new URL("../../supabase/migrations/20260822233930_restrict_platform_only_tenant_mutations.sql", import.meta.url),
  "utf8"
);
const preboundImportIdentityMigration = readFileSync(
  new URL("../../supabase/migrations/20260823002720_close_prebound_import_identity_gap.sql", import.meta.url),
  "utf8"
);

function functionSource(name: string, source = migration) {
  const replaceStart = source.indexOf(`create or replace function ${name}`);
  const start = replaceStart === -1 ? source.indexOf(`create function ${name}`) : replaceStart;
  assert.notEqual(start, -1, `${name} must be replaced additively`);
  const end = source.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return source.slice(start, end + 4);
}

test("authenticated clients cannot mutate service-owned import state or durable rows", () => {
  assert.match(migration, /revoke insert, update, delete on public\.import_jobs from authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.import_rows from authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.import_job_events from authenticated/);
});

test("provider acceptance evidence is immutable to client roles", () => {
  assert.match(migration, /prevent_client_provider_acceptance_mutation/);
  for (const table of ["auth_invitations", "tenant_notifications", "slot_offers"]) {
    assert.match(migration, new RegExp(`before insert or update on public\\.${table}`));
  }
});

test("guardian materialization is create-only and preserves the global profile", () => {
  const source = functionSource("public.materialize_import_guardian_invitation", preboundImportIdentityMigration);
  assert.match(source, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(source, /full_name\s*=\s*coalesce\(excluded\.full_name/);
  assert.match(source, /Import guardian membership already exists/);
  assert.match(source, /already_materialized := membership_id is not null/);
  assert.ok(source.indexOf("membership.invitation_id = invitation.id") < source.indexOf("if not already_materialized then"));
});

test("rollback owns generated guardian links and refuses unmanifested dependants", () => {
  assert.match(migration, /'participant_guardians'/);
  assert.match(migration, /capture_import_participant_guardian_manifest/);
  const source = functionSource("public.rollback_import_chunk");
  assert.match(source, /rollback_import_chunk_v1_unsafe/);
  assert.match(migration, /assert_import_target_unreferenced\(tg_relid, old\.tenant_id, old\.id\)/);
  assert.match(migration, /before delete on public\.groups/);
  assert.match(migration, /before delete on public\.participants/);
});

test("the mail worker claims one item only when it is ready to send", () => {
  assert.match(outboxWorker, /target_limit:\s*1/);
  assert.match(outboxWorker, /minimumEmailOutboxLeaseSeconds/);
  assert.doesNotMatch(outboxWorker, /target_limit:\s*input\.limit\s*\?\?\s*25/);
});

test("upgrade preflight is read-only and fail-closed on every required legacy blocker", () => {
  assert.match(upgradePreflight, /begin read only isolation level repeatable read/);
  assert.match(upgradePreflight, /process\.exitCode = report\.blockers\.length === 0 \? 0 : 2/);
  for (const blocker of [
    "duplicate_live_group_memberships",
    "legacy_import_without_durable_manifest",
    "conflicting_legacy_idempotency_keys",
    "invitation_auth_lineage_inconsistencies",
    "expired_email_worker_leases",
    "noncanonical_email_outbox_idempotency_keys",
    "unexpected_client_mutation_grants",
    "unexpected_storage_bucket_inventory",
    "migration_fingerprint_mismatch"
  ]) {
    assert.match(upgradePreflight, new RegExp(blocker));
  }
});

test("blocked upgrade fixture contains no automatic customer-data repair", () => {
  assert.match(upgradeFixture, /UPGRADE_FIXTURE_MODE/);
  assert.match(upgradeFixture, /'trial'.*current_date, 'trial'/s);
  assert.match(upgradeFixture, /set status = 'applying'/);
  assert.match(upgradeFixture, /conflicting-upgrade-key/);
  assert.match(upgradeFixture, /'accepted', 'sent'/);
  assert.match(upgradeFixture, /lease_expires_at = now\(\) - interval '1 minute'/);
  assert.doesNotMatch(upgradePreflight, /delete\s+from\s+public\./i);
});

test("platform roles are not implicit tenant mutation capabilities", () => {
  assert.match(platformTenantBoundaryMigration, /current_user <> 'authenticated'/);
  assert.match(platformTenantBoundaryMigration, /current_user_has_platform_role/);
  assert.match(platformTenantBoundaryMigration, /current_user_has_tenant_role/);
  assert.match(platformTenantBoundaryMigration, /Direct platform-only tenant mutation is forbidden/);
  for (const table of [
    "tenant_onboarding_runs",
    "auth_invitations",
    "tenant_memberships",
    "participants",
    "participant_guardians",
    "enrollments",
    "intake_submissions",
    "intake_answers",
    "group_memberships",
    "import_jobs",
    "import_manifest_entries",
    "email_outbox",
    "core_write_operations",
    "storage.objects"
  ]) {
    assert.match(platformTenantBoundaryMigration, new RegExp(table.replace(".", "\\.")));
  }
});
