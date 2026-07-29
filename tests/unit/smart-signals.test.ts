import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  smartEventDescription,
  smartEventLabel,
  smartEventTypes,
  toSmartActivityItem
} from "../../apps/web/lib/domain/smart-event-contract";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260726210000_data_quality_smart_signals.sql", import.meta.url),
  "utf8"
);

test("houdt het TypeScript- en database-eventcontract gelijk", () => {
  assert.equal(smartEventTypes.length, 20);

  for (const eventType of smartEventTypes) {
    assert.match(migration, new RegExp(`'${eventType}'`));
    assert.notEqual(smartEventLabel(eventType), eventType.replaceAll("_", " "));
  }
});

test("maakt activiteiten begrijpelijk zonder technische metadata te tonen", () => {
  const activity = toSmartActivityItem({
    id: "event-a",
    event_type: "slot_offer_expiring",
    severity: "warning",
    occurred_at: "2026-07-26T12:00:00.000Z",
    source: "signal_sweep",
    is_test: false,
    metadata_json: { reason: "De reactietermijn verloopt binnen 24 uur." }
  });

  assert.equal(activity.eventType, "slot_offer_expiring");
  assert.equal(smartEventDescription(activity), "De reactietermijn verloopt binnen 24 uur.");
});

test("dwingt tenant-isolatie, append-only gebruik en complete Journey cleanup af", () => {
  assert.match(migration, /alter table public\.smart_events force row level security/);
  assert.match(migration, /for select\s+to authenticated\s+using \(app_private\.current_user_can_manage_tenant_domain\(tenant_id\)\)/);
  assert.match(migration, /smart_events are append-only and cannot be updated/);
  assert.match(migration, /grant select on public\.smart_events to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete|all) on public\.smart_events to authenticated/);
  assert.match(migration, /delete from public\.smart_events\s+where journey_run_id = target_run_id\s+and is_test/);
  assert.match(migration, /'smart_signal_snapshots', deleted_snapshot_count/);
});

test("schrijft de vereiste triggers en centrale helper in de migratie", () => {
  assert.match(migration, /create or replace function app_private\.record_smart_event/);
  assert.match(migration, /create trigger intake_submissions_capture_smart_event/);
  assert.match(migration, /create trigger waitlist_entries_capture_smart_event/);
  assert.match(migration, /create trigger group_memberships_capture_capacity_signal/);
  assert.match(migration, /new\.duplicate_state = 'possible_duplicate'/);
});
