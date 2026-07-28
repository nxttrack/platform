import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260729130000_instructor_replacement_assistant.sql", import.meta.url),
  "utf8"
);

test("replacement foundation is tenant scoped and forced through RLS", () => {
  for (const table of [
    "instructor_qualifications",
    "instructor_workload_limits",
    "instructor_absences",
    "instructor_replacement_requests",
    "instructor_replacement_events"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test("replacement requests preserve the human confirmation boundary", () => {
  assert.match(migration, /status = 'confirmed' and human_confirmed_at is not null and confirmed_by_user_id is not null/);
  assert.match(migration, /max_weekly_minutes/);
  assert.match(migration, /cross_location_buffer_minutes/);
  assert.doesNotMatch(migration, /insert into public\.session_instructor_assignments/);
  assert.doesNotMatch(migration, /insert into public\.(messages|email_delivery_attempts)/);
});
