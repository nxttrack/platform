import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  users: { instructor: { email: string } };
  expected: {
    groupId: string;
    participantId: string;
    participantName: string;
    sessionId: string;
  };
};

const state = loadState();
const enabled = process.env.SPRINT4_INSTRUCTOR_MUTATIONS_ENABLED === "true";

test.describe("Sprint 4 instructor mutations", () => {
  test.skip(!enabled, "Enable instructor mutations to run this staging-only journey.");
  test.beforeAll(() => {
    expect(state, "PHASE16_STATE_PATH must resolve to a readable state file when instructor mutations are enabled.").not.toBeNull();
  });

  test("instructor records attendance, progress, note, badge and session completion", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const phase = requireState();
    const failures = collectRuntimeFailures(page);
    const marker = `sprint4-instructor:${process.env.GITHUB_RUN_ID ?? Date.now()}-${testInfo.retry}`;
    const groupPath = `/instructor/group/${phase.expected.groupId}?session=${phase.expected.sessionId}`;

    await signIn(page, phase.users.instructor.email, requiredEnv("E2E_INSTRUCTOR_PASSWORD"), groupPath);
    let rosterEntry = page.locator("article").filter({ hasText: phase.expected.participantName });
    await expect(rosterEntry).toHaveCount(1);
    await rosterEntry.getByRole("button", { name: "Laat", exact: true }).click();
    await expect(page.getByText("Attendance opgeslagen.")).toBeVisible();
    rosterEntry = page.locator("article").filter({ hasText: phase.expected.participantName });
    await expect(rosterEntry.locator("span").filter({ hasText: /^Laat$/ })).toBeVisible();

    await page.goto(`/instructor/student/${phase.expected.participantId}?tab=assessment`, { waitUntil: "domcontentloaded" });
    let assessment = page.locator("form").filter({ hasText: "Zelfstandig drijven" });
    await expect(assessment).toHaveCount(1);
    await assessment.getByLabel("Score").selectOption("5");
    await assessment.getByLabel("Zichtbaarheid").selectOption("internal");
    await assessment.getByLabel("Korte update").fill(`${marker}: score zelfstandig bevestigd.`);
    await assessment.getByRole("button", { name: "Score opslaan" }).click();
    await expect(page.getByText("Progress score opgeslagen.")).toBeVisible();
    assessment = page.locator("form").filter({ hasText: "Zelfstandig drijven" });
    await expect(assessment.getByText("Ik kan het zelfstandig", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: "Notities" }).click();
    await page.getByLabel("Notitie", { exact: true }).fill(`${marker}: interne lesnotitie.`);
    await page.getByLabel("Zichtbaarheid").selectOption("internal");
    await page.getByRole("button", { name: "Notitie opslaan" }).click();
    await expect(page.getByText("Note opgeslagen.")).toBeVisible();
    await expect(page.getByText(`${marker}: interne lesnotitie.`)).toBeVisible();

    await page.getByRole("tab", { name: "Badges" }).click();
    await page.getByLabel("Badgetitel").fill(`Sprint4 Browserbadge ${marker}`);
    await page.getByLabel("Badgenotitie").fill(`${marker}: intern bewijs.`);
    await page.getByLabel("Zichtbaarheid").selectOption("internal");
    await page.getByRole("button", { name: "Badge toekennen" }).click();
    await expect(page.getByText("Badge toegekend.")).toBeVisible();
    await expect(page.getByText(`Sprint4 Browserbadge ${marker}`)).toBeVisible();

    await page.goto(groupPath, { waitUntil: "domcontentloaded" });
    const completeButton = page.getByRole("button", { name: "Afronden", exact: true });
    const completedStatus = page.getByText("completed", { exact: true });

    await expect(completeButton.or(completedStatus)).toBeVisible();

    if (await completeButton.isVisible()) {
      await completeButton.click();
      await expect(page.getByText("Les afgerond.")).toBeVisible();
    }

    await expect(completedStatus).toBeVisible();
    expect(failures()).toEqual([]);
  });
});

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${nextPath.split("?")[0].replaceAll("/", "\\/")}(?:\\?|$)`));
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
  if (!state) throw new Error("Phase 16 state is required for Sprint 4 instructor mutations.");
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
