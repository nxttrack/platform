import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyEmailHttpFailure,
  classifyEmailTransportError,
  emailRetryDelaySeconds,
  isEmailSendingEnabled
} from "../../apps/web/lib/email/email-delivery-contract";

const migrationPath = new URL(
  "../../supabase/migrations/20260822002234_production_email_outbox.sql",
  import.meta.url
);
const transactionalPath = new URL("../../apps/web/lib/email/transactional.ts", import.meta.url);
const workerPath = new URL("../../apps/web/lib/email/outbox.ts", import.meta.url);

test("central email kill switch is fail-closed and accepts only literal true", () => {
  for (const value of [undefined, "", "false", "0", "1", "yes", "enabled", "invalid"]) {
    assert.equal(isEmailSendingEnabled(value), false, String(value));
  }
  for (const value of ["true", " TRUE ", "True"]) {
    assert.equal(isEmailSendingEnabled(value), true, value);
  }
});

test("timeouts, network failures, 429 and 5xx retry while permanent 4xx does not", () => {
  const timeout = new Error("operation timed out");
  timeout.name = "TimeoutError";

  assert.deepEqual(classifyEmailTransportError(timeout), { code: "timeout", retryable: true });
  assert.deepEqual(classifyEmailTransportError(new TypeError("fetch failed")), { code: "network", retryable: true });
  assert.deepEqual(classifyEmailHttpFailure(429), { code: "rate_limited", retryable: true });
  assert.deepEqual(classifyEmailHttpFailure(500), { code: "provider_5xx", retryable: true });
  assert.deepEqual(classifyEmailHttpFailure(503), { code: "provider_5xx", retryable: true });
  assert.deepEqual(classifyEmailHttpFailure(400), { code: "provider_4xx", retryable: false });
  assert.deepEqual(classifyEmailHttpFailure(401), { code: "provider_4xx", retryable: false });
});

test("retry backoff is deterministic and bounded", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 100].map(emailRetryDelaySeconds), [30, 120, 480, 1_800, 7_200, 7_200, 7_200]);
});

test("outbox schema enforces durable dedupe, atomic claims, leases, retries and terminal state", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const column of [
    "tenant_id",
    "message_type",
    "idempotency_key",
    "payload_reference_type",
    "payload_reference_id",
    "payload",
    "status",
    "attempts",
    "next_attempt_at",
    "provider_message_id",
    "last_error_message",
    "created_at",
    "updated_at"
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`));
  }

  assert.match(sql, /unique nulls not distinct \(tenant_id, message_type, idempotency_key\)/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /status in \('queued', 'processing', 'retry', 'accepted', 'dead', 'cancelled'\)/);
  assert.match(sql, /lease_expires_at <= now\(\)/);
  assert.match(sql, /attempts < candidate\.max_attempts/);
  assert.match(sql, /target_retry_delay_seconds not between 1 and 86400/);
  assert.match(sql, /Email outbox events are append-only/);
});

test("every outbox RPC is fixed-search-path, invoker-rights and service-only", async () => {
  const sql = await readFile(migrationPath, "utf8");

  for (const signature of [
    "enqueue_email_outbox\\(uuid, text, text, jsonb, text, uuid, integer\\)",
    "claim_email_outbox\\(integer, integer\\)",
    "complete_email_outbox\\(uuid, uuid, text, text, text, text, text, integer\\)"
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }

  const functions = sql.match(/create function public\.(?:enqueue|claim|complete)_email_outbox[\s\S]*?\$\$;/g) ?? [];
  assert.equal(functions.length, 3);
  for (const source of functions) {
    assert.match(source, /security invoker/);
    assert.match(source, /set search_path = public, pg_temp/);
  }

  assert.match(sql, /grant select on table public\.email_outbox to authenticated/);
  assert.match(sql, /alter table public\.email_outbox force row level security/);
  assert.match(sql, /create policy email_outbox_authenticated_deny[\s\S]*?to authenticated[\s\S]*?using \(false\)/);
});

test("central transport gates before provider configuration and records acceptance, never delivery", async () => {
  const source = await readFile(transactionalPath, "utf8");
  const gateIndex = source.indexOf("isEmailSendingEnabled(process.env.EMAIL_SENDING_ENABLED)");
  const configurationIndex = source.indexOf("getConfiguredEmailDeliveryConfig()");

  assert.ok(gateIndex >= 0 && gateIndex < configurationIndex);
  assert.doesNotMatch(source, /delivered:\s*true/);
  assert.match(source, /accepted:\s*true/);
  assert.match(source, /status: result\.accepted \? "pending"/);
  assert.match(source, /accepted_at: result\.accepted/);
  assert.match(source, /delivered_at: null/);
});

test("worker always claims atomically and completes with accepted, retry or dead", async () => {
  const source = await readFile(workerPath, "utf8");
  const gateIndex = source.indexOf("isEmailSendingEnabled(process.env.EMAIL_SENDING_ENABLED)");
  const claimIndex = source.indexOf('rpc("claim_email_outbox"');
  assert.ok(gateIndex >= 0 && gateIndex < claimIndex);
  assert.match(source, /throw new EmailOutboxProcessingDisabledError/);
  assert.match(source, /rpc\("claim_email_outbox"/);
  assert.match(source, /delivery\.accepted \? "accepted" : delivery\.retryable \? "retry" : "dead"/);
  assert.match(source, /emailRetryDelaySeconds\(item\.attempt_number\)/);
  assert.match(source, /rpc\("complete_email_outbox"/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:payload|recipient|subject|to:)/);
});
