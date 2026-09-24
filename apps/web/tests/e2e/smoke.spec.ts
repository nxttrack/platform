import { expect, test, type Page } from "@playwright/test";
import { instructorRosterEntry } from "./helpers/instructor-roster";

test("instructor roster selection remains exact beside focus cards and matching participant names", async ({ page }) => {
  const participantId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  const rosterCard = (id: string, name: string) => `<article data-roster="${id}">
    <h3>${name}</h3><a href="/instructor/student/${id}">Student detail</a>
    <form onsubmit="event.preventDefault(); document.body.dataset.attendance = '${id}'">
      <input name="participantId" type="hidden" value="${id}">
      <input name="status" type="hidden" value="late"><button type="submit">Laat</button>
    </form><span>open</span>
  </article>`;
  await page.setContent(`<section aria-label="Vandaag focus"><article>
    <h4>E2E Leerling</h4><p>Fictieve afgeschermde score</p>
    <form><input name="participantId" type="hidden" value="${participantId}"><button>Notitie toevoegen</button></form>
  </article></section>
  ${rosterCard(otherId, "E2E Leerling extra")}
  ${rosterCard(participantId, "E2E Leerling")}`);

  // All three match the old text-only selector; only one is this participant's attendance row.
  await expect(page.locator("article").filter({ hasText: "E2E Leerling" })).toHaveCount(3);
  const roster = instructorRosterEntry(page, participantId);
  await expect(roster).toHaveCount(1);
  await expect(roster).toHaveAttribute("data-roster", participantId);
  await roster.getByRole("button", { name: "Laat", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-attendance", participantId);

  // Preserve ambiguity detection: a genuine duplicate must still fail the journey's count assertion.
  await page.locator(`[data-roster="${participantId}"]`).evaluate((element) => element.after(element.cloneNode(true)));
  await expect(roster).toHaveCount(2);
  await page.locator(`[data-roster="${participantId}"]`).evaluateAll((elements) => elements.forEach((element) => element.remove()));
  await expect(roster).toHaveCount(0);
});

const publicRoutes = [
  { path: "/", label: "root" },
  { path: "/login", label: "login" },
  { path: "/wachtwoord-vergeten", label: "password forgotten" },
  { path: "/wachtwoord-resetten", label: "password reset" },
  { path: "/nxttrack", label: "marketing" },
  { path: "/nxttrack/zwemscholen", label: "marketing swim schools" }
];

const privateRoutes = [
  "/platform",
  "/platform/badges",
  "/admin",
  "/admin/badges",
  "/admin/berichten",
  "/portaal",
  "/portaal/badges",
  "/kind",
  "/kind/reis",
  "/instructor"
];

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
  test("child session API requires authentication and cannot be cached", async ({ request }) => {
    const response = await request.get("/api/child/session");
    expect(response.status()).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
    expect(response.headers()["cache-control"]).toContain("no-store");
  });

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

  test("public responses expose the release security headers", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();

    expect(response.status()).toBeLessThan(500);
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(["DENY", "SAMEORIGIN"]).toContain(headers["x-frame-options"]);
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

      await expect
        .poll(async () => new URL(page.url()).pathname === "/login" || (await page.getByLabel("E-mail").isVisible().catch(() => false)))
        .toBe(true);
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
      const mobileMenu = page.getByRole("dialog", { name: "NXTTRACK navigatie" });
      await expect(mobileMenu).toBeVisible();
      const mobileNavigation = page.getByRole("navigation", { name: "Mobiele NXTTRACK navigatie" });
      await expect(mobileNavigation).toBeVisible();
      await expect(mobileNavigation.getByRole("link", { name: "Zwemscholen" })).toHaveAttribute("aria-current", "page");
      await page.keyboard.press("Escape");
      await expect(mobileMenu).toBeHidden();
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

  test("invitation acceptance distinguishes code, password and activation failures", async ({ page }) => {
    const messages = [
      ["invalid_code", "De code is ongeldig of verlopen."],
      ["password", "Het gekozen wachtwoord voldoet niet aan de eisen"],
      ["activation", "De code is juist, maar het account kon tijdelijk niet worden geactiveerd."]
    ] as const;

    for (const [reason, message] of messages) {
      await page.goto(`/uitnodiging-accepteren?error=${reason}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("alert").filter({ hasText: message })).toHaveCount(1);
    }
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
