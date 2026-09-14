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

  await testThemeWorkerConcurrency();
  await testBlackoutUndoConcurrency();
  console.log("[test:planning:concurrency] PASS serialized publication, SKIP LOCKED theme workers and idempotent concurrent blackout undo.");
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

async function testThemeWorkerConcurrency() {
  await setup.query("insert into public.platform_memberships (user_id,role,status) values ($1,'platform_admin','active')",[actorA]);
  const release = (await setup.query(`select theme_key,release from public.portal_theme_release
    where status='published' and portal_contract='parent-portal/1.2' and manifest_schema_version=3
    order by theme_key,release limit 1`)).rows[0];
  const planned = await setup.query(`select public.schedule_tenant_portal_theme($1,$2,$3,now()+interval '1 day',$4,'Concurrent schedule') as id`,[tenantId,release.theme_key,release.release,actorA]);
  const id = planned.rows[0].id;
  await setup.query("update public.tenant_portal_theme_schedule set created_at=now()-interval '2 days',scheduled_for=now()-interval '1 hour' where id=$1",[id]);
  await adminA.query('begin');
  try {
    await adminA.query('select id from public.tenant_portal_theme_schedule where id=$1 for update',[id]);
    const skipped = await adminB.query('select * from public.execute_due_portal_theme_schedules(1)');
    if (skipped.rowCount !== 0) throw new Error('A claimed theme schedule was not skipped');
  } finally {
    await adminA.query('rollback');
  }
  const attempts = await Promise.all([adminA,adminB].map(client => client.query('select * from public.execute_due_portal_theme_schedules(1)')));
  const rows = attempts.flatMap(r=>r.rows);
  if (rows.length !== 1 || rows[0].schedule_id !== id || rows[0].status !== 'executed') throw new Error('Concurrent theme workers did not execute exactly once');
  const audit = await setup.query("select count(*)::integer as count from public.portal_theme_audit_event where tenant_id=$1 and event_type='activated' and request_correlation_id=$2",[tenantId,id]);
  if (audit.rows[0].count !== 1) throw new Error('Concurrent theme activation duplicated its audit event');
}

async function testBlackoutUndoConcurrency() {
  const season = randomUUID();
  const blackout = randomUUID();
  await setup.query("insert into public.planning_seasons (id,tenant_id,name,starts_on,ends_on,status,created_by_user_id) values ($1,$2,'Concurrent undo','2026-09-01','2026-09-30','active',$3)",[season,tenantId,actorA]);
  await setup.query(`insert into public.season_blackout_periods (id,tenant_id,season_id,name,starts_at,ends_at,session_handling,financial_handling,status,created_by_user_id,published_by_user_id,published_at)
    values ($1,$2,$3,'Concurrent closure','2026-09-01','2026-10-01','cancel','no_change','published',$4,$4,now())`,[blackout,tenantId,season,actorA]);
  await setup.query(`insert into public.schedule_occurrence_exceptions (tenant_id,blackout_id,session_id,exception_type,before_status,effective_status,applied_by_user_id)
    select tenant_id,$2,id,'holiday_closure',status,'cancelled',$3 from public.sessions where tenant_id=$1`,[tenantId,blackout,actorA]);
  await setup.query("update public.sessions set status='cancelled' where tenant_id=$1",[tenantId]);
  // A later manual status change must not be overwritten by undo.
  await setup.query("update public.sessions set status='completed' where id=(select id from public.sessions where tenant_id=$1 order by id limit 1)",[tenantId]);
  const results = await Promise.all([[adminA,actorA],[adminB,actorB]].map(([client,actor])=>client.query('select public.undo_season_blackout_v3($1,$2,$3) as changed',[tenantId,blackout,actor])));
  const counts=results.map(r=>r.rows[0].changed).sort();
  if (JSON.stringify(counts)!=='[0,1]') throw new Error(`Concurrent undo did not restore once: ${counts}`);
  const statuses=await setup.query('select status,count(*)::integer as count from public.sessions where tenant_id=$1 group by status order by status',[tenantId]);
  if (JSON.stringify(statuses.rows)!=='[{"status":"completed","count":1},{"status":"scheduled","count":1}]') throw new Error('Undo changed a manual status or failed to restore the eligible lesson');
}
