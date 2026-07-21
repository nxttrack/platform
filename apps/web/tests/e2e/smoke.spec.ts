import { expect, test, type Page } from "@playwright/test";

const publicRoutes = [
  { path: "/", label: "root" },
  { path: "/login", label: "login" },
  { path: "/wachtwoord-vergeten", label: "password forgotten" },
  { path: "/wachtwoord-resetten", label: "password reset" },
  { path: "/nxttrack", label: "marketing" },
  { path: "/nxttrack/zwemscholen", label: "marketing swim schools" }
];

const privateRoutes = ["/platform", "/admin", "/portaal", "/instructor"];

const marketingSubpages = [
  { path: "/nxttrack/ouderportaal", heading: "Altijd weten waar je kind staat." },
  { path: "/nxttrack/trainer-app", heading: "De trainer app die tijdens de les werkt." },
  { path: "/nxttrack/backoffice", heading: "Volledige controle over jouw zwemschool." },
  { path: "/nxttrack/wachtrij-planning", heading: "Meer grip op instroom en capaciteit." },
  { path: "/nxttrack/badges-diplomas", heading: "Van voortgang naar trots." },
  { path: "/nxttrack/prijzen", heading: "Heldere plannen voor elke zwemschool." },
  { path: "/nxttrack/demo", heading: "Zie NXTTRACK in actie." },
  { path: "/nxttrack/contact", heading: "Laten we kennismaken." },
  { path: "/nxttrack/privacy", heading: "Privacy-first ontwerp." },
  { path: "/nxttrack/login", heading: "Welkom terug." }
] as const;

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

  test("marketing subpages share an accessible route-aware shell", async ({ page }) => {
    const failures = collectRuntimeFailures(page);

    await page.goto("/nxttrack/zwemscholen", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Software speciaal voor zwemscholen." })).toBeVisible();

    const menuTrigger = page.getByRole("button", { name: "Navigatie openen" });

    if (await menuTrigger.isVisible()) {
      await menuTrigger.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      const mobileNavigation = page.getByRole("navigation", { name: "Mobiele NXTTRACK navigatie" });
      await expect(mobileNavigation).toBeVisible();
      await expect(mobileNavigation.getByRole("link", { name: "Zwemscholen" })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    } else {
      const desktopNavigation = page.getByRole("navigation", { name: "NXTTRACK hoofdnavigatie" });
      await expect(desktopNavigation.getByRole("link", { name: "Zwemscholen" })).toHaveAttribute("aria-current", "page");
    }

    expect(failures()).toEqual([]);
  });

  test("every canonical marketing subpage has a dedicated composition", async ({ page }) => {
    const failures = collectRuntimeFailures(page);

    for (const route of marketingSubpages) {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 0, route.path).toBeLessThan(500);
      await expect(page.getByRole("heading", { level: 1, name: route.heading }), route.path).toBeVisible();
      await expect(page.getByRole("banner"), route.path).toBeVisible();
      await expect(page.getByRole("contentinfo"), route.path).toBeVisible();
    }

    await page.goto("/nxttrack/demo", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Vraag demo aan per e-mail" })).toHaveAttribute("href", /^mailto:/);

    await page.goto("/nxttrack/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Open Ouder / leerling login" })).toHaveAttribute("href", "/login?next=%2Fportaal");
    await expect(page.getByRole("link", { name: "Open Trainer login" })).toHaveAttribute("href", "/login?next=%2Finstructor");
    await expect(page.getByRole("link", { name: "Open Beheerder login" })).toHaveAttribute("href", "/login?next=%2Fadmin");

    expect(failures()).toEqual([]);
  });

  test("public auth forms expose labelled controls and password strength semantics", async ({ page }) => {
    const failures = collectRuntimeFailures(page);

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("E-mail")).toHaveAttribute("autocomplete", "email");
    await expect(page.getByLabel("Wachtwoord")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByRole("button", { name: "Inloggen" })).toBeVisible();

    await page.goto("/wachtwoord-resetten", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("6-cijferige code")).toHaveAttribute("inputmode", "numeric");
    await expect(page.getByRole("progressbar", { name: "Wachtwoordsterkte" })).toHaveAttribute("aria-valuenow", "0");
    await expect(page.getByLabel("Nieuw wachtwoord")).toHaveAttribute("aria-describedby", "password-strength-description");

    expect(failures()).toEqual([]);
  });
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
    if (response.status() >= 500 || (response.status() >= 400 && response.url().includes("/_next/static/"))) {
      failures.push(`response ${response.status()}: ${response.url()}`);
    }
  });

  return () => failures;
}

function isExpectedBrowserResourceNoise(message: string) {
  return message.includes("favicon");
}
