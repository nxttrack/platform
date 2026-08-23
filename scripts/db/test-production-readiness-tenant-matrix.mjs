#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.TENANT_MATRIX_DATABASE_URL;
const apiUrl = process.env.TENANT_MATRIX_API_URL;
const anonKey = process.env.TENANT_MATRIX_ANON_KEY;
const serviceRoleKey = process.env.TENANT_MATRIX_SERVICE_ROLE_KEY;
const jwtSecret = process.env.TENANT_MATRIX_JWT_SECRET;
for (const [name, value] of Object.entries({ databaseUrl, apiUrl, anonKey, serviceRoleKey, jwtSecret })) {
  assert.ok(value, `${name} is required`);
}

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const roleNames = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor", "parent", "athlete"];
const users = [0, 1].flatMap((tenantIndex) =>
  roleNames.map((role, roleIndex) => ({
    id: `2${tenantIndex}${roleIndex}00000-0000-4000-8000-000000000001`,
    tenantId: tenantIndex === 0 ? tenantA : tenantB,
    role
  }))
);
const platformUsers = {
  platform_admin: "2f000000-0000-4000-8000-000000000001",
  platform_support: "2f000000-0000-4000-8000-000000000002"
};
const inactiveUser = "2e000000-0000-4000-8000-000000000001";
const staleUser = "2d000000-0000-4000-8000-000000000001";
const recordB = {
  tenant_onboarding_runs: "90000000-0000-4000-8000-000000000002",
  tenant_onboarding_events: "91000000-0000-4000-8000-000000000002",
  auth_invitations: "80000000-0000-4000-8000-000000000002",
  tenant_memberships: users.find((user) => user.tenantId === tenantB && user.role === "tenant_owner").id,
  email_outbox: null,
  email_outbox_events: null,
  participants: "40000000-0000-4000-8000-000000000002",
  participant_guardians: null,
  enrollments: "50000000-0000-4000-8000-000000000002",
  intake_submissions: "92000000-0000-4000-8000-000000000002",
  intake_answers: "93000000-0000-4000-8000-000000000002",
  group_memberships: "70000000-0000-4000-8000-000000000002",
  import_jobs: "a0000000-0000-4000-8000-000000000002",
  import_rows: "a1000000-0000-4000-8000-000000000002",
  import_manifest_entries: "a2000000-0000-4000-8000-000000000002",
  platform_admin_audit_events: "94000000-0000-4000-8000-000000000002"
};

