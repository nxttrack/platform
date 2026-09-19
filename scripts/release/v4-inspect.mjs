import pg from "pg";
const client = new pg.Client({connectionString: process.env.DATABASE_URL, statement_timeout: 15000});
try {
  await client.connect();
  await client.query("begin read only isolation level repeatable read");
  const tables = await client.query("select tablename from pg_tables where schemaname='public' order by tablename");
  const existing = new Set(tables.rows.map(r => r.tablename));
  const counts = {};
  for (const table of ["tenants","profiles","participants","enrollments","group_memberships","invoices","auth_invitations","tenant_onboarding_runs","import_jobs","email_outbox","email_delivery_attempts","tenant_swim_rollouts","platform_memberships"])
    if (existing.has(table)) counts[table] = (await client.query(`select count(*)::int n from public.${table}`)).rows[0].n;
  console.log(JSON.stringify({target:process.env.TARGET, counts}));
  for (const table of ["tenants","platform_email_settings","tenant_swim_rollouts","platform_memberships","tenant_portal_preferences"])
    if (existing.has(table)) console.log(table, (await client.query("select column_name,data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",[table])).rows);
  console.log("tenants", (await client.query("select id,slug,status from public.tenants order by slug")).rows);
  if (existing.has("tenant_swim_rollouts")) console.log("rollouts", (await client.query("select tenant_id,feature_key,status from public.tenant_swim_rollouts where feature_key like 'swim.portal.%' order by tenant_id,feature_key")).rows);
  console.log("buckets", (await client.query("select id,public from storage.buckets order by id")).rows);
  console.log("migration_count", (await client.query("select count(*)::int n, max(version) latest from supabase_migrations.schema_migrations")).rows);
  await client.query("rollback");
} finally { await client.end(); }
