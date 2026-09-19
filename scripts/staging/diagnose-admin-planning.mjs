#!/usr/bin/env node

import pg from "pg";
import { adminPublicationWindowsSql, adminSessionWindowsSql, requireAdminSessionWindows } from "./admin-session-windows.mjs";

// No Auth requests, fixture preparation, writes, stored procedures, or session export.
const { APP_ENV, APP_URL, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SOURCE_RUN_ID, GITHUB_TOKEN } = process.env;
if (APP_ENV !== "staging" || APP_URL !== "https://staging.nxttrack.nl") {
  throw new Error("Planning diagnosis is restricted to staging.nxttrack.nl.");
}
if (!/^\d{1,16}$/.test(SOURCE_RUN_ID ?? "") || !GITHUB_TOKEN || !DATABASE_URL || !NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Planning diagnosis requires a deployment run and staging configuration.");
}
const database = parseConfigurationUrl(DATABASE_URL);
const project = parseConfigurationUrl(NEXT_PUBLIC_SUPABASE_URL).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
if (!project || !(database.hostname === `db.${project}.supabase.co`
  || (database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username) === `postgres.${project}`))) {
  throw new Error("Database identity must match the configured staging Supabase project.");
}
const runResponse = await fetch(`https://api.github.com/repos/nxttrack/platform/actions/runs/${SOURCE_RUN_ID}`, {
  headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json" },
  signal: AbortSignal.timeout(15_000)
});
if (!runResponse.ok) throw new Error("Cannot verify the source deployment run.");
const run = await runResponse.json();
if (run.path !== ".github/workflows/deploy.yml" || run.head_branch !== "main" || run.conclusion !== "failure") {
  throw new Error("Source must be a failed canonical deployment.");
}
const healthResponse = await fetch(`${APP_URL}/api/health`, { signal: AbortSignal.timeout(15_000) });
if (!healthResponse.ok) throw new Error("Staging health is unavailable.");
const health = await healthResponse.json();
if (!health.ok || health.env !== "staging" || health.commitSha !== run.head_sha) {
  throw new Error("Active staging release must match the failed deployment.");
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
  query_timeout: 20_000
});
try {
  await client.connect();
  await client.query("begin isolation level repeatable read read only");
  await client.query("set local statement_timeout = '15s'");
  const tenant = await client.query(`
    select tenant.id from public.tenants tenant
    join public.tenant_domains domain on domain.tenant_id=tenant.id
    where tenant.slug='aquaswim-demo'
      and domain.hostname='aquaswim-demo.staging.nxttrack.nl'
      and domain.status='verified'
  `);
  if (tenant.rowCount !== 1) throw new Error("Expected staging tenant identity was not found.");
  const tenantId = tenant.rows[0].id;
  const groups = await client.query(`
    select lesson_group.id, code, created_at, default_resource_id,
      (now() at time zone 'Europe/Amsterdam')::date::text as today,
      (select instructor_user_id from public.group_instructor_assignments assignment
        where assignment.tenant_id=$1 and assignment.group_id=lesson_group.id
          and assignment.status='active' order by instructor_user_id limit 1) as instructor_id
    from public.groups lesson_group where tenant_id=$1 and code = any($2::text[])
    order by code
  `, [tenantId, [0, 1].map((retry) => `sprint4-admin-group-${SOURCE_RUN_ID}-${run.run_attempt}-${retry}`)]);
  if (groups.rowCount === 0) throw new Error("No groups from the failed admin journey were found.");
  console.log("[admin-planning]", JSON.stringify({ sourceRunId: SOURCE_RUN_ID, sourceSha: run.head_sha, readOnly: true, groups: groups.rowCount }));
  for (const group of groups.rows) {
    const retry = Number(group.code.slice(-1));
    const numericRunId = Number(SOURCE_RUN_ID);
    const start = new Date(group.created_at);
    start.setUTCDate(start.getUTCDate() + 1 + numericRunId % 12);
    start.setUTCHours(2 + Math.floor(numericRunId / 13) % 3, Math.floor(numericRunId / 39) % 50 + retry * 5, 0, 0);
    const end = new Date(start.getTime() + 45 * 60_000);
    // Test runner uses UTC. Inspect both UTC and Amsterdam server interpretations
    // because the existing action parses a datetime-local value without an offset.
    for (const zone of ["UTC", "Europe/Amsterdam"]) {
      const conflicts = await client.query(`
        with recursive bounds as (
          select $4::timestamp at time zone $6 as starts_at, $5::timestamp at time zone $6 as ends_at
        ), ancestors as (
          select id, parent_resource_id from public.resources where tenant_id=$1 and id=$3
          union
          select parent.id, parent.parent_resource_id from public.resources parent
          join ancestors child on child.parent_resource_id=parent.id where parent.tenant_id=$1
        ), descendants as (
          select id from public.resources where tenant_id=$1 and id=$3
          union
          select child.id from public.resources child join descendants parent on child.parent_resource_id=parent.id
          where child.tenant_id=$1
        )
        select
          (select count(*) from public.session_resource_reservations reservation, bounds
            where reservation.tenant_id=$1 and reservation.status='active'
              and reservation.resource_id in (select id from ancestors union select id from descendants)
              and reservation.starts_at < bounds.ends_at and reservation.ends_at > bounds.starts_at) as resource_conflicts,
          (select count(*) from public.season_blackout_periods blackout, bounds
            where blackout.tenant_id=$1 and blackout.status='published'
              and (blackout.resource_id is null or blackout.resource_id=$3)
              and blackout.starts_at < bounds.ends_at and blackout.ends_at > bounds.starts_at) as closure_conflicts,
          (select count(*) from public.session_instructor_reservations reservation, bounds
            where reservation.tenant_id=$1 and reservation.status='active'
              and reservation.starts_at < bounds.ends_at and reservation.ends_at > bounds.starts_at
              and reservation.instructor_user_id in (
                select instructor_user_id from public.group_instructor_assignments assignment
                where assignment.tenant_id=$1 and assignment.group_id=$2 and assignment.status='active'
                  and (assignment.starts_on is null or assignment.starts_on <= (bounds.starts_at at time zone 'UTC')::date)
                  and (assignment.ends_on is null or assignment.ends_on >= (bounds.starts_at at time zone 'UTC')::date)
              )) as instructor_conflicts
      `, [tenantId, group.id, group.default_resource_id, start.toISOString().slice(0, 19), end.toISOString().slice(0, 19), zone]);
      console.log("[admin-planning]", JSON.stringify({ retry, zone, start: start.toISOString().slice(0, 16), resourcePresent: Boolean(group.default_resource_id), ...conflicts.rows[0] }));
    }
    if (!group.instructor_id) throw new Error("Diagnostic group has no active instructor assignment.");
    const available = await client.query(adminSessionWindowsSql, [tenantId, group.default_resource_id, group.instructor_id, group.today]);
    const windows = requireAdminSessionWindows(available.rows);
    const publications = await client.query(adminPublicationWindowsSql, [tenantId, group.default_resource_id, group.instructor_id, group.today]);
    const publicationWindows = requireAdminSessionWindows(publications.rows);
    console.log("[admin-planning-available]", JSON.stringify({ retry, windows, publicationWindows }));
  }
  const constraints = await client.query(`
    select conname, pg_get_constraintdef(oid) as definition from pg_catalog.pg_constraint
    where conrelid='public.sessions'::regclass order by conname
  `);
  const triggers = await client.query(`
    select t.tgname, p.proname, md5(p.prosrc) as body_hash
    from pg_catalog.pg_trigger t join pg_catalog.pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.sessions'::regclass and not t.tgisinternal order by t.tgname
  `);
  const columns = await client.query(`
    select column_name, is_nullable, column_default from information_schema.columns
    where table_schema='public' and table_name='sessions' order by ordinal_position
  `);
  console.log("[admin-planning-schema]", JSON.stringify({ constraints: constraints.rows, triggers: triggers.rows, columns: columns.rows }));
  await client.query("commit");
} catch (error) {
  // Avoid connection strings, query values, or database rows in error output.
  console.error("[admin-planning] Diagnosis failed", { code: typeof error.code === "string" ? error.code : "diagnostic_error" });
  process.exitCode = 1;
} finally {
  await client.end();
}

function parseConfigurationUrl(value) {
  try { return new URL(value); } catch { throw new Error("Invalid staging connection configuration."); }
}
