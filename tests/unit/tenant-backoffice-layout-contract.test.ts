import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { adminNav } from "../../apps/web/lib/navigation";

const shellUi = readFileSync(new URL("../../apps/web/components/shell/ui.tsx", import.meta.url), "utf8");
const planningBoard = readFileSync(new URL("../../apps/web/components/admin/planning-day-board.tsx", import.meta.url), "utf8");

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
  assert.doesNotMatch(pageHeader, /sm:flex-row/);
});

test("planborddagen krijgen alleen in een meerkolomsgrid een vaste hoogte", () => {
  assert.match(planningBoard, /shadow-soft xl:h-64/);
  assert.doesNotMatch(planningBoard, /flex h-64 min-w-0/);
});
