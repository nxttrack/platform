import assert from "node:assert/strict";
import test from "node:test";

import {
  prioritizeOperationalSignals,
  type OperationalSignal
} from "../../apps/web/lib/domain/operational-cockpit-contract";

function signal(overrides: Partial<OperationalSignal> = {}): OperationalSignal {
  return {
    key: "session:one",
    type: "session_without_instructor",
    entityType: "session",
    entityId: "11111111-1111-4111-8111-111111111111",
    title: "Les zonder instructeur",
    summary: "Menselijke planning nodig.",
    evidence: ["Geen actieve koppeling"],
    priority: "high",
    dueAt: "2026-07-30T10:00:00Z",
    href: "/admin/agenda",
    actionLabel: "Open planning",
    fingerprint: "version-1",
    ...overrides
  };
}

test("cockpit ranks overdue and critical work first", () => {
  const result = prioritizeOperationalSignals({
    signals: [
      signal(),
      signal({ key: "failed:one", type: "automation_failure", entityType: "automation_run", priority: "critical", dueAt: null })
    ],
    states: [],
    now: new Date("2026-07-30T12:00:00Z")
  });
  assert.equal(result[0].key, "failed:one");
  assert.equal(result[0].window, "now");
  assert.equal(result[1].window, "now");
});

test("same-version resolved and active snoozed signals stay out of the work queue", () => {
  const base = signal();
  const states = [{
    id: "state",
    signalKey: base.key,
    sourceFingerprint: base.fingerprint,
    status: "resolved" as const,
    snoozedUntil: null,
    assignedToUserId: null
  }];
  assert.equal(prioritizeOperationalSignals({ signals: [base], states }).length, 0);
  assert.equal(prioritizeOperationalSignals({
    signals: [base],
    states: [{ ...states[0], status: "snoozed", snoozedUntil: "2099-01-01T00:00:00Z" }]
  }).length, 0);
});

test("new evidence reopens an otherwise resolved signal", () => {
  const result = prioritizeOperationalSignals({
    signals: [signal({ fingerprint: "version-2" })],
    states: [{
      id: "state",
      signalKey: "session:one",
      sourceFingerprint: "version-1",
      status: "resolved",
      snoozedUntil: null,
      assignedToUserId: null
    }]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].stateStatus, "new");
});
