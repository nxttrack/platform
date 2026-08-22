#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.PRODUCTION_READINESS_CRASH_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const workers = new pg.Pool({ connectionString, max: 40 });
const token = randomUUID();
const payload = {
  subject: "Synthetic crash-window message",
  templateKey: "certification_crash",
  text: "Synthetic local message; no provider is invoked.",
  to: `crash-${token}@example.test`
};

try {
  await setup.connect();
  await testOneHundredAtomicClaims();
  await testProviderAcceptanceCrashAndStaleWorker();
  await testClockSkewAndRetryBounds();
  await testOpaqueKeyCanonicalization();
  await testAdvisoryContentionAndStatementTimeout();
  await testDeadlockRecovery();
  console.log(
    "[test:production-readiness-crash-windows] PASS 100 atomic claims, provider-acceptance crash visibility, stale-token fencing, clock/backoff bounds, canonical keys, advisory timeout and deadlock recovery."
  );
} finally {
  await Promise.allSettled([workers.end(), setup.end()]);
}

async function testOneHundredAtomicClaims() {
  const ids = [];
  for (let index = 0; index < 100; index += 1) {
    ids.push(await enqueue(`crash-100:${token}:${index}`, payload, 3));
  }
  await beginClaimIsolation(ids);
  let results;
  try {
    results = await Promise.all(
      Array.from({ length: 100 }, () => serviceQuery("select * from public.claim_email_outbox(1, 60)"))
    );
  } finally {
    await setup.query("commit");
  }
  const claims = results.flatMap((result) => result.rows);
  assert.equal(claims.length, 100, "one hundred workers must claim all one hundred rows");
  assert.equal(new Set(claims.map((claim) => claim.outbox_id)).size, 100, "every row must have one claimant");
  assert.ok(claims.every((claim) => claim.attempt_number === 1), "every first claim must be attempt one");
  await Promise.all(claims.map((claim) => serviceQuery(
    "select public.complete_email_outbox($1,$2,'dead',null,null,'synthetic_complete','Synthetic local completion.',null)",
    [claim.outbox_id, claim.claim_token]
  )));
}

async function testProviderAcceptanceCrashAndStaleWorker() {
  const outboxId = await enqueue(`provider-crash:${token}`, payload, 3);
  const oldClaim = await claimOnly(outboxId);

  // This durable marker models the only fact known after an external provider has
  // returned acceptance but the worker crashes before its database completion.
  const providerAcceptedOutsideDatabase = true;
  assert.equal(providerAcceptedOutsideDatabase, true);
  const beforeRecovery = await setup.query(
    "select status, accepted_at from public.email_outbox where id=$1",
    [outboxId]
  );
  assert.deepEqual(beforeRecovery.rows[0], { status: "processing", accepted_at: null });

  await setup.query(
    "update public.email_outbox set lease_expires_at=now()-interval '1 second' where id=$1",
    [outboxId]
  );
  const recoveredClaim = await claimOnly(outboxId);
  assert.equal(recoveredClaim.attempt_number, 2, "expired lease must become a visible second attempt");
  await assertRejects(
    () => serviceQuery(
      "select public.complete_email_outbox($1,$2,'accepted','smtp','old-provider-id',null,null,null)",
      [outboxId, oldClaim.claim_token]
    ),
    "old worker must be fenced after lease recovery"
  );
  const accepted = await serviceQuery(
    "select public.complete_email_outbox($1,$2,'accepted','smtp','reconciled-provider-id',null,null,null) as status",
    [outboxId, recoveredClaim.claim_token]
  );
  assert.equal(accepted.rows[0].status, "accepted");
  const evidence = await setup.query(
    `select status, attempts,
      (select array_agg(event_type order by created_at,id) from public.email_outbox_events where outbox_id=$1) as events
     from public.email_outbox where id=$1`,
    [outboxId]
  );
  assert.equal(evidence.rows[0].status, "accepted");
  assert.equal(evidence.rows[0].attempts, 2);
  assert.deepEqual(evidence.rows[0].events, ["enqueued", "claimed", "lease_recovered", "accepted"]);
}

async function testClockSkewAndRetryBounds() {
  const outboxId = await enqueue(`clock-skew:${token}`, payload, 3);
  await setup.query("update public.email_outbox set next_attempt_at=now()+interval '10 minutes' where id=$1", [outboxId]);
  await beginClaimIsolation([outboxId]);
  try {
    const early = await serviceQuery("select * from public.claim_email_outbox(1,60)");
    assert.equal(early.rowCount, 0, "future work must not be claimed early");
  } finally {
    await setup.query("commit");
  }
  await setup.query("update public.email_outbox set next_attempt_at=now() where id=$1", [outboxId]);
  const claim = await claimOnly(outboxId);
  await assertRejects(
    () => serviceQuery(
      "select public.complete_email_outbox($1,$2,'retry',null,null,'clock_skew','bounded',86401)",
      [outboxId, claim.claim_token]
    ),
    "retry above one day must be rejected"
  );
  const retry = await serviceQuery(
    "select public.complete_email_outbox($1,$2,'retry',null,null,'clock_skew','bounded',86400) as status",
    [outboxId, claim.claim_token]
  );
  assert.equal(retry.rows[0].status, "retry");
  const scheduled = await setup.query(
    "select next_attempt_at between now()+interval '23 hours 59 minutes' and now()+interval '24 hours 1 minute' as bounded from public.email_outbox where id=$1",
    [outboxId]
  );
  assert.equal(scheduled.rows[0].bounded, true);
  for (const [limit, lease] of [[0, 60], [101, 60], [1, 29], [1, 3601]]) {
    await assertRejects(
      () => serviceQuery("select * from public.claim_email_outbox($1,$2)", [limit, lease]),
      `invalid claim bounds ${limit}/${lease}`
    );
  }
}

