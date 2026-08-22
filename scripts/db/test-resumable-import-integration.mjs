#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.RESUMABLE_IMPORT_TEST_DATABASE_URL ??
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const workers = new pg.Pool({ connectionString, max: 6 });
const token = randomUUID().slice(0, 8);
const tenantId = randomUUID();
const actorId = randomUUID();
const guardianUserId = randomUUID();
const programId = randomUUID();

try {
  await setup.connect();
  await createFixture();
  await assertServiceOnlyBoundary();
  await testBatchedValidationWithErrorsAndDuplicate();
  await testValidAndDoubleApply();
  await testGuardianOutboxAndMaterialization();
  await testChunkFailureResumeAndRollbackFailure();
  await testFiveThousandRowsInTwentyChunks();
  console.log(
    "[test:resumable-import:db] PASS batched mixed validation, duplicate rows, valid/double apply, transactional blocked guardian outbox, mid-chunk rollback+resume, durable rollback failure+retry, and 5,000 rows in 20 RPC chunks."
  );
} finally {
  await Promise.allSettled([workers.end(), setup.end()]);
}

async function createFixture() {
  await setup.query(
    `insert into auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ($1, 'authenticated', 'authenticated', $3, '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($2, 'authenticated', 'authenticated', $4, '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [actorId, guardianUserId, `import-actor-${token}@example.test`, `import-guardian-${token}@example.test`]
  );
  await setup.query(
    "insert into public.tenants (id, slug, name, status) values ($1, $2, $3, 'active')",
    [tenantId, `import-${token}`, `Import ${token}`]
  );
  await setup.query(
    "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, 'tenant_admin', 'active')",
    [tenantId, actorId]
  );
  await setup.query(
    "insert into public.programs (id, tenant_id, name, code, status) values ($1, $2, 'Import program', $3, 'active')",
    [programId, tenantId, `IMP-${token}`]
  );
}

async function testBatchedValidationWithErrorsAndDuplicate() {
  const jobId = await createJob("mixed", "mapping", [
    participantData("validation-valid", "VAL-1"),
    participantData("validation-invalid", "VAL-2"),
    participantData("validation-duplicate", "VAL-1")
  ], "pending");
  const rows = await importRows(jobId);
  const updates = [
    validationUpdate(rows[0], "valid", [], "p:VAL-1"),
    validationUpdate(rows[1], "invalid", ["Geboortedatum is ongeldig"], "p:VAL-2"),
    validationUpdate(rows[2], "duplicate", [], "p:VAL-1")
  ];
  const updated = await serviceQuery(
    "select public.update_import_validation_chunk($1, $2, $3, $4::jsonb) as count",
    [actorId, tenantId, jobId, JSON.stringify(updates)]
  );
  assertEqual(updated.rows[0]?.count, 3, "validation chunk updates all rows in one RPC");
  const report = { checkedAt: new Date().toISOString(), valid: 1, invalid: 1, duplicates: 1, total: 3 };
  const completed = await serviceQuery(
    "select public.complete_import_validation($1, $2, $3, $4::jsonb) as result",
    [actorId, tenantId, jobId, JSON.stringify(report)]
  );
  assertEqual(completed.rows[0]?.result?.valid, 1, "validation valid count");
  assertEqual(completed.rows[0]?.result?.invalid, 1, "validation invalid count");
  assertEqual(completed.rows[0]?.result?.duplicates, 1, "validation duplicate count");
}

async function testValidAndDoubleApply() {
  const jobId = await createJob("participants", "ready", [
    participantData("valid-one", `VALID-${token}-1`),
    participantData("valid-two", `VALID-${token}-2`),
    participantData("valid-three", `VALID-${token}-3`)
  ]);
  const claim = await claimApply(jobId);
  const rows = await importRows(jobId);
  const applied = await applyRows(jobId, claim.claimToken, rows);
  assertEqual(applied.outcome, "applied", "valid participant chunk applies");
  assertEqual(applied.processed, 3, "valid participant chunk count");
  const completed = await completeApply(jobId, claim.claimToken);
  assertEqual(completed.outcome, "completed", "valid import completes");

  const graph = await setup.query(
    `select
      (select count(*)::integer from public.participants where tenant_id = $1 and external_reference like $2) as participants,
      (select count(*)::integer from public.import_manifest_entries where tenant_id = $1 and import_job_id = $3 and target_table = 'participants') as manifest,
      (select count(*)::integer from public.import_rows where tenant_id = $1 and import_job_id = $3 and validation_status = 'applied') as rows`,
    [tenantId, `VALID-${token}-%`, jobId]
  );
  assertEqual(graph.rows[0]?.participants, 3, "valid import participant count");
  assertEqual(graph.rows[0]?.manifest, 3, "valid import manifest count");
  assertEqual(graph.rows[0]?.rows, 3, "valid import applied rows");

  const replayClaim = await claimApply(jobId);
  assertEqual(replayClaim.outcome, "completed", "double apply returns completed");
  assertEqual(replayClaim.idempotentReplay, true, "double apply is an explicit replay");
  const replayGraph = await setup.query(
    "select count(*)::integer as count from public.participants where tenant_id = $1 and external_reference like $2",
    [tenantId, `VALID-${token}-%`]
  );
  assertEqual(replayGraph.rows[0]?.count, 3, "double apply creates no duplicates");
}

async function testGuardianOutboxAndMaterialization() {
  const email = `guardian-import-${token}@example.test`;
  const jobId = await createJob("guardians", "ready", [{
    record_type: "guardians", full_name: "Import Guardian", email
  }]);
  const claim = await claimApply(jobId);
  const rows = await importRows(jobId);
  const command = {
    rowId: rows[0].id,
    invitation: {
      codeHash: sha256(`code:${email}`), email,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString(),
      message: {
        html: "<p>Database-only import invitation test.</p>",
        organizationName: `Import ${token}`,
        subject: "Import invitation",
        templateKey: "auth_invitation",
        text: "Database-only import invitation test. No provider is invoked."
      }
    }
  };
  const chunk = await applyRows(jobId, claim.claimToken, rows, null, [command]);
  assertEqual(chunk.outcome, "applied", "guardian chunk applies");
  const invitationId = chunk.invitations[0]?.invitationId;
  const blocked = await setup.query(
    `select invitation.identity_status, invitation.invited_user_id,
      outbox.status as outbox_status, outbox.next_attempt_at > now() + interval '50 years' as blocked
     from public.auth_invitations invitation
     join public.email_outbox outbox on outbox.payload_reference_id = invitation.id and outbox.payload_reference_type = 'auth_invitation'
     where invitation.id = $1`,
    [invitationId]
  );
  assertEqual(blocked.rows[0]?.identity_status, "pending", "guardian identity starts pending");
  assertEqual(blocked.rows[0]?.invited_user_id, null, "Auth identity is post-commit");
  assertEqual(blocked.rows[0]?.outbox_status, "queued", "guardian mail is durable");
  assertEqual(blocked.rows[0]?.blocked, true, "guardian mail is blocked before identity and job completion");

  const materialized = await serviceQuery(
    "select public.materialize_import_guardian_invitation($1, $2, $3, $4, $5, true) as result",
    [actorId, tenantId, jobId, invitationId, guardianUserId]
  );
  assertEqual(materialized.rows[0]?.result?.outcome, "ready", "guardian identity materializes");
  const stillBlocked = await setup.query(
    "select next_attempt_at > now() + interval '50 years' as blocked from public.email_outbox where payload_reference_id = $1",
    [invitationId]
  );
  assertEqual(stillBlocked.rows[0]?.blocked, true, "identity alone does not release mail");

  await completeApply(jobId, claim.claimToken);
  const ready = await setup.query(
    `select invitation.identity_status, membership.status as membership_status,
      outbox.next_attempt_at <= now() + interval '5 seconds' as released
     from public.auth_invitations invitation
     join public.tenant_memberships membership on membership.invitation_id = invitation.id
     join public.email_outbox outbox on outbox.payload_reference_id = invitation.id
     where invitation.id = $1`,
    [invitationId]
  );
  assertEqual(ready.rows[0]?.identity_status, "ready", "guardian invitation identity ready");
  assertEqual(ready.rows[0]?.membership_status, "invited", "guardian membership is non-active until acceptance");
  assertEqual(ready.rows[0]?.released, true, "job completion releases guardian mail");

  const rollbackClaim = await claimRollback(jobId);
  const guardianRollback = await rollbackChunk(jobId, rollbackClaim.claimToken);
  assertEqual(guardianRollback.done, true, "guardian rollback compensates complete manifest");
  await completeRollback(jobId, rollbackClaim.claimToken);
  const rolledBack = await setup.query(
    `select invitation.status, outbox.status as outbox_status,
      (select count(*)::integer from public.tenant_memberships where invitation_id = $1) as memberships,
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $2) as manifest_entries
     from public.auth_invitations invitation
     join public.email_outbox outbox on outbox.payload_reference_id = invitation.id
     where invitation.id = $1`,
    [invitationId, jobId]
  );
  assertEqual(rolledBack.rows[0]?.status, "revoked", "guardian invitation is revoked");
  assertEqual(rolledBack.rows[0]?.outbox_status, "cancelled", "guardian outbox is cancelled");
  assertEqual(rolledBack.rows[0]?.memberships, 0, "import-created guardian membership is removed");
  assertEqual(rolledBack.rows[0]?.manifest_entries, 3, "guardian manifest remains after rollback");
}

async function testChunkFailureResumeAndRollbackFailure() {
  const prefix = `RESUME-${token}`;
  const jobId = await createJob("participants", "ready", Array.from({ length: 4 }, (_, index) =>
    participantData(`resume-${index + 1}`, `${prefix}-${index + 1}`)
  ));
  const rows = await importRows(jobId);
  const firstClaim = await claimApply(jobId);
  await applyRows(jobId, firstClaim.claimToken, rows.slice(0, 2));
  const failed = await applyRows(jobId, firstClaim.claimToken, rows.slice(2), `row:${rows[3].row_number}`);
  assertEqual(failed.outcome, "needs_attention", "middle chunk failure is controlled");
  const partial = await setup.query(
    `select
      (select count(*)::integer from public.participants where tenant_id = $1 and external_reference like $2) as participants,
      (select count(*)::integer from public.import_manifest_entries where tenant_id = $1 and import_job_id = $3) as manifest,
      (select count(*)::integer from public.import_rows where tenant_id = $1 and import_job_id = $3 and validation_status = 'valid') as remaining,
      (select reconciliation_state from public.import_jobs where id = $3) as reconciliation`,
    [tenantId, `${prefix}-%`, jobId]
  );
  assertEqual(partial.rows[0]?.participants, 2, "committed prior chunk remains");
  assertEqual(partial.rows[0]?.manifest, 2, "prior chunk manifest remains");
  assertEqual(partial.rows[0]?.remaining, 2, "failed chunk rolls every row back to valid");
  assertEqual(partial.rows[0]?.reconciliation, "needs_attention", "failure is visible");

  const retryClaim = await claimApply(jobId);
  assertEqual(retryClaim.idempotentReplay, true, "apply retry reuses deterministic job key");
  await applyRows(jobId, retryClaim.claimToken, rows.slice(2));
  await completeApply(jobId, retryClaim.claimToken);
  const resumed = await setup.query(
    "select count(*)::integer as count from public.participants where tenant_id = $1 and external_reference like $2",
    [tenantId, `${prefix}-%`]
  );
  assertEqual(resumed.rows[0]?.count, 4, "retry completes without duplicate prior rows");

  const rollbackClaim = await claimRollback(jobId);
  const rollbackFailed = await rollbackChunk(jobId, rollbackClaim.claimToken, "participants");
  assertEqual(rollbackFailed.outcome, "needs_attention", "rollback failure is controlled");
  const retained = await setup.query(
    `select
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $1) as manifest,
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $1 and compensation_status = 'failed') as failed_entries,
      (select rollback_state from public.import_jobs where id = $1) as rollback_state`,
    [jobId]
  );
  assertEqual(retained.rows[0]?.manifest, 4, "rollback failure never clears manifest");
  assertEqual(retained.rows[0]?.failed_entries, 1, "failed compensation is retained");
  assertEqual(retained.rows[0]?.rollback_state, "needs_attention", "rollback attention is visible");

  const rollbackRetry = await claimRollback(jobId);
  const compensated = await rollbackChunk(jobId, rollbackRetry.claimToken);
  assertEqual(compensated.done, true, "rollback retry finishes all entries");
  await completeRollback(jobId, rollbackRetry.claimToken);
  const final = await setup.query(
    `select
      (select count(*)::integer from public.participants where tenant_id = $1 and external_reference like $2) as participants,
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $3 and compensation_status = 'compensated') as compensated,
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $3) as manifest,
      (select count(*)::integer from public.import_rows where import_job_id = $3 and validation_status = 'rolled_back') as rows`,
    [tenantId, `${prefix}-%`, jobId]
  );
  assertEqual(final.rows[0]?.participants, 0, "rollback retry removes import-created participants");
  assertEqual(final.rows[0]?.compensated, 4, "all manifest entries are compensated");
  assertEqual(final.rows[0]?.manifest, 4, "manifest remains durable after successful rollback");
  assertEqual(final.rows[0]?.rows, 4, "all rows record rolled_back state");
  const rollbackReplay = await claimRollback(jobId);
  assertEqual(rollbackReplay.outcome, "completed", "double rollback is idempotent");
}

async function testFiveThousandRowsInTwentyChunks() {
  const jobId = randomUUID();
  const prefix = `BULK-${token}`;
  await setup.query(
    `insert into public.import_jobs (
      id, tenant_id, import_type, source_name, status, row_count, valid_count, created_by_user_id
    ) values ($1, $2, 'participants', 'bulk-5000.csv', 'ready', 5000, 5000, $3)`,
    [jobId, tenantId, actorId]
  );
  await setup.query(
    `insert into public.import_rows (
      tenant_id, import_job_id, row_number, source_data, normalized_data,
      validation_status, validation_errors, duplicate_key
    )
    select $1, $2, sequence + 1,
      jsonb_build_object('display_name', 'Bulk ' || sequence, 'external_reference', $3 || '-' || sequence),
      jsonb_build_object('record_type', 'participants', 'display_name', 'Bulk ' || sequence,
        'birth_date', '2018-06-15', 'external_reference', $3 || '-' || sequence, 'guardian_email', ''),
      'valid', '[]'::jsonb, 'p:' || $3 || '-' || sequence
    from generate_series(1, 5000) sequence`,
    [tenantId, jobId, prefix]
  );
  const claim = await claimApply(jobId);
  const rows = await importRows(jobId);
  let rpcChunks = 0;
  for (let index = 0; index < rows.length; index += 250) {
    const result = await applyRows(jobId, claim.claimToken, rows.slice(index, index + 250));
    assertEqual(result.processed, 250, `bulk chunk ${rpcChunks + 1} size`);
    rpcChunks += 1;
  }
  assertEqual(rpcChunks, 20, "5,000 rows require exactly twenty apply RPCs");
  await completeApply(jobId, claim.claimToken);
  const final = await setup.query(
    `select
      (select count(*)::integer from public.participants where tenant_id = $1 and external_reference like $2) as participants,
      (select count(*)::integer from public.import_manifest_entries where import_job_id = $3) as manifest,
      (select status from public.import_jobs where id = $3) as status`,
    [tenantId, `${prefix}-%`, jobId]
  );
  assertEqual(final.rows[0]?.participants, 5000, "bulk participant count");
  assertEqual(final.rows[0]?.manifest, 5000, "bulk durable manifest count");
  assertEqual(final.rows[0]?.status, "completed", "bulk job completes");
}

async function createJob(importType, status, dataRows, rowStatus = "valid") {
  const jobId = randomUUID();
  await setup.query(
    `insert into public.import_jobs (
      id, tenant_id, import_type, source_name, status, row_count, valid_count, created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [jobId, tenantId, importType, `${importType}-${randomUUID()}.csv`, status, dataRows.length, rowStatus === "valid" ? dataRows.length : 0, actorId]
  );
  for (let index = 0; index < dataRows.length; index += 1) {
    await setup.query(
      `insert into public.import_rows (
        tenant_id, import_job_id, row_number, source_data, normalized_data,
        validation_status, validation_errors, duplicate_key
      ) values ($1, $2, $3, $4::jsonb, $4::jsonb, $5, '[]'::jsonb, $6)`,
      [tenantId, jobId, index + 2, JSON.stringify(dataRows[index]), rowStatus, `fixture:${jobId}:${index}`]
    );
  }
  return jobId;
}

