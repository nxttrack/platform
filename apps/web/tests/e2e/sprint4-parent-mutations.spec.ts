import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = { users: { parent: { email: string } } };
type ParentState = {
  profileName: string;
  profilePhone: string;
  sourceSessionId: string;
  targetGroupName: string;
  notificationTitle: string;
  graduationTitle: string;
  catchUpOutcome: "requested" | "approved";
};

const phase = loadJson<Phase16State>(process.env.PHASE16_STATE_PATH);
const parent = loadJson<ParentState>(process.env.SPRINT4_PARENT_STATE_PATH);
const enabled = process.env.SPRINT4_PARENT_MUTATIONS_ENABLED === "true";

test.describe("Sprint 4 parent self-service mutations", () => {
  test.skip(!enabled, "Enable parent mutations to run this staging-only journey.");
  test.beforeAll(() => {
    expect(phase, "PHASE16_STATE_PATH must resolve to a readable state file when parent mutations are enabled.").not.toBeNull();
    expect(parent, "SPRINT4_PARENT_STATE_PATH must resolve to a readable state file when parent mutations are enabled.").not.toBeNull();
  });

  test("parent updates profile, cancels, requests catch-up, reads a notification and confirms graduation", async ({ page }) => {
    test.setTimeout(75_000);
    const phaseState = requireState(phase, "Phase 16");
    const parentState = requireState(parent, "Sprint 4 parent");
    const failures = collectRuntimeFailures(page);

    await signIn(page, phaseState.users.parent.email, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/profiel");
    await page.getByLabel("Naam").fill(parentState.profileName);
    await page.getByLabel("Telefoon").fill(parentState.profilePhone);
    await page.getByRole("button", { name: "Profiel opslaan" }).click();
    await expect(page.getByText("Profiel opgeslagen.")).toBeVisible();
    await expect(page.getByLabel("Naam")).toHaveValue(parentState.profileName);
    await expect(page.getByLabel("Telefoon")).toHaveValue(parentState.profilePhone);

    await page.goto(`/portaal/lessen/${parentState.sourceSessionId}`, { waitUntil: "domcontentloaded" });
    const cancelButton = page.getByRole("button", { name: "Annuleer met credit" });
    const cancellationStatus = page.getByText("on_time", { exact: true });

    await expect(cancelButton.or(cancellationStatus)).toBeVisible();

    if (await cancelButton.isVisible()) {
      await page.getByLabel("Reden").fill("Sprint 4 browserjourney");
      const cancellationDialog = page.getByRole("alertdialog");
      await expect(async () => {
        await cancelButton.click();
        await expect(cancellationDialog).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 10_000 });
      await cancellationDialog.getByRole("button", { name: /definitief annuleren$/ }).click();
      await expect(page.getByText(/geannuleerd en credit toegevoegd\.$/)).toBeVisible();
    }

    await expect(cancellationStatus).toBeVisible();
    await page.goto("/portaal/lessen", { waitUntil: "domcontentloaded" });
    const chooseCatchUpButton = page.getByRole("button", { name: `Kiezen ${parentState.targetGroupName}`, exact: true });
    const catchUpStatus = page.getByText(`Aanvraag ingediend. Status: ${parentState.catchUpOutcome}.`);

    await expect(chooseCatchUpButton.or(catchUpStatus)).toBeVisible();

    if (await chooseCatchUpButton.isVisible()) {
      await chooseCatchUpButton.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Inhaalmoment bevestigen" }).click();
      const feedback = parentState.catchUpOutcome === "requested" ? "Inhaalles aangevraagd. De administratie beoordeelt de aanvraag." : "Inhaalles ingepland.";
      await expect(page.getByText(feedback)).toBeVisible();
    }

    await expect(catchUpStatus).toBeVisible();

    await page.goto("/portaal/berichten", { waitUntil: "domcontentloaded" });
    let notification = page.locator("article").filter({ hasText: parentState.notificationTitle });
    await expect(notification).toHaveCount(1);
    const readButton = notification.getByRole("button", { name: "Gelezen" });

    if ((await readButton.count()) === 1) {
      await readButton.click();
      await expect(page.getByText("Melding gemarkeerd als gelezen.")).toBeVisible();
      notification = page.locator("article").filter({ hasText: parentState.notificationTitle });
    }

    await expect(notification.getByRole("button", { name: "Gelezen" })).toHaveCount(0);

    await page.goto("/portaal/planning#afzwemmen", { waitUntil: "domcontentloaded" });
    let graduation = page.locator("article").filter({ hasText: parentState.graduationTitle });
    await expect(graduation).toHaveCount(1);
    const confirmButton = graduation.getByRole("button", { name: "Bevestigen" });
    const confirmedStatus = graduation.getByText("Bevestigd", { exact: true });

    await expect(confirmButton.or(confirmedStatus)).toBeVisible();

    if (await confirmButton.isVisible()) {
      await confirmButton.click();
      await expect(page.getByText("Afzwemuitnodiging bevestigd.")).toBeVisible();
      graduation = page.locator("article").filter({ hasText: parentState.graduationTitle });
    }

    await expect(graduation.getByText("Bevestigd", { exact: true })).toBeVisible();
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
    if (response.status() >= 500 || (response.status() >= 400 && response.url().includes("/_next/static/"))) failures.push(`response ${response.status()}: ${response.url()}`);
  });
  return () => failures;
}

function loadJson<T>(statePath?: string) {
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as T) : null;
}

function requireState<T>(state: T | null, label: string): T {
  if (!state) throw new Error(`${label} state is required.`);
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
