import assert from "node:assert/strict";
import { test } from "node:test";
import { journeyFixture } from "../fixtures/portal-v42/canonical-journey";
import { chapterJourneyView, childDevelopmentView, parentDevelopmentView } from "../../apps/web/lib/domain/portal-development-view";

test("development retains school order and real thresholds independently of the personal route order", () => {
  const journey = journeyFixture();
  journey.currentStageItems = journey.items.slice(1);
  const view = parentDevelopmentView(journey);
  assert.deepEqual(view.items.map((item) => item.id), ["stable-a", "stable-b"]);
  assert.equal(view.items[0].masteryThreshold, 3); assert.equal(view.items[0].completed, true);
  assert.equal(view.items[0].current, false); assert.equal(view.items[1].current, true);
});

test("history distinguishes corrections and retractions without reviving them as current scores", () => {
  const journey = journeyFixture(), old = journey.effectiveObservations[0];
  const corrected = { ...old, id: "correction", rating: 2 as const, observed_at: "2026-09-14T09:00:00Z", corrects_observation_id: old.id };
  const retracted = { ...old, id: "retracted", rating: 5 as const, observed_at: "2026-09-14T10:00:00Z" };
  journey.effectiveObservations = [corrected];
  journey.assessmentHistory = [{ ...old, historyStatus: "corrected" }, { ...corrected, historyStatus: "recorded" }, { ...retracted, historyStatus: "retracted" }];
  const view = parentDevelopmentView(journey);
  assert.equal(view.items[0].rating, 2); assert.equal(view.items[0].completed, false);
  assert.deepEqual(view.history.map((row) => [row.id, row.status, row.current]), [["retracted", "retracted", false], ["correction", "recorded", true], [old.id, "corrected", false]]);
  assert.equal(view.history[1].previousRating, 3); assert.equal(view.history[1].correction, true);
  assert.equal(view.items[0].completedAt, "2026-09-13T12:00:00Z");
});

test("child history contains only explicit compliments and neither audience receives private context", () => {
  const journey = journeyFixture(), source = journey.effectiveObservations[0];
  journey.assessmentHistory = [{ ...source, historyStatus: "recorded" }, { ...source, id: "private", positive_label: "PRIVATE_LABEL", visibility: "internal", historyStatus: "recorded" }];
  assert.equal(parentDevelopmentView(journey).history[0].positiveLabel, "Feedback a");
  assert.equal(childDevelopmentView(journey).history[0].positiveLabel, null);
  journey.assessmentHistory[0].context_json.childVisible = true;
  assert.equal(childDevelopmentView(journey).history[0].positiveLabel, "Feedback a");
  for (const project of [parentDevelopmentView, childDevelopmentView]) {
    const view = project(journey); assert.equal(view.history.length, 1);
    assert.doesNotMatch(JSON.stringify(view), /PRIVATE_|context_json|private-session|"note"|correction_reason/);
  }
});

test("missing previous assessments remain unknown, including a correction of a private observation", () => {
  const journey = journeyFixture();
  journey.effectiveObservations[0].corrects_observation_id = "unavailable-private-source";
  for (const project of [parentDevelopmentView, childDevelopmentView]) {
    const view = project(journey); assert.equal(view.history.find((row) => row.itemId === "stable-a")?.previousRating, null);
    assert.doesNotMatch(JSON.stringify(view), /unavailable-private-source/);
  }
});

test("chapter projection reads frozen scores and dates without filling gaps from today's assessments", () => {
  const journey = journeyFixture();
  const snapshot = { id: "chapter", enrollment_id: "enrollment", participant_id: "participant", curriculum_version_id: "version", curriculum_stage_id: "stage", transition_case_id: "transition", theme_key: "theme", theme_release: "1.0.0", artwork_id: "stored", route_order_json: ["stable-b", "stable-a"], completion_data_json: { visibility: "parent_visible", items: [{ stableKey: "stable-a", name: "Historische naam", rating: 1, completedAt: null, lastUpdatedAt: "2026-09-12T08:00:00Z", private: "PRIVATE_ARCHIVE_CONTEXT" }] }, badge_award_ids: [], completed_at: "2026-09-13T08:00:00Z" };
  const before = chapterJourneyView(journey, snapshot);
  assert.deepEqual(before.nodes.map((item) => [item.id, item.rating, item.completedAt]), [["stable-b", null, null], ["stable-a", 1, null]]);
  assert.equal(before.nodes[1].label, "Historische naam");
  journey.effectiveObservations.forEach((row) => { row.rating = 5; row.finalized_at = "2026-09-15T08:00:00Z"; });
  assert.deepEqual(chapterJourneyView(journey, snapshot), before);
  snapshot.completion_data_json.visibility = "unknown";
  const opaque = chapterJourneyView(journey, snapshot);
  assert.equal(opaque.nodes.find((node) => node.id === "stable-a")?.rating, null);
  assert.equal(opaque.nodes.find((node) => node.id === "stable-a")?.lastUpdatedAt, null);
  assert.doesNotMatch(JSON.stringify(before), /PRIVATE_|2026-09-15|note|context_json/);
});

test("a captured chapter retains its own curriculum metadata across a later curriculum version", () => {
  const journey = journeyFixture();
  const snapshot = { id: "older-chapter", enrollment_id: "enrollment", participant_id: "participant", curriculum_version_id: "old-version", curriculum_stage_id: "old-stage", transition_case_id: "transition", theme_key: "theme", theme_release: "1.0.0", artwork_id: "stored", route_order_json: ["old-stable"], completion_data_json: { visibility: "parent_visible", programId: "old-program", stageName: "Bewaarde naam", items: [{ stableKey: "old-stable", itemId: "old-item", identityId: "old-identity", name: "Bewaard onderdeel", masteryThreshold: 3, rating: 3, completedAt: "2026-08-01T08:00:00Z", completionSequence: 7, completionOrderStatus: "event_sequence" }] }, badge_award_ids: [], completed_at: "2026-08-02T08:00:00Z" };
  const view = chapterJourneyView(journey, snapshot);
  assert.equal(view.programId, "old-program"); assert.equal(view.stageName, "Bewaarde naam");
  assert.equal(view.nodes[0].label, "Bewaard onderdeel"); assert.equal(view.nodes[0].completed, true);
  assert.equal(view.nodes[0].completionSequence, 7); assert.equal(view.nodes[0].completedAt, "2026-08-01T08:00:00Z");
  assert.equal(view.nodes[0].completionOrderStatus, "event_sequence"); assert.deepEqual(view.rings, []);
});
