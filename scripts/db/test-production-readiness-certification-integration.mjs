#!/usr/bin/env node

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.PRODUCTION_READINESS_CERTIFICATION_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const client = new pg.Client({ connectionString });
let savepointCounter = 0;

try {
  await client.connect();
  await client.query("begin");

  const actorId = randomUUID();
  const existingGuardianId = randomUUID();
  const crossTenantGuardianId = randomUUID();
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const token = randomUUID().slice(0, 8);

  await client.query(
    `insert into auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ($1, 'authenticated', 'authenticated', $4, '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($2, 'authenticated', 'authenticated', $5, '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($3, 'authenticated', 'authenticated', $6, '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [
      actorId,
      existingGuardianId,
      crossTenantGuardianId,
      `cert-actor-${token}@example.test`,
      `cert-existing-${token}@example.test`,
      `cert-cross-${token}@example.test`
    ]
  );
  await client.query(
    `insert into public.profiles (id, email, full_name) values
      ($1, $3, 'Existing Global Name'),
      ($2, $4, 'Cross Tenant Global Name')
     on conflict (id) do update set full_name = excluded.full_name`,
    [existingGuardianId, crossTenantGuardianId, `cert-existing-${token}@example.test`, `cert-cross-${token}@example.test`]
  );
  await client.query(
    "insert into public.tenants (id, slug, name, status) values ($1, $3, 'Certification A', 'active'), ($2, $4, 'Certification B', 'active')",
    [tenantA, tenantB, `cert-a-${token}`, `cert-b-${token}`]
  );
  await client.query(
    `insert into public.tenant_memberships (tenant_id, user_id, role, status) values
      ($1, $3, 'tenant_admin', 'active'),
      ($1, $4, 'parent', 'suspended'),
      ($2, $4, 'parent', 'active'),
      ($2, $5, 'parent', 'active')`,
    [tenantA, tenantB, actorId, existingGuardianId, crossTenantGuardianId]
  );
  const protectedJob = await createImportJob({ actorId, tenantId: tenantA, status: "applying", type: "guardians" });
  const existingInvitation = await createInvitation({
    actorId,
    email: `cert-existing-${token}@example.test`,
    fullName: "Attacker Supplied Name",
    jobId: protectedJob.jobId,
    rowId: protectedJob.rowId,
    tenantId: tenantA
  });
  await expectSqlError(
    "select public.materialize_import_guardian_invitation($1, $2, $3, $4, $5, false)",
    [actorId, tenantA, protectedJob.jobId, existingInvitation, existingGuardianId],
    /Import guardian membership already exists/
  );
  const existingState = await client.query(
    `select profile.full_name, membership.status, membership.invitation_id
     from public.profiles profile
     join public.tenant_memberships membership on membership.user_id = profile.id and membership.tenant_id = $2
     where profile.id = $1 and membership.role = 'parent'`,
    [existingGuardianId, tenantA]
  );
  assert.deepEqual(existingState.rows[0], {
    full_name: "Existing Global Name",
    invitation_id: null,
    status: "suspended"
  });

  const crossTenantJob = await createImportJob({ actorId, tenantId: tenantA, status: "applying", type: "guardians" });
  const crossTenantInvitation = await createInvitation({
    actorId,
    email: `cert-cross-${token}@example.test`,
    fullName: "Tenant A Must Not Rename",
    jobId: crossTenantJob.jobId,
    rowId: crossTenantJob.rowId,
    tenantId: tenantA
  });
  const materialized = await client.query(
    "select public.materialize_import_guardian_invitation($1, $2, $3, $4, $5, false) as result",
    [actorId, tenantA, crossTenantJob.jobId, crossTenantInvitation, crossTenantGuardianId]
  );
  assert.equal(materialized.rows[0].result.outcome, "ready");
  const crossTenantState = await client.query(
    `select profile.full_name, membership.status, membership.invitation_id
     from public.profiles profile
     join public.tenant_memberships membership on membership.user_id = profile.id and membership.tenant_id = $2
     where profile.id = $1 and membership.role = 'parent'`,
    [crossTenantGuardianId, tenantA]
  );
  assert.deepEqual(crossTenantState.rows[0], {
    full_name: "Cross Tenant Global Name",
    invitation_id: crossTenantInvitation,
    status: "invited"
  });

  const notificationId = randomUUID();
  await client.query(
    `insert into public.tenant_notifications (
      id, tenant_id, recipient_user_id, type, title, message
    ) values ($1, $2, $3, 'system', 'Certification', 'Provider evidence fixture')`,
    [notificationId, tenantA, actorId]
  );

  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [actorId]);
  await client.query("set local role authenticated");
  await expectSqlError(
    "update public.import_jobs set apply_attempts = 99, rollback_state = 'completed' where id = $1",
    [protectedJob.jobId],
    /permission denied/
  );
  await expectSqlError("delete from public.import_jobs where id = $1", [protectedJob.jobId], /permission denied/);
  await client.query(
    "update public.tenant_notifications set status = 'read', read_at = now() where id = $1",
    [notificationId]
  );
  await expectSqlError(
    "update public.tenant_notifications set provider_accepted_at = now() where id = $1",
    [notificationId],
    /Provider acceptance evidence is service-owned/
  );
  await client.query("reset role");

  const functionBoundary = await client.query(
    `select
      has_function_privilege('authenticated', 'public.rollback_import_chunk(uuid,uuid,uuid,uuid,integer)', 'execute') as authenticated,
      has_function_privilege('service_role', 'public.rollback_import_chunk(uuid,uuid,uuid,uuid,integer)', 'execute') as service_role`
  );
  assert.deepEqual(functionBoundary.rows[0], { authenticated: false, service_role: true });

  await testOwnedGuardianLinkRollback({ actorId, guardianId: crossTenantGuardianId, tenantId: tenantA });
  await testRollbackRefusesLaterData({ actorId, recipientId: actorId, tenantId: tenantA });

  console.log(
    "[test:production-readiness-certification:db] PASS service-only import state, immutable provider acceptance, cross-tenant profile preservation, create-only membership, owned-child rollback, and later-data rollback refusal."
  );
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
}

async function createImportJob({ actorId, tenantId, status, type }) {
  const jobId = randomUUID();
  const rowId = randomUUID();
  await client.query(
    `insert into public.import_jobs (
      id, tenant_id, import_type, source_name, status, row_count, valid_count, created_by_user_id
    ) values ($1, $2, $3, $4, $5, 1, 1, $6)`,
    [jobId, tenantId, type, `cert-${jobId}.csv`, status, actorId]
  );
  await client.query(
    `insert into public.import_rows (
      id, tenant_id, import_job_id, row_number, source_data, normalized_data,
      validation_status, validation_errors, duplicate_key
    ) values ($1, $2, $3, 2, '{}'::jsonb, $4::jsonb, 'applied', '[]'::jsonb, $5)`,
    [rowId, tenantId, jobId, JSON.stringify({ record_type: type }), `cert:${rowId}`]
  );
  return { jobId, rowId };
}

async function createInvitation({ actorId, email, fullName, jobId, rowId, tenantId }) {
  const invitationId = randomUUID();
  await client.query(
    `insert into public.auth_invitations (
      id, email, tenant_id, role, invited_by_user_id, status, delivery_status,
      expires_at, code_hash, invitee_name, identity_status, import_job_id, import_row_id
    ) values ($1, $2, $3, 'parent', $4, 'pending', 'pending', now() + interval '2 days', $5, $6, 'pending', $7, $8)`,
    [invitationId, email, tenantId, actorId, "a".repeat(64), fullName, jobId, rowId]
  );
  return invitationId;
}

async function testOwnedGuardianLinkRollback({ actorId, guardianId, tenantId }) {
  const fixture = await createImportJob({ actorId, tenantId, status: "completed", type: "participants" });
  const participantId = randomUUID();
  const guardianLinkId = randomUUID();
  await client.query(
    `insert into public.participants (id, tenant_id, guardian_user_id, display_name, status, source)
     values ($1, $2, $3, 'Owned rollback participant', 'active', 'import')`,
    [participantId, tenantId, guardianId]
  );
  await client.query(
    `insert into public.participant_guardians (id, tenant_id, participant_id, guardian_user_id)
     values ($1, $2, $3, $4)`,
    [guardianLinkId, tenantId, participantId, guardianId]
  );
  await client.query(
    `insert into public.import_manifest_entries (
      tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
    ) values ($1, $2, $3, 'participants', 'participants', $4, 1)`,
    [tenantId, fixture.jobId, fixture.rowId, participantId]
  );
  const captured = await client.query(
    "select target_id from public.import_manifest_entries where import_job_id = $1 and target_table = 'participant_guardians'",
    [fixture.jobId]
  );
  assert.equal(captured.rows[0]?.target_id, guardianLinkId);
  const claim = await client.query(
    "select public.claim_import_rollback($1, $2, $3, 300) as result",
    [actorId, tenantId, fixture.jobId]
  );
  const claimToken = claim.rows[0].result.claimToken;
  const childChunk = await client.query(
    "select public.rollback_import_chunk($1, $2, $3, $4, 250) as result",
    [actorId, tenantId, fixture.jobId, claimToken]
  );
  assert.equal(childChunk.rows[0].result.processed, 1);
  const parentChunk = await client.query(
    "select public.rollback_import_chunk($1, $2, $3, $4, 250) as result",
    [actorId, tenantId, fixture.jobId, claimToken]
  );
  assert.equal(parentChunk.rows[0].result.done, true);
  await client.query("select public.complete_import_rollback($1, $2, $3, $4)", [actorId, tenantId, fixture.jobId, claimToken]);
  const remaining = await client.query(
    `select
      (select count(*)::integer from public.participants where id = $1) as participant,
      (select count(*)::integer from public.participant_guardians where id = $2) as guardian_link`,
    [participantId, guardianLinkId]
  );
  assert.deepEqual(remaining.rows[0], { guardian_link: 0, participant: 0 });
}

async function testRollbackRefusesLaterData({ actorId, recipientId, tenantId }) {
  const fixture = await createImportJob({ actorId, tenantId, status: "completed", type: "participants" });
  const participantId = randomUUID();
  const laterNotificationId = randomUUID();
  await client.query(
    `insert into public.participants (id, tenant_id, display_name, status, source)
     values ($1, $2, 'Referenced rollback participant', 'active', 'import')`,
    [participantId, tenantId]
  );
  await client.query(
    `insert into public.import_manifest_entries (
      tenant_id, import_job_id, import_row_id, record_type, target_table, target_id, apply_attempt
    ) values ($1, $2, $3, 'participants', 'participants', $4, 1)`,
    [tenantId, fixture.jobId, fixture.rowId, participantId]
  );
  await client.query(
    `insert into public.tenant_notifications (
      id, tenant_id, recipient_user_id, participant_id, type, title, message
    ) values ($1, $2, $3, $4, 'system', 'Later data', 'Must survive rollback')`,
    [laterNotificationId, tenantId, recipientId, participantId]
  );
  const claim = await client.query(
    "select public.claim_import_rollback($1, $2, $3, 300) as result",
    [actorId, tenantId, fixture.jobId]
  );
  const result = await client.query(
    "select public.rollback_import_chunk($1, $2, $3, $4, 250) as result",
    [actorId, tenantId, fixture.jobId, claim.rows[0].result.claimToken]
  );
  assert.equal(result.rows[0].result.outcome, "needs_attention");
  const preserved = await client.query(
    `select
      exists(select 1 from public.participants where id = $1) as participant,
      exists(select 1 from public.tenant_notifications where id = $2) as later_notification`,
    [participantId, laterNotificationId]
  );
  assert.deepEqual(preserved.rows[0], { later_notification: true, participant: true });
}

async function expectSqlError(sql, parameters, messagePattern) {
  const savepoint = `certification_expected_error_${++savepointCounter}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await client.query(sql, parameters);
  } catch (error) {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
    assert.match(error instanceof Error ? error.message : String(error), messagePattern);
    return;
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert.fail(`Expected SQL error matching ${messagePattern}`);
}
