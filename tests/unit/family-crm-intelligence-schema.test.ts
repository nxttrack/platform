import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaMigration = readFileSync(
  new URL("../../supabase/migrations/20260727090000_family_crm_intelligence.sql", import.meta.url),
  "utf8"
);
const bookingMigration = readFileSync(
  new URL("../../supabase/migrations/20260727091000_makeup_marketplace_booking.sql", import.meta.url),
  "utf8"
);
const decisionMigration = readFileSync(
  new URL("../../supabase/migrations/20260727092000_makeup_decision_and_attendance.sql", import.meta.url),
  "utf8"
);

test("new intelligence tables are tenant scoped, forced through RLS and service writable", () => {
  for (const table of [
    "participant_schedule_preferences",
    "guardian_communication_preferences",
    "makeup_marketplace_decisions",
    "lead_sources",
    "intake_conversion_lineage",
    "lead_score_snapshots",
    "crm_follow_up_items"
  ]) {
    assert.match(schemaMigration, new RegExp(`create table public\\.${table}`));
    assert.match(schemaMigration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(schemaMigration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(schemaMigration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
});

test("Journey data stays marked and operational task creation can identify test records", () => {
  assert.match(schemaMigration, /lead_score_snapshots_test_marker_check/);
  assert.match(schemaMigration, /crm_follow_up_items_test_marker_check/);
  assert.match(schemaMigration, /makeup_marketplace_decisions_test_marker_check/);
  assert.match(schemaMigration, /alter table public\.tenant_tasks[\s\S]+is_test boolean not null default false[\s\S]+journey_run_id uuid/);
});

test("make-up booking and decisions are service-only, locked and explicitly confirmed", () => {
  for (const migration of [bookingMigration, decisionMigration]) {
    assert.match(migration, /human_confirmation is not true/);
    assert.match(migration, /for update/);
    assert.match(migration, /makeup_no_capacity/);
    assert.match(migration, /makeup_program_or_stage_mismatch/);
    assert.match(migration, /from public, anon, authenticated/);
    assert.match(migration, /to service_role/);
  }
});

test("reserved make-up credits are consumed only after attendance evidence", () => {
  assert.match(decisionMigration, /new\.status not in \('present', 'late', 'trial'\)/);
  assert.match(decisionMigration, /request\.status = 'approved'/);
  assert.match(decisionMigration, /set status = 'used', used_session_id = new\.session_id/);
  assert.match(decisionMigration, /after insert or update of status on public\.session_attendance/);
});

test("campaign conversion requires immutable source and relational placement lineage", () => {
  assert.match(schemaMigration, /lead_sources_unique_intake unique \(tenant_id, intake_submission_id\)/);
  assert.match(schemaMigration, /prevent_lead_source_update/);
  assert.match(schemaMigration, /intake_conversion_lineage_unique_enrollment unique \(tenant_id, enrollment_id\)/);
  assert.match(schemaMigration, /capture_slot_offer_lineage/);
  assert.match(schemaMigration, /capture_direct_placement_lineage/);
});
