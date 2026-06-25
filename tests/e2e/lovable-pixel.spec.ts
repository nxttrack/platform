import { expect, type Page, test } from "@playwright/test";

type VisualRoute = {
  id: string;
  path: string;
  title: RegExp;
  role?: "admin" | "parent" | "instructor";
};

const publicRoutes: VisualRoute[] = [
  { id: "nxttrack-marketing", path: "/nxttrack", title: /NXTTRACK|moderne zwemscholen/i },
  { id: "tenant-homepage", path: "/", title: /zwemschool|Zwemles|Tenantwebsite/i },
  { id: "tenant-programmas", path: "/programmas", title: /Programma|Zwemdiploma|lesprogramma/i },
  { id: "tenant-intake", path: "/intake", title: /Intake|Geen intake beschikbaar|Tenantwebsite/i },
  { id: "tenant-login", path: "/login", title: /Log in|Welkom terug|NXTTRACK toegang/i }
];

const privateRoutes: VisualRoute[] = [
  { id: "admin-dashboard", path: "/admin", title: /Dashboard|Backoffice|Log in|Geen toegang/i, role: "admin" },
  { id: "parent-portal", path: "/parent", title: /Ouderportaal|Mijn lessen|Log in|Geen toegang/i, role: "parent" },
  { id: "instructor-portal", path: "/instructor", title: /Instructeur|Vandaag|Agenda|Log in|Geen toegang/i, role: "instructor" }
];

test.describe("Lovable Pixel QA", () => {
  for (const route of [...publicRoutes, ...privateRoutes]) {
    test(`${route.id} matches approved desktop/mobile baseline`, async ({ page }, testInfo) => {
      if (route.role) {
        const hasFixture = await maybeLogin(page, route.role, route.path);

        if (!hasFixture) {
          const message = `Set E2E_${route.role.toUpperCase()}_EMAIL/PASSWORD to capture ${route.id}.`;

          if (process.env.VISUAL_REQUIRE_AUTH === "true") {
            throw new Error(message);
          }

          testInfo.annotations.push({ type: "fixture", description: message });
          test.skip(true, message);
        }
      }

      await gotoStable(page, route.path, route.title);
      await expect(page).toHaveScreenshot(`${route.id}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.012,
        threshold: 0.18
      });
    });
  }
});

async function maybeLogin(page: Page, role: "admin" | "parent" | "instructor", nextPath: string) {
  const email = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
  const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];

  if (!email || !password) {
    return false;
  }

  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([page.waitForLoadState("networkidle").catch(() => undefined), page.getByRole("button", { name: /inloggen/i }).click()]);

  return true;
}

async function gotoStable(page: Page, path: string, title: RegExp) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });

  expect(response?.status() ?? 0, `${path} should respond`).toBeGreaterThanOrEqual(200);
  expect(response?.status() ?? 0, `${path} must not 5xx`).toBeLessThan(500);

  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }
      html {
        scroll-behavior: auto !important;
      }
      video, iframe {
        visibility: hidden !important;
      }
    `
  });
  await expect(page.locator("body")).toContainText(title);
}
