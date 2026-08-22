#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.CORE_ONBOARDING_TEST_DATABASE_URL ??
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const workers = new pg.Pool({ connectionString, max: 24 });
const token = randomUUID().slice(0, 8);
const tenantId = randomUUID();
const actorId = randomUUID();
const guardianId = randomUUID();
const programId = randomUUID();
const stageId = randomUUID();
const groupId = randomUUID();

try {
  await setup.connect();
  await createFixture();
  await assertServiceOnlyBoundary();
  await testParticipantGraphFailuresAndReplay();
  await testIntakeFailuresAndReplay();
  await testPlacementFailures();
  await testPlacementTenantConsistency();
  await testOneSeatConcurrency();
  console.log(
    "[test:core-onboarding:db] PASS participant/intake failure rollback and replay; placement failure rollback; 20-way one-seat claim produced one placed and nineteen controlled capacity responses with one audit."
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
    [actorId, guardianId, `core-actor-${token}@example.test`, `core-guardian-${token}@example.test`]
  );
  await setup.query(
    "insert into public.tenants (id, slug, name, status) values ($1, $2, $3, 'active')",
    [tenantId, `core-${token}`, `Core writes ${token}`]
  );
  await setup.query(
    `insert into public.tenant_memberships (tenant_id, user_id, role, status) values
      ($1, $2, 'tenant_admin', 'active'), ($1, $3, 'parent', 'active')`,
    [tenantId, actorId, guardianId]
  );
  await setup.query(
    "insert into public.programs (id, tenant_id, name, status) values ($1, $2, 'Atomic program', 'active')",
    [programId, tenantId]
  );
  await setup.query(
    "insert into public.program_stages (id, tenant_id, program_id, name, status) values ($1, $2, $3, 'Atomic stage', 'active')",
    [stageId, tenantId, programId]
  );
  await setup.query(
    `insert into public.groups (
      id, tenant_id, program_id, stage_id, name, status, capacity,
      regular_capacity, flex_capacity, trial_capacity, hard_capacity, capacity_borrowing
    ) values ($1, $2, $3, $4, 'One seat', 'active', 1, 1, 0, 0, 1, 'none')`,
    [groupId, tenantId, programId, stageId]
  );
}

async function testParticipantGraphFailuresAndReplay() {
  for (const step of ["participant", "guardian", "enrollment", "participant_audit"]) {
    const fixture = participantFixture(`${step}-${randomUUID()}`);
    const failed = await participantCommand(fixture, step);
    assertEqual(failed.outcome, "write_failed", `${step} returns controlled failure`);
    const graph = await setup.query(
      `select
        (select count(*)::integer from public.participants where tenant_id = $1 and display_name = $2) as participants,
        (select count(*)::integer from public.enrollments enrollment join public.participants participant on participant.id = enrollment.participant_id where participant.tenant_id = $1 and participant.display_name = $2) as enrollments,
        (select count(*)::integer from public.swim_audit_events where tenant_id = $1 and correlation_id = $3) as audits`,
      [tenantId, fixture.participant.displayName, failed.operationId]
    );
    assertEqual(graph.rows[0]?.participants, 0, `${step} leaves no participant`);
    assertEqual(graph.rows[0]?.enrollments, 0, `${step} leaves no enrollment`);
    assertEqual(graph.rows[0]?.audits, 0, `${step} leaves no graph audit`);
  }

  const fixture = participantFixture(`replay-${randomUUID()}`);
  const parallel = await Promise.all(Array.from({ length: 20 }, () => participantCommand(fixture)));
  assertEqual(parallel.filter((result) => result.idempotentReplay === false).length, 1, "one participant command creates graph");
  assertEqual(new Set(parallel.map((result) => result.participantId)).size, 1, "participant retries share result");
  const graph = await setup.query(
    `select
      (select count(*)::integer from public.participants where tenant_id = $1 and display_name = $2) as participants,
      (select count(*)::integer from public.participant_guardians guardian join public.participants participant on participant.id = guardian.participant_id where participant.tenant_id = $1 and participant.display_name = $2) as guardians,
      (select count(*)::integer from public.enrollments enrollment join public.participants participant on participant.id = enrollment.participant_id where participant.tenant_id = $1 and participant.display_name = $2) as enrollments,
      (select count(*)::integer from public.swim_audit_events where tenant_id = $1 and correlation_id = $3 and event_type = 'participant.graph_created') as audits`,
    [tenantId, fixture.participant.displayName, parallel[0].operationId]
  );
  for (const key of ["participants", "guardians", "enrollments", "audits"]) {
    assertEqual(graph.rows[0]?.[key], 1, `participant replay graph ${key}`);
  }
}

