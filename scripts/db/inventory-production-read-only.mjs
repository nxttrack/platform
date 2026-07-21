#!/usr/bin/env node

import { appendFileSync, readdirSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[production:db-inventory] DATABASE_URL is required.");
  process.exit(1);
}

const client = new Client({
  application_name: "nxttrack-production-read-only-inventory",
  connectionString,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 15_000
});

try {
  await client.connect();
  await client.query("begin read only");

  const readOnly = scalar(await client.query("show transaction_read_only"));

  if (readOnly !== "on") {
    throw new Error("The inventory transaction is not read-only.");
  }

  const serverVersion = scalar(await client.query("select current_setting('server_version')"));
  const extensionCount = number(await client.query("select count(*)::int as value from pg_extension"));
  const schemaCounts = await client.query(`
    select n.nspname as schema_name, count(c.oid)::int as table_count
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid and c.relkind in ('r', 'p')
    where n.nspname in ('public', 'app_private', 'auth', 'storage', 'supabase_migrations')
    group by n.nspname
    order by n.nspname
  `);
  const rls = first(
    await client.query(`
      select
        count(*)::int as public_table_count,
        count(*) filter (where c.relrowsecurity)::int as rls_enabled_count,
        count(*) filter (where c.relforcerowsecurity)::int as force_rls_count
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
    `)
  );
  const authUserCount = await relationCount("auth.users");
  const storageObjectCount = await relationCount("storage.objects");
  const migrationTablePresent = scalar(
    await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null")
  );

  if (migrationTablePresent !== true) {
    throw new Error("supabase_migrations.schema_migrations is missing.");
  }

  const remoteMigrationResult = await client.query(
    "select version::text as version from supabase_migrations.schema_migrations order by version"
  );
  const remoteVersions = remoteMigrationResult.rows.map((row) => row.version);
  const localVersions = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
    .map((name) => name.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter(Boolean)
    .sort();
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);
  const missingRemote = localVersions.filter((version) => !remoteSet.has(version));
  const unexpectedRemote = remoteVersions.filter((version) => !localSet.has(version));

  console.log("[production:db-inventory] PASS transaction_read_only=on.");
  console.log(`[production:db-inventory] PostgreSQL ${serverVersion}; extensions=${extensionCount}.`);

  for (const row of schemaCounts.rows) {
    console.log(`[production:db-inventory] schema ${row.schema_name}=${row.table_count}.`);
  }

  console.log(
    `[production:db-inventory] public tables=${rls.public_table_count}; RLS enabled=${rls.rls_enabled_count}; FORCE RLS=${rls.force_rls_count}.`
  );
  console.log(`[production:db-inventory] auth users=${authUserCount}; storage objects=${storageObjectCount}.`);
  console.log(
    `[production:db-inventory] migrations repo=${localVersions.length}; remote=${remoteVersions.length}; missing_remote=${missingRemote.length}; unexpected_remote=${unexpectedRemote.length}.`
  );

  writeSummary({
    authUserCount,
    extensionCount,
    forceRlsCount: rls.force_rls_count,
    localMigrationCount: localVersions.length,
    missingRemoteCount: missingRemote.length,
    publicTableCount: rls.public_table_count,
    remoteMigrationCount: remoteVersions.length,
    rlsEnabledCount: rls.rls_enabled_count,
    serverVersion,
    storageObjectCount,
    unexpectedRemoteCount: unexpectedRemote.length
  });

  await client.query("rollback");
  console.log("[production:db-inventory] PASS inventory completed without database writes.");
} catch (error) {
  console.error(`[production:db-inventory] FAIL ${safeMessage(error)}`);
  process.exitCode = 1;
} finally {
  try {
    await client.query("rollback");
  } catch {
    // The transaction may not have started or may already be closed.
  }

  await client.end().catch(() => undefined);
}

async function relationCount(qualifiedName) {
  const present = scalar(await client.query("select to_regclass($1) is not null", [qualifiedName]));

  if (present !== true) return -1;

  if (qualifiedName === "auth.users") {
    return number(await client.query("select count(*)::int as value from auth.users"));
  }

  if (qualifiedName === "storage.objects") {
    return number(await client.query("select count(*)::int as value from storage.objects"));
  }

  return -1;
}

function scalar(result) {
  const row = first(result);
  return row[Object.keys(row)[0]];
}

function number(result) {
  return Number(scalar(result));
}

function first(result) {
  const row = result.rows[0];

  if (!row) throw new Error("A production inventory query returned no rows.");
  return row;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  let sanitized = message.replaceAll(connectionString, "[DATABASE_URL]");

  try {
    sanitized = sanitized.replaceAll(new URL(connectionString).hostname, "[DATABASE_HOST]");
  } catch {
    // Invalid connection URLs are reported without attempting additional parsing.
  }

  return sanitized;
}

function writeSummary(inventory) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const lines = [
    "## Read-only production database inventory",
    "",
    "- Transaction read-only: on",
    `- PostgreSQL: ${inventory.serverVersion}`,
    `- Extensions: ${inventory.extensionCount}`,
    `- Public tables: ${inventory.publicTableCount}`,
    `- RLS enabled: ${inventory.rlsEnabledCount}`,
    `- FORCE RLS: ${inventory.forceRlsCount}`,
    `- Auth users: ${inventory.authUserCount}`,
    `- Storage objects: ${inventory.storageObjectCount}`,
    `- Repository migrations: ${inventory.localMigrationCount}`,
    `- Remote migrations: ${inventory.remoteMigrationCount}`,
    `- Missing remotely: ${inventory.missingRemoteCount}`,
    `- Unexpected remotely: ${inventory.unexpectedRemoteCount}`,
    ""
  ];

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}
