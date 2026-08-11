import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260802130000_canonical_assessments_and_progress.sql"
);
const commandMigrationPath = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260802160000_swim_progress_command_api.sql"
);

test("assessmentauthority is append-only 1–5 met drafts, correctieketen en retractions", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.swim_assessment_drafts/);
  assert.match(sql, /create table public\.swim_assessment_observations/);
  assert.match(sql, /rating integer not null/);
  assert.match(sql, /rating between 1 and 5/);
  assert.match(sql, /corrects_observation_id uuid/);
  assert.match(sql, /create table public\.swim_assessment_retractions/);
  assert.match(sql, /Final assessment observations and retractions are append-only/);
  assert.match(sql, /finalize_swim_assessment/);
  assert.match(sql, /retract_swim_assessment/);
  assert.match(sql, /domain_command_receipts/);
});

test("productprojecties gebruiken rating gedeeld door vijf en houden coverage apart", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.swim_progress_projections/);
  assert.match(sql, /progress_fraction numeric\(18, 12\)/);
  assert.match(sql, /coverage_fraction numeric\(18, 12\)/);
  assert.match(sql, /latest\.rating::numeric \/ 5/);
  assert.match(sql, /formula_version text not null default 'swim_progress_v3'/);
  assert.doesNotMatch(sql, /\(latest\.rating\s*-\s*1\)\s*\/\s*4/);
  assert.match(sql, /scope_kind in \('item', 'stage', 'competency', 'diploma'\)/);
});

test("doorstroom en diplomastates zijn niet samengevoegd met percentageprogressie", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /eligibility_status text not null/);
  assert.match(sql, /review_status text not null/);
  assert.match(sql, /approval_status text not null/);
  assert.match(sql, /execution_status text not null/);
  assert.match(sql, /control_status text not null/);
  assert.match(sql, /readiness_status text not null/);
  assert.match(sql, /credential_status text not null/);
  assert.match(sql, /credential_status <> 'issued' or readiness_status = 'ready'/);
});

test("alle nieuwe assessmenttabellen forceren tenant-RLS", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "swim_assessment_drafts",
    "swim_assessment_observations",
    "swim_assessment_retractions",
    "swim_progress_projections",
    "swim_transition_cases",
    "swim_graduation_controls"
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`), table);
  }
});

test("web en native gebruiken een actor-gebonden publieke commandgrens", async () => {
  const sql = await readFile(commandMigrationPath, "utf8");
  assert.match(sql, /create or replace function public\.finalize_swim_assessment/);
  assert.match(sql, /actor_user_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(sql, /Authenticated actor required/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /grant execute on function public\.finalize_swim_assessment[\s\S]+to authenticated/);
  assert.doesNotMatch(sql, /to service_role/);
});
