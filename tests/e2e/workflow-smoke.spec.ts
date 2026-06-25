import { expect, type Page, test } from "@playwright/test";

const unique = Date.now().toString(36);

test.describe("Browser E2E smoke", () => {
  test("public intake can submit when intake data is available", async ({ page }) => {
    await assertHealthyPage(page, "/intake", /Intake|Geen intake beschikbaar|Tenantwebsite nog niet beschikbaar/);

    const submitButton = page.getByRole("button", { name: /intake versturen/i });
    if ((await submitButton.count()) === 0) {
      await expect(page.getByText(/Geen intake beschikbaar|Tenantwebsite nog niet beschikbaar/)).toBeVisible();
      test.info().annotations.push({ type: "fixture", description: "No public intake form available on this environment." });
      return;
    }

    await page.locator('input[name="parent_name"]').fill(`E2E Ouder ${unique}`);
    await page.locator('input[name="parent_email"]').fill(`e2e-${unique}@example.test`);
    await page.locator('input[name="parent_phone"]').fill("0612345678");
    await page.locator('input[name="participant_name"]').fill(`E2E Kind ${unique}`);
    await page.locator('input[name="participant_birthdate"]').fill("2018-04-12");
    await checkFirstAvailable(page, 'input[name="preferred_days"]');
    await checkFirstAvailable(page, 'input[name="preferred_time_windows"]');
    const notes = page.locator('textarea[name="notes"]');
    if ((await notes.count()) > 0) {
      await notes.fill("Playwright staging smoke intake.");
    }

    await Promise.all([page.waitForURL(/submitted=1/, { timeout: 15_000 }), submitButton.click()]);
    await expect(page.getByText(/Intake ontvangen/i)).toBeVisible();
  });

  test("slot offer accept page is reachable and can accept with token fixture", async ({ page }) => {
    const token = process.env.E2E_SLOT_OFFER_TOKEN ?? "demo-token";
    await assertHealthyPage(page, `/slot-offers/${encodeURIComponent(token)}`, /Lesplek|aanbod|niet beschikbaar|token|Login|Tenantwebsite/i);

    const acceptButton = page.getByRole("button", { name: /accepteren|accept/i });
    if (!process.env.E2E_SLOT_OFFER_TOKEN || (await acceptButton.count()) === 0) {
      test.info().annotations.push({ type: "fixture", description: "Set E2E_SLOT_OFFER_TOKEN to run real slot-offer acceptance." });
      return;
    }

    await Promise.all([page.waitForLoadState("networkidle"), acceptButton.click()]);
    await expect(page.getByText(/geaccepteerd|bevestigd|plaatsing/i)).toBeVisible();
  });

  test("admin placement workflow renders or enforces auth boundary", async ({ page }) => {
    await maybeLogin(page, "admin");
    await assertHealthyPage(page, "/admin/plaatsingsvoorstellen", /Plaatsingsvoorstellen|Log in|Geen toegang|NXTTRACK toegang/i);
    await assertNoScaffoldCopy(page);
  });

  test("parent portal renders current state or enforces auth boundary", async ({ page }) => {
    await maybeLogin(page, "parent");
    await assertHealthyPage(page, "/parent", /Ouderportaal|Mijn lessen|Log in|Geen toegang|NXTTRACK toegang/i);
    await assertNoScaffoldCopy(page);
  });

  test("instructor attendance workflow is mobile-safe or auth guarded", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await maybeLogin(page, "instructor");
    await assertHealthyPage(page, "/instructor/agenda", /Agenda|Aanwezigheid|Groepslijst|Log in|Geen toegang|NXTTRACK toegang/i);
    await assertNoScaffoldCopy(page);

    const attendanceButton = page.getByRole("button", { name: /aanwezigheid|opslaan|present|aanwezig/i }).first();
    if ((await attendanceButton.count()) > 0 && process.env.E2E_INSTRUCTOR_EMAIL) {
      await expect(attendanceButton).toBeVisible();
    }
  });

  test("manual payment admin page renders actionable payment flow or auth boundary", async ({ page }) => {
    await maybeLogin(page, "admin");
    await assertHealthyPage(page, "/admin/payments", /Betalingen|Facturen|Handmatige betaling|Log in|Geen toegang|NXTTRACK toegang/i);
    await assertNoScaffoldCopy(page);
  });

  test("document download route is private and non-5xx", async ({ page, request }) => {
    await maybeLogin(page, "parent");
    await assertHealthyPage(page, "/parent/documenten", /Documenten|Diploma|Log in|Geen toegang|NXTTRACK toegang/i);

    const documentId = process.env.E2E_DOCUMENT_ID ?? "00000000-0000-0000-0000-000000000000";
    const response = await request.get(`/api/documents/${documentId}/download`, { maxRedirects: 0 });
    expect(response.status(), "document download must not produce server error").toBeLessThan(500);
    expect([200, 302, 401, 403, 404]).toContain(response.status());
  });
});

async function assertHealthyPage(page: Page, path: string, titlePattern: RegExp) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status() ?? 0, `${path} should respond`).toBeGreaterThanOrEqual(200);
  expect(response?.status() ?? 0, `${path} must not 5xx`).toBeLessThan(500);
  await expect(page.locator("body")).toContainText(titlePattern);
}

async function assertNoScaffoldCopy(page: Page) {
  await expect(page.locator("body")).not.toContainText(/Phase 2 scaffold|nog geen productdata/i);
}

async function maybeLogin(page: Page, role: "admin" | "parent" | "instructor") {
  const email = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];

  if (!email || !password) {
    return;
  }

  await page.goto(`/login?next=${encodeURIComponent("/auth/redirect")}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([page.waitForLoadState("networkidle"), page.getByRole("button", { name: /inloggen/i }).click()]);
}

async function checkFirstAvailable(page: Page, selector: string) {
  const option = page.locator(selector).first();
  if ((await option.count()) > 0) {
    await option.check();
  }
}
