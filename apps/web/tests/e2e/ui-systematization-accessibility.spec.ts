import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const email = process.env.E2E_TENANT_ADMIN_EMAIL;
const password = process.env.E2E_TENANT_ADMIN_PASSWORD;
const paths = ["/admin/leerlingen", "/admin/groepen", "/admin/intake", "/admin/betalingen", "/admin/documenten", "/admin/taken", "/admin/uitnodigingen"];

test.describe("systematic admin UI accessibility", () => {
  test.skip(!email || !password, "Set tenant-admin E2E credentials to run authenticated UI accessibility checks.");

  test.beforeEach(async ({ page }) => {
    await signIn(page, "/admin/leerlingen");
  });

  test("resource tables pass critical WCAG checks and expose sorting state", async ({ page }) => {
    for (const path of paths) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious"), `${path}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
      const sortable = page.locator("th[aria-sort]").first();
      if (await sortable.count()) {
        await expect(sortable).toHaveAttribute("aria-sort", /^(none|ascending|descending)$/);
      }
    }
  });

  test("table details and global search are fully keyboard operable", async ({ page }) => {
    const firstRow = page.locator("tbody tr[tabindex='0']").first();
    test.skip((await firstRow.count()) === 0, "The configured tenant has no student rows.");
    await firstRow.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Globaal zoeken" })).toBeVisible();
    await page.keyboard.type("leerling");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("mobile bulk selection exposes a sticky, thumb-reachable action bar", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile-only interaction assertion.");
    const checkbox = page.getByRole("checkbox", { name: "Rij selecteren" }).first();
    test.skip((await checkbox.count()) === 0, "The configured tenant has no student rows.");
    await checkbox.click();
    const action = page.getByRole("button", { name: "Pauzeren" });
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const viewport = page.viewportSize();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? Number.POSITIVE_INFINITY);
  });
});

async function signIn(page: Page, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email ?? "");
  await page.locator("input[name='password']").fill(password ?? "");
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}`));
}