const db = new pg.Client({ connectionString: databaseUrl });
try {
  await db.connect();
  await seedMatrixEvidence();
  await proveGrantBoundary();

  const tenantARoles = users.filter((user) => user.tenantId === tenantA);
  const crossTenantTables = Object.keys(recordB).filter((table) => recordB[table] !== null);
  let crossTenantChecks = 0;

  for (const user of tenantARoles) {
    const token = signAuthenticatedJwt(user.id);
    const ownContext = await rest("tenant_memberships", {
      token,
      query: `select=id&tenant_id=eq.${tenantA}&user_id=eq.${user.id}`
    });
    assert.equal(ownContext.status, 200, `${user.role} must have a controlled own-context response`);

    for (const table of crossTenantTables) {
      const identityFilter = table === "tenant_memberships"
        ? `tenant_id=eq.${tenantB}&user_id=eq.${recordB[table]}`
        : `tenant_id=eq.${tenantB}&id=eq.${recordB[table]}`;
      const response = await rest(table, {
        token,
        query: `select=id&${identityFilter}`,
        extraHeaders: {
          "x-forwarded-host": "tenant-a.synthetic.test",
          "x-tenant-id": tenantA
        }
      });
      assertControlledEmpty(response, `${user.role} read public.${table} in Tenant B`);
      crossTenantChecks += 1;
    }

    const storageResponse = await storageList(token, `${tenantB}/`);
    assertControlledEmpty(storageResponse, `${user.role} listed Tenant B storage prefix`);
    crossTenantChecks += 1;
  }

  for (const context of [
    { label: "anon", token: null },
    { label: "stale JWT", token: signAuthenticatedJwt(staleUser) },
    { label: "inactive membership", token: signAuthenticatedJwt(inactiveUser) }
  ]) {
    const response = await rest("participants", {
      token: context.token,
      query: `select=id&tenant_id=eq.${tenantA}&id=eq.40000000-0000-4000-8000-000000000001`
    });
    assertControlledEmpty(response, `${context.label} participant access`);
  }

  const missingJwt = await rest("import_manifest_entries", {
    token: null,
    query: `select=id&tenant_id=eq.${tenantB}`
  });
  assertControlledEmpty(missingJwt, "missing JWT import manifest access");

  for (const [role, userId] of Object.entries(platformUsers)) {
    const token = signAuthenticatedJwt(userId);
    const directWrite = await rest("participants", {
      token,
      method: "PATCH",
      query: `tenant_id=eq.${tenantB}&id=eq.${recordB.participants}`,
      body: { display_name: "forbidden-platform-direct-write" }
    });
    assertNoMutation(directWrite, `${role} direct Tenant B participant write`);
  }

  const ownerA = tenantARoles.find((user) => user.role === "tenant_owner");
  const ownerToken = signAuthenticatedJwt(ownerA.id);
  const outboxRead = await rest("email_outbox", {
    token: ownerToken,
    query: `select=id&tenant_id=eq.${tenantA}`
  });
  assertControlledEmpty(outboxRead, "authenticated outbox read is RLS-denied despite SELECT grant");
  for (const table of ["email_outbox", "import_jobs", "import_rows", "core_write_operations"]) {
    const response = await rest(table, {
      token: ownerToken,
      method: "PATCH",
      query: `tenant_id=eq.${tenantA}`,
      body: table === "import_jobs" ? { status: "completed" } : { updated_at: new Date().toISOString() }
    });
    assertNoMutation(response, `authenticated direct mutation of ${table}`);
  }

  const invitationCrossWrite = await rest("auth_invitations", {
    token: ownerToken,
    method: "PATCH",
    query: `tenant_id=eq.${tenantB}&id=eq.${recordB.auth_invitations}`,
    body: { delivery_status: "failed" }
  });
  assertNoMutation(invitationCrossWrite, "Tenant A invitation write in Tenant B");

  const wrongTenantFk = await rest("group_memberships", {
    token: ownerToken,
    method: "POST",
    body: {
      id: "95000000-0000-4000-8000-000000000001",
      tenant_id: tenantA,
      group_id: "60000000-0000-4000-8000-000000000002",
      enrollment_id: "50000000-0000-4000-8000-000000000002",
      participant_id: "40000000-0000-4000-8000-000000000002",
      status: "active",
      capacity_bucket: "regular"
    }
  });
  assert.ok(wrongTenantFk.status >= 400, "wrong-tenant composite FKs must fail explicitly");

  for (const token of [null, ...tenantARoles.map((user) => signAuthenticatedJwt(user.id))]) {
    const rpc = await rest("rpc/claim_email_outbox", {
      token,
      method: "POST",
      body: { target_limit: 1, target_lease_seconds: 60 }
    });
    assert.ok([401, 403, 404].includes(rpc.status), "client claim_email_outbox invocation must be denied by grants");

    const compatibilityRpc = await rest("rpc/runtime_schema_compatibility", {
      token,
      method: "POST",
      body: {}
    });
    assert.ok([401, 403, 404].includes(compatibilityRpc.status), "client runtime schema contract invocation must be denied by grants");
  }

  const manipulatedTenantRpcs = [
    {
      path: "rpc/create_participant_graph_atomic",
      body: {
        target_actor_user_id: ownerA.id,
        target_tenant_id: tenantB,
        target_idempotency_key: "tenant-matrix-forbidden-0001",
        target_request_fingerprint: "f".repeat(64),
        target_participant: { displayName: "Synthetic Forbidden" },
        target_enrollment: { programId: "30000000-0000-4000-8000-000000000002" }
      }
    },
    {
      path: "rpc/create_intake_submission_atomic",
      body: {
        target_tenant_id: tenantB,
        target_idempotency_key: "tenant-matrix-forbidden-0002",
        target_request_fingerprint: "e".repeat(64),
        target_dedupe_key: "d".repeat(64),
        target_submission: { selectedOption: "information_request" },
        target_answers: []
      }
    },
    {
      path: "rpc/place_group_membership_atomic",
      body: {
        target_actor_user_id: ownerA.id,
        target_tenant_id: tenantB,
        target_idempotency_key: "tenant-matrix-forbidden-0003",
        target_request_fingerprint: "c".repeat(64),
        target_group_id: "60000000-0000-4000-8000-000000000002",
        target_enrollment_id: "50000000-0000-4000-8000-000000000002",
        target_status: "active",
        target_capacity_bucket: "regular",
        target_capacity_weight: 1,
        target_starts_on: "2026-08-23"
      }
    }
  ];
  for (const rpcInput of manipulatedTenantRpcs) {
    const response = await rest(rpcInput.path, { token: ownerToken, method: "POST", body: rpcInput.body });
    assert.ok(response.status >= 400, `Tenant A client invocation of ${rpcInput.path} must fail explicitly`);
  }

  const serviceRead = await rest("participants", {
    service: true,
    query: `select=id&tenant_id=eq.${tenantB}&id=eq.${recordB.participants}`
  });
  assert.equal(serviceRead.status, 200);
  assert.equal(serviceRead.json.length, 1, "service-routed Data API path must reach the synthetic Tenant B row");

  const serviceClaim = await rest("rpc/claim_email_outbox", {
    service: true,
    method: "POST",
    body: { target_limit: 1, target_lease_seconds: 60 }
  });
  assert.equal(serviceClaim.status, 200, "service role must execute the outbox claim RPC");

  const serviceCompatibility = await rest("rpc/runtime_schema_compatibility", {
    service: true,
    method: "POST",
    body: {}
  });
  assert.equal(serviceCompatibility.status, 200, "service role must execute the runtime schema contract RPC");
  assert.equal(serviceCompatibility.json[0]?.contract_version, 3);

  const firstKeyUse = await rest("rpc/enqueue_email_outbox", {
    service: true,
    method: "POST",
    body: {
      target_tenant_id: tenantA,
      target_message_type: "invitation",
      target_idempotency_key: "tenant-matrix-payload-reuse",
      target_payload: { fixture: "first" },
      target_payload_reference_type: "auth_invitation",
      target_payload_reference_id: "80000000-0000-4000-8000-000000000001",
      target_max_attempts: 5
    }
  });
  assert.equal(firstKeyUse.status, 200);
  const conflictingKeyUse = await rest("rpc/enqueue_email_outbox", {
    service: true,
    method: "POST",
    body: {
      target_tenant_id: tenantA,
      target_message_type: "invitation",
      target_idempotency_key: "tenant-matrix-payload-reuse",
      target_payload: { fixture: "different" },
      target_payload_reference_type: "auth_invitation",
      target_payload_reference_id: "80000000-0000-4000-8000-000000000001",
      target_max_attempts: 5
    }
  });
  assert.ok(conflictingKeyUse.status >= 400, "same idempotency key with a different payload must fail explicitly");

  console.log(
    `[test:production-readiness-tenant-matrix] PASS ${crossTenantChecks} Tenant A→B table/storage attacks across six roles; anon/stale/inactive, platform no-write, grant-vs-RLS, wrong-FK, service-only RPC, service route and payload-key conflict.`
  );
} finally {
  await db.end().catch(() => undefined);
}

