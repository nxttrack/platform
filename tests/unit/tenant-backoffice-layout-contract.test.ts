import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { adminNav } from "../../apps/web/lib/navigation";

const shellUi = readFileSync(new URL("../../apps/web/components/shell/ui.tsx", import.meta.url), "utf8");
const planningBoard = readFileSync(new URL("../../apps/web/components/admin/planning-day-board.tsx", import.meta.url), "utf8");
const graduationPage = readFileSync(new URL("../../apps/web/app/(tenant-admin)/admin/afzwemmen/page.tsx", import.meta.url), "utf8");
const routeHealth = readFileSync(new URL("../../apps/web/tests/e2e/tenant-backoffice-route-health.spec.ts", import.meta.url), "utf8");
const rootPackage = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

test("iedere tenant-backofficenavigatieroute is uniek en heeft een pagina", () => {
  const routes = adminNav.map((item) => item.href);

  assert.equal(new Set(routes).size, routes.length);
  assert.equal(adminNav[0]?.label, "Vandaag");

  for (const route of routes) {
    const relativePage = route === "/admin"
      ? "../../apps/web/app/(tenant-admin)/admin/page.tsx"
      : `../../apps/web/app/(tenant-admin)${route}/page.tsx`;
    assert.equal(existsSync(new URL(relativePage, import.meta.url)), true, `${route} mist een page.tsx`);
  }
});

test("backofficeheaders stapelen acties zolang de zijbalk tabletbreedte beperkt", () => {
  const pageHeader = shellUi.slice(shellUi.indexOf("export function PageHeader"), shellUi.indexOf("export function Card"));

  assert.match(pageHeader, /lg:flex-row lg:items-end lg:justify-between/);
  assert.match(pageHeader, /w-full min-w-0 max-w-full flex-wrap gap-2 lg:w-auto lg:max-w-none lg:shrink-0/);
  assert.doesNotMatch(pageHeader, /sm:flex-row/);
});

test("planborddagen krijgen alleen in een meerkolomsgrid een vaste hoogte", () => {
  assert.match(planningBoard, /shadow-soft xl:h-64/);
  assert.doesNotMatch(planningBoard, /flex h-64 min-w-0/);
});

test("de paginalaadstatus past op mobiel zonder het desktopgrid af te zwakken", () => {
  const skeleton = readFileSync(new URL("../../apps/web/components/shell/page-loading-skeleton.tsx", import.meta.url), "utf8");

  assert.match(skeleton, /grid-cols-\[24px_minmax\(0,1fr\)_72px\]/);
  assert.match(skeleton, /sm:grid-cols-\[32px_minmax\(120px,1\.4fr\)_minmax\(90px,1fr\)_100px\]/);
  assert.match(skeleton, /hidden h-5 min-w-0 sm:block/);
});

test("lange afzwemeventnamen begrenzen het uitnodigingsformulier op mobiel", () => {
  assert.match(graduationPage, /flex w-full min-w-0 flex-wrap items-end gap-2 md:w-auto/);
  assert.match(graduationPage, /h-10 w-full min-w-0 max-w-full[^\"]+sm:w-64/);
  assert.doesNotMatch(graduationPage, /select className="h-10 min-w-64/);
});

test("de stagingroute-audit deelt geen login en wacht op streaming inhoud", () => {
  assert.match(rootPackage.scripts["test:tenant-backoffice-health:e2e"] ?? "", /--workers=1/);
  assert.match(routeHealth, /loadingVisible \? await measureLayout\(page\) : null/);
  assert.equal(routeHealth.match(/\{ timeout: 30_000 \}/g)?.length, 3);
});
