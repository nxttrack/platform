import { expect, test, type Page } from "@playwright/test";

const publicRoutes = [
  { path: "/", label: "root" },
  { path: "/login", label: "login" },
  { path: "/wachtwoord-vergeten", label: "password forgotten" },
  { path: "/nxttrack", label: "marketing" }
];

const privateRoutes = ["/platform", "/admin", "/portaal", "/instructor"];

test.describe("staging MVP smoke", () => {
  test("health endpoint returns the expected payload", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();

    expect(body).toMatchObject({
      ok: true,
      app: "nxttrack-platform"
    });
  });

  for (const route of publicRoutes) {
    test(`public route ${route.label} renders without server error`, async ({ page }) => {
      const failures = collectRuntimeFailures(page);
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });

      expect(response?.status() ?? 0).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toHaveText("");
      expect(failures()).toEqual([]);
    });
  }

  for (const route of privateRoutes) {
    test(`private route ${route} requires authentication`, async ({ page }) => {
      const failures = collectRuntimeFailures(page);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });

      expect(response?.status() ?? 0).toBeLessThan(500);
      await expect(page.locator("body")).toBeVisible();

      const currentUrl = new URL(page.url());
      const hasLoginSurface = await page.locator("input[name='email'], form").first().isVisible().catch(() => false);

      expect(currentUrl.pathname === "/login" || hasLoginSurface).toBeTruthy();
      expect(failures()).toEqual([]);
    });
  }
});

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedBrowserResourceNoise(message.text())) {
      failures.push(`console: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on("response", (response) => {
    if (response.status() >= 500) {
      failures.push(`response ${response.status()}: ${response.url()}`);
    }
  });

  return () => failures;
}

function isExpectedBrowserResourceNoise(message: string) {
  return message.includes("Failed to load resource: the server responded with a status of 404") || message.includes("favicon");
}
