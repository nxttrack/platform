import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  import.meta.dirname,
  "../../supabase/migrations/20260802170000_transition_carryover_commands.sql"
);

test("doorstroom houdt eligibility, review, approval en execution afzonderlijk", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /preview_swim_transition/);
  assert.match(sql, /review_swim_transition/);
  assert.match(sql, /approve_swim_transition/);
  assert.match(sql, /execute_swim_transition/);
  assert.match(sql, /review_status <> 'reviewed'/);
  assert.match(sql, /approval_status <> 'approved'/);
  assert.match(sql, /Enrollment stage changed after approval/);
});

test("carryover verwijst naar het originele item en is previewbaar en idempotent", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.swim_item_carryovers/);
  assert.match(sql, /curriculum_item_id uuid not null/);
  assert.match(sql, /curriculum_item_identity_id uuid not null/);
  assert.match(sql, /one_open_identity_idx/);
  assert.match(sql, /preview_previous_stage_items/);
  assert.match(sql, /complete_previous_stage_items/);
  assert.match(sql, /domain_command_receipts/);
  assert.match(sql, /carryover\.complete_previous/);
});

test("carryovercommands zijn permission-bound, auditbaar en tenant-RLS beschermd", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /current_user_has_swim_permission\(target_tenant_id, 'carryover\.complete_previous'\)/);
  assert.match(sql, /insert into public\.swim_audit_events/);
  assert.match(sql, /insert into public\.domain_outbox_events/);
  assert.match(sql, /alter table public\.swim_item_carryovers force row level security/);
  assert.match(sql, /revoke insert, update, delete on public\.swim_transition_cases from authenticated/);
});
