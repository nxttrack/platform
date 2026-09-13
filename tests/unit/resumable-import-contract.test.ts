import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260822012255_resumable_import_apply_rollback.sql",
  import.meta.url
);
const actionsPath = new URL("../../apps/web/lib/domain/import-actions.ts", import.meta.url);

test("import migration is additive and uses a durable per-target manifest", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.doesNotMatch(sql, /\bdrop\s+(?:column|constraint|function|table)\b|\btruncate\b/i);
  assert.match(sql, /create table public\.import_manifest_entries/);
  assert.match(sql, /import_manifest_row_target_unique unique \(tenant_id, import_job_id, import_row_id, target_table\)/);
  assert.match(sql, /Entries remain after compensation as reconciliation evidence/);
  assert.match(sql, /compensation_status in \('pending', 'compensated', 'failed'\)/);
  assert.doesNotMatch(functionSource(sql, "complete_import_rollback"), /delete from public\.import_manifest_entries/);
});

test("apply has an atomic leased claim, bounded chunks and durable reconciliation", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const claim = functionSource(sql, "claim_import_apply");
  const chunk = functionSource(sql, "apply_import_chunk");

  assert.match(claim, /for update/);
  assert.match(claim, /apply_claim_token = claim_token/);
  assert.match(claim, /apply_lease_expires_at/);
  assert.match(chunk, /jsonb_array_length\(target_rows\) > 250/);
  assert.match(chunk, /exception when others/);
  assert.match(chunk, /status = 'failed', reconciliation_state = 'needs_attention'/);
  assert.match(chunk, /current_setting\('nxttrack\.test_import_failure'/);
  assert.doesNotMatch(chunk, /sqlerrm|stacked diagnostics/i);
});

test("guardian import commits invitation and blocked outbox together then releases only on completion", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const chunk = functionSource(sql, "apply_import_chunk");
  const materialize = functionSource(sql, "materialize_import_guardian_invitation");
  const complete = functionSource(sql, "complete_import_apply");

  assert.match(chunk, /insert into public\.auth_invitations/);
  assert.match(chunk, /public\.enqueue_email_outbox/);
  assert.match(chunk, /next_attempt_at = now\(\) \+ interval '100 years'/);
  assert.match(materialize, /insert into public\.tenant_memberships/);
  assert.doesNotMatch(materialize, /next_attempt_at = now\(\)/);
  assert.match(complete, /update public\.email_outbox outbox[\s\S]*?set next_attempt_at = now\(\)/);
});

test("rollback compensates only manifest-owned targets and preserves failures for retry", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const claim = functionSource(sql, "claim_import_rollback");
  const chunk = functionSource(sql, "rollback_import_chunk");

  assert.match(claim, /rollback_state = 'rolling_back'/);
  assert.match(chunk, /candidate\.created_by_import/);
  assert.match(chunk, /compensation_status in \('pending', 'failed'\)/);
  assert.match(chunk, /compensation_status = 'failed'/);
  assert.match(chunk, /rollback_state = 'needs_attention'/);
  assert.match(chunk, /status in \('processing', 'accepted'\)/);
  assert.match(chunk, /current_setting\('nxttrack\.test_import_rollback_failure'/);
  assert.doesNotMatch(chunk, /catch\(\(\) => undefined\)|sqlerrm/i);
});

test("validation and apply actions use bounded chunks instead of per-row Data API writes", async () => {
  const source = await readFile(actionsPath, "utf8");
  const validate = actionSource(source, "validateImportAction", "dryRunImportAction");
  const apply = actionSource(source, "applyImportAction", "rollbackImportAction");
  const rollback = source.slice(source.indexOf("export async function rollbackImportAction"), source.indexOf("function buildImportCommand"));

  assert.match(validate, /index \+= 250/);
  assert.match(validate, /rpc\("update_import_validation_chunk"/);
  assert.doesNotMatch(validate, /for \(const .*await requireWrite/);
  assert.match(apply, /index \+= 250/);
  assert.match(apply, /rpc\("claim_import_apply"/);
  assert.match(apply, /rpc\("apply_import_chunk"/);
  assert.doesNotMatch(apply, /\.from\("(?:participants|groups|enrollments|manual_payments|import_rows)"\)/);
  assert.match(rollback, /rpc\("rollback_import_chunk"/);
  assert.doesNotMatch(rollback, /\.delete\(\)/);
});

test("all import mutation RPCs are fixed-path service-only boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const signatures = [
    "update_import_validation_chunk\\(uuid, uuid, uuid, jsonb\\)",
    "complete_import_validation\\(uuid, uuid, uuid, jsonb\\)",
    "claim_import_apply\\(uuid, uuid, uuid, text, integer\\)",
    "apply_import_chunk\\(uuid, uuid, uuid, uuid, jsonb\\)",
    "materialize_import_guardian_invitation\\(uuid, uuid, uuid, uuid, uuid, boolean\\)",
    "mark_import_reconciliation_attention\\(uuid, uuid, uuid, uuid, text\\)",
    "complete_import_apply\\(uuid, uuid, uuid, uuid\\)",
    "claim_import_rollback\\(uuid, uuid, uuid, integer\\)",
    "rollback_import_chunk\\(uuid, uuid, uuid, uuid, integer\\)",
    "complete_import_rollback\\(uuid, uuid, uuid, uuid\\)"
  ];
  for (const signature of signatures) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  for (const name of signatures.map((signature) => signature.split("\\")[0])) {
    const rpc = functionSource(sql, name);
    assert.match(rpc, /security invoker/);
    assert.match(rpc, /set search_path = public, pg_temp/);
  }
});

function functionSource(sql: string, name: string) {
  const match = sql.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

function actionSource(source: string, start: string, end: string) {
  return source.slice(source.indexOf(`export async function ${start}`), source.indexOf(`export async function ${end}`));
}
