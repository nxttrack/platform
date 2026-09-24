import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260802150000_curriculum_wizard_and_migrations.sql"
);
const phase16FixturePath = path.join(root, "scripts/staging/phase-16-operational-flow.mjs");

test("wizard bewaart drafts, revisions en uitsluitend gestructureerde policies", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.curriculum_draft_revisions/);
  assert.match(sql, /create or replace function public\.save_curriculum_draft_step/);
  assert.match(sql, /target_step not in \('framework', 'stages', 'competencies', 'items', 'policies'\)/);
  assert.match(sql, /'carryoverMode', carryover_mode/);
  assert.match(sql, /'automaticMove', false/);
  assert.doesNotMatch(sql, /execute\s+target_payload/i);
});

test("validatie bevat coverage, impact, diff en het ongeronde 16,7%-voorbeeld", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function app_private\.validate_curriculum_draft/);
  assert.match(sql, /'activeEnrollmentsOnSourceVersion'/);
  assert.match(sql, /'diplomaProgressFraction', \(1::numeric \/ 6\)/);
  assert.match(sql, /'displayPercentOneDecimal', 16\.7/);
  assert.match(sql, /findings_json/);
});

test("bestaande leerlingen blijven pinned tot preview, approval en execute", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /'automaticLearnerMigration', false/);
  assert.match(sql, /create or replace function public\.preview_curriculum_migration/);
  assert.match(sql, /create or replace function public\.approve_curriculum_migration/);
  assert.match(sql, /create or replace function public\.execute_curriculum_migration/);
  assert.match(sql, /source = 'curriculum_migration'|curriculum_migration'/);
  assert.match(sql, /refresh_swim_progress_projections/);
});

test("stagingfixture publiceert zes versioned onderdelen en bewijst 16,7% via de actorcommand", async () => {
  const source = await readFile(phase16FixturePath, "utf8");
  const publishIndex = source.indexOf('admin.rpc("publish_curriculum_version"');
  const enrollmentPinIndex = source.indexOf('await updateById("enrollments"');

  assert.match(source, /validation_example:\s*"one_of_six_at_five_is_16_7_percent"/);
  assert.match(source, /curriculumItemsResult\.data\?\.length !== 6/);
  assert.ok(publishIndex >= 0);
  assert.ok(publishIndex < enrollmentPinIndex);
  assert.match(source, /instructor\.rpc\("finalize_swim_assessment"/);
  assert.match(source, /target_rating:\s*5/);
  assert.match(source, /target_idempotency_key:\s*`phase16:assessment:/);
});
