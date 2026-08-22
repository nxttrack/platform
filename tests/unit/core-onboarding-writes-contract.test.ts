import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260822010612_atomic_core_onboarding_writes.sql",
  import.meta.url
);
const actionsPath = new URL("../../apps/web/lib/domain/actions.ts", import.meta.url);
const intakePath = new URL("../../apps/web/lib/domain/intake-actions.ts", import.meta.url);

test("core onboarding migration is additive and keeps PII out of the operation ledger", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.doesNotMatch(sql, /\bdrop\s+(?:column|constraint|function|table)\b/i);
  assert.doesNotMatch(sql, /\btruncate\b|\bdelete\s+from\b/i);
  assert.match(sql, /core_write_operations_business_unique unique \(tenant_id, operation_type, idempotency_key\)/);
  assert.match(sql, /payloads and PII are never stored here/);
  assert.doesNotMatch(tableSource(sql, "core_write_operations"), /parent_email|display_name|payload_json/i);
});

test("participant graph owns participant, guardian, enrollment and audit in one RPC", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const rpc = functionSource(sql, "create_participant_graph_atomic");

  for (const table of ["participants", "participant_guardians", "enrollments", "swim_audit_events"]) {
    assert.match(rpc, new RegExp(`insert into public\\.${table}`));
  }
  for (const step of ["participant", "guardian", "enrollment", "participant_audit"]) {
    assert.match(rpc, new RegExp(`failure_step = '${step}'`));
  }
  assert.match(rpc, /stage\.program_id = selected_program_id/);
  assert.match(rpc, /membership\.role = 'parent'/);
  assert.match(rpc, /exception when others/);
});

test("intake submission, answers, duplicate classification and audit share one RPC", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const rpc = functionSource(sql, "create_intake_submission_atomic");

  for (const table of ["intake_submissions", "intake_answers", "tenant_events"]) {
    assert.match(rpc, new RegExp(`insert into public\\.${table}`));
  }
  assert.match(rpc, /received_at >= now\(\) - interval '30 days'/);
  assert.match(rpc, /'possible_duplicate'/);
  for (const step of ["intake_submission", "intake_answers", "intake_audit"]) {
    assert.match(rpc, new RegExp(`failure_step = '${step}'`));
  }
});

test("placement locks, recalculates every capacity source and has a narrow live invariant", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const rpc = functionSource(sql, "place_group_membership_atomic");

  assert.match(sql, /group_memberships_one_live_enrollment_per_group_idx[\s\S]*?where status in \('active', 'trial'\)/);
  assert.match(rpc, /from public\.groups lesson_group[\s\S]*?for update/);
  assert.match(rpc, /public\.group_memberships/);
  assert.match(rpc, /public\.offering_registrations/);
  assert.match(rpc, /public\.capacity_soft_reservations/);
  assert.match(rpc, /target_enrollment\.program_id <> target_group\.program_id/);
  for (const outcome of ["placed", "already_placed", "capacity_full", "conflict"]) {
    assert.match(rpc, new RegExp(`'${outcome}'`));
  }
});

test("all atomic write RPCs are fixed-path service-only boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const signatures = [
    "create_participant_graph_atomic\\(uuid, uuid, text, text, jsonb, jsonb\\)",
    "create_intake_submission_atomic\\(uuid, text, text, text, jsonb, jsonb\\)",
    "place_group_membership_atomic\\(uuid, uuid, text, text, uuid, uuid, text, text, numeric, date\\)"
  ];

  for (const signature of signatures) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature}[\\s\\S]*?from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*?to service_role`));
  }
  for (const name of ["create_participant_graph_atomic", "create_intake_submission_atomic", "place_group_membership_atomic"]) {
    const rpc = functionSource(sql, name);
    assert.match(rpc, /security invoker/);
    assert.match(rpc, /set search_path = public, pg_temp/);
  }
});

test("server actions no longer perform split core writes or preflight capacity reads", async () => {
  const actions = await readFile(actionsPath, "utf8");
  const intake = await readFile(intakePath, "utf8");
  const participantAction = actionSource(actions, "createParticipantEnrollmentAction", "createGroupMembershipAction");
  const placementAction = actionSource(actions, "createGroupMembershipAction", "getActionTenant");
  const intakeSubmit = intake.match(/async function submitIntake\(formData[\s\S]*?\n}\n\nfunction classificationColumns/)?.[0] ?? "";

  assert.match(participantAction, /rpc\("create_participant_graph_atomic"/);
  assert.doesNotMatch(participantAction, /\.from\("(?:participants|participant_guardians|enrollments)"\)/);
  assert.match(placementAction, /rpc\("place_group_membership_atomic"/);
  assert.doesNotMatch(placementAction, /groupHasCapacity|\.from\("group_memberships"\)/);
  assert.match(intakeSubmit, /rpc\("create_intake_submission_atomic"/);
  assert.doesNotMatch(intakeSubmit, /\.from\("(?:intake_submissions|intake_answers|tenant_events)"\)/);
  assert.match(intakeSubmit, /10 \* 60 \* 1_000/);
});

function functionSource(sql: string, name: string) {
  const match = sql.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

function tableSource(sql: string, name: string) {
  const match = sql.match(new RegExp(`create table public\\.${name} \\([\\s\\S]*?\\n\\);`));
  assert.ok(match, `missing table ${name}`);
  return match[0];
}

function actionSource(source: string, start: string, end: string) {
  return source.slice(source.indexOf(`export async function ${start}`), source.indexOf(`export async function ${end}`));
}
