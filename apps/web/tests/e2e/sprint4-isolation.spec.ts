import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  tenant: { hostname: string };
  users: {
    tenantAdmin: { email: string };
    instructor: { email: string };
    parent: { email: string };
  };
  expected: {
    participantName: string;
    programName: string;
  };
};

type IsolationState = {
  tenantName: string;
  tenantUrl: string;
  programName: string;
};

const phase = loadState<Phase16State>("PHASE16_STATE_PATH");
const isolation = loadState<IsolationState>("SPRINT4_ISOLATION_STATE_PATH");
const enabled = process.env.SPRINT4_ISOLATION_ENABLED === "true";

test.describe("Sprint 4 role and tenant isolation", () => {
  test.skip(!enabled || !phase || !isolation, "Enable isolation checks with Phase 16 and isolation state files.");

  test("parent cannot enter instructor or tenant-admin shells", async ({ page }) => {
    const state = requirePhase();
    const failures = collectRuntimeFailures(page);

    await signIn(page, state.users.parent.email, requiredEnv("E2E_PARENT_PASSWORD"), "/admin");
    await expectPath(page, "/portaal");
    await expect(page.locator("body")).toContainText(state.expected.participantName);

    await page.goto("/instructor", { waitUntil: "domcontentloaded" });
    await expectPath(page, "/portaal");
    await expect(page.locator("body")).not.toContainText("Platform Admin");
    expect(failures()).toEqual([]);
  });

  test("instructor cannot enter parent or tenant-admin shells", async ({ page }) => {
    const state = requirePhase();
    const failures = collectRuntimeFailures(page);

    await signIn(page, state.users.instructor.email, requiredEnv("E2E_INSTRUCTOR_PASSWORD"), "/admin");
    await expectPath(page, "/instructor");

    await page.goto("/portaal", { waitUntil: "domcontentloaded" });
    await expectPath(page, "/instructor");
    await expect(page.locator("body")).not.toContainText("Backoffice");
    expect(failures()).toEqual([]);
  });

  test("tenant admin cannot enter platform or parent shells", async ({ page }) => {
    const state = requirePhase();
    const failures = collectRuntimeFailures(page);

    await signIn(page, state.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/platform");
    await expectPath(page, "/login");
    await expect(page.getByText("Je account heeft geen toegang tot deze omgeving.")).toBeVisible();
    expect(new URL(page.url()).searchParams.get("error")).toBe("forbidden");

    await page.goto("/portaal", { waitUntil: "domcontentloaded" });
    await expectPath(page, "/admin");
    await expect(page.locator("body")).not.toContainText("Platform Admin");
    expect(failures()).toEqual([]);
  });

  test("tenant admin is denied on another tenant and sees no cross-tenant program", async ({ page }) => {
    test.setTimeout(60_000);
    const state = requirePhase();
    const boundary = requireIsolation();
    const failures = collectRuntimeFailures(page);

    await page.goto(`${boundary.tenantUrl}/programmas`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(boundary.tenantName);
    await expect(page.locator("body")).toContainText(boundary.programName);

    await signInAt(page, boundary.tenantUrl, state.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/programma");
    await expectPath(page, "/login");
    await expect(page.getByText("Je account heeft geen toegang tot deze omgeving.")).toBeVisible();
    expect(new URL(page.url()).origin).toBe(boundary.tenantUrl);
    expect(new URL(page.url()).searchParams.get("error")).toBe("forbidden");

    await signIn(page, state.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/programma");
    await expectPath(page, "/admin/programma");
    await expect(page.locator("body")).toContainText(state.expected.programName);
    await expect(page.locator("body")).not.toContainText(boundary.programName);
    expect(failures()).toEqual([]);
  });
});

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await signInAt(page, requiredEnv("PLAYWRIGHT_BASE_URL"), email, password, nextPath);
}

async function signInAt(page: Page, origin: string, email: string, password: string, nextPath: string) {
  const loginUrl = new URL(`/login?next=${encodeURIComponent(nextPath)}`, origin);

  await page.goto(loginUrl.toString(), { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
}

async function expectPath(page: Page, expected: string) {
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 10_000 }).toBe(expected);
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

function loadState<State>(envName: string): State | null {
  const statePath = process.env[envName];

  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as State) : null;
}

function requirePhase() {
  if (!phase) throw new Error("Phase 16 state is required for Sprint 4 isolation checks.");
  return phase;
}

function requireIsolation() {
  if (!isolation) throw new Error("Isolation state is required for Sprint 4 isolation checks.");
  return isolation;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