function participantData(label, reference) {
  return {
    record_type: "participants", display_name: `Import ${label}`,
    birth_date: "2018-06-15", external_reference: reference, guardian_email: ""
  };
}

function validationUpdate(row, status, errors, duplicateKey) {
  return { rowId: row.id, normalizedData: row.normalized_data, status, errors, duplicateKey };
}

async function importRows(jobId) {
  const result = await setup.query(
    "select id, row_number, normalized_data, validation_status from public.import_rows where tenant_id = $1 and import_job_id = $2 order by row_number",
    [tenantId, jobId]
  );
  return result.rows;
}

async function claimApply(jobId) {
  const result = await serviceQuery(
    "select public.claim_import_apply($1, $2, $3, $4, 300) as result",
    [actorId, tenantId, jobId, sha256(`import-apply:v1:${tenantId}:${jobId}`)]
  );
  return result.rows[0]?.result;
}

async function applyRows(jobId, claimToken, rows, failureMarker = null, explicitCommands = null) {
  const commands = explicitCommands ?? rows.map((row) => ({ rowId: row.id }));
  const result = await serviceQuery(
    "select public.apply_import_chunk($1, $2, $3, $4, $5::jsonb) as result",
    [actorId, tenantId, jobId, claimToken, JSON.stringify(commands)],
    failureMarker ? { "nxttrack.test_import_failure": failureMarker } : {}
  );
  return result.rows[0]?.result;
}

