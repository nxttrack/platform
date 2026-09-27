import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { adminNav } from "@/lib/navigation";

type Phase16State = {
  users: {
    tenantAdmin: { email: string };
  };
};

const phase = loadJson<Phase16State>(process.env.PHASE16_STATE_PATH);
const enabled = process.env.TENANT_BACKOFFICE_HEALTH_ENABLED === "true";
const supplementaryRoutes = [
  { href: "/admin/signalen", label: "Alle signalen" },
  { href: "/admin/badges/analytics", label: "Badge-analytics" },
  { href: "/admin/badges/collecties", label: "Badgecollecties" },
  { href: "/admin/badges/eigen", label: "Eigen badges" },
  { href: "/admin/badges/instellingen", label: "Badge-instellingen" }
] as const;
const routes = [...adminNav.map(({ href, label }) => ({ href, label })), ...supplementaryRoutes];

test.describe("tenant backoffice route health", () => {
  test.skip(!enabled, "Enable the tenant backoffice health contract for staging validation.");
  test.beforeAll(() => {
    expect(phase, "PHASE16_STATE_PATH must resolve to a readable state file.").not.toBeNull();
    expect(new Set(routes.map((route) => route.href)).size).toBe(routes.length);
  });

  for (const viewport of [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 }
  ] as const) {
    test(`all static routes stay healthy on ${viewport.label}`, async ({ page }, testInfo) => {
      test.setTimeout(6 * 60_000);
      const state = requireState(phase);
      await page.setViewportSize(viewport);
      await signIn(page, state.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"));

      const outcomes: Array<Record<string, unknown>> = [];

      try {
        for (const route of routes) {
          const runtimeErrors: string[] = [];
          const onPageError = (error: Error) => runtimeErrors.push(error.message);
          page.on("pageerror", onPageError);

          try {
            const response = await page.goto(route.href, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(100);
            const status = response?.status() ?? 0;
            const pathname = new URL(page.url()).pathname;
            const layout = await page.evaluate(() => {
              const offenders = Array.from(document.querySelectorAll<HTMLElement>("body *"))
                .map((element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    className: typeof element.className === "string" ? element.className.slice(0, 180) : "",
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    tag: element.tagName.toLowerCase(),
                    text: (element.textContent ?? "").replaceAll(/\s+/g, " ").trim().slice(0, 100)
                  };
                })
                .filter((element) => element.left < -1 || element.right > window.innerWidth + 1)
                .slice(0, 12);

              return {
                documentWidth: document.documentElement.scrollWidth,
                headingCount: document.querySelectorAll("h1").length,
                offenders,
                viewportWidth: window.innerWidth
              };
            });

            outcomes.push({ href: route.href, label: route.label, layout, pathname, runtimeErrors, status });
            expect(status, `${route.href} HTTP status`).toBeGreaterThanOrEqual(200);
            expect(status, `${route.href} HTTP status`).toBeLessThan(400);
            expect(pathname, `${route.href} must not redirect away`).toBe(route.href);
            await expect(page.getByRole("heading", { level: 1 }).first(), `${route.href} needs a visible H1`).toBeVisible();
            expect(layout.headingCount, `${route.href} must expose exactly one H1`).toBe(1);
            expect(layout.documentWidth, `${route.href} must not overflow horizontally; offenders=${JSON.stringify(layout.offenders)}`).toBeLessThanOrEqual(layout.viewportWidth + 1);
            expect(runtimeErrors, `${route.href} must not emit page errors`).toEqual([]);

            if (viewport.label === "desktop") {
              const sidebar = page.locator("aside").first();
              await expect(sidebar).toBeVisible();
              const box = await sidebar.boundingBox();
              expect(Math.round(box?.y ?? -1), `${route.href} sidebar must start at viewport top`).toBe(0);
              expect(Math.round(box?.height ?? 0), `${route.href} sidebar must fill the viewport`).toBe(viewport.height);
            } else {
              await expect(page.getByRole("button", { name: "Navigatie openen" })).toBeVisible();
            }
          } finally {
            page.off("pageerror", onPageError);
          }
        }
      } finally {
        await attachJson(testInfo, `tenant-backoffice-${viewport.label}`, outcomes);
      }
    });
  }
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login?next=%2Fadmin", { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /^inloggen$/i }).click();
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Welkom terug." })).toBeVisible();
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  await testInfo.attach(name, { body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`), contentType: "application/json" });
}

function loadJson<T>(statePath?: string) {
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as T) : null;
}

function requireState<T>(state: T | null): T {
  if (!state) throw new Error("Phase 16 state is required.");
  return state;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
