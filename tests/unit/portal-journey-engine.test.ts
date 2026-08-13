import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  buildJourneyTimeline,
  classifyJourneyGesture,
  focusedJourneyWindow,
  journeyRouteGeometry,
  journeyNodeFocusPosition,
  journeyNodePosition,
  orderJourneyNodes,
  resolveJourneyDestination,
  selectDefaultJourneyNode
} from "../../apps/web/lib/theme/portal-journey-contract";

const root = path.resolve(import.meta.dirname, "../..");

test("Journey Engine positioneert 3, 5, 9 en 14 onderdelen binnen desktop en mobiel canvas", () => {
  for (const count of [3, 5, 9, 14]) {
    const positions = Array.from({ length: count }, (_, index) => journeyNodePosition(index, count));
    assert.equal(new Set(positions.map((position) => position.desktopXPercent)).size, count);
    for (const position of positions) {
      assert.ok(position.desktopXPercent >= 0 && position.desktopXPercent <= 100);
      assert.ok(position.desktopYPercent >= 0 && position.desktopYPercent <= 100);
      assert.ok(position.mobileXPercent >= 0 && position.mobileXPercent <= 100);
      assert.ok(position.mobileYPercent >= 0 && position.mobileYPercent <= 100);
    }
  }
});

test("hoogste onvoltooide voortgang is standaard actief en voltooid blijft chronologisch", () => {
  const nodes = [
    { id: "a", label: "A", progressPercent: 100, completed: true, completedAt: "2026-08-01T10:00:00Z", curriculumOrder: 1 },
    { id: "b", label: "B", progressPercent: 80, completed: false, curriculumOrder: 2 },
    { id: "c", label: "C", progressPercent: 40, completed: false, curriculumOrder: 3 }
  ];
  assert.equal(selectDefaultJourneyNode(nodes)?.id, "b");
  assert.deepEqual(orderJourneyNodes(nodes).map((node) => node.id), ["a", "b", "c"]);
  assert.deepEqual(nodes.map((node) => node.id), ["a", "b", "c"]);
});

test("current goal en selected entry blijven afzonderlijke concepten", () => {
  const nodes = [
    { id: "done", label: "Klaar", progressPercent: 100, completed: true, completedAt: "2026-08-01T10:00:00Z", completionSequence: 1, curriculumOrder: 1 },
    { id: "current", label: "Doel", progressPercent: 80, completed: false, curriculumOrder: 2 },
    { id: "future", label: "Later", progressPercent: 20, completed: false, curriculumOrder: 3 }
  ];
  const timeline = buildJourneyTimeline({ nodes });
  assert.equal(timeline.currentGoalId, "current");
  assert.deepEqual(timeline.orderedNodes.map((node) => node.id), ["done", "current", "future"]);
  const selectedEntryId = "done";
  assert.equal(selectedEntryId, "done");
  assert.equal(timeline.currentGoalId, "current");
});

test("completion sequence is leidend, stabiel en gebruikt id als gelijke-timestamp-tiebreaker", () => {
  const sequenced = [
    { id: "b", label: "B", progressPercent: 100, completed: true, completedAt: "2026-08-01T10:00:00Z", completionSequence: 2, curriculumOrder: 1 },
    { id: "a", label: "A", progressPercent: 100, completed: true, completedAt: "2026-08-01T10:00:00Z", completionSequence: 1, curriculumOrder: 2 }
  ];
  assert.deepEqual(orderJourneyNodes(sequenced).map((node) => node.id), ["a", "b"]);
  const legacy = sequenced.map(({ completionSequence: _completionSequence, ...node }) => node);
  assert.deepEqual(orderJourneyNodes(legacy).map((node) => node.id), ["a", "b"]);
});

