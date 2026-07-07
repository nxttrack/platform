import { expect, test, type Page } from "@playwright/test";

const visualRoutes = [
  { path: "/", label: "root" },
  { path: "/login", label: "login" },
  { path: "/nxttrack", label: "marketing" }
];

test.describe("visual, accessibility and performance smoke", () => {
  for (const route of visualRoutes) {
    test(`${route.label} has nonblank UI, basic accessibility and acceptable load time`, async ({ page }, testInfo) => {
      const startedAt = Date.now();
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      const domContentLoadedMs = Date.now() - startedAt;

      expect(response?.status() ?? 0).toBeLessThan(500);
      await page.waitForLoadState("networkidle", { timeout: 7_500 }).catch(() => undefined);

      const bodyText = (await page.locator("body").innerText()).trim();

      expect(bodyText.length).toBeGreaterThan(20);
      expect(domContentLoadedMs).toBeLessThan(10_000);

      const screenshot = await page.screenshot({ fullPage: true });

      expect(screenshot.byteLength).toBeGreaterThan(10_000);
      await testInfo.attach(`visual-${route.label}`, {
        body: screenshot,
        contentType: "image/png"
      });

      const accessibilityIssues = await collectBasicAccessibilityIssues(page);

      expect(accessibilityIssues).toEqual([]);

      const performance = await collectPerformance(page);

      expect(performance.domContentLoadedMs).toBeLessThan(10_000);
      expect(performance.loadCompleteMs).toBeLessThan(15_000);
    });
  }
});

async function collectBasicAccessibilityIssues(page: Page) {
  return page.evaluate(() => {
    const issues: string[] = [];
    const controls = Array.from(document.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea"));

    for (const control of controls) {
      const element = control as HTMLElement;
      const name = accessibleName(element);

      if (!name) {
        issues.push(`${element.tagName.toLowerCase()} missing accessible name: ${element.outerHTML.slice(0, 160)}`);
      }
    }

    const images = Array.from(document.querySelectorAll("img"));

    for (const image of images) {
      if (!image.hasAttribute("alt")) {
        issues.push(`img missing alt: ${image.getAttribute("src") ?? "unknown source"}`);
      }
    }

    return issues;

    function accessibleName(element: HTMLElement) {
      const labelledBy = element.getAttribute("aria-labelledby");

      if (labelledBy) {
        const labelledText = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent?.trim())
          .filter(Boolean)
          .join(" ");

        if (labelledText) {
          return labelledText;
        }
      }

      const directLabel = element.getAttribute("aria-label") ?? element.getAttribute("title") ?? element.textContent;

      if (directLabel?.trim()) {
        return directLabel.trim();
      }

      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        const labels = Array.from(element.labels ?? [])
          .map((label) => label.textContent?.trim())
          .filter(Boolean)
          .join(" ");

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          return labels || element.placeholder || element.name || "";
        }

        return labels || element.name || "";
      }

      return "";
    }
  });
}

async function collectPerformance(page: Page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

    return {
      domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd ?? 0),
      loadCompleteMs: Math.round(navigation?.loadEventEnd ?? navigation?.domContentLoadedEventEnd ?? 0)
    };
  });
}