async function completeApply(jobId, claimToken) {
  const result = await serviceQuery(
    "select public.complete_import_apply($1, $2, $3, $4) as result",
    [actorId, tenantId, jobId, claimToken]
  );
  return result.rows[0]?.result;
}

async function claimRollback(jobId) {
  const result = await serviceQuery(
    "select public.claim_import_rollback($1, $2, $3, 300) as result",
    [actorId, tenantId, jobId]
  );
  return result.rows[0]?.result;
}

async function rollbackChunk(jobId, claimToken, failureMarker = null) {
  const result = await serviceQuery(
    "select public.rollback_import_chunk($1, $2, $3, $4, 250) as result",
    [actorId, tenantId, jobId, claimToken],
    failureMarker ? { "nxttrack.test_import_rollback_failure": failureMarker } : {}
  );
  return result.rows[0]?.result;
}

async function completeRollback(jobId, claimToken) {
  const result = await serviceQuery(
    "select public.complete_import_rollback($1, $2, $3, $4) as result",
    [actorId, tenantId, jobId, claimToken]
  );
  return result.rows[0]?.result;
}

async function assertServiceOnlyBoundary() {
  const result = await setup.query(
    `select
      has_function_privilege('anon', 'public.claim_import_apply(uuid,uuid,uuid,text,integer)', 'execute') as anon_claim,
      has_function_privilege('authenticated', 'public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb)', 'execute') as authenticated_apply,
      has_function_privilege('authenticated', 'public.rollback_import_chunk(uuid,uuid,uuid,uuid,integer)', 'execute') as authenticated_rollback,
      has_function_privilege('service_role', 'public.claim_import_apply(uuid,uuid,uuid,text,integer)', 'execute') as service_claim,
      has_function_privilege('service_role', 'public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb)', 'execute') as service_apply,
      has_function_privilege('service_role', 'public.rollback_import_chunk(uuid,uuid,uuid,uuid,integer)', 'execute') as service_rollback`
  );
  assertEqual(result.rows[0]?.anon_claim, false, "anon import claim denied");
  assertEqual(result.rows[0]?.authenticated_apply, false, "authenticated import apply denied");
  assertEqual(result.rows[0]?.authenticated_rollback, false, "authenticated import rollback denied");
  assertEqual(result.rows[0]?.service_claim, true, "service import claim granted");
  assertEqual(result.rows[0]?.service_apply, true, "service import apply granted");
  assertEqual(result.rows[0]?.service_rollback, true, "service import rollback granted");

  let crossTenantDenied = false;
  try {
    await serviceQuery(
      "select public.claim_import_apply($1, $2, $3, $4, 300)",
      [actorId, randomUUID(), randomUUID(), sha256(`cross-tenant:${token}`)]
    );
  } catch (error) {
    crossTenantDenied = error instanceof Error && error.message.includes("Tenant administrator required");
  }
  assertEqual(crossTenantDenied, true, "service boundary rejects a cross-tenant actor claim");
}

async function serviceQuery(text, values = [], settings = {}) {
  const client = await workers.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    for (const [name, value] of Object.entries(settings)) {
      await client.query("select set_config($1, $2, true)", [name, value]);
    }
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
