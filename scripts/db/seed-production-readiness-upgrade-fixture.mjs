#!/usr/bin/env node

import assert from "node:assert/strict";
import pg from "pg";

const connectionString = process.env.UPGRADE_FIXTURE_DATABASE_URL;
const mode = process.env.UPGRADE_FIXTURE_MODE ?? "clean";
assert.ok(connectionString, "UPGRADE_FIXTURE_DATABASE_URL is required");
assert.ok(["clean", "blocked"].includes(mode), "UPGRADE_FIXTURE_MODE must be clean or blocked");

const client = new pg.Client({ connectionString });
const ids = {
  tenants: ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002"],
  programs: ["30000000-0000-4000-8000-000000000001", "30000000-0000-4000-8000-000000000002"],
  stages: ["31000000-0000-4000-8000-000000000001", "31000000-0000-4000-8000-000000000002"],
  participants: ["40000000-0000-4000-8000-000000000001", "40000000-0000-4000-8000-000000000002"],
  enrollments: ["50000000-0000-4000-8000-000000000001", "50000000-0000-4000-8000-000000000002"],
  groups: ["60000000-0000-4000-8000-000000000001", "60000000-0000-4000-8000-000000000002"],
  imports: ["a0000000-0000-4000-8000-000000000001", "a0000000-0000-4000-8000-000000000002"]
};
const roleNames = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor", "parent", "athlete"];
const users = ids.tenants.flatMap((tenantId, tenantIndex) =>
  roleNames.map((role, roleIndex) => ({
    id: `2${tenantIndex}${roleIndex}00000-0000-4000-8000-000000000001`,
    tenantId,
    role,
    email: `upgrade-${tenantIndex}-${roleIndex}@example.test`
  }))
);

