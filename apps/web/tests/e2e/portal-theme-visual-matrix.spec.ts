import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const themes = ["nxttrack-default", "ocean-quest", "dolphin-bay", "turtle-trails", "aqua-academy"];
const routes = [
  "overview",
  "planning",
  "lesson-detail",
  "progress",
  "badges",
  "media",
  "diplomas",
  "inbox",
  "payments",
  "documents",
  "feedback",
  "family-access",
  "profile"
];

test("platformpreview rendert de volledige 5 × 13 desktop- en mobiele matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "De matrix bevat zelf zowel desktop- als mobiele viewports.");
  await signIn(page);
  await page.goto("/platform/themes");
  await expect(page.getByRole("heading", { name: "Theme Control Center" })).toBeVisible();

  for (const theme of themes) {
    const card = page.locator(`[data-theme-preview="${theme}"]`).last();
    if (!(await card.isVisible())) {
      await page.getByText("Desktop, mobiel en states previewen", { exact: true }).nth(themes.indexOf(theme)).click();
    }
    await expect(card).toBeVisible();

    for (const route of routes) {
      await card.getByLabel("Previewroute").selectOption(route);
      await card.getByLabel("Previewstate").selectOption("data");
      await expect(card.locator(`[data-preview-route="${route}"][data-preview-mode="desktop"]`)).toBeVisible();
      await expect(card.locator(`[data-preview-route="${route}"][data-preview-mode="mobile"]`)).toBeVisible();
      await testInfo.attach(`${theme}-${route}`, {
        body: await card.screenshot({ animations: "disabled" }),
        contentType: "image/png"
      });
    }

    for (const state of ["empty", "locked", "error"]) {
      await card.getByLabel("Previewstate").selectOption(state);
      await expect(card.locator(`[data-preview-state="${state}"]`)).toHaveCount(2);
      await testInfo.attach(`${theme}-core-state-${state}`, {
        body: await card.screenshot({ animations: "disabled" }),
        contentType: "image/png"
      });
    }
  }
});

async function signIn(page: import("@playwright/test").Page) {
  const email = requiredEnv("E2E_PLATFORM_OWNER_EMAIL");
  const password = requiredEnv("E2E_PLATFORM_OWNER_PASSWORD");
  await page.goto("/login?next=%2Fplatform%2Fthemes", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/platform\/themes/);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
