import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.JOURNEY_BOT_STAGING_SMOKE === "true";

test.describe("Journey Simulation Bot staging smoke", () => {
  test.skip(!enabled, "Enable only after the Waterlijn Journey Bot foundation is seeded.");

  test("tick endpoint weigert een ontbrekend cron-geheim", async ({ request }) => {
    const response = await request.post("/api/internal/journey-bot/tick");
    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ accepted: false, reason: "unauthorized" });
  });

  test("platform owner validates full journey, stressmatrix, stopbudget en cleanup", async ({ page }) => {
    test.setTimeout(420_000);
    const failures = collectRuntimeFailures(page);
    let signedIn = false;
    await signIn(
      page,
      requiredEnv("E2E_PLATFORM_OWNER_EMAIL"),
      requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"),
      "/platform/test-tools/journey-bot"
    );
    signedIn = true;

    try {
      await expect(page.getByRole("heading", { name: "Journey Simulation Bot" })).toBeVisible();
      await expect(page.getByText("Zwemacademie De Waterlijn", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("Environment veilig", { exact: false })).toBeVisible();
      await expect(page.getByText("Mail uit", { exact: true })).toBeVisible();
      await expect(page.getByText("Betalingen uit", { exact: true })).toBeVisible();
      await resetTestCycle(page);

      await page.getByLabel("Bot ingeschakeld").check();
      await page.getByLabel("Nieuwe runs pauzeren").uncheck();
      await page.getByLabel("Scenario").selectOption("full_journey_to_diploma");
      await page.getByLabel("Journeys per run").fill("1");
      await page.getByLabel("Max. tegelijk").fill("25");
      await page.getByLabel("Max. per dag").fill("1000");
      await page.getByLabel("Stop na journeys").fill("0");
      await page.getByRole("button", { name: "Configuratie opslaan" }).click();
      await expect(page).toHaveURL(/saved=config/);

      await page.getByRole("button", { name: "Run now" }).click();
      await expect(page).toHaveURL(/saved=run/, { timeout: 240_000 });
      await expect(page.getByText("Actie uitgevoerd: run voltooid.")).toBeVisible();
      const newestRun = page.getByRole("row").filter({ hasText: "Volledige reis" }).first();
      await expect(newestRun).toContainText("completed");
      await expect(newestRun).toContainText("healthy");
      await expect(newestRun).toContainText("1 geslaagd");
      await expect(newestRun).toContainText("0 technisch");
      const completedJourney = page.locator("details").filter({ hasText: "completed_full_journey" }).first();
      await expect(completedJourney).toBeVisible();
      await completedJourney.locator("summary").click();
      for (const eventType of [
        "intake_created",
        "placement_suggested",
        "placement_completed",
        "attendance_simulated",
        "progress_updated",
        "stage_transfer_completed",
        "old_capacity_released",
        "afzwem_ready",
        "certificate_created",
        "journey_completed"
      ]) {
        await expect(completedJourney.getByText(eventType, { exact: true }).first()).toBeVisible();
      }
      await expect(completedJourney.getByText("certificate_created", { exact: true })).toHaveCount(3);
      const journeyLog = (await completedJourney.locator("pre").textContent()) ?? "";
      const diplomaAIndex = journeyLog.indexOf("Diploma A-testdiploma aangemaakt.");
      const diplomaBIndex = journeyLog.indexOf("Diploma B-testdiploma aangemaakt.");
      const diplomaCIndex = journeyLog.indexOf("Diploma C-testdiploma aangemaakt.");
      expect(diplomaAIndex).toBeGreaterThan(-1);
      expect(diplomaBIndex).toBeGreaterThan(diplomaAIndex);
      expect(diplomaCIndex).toBeGreaterThan(diplomaBIndex);
      expect(journeyLog.match(/8 lessen van .+ bijgewoond\./g)).toHaveLength(7);

      await resetTestCycle(page);
      await page.getByLabel("Bot ingeschakeld").check();
      await page.getByLabel("Nieuwe runs pauzeren").uncheck();
      await page.getByLabel("Scenario").selectOption("stress_mix");
      await page.getByLabel("Journeys per run").fill("20");
      await page.getByLabel("Max. tegelijk").fill("25");
      await page.getByLabel("Max. per dag").fill("1000");
      await page.getByLabel("Stop na journeys").fill("20");
      await page.getByRole("button", { name: "Configuratie opslaan" }).click();
      await expect(page).toHaveURL(/saved=config/);
      await page.getByRole("button", { name: "Run now" }).click();
      await expect(page).toHaveURL(/saved=run/, { timeout: 300_000 });
      const stressRun = page.getByRole("row").filter({ hasText: "Stressmix" }).first();
      await expect(stressRun).toContainText("completed");
      await expect(stressRun).toContainText("healthy");
      await expect(stressRun).toContainText("20/20");
      await expect(stressRun).toContainText("0 technisch");
      await expect(stressRun).toContainText("0 onverwacht");
      await expect(page.getByText("blocked_until_eligible", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("blocked_no_capacity", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("simulated_recoverable_issue", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("verwacht", { exact: true }).first()).toBeVisible();
      await expect(metric(page, "Botstatus")).toContainText("Uit");
      await expect(page.getByText(/Testbudget: 20\/20 journeys/)).toBeVisible();
      expect(failures()).toEqual([]);
    } finally {
      if (signedIn) {
        await page.goto("/platform/test-tools/journey-bot", { waitUntil: "domcontentloaded" });
        await resetTestCycle(page);
      }
    }
  });
});

async function resetTestCycle(page: Page) {
  await page.getByRole("button", { name: "Testcyclus resetten" }).click();
  await expect(page).toHaveURL(/saved=reset/);
  await expect(metric(page, "Botstatus")).toContainText("Uit");
}

function metric(page: Page, label: string) {
  return page.locator("section").filter({ has: page.getByText(label, { exact: true }) });
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}(?:\\?|$)`));
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`response ${response.status()}: ${response.url()}`);
  });
  return () => failures;
}
