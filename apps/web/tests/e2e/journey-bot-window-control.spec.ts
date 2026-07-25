import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.JOURNEY_BOT_WINDOW_CONTROL === "true";

test.describe("Journey Simulation Bot controlled staging window", () => {
  test.skip(!enabled, "Enable only through the guarded staging window workflow.");

  test("starts a bounded full ABC journey window", async ({ page }) => {
    test.setTimeout(900_000);
    const durationHours = readIntegerEnv("JOURNEY_BOT_WINDOW_HOURS", 1, 24);
    const stopAfterJourneys = readIntegerEnv("JOURNEY_BOT_WINDOW_BUDGET", 1, 100);
    const journeysPerTick = readIntegerEnv("JOURNEY_BOT_WINDOW_BATCH_SIZE", 1, 25);

    await signIn(
      page,
      requiredEnv("E2E_PLATFORM_OWNER_EMAIL"),
      requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"),
      "/platform/test-tools/journey-bot"
    );
    await expect(page.getByRole("heading", { name: "Journey Simulation Bot" })).toBeVisible();
    await expect(page.getByText("Zwemacademie De Waterlijn", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Environment veilig", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Testcyclus resetten" }).click();
    await expect(page).toHaveURL(/saved=reset/);
    await page.getByLabel("Bot ingeschakeld").check();
    await page.getByLabel("Nieuwe runs pauzeren").uncheck();
    await page.getByLabel("Scenario").selectOption("full_journey_to_diploma");
    await page.getByLabel("Snelheid").selectOption("realistic");
    await page.getByLabel("Min. interval (min)").fill("5");
    await page.getByLabel("Max. interval (min)").fill("5");
    await page.getByLabel("Journeys per run").fill(String(journeysPerTick));
    await page.getByLabel("Max. tegelijk").fill(String(Math.max(3, journeysPerTick)));
    await page.getByLabel("Max. per dag").fill("1000");
    await page.getByLabel("Stop na journeys").fill(String(stopAfterJourneys));
    await page.getByRole("button", { name: "Configuratie opslaan" }).click();
    await expect(page).toHaveURL(/saved=config/);

    await page.getByLabel("Aantal uren").fill(String(durationHours));
    await page.getByRole("button", { name: "Run komende uren" }).click();
    await expect(page).toHaveURL(/saved=window/, { timeout: 840_000 });
    await expect(page.getByText("Actie uitgevoerd: runvenster gestart.")).toBeVisible();
    await expect(metric(page, "Botstatus")).toContainText("Actief");
    await expect(page.getByText(new RegExp(`Testbudget: ${journeysPerTick}/${stopAfterJourneys} journeys`))).toBeVisible();

    const newestRun = page.getByRole("row").filter({ hasText: "Volledige reis" }).first();
    await expect(newestRun).toContainText("completed");
    await expect(newestRun).toContainText("healthy");
    await expect(newestRun).toContainText(`${journeysPerTick} geslaagd`);
    await expect(newestRun).toContainText("0 technisch");
  });
});

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

function readIntegerEnv(name: string, min: number, max: number) {
  const value = Number.parseInt(requiredEnv(name), 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} through ${max}.`);

  return value;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);

  return value;
}
