import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const themes = ["nxttrack-default", "dolphin-bay", "turtle-trails", "polar-splash", "coastal-explorer", "nationaal-zwem-abc"];
const routes = [
  "overview",
  "planning",
  "lesson-detail",
  "development",
  "badges",
  "media",
  "diplomas",
  "inbox",
  "payments",
  "documents",
  "feedback",
  "children",
  "profile"
];
const platformOwnerCredentialsConfigured = Boolean(
  process.env.E2E_PLATFORM_OWNER_EMAIL && process.env.E2E_PLATFORM_OWNER_PASSWORD
);
const parentCredentialsConfigured = Boolean(
  process.env.E2E_PARENT_EMAIL && process.env.E2E_PARENT_PASSWORD
);
const visualMatrixRequired = process.env.PORTAL_THEME_VISUAL_MATRIX_REQUIRED === "true";
const requiredViewports = [
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1536", width: 1536, height: 864 },
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "tablet-1180", width: 1180, height: 820 },
  { name: "mobile-360", width: 360, height: 800 },
  { name: "mobile-375", width: 375, height: 812 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-393", width: 393, height: 852 },
  { name: "mobile-430", width: 430, height: 932 }
] as const;

test("platformpreview rendert de volledige 6 × 13 desktop- en mobiele matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "De matrix bevat zelf zowel desktop- als mobiele viewports.");
  test.skip(
    !visualMatrixRequired && !platformOwnerCredentialsConfigured,
    "Set platform-owner E2E credentials or require the matrix from the guarded staging validation."
  );
  await signIn(page);
  await page.goto("/platform/themes");
  await expect(page.getByRole("heading", { name: "Theme Control Center" })).toBeVisible();

  for (const theme of themes) {
    const card = page.locator(`[data-theme-preview="${theme}"]`).last();
    if (!(await card.isVisible())) {
      await page.getByText("Desktop, mobiel en states previewen", { exact: true }).nth(themes.indexOf(theme)).click();
    }
    await expect(card).toBeVisible();

    for (const route of routes) {
      await card.getByLabel("Previewroute").selectOption(route);
      await card.getByLabel("Previewstate").selectOption("data");
      await expect(card.locator(`[data-preview-route="${route}"][data-preview-mode="desktop"]`)).toBeVisible();
      await expect(card.locator(`[data-preview-route="${route}"][data-preview-mode="mobile"]`)).toBeVisible();
      await testInfo.attach(`${theme}-${route}`, {
        body: await card.screenshot({ animations: "disabled" }),
        contentType: "image/png"
      });
    }

    for (const state of ["empty", "locked", "error"]) {
      await card.getByLabel("Previewstate").selectOption(state);
      await expect(card.locator(`[data-preview-state="${state}"]`)).toHaveCount(2);
      await testInfo.attach(`${theme}-core-state-${state}`, {
        body: await card.screenshot({ animations: "disabled" }),
        contentType: "image/png"
      });
    }
  }
});

test("echte ouderportal past in alle verplichte viewports en rendert alle canonieke routes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "De test beheert zelf alle viewports.");
  test.skip(
    !visualMatrixRequired && !parentCredentialsConfigured,
    "Set parent E2E credentials or require the matrix from guarded staging validation."
  );
  await signInParent(page);

  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/portaal", { waitUntil: "networkidle" });
    await assertPortalLayout(page, viewport.width, viewport.height);
    await testInfo.attach(`runtime-${viewport.name}`, {
      body: await page.screenshot({ animations: "disabled", fullPage: false }),
      contentType: "image/png"
    });
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/portaal/planning", { waitUntil: "networkidle" });
  const lessonHref = await page.locator('a[href^="/portaal/lessen/"]').first().getAttribute("href");
  expect(lessonHref, "A staging lesson is required for the canonical lesson-detail visual").toBeTruthy();
  const routePaths = [
    "/portaal",
    "/portaal/planning",
    lessonHref!,
    "/portaal/ontwikkeling",
    "/portaal/ontwikkeling/badges",
    "/portaal/ontwikkeling/media",
    "/portaal/ontwikkeling/diplomas",
    "/portaal/inbox",
    "/portaal/betalingen",
    "/portaal/documenten",
    "/portaal/feedback",
    "/portaal/kinderen",
    "/portaal/profiel"
  ];
  for (const viewport of [{ name: "desktop", width: 1366, height: 768 }, { name: "mobile", width: 390, height: 844 }] as const) {
    await page.setViewportSize(viewport);
    for (const [index, routePath] of routePaths.entries()) {
      await page.goto(routePath, { waitUntil: "networkidle" });
      await expect(page.locator("[data-portal-route-id]")).toHaveAttribute("data-portal-route-id", routes[index]!);
      await expect(page.locator("html")).toHaveJSProperty("scrollLeft", 0);
      await testInfo.attach(`runtime-${viewport.name}-${routes[index]}`, {
        body: await page.screenshot({ animations: "disabled", fullPage: false }),
        contentType: "image/png"
      });
    }
  }
});

async function signIn(page: import("@playwright/test").Page) {
  const email = requiredEnv("E2E_PLATFORM_OWNER_EMAIL");
  const password = requiredEnv("E2E_PLATFORM_OWNER_PASSWORD");
  await page.goto("/login?next=%2Fplatform%2Fthemes", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/platform\/themes/);
}

async function signInParent(page: import("@playwright/test").Page) {
  const email = requiredEnv("E2E_PARENT_EMAIL");
  const password = requiredEnv("E2E_PARENT_PASSWORD");
  await page.goto("/login?next=%2Fportaal", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/portaal/);
}

async function assertPortalLayout(
  page: import("@playwright/test").Page,
  width: number,
  height: number
) {
  const outcome = await page.evaluate(({ width, height }) => {
    const root = document.documentElement;
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element || getComputedStyle(element).display === "none") return null;
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, left: rect.left, right: rect.right, top: rect.top, width: rect.width };
    };
    return {
      cards: box(".dashboard-cards"),
      header: box(".topbar"),
      horizontalOverflow: Math.max(0, root.scrollWidth - width),
      journey: box(".quest-panel"),
      nav: box(".mobile-bottom-nav"),
      sidebar: box(".sidebar"),
      verticalOverflow: Math.max(0, root.scrollHeight - height)
    };
  }, { width, height });
  expect(outcome.horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".quest-panel [aria-current='step']")).toHaveCount(1);
  if (width >= 1280) {
    expect(outcome.sidebar?.width).toBeGreaterThanOrEqual(237);
    expect(outcome.sidebar?.width).toBeLessThanOrEqual(239);
    expect(outcome.header?.height).toBeGreaterThanOrEqual(71);
    expect(outcome.header?.height).toBeLessThanOrEqual(73);
    expect(outcome.verticalOverflow).toBeLessThanOrEqual(1);
    expect(outcome.nav).toBeNull();
  } else if (width >= 1024) {
    expect(outcome.sidebar?.width).toBeGreaterThanOrEqual(85);
    expect(outcome.sidebar?.width).toBeLessThanOrEqual(87);
    expect(outcome.nav).toBeNull();
  } else {
    expect(outcome.sidebar).toBeNull();
    expect(outcome.nav).not.toBeNull();
    expect(await page.locator(".mobile-nav-item").count()).toBe(5);
    expect(outcome.journey?.top ?? 0).toBeGreaterThanOrEqual((outcome.header?.bottom ?? 0) - 1);
    expect(outcome.journey?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual((outcome.nav?.top ?? 0) + 1);
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
