import assert from "node:assert/strict";
import { test } from "node:test";

import { childJourneyView, parentJourneyView } from "../../apps/web/lib/domain/portal-journey-view";
import type { CanonicalSwimJourney, CanonicalCurriculumItem, CanonicalAssessmentObservation } from "../../apps/web/lib/domain/swim-progress";

function journeyFixture(): CanonicalSwimJourney {
  const item = (id: string, threshold: number): CanonicalCurriculumItem => ({ id, identity_id: `identity-${id}`, stable_key: `stable-${id}`, curriculum_version_id: "version", curriculum_stage_id: "stage", name: `Onderdeel ${id}`, description: "Beschrijving", context_json: { secret: "PRIVATE_ITEM_CONTEXT" }, weight: 3, mastery_threshold: threshold, contributes_to_stage: true, contributes_to_diploma: true, required_for_transition: true, required_for_graduation: true, sort_order: id === "a" ? 1 : 2 });
  const observation = (id: string, rating: 1 | 2 | 3 | 4 | 5): CanonicalAssessmentObservation => ({ id: `observation-${id}`, participant_id: "participant", enrollment_id: "enrollment", curriculum_version_id: "version", curriculum_item_id: id, rating, positive_label: `Feedback ${id}`, note: "PRIVATE_TEACHER_NOTE", visibility: "parent_visible", context_json: { private: "PRIVATE_OBSERVATION_CONTEXT", childVisible: false }, source: "instructor", observed_at: "2026-09-14T08:00:00Z", finalized_at: "2026-09-14T08:05:00Z", corrects_observation_id: null, correction_reason: null, session_id: "private-session" });
  const stage = { id: "stage", curriculum_version_id: "version", stable_key: "stage-key", name: "Niveau", description: null, color_hex: null, sort_order: 1 };
  const items = [item("a", 3), item("b", 5)];
  return { enrollmentId: "enrollment", participantId: "participant", version: { id: "version", program_id: "program", version_number: 2, name: "Leerplan", formula_version: "swim_progress_v3", weighting_enabled: true, status: "published" }, stages: [stage], currentStage: stage, items, currentStageItems: items, effectiveObservations: [observation("a", 3), observation("b", 4)], carryovers: [], itemCompletions: [{ id: "completion-a", enrollment_id: "enrollment", participant_id: "participant", curriculum_version_id: "version", curriculum_stage_id: "stage", curriculum_item_id: "a", completion_observation_id: "old-observation-a", completion_sequence: 2, completed_at: "2026-09-13T12:00:00Z", order_status: "event_sequence" }], chapterSnapshots: [], projectionByScopeKey: new Map([["diploma:diploma", { enrollment_id: "enrollment", participant_id: "participant", curriculum_version_id: "version", scope_kind: "diploma", scope_key: "diploma", scope_id: null, progress_fraction: 0.731, coverage_fraction: 0.5, assessed_count: 2, contributing_count: 4, formula_version: "swim_progress_v3", calculated_at: "2026-09-14T08:06:00Z" }]]), rings: [{ key: "diploma", kind: "diploma", label: "Diploma", progressPercent: 73.1, coveragePercent: 50, assessedCount: 2, contributingCount: 4, formulaVersion: "swim_progress_v3" }] };
}

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
