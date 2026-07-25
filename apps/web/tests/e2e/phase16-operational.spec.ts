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
    badgeTitle: string;
    certificateTitle: string;
    declinedParticipantName: string;
    groupId: string;
    groupName: string;
    participantId: string;
    participantName: string;
    paymentReference: string;
    progressLabel: string;
    programName: string;
    sessionId: string;
    stageLabel: string;
  };
  offer: {
    acceptedToken: string;
    declinedToken: string;
  };
};

const state = loadState();

test.describe("phase 16 operational happy path", () => {
  test.skip(!state, "Set PHASE16_STATE_PATH to run the Phase 16 operational smoke.");

  test("tenant admin sees intake, placement, billing and diploma outputs", async ({ page }) => {
    const phase = requireState();
    const failures = collectRuntimeFailures(page);

    await signIn(page, phase.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/intake");
    await expectBodyToContain(page, phase.expected.participantName);

    await page.goto("/admin/wachtlijst", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.participantName);
    await expectBodyToContain(page, phase.expected.declinedParticipantName);

    await page.goto("/admin/betalingen", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.paymentReference);

    await page.goto("/admin/afzwemmen", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.certificateTitle);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-chart]")).toHaveCount(2);
    await expect(page.getByRole("table", { name: "Bezetting per lesgroep" })).toBeAttached();

    await page.goto("/admin/rapportages", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-chart]")).toHaveCount(3);
    await expect(page.getByRole("table", { name: "Betalingen per status" })).toBeAttached();

    await page.goto("/admin/uitnodigingen", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("E-mail")).toBeVisible();
    await expect(page.getByLabel("Rol")).toBeVisible();
    await expect(page.getByRole("button", { name: "Uitnodiging sturen" })).toBeVisible();

    expect(failures()).toEqual([]);
  });

  test("instructor sees roster, attendance, progress note and badge", async ({ page }) => {
    const phase = requireState();
    const failures = collectRuntimeFailures(page);

    await signIn(page, phase.users.instructor.email, requiredEnv("E2E_INSTRUCTOR_PASSWORD"), `/instructor/group/${phase.expected.groupId}?session=${phase.expected.sessionId}`);
    await expectBodyToContain(page, phase.expected.participantName);
    await expectBodyToContain(page, "Aanwezig");

    await page.goto(`/instructor/student/${phase.expected.participantId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tablist", { name: `Dossier van ${phase.expected.participantName}` })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Voortgang" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Badges" }).click();
    await expectBodyToContain(page, phase.expected.badgeTitle);
    await page.getByRole("tab", { name: "Notities" }).click();
    await expectBodyToContain(page, "Phase 16 ouderzichtbare notitie");
    await page.getByRole("tab", { name: "Beoordelen" }).click();
    await expectBodyToContain(page, "Progress modules");

    expect(failures()).toEqual([]);
  });

  test("parent sees child, lessons, progress, payments and diploma vault", async ({ page }) => {
    const phase = requireState();
    const failures = collectRuntimeFailures(page);

    await signIn(page, phase.users.parent.email, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal");
    await expectBodyToContain(page, phase.expected.participantName);
    await expectBodyToContain(page, phase.expected.programName);
    await expectActiveShellLink(page, "Home");

    await page.goto("/portaal/lessen", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.groupName);

    await page.goto("/portaal/voortgang", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.badgeTitle);
    await expectBodyToContain(page, phase.expected.progressLabel);

    await page.goto("/portaal/badges", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.badgeTitle);
    await expectActiveShellLink(page, "Badges");

    await page.goto("/portaal/afzwemmen", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.participantName);
    await expectActiveShellLink(page, "Afzwemmen");

    await page.goto("/portaal/betalingen", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.paymentReference);

    await page.goto("/portaal/diplomas", { waitUntil: "domcontentloaded" });
    await expectBodyToContain(page, phase.expected.certificateTitle);

    expect(failures()).toEqual([]);
  });

  test("legacy slot offer capabilities reveal no offer data", async ({ page }) => {
    requireState();
    const failures = collectRuntimeFailures(page);

    await page.goto("/plaatsing-aanbod?token=legacy-capability-must-be-ignored", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("8-cijferige beveiligingscode")).toBeVisible();
    await expect(page.getByRole("button", { name: "Plek accepteren" })).toHaveCount(0);

    expect(failures()).toEqual([]);
  });
});

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

  const currentUrl = new URL(page.url());

  expect(currentUrl.pathname).not.toBe("/auth/wachtwoord-wijzigen");
  expect(currentUrl.pathname === nextPath.split("?")[0] || currentUrl.pathname.startsWith(`${nextPath.split("?")[0]}/`)).toBeTruthy();
}

async function expectBodyToContain(page: Page, text: string) {
  await expect(page.locator("body")).toContainText(text, { timeout: 10_000 });
}

async function expectActiveShellLink(page: Page, label: string) {
  const mobile = (page.viewportSize()?.width ?? 1280) < 768;

  if (mobile) {
    await page.getByRole("button", { name: "Navigatie openen" }).click();
  }

  await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");

  if (mobile) {
    await page.keyboard.press("Escape");
  }
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !isExpectedBrowserResourceNoise(message.text())) {
      failures.push(`console: ${message.text()}`);
    }
  });

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });

  page.on("response", (response) => {
    if (response.status() >= 500 || (response.status() >= 400 && response.url().includes("/_next/static/"))) {
      failures.push(`response ${response.status()}: ${response.url()}`);
    }
  });

  return () => failures;
}

function isExpectedBrowserResourceNoise(message: string) {
  return message.includes("favicon");
}

function loadState() {
  const statePath = process.env.PHASE16_STATE_PATH;

  if (!statePath) {
    if (process.env.PHASE16_REQUIRE_PLAYWRIGHT === "true") {
      throw new Error("PHASE16_STATE_PATH is required.");
    }

    return null;
  }

  const resolvedPath = path.resolve(process.cwd(), statePath);

  if (!existsSync(resolvedPath)) {
    if (process.env.PHASE16_REQUIRE_PLAYWRIGHT === "true") {
      throw new Error(`Phase 16 state file does not exist: ${resolvedPath}`);
    }

    return null;
  }

  return JSON.parse(readFileSync(resolvedPath, "utf8")) as Phase16State;
}

function requireState() {
  if (!state) {
    throw new Error("Phase 16 state is required.");
  }

  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