async function seedMatrixEvidence() {
  await db.query("begin");
  try {
    for (const [role, userId] of Object.entries(platformUsers)) {
      await db.query(
        `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, 'authenticated', 'authenticated', $2, '{}'::jsonb, '{}'::jsonb, now(), now())
         on conflict (id) do nothing`,
        [userId, `${role}@example.test`]
      );
      await db.query(
        "insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing",
        [userId, `${role}@example.test`, `Synthetic ${role}`]
      );
      await db.query(
        "insert into public.platform_memberships (user_id, role, status) values ($1, $2, 'active') on conflict (user_id,role) do update set status='active'",
        [userId, role]
      );
    }
    await db.query(
      `insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ($1, 'authenticated', 'authenticated', 'inactive-matrix@example.test', '{}'::jsonb, '{}'::jsonb, now(), now())
       on conflict (id) do nothing`,
      [inactiveUser]
    );
    await db.query(
      `insert into public.tenant_memberships (tenant_id, user_id, role, status)
       values ($1, $2, 'tenant_staff', 'suspended') on conflict (tenant_id,user_id,role) do update set status='suspended'`,
      [tenantA, inactiveUser]
    );

    for (let index = 0; index < 2; index += 1) {
      const tenantId = index === 0 ? tenantA : tenantB;
      const owner = users.find((user) => user.tenantId === tenantId && user.role === "tenant_owner");
      const runId = `90000000-0000-4000-8000-00000000000${index + 1}`;
      const invitationId = `80000000-0000-4000-8000-00000000000${index + 1}`;
      await db.query(
        `insert into public.tenant_onboarding_events (
          id, onboarding_run_id, tenant_id, actor_user_id, event_type, event_key, details
        ) values ($1, $2, $3, $4, 'requested', $5, '{"fixture":"matrix"}'::jsonb)
        on conflict (id) do nothing`,
        [`91000000-0000-4000-8000-00000000000${index + 1}`, runId, tenantId, owner.id, `matrix-requested-${index}`]
      );
      const outbox = await db.query(
        "select public.enqueue_email_outbox($1, 'invitation', $2, $3::jsonb, 'auth_invitation', $4, 5) as id",
        [tenantId, `matrix-seed-${index}`, JSON.stringify({ fixture: "matrix", tenant: index }), invitationId]
      );
      const outboxId = outbox.rows[0].id;
      const outboxEvent = await db.query(
        "select id from public.email_outbox_events where outbox_id=$1 order by created_at limit 1",
        [outboxId]
      );
      if (index === 1) {
        recordB.email_outbox = outboxId;
        recordB.email_outbox_events = outboxEvent.rows[0].id;
      }
      await db.query(
        `insert into public.intake_submissions (
          id, tenant_id, program_id, selected_option, parent_name, parent_email,
          participant_name, consent_given, source_hostname
        ) values ($1, $2, $3, 'information_request', $4, $5, $6, true, $7)
        on conflict (id) do nothing`,
        [
          `92000000-0000-4000-8000-00000000000${index + 1}`,
          tenantId,
          `30000000-0000-4000-8000-00000000000${index + 1}`,
          `Synthetic Parent ${index}`,
          `intake-${index}@example.test`,
          `Synthetic Child ${index}`,
          `tenant-${index}.synthetic.test`
        ]
      );
      await db.query(
        `insert into public.intake_answers (id, tenant_id, submission_id, field_key, answer_text)
         values ($1, $2, $3, 'matrix_fixture', 'synthetic') on conflict (id) do nothing`,
        [
          `93000000-0000-4000-8000-00000000000${index + 1}`,
          tenantId,
          `92000000-0000-4000-8000-00000000000${index + 1}`
        ]
      );
      await db.query(
        `insert into public.import_rows (
          id, tenant_id, import_job_id, row_number, source_data, normalized_data,
          validation_status, validation_errors, duplicate_key, target_table, target_id, apply_attempts, applied_at
        ) values ($1, $2, $3, 2, '{}'::jsonb, '{}'::jsonb, 'applied', '[]'::jsonb,
          $4, 'participants', $5, 1, now()) on conflict (id) do nothing`,
        [
          `a1000000-0000-4000-8000-00000000000${index + 1}`,
          tenantId,
          `a0000000-0000-4000-8000-00000000000${index + 1}`,
          `matrix:${index}`,
          `40000000-0000-4000-8000-00000000000${index + 1}`
        ]
      );
      await db.query(
        `insert into public.import_manifest_entries (
          id, tenant_id, import_job_id, import_row_id, record_type, target_table,
          target_id, created_by_import, apply_attempt, compensation_status
        ) values ($1, $2, $3, $4, 'participants', 'participants', $5, false, 1, 'pending')
        on conflict (id) do nothing`,
        [
          `a2000000-0000-4000-8000-00000000000${index + 1}`,
          tenantId,
          `a0000000-0000-4000-8000-00000000000${index + 1}`,
          `a1000000-0000-4000-8000-00000000000${index + 1}`,
          `40000000-0000-4000-8000-00000000000${index + 1}`
        ]
      );
      await db.query(
        `insert into public.platform_admin_audit_events (
          id, tenant_id, actor_user_id, event_type, subject_type, subject_id,
          before_state, after_state
        ) values ($1, $2, $3, 'platform.tenant_inspected', 'tenant', $2, '{}'::jsonb,
          '{"fixture":"matrix"}'::jsonb) on conflict (id) do nothing`,
        [`94000000-0000-4000-8000-00000000000${index + 1}`, tenantId, platformUsers.platform_admin]
      );
      await db.query(
        `insert into storage.objects (id, bucket_id, name, owner, owner_id, metadata)
         values ($1, 'tenant-documents', $2, $3::uuid, $3::text, '{"fixture":"matrix"}'::jsonb)
         on conflict (id) do nothing`,
        [
          `96000000-0000-4000-8000-00000000000${index + 1}`,
          `${tenantId}/matrix/document-${index}.txt`,
          owner.id
        ]
      );
    }
    const guardian = await db.query(
      "select id from public.participant_guardians where tenant_id=$1 and participant_id='40000000-0000-4000-8000-000000000002'",
      [tenantB]
    );
    assert.equal(guardian.rowCount, 1, "Tenant B guardian fixture is required");
    recordB.participant_guardians = guardian.rows[0].id;
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

async function proveGrantBoundary() {
  const result = await db.query(`
    select
      has_table_privilege('authenticated', 'public.email_outbox', 'select') as outbox_select,
      has_table_privilege('authenticated', 'public.email_outbox', 'update') as outbox_update,
      has_table_privilege('authenticated', 'public.import_jobs', 'update') as import_update,
      has_function_privilege('authenticated', 'public.claim_email_outbox(integer,integer)', 'execute') as client_claim,
      has_function_privilege('service_role', 'public.claim_email_outbox(integer,integer)', 'execute') as service_claim,
      has_function_privilege('authenticated', 'public.runtime_schema_compatibility()', 'execute') as client_compatibility,
      has_function_privilege('service_role', 'public.runtime_schema_compatibility()', 'execute') as service_compatibility
  `);
  assert.deepEqual(result.rows[0], {
    outbox_select: true,
    outbox_update: false,
    import_update: false,
    client_claim: false,
    service_claim: true,
    client_compatibility: false,
    service_compatibility: true
  });
}

async function rest(path, { token, service = false, method = "GET", query = "", body, extraHeaders = {} } = {}) {
  const key = service ? serviceRoleKey : anonKey;
  const response = await fetch(`${apiUrl}/rest/v1/${path}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${service ? serviceRoleKey : token ?? anonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return parseResponse(response);
}

async function storageList(token, prefix) {
  const response = await fetch(`${apiUrl}/storage/v1/object/list/tenant-documents`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token ?? anonKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ prefix, limit: 100, offset: 0 })
  });
  return parseResponse(response);
}

async function parseResponse(response) {
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

function assertControlledEmpty(response, label) {
  if (response.status === 200) {
    assert.ok(Array.isArray(response.json), `${label}: expected a JSON array`);
    assert.equal(response.json.length, 0, `${label}: returned a forbidden row`);
    return;
  }
  assert.ok([401, 403, 404].includes(response.status), `${label}: unexpected status ${response.status}`);
}

function assertNoMutation(response, label) {
  if (response.status === 200 || response.status === 204) {
    assert.ok(
      response.json === null || (Array.isArray(response.json) && response.json.length === 0),
      `${label}: silently mutated a forbidden row`
    );
    return;
  }
  assert.ok([400, 401, 403, 404, 409].includes(response.status), `${label}: unexpected status ${response.status}`);
}

function signAuthenticatedJwt(sub) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    aud: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    role: "authenticated",
    sub
  }));
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}