try {
  await client.connect();
  await client.query("begin");

  for (const user of users) {
    await client.query(
      `insert into auth.users (
        id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) values ($1, 'authenticated', 'authenticated', $2, '{}'::jsonb, '{}'::jsonb, now(), now())`,
      [user.id, user.email]
    );
    await client.query(
      "insert into public.profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do nothing",
      [user.id, user.email, `Synthetic ${user.role}`]
    );
  }

  await client.query(
    `insert into public.tenants (id, slug, name, status) values
      ($1, 'upgrade-tenant-a', 'Synthetic Upgrade Tenant A', 'active'),
      ($2, 'upgrade-tenant-b', 'Synthetic Upgrade Tenant B', 'active')`,
    ids.tenants
  );
  for (const user of users) {
    await client.query(
      "insert into public.tenant_memberships (tenant_id, user_id, role, status) values ($1, $2, $3, 'active')",
      [user.tenantId, user.id, user.role]
    );
  }

  for (let index = 0; index < 2; index += 1) {
    const tenantId = ids.tenants[index];
    const parent = userFor(index, "parent");
    const owner = userFor(index, "tenant_owner");
    await client.query(
      `insert into public.programs (id, tenant_id, name, code, status)
       values ($1, $2, $3, $4, 'active')`,
      [ids.programs[index], tenantId, `Synthetic Program ${index + 1}`, `UP${index + 1}`]
    );
    await client.query(
      `insert into public.program_stages (id, tenant_id, program_id, name, code, sort_order)
       values ($1, $2, $3, $4, $5, 1)`,
      [ids.stages[index], tenantId, ids.programs[index], `Synthetic Stage ${index + 1}`, `US${index + 1}`]
    );
    await client.query(
      `insert into public.participants (
        id, tenant_id, guardian_user_id, display_name, birth_date, external_reference, status
      ) values ($1, $2, $3, $4, date '2018-01-01', $5, 'active')`,
      [ids.participants[index], tenantId, parent.id, `Synthetic Child ${index + 1}`, `upgrade-p-${index + 1}`]
    );
    await client.query(
      `insert into public.participant_guardians (
        tenant_id, participant_id, guardian_user_id, relationship, access_level, status
      ) values ($1, $2, $3, 'parent', 'primary', 'active')`,
      [tenantId, ids.participants[index], parent.id]
    );
    await client.query(
      `insert into public.enrollments (
        id, tenant_id, participant_id, guardian_user_id, program_id, current_stage_id, status, starts_on
      ) values ($1, $2, $3, $4, $5, $6, 'active', current_date - 30)`,
      [ids.enrollments[index], tenantId, ids.participants[index], parent.id, ids.programs[index], ids.stages[index]]
    );
    await client.query(
      `insert into public.groups (
        id, tenant_id, program_id, stage_id, name, code, status, capacity,
        regular_capacity, flex_capacity, trial_capacity, hard_capacity
      ) values ($1, $2, $3, $4, $5, $6, 'active', 6, 4, 0, 2, 6)`,
      [ids.groups[index], tenantId, ids.programs[index], ids.stages[index], `Synthetic Group ${index + 1}`, `UG${index + 1}`]
    );
    await client.query(
      `insert into public.group_memberships (
        id, tenant_id, group_id, enrollment_id, participant_id, status, starts_on, capacity_bucket
      ) values ($1, $2, $3, $4, $5, $6, current_date - 7, $7)`,
      [
        `70000000-0000-4000-8000-00000000000${index + 1}`,
        tenantId,
        ids.groups[index],
        ids.enrollments[index],
        ids.participants[index],
        index === 0 ? "active" : "trial",
        index === 0 ? "regular" : "trial"
      ]
    );
    await client.query(
      `insert into public.auth_invitations (
        id, email, tenant_id, role, invited_by_user_id, status, delivery_status, expires_at
      ) values ($1, $2, $3, 'parent', $4, 'pending', 'pending', now() + interval '7 days')`,
      [`80000000-0000-4000-8000-00000000000${index + 1}`, `queued-${index}@example.test`, tenantId, owner.id]
    );
    await client.query(
      `insert into public.tenant_onboarding_runs (
        id, tenant_id, status, current_step, draft_data, created_by_user_id
      ) values ($1, $2, 'draft', 'owner', $3::jsonb, $4)`,
      [
        `90000000-0000-4000-8000-00000000000${index + 1}`,
        tenantId,
        JSON.stringify({ idempotencyKey: `clean-upgrade-key-${index}`, organization: { fixture: index } }),
        owner.id
      ]
    );
    await client.query(
      `insert into public.import_jobs (
        id, tenant_id, import_type, source_name, status, row_count, valid_count,
        created_by_user_id, rollback_manifest
      ) values ($1, $2, 'participants', $3, 'ready', 1, 1, $4, $5::jsonb)`,
      [
        ids.imports[index],
        tenantId,
        `synthetic-upgrade-${index}.csv`,
        owner.id,
        JSON.stringify([{ table: "participants", id: ids.participants[index] }])
      ]
    );
    await client.query(
      `insert into public.import_job_events (
        tenant_id, import_job_id, event_type, actor_user_id, details
      ) values ($1, $2, 'uploaded', $3, '{"fixture":"upgrade"}'::jsonb)`,
      [tenantId, ids.imports[index], owner.id]
    );
    await client.query(
      `insert into public.email_delivery_attempts (
        id, tenant_id, recipient_user_id, recipient_email, subject, status, error_message
      ) values ($1, $2, $3, $4, 'Synthetic upgrade fixture', $5, $6)`,
      [
        `b0000000-0000-4000-8000-00000000000${index + 1}`,
        tenantId,
        parent.id,
        parent.email,
        index === 0 ? "pending" : "failed",
        index === 0 ? null : "synthetic_retryable_failure"
      ]
    );
  }

  if (mode === "blocked") {
    await client.query(
      `insert into public.group_memberships (
        id, tenant_id, group_id, enrollment_id, participant_id, status, starts_on, capacity_bucket
      ) values ('70000000-0000-4000-8000-000000000099', $1, $2, $3, $4, 'trial', current_date, 'trial')`,
      [ids.tenants[0], ids.groups[0], ids.enrollments[0], ids.participants[0]]
    );
    await client.query(
      "update public.import_jobs set status = 'applying' where id = $1",
      [ids.imports[0]]
    );
    await client.query(
      `insert into public.auth_invitations (
        id, email, tenant_id, role, invited_by_user_id, status, delivery_status, expires_at
      ) values ('80000000-0000-4000-8000-000000000099', 'broken-lineage@example.test', $1,
        'parent', $2, 'accepted', 'sent', now() + interval '7 days')`,
      [ids.tenants[0], userFor(0, "tenant_owner").id]
    );
    await client.query(
      `insert into public.tenant_onboarding_runs (
        id, tenant_id, status, current_step, draft_data, created_by_user_id
      ) values
        ('90000000-0000-4000-8000-000000000098', $1, 'draft', 'owner', $3::jsonb, $2),
        ('90000000-0000-4000-8000-000000000099', $1, 'draft', 'owner', $4::jsonb, $2)`,
      [
        ids.tenants[0],
        userFor(0, "tenant_owner").id,
        JSON.stringify({ idempotencyKey: "conflicting-upgrade-key", organization: { name: "A" } }),
        JSON.stringify({ idempotencyKey: "conflicting-upgrade-key", organization: { name: "B" } })
      ]
    );

    const hasOutbox = await client.query("select to_regclass('public.email_outbox') is not null as exists");
    if (hasOutbox.rows[0].exists) {
      const outbox = await client.query(
        `select public.enqueue_email_outbox(
          $1, 'invitation', 'blocked-expired-worker-lease',
          '{"fixture":"upgrade","recipient":"synthetic"}'::jsonb,
          'auth_invitation', '80000000-0000-4000-8000-000000000001', 5
        ) as id`,
        [ids.tenants[0]]
      );
      await client.query("select * from public.claim_email_outbox(1, 30)");
      await client.query(
        "update public.email_outbox set lease_expires_at = now() - interval '1 minute' where id = $1",
        [outbox.rows[0].id]
      );
    }
  }

  await client.query("commit");
  console.log(`[seed:production-readiness-upgrade] PASS ${mode} fixture with two tenants and twelve role identities.`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end().catch(() => undefined);
}

function userFor(tenantIndex, role) {
  return users.find((user) => user.tenantId === ids.tenants[tenantIndex] && user.role === role);
}
