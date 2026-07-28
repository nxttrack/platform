import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260729120000_daily_operational_cockpit.sql", import.meta.url),
  "utf8"
);

test("daily cockpit state and evidence are tenant scoped with forced RLS", () => {
  for (const table of ["operational_signal_states", "operational_signal_events"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
});

test("triage state cannot mutate source business entities", () => {
  assert.doesNotMatch(migration, /update public\.(participants|enrollments|sessions|slot_offers|billing_collection_attempts)/);
  assert.doesNotMatch(migration, /insert into public\.(messages|email_delivery_attempts)/);
  assert.match(migration, /status in \('open', 'acknowledged', 'snoozed', 'resolved'\)/);
});
