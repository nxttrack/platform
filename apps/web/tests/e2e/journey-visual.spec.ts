import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";

import { PORTAL_VISUAL_THEMES } from "@/lib/theme/portal-visual-matrix";

const helpKey = "nxttrack:help:journey-direct-manipulation-v1";
const mascotThemes = ["dolphin-bay", "turtle-trails", "polar-splash", "coastal-explorer", "ocean-quest"];
const noMascotThemes = ["nxttrack-default", "nationaal-zwem-abc"];
const canonicalViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 }
];

test("86 gerichte journey-renders volgen het verplichte artifactcontract", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "journey-chromium", "De screenshots worden eenmaal browser-onafhankelijk uit de gedeelde JourneyEngine gegenereerd.");
  test.setTimeout(900_000);
  let renders = 0;

  for (const theme of PORTAL_VISUAL_THEMES) {
    for (const viewport of canonicalViewports) {
      const context = await journeyContext(browser, viewport, true);
      const page = await context.newPage();
      await openJourney(page, theme, 7);
      await capture(page, testInfo, `${theme}-${viewport.name}-initial-current`); renders += 1;
      await selectEntry(page, '[data-child-journey-entry="event:badge-voor"]', false);
      await capture(page, testInfo, `${theme}-${viewport.name}-oldest-completion`); renders += 1;
      await selectEntry(page, '[data-child-journey-entry="event:surprise-tussen"]', true);
      await capture(page, testInfo, `${theme}-${viewport.name}-milestone-popup`); renders += 1;
      await context.close();

      const tooltipContext = await journeyContext(browser, viewport, false);
      const tooltipPage = await tooltipContext.newPage();
      await openJourney(tooltipPage, theme, 7);
      await expect(tooltipPage.getByRole("status").filter({ hasText: "Sleep, veeg" })).toBeVisible();
      await capture(tooltipPage, testInfo, `${theme}-${viewport.name}-first-visit-tooltip`); renders += 1;
      await tooltipContext.close();
    }
  }

  for (const viewport of [
    { name: "1280x720", width: 1280, height: 720 },
    { name: "390x844", width: 390, height: 844 },
    { name: "320x568", width: 320, height: 568 }
  ]) {
    const context = await journeyContext(browser, viewport, true);
    const page = await context.newPage();
    await openJourney(page, "ocean-quest", 7);
    for (let node = 1; node <= 7; node += 1) {
      await selectEntry(page, `[data-child-journey-entry="doel-${node}"]`, false);
      await capture(page, testInfo, `ocean-quest-${viewport.name}-selected-doel-${node}`); renders += 1;
    }
    await context.close();
  }

  for (const theme of mascotThemes) {
    const context = await journeyContext(browser, { width: 390, height: 844 }, true);
    const page = await context.newPage();
    await openJourney(page, theme, 12);
    await selectEntry(page, '[data-child-journey-entry="doel-12"]', true);
    await capture(page, testInfo, `${theme}-dense-12-popup`); renders += 1;
    await context.close();
  }

  for (const theme of noMascotThemes) {
    const context = await journeyContext(browser, { width: 390, height: 844 }, true);
    const page = await context.newPage();
    await openJourney(page, theme, 12);
    await expect(page.locator(".child-journey-map__mascot")).toHaveCount(0);
    await capture(page, testInfo, `${theme}-no-mascot-no-reserved-layer`); renders += 1;
    await context.close();
  }

  {
    const context = await journeyContext(browser, { width: 844, height: 390 }, true);
    const page = await context.newPage();
    await openJourney(page, "ocean-quest", 12);
    await capture(page, testInfo, "ocean-quest-mobile-landscape"); renders += 1;
    await context.close();
  }

  {
    // A 320×450 CSS viewport rendered at DPR 2 represents the 640×900 device
    // frame at 200% reflow without relying on browser-chrome zoom controls.
    const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 320, height: 450 } });
    await context.addInitScript((key) => window.localStorage.setItem(key, "dismissed"), helpKey);
    const page = await context.newPage();
    await openJourney(page, "ocean-quest", 7);
    await selectEntry(page, '[data-child-journey-entry="doel-3"]', true);
    await expect(page.getByRole("button", { name: "Details sluiten" })).toBeVisible();
    await capture(page, testInfo, "ocean-quest-200-percent-reflow"); renders += 1;
    await context.close();
  }

  expect(renders).toBe(86);
});