async function testIntakeFailuresAndReplay() {
  for (const step of ["intake_submission", "intake_answers", "intake_audit"]) {
    const fixture = intakeFixture(`${step}-${randomUUID()}`);
    const failed = await intakeCommand(fixture, step);
    assertEqual(failed.outcome, "write_failed", `${step} returns controlled failure`);
    const graph = await setup.query(
      `select
        (select count(*)::integer from public.intake_submissions where tenant_id = $1 and parent_email = $2) as submissions,
        (select count(*)::integer from public.intake_answers answer join public.intake_submissions intake on intake.id = answer.submission_id where intake.tenant_id = $1 and intake.parent_email = $2) as answers,
        (select count(*)::integer from public.tenant_events event where event.tenant_id = $1 and event.event_type = 'intake.received' and event.payload ->> 'operationId' = $3::text) as audits`,
      [tenantId, fixture.submission.parentEmail, failed.operationId]
    );
    assertEqual(graph.rows[0]?.submissions, 0, `${step} leaves no submission`);
    assertEqual(graph.rows[0]?.answers, 0, `${step} leaves no answers`);
    assertEqual(graph.rows[0]?.audits, 0, `${step} leaves no event`);
  }

  const fixture = intakeFixture(`replay-${randomUUID()}`);
  const parallel = await Promise.all(Array.from({ length: 20 }, () => intakeCommand(fixture)));
  assertEqual(parallel.filter((result) => result.idempotentReplay === false).length, 1, "one intake command creates graph");
  assertEqual(new Set(parallel.map((result) => result.submissionId)).size, 1, "intake retries share result");
  const graph = await setup.query(
    `select
      (select count(*)::integer from public.intake_submissions where tenant_id = $1 and parent_email = $2) as submissions,
      (select count(*)::integer from public.intake_answers where tenant_id = $1 and submission_id = $3) as answers,
      (select count(*)::integer from public.tenant_events where tenant_id = $1 and subject_id = $3 and event_type = 'intake.received') as audits`,
    [tenantId, fixture.submission.parentEmail, parallel[0].submissionId]
  );
  assertEqual(graph.rows[0]?.submissions, 1, "intake replay submission count");
  assertEqual(graph.rows[0]?.answers, 1, "intake replay answer count");
  assertEqual(graph.rows[0]?.audits, 1, "intake replay audit count");
}

async function testPlacementFailures() {
  for (const step of ["placement_capacity", "placement_membership", "placement_audit"]) {
    const enrollment = await createEnrollment(`failure-${step}`);
    let result = null;
    try {
      result = await placementCommand(enrollment.id, randomUUID(), step);
    } catch {
      if (step !== "placement_capacity") throw new Error(`${step} unexpectedly raised`);
    }
    if (step !== "placement_capacity") assertEqual(result?.outcome, "write_failed", `${step} controlled failure`);
    const graph = await setup.query(
      `select
        (select count(*)::integer from public.group_memberships where tenant_id = $1 and group_id = $2 and enrollment_id = $3) as memberships,
        (select count(*)::integer from public.swim_audit_events where tenant_id = $1 and event_type = 'group.membership_placed' and after_json ->> 'enrollmentId' = $3::text) as audits`,
      [tenantId, groupId, enrollment.id]
    );
    assertEqual(graph.rows[0]?.memberships, 0, `${step} leaves no membership`);
    assertEqual(graph.rows[0]?.audits, 0, `${step} leaves no placement audit`);
  }
}

async function testPlacementTenantConsistency() {
  const otherProgramId = randomUUID();
  await setup.query(
    "insert into public.programs (id, tenant_id, name, status) values ($1, $2, 'Other program', 'active')",
    [otherProgramId, tenantId]
  );
  const enrollment = await createEnrollment("wrong-program", otherProgramId, null);
  await assertRejects(
    () => placementCommand(enrollment.id, randomUUID()),
    "an enrollment from another program must be rejected"
  );
  const membershipCount = await setup.query(
    "select count(*)::integer as count from public.group_memberships where tenant_id = $1 and group_id = $2 and enrollment_id = $3",
    [tenantId, groupId, enrollment.id]
  );
  assertEqual(membershipCount.rows[0]?.count, 0, "program mismatch leaves no membership");
}

