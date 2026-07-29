import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260729160000_lesson_plan_assistant.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../apps/web/lib/domain/lesson-plan-actions.ts", import.meta.url), "utf8");
const contract = readFileSync(new URL("../../apps/web/lib/domain/lesson-plan-contract.ts", import.meta.url), "utf8");

test("lesson plans are immutable, tenant-scoped and protected by assignment-aware RLS", () => {
  for (const table of ["lesson_plans", "lesson_plan_versions", "lesson_plan_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(migration, /unique \(tenant_id, session_id\)/);
  assert.match(migration, /app_private\.current_user_is_assigned_to_session\(session_id\)/);
  assert.match(migration, /proposal_json jsonb not null/);
  assert.match(migration, /jsonb_array_length\(proposal_json -> 'groupGoals'\) between 1 and 3/);
  assert.match(migration, /jsonb_array_length\(proposal_json -> 'personalAttention'\) <= 3/);
  assert.match(migration, /save_lesson_plan_proposal/);
  assert.match(migration, /for update/);
  assert.doesNotMatch(migration, /grant execute on function public\.save_lesson_plan_proposal\([^;]+to authenticated;/);
});

test("generation, approval and evaluation keep consequential actions human-owned", () => {
  assert.match(actions, /humanConfirmation"\) !== "generate"/);
  assert.match(actions, /humanConfirmation"\) !== "approve"/);
  assert.match(actions, /humanConfirmation"\) !== "evaluate"/);
  assert.match(actions, /\.eq\("current_version_id", versionId\)/);
  assert.match(actions, /\.eq\("status", "approved"\)/);
  assert.doesNotMatch(actions, /participant_progress_scores"\)\.(?:insert|upsert|update)/);
  assert.doesNotMatch(actions, /tenant_messages"\)\.(?:insert|upsert|update)/);
  assert.match(contract, /humanApprovalRequired: true/);
});