test("late/backdated events wijzigen bevroren completionvolgorde of current goal niet", () => {
  const nodes = [
    { id: "tweede", progressPercent: 100, completed: true, completedAt: "2026-08-08T10:00:00Z", completionSequence: 2, curriculumOrder: 1 },
    { id: "eerste", progressPercent: 100, completed: true, completedAt: "2026-08-09T10:00:00Z", completionSequence: 1, curriculumOrder: 2 },
    { id: "actueel", progressPercent: 70, completed: false, curriculumOrder: 3 }
  ];
  const before = buildJourneyTimeline({ nodes });
  const after = buildJourneyTimeline({ nodes, events: [{
    anchorNodeId: "eerste",
    earnedAt: "2026-07-01T10:00:00Z",
    eventType: "badge",
    id: "late-backdated",
    label: "Later ontvangen"
  }] });
  assert.deepEqual(before.orderedNodes.map((node) => node.id), ["eerste", "tweede", "actueel"]);
  assert.deepEqual(after.orderedNodes.map((node) => node.id), before.orderedNodes.map((node) => node.id));
  assert.equal(after.currentGoalId, "actueel");
  assert.equal(after.entries.filter((entry) => entry.kind === "event_cluster").length, 1);
});

test("volledig afgeronde journey heeft geen stale current goal", () => {
  const nodes = Array.from({ length: 4 }, (_, index) => ({
    id: `done-${index}`,
    progressPercent: 100,
    completed: true,
    completedAt: `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z`,
    completionSequence: index + 1,
    curriculumOrder: index
  }));
  const timeline = buildJourneyTimeline({ nodes });
  assert.equal(timeline.currentGoalId, null);
  assert.deepEqual(timeline.orderedNodes.map((node) => node.id), ["done-0", "done-1", "done-2", "done-3"]);
});

test("de Journey Engine is sportneutraal voor swim- en algemene labels", () => {
  for (const labels of [["Drijven", "Borstcrawl"], ["Warming-up", "Balcontrole"]]) {
    const timeline = buildJourneyTimeline({ nodes: labels.map((label, index) => ({
      id: `${index}`,
      label,
      progressPercent: index ? 30 : 70,
      completed: false,
      curriculumOrder: index
    })) });
    assert.equal(timeline.currentGoalId, "0");
    assert.deepEqual(timeline.orderedNodes.map((node) => node.label), labels);
  }
});

test("0, 1, 4, 7, 12 en 30 hoofdonderdelen bestaan exact eenmaal in de timeline", () => {
  for (const count of [0, 1, 4, 7, 12, 30]) {
    const nodes = Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      label: `Onderdeel ${index}`,
      progressPercent: index === 2 ? 80 : 0,
      completed: false,
      curriculumOrder: index
    }));
    const timeline = buildJourneyTimeline({ nodes });
    assert.equal(timeline.entries.filter((entry) => entry.kind === "main").length, count);
    assert.equal(new Set(timeline.orderedNodes.map((node) => node.id)).size, count);
    assert.equal(timeline.currentGoalId, count ? (count > 2 ? "item-2" : "item-0") : null);
  }
});

test("earned events worden voor, tussen en na ankers ingevoegd, geclusterd en gededupliceerd", () => {
  const nodes = [
    { id: "a", label: "A", progressPercent: 100, completed: true, completedAt: "2026-08-02T10:00:00Z", completionSequence: 1, curriculumOrder: 1 },
    { id: "b", label: "B", progressPercent: 100, completed: true, completedAt: "2026-08-04T10:00:00Z", completionSequence: 2, curriculumOrder: 2 },
    { id: "c", label: "C", progressPercent: 60, completed: false, curriculumOrder: 3 }
  ];
  const events = [
    { id: "before", label: "Voor", earnedAt: "2026-08-01T10:00:00Z", eventType: "badge" as const },
    { id: "between", label: "Tussen", earnedAt: "2026-08-03T10:00:00Z", eventType: "surprise_badge" as const },
    { id: "between-2", label: "Tussen 2", earnedAt: "2026-08-03T10:00:00Z", eventType: "badge" as const },
    { id: "after", label: "Na", earnedAt: "2026-08-05T10:00:00Z", eventType: "badge" as const, anchorNodeId: "b" },
    { id: "between", label: "Duplicaat", earnedAt: "2026-08-03T10:00:00Z", eventType: "surprise_badge" as const }
  ];
  const timeline = buildJourneyTimeline({ nodes, events });
  const clusters = timeline.entries.filter((entry) => entry.kind === "event_cluster");
  assert.deepEqual(clusters.map((cluster) => cluster.events.map((event) => event.id)), [["before"], ["between", "between-2"], ["after"]]);
  assert.equal(clusters.flatMap((cluster) => cluster.events).length, 4);
});

