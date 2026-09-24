import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../../supabase/migrations/20260812120000_stable_journey_completion_sequence.sql", import.meta.url);

test("journey completion sequence is tenant-scoped, unique and immutable", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /create table public\.portal_journey_item_completions/);
  assert.match(sql, /foreign key \(tenant_id, enrollment_id, participant_id\)[\s\S]+references public\.enrollments/);
  assert.match(sql, /unique \(tenant_id, enrollment_id, curriculum_stage_id, curriculum_item_id\)/);
  assert.match(sql, /unique \(tenant_id, enrollment_id, curriculum_stage_id, completion_sequence\)/);
  assert.match(sql, /before update or delete on public\.portal_journey_item_completions/);
  assert.match(sql, /raise exception 'Journey completion sequence is append-only'/);
});

test("rating-five capture serializes sequence allocation and is retry-safe", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /if new\.rating <> 5 then/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /coalesce\(max\(completion\.completion_sequence\), 0\) \+ 1/);
  assert.match(sql, /on conflict \(tenant_id, enrollment_id, curriculum_stage_id, curriculum_item_id\) do nothing/);
  assert.match(sql, /after insert on public\.swim_assessment_observations/);
});

test("legacy order is deterministic, explicit and never presented as authoritative event order", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /row_number\(\) over \([\s\S]+order by completed_at, completion_observation_id/);
  assert.match(sql, /'legacy_inferred'/);
  assert.match(sql, /on conflict do nothing/);
});

test("journey completions use forced RLS and explicit least-privilege grants", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /grant select on public\.portal_journey_item_completions to authenticated/);
  assert.match(sql, /current_user_can_view_participant/);
  assert.match(sql, /current_user_can_instruct_participant/);
  assert.match(sql, /current_user_can_manage_tenant_domain/);
  assert.match(sql, /revoke all on function app_private\.capture_portal_journey_item_completion\(\)[\s\S]+from public, anon, authenticated/);
});
