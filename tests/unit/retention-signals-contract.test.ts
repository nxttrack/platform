import assert from "node:assert/strict";
import test from "node:test";

import { detectParticipantAttentionSignals, type ParticipantEngagementInput } from "../../apps/web/lib/domain/retention-signals-contract";

function input(overrides: Partial<ParticipantEngagementInput> = {}): ParticipantEngagementInput {
  return {
    participantId: "participant",
    participantName: "Mila",
    enrollmentId: "enrollment",
    recentAttendance: ["absent", "absent", "absent", "present", "present", "present", "present"],
    previousAttendance: ["present", "present", "present", "present", "present", "present"],
    daysSinceProgress: 55,
    overdueAmountCents: 0,
    openParentQuestions: 0,
    pauseExpectedReturnOn: null,
    cancellationsLast60Days: 0,
    isTest: false,
    ...overrides
  };
}

test("attention engine explains absence, participation and progress signals", () => {
  const result = detectParticipantAttentionSignals(input(), new Date("2026-07-29T00:00:00Z"));
  assert.ok(result.some((signal) => signal.type === "repeated_absence"));
  assert.ok(result.some((signal) => signal.type === "declining_participation"));
  assert.ok(result.some((signal) => signal.type === "progress_stall"));
  assert.ok(result.every((signal) =>
    signal.reasons.length > 0
    && (signal.recommendedAction.includes("persoonlijk") || signal.recommendedAction.includes("instructeur"))
  ));
});

test("financial and parent-question signals propose human review without adverse labels", () => {
  const result = detectParticipantAttentionSignals(input({ recentAttendance: [], previousAttendance: [], daysSinceProgress: null, overdueAmountCents: 12500, openParentQuestions: 2 }));
  assert.deepEqual(result.map((signal) => signal.type).sort(), ["open_parent_question", "unpaid_balance"]);
  assert.doesNotMatch(result.map((signal) => `${signal.title} ${signal.summary}`).join(" "), /slechte klant|uitschrijven/i);
});

test("Journey Bot data never becomes a live personal-attention signal", () => {
  assert.equal(detectParticipantAttentionSignals(input({ isTest: true })).length, 0);
});
