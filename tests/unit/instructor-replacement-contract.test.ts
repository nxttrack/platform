import assert from "node:assert/strict";
import test from "node:test";

import {
  rankInstructorReplacements,
  type InstructorReplacementInput
} from "../../apps/web/lib/domain/instructor-replacement-contract";

const session = {
  id: "session",
  programId: "program",
  stageId: "stage",
  locationId: "pool-a",
  startsAt: "2026-08-03T16:00:00Z",
  endsAt: "2026-08-03T16:45:00Z"
};

function instructor(overrides: Partial<InstructorReplacementInput> = {}): InstructorReplacementInput {
  return {
    instructorId: "instructor",
    displayName: "Sanne Vermeer",
    qualifications: [{ programId: "program", stageId: "stage", resourceId: "pool-a", status: "active", validFrom: null, validUntil: null }],
    availability: [{ weekday: 1, startsAt: "15:00", endsAt: "18:00", type: "available", startsOn: null, endsOn: null }],
    scheduledSessions: [],
    weeklyMinutes: 300,
    dailyMinutes: 90,
    dailySessions: 2,
    limits: {
      maxWeeklyMinutes: 1200,
      maxDailyMinutes: 360,
      maxConsecutiveMinutes: 180,
      maxSessionsPerDay: 8,
      minimumBreakMinutes: 15,
      crossLocationBufferMinutes: 45
    },
    ...overrides
  };
}

test("replacement assistant ranks qualified, available and conflict-free instructors", () => {
  const result = rankInstructorReplacements({ session, instructors: [instructor()], now: new Date("2026-07-30T10:00:00Z") });
  assert.equal(result[0].actionable, true);
  assert.ok(result[0].score >= 80);
  assert.ok(result[0].reasons.includes("exacte niveaukwalificatie"));
});

test("qualification, availability and workload are hard blockers", () => {
  const result = rankInstructorReplacements({
    session,
    instructors: [instructor({
      qualifications: [],
      availability: [],
      dailyMinutes: 350,
      limits: { ...instructor().limits, maxDailyMinutes: 360 }
    })],
    now: new Date("2026-07-30T10:00:00Z")
  });
  assert.equal(result[0].actionable, false);
  assert.match(result[0].blockers.join(" "), /kwalificatie/);
  assert.match(result[0].blockers.join(" "), /beschikbaarheid/);
  assert.match(result[0].blockers.join(" "), /dagbelasting/);
});

test("cross-location travel buffer prevents unsafe back-to-back replacement", () => {
  const result = rankInstructorReplacements({
    session,
    instructors: [instructor({
      scheduledSessions: [{ sessionId: "previous", locationId: "pool-b", startsAt: "2026-08-03T15:00:00Z", endsAt: "2026-08-03T15:45:00Z" }]
    })],
    now: new Date("2026-07-30T10:00:00Z")
  });
  assert.equal(result[0].actionable, false);
  assert.match(result[0].blockers.join(" "), /reistijd/);
});
