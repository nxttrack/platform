import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.JOURNEY_BOT_STAGING_SMOKE === "true";

test.describe("Journey Simulation Bot staging smoke", () => {
  test.skip(!enabled, "Enable only after the Waterlijn Journey Bot foundation is seeded.");

  test("platform owner can enable and complete one full Waterlijn journey", async ({ page }) => {
    test.setTimeout(180_000);
    const failures = collectRuntimeFailures(page);
    await signIn(
      page,
      requiredEnv("E2E_PLATFORM_OWNER_EMAIL"),
      requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"),
      "/platform/test-tools/journey-bot"
    );

    await expect(page.getByRole("heading", { name: "Journey Simulation Bot" })).toBeVisible();
    await expect(page.getByText("Zwemacademie De Waterlijn", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Environment veilig", { exact: false })).toBeVisible();
    await page.getByLabel("Bot ingeschakeld").check();
    await page.getByLabel("Nieuwe runs pauzeren").uncheck();
    await page.getByLabel("Scenario").selectOption("full_journey_to_diploma");
    await page.getByLabel("Journeys per run").fill("1");
    await page.getByRole("button", { name: "Configuratie opslaan" }).click();
    await expect(page).toHaveURL(/saved=config/);

    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page).toHaveURL(/saved=run/, { timeout: 150_000 });
    await expect(page.getByText("Actie uitgevoerd: run voltooid.")).toBeVisible();
    const newestRun = page.getByRole("row").filter({ hasText: "Volledige reis" }).first();
    await expect(newestRun).toContainText("completed");
    await expect(page.getByText("completed_full_journey", { exact: true }).first()).toBeVisible();

    await page.getByLabel("Scenario").selectOption("stress_mix");
    await page.getByLabel("Journeys per run").fill("5");
    await page.getByLabel("Max. tegelijk").fill("5");
    await page.getByRole("button", { name: "Configuratie opslaan" }).click();
    await expect(page).toHaveURL(/saved=config/);
    await page.getByRole("button", { name: "Run now" }).click();
    await expect(page).toHaveURL(/saved=run/, { timeout: 150_000 });
    await expect(page.getByText("blocked_until_eligible", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("blocked_no_capacity", { exact: true }).first()).toBeVisible();
    expect(failures()).toEqual([]);
  });
});

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
