import assert from "node:assert/strict";
import { test } from "node:test";

import { childJourneyView, parentJourneyView } from "../../apps/web/lib/domain/portal-journey-view";
import { journeyFixture } from "../fixtures/portal-v42/canonical-journey";


test("parent and child use real mastery thresholds and canonical weighted progress/coverage", () => {
  for (const project of [parentJourneyView, childJourneyView]) {
    const view = project(journeyFixture())!;
    assert.equal(view.nodes.find((node) => node.id === "stable-a")?.completed, true);
    assert.equal(view.nodes.find((node) => node.id === "stable-b")?.completed, false);
    assert.equal(view.nodes[0].rating, 3);
    assert.equal(view.nodes[0].progressPercent, 60);
    assert.equal(view.rings[0].progressPercent, 73.1);
    assert.equal(view.rings[0].coveragePercent, 50);
    assert.equal(view.rings[0].formulaVersion, "swim_progress_v3");
    assert.equal(view.nodes[0].criterionIdentity, "identity-a");
    assert.equal(view.nodes[0].curriculumItemId, "a");
  }
});

test("repeated observations select the canonical latest observed time, finalized time and ID without mutating history", () => {
  const journey = journeyFixture(), original = journey.effectiveObservations[0];
  const older = { ...original, id: "observation-old", rating: 1 as const, observed_at: "2026-09-13T08:00:00Z", finalized_at: "2026-09-15T08:00:00Z" };
  const winner = { ...original, id: "observation-z", rating: 5 as const };
  for (const input of [[original, winner, older], [older, winner, original]]) {
    journey.effectiveObservations = input;
    for (const project of [parentJourneyView, childJourneyView]) assert.equal(project(journey)!.nodes.find((node) => node.curriculumItemId === "a")?.rating, 5);
    assert.deepEqual(journey.effectiveObservations, input);
  }
  journey.effectiveObservations = [winner, { ...original, id: "observation-a", rating: 2, finalized_at: "2026-09-14T08:06:00Z" }];
  assert.equal(parentJourneyView(journey)!.nodes.find((node) => node.curriculumItemId === "a")?.rating, 2);
});

test("correction preserves completion sequence and original time without inventing new dates", () => {
  const journey = journeyFixture(); journey.effectiveObservations[0].rating = 1;
  const view = childJourneyView(journey)!;
  assert.equal(view.nodes[0].completed, false);
  assert.equal(view.nodes[0].completionSequence, 2);
  assert.equal(view.nodes[0].completedAt, "2026-09-13T12:00:00Z");
  assert.equal(view.nodes[0].completionOrderStatus, "event_sequence");
  assert.equal(view.nodes[1].completedAt, null);
});

test("unknown progress remains unknown and private assessments/notes never enter either projection", () => {
  const journey = journeyFixture(); journey.projectionByScopeKey.clear(); journey.effectiveObservations[1].visibility = "internal";
  for (const project of [parentJourneyView, childJourneyView]) {
    const view = project(journey)!;
    assert.equal(view.rings[0].progressPercent, null);
    assert.equal(view.rings[0].coveragePercent, null);
    assert.equal(view.nodes.find((node) => node.id === "stable-b")?.rating, null);
    assert.equal(view.nodes.find((node) => node.id === "stable-b")?.progressPercent, null);
    assert.doesNotMatch(JSON.stringify(view), /PRIVATE_|private-session|Feedback b|context_json|correction_reason|"note"/);
  }
});

test("a parent update is not a child compliment until explicitly marked child-visible", () => {
  const journey = journeyFixture();
  assert.equal(parentJourneyView(journey)!.nodes[0].positiveLabel, "Feedback a");
  assert.equal(childJourneyView(journey)!.nodes[0].positiveLabel, null);
  journey.effectiveObservations[0].context_json.childVisible = true;
  assert.equal(childJourneyView(journey)!.nodes[0].positiveLabel, "Feedback a");
});

test("open carryover uses existing identity once and never creates a second assessment", () => {
  const journey = journeyFixture();
  journey.carryovers.push({ id: "carryover", participant_id: "participant", enrollment_id: "enrollment", curriculum_item_id: "b", curriculum_item_identity_id: "identity-b", from_stage_id: "previous", to_stage_id: "stage", transition_case_id: "transition", status: "open", completed_observation_id: null, completed_at: null });
  const before = JSON.stringify(journey);
  const view = childJourneyView(journey)!;
  assert.equal(view.nodes.length, 2);
  assert.equal(view.nodes.find((node) => node.id === "stable-b")?.state, "carryover");
  assert.equal(JSON.stringify(journey), before);
});
