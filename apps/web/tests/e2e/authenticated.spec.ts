import { expect, test, type Page } from "@playwright/test";

type AuthCase = {
  label: string;
  password?: string;
  path: `/${string}`;
  username?: string;
};

const authCases: AuthCase[] = [
  {
    label: "platform owner",
    path: "/platform",
    username: process.env.E2E_PLATFORM_OWNER_EMAIL,
    password: process.env.E2E_PLATFORM_OWNER_PASSWORD
  },
  {
    label: "organization admin",
    path: "/admin",
    username: process.env.E2E_TENANT_ADMIN_EMAIL,
    password: process.env.E2E_TENANT_ADMIN_PASSWORD
  },
  {
    label: "instructor",
    path: "/instructor",
    username: process.env.E2E_INSTRUCTOR_EMAIL,
    password: process.env.E2E_INSTRUCTOR_PASSWORD
  },
  {
    label: "parent",
    path: "/portaal",
    username: process.env.E2E_PARENT_EMAIL,
    password: process.env.E2E_PARENT_PASSWORD
  }
];

const configuredCases = authCases.filter((authCase) => authCase.username && authCase.password);
const requireAuthenticatedWorkflows = process.env.E2E_REQUIRE_AUTHENTICATED_WORKFLOWS === "true";

test.describe("authenticated role workflows", () => {
  test.beforeAll(() => {
    if (!requireAuthenticatedWorkflows) {
      return;
    }

    const missingCases = authCases.filter((authCase) => !authCase.username || !authCase.password).map((authCase) => authCase.label);

    expect(missingCases, `Missing E2E credentials for: ${missingCases.join(", ")}`).toEqual([]);
  });

  test.skip(configuredCases.length === 0, "Set E2E_* credentials to run authenticated staging workflows.");

  for (const authCase of authCases) {
    test(`${authCase.label} can sign in and reach ${authCase.path}`, async ({ page }) => {
      test.skip(!authCase.username || !authCase.password, `Missing credentials for ${authCase.label}.`);

      const failures = collectRuntimeFailures(page);

      await page.goto(`/login?next=${encodeURIComponent(authCase.path)}`, { waitUntil: "domcontentloaded" });
      await page.locator("input[name='email']").fill(authCase.username ?? "");
      await page.locator("input[name='password']").fill(authCase.password ?? "");
      await page.getByRole("button", { name: /inloggen/i }).click();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);

      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toContainText("E-mail of wachtwoord klopt niet.");

      const currentUrl = new URL(page.url());

      if (currentUrl.pathname === "/auth/wachtwoord-wijzigen") {
        expect(process.env.E2E_ALLOW_FORCE_PASSWORD_CHANGE).toBe("true");
        return;
      }

      expect(currentUrl.pathname === authCase.path || currentUrl.pathname.startsWith(`${authCase.path}/`)).toBeTruthy();

      if (authCase.label === "parent") {
        await page.goto("/portaal/media", { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Media-tijdlijn" })).toBeVisible();
      }

      expect(failures()).toEqual([]);
    });
  }
});

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