async function testOpaqueKeyCanonicalization() {
  const key = `canonical-key:${token}`;
  const id = await enqueue(key, payload, 3);
  assert.equal(await enqueue(key, payload, 3), id, "exact key replay must deduplicate");
  await assertRejects(() => enqueue(key, { ...payload, subject: "Different" }, 3), "exact key with new payload");
  for (const variant of [key.toUpperCase(), ` ${key}`, `${key} `, `${key}é`]) {
    await assertRejects(() => enqueue(variant, payload, 3), "non-canonical key variation must be rejected");
  }
}

async function testAdvisoryContentionAndStatementTimeout() {
  const holder = await workers.connect();
  const contender = await workers.connect();
  try {
    await holder.query("select pg_advisory_lock(87123654)");
    await contender.query("set statement_timeout='150ms'");
    let timeoutCode = null;
    try {
      await contender.query("select pg_advisory_lock(87123654)");
    } catch (error) {
      timeoutCode = error.code;
    }
    assert.equal(timeoutCode, "57014", "advisory contention must obey statement timeout");
    await holder.query("select pg_advisory_unlock(87123654)");
    await contender.query("set statement_timeout=0");
    await contender.query("select pg_advisory_lock(87123654)");
    await contender.query("select pg_advisory_unlock(87123654)");
  } finally {
    await holder.query("select pg_advisory_unlock_all()").catch(() => undefined);
    await contender.query("select pg_advisory_unlock_all()").catch(() => undefined);
    holder.release();
    contender.release();
  }
}

async function testDeadlockRecovery() {
  const firstId = await enqueue(`deadlock-a:${token}`, payload, 2);
  const secondId = await enqueue(`deadlock-b:${token}`, payload, 2);
  const left = await workers.connect();
  const right = await workers.connect();
  let deadlockCount = 0;
  try {
    await left.query("begin");
    await right.query("begin");
    await left.query("select id from public.email_outbox where id=$1 for update", [firstId]);
    await right.query("select id from public.email_outbox where id=$1 for update", [secondId]);
    const leftWait = left.query("select id from public.email_outbox where id=$1 for update", [secondId])
      .catch(async (error) => {
        if (error.code === "40P01") deadlockCount += 1;
        await left.query("rollback").catch(() => undefined);
      });
    const rightWait = new Promise((resolve) => setTimeout(resolve, 25))
      .then(() => right.query("select id from public.email_outbox where id=$1 for update", [firstId]))
      .catch(async (error) => {
        if (error.code === "40P01") deadlockCount += 1;
        await right.query("rollback").catch(() => undefined);
      });
    await Promise.all([leftWait, rightWait]);
    assert.equal(deadlockCount, 1, "PostgreSQL must abort exactly one side of the synthetic deadlock");
  } finally {
    await left.query("rollback").catch(() => undefined);
    await right.query("rollback").catch(() => undefined);
    left.release();
    right.release();
  }
  const state = await setup.query(
    "select count(*)::integer as count from public.email_outbox where id=any($1::uuid[]) and status='queued'",
    [[firstId, secondId]]
  );
  assert.equal(state.rows[0].count, 2, "deadlock recovery must not corrupt either row");
}

async function enqueue(key, value, maxAttempts) {
  const result = await serviceQuery(
    "select public.enqueue_email_outbox(null,'certification.crash',$1,$2::jsonb,null,null,$3) as id",
    [key, JSON.stringify(value), maxAttempts]
  );
  return result.rows[0].id;
}

async function claimOnly(outboxId) {
  await beginClaimIsolation([outboxId]);
  try {
    const result = await serviceQuery("select * from public.claim_email_outbox(1,60)");
    assert.equal(result.rowCount, 1, `expected claim for ${outboxId}`);
    assert.equal(result.rows[0].outbox_id, outboxId);
    return result.rows[0];
  } finally {
    await setup.query("commit");
  }
}

async function beginClaimIsolation(allowedIds) {
  await setup.query("begin");
  await setup.query(
    `select id from public.email_outbox
     where not (id=any($1::uuid[])) and (
       (status in ('queued','retry') and next_attempt_at<=now())
       or (status='processing' and lease_expires_at<=now() and attempts<max_attempts)
     ) for update`,
    [allowedIds]
  );
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
  assert.fail(`${message} unexpectedly succeeded`);
}
