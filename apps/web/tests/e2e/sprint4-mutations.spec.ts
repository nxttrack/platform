import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  tenant: { hostname: string };
  users: { tenantAdmin: { email: string } };
  expected: { groupName: string };
};

const state = loadState();
const enabled = process.env.SPRINT4_MUTATIONS_ENABLED === "true";

test.describe("Sprint 4 browser-driven mutations", () => {
  test.skip(!enabled || !state, "Enable Sprint 4 mutations with a Phase 16 staging state file.");

  test("public intake becomes a scored waitlist entry through the UI", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const phase = requireState();
    const failures = collectRuntimeFailures(page);
    const suffix = `${process.env.GITHUB_RUN_ID ?? Date.now()}-${testInfo.retry}`;
    const participantName = `Sprint4 Browser ${suffix}`;
    const parentName = `Sprint4 Ouder ${suffix}`;
    const parentEmail = `sprint4-${suffix}@example.test`;
    const tenantUrl = `https://${phase.tenant.hostname}`;

    await page.goto(`${tenantUrl}/intake`, { waitUntil: "domcontentloaded" });
    await page.locator("input[name='selectedOption'][value='waitlist']").check();
    await page.getByLabel("Naam ouder/verzorger").fill(parentName);
    await page.getByLabel("E-mail").fill(parentEmail);
    await page.getByLabel("Naam kind").fill(participantName);
    await page.getByLabel("Geboortedatum kind").fill("2019-07-22");
    await page.getByLabel("Maandag", { exact: true }).check();
    await page.getByLabel("Voorkeur of planning").fill("Maandagmiddag, browsergestuurde Sprint 4-test.");
    await page.getByLabel("Bericht").fill(`sprint4-browser:${suffix}`);
    await page.getByLabel("Heeft je kind al zwemervaring?").fill("Een beetje; graag starten in de eerste actieve groep.");
    await page.getByLabel(/Ik geef toestemming/).check();
    await page.getByRole("button", { name: "Aanmelding versturen" }).click();

    await expect(page).toHaveURL(/\/intake\?ontvangen=1&referentie=/);
    await expect(page.getByText("Aanmelding ontvangen.")).toBeVisible();

    await signIn(page, phase.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/wachtlijst");
    const pendingIntake = page.getByRole("listitem").filter({ hasText: participantName });

    await expect(pendingIntake).toHaveCount(1);
    await pendingIntake.getByRole("button", { name: "Maak wachtlijst" }).click();
    await expect(page).toHaveURL(/\/admin\/wachtlijst\?saved=1/);

    let entry = page.locator("article").filter({ hasText: participantName });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText("waiting");
    await entry.getByRole("button", { name: "Herbereken" }).click();
    await expect(page).toHaveURL(/\/admin\/wachtlijst\?saved=1/);

    entry = page.locator("article").filter({ hasText: participantName });
    await expect(entry).toContainText(phase.expected.groupName);
    await expect(entry).toContainText("voorkeursdag match");
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

function loadState() {
  const statePath = process.env.PHASE16_STATE_PATH;
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as Phase16State) : null;
}

function requireState() {
  if (!state) throw new Error("Phase 16 state is required for Sprint 4 mutations.");
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
