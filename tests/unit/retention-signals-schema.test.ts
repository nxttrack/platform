import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260729140000_explainable_retention_signals.sql", import.meta.url), "utf8");

test("attention signals, events and pauses are tenant scoped with forced RLS", () => {
  for (const table of ["enrollment_pause_periods", "participant_attention_signals", "participant_attention_events"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test("attention schema has no automatic adverse action or outbound communication", () => {
  assert.doesNotMatch(migration, /update public\.(enrollments|participants).*cancel/i);
  assert.doesNotMatch(migration, /insert into public\.(messages|email_delivery_attempts)/);
  assert.match(migration, /recommended_action/);
  assert.match(migration, /participant_attention_signal_id/);
});
