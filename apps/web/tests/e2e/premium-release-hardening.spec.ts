import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.PREMIUM_RELEASE_BROWSER_ENABLED === "true";

if (!enabled) {
  test("critical premium-release configuration is present", () => {
    expect(enabled, "PREMIUM_RELEASE_BROWSER_ENABLED=true is required; this critical suite may not silently skip.").toBe(true);
  });
} else {
test.describe("premium release hardening", () => {

  test("tenant admin can inspect explainable commercial and retention workflows", async ({ page }) => {
    test.setTimeout(120_000);
    const failures = collectRuntimeFailures(page);
    await signIn(page, requiredEnv("E2E_TENANT_ADMIN_EMAIL"), requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin");

    await expectHeading(page, "Vandaag belangrijk");
    await expect(page.getByText("Brondata en redenen blijven zichtbaar", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capaciteit en instroom vandaag" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Alles/ })).toHaveAttribute("aria-current", "page");

    await page.goto("/admin/crm", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "CRM-pipeline");
    for (const label of ["Pipeline", "Alle leads", "Duplicaten", "Servicenormen"]) {
      await expect(page.getByRole("link", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    const firstLead = page.locator('a[href*="/admin/crm?tab=board&lead="]').first();
    await expect(firstLead, "The controlled staging fixture must expose at least one CRM lead.").toBeVisible();
    await firstLead.click();
    await expect(page.getByText("Leaddossier", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Fase")).toBeVisible();
    await expect(page.getByLabel("Lead owner")).toBeVisible();
    await expect(page.getByText("Er wordt niets automatisch verzonden.", { exact: false })).toBeVisible();
    await assertNoSeriousAccessibilityIssues(page);

    await page.goto("/admin/plekherstel", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Empty Seat Recovery");
    await expect(page.getByRole("heading", { name: "Uitlegbare capaciteitsmatching" })).toBeVisible();
    await expect(page.getByText("Er wordt nooit automatisch geboekt, aangeboden of gemaild.", { exact: false })).toBeVisible();
    const reviewTask = page.getByRole("button", { name: "Maak reviewtaak" }).first();
    if (await reviewTask.isVisible().catch(() => false)) {
      await reviewTask.click();
      await expect(page.getByRole("alertdialog")).toContainText("Er wordt geen plek gereserveerd");
      await expect(page.getByRole("button", { name: "Reviewtaak aanmaken" })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByRole("heading", { name: "Geen open herstelkansen" }).or(page.getByText("Reviewtaak staat klaar").first())).toBeVisible();
    }

    await page.goto("/admin/aandacht", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Persoonlijke aandacht");
    await expect(page.getByRole("heading", { name: "Menselijke aandacht, geen automatisch oordeel" })).toBeVisible();
    await expect(page.getByText("NXTTRACK verstuurt niets, schrijft niemand uit", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyse verversen" })).toBeVisible();

    expect(failures()).toEqual([]);
  });

  test("tenant admin sees safe workforce, lesson-plan and seasonal planning boundaries", async ({ page }) => {
    test.setTimeout(120_000);
    const failures = collectRuntimeFailures(page);
    await signIn(page, requiredEnv("E2E_TENANT_ADMIN_EMAIL"), requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/vervanging");

    await expectHeading(page, "Instructor vervangingsassistent");
    await expect(page.getByRole("heading", { name: "Les kiezen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Veilige beslisgrens" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Een concept verstuurt geen bericht." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kwalificatie" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Belastbaarheid" })).toBeVisible();

    await page.goto("/admin/lesplannen", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Lesplanassistent");
    await expect(page.getByText("menselijke goedkeuring", { exact: false }).first()).toBeVisible();
    const proposalButton = page.getByRole("button", { name: /Voorstel maken|Opnieuw berekenen/ }).first();
    if (await proposalButton.isVisible().catch(() => false)) {
      await proposalButton.click();
      const confirmation = page.getByRole("alertdialog");
      await expect(confirmation).toContainText(/Lesplanvoorstel maken|Lesplan opnieuw berekenen/);
      await expect(confirmation.getByRole("button", { name: /Voorstel genereren|Nieuwe versie genereren/ })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(page.getByRole("heading", { name: "Nog geen lesmomenten" })).toBeVisible();
    }
    await assertNoSeriousAccessibilityIssues(page);

    await page.goto("/admin/seizoenen", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Seizoenen & vakantieroosters");
    await expect(page.getByRole("heading", { name: "Seizoenskalender" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vakanties en sluitingen" })).toBeVisible();
    await page.getByRole("button", { name: "Sluiting" }).click();
    const blackoutDrawer = page.getByRole("dialog", { name: "Vakantie of sluiting" });
    await expect(blackoutDrawer.getByLabel("Lesbehandeling")).toBeVisible();
    await expect(blackoutDrawer.getByRole("button", { name: "Als concept opslaan" })).toBeVisible();
    await page.keyboard.press("Escape");

    expect(failures()).toEqual([]);
  });

  test("platform owner sees audited support and non-blocking package controls", async ({ page }) => {
    test.setTimeout(90_000);
    const failures = collectRuntimeFailures(page);
    await signIn(page, requiredEnv("E2E_PLATFORM_OWNER_EMAIL"), requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"), "/platform/support");

    await expectHeading(page, "Supporttoegang");
    await expect(page.getByText("read-only", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Aanvraag" }).click();
    const supportDrawer = page.getByRole("dialog", { name: "Toegang aanvragen" });
    await expect(supportDrawer.getByLabel("Organisatie")).toBeVisible();
    await expect(supportDrawer.getByLabel("Concrete supportreden")).toBeVisible();
    await expect(supportDrawer.getByLabel("Maximale duur")).toBeVisible();
    await expect(supportDrawer.getByRole("button", { name: "Ter goedkeuring versturen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await assertNoSeriousAccessibilityIssues(page);

    await page.goto("/platform/packages", { waitUntil: "domcontentloaded" });
    await expectHeading(page, "Packages & Feature Control");
    await expect(page.getByText("Meten alsof pakketten bestaan.", { exact: false })).toBeVisible();
    await expect(page.getByText("0 blokkades", { exact: true })).toBeVisible();
    await expect(page.getByText("altijd toegestaan", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Releaseflag-inventaris" })).toBeVisible();
    await expect(page.getByText("nog niet aan runtime-autorisatie gekoppeld", { exact: false })).toBeVisible();

    expect(failures()).toEqual([]);
  });

  test("parent sees privacy-safe web-push state without implicit activation", async ({ page }) => {
    test.setTimeout(90_000);
    const failures = collectRuntimeFailures(page);
    await signIn(page, requiredEnv("E2E_PARENT_EMAIL"), requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/profiel");

    await expectHeading(page, "Profiel & meer");
    await expect(page.getByRole("heading", { name: "Directe, veilige updates" })).toBeVisible();
    await expect(page.getByText("Expliciete toestemming per apparaat", { exact: true })).toBeVisible();

    const unavailable = page.getByText("De zwemschool heeft web-push nog niet technisch geactiveerd.", { exact: true });
    const enableButton = page.getByRole("button", { name: "Pushmeldingen inschakelen" });
    if (await unavailable.isVisible().catch(() => false)) {
      await expect(enableButton).toBeDisabled();
    } else {
      await expect(enableButton).toBeEnabled();
    }
    await assertNoSeriousAccessibilityIssues(page);

    expect(failures()).toEqual([]);
  });
});
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  await expect(page).toHaveURL(new RegExp(`${nextPath.split("?")[0].replaceAll("/", "\\/")}(?:\\?|$)`));
}

async function expectHeading(page: Page, name: string) {
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function assertNoSeriousAccessibilityIssues(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500 || (response.status() >= 400 && response.url().includes("/_next/static/"))) {
      failures.push(`response ${response.status()}: ${response.url()}`);
    }
  });
  return () => failures;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
