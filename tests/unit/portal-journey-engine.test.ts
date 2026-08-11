import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  focusedJourneyWindow,
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

test("interactiecontract bevat deeplink, toetsenbord en uitsluitend horizontale wheel-capture", async () => {
  const source = await readFile(
    path.join(root, "apps/web/components/parent/portal-journey-engine.tsx"),
    "utf8"
  );
  assert.match(source, /params\.set\("onderdeel", node\.id\)/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /ArrowRight/);
  assert.match(source, /aria-current/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /onPointerDown/);
  assert.match(source, /Sleep, scroll of gebruik de pijlen om te reizen/);
  assert.match(source, /Math\.abs\(event\.deltaX\) <= Math\.abs\(event\.deltaY\)/);
  assert.match(source, /event\.preventDefault\(\)/);
});