async function testOneSeatConcurrency() {
  const enrollments = [];
  for (let index = 0; index < 20; index += 1) {
    enrollments.push(await createEnrollment(`claim-${index}`));
  }
  const claims = enrollments.map((enrollment) => ({ enrollment, operationKey: randomUUID() }));
  const results = await Promise.all(claims.map((claim) => placementCommand(claim.enrollment.id, claim.operationKey)));
  assertEqual(results.filter((result) => result.outcome === "placed").length, 1, "exactly one claim is placed");
  assertEqual(results.filter((result) => ["capacity_full", "conflict"].includes(result.outcome)).length, 19, "other claims are controlled");
  const placedIndex = results.findIndex((result) => result.outcome === "placed");
  const replay = await placementCommand(claims[placedIndex].enrollment.id, claims[placedIndex].operationKey);
  assertEqual(replay.outcome, "placed", "duplicate click returns original placement result");
  assertEqual(replay.idempotentReplay, true, "duplicate click is explicitly a replay");
  await assertRejects(
    () => placementCommand(claims[(placedIndex + 1) % claims.length].enrollment.id, claims[placedIndex].operationKey),
    "same placement key with different input must conflict"
  );
  const final = await setup.query(
    `select
      (select count(*)::integer from public.group_memberships where tenant_id = $1 and group_id = $2 and status in ('active', 'trial')) as live_memberships,
      (select count(*)::integer from public.swim_audit_events where tenant_id = $1 and event_type = 'group.membership_placed' and after_json ->> 'groupId' = $2::text) as placement_audits,
      (select count(*)::integer from public.core_write_operations where tenant_id = $1 and operation_type = 'group_placement' and result_json ->> 'outcome' = 'capacity_full') as capacity_results`,
    [tenantId, groupId]
  );
  assertEqual(final.rows[0]?.live_memberships, 1, "one final live membership");
  assertEqual(final.rows[0]?.placement_audits, 1, "one final placement audit");
  assertEqual(final.rows[0]?.capacity_results, 19, "nineteen durable controlled capacity results");
}

function participantFixture(suffix) {
  const participant = {
    guardianUserId: guardianId,
    displayName: `Atomic participant ${suffix}`,
    birthDate: "2018-06-15",
    gender: "unknown_legacy"
  };
  const enrollment = { programId, stageId, startsOn: "2026-08-22" };
  return {
    operationKey: randomUUID(), participant, enrollment,
    fingerprint: sha256(JSON.stringify({ participant, enrollment }))
  };
}

function intakeFixture(suffix) {
  const submission = {
    formId: null, programId, selectedOption: "enrollment",
    parentName: "Atomic Parent", parentEmail: `intake-${sha256(suffix).slice(0, 12)}@example.test`, parentPhone: null,
    secondaryParentName: null, secondaryParentEmail: null, secondaryParentPhone: null,
    participantName: "Atomic Child", participantBirthDate: "2018-06-15", participantGender: "unknown_legacy",
    preferredDays: ["maandag"], preferredDayparts: { 1: ["afternoon"] }, preferredNotes: null, message: null,
    contentClassification: "personal", classificationReasons: ["identity"], swimmingExperience: "none",
    recommendationSnapshot: [], selectedGroupId: null, selectedWaitBand: "long", recommendationVersion: "wait-time-v2",
    consentGiven: true, sourceHostname: `core-${token}.example.test`, abuseFingerprint: sha256(`abuse-${suffix}`),
    attributionChannel: "direct", attributionSource: "direct", attributionMedium: null, attributionCampaign: null,
    attributionContent: null, attributionTerm: null, attributionReferrerHost: null, attributionLandingPath: "/intake",
    attributionHasAdClickId: false, attributionCapturedAt: null, analyticsConsent: "unknown", analyticsConsentVersion: "analytics-v1"
  };
  const answers = [{
    questionId: null, fieldKey: "swimming_experience", answerText: "none", answerJson: null,
    contentClassification: "personal", classificationReasons: ["identity"]
  }];
  return {
    operationKey: sha256(`intake-operation-${suffix}`),
    dedupeKey: sha256(`intake-dedupe-${suffix}`),
    fingerprint: sha256(JSON.stringify({ submission, answers })),
    submission, answers
  };
}

