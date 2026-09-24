import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260802120000_swim_school_canon_foundation.sql"
);

test("fundering bevat tenantveilige rollout, permission, audit, outbox en idempotency", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "tenant_swim_rollouts",
    "tenant_role_permission_overrides",
    "domain_command_receipts",
    "domain_outbox_events",
    "swim_audit_events"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`), table);
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`), table);
  }
  assert.match(sql, /unique \(tenant_id, idempotency_key\)/);
  assert.match(sql, /current_user_has_swim_permission/);
});

test("curriculum is versiegebonden, publicatie is transactioneel en releases zijn immutable", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "curriculum_versions",
    "curriculum_stages",
    "curriculum_competencies",
    "curriculum_item_identities",
    "curriculum_items",
    "curriculum_transition_rules",
    "curriculum_graduation_requirements",
    "curriculum_publication_validations",
    "curriculum_migration_plans"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`), table);
  }
  assert.match(sql, /Published curriculum versions are immutable/);
  assert.match(sql, /Curriculum publication must use the publication command/);
  assert.match(sql, /publish_curriculum_version[\s\S]+for update/);
  assert.match(sql, /event_type[\s\S]+curriculum\.published/);
  assert.match(sql, /add column curriculum_version_id uuid/);
});

test("carryover-identiteit is stabiel en één enrollment heeft één actuele badjefase", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /curriculum_item_identities_program_key_unique unique \(tenant_id, program_id, stable_key\)/);
  assert.match(sql, /enrollment_stage_assignments_one_active_idx[\s\S]+where status = 'active'/);
});
