import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260802220000_rolling_analytics_and_capacity_forecasts.sql",
    import.meta.url
  ),
  "utf8"
);

test("flow evidence, snapshots, forecasts and accuracy are tenant scoped with forced RLS", () => {
  for (const table of [
    "swim_lifecycle_events",
    "swim_flow_metric_snapshots",
    "capacity_forecast_runs",
    "capacity_forecast_results",
    "capacity_forecast_accuracy",
    "capacity_soft_reservations"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant select on public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
  assert.match(migration, /'analytics\.read'/);
  assert.match(migration, /'forecast\.read'/);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all) on public\.capacity_forecast_results to authenticated/
  );
});

test("lifecycle events are append-only, source reconciled and formula-versioned", () => {
  assert.match(migration, /create trigger swim_lifecycle_events_append_only/);
  assert.match(migration, /Swim lifecycle events are append-only/);
  assert.match(migration, /reconcile_swim_lifecycle_events/);
  assert.match(migration, /swim_flow_v3\.0\.0/);
  assert.match(migration, /capacity_forecast_v3\.0\.0/);
  for (const source of [
    "waitlist_entries",
    "intake_conversion_lineage",
    "enrollments",
    "enrollment_stage_assignments",
    "swim_transition_cases",
    "certificate_records",
    "group_memberships"
  ]) {
    assert.match(migration, new RegExp(source));
  }
});

test("rolling snapshots expose daily/monthly grains, cohorts and data quality", () => {
  assert.match(migration, /grain in \('daily', 'monthly'\)/);
  assert.match(migration, /cohorts_json jsonb/);
  assert.match(migration, /data_quality_json jsonb/);
  assert.match(migration, /window_start date/);
  assert.match(migration, /window_end date/);
  assert.match(migration, /tenant_timezone text/);
  assert.match(migration, /source_event_watermark/);
});

test("forecast ranges, scenarios and accuracy are constrained", () => {
  assert.match(migration, /earliest_availability_on <= likely_availability_on/);
  assert.match(migration, /likely_availability_on <= latest_availability_on/);
  assert.match(migration, /conservative_openings <= likely_openings/);
  assert.match(migration, /likely_openings <= optimistic_openings/);
  assert.match(migration, /absolute_error_days/);
  assert.match(migration, /within_predicted_range/);
  assert.match(migration, /evaluation_status in \('observed', 'no_opening', 'insufficient_evidence'\)/);
});

test("soft reservations require review, expire and protect physical capacity", () => {
  assert.match(migration, /status text not null default 'pending_approval'/);
  assert.match(migration, /forecast\.hold\.manage/);
  assert.match(migration, /review_capacity_soft_reservation/);
  assert.match(migration, /expire_capacity_soft_reservations/);
  assert.match(migration, /Physical group capacity exceeded by soft reservation/);
  assert.match(migration, /reservation\.status = 'approved'/);
  assert.match(migration, /reservation\.expires_at > now\(\)/);
  assert.match(migration, /no row enrolls a learner/i);
});