test("journey productionfixture blijft binnen LCP CLS en interaction-latency budgets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "journey-chromium", "De vaste synthetische performancefixture gebruikt Chromium PerformanceObserver.");
  await installPerformanceObservers(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/test-harness/journey?theme=ocean-quest&count=30", { waitUntil: "load" });
  await expect(page.locator(".child-journey-map")).toHaveAttribute("data-motion-settled", "true");
  await page.waitForTimeout(750);
  await page.locator('[data-child-journey-entry="doel-2"]').click();
  await expect(page.locator('[data-child-journey-entry="doel-2"]')).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(100);

  const measured = await page.evaluate(() => {
    const state = (window as Window & { __journeyPerformance?: { cls: number; events: number[]; lcp: number } }).__journeyPerformance;
    return {
      cls: Number((state?.cls ?? 0).toFixed(4)),
      interactionLatencyMs: Math.max(0, ...(state?.events ?? [])),
      lcpMs: Math.round(state?.lcp ?? 0),
      noHorizontalDocumentOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      runtimeImagesHealthy: [...document.images].every((image) => image.complete && image.naturalWidth > 0)
    };
  });
  const performanceArtifact = testInfo.outputPath("journey-performance.json");
  await writeFile(performanceArtifact, `${JSON.stringify(measured, null, 2)}\n`, "utf8");
  await testInfo.attach("journey-performance", { contentType: "application/json", path: performanceArtifact });
  expect(measured.lcpMs, "LCP must be observed").toBeGreaterThan(0);
  expect(measured.lcpMs).toBeLessThanOrEqual(2_500);
  expect(measured.cls).toBeLessThanOrEqual(0.1);
  expect(measured.interactionLatencyMs).toBeLessThanOrEqual(200);
  expect(measured.noHorizontalDocumentOverflow).toBeTruthy();
  expect(measured.runtimeImagesHealthy).toBeTruthy();
  expect(consoleErrors).toEqual([]);
});

async function journeyContext(browser: Browser, viewport: { height: number; width: number }, dismissed: boolean): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });
  if (dismissed) await context.addInitScript((key) => window.localStorage.setItem(key, "dismissed"), helpKey);
  return context;
}

async function openJourney(page: Page, theme: string, count: number) {
  const response = await page.goto(`/test-harness/journey?theme=${theme}&count=${count}`, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator(".child-journey-map")).toHaveAttribute("data-motion-settled", "true");
}

async function selectEntry(page: Page, selector: string, open: boolean) {
  const entry = page.locator(selector);
  if (open) await entry.evaluate((element: HTMLButtonElement) => element.click());
  else await entry.evaluate((element: HTMLButtonElement) => element.focus({ preventScroll: true }));
  await expect(entry).toHaveAttribute("aria-pressed", "true");
  if (open) await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".child-journey-map")).toHaveAttribute("data-motion-settled", "true");
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const artifactPath = testInfo.outputPath(`journey-${name}.png`);
  const image = await page.screenshot({ animations: "disabled", fullPage: false, path: artifactPath });
  expect(image.byteLength).toBeGreaterThan(10_000);
  await testInfo.attach(`journey-${name}`, { contentType: "image/png", path: artifactPath });
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    const measuredWindow = window as Window & { __journeyPerformance?: { cls: number; events: number[]; lcp: number } };
    measuredWindow.__journeyPerformance = { cls: 0, events: [], lcp: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) measuredWindow.__journeyPerformance!.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
        if (!entry.hadRecentInput) measuredWindow.__journeyPerformance!.cls += entry.value ?? 0;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number; interactionId?: number }>) {
        if (entry.interactionId) measuredWindow.__journeyPerformance!.events.push(entry.duration);
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit & { durationThreshold: number });
  });
}
