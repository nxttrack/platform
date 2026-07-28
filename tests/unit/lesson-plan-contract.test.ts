import assert from "node:assert/strict";
import test from "node:test";

import { buildLessonPlanProposal } from "../../apps/web/lib/domain/lesson-plan-contract";

test("lesson plan assistant creates bounded explainable plans from positive focus cards", () => {
  const proposal = buildLessonPlanProposal({
    sessionId: "session-1",
    groupName: "Badje 2 dinsdag",
    stageName: "Badje 2",
    durationMinutes: 45,
    now: new Date("2026-07-29T10:00:00.000Z"),
    focusCards: [
      {
        participantId: "p1",
        participantName: "Mila",
        points: [
          { label: "Rustig uitademen onder water", explanation: "Recente observatie.", sourceType: "low_skill" },
          { label: "Rugdrijven", explanation: "Herhaling helpt.", sourceType: "unstable_skill" }
        ]
      },
      {
        participantId: "p2",
        participantName: "Noah",
        points: [
          { label: "Rustig uitademen onder water", explanation: "Groepsfocus.", sourceType: "group_bottleneck" }
        ]
      },
      {
        participantId: "p3",
        participantName: "Yara",
        points: [
          { label: "Beenslag", explanation: "Recente observatie.", sourceType: "low_skill" }
        ]
      }
    ]
  });

  assert.equal(proposal.groupGoals[0].label, "Rustig uitademen onder water");
  assert.equal(proposal.groupGoals[0].evidenceCount, 2);
  assert.ok(proposal.groupGoals.length <= 3);
  assert.equal(proposal.personalAttention.length, 3);
  assert.ok(proposal.exercises.length >= 3);
  assert.ok(proposal.exercises.every((exercise) => exercise.durationMinutes >= 4));
  assert.ok(proposal.equipment.includes("duikringen"));
  assert.equal(proposal.confidence, "gemiddeld");
  assert.equal(proposal.humanApprovalRequired, true);
  assert.equal(proposal.sourceData.engineVersion, "lesson-plan-rules-v1");
});

test("lesson plan assistant degrades safely without observations", () => {
  const proposal = buildLessonPlanProposal({
    sessionId: "session-2",
    groupName: "Instroomgroep",
    stageName: null,
    durationMinutes: 45,
    focusCards: []
  });
  assert.equal(proposal.confidence, "laag");
  assert.equal(proposal.groupGoals.length, 1);
  assert.match(proposal.groupGoals[0].label, /veilig/i);
  assert.equal(proposal.personalAttention.length, 0);
  assert.match(proposal.reasons.join(" "), /menselijke goedkeuring/i);
});
