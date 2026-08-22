import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260822225251_production_readiness_certification.sql", import.meta.url),
  "utf8"
);
const outboxWorker = readFileSync(new URL("../../apps/web/lib/email/outbox.ts", import.meta.url), "utf8");

function functionSource(name: string) {
  const replaceStart = migration.indexOf(`create or replace function ${name}`);
  const start = replaceStart === -1 ? migration.indexOf(`create function ${name}`) : replaceStart;
  assert.notEqual(start, -1, `${name} must be replaced additively`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} must have a complete body`);
  return migration.slice(start, end + 4);
}

test("authenticated clients cannot mutate service-owned import state or durable rows", () => {
  assert.match(migration, /revoke insert, update, delete on public\.import_jobs from authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.import_rows from authenticated/);
  assert.match(migration, /revoke insert, update, delete on public\.import_job_events from authenticated/);
});

test("provider acceptance evidence is immutable to client roles", () => {
  assert.match(migration, /prevent_client_provider_acceptance_mutation/);
  for (const table of ["auth_invitations", "tenant_notifications", "slot_offers"]) {
    assert.match(migration, new RegExp(`before insert or update on public\\.${table}`));
  }
});

test("guardian materialization is create-only and preserves the global profile", () => {
  const source = functionSource("public.materialize_import_guardian_invitation");
  assert.match(source, /on conflict \(id\) do nothing/);
  assert.doesNotMatch(source, /full_name\s*=\s*coalesce\(excluded\.full_name/);
  assert.match(source, /Import guardian membership already exists/);
});

test("rollback owns generated guardian links and refuses unmanifested dependants", () => {
  assert.match(migration, /'participant_guardians'/);
  assert.match(migration, /capture_import_participant_guardian_manifest/);
  const source = functionSource("public.rollback_import_chunk");
  assert.match(source, /rollback_import_chunk_v1_unsafe/);
  assert.match(migration, /assert_import_target_unreferenced\(tg_relid, old\.tenant_id, old\.id\)/);
  assert.match(migration, /before delete on public\.groups/);
  assert.match(migration, /before delete on public\.participants/);
});

test("the mail worker claims one item only when it is ready to send", () => {
  assert.match(outboxWorker, /target_limit:\s*1/);
  assert.match(outboxWorker, /minimumEmailOutboxLeaseSeconds/);
  assert.doesNotMatch(outboxWorker, /target_limit:\s*input\.limit\s*\?\?\s*25/);
});
