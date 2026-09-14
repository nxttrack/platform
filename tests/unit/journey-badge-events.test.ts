import assert from "node:assert/strict";
import { test } from "node:test";
import { journeyBadgeEvents, type JourneyBadgeAward } from "../../apps/web/lib/domain/journey-badge-events";
import { buildJourneyTimeline } from "../../apps/web/lib/theme/portal-journey-contract";
import { parentJourneyView } from "../../apps/web/lib/domain/portal-journey-view";
import { journeyFixture } from "../fixtures/portal-v42/canonical-journey";

test("Journey award projection preserves earned release content, allowlists context and follows the existing eligibility contract", () => {
  const journey = journeyFixture();
  const award: JourneyBadgeAward = { id: "award", title: "Historical title", awardedAt: "2026-09-14T08:00:00Z", description: "Earned description", isSurprise: false, triggerEventType: "skill_completed", triggerContext: { entityId: journey.effectiveObservations[0].id, privateNote: "NEVER_SERIALIZE" } };
  const [event] = journeyBadgeEvents(journey, [award]);
  assert.equal(event.anchorNodeId, "stable-a"); assert.equal(event.label, "Historical title"); assert.equal(event.description, "Earned description");
  assert.doesNotMatch(JSON.stringify(event), /NEVER_SERIALIZE|entityId|triggerContext/);
  assert.deepEqual(journeyBadgeEvents(journey, [{ ...award, triggerEventType: null }]), []);
  assert.equal(journeyBadgeEvents(journey, [{ ...award, triggerEventType: null, isSurprise: true }])[0].eventType, "surprise_badge");
  assert.equal(journeyBadgeEvents(journey, [{ ...award, triggerEventType: null, triggerContext: { showInJourney: true } }]).length, 1);
  journey.effectiveObservations[0].visibility = "internal";
  assert.equal(journeyBadgeEvents(journey, [award])[0].anchorNodeId, null);
});

test("moments do not change completion order, coverage, current goal or criterion count; repeated awards are deduplicated", () => {
  const model = parentJourneyView(journeyFixture())!;
  const nodes = model.nodes.map((node) => ({ ...node, progressPercent: node.progressPercent ?? 0 }));
  const event = { id: "award", label: "Historical badge", earnedAt: "2026-09-14T08:00:00Z", eventType: "badge" as const, anchorNodeId: "stable-a" };
  const before = buildJourneyTimeline({ nodes }); const after = buildJourneyTimeline({ nodes, events: [event, event] });
  assert.deepEqual(after.orderedNodes, before.orderedNodes); assert.equal(after.currentGoalId, before.currentGoalId);
  assert.equal(after.entries.filter((entry) => entry.kind === "main").length, nodes.length);
  assert.equal(after.entries.flatMap((entry) => entry.kind === "event_cluster" ? entry.events : []).length, 1);
});
