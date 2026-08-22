#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.EMAIL_OUTBOX_TEST_DATABASE_URL ??
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const workers = new pg.Pool({ connectionString, max: 20 });
const runKey = randomUUID();
const idempotencyKey = `email-outbox-${runKey}`;
const payload = {
  subject: "Outbox integration contract",
  templateKey: "integration_test",
  text: "No provider is invoked by this database test.",
  to: `outbox-${runKey}@example.test`
};

try {
  await setup.connect();
  await assertServiceOnlyBoundary();

  const duplicateEnqueues = await Promise.all(
    Array.from({ length: 20 }, () => serviceQuery(
      `select public.enqueue_email_outbox(
        null, 'integration.test', $1, $2::jsonb, null, null, 3
      ) as id`,
      [idempotencyKey, JSON.stringify(payload)]
    ))
  );
  const outboxIds = new Set(duplicateEnqueues.map((result) => result.rows[0]?.id));
  assertEqual(outboxIds.size, 1, "twenty duplicate enqueues must return one outbox id");
  const outboxId = [...outboxIds][0];

  const stored = await setup.query(
    `select
       count(*)::integer as row_count,
       (select count(*)::integer from public.email_outbox_events where outbox_id = $1 and event_type = 'enqueued') as event_count
     from public.email_outbox where id = $1`,
    [outboxId]
  );
  assertEqual(stored.rows[0]?.row_count, 1, "duplicate enqueue must persist one row");
  assertEqual(stored.rows[0]?.event_count, 1, "duplicate enqueue must persist one enqueue event");

  await assertRejects(
    () => serviceQuery(
      "select public.enqueue_email_outbox(null, 'integration.test', $1, $2::jsonb, null, null, 3)",
      [idempotencyKey, JSON.stringify({ ...payload, subject: "Conflicting input" })]
    ),
    "reusing an idempotency key with different input must fail"
  );

  const concurrentClaims = await Promise.all(
    Array.from({ length: 20 }, () => serviceQuery(
      "select * from public.claim_email_outbox(1, 30)"
    ))
  );
  const claimedRows = concurrentClaims.flatMap((result) => result.rows);
  assertEqual(claimedRows.length, 1, "twenty workers must claim one queued item exactly once");
  const firstClaim = claimedRows[0];
  assertEqual(firstClaim?.attempt_number, 1, "the first claim must be attempt one");

  const retry = await serviceQuery(
    `select public.complete_email_outbox(
      $1, $2, 'retry', 'sendgrid_api', null, 'provider_5xx',
      'Provider rejected before acceptance.', 30
    ) as status`,
    [outboxId, firstClaim?.claim_token]
  );
  assertEqual(retry.rows[0]?.status, "retry", "a retryable provider failure must remain retryable");

  await setup.query(
    "update public.email_outbox set next_attempt_at = now() where id = $1",
    [outboxId]
  );
  const secondClaimResult = await serviceQuery("select * from public.claim_email_outbox(1, 30)");
  assertEqual(secondClaimResult.rows.length, 1, "a due retry must be claimable");
  const secondClaim = secondClaimResult.rows[0];
  assertEqual(secondClaim?.attempt_number, 2, "a retry claim must increment attempts once");

  const accepted = await serviceQuery(
    `select public.complete_email_outbox(
      $1, $2, 'accepted', 'sendgrid_api', 'provider-message-id', null, null, null
    ) as status`,
    [outboxId, secondClaim?.claim_token]
  );
  assertEqual(accepted.rows[0]?.status, "accepted", "provider acceptance must be terminal acceptance");

  const acceptedState = await setup.query(
    `select status, attempts, accepted_at is not null as has_accepted_at,
      (select array_agg(event_type order by created_at, id) from public.email_outbox_events where outbox_id = $1) as events
     from public.email_outbox where id = $1`,
    [outboxId]
  );
  assertEqual(acceptedState.rows[0]?.status, "accepted", "accepted state must persist");
  assertEqual(acceptedState.rows[0]?.attempts, 2, "accepted state must preserve the attempt count");
  assertEqual(acceptedState.rows[0]?.has_accepted_at, true, "acceptance needs its own timestamp");
  assertEqual(
    JSON.stringify(acceptedState.rows[0]?.events),
    JSON.stringify(["enqueued", "claimed", "retry_scheduled", "claimed", "accepted"]),
    "the lifecycle event sequence must be complete"
  );

  const leaseKey = `email-outbox-lease-${runKey}`;
  const leaseEnqueue = await serviceQuery(
    "select public.enqueue_email_outbox(null, 'integration.lease', $1, $2::jsonb, null, null, 1) as id",
    [leaseKey, JSON.stringify(payload)]
  );
  const leaseOutboxId = leaseEnqueue.rows[0]?.id;
  const finalClaim = await serviceQuery("select * from public.claim_email_outbox(1, 30)");
  assertEqual(finalClaim.rows[0]?.outbox_id, leaseOutboxId, "the final-attempt fixture must be claimed");
  await setup.query(
    "update public.email_outbox set lease_expires_at = now() - interval '1 second' where id = $1",
    [leaseOutboxId]
  );
  await serviceQuery("select * from public.claim_email_outbox(1, 30)");
  const exhausted = await setup.query(
    "select status, last_error_code from public.email_outbox where id = $1",
    [leaseOutboxId]
  );
  assertEqual(exhausted.rows[0]?.status, "dead", "an expired final lease must not remain processing");
  assertEqual(
    exhausted.rows[0]?.last_error_code,
    "lease_expired_attempts_exhausted",
    "lease exhaustion must have a visible terminal reason"
  );

  await assertRejects(
    () => setup.query(
      "update public.email_outbox_events set details = '{}'::jsonb where outbox_id = $1",
      [outboxId]
    ),
    "outbox events must be append-only"
  );

  console.log(
    "[test:email-outbox:db] PASS service-only grants, 20-way enqueue dedupe, 20-way atomic claim, retry, acceptance, lease exhaustion and immutable lifecycle events."
  );
} finally {
  await Promise.allSettled([workers.end(), setup.end()]);
}

async function assertServiceOnlyBoundary() {
  const privileges = await setup.query(
    `select
      has_function_privilege('anon', 'public.enqueue_email_outbox(uuid,text,text,jsonb,text,uuid,integer)', 'execute') as anon_enqueue,
      has_function_privilege('authenticated', 'public.enqueue_email_outbox(uuid,text,text,jsonb,text,uuid,integer)', 'execute') as authenticated_enqueue,
      has_function_privilege('service_role', 'public.enqueue_email_outbox(uuid,text,text,jsonb,text,uuid,integer)', 'execute') as service_enqueue`
  );
  assertEqual(privileges.rows[0]?.anon_enqueue, false, "anon must not enqueue mail");
  assertEqual(privileges.rows[0]?.authenticated_enqueue, false, "authenticated must not enqueue mail directly");
  assertEqual(privileges.rows[0]?.service_enqueue, true, "service_role must be able to enqueue mail");

  const hiddenRows = await setup.query(
    "begin; set local role authenticated; select count(*)::integer as count from public.email_outbox; rollback"
  );
  const countResult = hiddenRows.find((result) => Array.isArray(result.rows) && result.rows[0]?.count !== undefined);
  assertEqual(countResult?.rows[0]?.count, 0, "authenticated RLS must expose zero outbox rows");
}

async function serviceQuery(text, values = []) {
  const client = await workers.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const result = await client.query(text, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertRejects(operation, message) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
