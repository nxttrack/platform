import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260726230000_learning_capacity_intelligence.sql", import.meta.url),
  "utf8"
);

test("learning intelligence tables are tenant scoped and force RLS", () => {
  for (const table of [
    "participant_progress_assessments",
    "lesson_focus_cards",
    "participant_contact_drafts"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant select on public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
  assert.doesNotMatch(migration, /grant (insert|update|delete|all) on public\.lesson_focus_cards to authenticated/);
});

test("assessment history is append-only and automatically captures score changes", () => {
  assert.match(migration, /create function app_private\.capture_progress_assessment\(\)/);
  assert.match(migration, /after insert or update of score, positive_label, visibility, scored_by_user_id, scored_at/);
  assert.match(migration, /insert into public\.participant_progress_assessments/);
  assert.match(migration, /participant_progress_assessments_source_score_fk[\s\S]+on delete cascade/);
  assert.match(migration, /left join lateral \([\s\S]+from public\.group_memberships/);
  assert.match(migration, /if target_group_id is null then[\s\S]+from public\.group_memberships/);
});

test("lesson focus is capped, human treated and Journey-safe", () => {
  assert.match(migration, /jsonb_array_length\(focus_points_json\) between 1 and 3/);
  assert.match(migration, /status = 'treated' and treated_at is not null and treated_by_user_id is not null/);
  assert.match(migration, /lesson_focus_cards_test_marker_check/);
  assert.match(migration, /foreign key \(tenant_id, session_id\)[\s\S]+on delete cascade/);
  assert.match(migration, /foreign key \(tenant_id, participant_id\)[\s\S]+on delete cascade/);
});

test("contact drafts cannot send and stay participant scoped", () => {
  assert.match(migration, /status in \('draft', 'reviewed', 'archived'\)/);
  assert.doesNotMatch(migration, /status in \([^)]*'sent'/);
  assert.match(migration, /participant_contact_drafts_participant_fk/);
  assert.match(migration, /current_user_can_instruct_participant\(participant_id\)/);
});

test("NBA constraint accepts the new advisory intelligence types", () => {
  for (const type of [
    "attendance_follow_up",
    "progress_bottleneck_review",
    "forecast_capacity_review"
  ]) {
    assert.match(migration, new RegExp(`'${type}'`));
  }
});
