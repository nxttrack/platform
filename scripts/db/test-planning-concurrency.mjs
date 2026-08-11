#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString =
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const setup = new pg.Client({ connectionString });
const adminA = new pg.Client({ connectionString });
const adminB = new pg.Client({ connectionString });

const tenantId = randomUUID();
const actorA = randomUUID();
const actorB = randomUUID();
const programId = randomUUID();
const stageId = randomUUID();
const resourceId = randomUUID();
const slug = `planning-race-${tenantId.slice(0, 8)}`;

try {
  await setup.connect();
  await setup.query(
    `insert into auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values
      ($1, 'authenticated', 'authenticated', $3, '{}'::jsonb, '{}'::jsonb, now(), now()),
      ($2, 'authenticated', 'authenticated', $4, '{}'::jsonb, '{}'::jsonb, now(), now())`,
    [actorA, actorB, `${slug}-a@example.test`, `${slug}-b@example.test`]
  );
  await setup.query(
    "insert into public.tenants (id, slug, name) values ($1, $2, 'Planning race test')",
    [tenantId, slug]
  );
  await setup.query(
    `insert into public.tenant_memberships (tenant_id, user_id, role, status) values
      ($1, $2, 'tenant_admin', 'active'),
      ($1, $2, 'instructor', 'active'),
      ($1, $3, 'tenant_admin', 'active'),
      ($1, $3, 'instructor', 'active')`,
    [tenantId, actorA, actorB]
  );
  await setup.query(
    `insert into public.programs (id, tenant_id, name, code, status)
     values ($1, $2, 'Race program', $3, 'active')`,
    [programId, tenantId, `${slug}-program`]
  );
  await setup.query(
    `insert into public.program_stages (id, tenant_id, program_id, name, code, status)
     values ($1, $2, $3, 'Race badje', $4, 'active')`,
    [stageId, tenantId, programId, `${slug}-stage`]
  );
  await setup.query(
    `insert into public.resources (
      id, tenant_id, kind, name, code, capacity, safety_capacity, status
    ) values ($1, $2, 'pool', 'Race bad', $3, 8, 8, 'active')`,
    [resourceId, tenantId, `${slug}-pool`]
  );
  await setup.query(
    `insert into public.resource_opening_hours (
      tenant_id, resource_id, weekday, opens_at, closes_at
    ) values ($1, $2, 2, '14:00', '19:00')`,
    [tenantId, resourceId]
  );
  await setup.query(
    `insert into public.instructor_qualifications (
      tenant_id, instructor_user_id, program_id, qualification_key, name,
      status, valid_from, valid_until, verified_by_user_id, verified_at
    ) values
      ($1, $2, $4, 'race_qualification', 'Race qualification', 'active',
       '2026-01-01', '2027-12-31', $2, now()),
      ($1, $3, $4, 'race_qualification', 'Race qualification', 'active',
       '2026-01-01', '2027-12-31', $3, now())`,
    [tenantId, actorA, actorB, programId]
  );
  await setup.query(
    `insert into public.instructor_availability (
      tenant_id, instructor_user_id, weekday, starts_at, ends_at, status
    ) values
      ($1, $2, 2, '14:00', '19:00', 'active'),
      ($1, $3, 2, '14:00', '19:00', 'active')`,
    [tenantId, actorA, actorB]
  );

  await Promise.all([adminA.connect(), adminB.connect()]);
  await Promise.all([
    setServiceActor(adminA, actorA),
    setServiceActor(adminB, actorB)
  ]);

  const payload = (actorId, suffix) => ({
    name: `Race groep ${suffix}`,
    code: `${slug}-${suffix}`,
    programId,
    stageId,
    resourceId,
    instructorUserIds: [actorId],
    weekday: 2,
    startTime: "16:00",
    endTime: "16:45",
    startsOn: "2026-09-01",
    endsOn: "2026-09-08",
    recurrenceIntervalWeeks: 1,
    regularCapacity: 4,
    flexCapacity: 1,
    trialCapacity: 1,
    hardCapacity: 6,
    capacityBorrowing: "none",
    offeringType: "regular",
    reason: "Concurrency integration test"
  });

  const results = await Promise.allSettled([
    publish(adminA, tenantId, actorA, `${slug}-publish-a`, payload(actorA, "A")),
    publish(adminB, tenantId, actorB, `${slug}-publish-b`, payload(actorB, "B"))
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(`Expected exactly one concurrent publication; got ${fulfilled.length} success(es) and ${rejected.length} rejection(s).`);
  }

  const groupResult = await setup.query(
    "select count(*)::integer as count from public.groups where tenant_id = $1",
    [tenantId]
  );
  const reservationResult = await setup.query(
    `select count(*)::integer as count
     from public.session_resource_reservations where tenant_id = $1 and status = 'active'`,
    [tenantId]
  );
  if (groupResult.rows[0]?.count !== 1 || reservationResult.rows[0]?.count !== 2) {
    throw new Error("Concurrent publication did not leave exactly one group with two reservations.");
  }

  console.log("[test:planning:concurrency] PASS two concurrent admins produced one serialized publication and one transactional conflict.");
} finally {
  await Promise.allSettled([adminA.end(), adminB.end()]);
  if (setup._connected) {
    await setup.query("delete from public.tenants where id = $1", [tenantId]).catch(() => undefined);
    await setup.query("delete from auth.users where id = any($1::uuid[])", [[actorA, actorB]]).catch(() => undefined);
    await setup.end();
  }
}

async function setServiceActor(client, actorId) {
  await client.query(
    `select set_config(
      'request.jwt.claims',
      json_build_object('sub', $1::text, 'role', 'service_role')::text,
      false
    )`,
    [actorId]
  );
  await client.query("select set_config('request.jwt.claim.role', 'service_role', false)");
}

async function publish(client, tenantIdValue, actorId, idempotencyKey, payload) {
  const result = await client.query(
    "select public.publish_group_schedule($1, $2, $3, $4::jsonb) as result",
    [tenantIdValue, actorId, idempotencyKey, JSON.stringify(payload)]
  );
  return result.rows[0]?.result;
}
