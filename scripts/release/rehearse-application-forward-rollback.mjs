#!/usr/bin/env node

import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import pg from "pg";

const startedAt = performance.now();
const schemaColumnsSql = `
  select table_name, column_name, data_type, udt_name
    from information_schema.columns
   where table_schema = 'public'
   order by table_name, ordinal_position
`;
const newSchemaUrl = process.env.NEW_SCHEMA_DATABASE_URL;
const oldSchemaUrl = process.env.OLD_SCHEMA_DATABASE_URL;
if (!newSchemaUrl || !oldSchemaUrl) {
  throw new Error("NEW_SCHEMA_DATABASE_URL and OLD_SCHEMA_DATABASE_URL are required.");
}

for (const [name, expected] of Object.entries({
  MAINTENANCE_NO_WRITE: "true",
  EMAIL_SENDING_ENABLED: "false",
  NEWSLETTER_DELIVERY_ENABLED: "false",
  INTERNAL_JOBS_ENABLED: "false"
})) assert.equal(process.env[name], expected, `${name} must be ${expected} during rollback containment`);

const current = new pg.Client({ connectionString: newSchemaUrl });
const previous = new pg.Client({ connectionString: oldSchemaUrl });
await Promise.all([current.connect(), previous.connect()]);

try {
  await Promise.all([
    current.query("begin read only isolation level repeatable read"),
    previous.query("begin read only isolation level repeatable read")
  ]);

  const newContract = await current.query("select * from public.runtime_schema_compatibility()");
  assert.equal(newContract.rowCount, 1, "new schema + new artifact contract must match once");
  assert.deepEqual(newContract.rows[0], {
    contract_version: 5,
    minimum_compatible_app_sha: "541fe5fd6cee083cb809eef236382cfd2d519ed3",
    minimum_schema_fingerprint: "2b38518a37e41adb2da11224561e44e185c28ca45a962e1f8acfd361aab38aba",
    required_migration_version: "20260908111450"
  });

  const oldContract = await previous.query("select to_regprocedure('public.runtime_schema_compatibility()')::text as signature");
  assert.equal(oldContract.rows[0].signature, null, "new app must reject the old schema because its contract is absent");

  const previousAppFunctions = [
    "accept_auth_invitation", "apply_import_chunk", "claim_import_apply", "claim_import_rollback",
    "complete_import_apply", "complete_import_rollback", "complete_import_validation",
    "complete_tenant_provisioning", "create_intake_submission_atomic", "create_participant_graph_atomic",
    "enqueue_email_outbox", "materialize_import_guardian_invitation",
    "claim_import_auth_user_rollback", "complete_import_auth_user_rollback",
    "materialize_tenant_onboarding_invitation", "place_group_membership_atomic",
    "provision_tenant_atomic", "rollback_import_chunk", "update_import_validation_chunk"
  ];
  const forwardFunctions = await current.query(`
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any($1::text[])
  `, [previousAppFunctions]);
  const found = new Set(forwardFunctions.rows.map((row) => row.proname));
  assert.deepEqual(previousAppFunctions.filter((name) => !found.has(name)), [], "new schema must retain every previous-app transactional RPC");

  const oldColumns = await previous.query(schemaColumnsSql);
  const newColumns = await current.query(schemaColumnsSql);
  const newColumnSet = new Set(newColumns.rows.map(columnKey));
  const droppedColumns = oldColumns.rows.map(columnKey).filter((key) => !newColumnSet.has(key));
  assert.deepEqual(droppedColumns, [], "application-forward migrations must not drop or change old public columns");

  const before = await pendingWork(current);
  const after = await pendingWork(current);
  assert.deepEqual(after, before, "rollback rehearsal must leave pending work durable and unchanged");

  await Promise.all([current.query("rollback"), previous.query("rollback")]);
  const elapsedMs = Math.round(performance.now() - startedAt);
  assert.ok(elapsedMs < 300_000, `containment rehearsal exceeded five minutes: ${elapsedMs}ms`);
  console.log(`[rollback:local] PASS containmentMs=${elapsedMs} oldColumns=${oldColumns.rowCount} previousAppRpcs=${found.size} pending=${JSON.stringify(before)}`);
} finally {
  await Promise.allSettled([current.end(), previous.end()]);
}

function columnKey(row) {
  return `${row.table_name}.${row.column_name}:${row.data_type}:${row.udt_name}`;
}

async function pendingWork(client) {
  const result = await client.query(`
    select
      (select count(*)::integer from public.email_outbox where status in ('queued', 'retry', 'processing')) as email_jobs,
      (select count(*)::integer from public.import_jobs where status in ('uploaded', 'mapping', 'validated', 'ready', 'applying', 'rolling_back', 'needs_attention')) as import_jobs,
      (select count(*)::integer from public.auth_invitations where identity_status in ('pending', 'attention_required')) as identity_jobs
  `);
  return result.rows[0];
}
