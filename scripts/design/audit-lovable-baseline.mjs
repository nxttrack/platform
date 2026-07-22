#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const manifestPath = join(repoRoot, "docs/lovable-baseline/manifest.json");
const phaseOnePath = join(repoRoot, "docs/PHASE_1_LOVABLE_UI_AUDIT.md");
const requiredFiles = [
  "apps/web/components.json",
  "apps/web/components/ui/sheet.tsx",
  "apps/web/components/ui/tabs.tsx",
  "apps/web/components/ui/alert-dialog.tsx",
  "apps/web/components/ui/confirm-action-form.tsx",
  "apps/web/components/ui/chart.tsx",
  "apps/web/components/ui/button.tsx",
  "apps/web/components/ui/field.tsx",
  "apps/web/components/ui/input.tsx",
  "apps/web/components/ui/native-select.tsx",
  "apps/web/components/ui/table.tsx",
  "apps/web/components/ui/textarea.tsx",
  "apps/web/scripts/capture-production-baseline.mjs",
  "apps/web/components/admin/operational-charts.tsx",
  "apps/web/components/shell/app-shell-client.tsx",
  "apps/web/components/shell/ui.tsx",
  "apps/web/components/lovable/page-kit.tsx",
  "apps/web/components/marketing/site-chrome.tsx",
  "apps/web/components/marketing/product-subpages.tsx",
  "apps/web/components/marketing/commercial-subpages.tsx",
  "apps/web/lib/utils.ts",
  "apps/web/app/(nxttrack-marketing)/nxttrack/layout.tsx",
  "apps/web/app/(nxttrack-marketing)/nxttrack/zwemscholen/page.tsx",
  "apps/web/app/(portaal)/portaal/badges/page.tsx",
  "apps/web/app/(portaal)/portaal/afzwemmen/page.tsx"
];
const failures = [];

for (const relativePath of requiredFiles) {
  if (!existsSync(join(repoRoot, relativePath))) fail(`Missing Phase 2 design-system file: ${relativePath}.`);
}

if (!existsSync(manifestPath)) {
  fail("Missing docs/lovable-baseline/manifest.json.");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const routes = manifest.priorityA || [];
  const viewports = manifest.viewports || [];

  if (manifest.source?.repository !== "nxttrack/swim-school-pro") fail("Unexpected Lovable source repository.");
  if (!/^[a-f0-9]{40}$/.test(manifest.source?.commitSha || "")) fail("Lovable source must be pinned to a full commit SHA.");
  if (routes.length !== 14) fail(`Priority A must contain 14 routes; found ${routes.length}.`);
  if (viewports.length !== 4) fail(`Baseline must contain four required viewports; found ${viewports.length}.`);

  unique(routes.map((route) => route.id), "Priority A route id");
  unique(routes.map((route) => route.referenceRoute), "Priority A reference route");
  unique(viewports.map((viewport) => viewport.id), "Viewport id");

  for (const route of routes) {
    if (!route.productionFile || !existsSync(join(repoRoot, route.productionFile))) {
      fail(`${route.id} maps to a missing production file: ${route.productionFile || "unset"}.`);
    }
    if (!Array.isArray(route.knownDrift) || route.knownDrift.length === 0) {
      fail(`${route.id} has no documented known drift.`);
    }
  }

  if (existsSync(phaseOnePath)) {
    const phaseOne = readFileSync(phaseOnePath, "utf8");
    if (!phaseOne.includes(manifest.source.commitSha)) fail("Phase 1 audit does not reference the pinned Lovable commit.");
  } else {
    fail("Missing Phase 1 audit document.");
  }
}

const webPackage = readJson("apps/web/package.json");
for (const dependency of ["@radix-ui/react-alert-dialog", "@radix-ui/react-dialog", "@radix-ui/react-tabs", "class-variance-authority", "clsx", "framer-motion", "recharts", "tailwind-merge", "tw-animate-css"]) {
  if (!webPackage.dependencies?.[dependency]) fail(`Missing design-system dependency: ${dependency}.`);
}

