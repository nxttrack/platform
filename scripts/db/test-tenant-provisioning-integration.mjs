#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.TENANT_PROVISIONING_TEST_DATABASE_URL ??
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const workers = new pg.Pool({ connectionString, max: 20 });
const actorId = randomUUID();
const staffUserId = randomUUID();
const runToken = randomUUID().slice(0, 8);

try {
  await setup.connect();
  await setup.query(
    `insert into auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ($1, 'authenticated', 'authenticated', $3, '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($2, 'authenticated', 'authenticated', $4, '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [actorId, staffUserId, `provision-actor-${runToken}@example.test`, `provision-staff-${runToken}@example.test`]
  );
  await setup.query(
    "insert into public.platform_memberships (user_id, role, status) values ($1, 'platform_admin', 'active')",
    [actorId]
  );
  await assertServiceOnlyBoundary();

  for (const step of ["organization", "identity", "program", "operations", "billing", "invitations", "opening"]) {
    const fixture = provisioningFixture(`${runToken}-${step}`);
    const failed = await serviceProvision(fixture, step);
    assertEqual(failed.outcome, "attention_required", `${step} injection must return attention_required`);
    assertEqual(failed.tenantId, null, `${step} injection must not retain a tenant id`);

    const graph = await setup.query(
      `select
        (select count(*)::integer from public.tenants where slug = $1) as tenants,
        (select count(*)::integer from public.auth_invitations where provisioning_run_id = $2) as invitations,
        (select count(*)::integer from public.tenant_onboarding_events where onboarding_run_id = $2 and event_type = 'database_attention') as attention_events`,
      [fixture.payload.slug, failed.runId]
    );
    assertEqual(graph.rows[0]?.tenants, 0, `${step} injection must roll back the tenant graph`);
    assertEqual(graph.rows[0]?.invitations, 0, `${step} injection must roll back invitations`);
    assertEqual(graph.rows[0]?.attention_events, 1, `${step} injection must leave one durable attention event`);

    if (step === "opening") {
      const resumed = await serviceProvision(fixture);
      assertEqual(resumed.runId, failed.runId, "database retry must reuse the failed run");
      assertEqual(resumed.outcome, "ready", "database retry must safely rebuild the complete graph");
      const resumedState = await setup.query(
        `select
          provisioning_attempts,
          (select count(*)::integer from public.tenants where slug = $2) as tenants,
          (select count(*)::integer from public.tenant_onboarding_events where onboarding_run_id = $1 and event_type = 'requested') as requested_events
         from public.tenant_onboarding_runs where id = $1`,
        [failed.runId, fixture.payload.slug]
      );
      assertEqual(resumedState.rows[0]?.provisioning_attempts, 2, "database retry attempt count");
      assertEqual(resumedState.rows[0]?.tenants, 1, "database retry must create one tenant");
      assertEqual(resumedState.rows[0]?.requested_events, 2, "database retry must retain both request events");
    }
  }

  const fixture = provisioningFixture(`${runToken}-parallel`);
  const parallel = await Promise.all(
    Array.from({ length: 20 }, () => serviceProvision(fixture))
  );
  const tenantIds = new Set(parallel.map((result) => result.tenantId));
  const runIds = new Set(parallel.map((result) => result.runId));
  assertEqual(tenantIds.size, 1, "twenty duplicate submits must return one tenant");
  assertEqual(runIds.size, 1, "twenty duplicate submits must return one onboarding run");
  assertEqual(parallel.filter((result) => result.idempotentReplay === false).length, 1, "exactly one submit must create the graph");
  const tenantId = [...tenantIds][0];
  const runId = [...runIds][0];

  const graph = await setup.query(
    `select
      (select count(*)::integer from public.tenants where id = $1 and status = 'inactive') as tenants,
      (select count(*)::integer from public.tenant_settings where tenant_id = $1) as settings,
      (select count(*)::integer from public.tenant_domains where tenant_id = $1) as domains,
      (select count(*)::integer from public.tenant_branding where tenant_id = $1) as branding,
      (select count(*)::integer from public.programs where tenant_id = $1) as programs,
      (select count(*)::integer from public.program_stages where tenant_id = $1) as stages,
      (select count(*)::integer from public.resources where tenant_id = $1) as resources,
      (select count(*)::integer from public.groups where tenant_id = $1) as groups,
      (select count(*)::integer from public.payment_plans where tenant_id = $1) as plans,
      (select count(*)::integer from public.tenant_portal_theme_assignment where tenant_id = $1 and deactivated_at is null) as themes,
      (select count(*)::integer from public.auth_invitations where provisioning_run_id = $2) as invitations,
      (select count(*)::integer from public.email_outbox where tenant_id = $1 and payload_reference_type = 'auth_invitation') as outbox,
      (select count(*)::integer from public.email_outbox where tenant_id = $1 and next_attempt_at > now() + interval '50 years') as blocked_outbox`,
    [tenantId, runId]
  );
  for (const [key, expected] of Object.entries({
    tenants: 1,
    settings: 1,
    domains: 1,
    branding: 1,
    programs: 1,
    stages: 3,
    resources: 2,
    groups: 1,
    plans: 1,
    themes: 1,
    invitations: 2,
    outbox: 2,
    blocked_outbox: 2
  })) {
    assertEqual(graph.rows[0]?.[key], expected, `successful graph count for ${key}`);
  }

  await assertRejects(
    () => serviceQuery(
      "select public.provision_tenant_atomic($1, $2, $3, $4::jsonb) as result",
      [actorId, fixture.idempotencyKey, sha256("different-request"), JSON.stringify(fixture.payload)]
    ),
    "same provisioning key with a different fingerprint must fail"
  );

  const invitationRows = await setup.query(
    `select id, role from public.auth_invitations
     where provisioning_run_id = $1 order by case when role = 'tenant_owner' then 0 else 1 end`,
    [runId]
  );
  const ownerInvitationId = invitationRows.rows[0]?.id;
  const staffInvitationId = invitationRows.rows[1]?.id;
  await materialize(runId, ownerInvitationId, actorId, false);
  await serviceQuery(
    "select public.mark_tenant_provisioning_identity_attention($1, $2, 'injected_auth_timeout')",
    [actorId, runId]
  );
  const replayedIdentity = await materialize(runId, ownerInvitationId, actorId, false);
  assertEqual(replayedIdentity.alreadyMaterialized, true, "identity retry must be idempotent");
  await materialize(runId, staffInvitationId, staffUserId, true);
  const completed = await serviceQuery(
    "select public.complete_tenant_provisioning($1, $2) as result",
    [actorId, runId]
  );
  assertEqual(completed.rows[0]?.result?.outcome, "opened", "complete must open a fully materialized run");
  const completedReplay = await serviceQuery(
    "select public.complete_tenant_provisioning($1, $2) as result",
    [actorId, runId]
  );
  assertEqual(completedReplay.rows[0]?.result?.idempotentReplay, true, "complete retry must be idempotent");

  const finalState = await setup.query(
    `select
      onboarding_run.status,
      (select status from public.tenants where id = onboarding_run.tenant_id) as tenant_status,
      (select count(*)::integer from public.tenant_memberships where tenant_id = onboarding_run.tenant_id) as memberships,
      (select count(*)::integer from public.auth_invitations where provisioning_run_id = onboarding_run.id and identity_status = 'ready') as ready_invitations,
      (select count(*)::integer from public.email_outbox where tenant_id = onboarding_run.tenant_id and next_attempt_at <= now() + interval '5 seconds') as released_outbox,
      (select count(*)::integer from public.tenant_onboarding_events where onboarding_run_id = onboarding_run.id and event_type = 'opened') as opened_events
     from public.tenant_onboarding_runs onboarding_run where onboarding_run.id = $1`,
    [runId]
  );
  assertEqual(finalState.rows[0]?.status, "opened", "final run status");
  assertEqual(finalState.rows[0]?.tenant_status, "active", "only the finalizer may activate the tenant");
  assertEqual(finalState.rows[0]?.memberships, 2, "materialization must create two memberships");
  assertEqual(finalState.rows[0]?.ready_invitations, 2, "both invitations must be identity-ready");
  assertEqual(finalState.rows[0]?.released_outbox, 2, "opening must release both outbox rows together");
  assertEqual(finalState.rows[0]?.opened_events, 1, "opening event must be idempotent");

  console.log(
    "[test:tenant-provisioning:db] PASS seven failure boundaries, zero partial graphs, 20-way duplicate submit, exact graph, durable blocked invitations, resumable identity and idempotent opening."
  );
} finally {
  await Promise.allSettled([workers.end(), setup.end()]);
}

function provisioningFixture(suffix) {
  const slug = `atomic-${suffix}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 58);
  const ownerEmail = `owner-${suffix}@example.test`;
  const staffEmail = `staff-${suffix}@example.test`;
  const payload = {
    accentColor: "#06b6d4",
    amountCents: 4950,
    customDomain: null,
    endTime: "16:45",
    groupCapacity: 10,
    groupName: "Testgroep",
    hostname: `${slug}.nxttrack.nl`,
    invitations: [
      invitation("owner", ownerEmail, "tenant_owner"),
      invitation("staff", staffEmail, "instructor")
    ],
    locationName: "Testlocatie",
    name: `Atomic ${suffix}`,
    ownerEmail,
    ownerName: "Test Eigenaar",
    poolName: "Testbad",
    portalThemeKey: "nxttrack-default",
    portalThemeRelease: "3.0.0",
    primaryColor: "#1d4ed8",
    productName: "Atomic Test",
    programName: "Zwem-ABC",
    slug,
    staff: [staffEmail],
    stageNames: ["Basis", "Diploma A", "Diploma B"],
    startTime: "16:00",
    weekday: 1
  };
  const idempotencyKey = sha256(`tenant-provisioning:v1:${slug}`);
  const requestFingerprint = sha256(JSON.stringify({ ...payload, invitations: undefined }));
  return { idempotencyKey, payload, requestFingerprint };
}

