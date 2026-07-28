import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260729110000_empty_seat_recovery.sql", import.meta.url),
  "utf8"
);

test("empty-seat recovery tables are tenant scoped and forced through RLS", () => {
  for (const table of ["empty_seat_recovery_snapshots", "empty_seat_recovery_candidates", "empty_seat_recovery_events"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
});

test("recovery schema contains no automatic offer, booking or message mutation", () => {
  assert.doesNotMatch(migration, /insert into public\.slot_offers/);
  assert.doesNotMatch(migration, /insert into public\.catch_up_requests/);
  assert.doesNotMatch(migration, /insert into public\.messages/);
  assert.match(migration, /status in \('suggested', 'review_task_created', 'opened'/);
});