const shadcnConfig = readJson("apps/web/components.json");
if (shadcnConfig.rsc !== true) fail("shadcn configuration must keep React Server Components enabled.");
if (shadcnConfig.tailwind?.css !== "app/globals.css") fail("shadcn configuration must target app/globals.css.");

requireText("apps/web/app/globals.css", '@import "tw-animate-css";', "Tailwind animation utilities are not enabled.");
requireText("apps/web/app/globals.css", "--background: oklch(0.985 0.012 230);", "Exact Lovable background token is missing.");
requireText("apps/web/app/globals.css", "--sidebar-primary: oklch(0.51 0.18 240);", "The WCAG-adjusted Lovable sidebar token is missing.");
requireText("apps/web/components/shell/app-shell-client.tsx", "usePathname", "AppShell is not path-aware.");
requireText("apps/web/components/shell/app-shell-client.tsx", "SheetContent", "AppShell has no Radix mobile drawer.");
requireText("apps/web/components/shell/app-shell-client.tsx", 'aria-current={active ? "page"', "AppShell active navigation is not exposed accessibly.");
requireText("apps/web/components/ui/tabs.tsx", "TabsPrimitive.Trigger", "Radix Tabs trigger composition is missing.");
requireText("apps/web/components/ui/alert-dialog.tsx", "AlertDialogPrimitive.Description", "AlertDialog accessible description composition is missing.");
requireText("apps/web/components/ui/confirm-action-form.tsx", 'type="submit"', "Confirmed actions do not submit through the owning server-action form.");
requireText("apps/web/app/(instructor)/instructor/student/[id]/page.tsx", "getDossierTab", "Instructor student dossier does not preserve a safe active tab across server-action redirects.");
requireText("apps/web/app/(portaal)/portaal/lessen/page.tsx", "ConfirmActionForm", "Lesson cancellation is missing explicit confirmation.");
requireText("apps/web/components/shell/ui.tsx", "export function ProgressRing", "ProgressRing primitive is missing.");
requireText("apps/web/components/shell/ui.tsx", "export function WaitlistDot", "WaitlistDot primitive is missing.");
requireText("apps/web/components/lovable/page-kit.tsx", "export function Photo", "Photo primitive is missing.");
requireText("apps/web/components/lovable/page-kit.tsx", "export const ImagePlaceholder", "ImagePlaceholder compatibility export is missing.");
requireText("apps/web/components/lovable/page-kit.tsx", 'export { FloatCard }', "FloatCard primitive is missing.");
requireText("apps/web/components/lovable/page-kit.tsx", 'variant?: "marketing" | "staging"', "Context-aware final CTA variants are missing.");
requireText("apps/web/components/ui/chart.tsx", "export type ChartConfig", "Typed chart configuration is missing.");
requireText("apps/web/components/ui/chart.tsx", "ChartAccessibleTable", "Accessible chart data fallback is missing.");
requireText("apps/web/components/ui/button.tsx", "buttonVariants", "Variant-driven Button primitive is missing.");
requireText("apps/web/components/ui/field.tsx", 'role="alert"', "Field errors are not announced accessibly.");
requireText("apps/web/components/ui/input.tsx", "aria-invalid:border-danger", "Input invalid-state styling is missing.");
requireText("apps/web/components/ui/native-select.tsx", "appearance-none", "NativeSelect ownership is missing.");
requireText("apps/web/components/ui/table.tsx", "overflow-x-auto", "Responsive Table primitive is missing.");
requireText("apps/web/components/admin/domain-ui.tsx", 'from "@/components/ui/input"', "Admin forms do not use the shared Input primitive.");
requireText("apps/web/app/(tenant-public)/login/page.tsx", 'from "@/components/ui/field"', "Login form is not composed from shared field primitives.");
requireText("apps/web/app/(tenant-public)/intake/page.tsx", 'from "@/components/ui/native-select"', "Public intake is not composed from shared select primitives.");
requireText("apps/web/app/(tenant-admin)/admin/rapportages/page.tsx", "TableCaption", "Report snapshots do not use the semantic Table primitive.");
requireText("apps/web/components/auth/password-strength-meter.tsx", 'role="progressbar"', "Password strength is not exposed as an accessible progressbar.");
requireText("apps/web/components/admin/operational-charts.tsx", "accessibilityLayer", "Operational charts must enable the Recharts accessibility layer.");
requireText("apps/web/lib/domain/admin-chart-data.ts", "buildAdminChartData", "Server-derived admin chart data mapping is missing.");
requireText("apps/web/app/(tenant-admin)/admin/page.tsx", "CapacityChart", "Admin dashboard does not render real-data charts.");
requireText("apps/web/app/(tenant-admin)/admin/rapportages/page.tsx", "Betalingen per status", "Admin reports do not render payment-status charts.");
requireText("apps/web/components/marketing/site-chrome.tsx", "usePathname", "Marketing navigation is not path-aware.");
requireText("apps/web/components/marketing/site-chrome.tsx", "SheetContent", "Marketing shell has no Radix mobile drawer.");
requireText("apps/web/components/marketing/site-chrome.tsx", 'aria-current={active ? "page"', "Marketing active navigation is not exposed accessibly.");
requireText("apps/web/app/(nxttrack-marketing)/nxttrack/layout.tsx", "MarketingSiteHeader", "Marketing route group does not own the shared header.");
requireText("apps/web/app/(nxttrack-marketing)/nxttrack/layout.tsx", "MarketingSiteFooter", "Marketing route group does not own the shared footer.");
requireText("apps/web/app/(nxttrack-marketing)/nxttrack/zwemscholen/page.tsx", "Van eerste plons tot diploma C", "Priority A swim-school lifecycle composition is missing.");
requireText("apps/web/app/(nxttrack-marketing)/nxttrack/zwemscholen/page.tsx", "Eén duidelijke hiërarchie", "Priority A swim-school hierarchy composition is missing.");
for (const marker of ["Altijd weten waar je kind staat.", "De trainer app die tijdens de les werkt.", "Volledige controle over jouw zwemschool.", "Meer grip op instroom en capaciteit.", "Van voortgang naar trots."]) {
  requireText("apps/web/components/marketing/product-subpages.tsx", marker, `Marketing product composition is missing: ${marker}`);
}
for (const marker of ["Heldere plannen voor elke zwemschool.", "Zie NXTTRACK in actie.", "Laten we kennismaken.", "Privacy-first ontwerp.", "Welkom terug."]) {
  requireText("apps/web/components/marketing/commercial-subpages.tsx", marker, `Marketing commercial composition is missing: ${marker}`);
}
requireText("apps/web/components/marketing/commercial-subpages.tsx", "mailto:hello@nxttrack.nl", "Marketing contact must expose a real handoff instead of simulated submission.");
requireText("apps/web/components/marketing/commercial-subpages.tsx", 'href: "/login?next=%2Fportaal"', "Marketing login must hand off to the protected parent login flow.");

if (failures.length > 0) {
  console.error("[design:audit] Lovable baseline audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("[design:audit] PASS Lovable source, Priority A routes, viewports and production mappings are pinned.");

function unique(values, label) {
  if (new Set(values).size !== values.length) fail(`${label}s must be unique.`);
}

function fail(message) {
  failures.push(message);
}

function readJson(relativePath) {
  const path = join(repoRoot, relativePath);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

function requireText(relativePath, expected, message) {
  const path = join(repoRoot, relativePath);
  if (!existsSync(path) || !readFileSync(path, "utf8").includes(expected)) fail(message);
}
