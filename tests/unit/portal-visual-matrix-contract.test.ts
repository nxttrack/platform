import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CHILD_VISUAL_STATES,
  PARENT_VISUAL_ROUTES,
  PORTAL_CANONICAL_VIEWPORTS,
  PORTAL_REQUIRED_VIEWPORTS,
  PORTAL_VISUAL_MATRIX_CONTRACT,
  PORTAL_VISUAL_THEMES
} from "../../apps/web/lib/theme/portal-visual-matrix";

test("visuele acceptatiematrix blijft exact 7 themes, 13 ouderroutes en 7 kindstates", () => {
  assert.equal(PORTAL_VISUAL_THEMES.length, 7);
  assert.equal(PARENT_VISUAL_ROUTES.length, 13);
  assert.equal(CHILD_VISUAL_STATES.length, 7);
  assert.equal(PORTAL_CANONICAL_VIEWPORTS.length, 2);
  assert.equal(PORTAL_REQUIRED_VIEWPORTS.length, 14);
  assert.equal(PORTAL_VISUAL_MATRIX_CONTRACT.canonicalRenders, 322);
  assert.equal(PORTAL_VISUAL_MATRIX_CONTRACT.dashboardViewportCases, 196);
});

test("viewportcontract bevat alle opgegeven desktop-, tablet- en mobielmaten exact", () => {
  assert.deepEqual(
    PORTAL_REQUIRED_VIEWPORTS.map(({ width, height }) => `${width}x${height}`),
    [
      "2560x1440",
      "1920x1080",
      "1600x900",
      "1440x900",
      "1366x768",
      "1280x720",
      "1180x820",
      "1024x768",
      "820x1180",
      "768x1024",
      "430x932",
      "390x844",
      "360x800",
      "320x568"
    ]
  );
});

test("E2E-harnas maakt per thema een parent- en childboard", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../apps/web/tests/e2e/portal-theme-visual-matrix.spec.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /`\$\{theme\}-parent-board`/);
  assert.match(source, /`\$\{theme\}-child-board`/);
  assert.match(source, /attachBoard/);
});
