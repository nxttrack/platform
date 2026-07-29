import assert from "node:assert/strict";
import test from "node:test";

import {
  computeSmartPlacementSuggestions,
  type SmartPlacementEntry,
  type SmartPlacementGroup
} from "../../apps/web/lib/domain/placement-contract";

const now = "2026-07-26T10:00:00.000Z";
const entry: SmartPlacementEntry = {
  id: "wait-1",
  programId: "program-a",
  stageId: "stage-1",
  status: "waiting",
  birthDate: "2020-04-20",
  eligibleFrom: null,
  minimumAgeBlocked: false,
  preferredDays: [3],
  preferredTimeWindows: [{ weekday: 3, startsAfter: "15:00", endsBefore: "17:00" }],
  preferredLocationId: "location-a",
  fifoRank: 1,
  fifoCohortSize: 10,
  paymentBlocked: false,
  siblingGroupIds: []
};
const group: SmartPlacementGroup = {
  id: "group-a",
  name: "Badje 1 woensdag",
  programId: "program-a",
  stageId: "stage-1",
  weekday: 3,
  startsAt: "16:00",
  locationId: "location-a",
  fixedCapacity: 8,
  usedCapacity: 7,
  projectedExits4Weeks: 1,
  projectedExits8Weeks: 2,
  hasInstructor: true,
  instructorOverloaded: false,
  hasResource: true,
  resourceConflict: false,
  averageAgeYears: 6.2,
  ageSampleSize: 7
};

test("returns a high-confidence explainable suggestion when proven signals align", () => {
  const [suggestion] = computeSmartPlacementSuggestions({ entry, groups: [group], now });

  assert.ok(suggestion);
  assert.equal(suggestion.canOffer, true);
  assert.equal(suggestion.blockers.length, 0);
  assert.ok(suggestion.score >= 80);
  assert.ok(suggestion.confidence >= 0.8);
  assert.ok(suggestion.reasons.some((reason) => reason.code === "fifo_priority"));
  assert.ok(suggestion.reasons.some((reason) => reason.code === "resource_available"));
  assert.ok(suggestion.reasons.every((reason) => reason.evidence.length > 0));
});

test("never lets expected outflow override a full group", () => {
  const [suggestion] = computeSmartPlacementSuggestions({
    entry,
    groups: [{ ...group, usedCapacity: 8, projectedExits4Weeks: 3, projectedExits8Weeks: 5 }],
    now
  });

  assert.equal(suggestion?.canOffer, false);
  assert.ok(suggestion?.blockers.some((blocker) => blocker.code === "no_capacity"));
  assert.ok(suggestion?.reasons.some((reason) => reason.code === "projected_flow" && reason.weight === 0));
});

test("surfaces every proven hard blocker instead of hiding the group", () => {
  const [suggestion] = computeSmartPlacementSuggestions({
    entry: {
      ...entry,
      status: "offered",
      minimumAgeBlocked: true,
      eligibleFrom: "2027-01-01",
      paymentBlocked: true
    },
    groups: [{
      ...group,
      stageId: "stage-2",
      hasInstructor: false,
      hasResource: false,
      resourceConflict: true
    }],
    now
  });
  const codes = suggestion?.blockers.map((blocker) => blocker.code) ?? [];

  assert.deepEqual(
    [...codes].sort(),
    ["instructor_missing", "payment_blocked", "resource_conflict", "under_minimum_age", "waitlist_not_approved", "wrong_stage"].sort()
  );
  assert.equal(suggestion?.canOffer, false);
  assert.ok(suggestion?.score <= 35);
});

test("FIFO influences ranking without becoming an adverse automatic decision", () => {
  const first = computeSmartPlacementSuggestions({
    entry: { ...entry, fifoRank: 1, fifoCohortSize: 20 },
    groups: [group],
    now
  })[0]!;
  const later = computeSmartPlacementSuggestions({
    entry: { ...entry, fifoRank: 18, fifoCohortSize: 20 },
    groups: [group],
    now
  })[0]!;

  assert.ok(first.score > later.score);
  assert.equal(first.canOffer, true);
  assert.equal(later.canOffer, true);
  assert.match(later.reasons.find((reason) => reason.code === "fifo_priority")?.evidence ?? "", /18 van 20/);
});
