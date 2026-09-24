#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { adminPublicationWindowsSql, adminSessionWindowsSql, requireAdminSessionWindows } from "./admin-session-windows.mjs";

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const phaseStatePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 admin preparation is restricted to staging.nxttrack.nl.");
}

if (!existsSync(phaseStatePath)) {
  throw new Error(`Phase 16 state is missing at ${phaseStatePath}.`);
}

const phase = JSON.parse(readFileSync(phaseStatePath, "utf8"));
if (!phase.tenant?.id || !phase.expected?.groupId || !phase.users?.instructor?.id
  || phase.appUrl !== appUrl || phase.tenant.slug !== "aquaswim-demo") {
  throw new Error("Phase 16 state must identify the staging demo tenant, group and instructor.");
}

let database;
let project;
try {
  database = new URL(process.env.DATABASE_URL);
  project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
} catch { throw new Error("Staging database configuration is required to find available admin lesson times."); }
if (!project || !(database.hostname === `db.${project}.supabase.co`
  || (database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username) === `postgres.${project}`))) {
  throw new Error("Database identity must match the configured staging Supabase project.");
}
let client;
try {
  client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
    query_timeout: 20_000
  });
  await client.connect();
  await client.query("begin isolation level repeatable read read only");
  await client.query("set local statement_timeout = '15s'");
  const group = await client.query(`
    select lesson_group.default_resource_id, (now() at time zone 'Europe/Amsterdam')::date::text as today
    from public.groups lesson_group
    join public.tenants tenant on tenant.id=lesson_group.tenant_id
    join public.tenant_domains domain on domain.tenant_id=tenant.id
    where lesson_group.tenant_id=$1 and lesson_group.id=$2
      and tenant.slug='aquaswim-demo' and domain.hostname='aquaswim-demo.staging.nxttrack.nl'
      and domain.status='verified'
  `, [phase.tenant.id, phase.expected.groupId]);
  if (group.rowCount !== 1 || !group.rows[0].default_resource_id) {
    throw new Error("The staging fixture must have one verified tenant and a structured group resource.");
  }
  const resourceId = group.rows[0].default_resource_id;
  const result = await client.query(adminSessionWindowsSql, [phase.tenant.id, resourceId, phase.users.instructor.id, group.rows[0].today]);
  const sessionWindows = requireAdminSessionWindows(result.rows);
  const publicationResult = await client.query(adminPublicationWindowsSql, [phase.tenant.id, resourceId, phase.users.instructor.id, group.rows[0].today]);
  const publicationWindows = requireAdminSessionWindows(publicationResult.rows);
  await client.query("commit");
  phase.adminPlanning = { resourceId, sessionWindows, publicationWindows };
  writeFileSync(phaseStatePath, `${JSON.stringify(phase, null, 2)}\n`, { mode: 0o600 });
  console.log("[sprint4:prepare-admin] PASS available manual and published lesson windows selected without changing remote data.");
} catch (error) {
  const knownReasons = [
    "The staging fixture must have one verified tenant and a structured group resource.",
    "Two distinct free admin lesson dates are required."
  ];
  console.error("[sprint4:prepare-admin] Failed to prepare available lesson windows", {
    code: typeof error.code === "string" ? error.code : "fixture_error",
    reason: knownReasons.includes(error.message) ? error.message : "Staging read or local state write failed."
  });
  process.exitCode = 1;
} finally {
  await client?.end();
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
