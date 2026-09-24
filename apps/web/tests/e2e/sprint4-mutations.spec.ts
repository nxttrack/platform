import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  tenant: { hostname: string };
  users: { tenantAdmin: { email: string } };
  expected: { groupName: string; programId: string };
};

type Sprint4EdgeState = Record<string, never>;

const state = loadJson<Phase16State>("PHASE16_STATE_PATH");
const edgeState = loadJson<Sprint4EdgeState>("SPRINT4_EDGE_STATE_PATH");
const enabled = process.env.SPRINT4_MUTATIONS_ENABLED === "true";

test.describe("Sprint 4 browser-driven mutations", () => {
  test.skip(!enabled, "Enable Sprint 4 mutations to run this staging-only journey.");
  test.beforeAll(() => {
    expect(state, "PHASE16_STATE_PATH must resolve to a readable state file when Sprint 4 mutations are enabled.").not.toBeNull();
    expect(edgeState, "SPRINT4_EDGE_STATE_PATH must resolve to a readable state file when Sprint 4 mutations are enabled.").not.toBeNull();
  });

  test("intake, placement and slot-offer outcomes are driven through the UI", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const phase = requireState();
    requireEdgeState();
    const failures = collectRuntimeFailures(page);
    const suffix = `${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}-${testInfo.retry}`;
    const participantName = `Sprint4 Browser ${suffix}`;
    const tenantUrl = `https://${phase.tenant.hostname}`;

    await submitIntake(page, tenantUrl, phase.expected.programId, participantName, suffix);

    await signIn(page, phase.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/wachtlijst");
    let entry = await convertIntake(page, participantName);
    await entry.getByRole("button", { name: "Voorstellen herberekenen" }).click();
    await expect(page).toHaveURL(/\/admin\/wachtlijst\?saved=1/);

    entry = await openPlacementDetails(page, participantName);
    await expect(entry).toContainText(phase.expected.groupName);
    await expect(entry.getByText("Voorkeursdag match", { exact: true })).toBeVisible();

    await createOffer(page, entry, phase.expected.groupName);
    await page.goto("/plaatsing-aanbod", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("8-cijferige beveiligingscode")).toBeVisible();
    await expect(page.getByText(participantName)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Plek accepteren" })).toHaveCount(0);

    await page.goto("/plaatsing-aanbod?token=legacy-capability-must-be-ignored", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("8-cijferige beveiligingscode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Plek accepteren" })).toHaveCount(0);
    expect(failures()).toEqual([]);
  });
});

async function submitIntake(page: Page, tenantUrl: string, programId: string, participantName: string, marker: string) {
  await page.goto(`${tenantUrl}/intake?programma=${encodeURIComponent(programId)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("form[data-intake-wizard]")).toHaveAttribute("data-hydrated", "true");
  await page.getByLabel("Naam kind").fill(participantName);
  await page.getByLabel("Geboortedatum kind").fill("2019-07-22");
  await page.getByText("Niet ingevuld", { exact: true }).click();
  await page.getByText("Wachtlijst", { exact: true }).click();
  await page.getByRole("button", { name: "Volgende" }).click();

  await page.getByLabel("Naam ouder/verzorger 1").fill(`Sprint4 Ouder ${marker}`);
  await page.getByLabel("E-mail").fill(`sprint4-${marker}@example.test`);
  await page.getByRole("button", { name: "Volgende" }).click();

  await page.getByText("Eerder zwemles gehad", { exact: true }).click();
  await page.getByRole("button", { name: "Volgende" }).click();

  const firstDay = page.getByRole("button", { pressed: false }).filter({ hasText: /dag|Maandag|Dinsdag|Woensdag|Donderdag|Vrijdag|Zaterdag|Zondag/i }).first();
  await firstDay.click();
  const firstDaypart = page.getByRole("button", { pressed: false }).filter({ hasText: /Ochtend|Middag|Avond/ }).first();
  await firstDaypart.click();
  await page.getByRole("button", { name: "Volgende" }).click();

  await page.locator("label[data-intake-recommendation]").first().click();
  await page.getByLabel("Aanvulling voor de planning").fill(`sprint4-browser:${marker}`);
  await page.getByLabel(/Ik geef toestemming/).check();
  await page.getByRole("button", { name: "Aanmelding versturen" }).click();

  await expect(page).toHaveURL(/\/intake\?ontvangen=1&referentie=/);
  await expect(page.getByRole("heading", { name: "Aanmelding ontvangen" })).toBeVisible();
}

async function convertIntake(page: Page, participantName: string) {
  const pendingIntake = page.getByRole("row").filter({ hasText: participantName });

  await expect(pendingIntake).toHaveCount(1);
  await pendingIntake.getByRole("button", { name: "Accepteren" }).click();
  await expect(page).toHaveURL(/\/admin\/wachtlijst\?saved=1/);

  return openPlacementDetails(page, participantName);
}

async function createOffer(page: Page, entry: Locator, groupName: string) {
  await entry.locator("select[id^='placement-group-']").selectOption({ label: groupName });
  await entry.getByRole("button", { name: "Controleer en maak aanbod" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Aanbod maken en e-mail versturen" }).click();
  await expect(page).toHaveURL(/\/admin\/wachtlijst\?saved=1&delivery=(sent|skipped)/);
  expect(new URL(page.url()).searchParams.has("aanbod")).toBe(false);
}

async function openPlacementDetails(page: Page, participantName: string) {
  const savedViews = page.getByRole("button", { name: "Opgeslagen weergaven beheren" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visible = await expect(savedViews).toBeVisible({ timeout: 5_000 }).then(() => true).catch(() => false);
    if (visible) break;
    if (attempt === 2) throw new Error("De plaatsingscockpit verscheen niet na drie serverrenders.");
    await page.reload({ waitUntil: "domcontentloaded" });
  }
  await expect(savedViews.locator("svg.animate-spin")).toHaveCount(0);

  const clearFilters = page.getByRole("button", { name: "Wis filters" });
  if (await clearFilters.isVisible()) {
    await clearFilters.click();
  }

  const search = page.getByPlaceholder("Zoek deelnemer…");
  await expect(search).toBeVisible();
  await search.fill(participantName);
  await expect(search).toHaveValue(participantName);

  const row = page.getByRole("row").filter({ hasText: participantName });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Details openen" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: participantName });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: "Plaatsingsmogelijkheden" }).click();
  return dialog;
}

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

function loadJson<T>(environmentName: string) {
  const statePath = process.env[environmentName];
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as T) : null;
}

function requireState() {
  if (!state) throw new Error("Phase 16 state is required for Sprint 4 mutations.");
  return state;
}

function requireEdgeState() {
  if (!edgeState) throw new Error("Sprint 4 edge state is required for mutations.");
  return edgeState;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
