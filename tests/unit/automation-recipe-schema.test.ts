import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260727100000_automation_recipe_gallery.sql",
  import.meta.url
);
const runnerUrl = new URL(
  "../../apps/web/lib/domain/automation-recipes.ts",
  import.meta.url
);

test("automation configuration is owner/admin-only, including legacy rules", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const helper = extractBetween(
    sql,
    "create function app_private.current_user_can_manage_automation",
    "revoke all on function app_private.current_user_can_manage_automation"
  );

  assert.match(helper, /'platform_owner', 'platform_admin'/);
  assert.match(helper, /'tenant_owner', 'tenant_admin'/);
  assert.doesNotMatch(helper, /tenant_staff|instructor|parent/);
  assert.match(sql, /drop policy if exists "Tenant admins manage automation rules"/);
  assert.match(sql, /create policy "Tenant owners and admins manage automation rules"/);
  assert.match(sql, /app_private\.current_user_can_manage_automation\(tenant_id\)/);
});

test("database constraints enforce review-only execution and block live test data", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /tenant_automation_recipes_safety_check check \(review_only and not external_delivery_enabled\)/
  );
  assert.match(
    sql,
    /execution_mode <> 'live' or \(not is_test and journey_run_id is null\)/
  );
  assert.match(sql, /actions_taken_json = '\["simulation_only"\]'::jsonb/);
  assert.match(sql, /actions_taken_json = '\["review_task_created"\]'::jsonb/);
  assert.match(sql, /automation_recipe_runs_idempotency_unique unique \(tenant_id, idempotency_key\)/);
});

test("catalog seeds exactly the approved recipes with internal review actions", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  const keys = [
    "no_show_follow_up",
    "birthday_message",
    "offer_expiring",
    "long_absence",
    "diploma_achieved",
    "payment_failed",
    "makeup_credit_expiring",
    "graduation_reminder",
    "trial_lesson_follow_up",
    "waitlist_capacity_available"
  ];

  for (const key of keys) assert.match(sql, new RegExp(`'${key}'`));
  assert.equal(sql.match(/"type":"review_task"/g)?.length, 10);
  assert.doesNotMatch(sql, /"type":"(?:send_email|send_sms|send_whatsapp|start_payment|place_participant)"/);
  assert.match(sql, /"statuses":\["suggested"\]/);
});

test("tenant configuration and run audit tables have forced RLS", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of ["automation_recipes", "tenant_automation_recipes", "automation_recipe_runs"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(sql, /Tenant owners and admins view recipe configuration/);
  assert.match(sql, /Tenant owners and admins view recipe runs/);
});

test("runner only persists simulations, audit runs and internal review tasks", async () => {
  const source = await readFile(runnerUrl, "utf8");

  assert.match(source, /\.from\("automation_recipe_runs"\)/);
  assert.match(source, /\.from\("tenant_tasks"\)/);
  assert.match(source, /actions: \["simulation_only"\]/);
  assert.match(source, /actions_taken_json: \["review_task_created"\]/);
  assert.doesNotMatch(
    source,
    /\.from\("(?:tenant_notifications|payment_sessions|payment_attempts|slot_offers|group_memberships)"\)\s*\.(?:insert|update|upsert)/
  );
  assert.doesNotMatch(source, /sendgrid|twilio|whatsapp|mollie/i);
});

function extractBetween(input: string, start: string, end: string) {
  const from = input.indexOf(start);
  const to = input.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected section ${start}`);
  return input.slice(from, to);
}
