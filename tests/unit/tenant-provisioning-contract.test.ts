import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../../supabase/migrations/20260822004329_atomic_tenant_provisioning.sql",
  import.meta.url
);
const actionPath = new URL("../../apps/web/lib/domain/tenant-lifecycle-actions.ts", import.meta.url);
const invitationsPath = new URL("../../apps/web/lib/auth/invitations.ts", import.meta.url);

test("tenant provisioning migration is additive and has durable idempotency and lifecycle keys", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.doesNotMatch(sql, /\bdrop\s+(?:column|constraint|function|table)\b/i);
  assert.doesNotMatch(sql, /\btruncate\b|\bdelete\s+from\b/i);
  assert.match(sql, /tenant_onboarding_runs_idempotency_unique/);
  assert.match(sql, /request_fingerprint/);
  assert.match(sql, /auth_invitations_provisioning_business_unique/);
  assert.match(sql, /tenant_onboarding_events_unique unique \(onboarding_run_id, event_key\)/);
  assert.match(sql, /Tenant onboarding events are append-only/);
});

test("one provisioning RPC owns the complete database graph and invitation enqueue", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const rpc = functionSource(sql, "provision_tenant_atomic");

  for (const table of [
    "tenant_onboarding_runs",
    "tenants",
    "tenant_settings",
    "tenant_portal_theme_availability",
    "tenant_domains",
    "tenant_branding",
    "programs",
    "program_stages",
    "resources",
    "groups",
    "payment_plans",
    "auth_invitations",
    "tenant_onboarding_events"
  ]) {
    assert.match(rpc, new RegExp(`(?:insert into|update) public\\.${table}`));
  }

  assert.match(rpc, /perform public\.activate_tenant_portal_theme/);
  assert.match(rpc, /perform public\.enqueue_email_outbox/);
  assert.match(rpc, /pg_advisory_xact_lock/);
  assert.match(rpc, /request_fingerprint is distinct from target_request_fingerprint/);
  assert.match(rpc, /exception when others/);
});

test("every logical database step supports rollback-only failure injection", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const rpc = functionSource(sql, "provision_tenant_atomic");

  for (const step of ["organization", "identity", "program", "operations", "billing", "invitations", "opening"]) {
    assert.match(rpc, new RegExp(`provisioning_step := '${step}'[\\s\\S]*?current_setting\\('nxttrack\\.test_failure_step'`));
  }

  assert.match(rpc, /set tenant_id = null,[\s\S]*?status = 'attention_required'/);
  assert.match(rpc, /'database_attention'/);
  assert.doesNotMatch(rpc, /sqlerrm|stacked diagnostics/i);
});

test("identity materialization is post-commit, retry-safe and releases mail only on opening", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const action = await readFile(actionPath, "utf8");
  const provisionCall = action.indexOf('rpc("provision_tenant_atomic"');
  const authCall = action.indexOf("await ensureInvitationAuthUser");

  assert.ok(provisionCall >= 0 && authCall >= 0 && provisionCall < authCall);
  assert.doesNotMatch(action.slice(0, action.indexOf("export async function startTenantOffboardingAction")), /createInvitation\(/);
  assert.doesNotMatch(action.slice(0, action.indexOf("export async function startTenantOffboardingAction")), /sendTransactionalEmail\(/);
  assert.match(action, /resumeTenantProvisioningAction/);
  assert.match(action, /mark_tenant_provisioning_identity_attention/);

  const materialize = functionSource(sql, "materialize_tenant_onboarding_invitation");
  const complete = functionSource(sql, "complete_tenant_provisioning");
  assert.match(materialize, /on conflict \(tenant_id, user_id, role\) do update/);
  assert.match(materialize, /already_materialized := true/);
  assert.match(sql, /set next_attempt_at = now\(\) \+ interval '100 years'/);
  assert.match(complete, /set status = 'active'/);
  assert.match(complete, /set next_attempt_at = now\(\)/);
  assert.match(complete, /status = 'opened'/);
});

test("provisioning and Auth resolution RPCs are fixed-path service-only boundaries", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const signatures = [
    "resolve_auth_user_id_by_email\\(text\\)",
    "provision_tenant_atomic\\(uuid, text, text, jsonb\\)",
    "materialize_tenant_onboarding_invitation\\(uuid, uuid, uuid, uuid, boolean\\)",
    "complete_tenant_provisioning\\(uuid, uuid\\)",
    "mark_tenant_provisioning_identity_attention\\(uuid, uuid, text\\)"
  ];

  for (const signature of signatures) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  for (const name of [
    "resolve_auth_user_id_by_email",
    "provision_tenant_atomic",
    "materialize_tenant_onboarding_invitation",
    "complete_tenant_provisioning",
    "mark_tenant_provisioning_identity_attention"
  ]) {
    const source = functionSource(sql, name);
    assert.match(source, /set search_path =/);
    assert.match(source, /security invoker/);
  }
  assert.match(sql, /create function app_private\.resolve_auth_user_id_by_email[\s\S]*?security definer[\s\S]*?set search_path = auth, pg_temp/);
});

test("Auth creation resolves an existing or concurrent account instead of duplicating it", async () => {
  const source = await readFile(invitationsPath, "utf8");
  const helper = source.match(/export async function ensureInvitationAuthUser[\s\S]*?\n}\n\nasync function resolveAuthUserIdByEmail/)?.[0] ?? "";

  assert.match(helper, /findUserIdByEmail/);
  assert.match(helper, /resolveAuthUserIdByEmail/);
  assert.match(helper, /auth\.admin\.createUser/);
  assert.match(helper, /nxttrack_provisioning_invitation_id/);
  assert.match(helper, /concurrentAuthUserId/);
  assert.doesNotMatch(helper, /deleteUser/);
});

function functionSource(sql: string, name: string) {
  const match = sql.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}
