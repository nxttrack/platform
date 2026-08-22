#!/usr/bin/env node

import pg from "pg";

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const databaseUrl = process.env.DATABASE_URL || "";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Live FORCE RLS verification is restricted to staging.nxttrack.nl.");
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for live FORCE RLS verification.");
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const result = await client.query(`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as force_rls_enabled
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relname
  `);
  const missing = result.rows.filter((row) => !row.rls_enabled || !row.force_rls_enabled);

  if (result.rows.length === 0) {
    throw new Error("Dynamic public-table inventory is empty.");
  }

  if (missing.length > 0) {
    throw new Error(`Public tables without ENABLE+FORCE RLS: ${missing.map((row) => row.table_name).join(", ")}.`);
  }

  console.log(`[db:verify-force-rls] PASS ${result.rows.length} public table(s) have ENABLE and FORCE ROW LEVEL SECURITY.`);
} finally {
  await client.end();
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
