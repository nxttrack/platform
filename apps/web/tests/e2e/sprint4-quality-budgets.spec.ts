import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  users: {
    tenantAdmin: { email: string };
    instructor: { email: string };
    parent: { email: string };
  };
  expected: { groupId: string; sessionId: string };
};

type QualityCase = {
  label: string;
  path: (phase: Phase16State) => string;
  viewport: { height: number; width: number };
  credentials?: (phase: Phase16State) => { email: string; password: string };
};

const phase = loadJson<Phase16State>(process.env.PHASE16_STATE_PATH);
const enabled = process.env.SPRINT4_QUALITY_BUDGETS_ENABLED === "true";
const budgets = {
  cls: 0.1,
  domContentLoadedMs: 6_000,
  largestContentfulPaintMs: 4_000,
  loadCompleteMs: 8_000,
  resourceCount: 140,
  totalTransferBytes: 5 * 1024 * 1024,
  ttfbMs: 3_000
} as const;

const qualityCases: QualityCase[] = [
  {
    label: "public login on mobile",
    path: () => "/login",
    viewport: { width: 390, height: 844 }
  },
  {
    label: "parent dashboard on mobile",
    path: () => "/portaal",
    viewport: { width: 390, height: 844 },
    credentials: (state) => ({ email: state.users.parent.email, password: requiredEnv("E2E_PARENT_PASSWORD") })
  },
  {
    label: "instructor roster on tablet",
    path: (state) => `/instructor/group/${state.expected.groupId}?session=${state.expected.sessionId}`,
    viewport: { width: 1024, height: 768 },
    credentials: (state) => ({ email: state.users.instructor.email, password: requiredEnv("E2E_INSTRUCTOR_PASSWORD") })
  },
  {
    label: "tenant-admin dashboard on desktop",
    path: () => "/admin",
    viewport: { width: 1440, height: 900 },
    credentials: (state) => ({ email: state.users.tenantAdmin.email, password: requiredEnv("E2E_TENANT_ADMIN_PASSWORD") })
  }
];

test.describe("Sprint 4 critical-route accessibility and performance budgets", () => {
  test.skip(!enabled, "Enable quality budgets to run this staging-only suite.");
  test.beforeAll(() => {
    expect(phase, "PHASE16_STATE_PATH must resolve to a readable state file when quality budgets are enabled.").not.toBeNull();
  });

  for (const qualityCase of qualityCases) {
    test(`${qualityCase.label} stays within the release budgets`, async ({ page }, testInfo) => {
      test.setTimeout(45_000);
      const state = requireState(phase);
      const targetPath = qualityCase.path(state);

      await page.setViewportSize(qualityCase.viewport);
      await installPerformanceObservers(page);

      if (qualityCase.credentials) {
        const credentials = qualityCase.credentials(state);
        await signIn(page, credentials.email, credentials.password, targetPath);
      } else {
        const response = await page.goto(targetPath, { waitUntil: "domcontentloaded" });
        expect(response?.status() ?? 0).toBeLessThan(500);
      }

      await page.waitForLoadState("networkidle", { timeout: 7_500 }).catch(() => undefined);
      await page.waitForTimeout(750);
      await expect(page.locator("body")).toBeVisible();

      const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      await attachJson(testInfo, `${slug(qualityCase.label)}-accessibility`, accessibility.violations);

      const releaseBlockingViolations = accessibility.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
      expect(releaseBlockingViolations, formatViolations(releaseBlockingViolations)).toEqual([]);

      const performance = await collectPerformance(page);
      await attachJson(testInfo, `${slug(qualityCase.label)}-performance`, { budgets, measured: performance });

      expect(performance.ttfbMs, "TTFB budget").toBeLessThanOrEqual(budgets.ttfbMs);
      expect(performance.domContentLoadedMs, "DOMContentLoaded budget").toBeLessThanOrEqual(budgets.domContentLoadedMs);
      expect(performance.loadCompleteMs, "load-complete budget").toBeLessThanOrEqual(budgets.loadCompleteMs);
      expect(performance.largestContentfulPaintMs, "LCP must be observed").toBeGreaterThan(0);
      expect(performance.largestContentfulPaintMs, "LCP budget").toBeLessThanOrEqual(budgets.largestContentfulPaintMs);
      expect(performance.cls, "CLS budget").toBeLessThanOrEqual(budgets.cls);
      expect(performance.resourceCount, "resource-count budget").toBeLessThanOrEqual(budgets.resourceCount);
      expect(performance.totalTransferBytes, "transfer-size budget").toBeLessThanOrEqual(budgets.totalTransferBytes);
    });
  }
});

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    const measuredWindow = window as Window & { __nxttrackQuality?: { cls: number; lcp: number } };
    measuredWindow.__nxttrackQuality = { cls: 0, lcp: 0 };

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) measuredWindow.__nxttrackQuality!.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) measuredWindow.__nxttrackQuality!.cls += entry.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function collectPerformance(page: Page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const quality = (window as Window & { __nxttrackQuality?: { cls: number; lcp: number } }).__nxttrackQuality;

    return {
      cls: Number((quality?.cls ?? 0).toFixed(4)),
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      largestContentfulPaintMs: Math.round(quality?.lcp ?? 0),
      loadCompleteMs: Math.round(navigation?.loadEventEnd || navigation?.domContentLoadedEventEnd || 0),
      resourceCount: resources.length,
      totalTransferBytes: Math.round(resources.reduce((total, resource) => total + resource.transferSize, navigation?.transferSize ?? 0)),
      ttfbMs: Math.round((navigation?.responseStart ?? 0) - (navigation?.startTime ?? 0))
    };
  });
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${nextPath.split("?")[0].replaceAll("/", "\\/")}(?:\\?|$)`));
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`), contentType: "application/json" });
}

function formatViolations(violations: Array<{ help: string; id: string; impact?: string | null; nodes: unknown[] }>) {
  return violations.map((violation) => `${violation.impact ?? "unknown"} ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))`).join("\n");
}

function loadJson<T>(statePath?: string) {
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as T) : null;
}

function requireState<T>(state: T | null): T {
  if (!state) throw new Error("Phase 16 state is required.");
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function slug(value: string) {
  return value.replaceAll(/[^a-z0-9]+/gi, "-").replaceAll(/^-|-$/g, "").toLowerCase();
}