async function createEnrollment(suffix, enrollmentProgramId = programId, enrollmentStageId = stageId) {
  const participantId = randomUUID();
  const enrollmentId = randomUUID();
  await setup.query(
    `insert into public.participants (id, tenant_id, display_name, status, source)
     values ($1, $2, $3, 'active', 'manual')`,
    [participantId, tenantId, `Capacity ${suffix}`]
  );
  await setup.query(
    `insert into public.enrollments (id, tenant_id, participant_id, program_id, current_stage_id, status, source)
     values ($1, $2, $3, $4, $5, 'active', 'manual')`,
    [enrollmentId, tenantId, participantId, enrollmentProgramId, enrollmentStageId]
  );
  return { id: enrollmentId, participantId };
}

async function participantCommand(fixture, failureStep = null) {
  const result = await serviceQuery(
    "select public.create_participant_graph_atomic($1, $2, $3, $4, $5::jsonb, $6::jsonb) as result",
    [actorId, tenantId, fixture.operationKey, fixture.fingerprint, JSON.stringify(fixture.participant), JSON.stringify(fixture.enrollment)],
    failureStep
  );
  return result.rows[0]?.result;
}

async function intakeCommand(fixture, failureStep = null) {
  const result = await serviceQuery(
    "select public.create_intake_submission_atomic($1, $2, $3, $4, $5::jsonb, $6::jsonb) as result",
    [tenantId, fixture.operationKey, fixture.fingerprint, fixture.dedupeKey, JSON.stringify(fixture.submission), JSON.stringify(fixture.answers)],
    failureStep
  );
  return result.rows[0]?.result;
}

async function placementCommand(enrollmentId, operationKey, failureStep = null) {
  const command = { groupId, enrollmentId, status: "active", capacityBucket: "regular", capacityWeight: 1, startsOn: "2026-08-22" };
  const result = await serviceQuery(
    "select public.place_group_membership_atomic($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result",
    [actorId, tenantId, operationKey, sha256(JSON.stringify(command)), groupId, enrollmentId, "active", "regular", 1, "2026-08-22"],
    failureStep
  );
  return result.rows[0]?.result;
}

async function assertServiceOnlyBoundary() {
  const result = await setup.query(
    `select
      has_function_privilege('anon', 'public.create_participant_graph_atomic(uuid,uuid,text,text,jsonb,jsonb)', 'execute') as participant_anon,
      has_function_privilege('authenticated', 'public.create_intake_submission_atomic(uuid,text,text,text,jsonb,jsonb)', 'execute') as intake_authenticated,
      has_function_privilege('anon', 'public.place_group_membership_atomic(uuid,uuid,text,text,uuid,uuid,text,text,numeric,date)', 'execute') as placement_anon,
      has_function_privilege('service_role', 'public.create_participant_graph_atomic(uuid,uuid,text,text,jsonb,jsonb)', 'execute') as participant_service,
      has_function_privilege('service_role', 'public.create_intake_submission_atomic(uuid,text,text,text,jsonb,jsonb)', 'execute') as intake_service,
      has_function_privilege('service_role', 'public.place_group_membership_atomic(uuid,uuid,text,text,uuid,uuid,text,text,numeric,date)', 'execute') as placement_service`
  );
  assertEqual(result.rows[0]?.participant_anon, false, "participant anon execute denied");
  assertEqual(result.rows[0]?.intake_authenticated, false, "intake authenticated execute denied");
  assertEqual(result.rows[0]?.placement_anon, false, "placement anon execute denied");
  assertEqual(result.rows[0]?.participant_service, true, "participant service execute granted");
  assertEqual(result.rows[0]?.intake_service, true, "intake service execute granted");
  assertEqual(result.rows[0]?.placement_service, true, "placement service execute granted");
}

async function serviceQuery(text, values = [], failureStep = null) {
  const client = await workers.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    if (failureStep) {
      await client.query("select set_config('nxttrack.test_core_write_failure', $1, true)", [failureStep]);
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
