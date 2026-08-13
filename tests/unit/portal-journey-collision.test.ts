import assert from "node:assert/strict";
import test from "node:test";

import {
  mascotMotionPlan,
  selectMascotPlacement,
  type JourneyRect
} from "../../apps/web/lib/theme/portal-journey-contract";
import { PORTAL_REQUIRED_VIEWPORTS } from "../../apps/web/lib/theme/portal-visual-matrix";

const mascots = ["dolphin", "sea-turtle", "penguin", "beach-lifeguard", "manta"] as const;

function overlap(left: JourneyRect, right: JourneyRect, clearance = 0) {
  return left.x < right.x + right.width + clearance
    && left.x + left.width + clearance > right.x
    && left.y < right.y + right.height + clearance
    && left.y + left.height + clearance > right.y;
}

test("630 endpoint-collisionstates houden 12px clearance voor vijf mascottes en veertien viewports", () => {
  let cases = 0;
  for (const mascot of mascots) {
    for (const viewport of PORTAL_REQUIRED_VIEWPORTS) {
      const width = Math.max(320, Math.min(viewport.width, 1180));
      const height = Math.max(360, Math.min(viewport.height, 760));
      const bounds = { x: 0, y: 0, width, height };
      const anchors = [
        { x: width * 0.2, y: height * 0.62, width: 56, height: 72 },
        { x: width * 0.48, y: height * 0.5, width: 72, height: 88 },
        { x: width * 0.72, y: height * 0.36, width: 56, height: 72 },
        { x: width * 0.6, y: height * 0.7, width: 48, height: 62 }
      ];
      for (const anchor of anchors) {
        for (const popupOpen of [false, true]) {
          const fixedExclusions: JourneyRect[] = [anchor];
          if (popupOpen) fixedExclusions.push({ x: 12, y: 12, width: Math.min(240, width * 0.34), height: 118 });
          const placement = selectMascotPlacement({
            anchor,
            bounds,
            exclusions: fixedExclusions,
            preferredWidth: mascot === "manta" ? 128 : 100,
            preferredHeight: mascot === "penguin" || mascot === "beach-lifeguard" ? 148 : mascot === "manta" ? 70 : 100
          });
          assert.notEqual(placement.mode, "hidden", `${mascot} ${viewport.width}x${viewport.height}`);
          const rect = { x: placement.x, y: placement.y, width: placement.width, height: placement.height };
          assert.ok(rect.x >= 12 && rect.y >= 12);
          assert.ok(rect.x + rect.width <= width - 12 && rect.y + rect.height <= height - 12);
          assert.ok(fixedExclusions.every((exclusion) => !overlap(rect, exclusion, 12)));
          cases += 1;
        }
      }
      const tooltip = { x: Math.max(12, width - 250), y: 12, width: Math.min(238, width - 24), height: 64 };
      const anchor = anchors[1]!;
      const tooltipPlacement = selectMascotPlacement({ anchor, bounds, exclusions: [anchor, tooltip], preferredWidth: 100, preferredHeight: 100 });
      assert.notEqual(tooltipPlacement.mode, "hidden");
      assert.ok(!overlap(tooltipPlacement, tooltip, 12));
      cases += 1;
    }
  }
  assert.equal(cases, 630);
});

test("swept motion gebruikt alleen een vrij direct/waypointpad en valt anders terug op crossfade", () => {
  const from = { x: 20, y: 20, width: 50, height: 50 };
  const to = { x: 240, y: 20, width: 50, height: 50 };
  assert.equal(mascotMotionPlan({ from, to, exclusions: [] }).mode, "direct");
  const waypoint = mascotMotionPlan({ from, to, exclusions: [{ x: 120, y: 0, width: 45, height: 85 }] });
  assert.ok(["waypoint", "crossfade"].includes(waypoint.mode));
  const blocked = mascotMotionPlan({
    from,
    to,
    exclusions: [
      { x: 80, y: -20, width: 80, height: 220 },
      { x: 160, y: -20, width: 80, height: 220 }
    ]
  });
  assert.equal(blocked.mode, "crossfade");
});

test("swept cases current→first, first→last, last→interstitial en interruptions blijven collisionvrij", () => {
  const markerBand = [
    { x: 145, y: 70, width: 62, height: 80 },
    { x: 330, y: 190, width: 62, height: 80 }
  ];
  const transitions = [
    { name: "current-to-first", from: { x: 260, y: 250, width: 54, height: 54 }, to: { x: 40, y: 250, width: 54, height: 54 }, exclusions: markerBand },
    { name: "first-to-last", from: { x: 40, y: 250, width: 54, height: 54 }, to: { x: 440, y: 250, width: 54, height: 54 }, exclusions: markerBand },
    { name: "last-to-interstitial", from: { x: 440, y: 250, width: 54, height: 54 }, to: { x: 260, y: 25, width: 54, height: 54 }, exclusions: markerBand },
    { name: "popup-interruption", from: { x: 260, y: 25, width: 54, height: 54 }, to: { x: 440, y: 250, width: 54, height: 54 }, exclusions: [...markerBand, { x: 210, y: 160, width: 180, height: 130 }] },
    { name: "resize-interruption", from: { x: 440, y: 250, width: 54, height: 54 }, to: { x: 40, y: 25, width: 54, height: 54 }, exclusions: [...markerBand, { x: 0, y: 315, width: 520, height: 70 }] }
  ];
  for (const transition of transitions) {
    const plan = mascotMotionPlan(transition);
    if (plan.mode === "crossfade") continue;
    for (let segment = 0; segment < plan.points.length - 1; segment += 1) {
      const from = plan.points[segment]!;
      const to = plan.points[segment + 1]!;
      for (let frame = 0; frame <= 40; frame += 1) {
        const ratio = frame / 40;
        const rect = {
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio,
          width: transition.to.width,
          height: transition.to.height
        };
        assert.ok(transition.exclusions.every((exclusion) => !overlap(rect, exclusion, 16)), `${transition.name} frame ${frame}`);
      }
    }
  }
});
