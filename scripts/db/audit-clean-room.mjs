#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(rootDir, "supabase", "migrations");
const connectionString = process.env.CLEAN_ROOM_DATABASE_URL;
const grantProfile = process.env.CLEAN_ROOM_GRANT_PROFILE;

assert.ok(connectionString, "CLEAN_ROOM_DATABASE_URL is required");
assert.ok(["legacy", "secure"].includes(grantProfile), "CLEAN_ROOM_GRANT_PROFILE must be legacy or secure");

const expectedMigrations = readdirSync(migrationsDir)
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort()
  .map((file) => {
    const separator = file.indexOf("_");
    return { version: file.slice(0, separator), name: file.slice(separator + 1, -4) };
  });
const expectedBuckets = [
  "badge-studio-assets",
  "diploma-vault",
  "participant-media",
  "tenant-documents",
  "tenant-media-assets"
];
const serviceOnlyFunctions = [
  "public.claim_email_outbox(integer,integer)",
  "public.complete_email_outbox(uuid,uuid,text,text,text,text,text,integer)",
  "public.claim_import_apply(uuid,uuid,uuid,text,integer)",
  "public.claim_import_rollback(uuid,uuid,uuid,integer)",
  "public.claim_import_auth_user_rollback(uuid,uuid,uuid,uuid,integer)",
  "public.complete_import_apply(uuid,uuid,uuid,uuid)",
  "public.complete_import_rollback(uuid,uuid,uuid,uuid)",
  "public.complete_import_auth_user_rollback(uuid,uuid,uuid,uuid,uuid,uuid,boolean)",
  "public.provision_tenant_atomic(uuid,text,text,jsonb)",
  "public.complete_tenant_provisioning(uuid,uuid)",
  "public.apply_import_chunk(uuid,uuid,uuid,uuid,jsonb)",
  "public.rollback_import_chunk(uuid,uuid,uuid,uuid,integer)",
  "public.runtime_schema_compatibility()"
];

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const history = await client.query(
    "select version, name from supabase_migrations.schema_migrations order by version"
  );
  assert.deepEqual(history.rows, expectedMigrations, "migration history differs from the repository");

  const schemaInventory = await client.query(`
    select n.nspname as schema,
      count(*) filter (where c.relkind in ('r', 'p'))::integer as tables,
      count(*) filter (where c.relkind = 'S')::integer as sequences
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid
    where n.nspname in ('app_private', 'auth', 'public', 'realtime', 'storage')
    group by n.nspname
    order by n.nspname
  `);
  const publicTables = await client.query(`
    select count(*)::integer as total,
      count(*) filter (where relrowsecurity)::integer as rls,
      count(*) filter (where relforcerowsecurity)::integer as force_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  `);
  assert.deepEqual(publicTables.rows[0], { total: 251, rls: 251, force_rls: 251 });

  const objectCounts = await client.query(`
    select
      (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private')) as functions,
      (select count(*)::integer from pg_trigger t
        join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
        where not t.tgisinternal and n.nspname = 'public') as triggers,
      (select count(*)::integer from pg_indexes where schemaname = 'public') as indexes,
      (select count(*)::integer from pg_constraint c join pg_namespace n on n.oid = c.connamespace
        where n.nspname = 'public') as constraints
  `);
  const buckets = await client.query("select id, public from storage.buckets order by id");
  assert.deepEqual(
    buckets.rows,
    expectedBuckets.map((id) => ({ id, public: false })),
    "storage bucket inventory or privacy differs"
  );
  const storagePolicies = await client.query(`
    select policyname, roles::text, cmd
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    order by policyname
  `);
  const canonicalOutboxConstraint = await client.query(`
    select convalidated
      from pg_constraint
     where conrelid = 'public.email_outbox'::regclass
       and conname = 'email_outbox_idempotency_key_canonical_check'
  `);
  assert.deepEqual(canonicalOutboxConstraint.rows, [{ convalidated: true }], "fresh schema must validate the canonical outbox key constraint");

  const serviceLedgerBoundaries = [];
  for (const table of ["core_write_operations", "import_manifest_entries"]) {
    const result = await client.query(
      `select
        has_table_privilege('anon', $1, 'insert,update,delete') as anon_mutation,
        has_table_privilege('authenticated', $1, 'insert,update,delete') as authenticated_mutation,
        has_table_privilege('authenticated', $1, 'select') as authenticated_read,
        has_table_privilege('service_role', $1, 'insert,update,delete') as service_mutation`,
      [`public.${table}`]
    );
    assert.deepEqual(result.rows[0], {
      anon_mutation: false,
      authenticated_mutation: false,
      authenticated_read: true,
      service_mutation: true
    }, `${table} grants are not independently service-write-only`);
    serviceLedgerBoundaries.push(table);
  }

  const functionBoundaries = [];
  for (const signature of serviceOnlyFunctions) {
    const result = await client.query(
      `select
        to_regprocedure($1) is not null as exists,
        has_function_privilege('anon', to_regprocedure($1), 'execute') as anon,
        has_function_privilege('authenticated', to_regprocedure($1), 'execute') as authenticated,
        has_function_privilege('service_role', to_regprocedure($1), 'execute') as service_role`,
      [signature]
    );
    assert.deepEqual(result.rows[0], {
      exists: true,
      anon: false,
      authenticated: false,
      service_role: true
    }, `${signature} is not service-only`);
    functionBoundaries.push(signature);
  }

  const unexpectedSecureExec = await client.query(`
    select count(*)::integer as total
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and (has_function_privilege('public', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  `);
  if (grantProfile === "secure") {
    assert.equal(unexpectedSecureExec.rows[0].total, 0, "secure profile exposes functions to public/anon");
  }

  const sentinel = await auditDefaultPrivileges();
  const expectedSentinel = grantProfile === "legacy"
    ? { anon_table_select: true, authenticated_table_insert: true, anon_function_execute: true }
    : { anon_table_select: false, authenticated_table_insert: false, anon_function_execute: false };
  assert.deepEqual(sentinel, expectedSentinel, `${grantProfile} default privileges differ`);

  console.log(JSON.stringify({
    result: "PASS",
    grantProfile,
    migrationCount: history.rowCount,
    schemas: schemaInventory.rows,
    publicTables: publicTables.rows[0],
    objects: objectCounts.rows[0],
    buckets: buckets.rows,
    storagePolicies: storagePolicies.rows,
    canonicalOutboxKeyConstraintValidated: true,
    serviceWriteOnlyLedgerCount: serviceLedgerBoundaries.length,
    serviceOnlyFunctionCount: functionBoundaries.length,
    publicOrAnonExecutableFunctionCount: unexpectedSecureExec.rows[0].total,
    sentinel
  }, null, 2));
} finally {
  await client.end().catch(() => undefined);
}

async function auditDefaultPrivileges() {
  await client.query("begin");
  try {
    await client.query("create table public.certification_default_grant_sentinel (id bigint primary key)");
    await client.query(`
      create function public.certification_default_grant_sentinel_fn()
      returns integer
      language sql
      set search_path = ''
      as 'select 1'
    `);
    const result = await client.query(`
      select
        has_table_privilege('anon', 'public.certification_default_grant_sentinel', 'select') as anon_table_select,
        has_table_privilege('authenticated', 'public.certification_default_grant_sentinel', 'insert') as authenticated_table_insert,
        has_function_privilege('anon', 'public.certification_default_grant_sentinel_fn()', 'execute') as anon_function_execute
    `);
    return result.rows[0];
  } finally {
    await client.query("rollback");
  }
}