test("gesture-axis-lock kiest alleen een dominante horizontale of verticale as", () => {
  assert.equal(classifyJourneyGesture({ deltaX: 4, deltaY: 3 }), "undecided");
  assert.equal(classifyJourneyGesture({ deltaX: 30, deltaY: 8 }), "horizontal");
  assert.equal(classifyJourneyGesture({ deltaX: 8, deltaY: 30 }), "vertical");
  assert.equal(classifyJourneyGesture({ deltaX: 20, deltaY: 18 }), "undecided");
});

test("camera maakt voor 30 entries een bredere/hogere wereld en centreert de selectie", () => {
  const desktop = journeyRouteGeometry({ entryCount: 30, orientation: "desktop", selectedIndex: 15, viewportHeight: 500, viewportWidth: 900 });
  const mobile = journeyRouteGeometry({ entryCount: 30, orientation: "mobile", selectedIndex: 15, viewportHeight: 560, viewportWidth: 390 });
  assert.ok(desktop.worldWidth > 900);
  assert.ok(mobile.worldHeight > 560);
  assert.equal(Math.round(desktop.positions[15]!.x + desktop.cameraX), Math.round(900 * 0.54));
  assert.equal(Math.round(mobile.positions[15]!.y + mobile.cameraY), Math.round(560 * 0.53));
});

test("focusvenster houdt het actieve punt exact gecentreerd met maximaal twee buren per zijde", () => {
  const nodes = Array.from({ length: 14 }, (_, index) => ({
    id: `node-${index}`,
    label: `Onderdeel ${index}`,
    progressPercent: index === 5 ? 80 : 0,
    completed: index < 5,
    completedAt: index < 5 ? `2026-07-${String(index + 1).padStart(2, "0")}T10:00:00Z` : null,
    curriculumOrder: index
  }));
  const window = focusedJourneyWindow(nodes, "node-5");
  assert.deepEqual(window.map(({ node }) => node.id), ["node-3", "node-4", "node-5", "node-6", "node-7"]);
  assert.deepEqual(journeyNodeFocusPosition(0), {
    desktopXPercent: 56,
    desktopYPercent: 57,
    mobileXPercent: 53,
    mobileYPercent: 53
  });
});

test("Journey-bestemming gebruikt het volgende badje en eindigt bij het diplomadoel", () => {
  const stages = [
    { id: "badje-1", name: "Badje 1" },
    { id: "badje-2", name: "Badje 2" }
  ];
  assert.equal(resolveJourneyDestination({
    stages,
    currentStageId: "badje-1",
    programName: "Zwemdiploma A"
  }), "Badje 2");
  assert.equal(resolveJourneyDestination({
    stages,
    currentStageId: "badje-2",
    programName: "Zwemdiploma A"
  }), "Zwemdiploma A");
  assert.equal(resolveJourneyDestination({
    stages: [stages[0]!],
    currentStageId: "badje-1",
    programName: "Zwemdiploma A"
  }), "Zwemdiploma A");
});

test("interactiecontract bevat childdeeplinks, axis-lock, tooltip en uitsluitend horizontale wheel-capture", async () => {
  const source = await readFile(
    path.join(root, "apps/web/components/child/child-journey-map.tsx"),
    "utf8"
  );
  assert.match(source, /\/kind\/reis\?onderdeel=/);
  assert.match(source, /\/kind\/badges\?badge=/);
  assert.match(source, /aria-current/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /Sleep, veeg of gebruik de pijltjestoetsen om je hele reis te bekijken\./);
  assert.match(source, /journey-direct-manipulation-v1/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /classifyJourneyGesture/);
  assert.match(source, /Math\.abs\(event\.deltaX\) <= Math\.abs\(event\.deltaY\)/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.doesNotMatch(source, /\/portaal\/ontwikkeling/);
});
