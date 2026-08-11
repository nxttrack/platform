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

test("gedeelde paginaheaders laten lange mobiele lesnamen en datums veilig afbreken", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../apps/web/components/shell/ui.tsx", import.meta.url),
    "utf8"
  );
  const pageHeader = source.slice(source.indexOf("export function PageHeader"), source.indexOf("export function Card"));
  assert.match(pageHeader, /break-words/);
  assert.doesNotMatch(pageHeader, /whitespace-nowrap/);
});

test("microcopy en notificatiebadges houden op het ouderdashboard WCAG AA-contrast", async () => {
  const { readFile } = await import("node:fs/promises");
  const [styles, shell] = await Promise.all([
    readFile(new URL("../../apps/web/app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/components/shell/app-shell-client.tsx", import.meta.url), "utf8")
  ]);
  assert.match(styles, /\.portal-mobile-brand__subtitle\s*\{[^}]*color:\s*var\(--portal-text\)/s);
  assert.match(styles, /\.parent-overview-planning__facts small\s*\{[^}]*color:\s*var\(--portal-text\)/s);
  assert.match(shell, /bg-danger[^"\n]*text-foreground/);
  assert.doesNotMatch(shell, /bg-danger[^"\n]*text-white/);
});

test("de merklink in de kindheader is een volwaardig touch target met leesbare microcopy", async () => {
  const { readFile } = await import("node:fs/promises");
  const styles = await readFile(new URL("../../apps/web/app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /\.child-shell__brand\s*\{[^}]*min-height:\s*48px/s);
  assert.match(styles, /\.child-shell__brand small\s*\{[^}]*color:\s*var\(--portal-text\)/s);
});

test("stagingpreview is exact-SHA, migration-allowlisted en behoudt beheeridentiteiten", async () => {
  const { readFile } = await import("node:fs/promises");
  const [workflow, phase16, fixture] = await Promise.all([
    readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/staging/phase-16-operational-flow.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/staging/parent-child-preview-fixture.mjs", import.meta.url), "utf8")
  ]);
  assert.match(workflow, /inputs\.target == 'staging'/);
  assert.match(workflow, /5b132c94a049a5af33826468068cb5a505424614/);
  assert.match(workflow, /test "\$TARGET" = "staging"/);
  assert.match(workflow, /20260811120000[\s\S]+20260811130000[\s\S]+20260811140000[\s\S]+20260811180455/);
  assert.match(workflow, /theme wrappers service-only/);
  assert.match(workflow, /Refusing unexpected staging migrations/);
  assert.match(workflow, /PHASE16_RESET_E2E_PASSWORDS:[\s\S]+false/);
  assert.match(workflow, /PHASE16_PRESERVE_ADMIN_IDENTITIES/);
  assert.match(workflow, /PHASE16_SKIP_PLAYWRIGHT:[\s\S]+inputs\.staging_preview_sha/);
  assert.match(workflow, /Prepare Sprint 4 browser-mutation fixture[\s\S]+if: inputs\.staging_preview_sha == ''/);
  assert.match(workflow, /Cleanup old releases\n\s+if: env\.STAGING_PREVIEW_SHA == ''/);
  assert.match(workflow, /Roll back failed preview validation/);
  assert.match(phase16, /Preserved tenant administrator/);
  assert.match(phase16, /Could not release fixture session reservations/);
  assert.match(phase16, /Transactional \(resource hierarchy\|instructor\) conflict/);
  assert.match(fixture, /aquaswim-demo/);
  assert.match(fixture, /createRequire\(new URL\("\.\.\/\.\.\/apps\/web\/package\.json"/);
  assert.match(fixture, /tenant_portal_theme_availability/);
  assert.match(fixture, /set_tenant_portal_theme_availability/);
  assert.match(fixture, /set_tenant_portal_theme_license/);
  assert.match(fixture, /resolveCleanupContext/);
  assert.match(fixture, /configure_child_portal_rollout_for_service/);
  assert.match(fixture, /swim\.portal\.direct_child_login/);
  assert.match(fixture, /status !== "disabled"/);
});

test("stagingmatrix opent de eigen platformpreview en activeert releases via de tenant-admin-UI", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    new URL("../../apps/web/tests/e2e/portal-theme-visual-matrix.spec.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /locator\("details"\)\.filter\(\{ has: card \}\)/);
  assert.doesNotMatch(source, /activate_tenant_portal_theme/);
  assert.match(source, /data-theme-choice/);
  assert.match(source, /waitForURL\(\/saved=theme\/, \{ timeout: 60_000 \}\)/);
});
