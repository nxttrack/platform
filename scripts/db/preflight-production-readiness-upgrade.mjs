#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const connectionString = process.env.UPGRADE_PREFLIGHT_DATABASE_URL;
assert.ok(connectionString, "UPGRADE_PREFLIGHT_DATABASE_URL is required");

const expectedMigrationHashes = {
  "20260822002234_production_email_outbox.sql": "a41443e10ebb53934ba6403552fbdad9174bbdd394c446caac87cfc745514b42",
  "20260822004329_atomic_tenant_provisioning.sql": "b6c4a1dc74ff0813c47a58ad195b86b065b7db1d13144467129b224b94925816",
  "20260822010612_atomic_core_onboarding_writes.sql": "352ba1dba8bc393228719959cbbbf7725d217d2b6210ca88b299b0014572a433",
  "20260822012255_resumable_import_apply_rollback.sql": "6997c62c3ab1f35fdb7e1c2106c292081cb05231422ca255756af0b9eb0764e2"
};
const expectedBuckets = [
  "badge-studio-assets",
  "diploma-vault",
  "participant-media",
  "tenant-documents",
  "tenant-media-assets"
];
const report = {
  result: "PASS",
  readOnly: true,
  blockers: [],
  warnings: [],
  inventory: {},
  migrationFingerprint: {}
};
const client = new pg.Client({ connectionString, application_name: "nxttrack-upgrade-preflight-read-only" });

