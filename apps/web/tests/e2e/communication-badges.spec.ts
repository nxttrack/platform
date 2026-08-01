import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  users: {
    tenantAdmin: { email: string };
    instructor: { email: string };
    parent: { email: string };
  };
  expected: {
    participantId: string;
    participantName: string;
  };
};

const state = loadState();
const enabled = process.env.BADGE_COMMUNICATION_BROWSER_ENABLED === "true";

test.describe("Communicationhub and Badge Studio", () => {
  test.skip(!enabled, "Enable the controlled staging browser validation.");
  test.beforeAll(() => {
    expect(state, "PHASE16_STATE_PATH must contain the staging fixture.").not.toBeNull();
  });

  test("platform owner sees catalog, collections, themes, editor and analytics", async ({ page }) => {
    test.setTimeout(90_000);
    const failures = collectRuntimeFailures(page);
    await signIn(page, requiredEnv("E2E_PLATFORM_OWNER_EMAIL"), requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"), "/platform/badges");

    await expect(page.getByRole("heading", { level: 1, name: "Badge Studio" })).toBeVisible();
    await expect(page.getByText("Badgecanon", { exact: true })).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "first_lesson_attended" })).toHaveCount(1);
    await assertNoCriticalAccessibilityIssues(page);

    for (const route of [
      ["/platform/badges/collections", "Canonieke collecties"],
      ["/platform/badges/themes", "Badge-thema’s"],
      ["/platform/badges/share-templates", "Canva-achtige share editor"],
      ["/platform/badges/analytics", "Platformanalytics"]
    ] as const) {
      await page.goto(route[0], { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: route[1] })).toBeVisible();
      if (route[0] === "/platform/badges/share-templates") {
        await expect(page.getByText("sleep, resize of roteer de selectie", { exact: false })).toBeVisible();
        await expect(page.getByText("Template-afbeeldingen", { exact: true })).toBeVisible();
        await expect(page.getByLabel("Afbeelding kiezen")).toBeVisible();
        const editor = page.getByTestId("badge-studio-editor");
        await expect(editor).toBeVisible();
        await expect(page.getByRole("button", { name: "Ongedaan maken" })).toBeDisabled();
        await editor.locator("aside").first().locator('button[draggable="true"]').first().click();
        const xPosition = page.getByLabel("X", { exact: true });
        const initialX = await xPosition.inputValue();
        await xPosition.fill(String(Number(initialX) + 1));
        await expect(editor).toHaveAttribute("data-dirty", "true");
        await page.getByRole("button", { name: "Ongedaan maken" }).click();
        await expect(xPosition).toHaveValue(initialX);
        await page.getByRole("button", { name: "Opnieuw uitvoeren" }).click();
        await expect(xPosition).toHaveValue(String(Number(initialX) + 1));
        await page.getByRole("button", { name: "Herstel" }).click();
        await expect(editor).toHaveAttribute("data-dirty", "false");
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2)).toBe(true);
      }
    }

    await page.goto("/platform/uitnodigingen", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "NXTTRACK-team" })).toHaveAttribute("data-state", "active");
    await expect(page.getByLabel("Toegangsniveau")).toBeVisible();
    await expect(page.getByLabel("Organisatie slug")).toHaveCount(0);
    await page.getByRole("tab", { name: "Zwemschool" }).click();
    await expect(page.getByLabel("Organisatie")).toBeVisible();
    await expect(page.getByLabel("Rol binnen de zwemschool")).toBeVisible();
    expect(failures()).toEqual([]);
  });

  test("tenant admin sees badge governance and every Communicationhub surface", async ({ page }) => {
    test.setTimeout(90_000);
    const phase = requireState();
    const failures = collectRuntimeFailures(page);
    await signIn(page, phase.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/badges");

    await expect(page.getByRole("heading", { level: 1, name: "Badges & complimenten" })).toBeVisible();
    await expect(page.getByText(/Canon voor/)).toBeVisible();
    await page.goto("/admin/badges/instellingen", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Module-instellingen" })).toBeVisible();
    await expect(page.getByText("Adminreview verplicht", { exact: true })).toBeVisible();
    await assertNoCriticalAccessibilityIssues(page);

    for (const route of [
      ["/admin/berichten", "Berichten"],
      ["/admin/notificaties", "Notificaties"],
      ["/admin/nieuwsbrieven", "Nieuwsbrieven"],
      ["/admin/templates", "Templates"],
      ["/admin/communicatie-instellingen", "Instellingen"],
      ["/admin/website", "Website studio"],
      ["/admin/inhaalmarkt", "Inhaalmarkt"]
    ] as const) {
      await page.goto(route[0], { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(route[1]);
    }
    expect(failures()).toEqual([]);
  });

  test("instructor gets filtered suggestions and an explicit human confirmation", async ({ page }) => {
    const phase = requireState();
    const failures = collectRuntimeFailures(page);
    await signIn(page, phase.users.instructor.email, requiredEnv("E2E_INSTRUCTOR_PASSWORD"), `/instructor/student/${phase.expected.participantId}?tab=badges`);

    await expect(page.getByRole("heading", { level: 1, name: phase.expected.participantName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Positief moment vastleggen" })).toBeVisible();
    await expect(page.getByLabel("Complimentbadge")).toBeVisible();
    await expect(page.getByText("Drie positieve suggesties", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Ik bevestig dit positieve moment/ })).not.toBeChecked();
    expect(failures()).toEqual([]);
  });

  test("parent sees badge wall, consent controls and the communication inbox", async ({ page }) => {
    const phase = requireState();
    const failures = collectRuntimeFailures(page);
    await signIn(page, phase.users.parent.email, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/ontwikkeling/badges");

    await expect(page.getByRole("heading", { level: 1, name: "Badges" })).toBeVisible();
    await expect(page.getByText(phase.expected.participantName, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mijn badgevoorkeuren" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Badge-e-mails" })).toBeVisible();
    await assertNoCriticalAccessibilityIssues(page);

    await page.goto("/portaal/berichten", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Berichten");
    expect(failures()).toEqual([]);
  });
});

async function assertNoCriticalAccessibilityIssues(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const critical = result.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(critical, critical.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

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

function loadState(): Phase16State | null {
  const statePath = process.env.PHASE16_STATE_PATH;
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? JSON.parse(readFileSync(resolved, "utf8")) as Phase16State : null;
}

function requireState() {
  if (!state) throw new Error("Phase 16 state is required.");
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
