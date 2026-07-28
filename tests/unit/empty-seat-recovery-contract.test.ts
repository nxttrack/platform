import assert from "node:assert/strict";
import test from "node:test";

import { calculateEmptySeatRecovery, type EmptySeatCandidateInput } from "../../apps/web/lib/domain/empty-seat-recovery-contract";

const opening = {
  id: "opening",
  sessionId: "session",
  groupId: "group",
  programId: "program",
  stageId: "stage",
  locationId: "location",
  startsAt: "2026-08-03T16:00:00.000Z",
  capacity: 8,
  occupied: 8,
  cancellationSeats: 1,
  activeHolds: 0
};

function candidate(id: string, overrides: Partial<EmptySeatCandidateInput> = {}): EmptySeatCandidateInput {
  return {
    id,
    type: "waitlist",
    displayName: id,
    programId: "program",
    stageId: "stage",
    preferredWeekdays: [1],
    preferredWindows: [{ weekday: 1, startsAfter: "15:00", endsBefore: "18:00" }],
    fifoRank: 1,
    creditExpiresOn: null,
    familyGroupDays: [1],
    familyLocationIds: ["location"],
    isTest: false,
    ...overrides
  };
}

test("recovery ranks explainable, blocker-free candidates and predicts 24h fill", () => {
  const result = calculateEmptySeatRecovery({
    opening,
    candidates: [candidate("a"), candidate("b", { type: "makeup", fifoRank: null, creditExpiresOn: "2026-08-02" }), candidate("c")],
    now: new Date("2026-07-30T10:00:00Z")
  });
  assert.ok(result);
  assert.equal(result.availableSeats, 1);
  assert.equal(result.recoveryBand, "within_24h");
  assert.equal(result.actionableCount, 3);
  assert.match(result.summary, /binnen 24 uur/);
  assert.ok(result.candidates[0].reasons.includes("niveau past exact"));
});

test("FIFO remains a blocker and is never silently overridden by a high score", () => {
  const result = calculateEmptySeatRecovery({
    opening,
    candidates: [candidate("second", { fifoRank: 2 })],
    now: new Date("2026-07-30T10:00:00Z")
  });
  assert.ok(result);
  assert.equal(result.actionableCount, 0);
  assert.equal(result.recoveryBand, "manual_outreach");
  assert.match(result.candidates[0].blockers.join(" "), /FIFO-positie 2/);
});

test("Journey Bot candidates never enter live recovery advice", () => {
  const result = calculateEmptySeatRecovery({
    opening,
    candidates: [candidate("test", { isTest: true })],
    now: new Date("2026-07-30T10:00:00Z")
  });
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
  assert.equal(result.recoveryBand, "no_match");
});

test("no snapshot is produced without real capacity or for a past lesson", () => {
  assert.equal(calculateEmptySeatRecovery({ opening: { ...opening, cancellationSeats: 0 }, candidates: [], now: new Date("2026-07-30T10:00:00Z") }), null);
  assert.equal(calculateEmptySeatRecovery({ opening, candidates: [], now: new Date("2026-08-04T10:00:00Z") }), null);
});