try {
  await client.connect();
  await client.query("begin read only isolation level repeatable read");

  for (const [file, expectedSha256] of Object.entries(expectedMigrationHashes)) {
    const actualSha256 = createHash("sha256")
      .update(readFileSync(join(rootDir, "supabase", "migrations", file)))
      .digest("hex");
    report.migrationFingerprint[file] = { sha256: actualSha256, matchesExpected: actualSha256 === expectedSha256 };
    if (actualSha256 !== expectedSha256) {
      block("migration_fingerprint_mismatch", [file]);
    }
  }

  const migrationHistory = await client.query(
    "select version from supabase_migrations.schema_migrations order by version"
  );
  report.inventory.migrationCount = migrationHistory.rowCount;
  report.inventory.latestMigration = migrationHistory.rows.at(-1)?.version ?? null;

  const duplicateMemberships = await client.query(`
    select tenant_id, group_id, enrollment_id, array_agg(id order by id) as record_ids
    from public.group_memberships
    where status in ('active', 'trial')
    group by tenant_id, group_id, enrollment_id
    having count(*) > 1
    order by tenant_id, group_id, enrollment_id
  `);
  report.inventory.liveGroupMembershipDuplicateCount = duplicateMemberships.rowCount;
  if (duplicateMemberships.rowCount > 0) {
    block("duplicate_live_group_memberships", duplicateMemberships.rows);
  }

  const hasManifest = await tableExists("public", "import_manifest_entries");
  const manifestlessImports = hasManifest
    ? await client.query(`
        select job.id, job.tenant_id, job.status
        from public.import_jobs job
        where job.status in ('applying', 'failed')
          and not exists (
            select 1 from public.import_manifest_entries manifest
            where manifest.tenant_id = job.tenant_id and manifest.import_job_id = job.id
          )
        order by job.tenant_id, job.id
      `)
    : await client.query(`
        select id, tenant_id, status
        from public.import_jobs
        where status in ('applying', 'failed')
        order by tenant_id, id
      `);
  report.inventory.manifestlessActiveImportCount = manifestlessImports.rowCount;
  if (manifestlessImports.rowCount > 0) {
    block("legacy_import_without_durable_manifest", manifestlessImports.rows);
  }

  const incompleteOnboarding = await client.query(`
    select id, tenant_id, status, current_step
    from public.tenant_onboarding_runs
    where status not in ('ready', 'opened', 'cancelled')
    order by tenant_id nulls first, id
  `);
  report.inventory.incompleteOnboardingRunCount = incompleteOnboarding.rowCount;
  if (incompleteOnboarding.rowCount > 0) {
    warn("incomplete_onboarding_runs_require_operator_awareness", incompleteOnboarding.rows);
  }

  const legacyIdempotencyConflicts = await client.query(`
    with candidates as (
      select id, tenant_id,
        coalesce(nullif(draft_data ->> 'idempotencyKey', ''), nullif(draft_data ->> 'provisioningRequestId', '')) as legacy_key,
        md5((draft_data - 'idempotencyKey' - 'provisioningRequestId')::text) as payload_fingerprint
      from public.tenant_onboarding_runs
    )
    select legacy_key, array_agg(id order by id) as record_ids,
      count(distinct payload_fingerprint)::integer as distinct_payloads
    from candidates
    where legacy_key is not null
    group by legacy_key
    having count(*) > 1 and count(distinct payload_fingerprint) > 1
    order by legacy_key
  `);
  report.inventory.legacyIdempotencyConflictCount = legacyIdempotencyConflicts.rowCount;
  if (legacyIdempotencyConflicts.rowCount > 0) {
    block("conflicting_legacy_idempotency_keys", legacyIdempotencyConflicts.rows);
  }

  const invitationAuthLineageInconsistencies = await client.query(`
    select id, tenant_id, status,
      case
        when status = 'accepted' and invited_user_id is null then 'accepted_without_auth_user'
        when status = 'accepted' and accepted_at is null then 'accepted_without_timestamp'
      end as reason
    from public.auth_invitations
    where status = 'accepted' and (invited_user_id is null or accepted_at is null)
    order by tenant_id nulls first, id
  `);
  report.inventory.invitationInconsistencyCount = invitationAuthLineageInconsistencies.rowCount;
  if (invitationAuthLineageInconsistencies.rowCount > 0) {
    block("invitation_auth_lineage_inconsistencies", invitationAuthLineageInconsistencies.rows);
  }

  const expiredPendingInvitations = await client.query(`
    select id, tenant_id, status, 'expired_but_pending' as reason
    from public.auth_invitations
    where status = 'pending' and expires_at <= now()
    order by tenant_id nulls first, id
  `);
  report.inventory.expiredPendingInvitationCount = expiredPendingInvitations.rowCount;
  if (expiredPendingInvitations.rowCount > 0) {
    warn("expired_pending_invitations_require_operator_awareness", expiredPendingInvitations.rows);
  }

  const legacyMail = await client.query(`
    select status, count(*)::integer as count, array_agg(id order by id) as record_ids
    from public.email_delivery_attempts
    where status in ('pending', 'failed')
    group by status
    order by status
  `);
  report.inventory.legacyQueuedOrFailedEmail = legacyMail.rows;
  if (legacyMail.rowCount > 0) {
    warn("legacy_email_attempts_require_reconciliation", legacyMail.rows);
  }

  if (await tableExists("public", "email_outbox")) {
    const expiredLeases = await client.query(`
      select id, tenant_id, status, attempts
      from public.email_outbox
      where status = 'processing' and lease_expires_at <= now()
      order by tenant_id nulls first, id
    `);
    report.inventory.expiredEmailWorkerLeaseCount = expiredLeases.rowCount;
    if (expiredLeases.rowCount > 0) {
      block("expired_email_worker_leases", expiredLeases.rows);
    }
    const noncanonicalKeys = await client.query(`
      select id, tenant_id
      from public.email_outbox
      where idempotency_key !~ '^[a-z0-9][a-z0-9:._@+\\-]{7,199}$'
      order by tenant_id nulls first, id
    `);
    report.inventory.noncanonicalEmailIdempotencyKeyCount = noncanonicalKeys.rowCount;
    if (noncanonicalKeys.rowCount > 0) {
      block("noncanonical_email_outbox_idempotency_keys", noncanonicalKeys.rows);
    }
  } else {
    report.inventory.expiredEmailWorkerLeaseCount = 0;
    report.inventory.noncanonicalEmailIdempotencyKeyCount = 0;
  }

  const buckets = await client.query("select id, public from storage.buckets order by id");
  report.inventory.buckets = buckets.rows;
  if (
    buckets.rows.length !== expectedBuckets.length ||
    buckets.rows.some((bucket, index) => bucket.id !== expectedBuckets[index] || bucket.public !== false)
  ) {
    block("unexpected_storage_bucket_inventory", buckets.rows);
  }

  const grantFindings = [];
  for (const table of ["core_write_operations", "email_outbox", "email_outbox_events", "import_manifest_entries"]) {
    if (!(await tableExists("public", table))) continue;
    const grants = await client.query(
      `select
        has_table_privilege('anon', $1, 'insert,update,delete') as anon_mutation,
        has_table_privilege('authenticated', $1, 'insert,update,delete') as authenticated_mutation`,
      [`public.${table}`]
    );
    if (grants.rows[0].anon_mutation || grants.rows[0].authenticated_mutation) {
      grantFindings.push({ object: `public.${table}`, ...grants.rows[0] });
    }
  }
  if (await migrationApplied("20260822225251")) {
    for (const table of ["import_jobs", "import_rows", "import_job_events"]) {
      const grants = await client.query(
        "select has_table_privilege('authenticated', $1, 'insert,update,delete') as authenticated_mutation",
        [`public.${table}`]
      );
      if (grants.rows[0].authenticated_mutation) {
        grantFindings.push({ object: `public.${table}`, ...grants.rows[0] });
      }
    }
  }
  report.inventory.unexpectedGrantCount = grantFindings.length;
  if (grantFindings.length > 0) {
    block("unexpected_client_mutation_grants", grantFindings);
  }

  report.result = report.blockers.length === 0 ? "PASS" : "BLOCKED";
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.blockers.length === 0 ? 0 : 2;
} finally {
  await client.query("rollback").catch(() => undefined);
  await client.end().catch(() => undefined);
}

async function tableExists(schema, table) {
  const result = await client.query("select to_regclass($1) is not null as exists", [`${schema}.${table}`]);
  return result.rows[0].exists;
}

async function migrationApplied(version) {
  const result = await client.query(
    "select exists(select 1 from supabase_migrations.schema_migrations where version = $1) as applied",
    [version]
  );
  return result.rows[0].applied;
}

function block(code, records) {
  report.blockers.push({ code, count: records.length, records });
}

function warn(code, records) {
  report.warnings.push({ code, count: records.length, records });
}