function invitation(prefix, email, role) {
  return {
    businessKey: `${prefix}:${email}`,
    codeHash: sha256(`code:${email}`),
    email,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString(),
    fullName: prefix === "owner" ? "Test Eigenaar" : "Test Instructeur",
    message: {
      html: `<p>Test invitation for ${prefix}</p>`,
      organizationName: "Atomic Test",
      subject: "Atomic provisioning invitation",
      templateKey: "auth_invitation",
      text: `Test invitation for ${prefix}. No provider is invoked.`
    },
    role
  };
}

async function serviceProvision(fixture, failureStep = null) {
  const result = await serviceQuery(
    "select public.provision_tenant_atomic($1, $2, $3, $4::jsonb) as result",
    [actorId, fixture.idempotencyKey, fixture.requestFingerprint, JSON.stringify(fixture.payload)],
    failureStep
  );
  return result.rows[0]?.result;
}

async function materialize(runId, invitationId, userId, isNewAccount) {
  const result = await serviceQuery(
    "select public.materialize_tenant_onboarding_invitation($1, $2, $3, $4, $5) as result",
    [actorId, runId, invitationId, userId, isNewAccount]
  );
  return result.rows[0]?.result;
}

async function assertServiceOnlyBoundary() {
  const privileges = await setup.query(
    `select
      has_function_privilege('anon', 'public.provision_tenant_atomic(uuid,text,text,jsonb)', 'execute') as anon_execute,
      has_function_privilege('authenticated', 'public.provision_tenant_atomic(uuid,text,text,jsonb)', 'execute') as authenticated_execute,
      has_function_privilege('service_role', 'public.provision_tenant_atomic(uuid,text,text,jsonb)', 'execute') as service_execute`
  );
  assertEqual(privileges.rows[0]?.anon_execute, false, "anon provisioning execute grant");
  assertEqual(privileges.rows[0]?.authenticated_execute, false, "authenticated provisioning execute grant");
  assertEqual(privileges.rows[0]?.service_execute, true, "service provisioning execute grant");
}

async function serviceQuery(text, values = [], failureStep = null) {
  const client = await workers.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    if (failureStep) {
      await client.query("select set_config('nxttrack.test_failure_step', $1, true)", [failureStep]);
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

async function assertRejects(operation, message) {
  try {
    await operation();
  } catch {
    return;
  }
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
