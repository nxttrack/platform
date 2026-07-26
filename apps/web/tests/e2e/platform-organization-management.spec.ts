import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_PLATFORM_OWNER_EMAIL;
const password = process.env.E2E_PLATFORM_OWNER_PASSWORD;

test.describe("platform organization management", () => {
  test.skip(!email || !password, "Set platform-owner E2E credentials to validate organization management.");

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("opens an organization control plane without exposing technical user identifiers", async ({ page }) => {
    const firstOrganization = page.locator("tbody tr[tabindex='0']").first();
    test.skip((await firstOrganization.count()) === 0, "No organizations are available in this environment.");

    await firstOrganization.click();
    const manageLink = page.getByRole("link", { name: "Organisatie beheren" });
    await expect(manageLink).toBeVisible();
    await manageLink.click();
    await expect(page).toHaveURL(/\/platform\/organisaties\/[0-9a-f-]+$/i);

    await expect(page.getByRole("heading", { name: "Organisatiebeheerders" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gebruikers en rollen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Uitnodigingen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domeinen" })).toBeVisible();

    const visibleText = await page.locator("main").innerText();
    expect(visibleText).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  });

  test("exposes labelled account administration and passes serious WCAG checks", async ({ page }) => {
    const firstOrganization = page.locator("tbody tr[tabindex='0']").first();
    test.skip((await firstOrganization.count()) === 0, "No organizations are available in this environment.");

    await firstOrganization.click();
    await page.getByRole("link", { name: "Organisatie beheren" }).click();

    await expect(page.getByLabel("Naam", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("E-mail", { exact: true }).first()).toHaveAttribute("type", "email");
    await expect(page.getByRole("button", { name: "Account aanmaken en uitnodigen" })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

async function signIn(page: Page) {
  await page.goto("/login?next=%2Fplatform", { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email ?? "");
  await page.locator("input[name='password']").fill(password ?? "");
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(/\/platform(?:$|\?)/);
}
