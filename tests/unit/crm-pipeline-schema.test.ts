import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260729100000_premium_crm_pipeline.sql", import.meta.url),
  "utf8"
);

test("premium CRM tables are tenant scoped and forced through RLS", () => {
  for (const table of [
    "crm_pipeline_stage_history",
    "crm_contact_events",
    "crm_duplicate_candidates",
    "crm_merge_events",
    "crm_sla_policies"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test("duplicate merge is service-only, non-destructive and reversible", () => {
  assert.match(migration, /create or replace function app_private\.merge_crm_leads/);
  assert.match(migration, /create or replace function app_private\.revert_crm_lead_merge/);
  assert.match(migration, /revoke all on function app_private\.merge_crm_leads[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function app_private\.merge_crm_leads[\s\S]+to service_role/);
  assert.match(migration, /source_snapshot_json/);
  assert.match(migration, /merged_into_intake_id = p_target_intake_id/);
  assert.match(migration, /set status = 'reverted'/);
  assert.doesNotMatch(migration, /delete from public\.intake_submissions/);
});

test("CRM mutations require service role and preserve human decision boundaries", () => {
  assert.match(migration, /create or replace function app_private\.update_crm_lead/);
  assert.match(migration, /create or replace function app_private\.record_crm_contact/);
  assert.match(migration, /human_confirmed boolean not null default true/);
  assert.match(migration, /check \(human_confirmed\)/);
  assert.match(migration, /revoke all on function public\.update_crm_lead[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_crm_contact[\s\S]+to service_role/);
});
