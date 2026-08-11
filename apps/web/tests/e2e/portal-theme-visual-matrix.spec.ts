import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";

import {
  CHILD_VISUAL_STATES,
  PARENT_VISUAL_ROUTES,
  PORTAL_CANONICAL_VIEWPORTS,
  PORTAL_HIGH_RESOLUTION_VIEWPORTS,
  PORTAL_REQUIRED_VIEWPORTS,
  PORTAL_VISUAL_MATRIX_CONTRACT,
  PORTAL_VISUAL_THEMES
} from "@/lib/theme/portal-visual-matrix";

test.describe.configure({ timeout: 5_400_000 });

const themes = PORTAL_VISUAL_THEMES;
const routes = PARENT_VISUAL_ROUTES;
const platformOwnerCredentialsConfigured = Boolean(
  process.env.E2E_PLATFORM_OWNER_EMAIL && process.env.E2E_PLATFORM_OWNER_PASSWORD
);
const parentCredentialsConfigured = Boolean(
  process.env.E2E_PARENT_EMAIL && process.env.E2E_PARENT_PASSWORD
);
const tenantAdminCredentialsConfigured = Boolean(
  process.env.E2E_TENANT_ADMIN_EMAIL && process.env.E2E_TENANT_ADMIN_PASSWORD
);
const certificateConfigured = Boolean(process.env.E2E_CERTIFICATE_CODE);
const visualMatrixRequired = process.env.PORTAL_THEME_VISUAL_MATRIX_REQUIRED === "true";
const requiredViewports = PORTAL_REQUIRED_VIEWPORTS;
const canonicalViewports = PORTAL_CANONICAL_VIEWPORTS;
const highResolutionViewports = PORTAL_HIGH_RESOLUTION_VIEWPORTS;
type EvidenceEntry = { kind: string; name: string; theme: string; viewport: string };
type ThemeMatrixResult = {
  canonicalRenders: number;
  dashboardViewportCases: number;
  evidence: EvidenceEntry[];
};

test("platformpreview rendert de volledige 7 × 13 desktop- en mobiele matrix", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "De matrix bevat zelf zowel desktop- als mobiele viewports.");
  test.skip(
    !visualMatrixRequired && !platformOwnerCredentialsConfigured,
    "Set platform-owner E2E credentials or require the matrix from the guarded staging validation."
  );
  await signIn(page);
  await page.goto("/platform/themes");
  await expect(page.getByRole("heading", { name: "Theme Control Center" })).toBeVisible();

  for (const theme of themes) {
    const card = page.locator(`[data-theme-preview="${theme}"]`);
    const details = page.locator("details").filter({ has: card });
    await expect(details, `${theme} moet precies één uitgebreide platformpreview hebben`).toHaveCount(1);
    if (!(await card.isVisible())) {
      await details.getByText("Desktop, mobiel en states previewen", { exact: true }).click();
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

test("322 canonieke renders en 196 dashboard-viewportcases zijn werkelijk routegebonden", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-desktop", "De matrix beheert alle viewports in één deterministische run.");
  const credentialsReady = parentCredentialsConfigured && tenantAdminCredentialsConfigured && certificateConfigured;
  test.skip(!visualMatrixRequired && !credentialsReady, "De volledige matrix vereist tenant-admin-, ouder- en certificaatfixtures.");
  expect(credentialsReady, "Een verplichte matrix mag nooit stil overslaan door ontbrekende fixtures.").toBeTruthy();

  const baseURL = String(testInfo.project.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100");
  const adminContext = await browser.newContext({ baseURL });
  const adminPage = await adminContext.newPage();
  await signInTenantAdmin(adminPage);
  await configureChildPortalPilot(adminPage);

  let canonicalRenders = 0;
  let dashboardViewportCases = 0;
  const evidence: EvidenceEntry[] = [];

  for (const theme of themes) {
    await selectTheme(adminPage, theme);
    const themeResults = await Promise.all([
      capturePublicVerification(browser, baseURL, theme, testInfo),
      captureParentCanonical(browser, baseURL, theme, testInfo),
      captureParentDashboards(browser, baseURL, theme, testInfo),
      captureChildCanonical(browser, baseURL, theme, testInfo),
      captureChildDashboardsAndStates(browser, baseURL, theme, testInfo)
    ]);
    themeResults.push(await captureThemeAccessibility(browser, baseURL, theme));
    themeResults.push(await captureChildParentReauth(browser, baseURL, theme, testInfo));
    for (const result of themeResults) {
      canonicalRenders += result.canonicalRenders;
      dashboardViewportCases += result.dashboardViewportCases;
      evidence.push(...result.evidence);
    }
  }

  await adminContext.close();
  expect(canonicalRenders).toBe(PORTAL_VISUAL_MATRIX_CONTRACT.canonicalRenders);
  expect(dashboardViewportCases).toBe(PORTAL_VISUAL_MATRIX_CONTRACT.dashboardViewportCases);
  await testInfo.attach("parent-child-visual-matrix-manifest", {
    body: Buffer.from(JSON.stringify({ canonicalRenders, dashboardViewportCases, evidence }, null, 2)),
    contentType: "application/json"
  });
});

async function capturePublicVerification(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const evidence: EvidenceEntry[] = [];
  for (const viewport of canonicalViewports) {
    await page.setViewportSize(viewport);
    await gotoStable(page, `/diploma-verificatie/${encodeURIComponent(requiredEnv("E2E_CERTIFICATE_CODE"))}`);
    await assertNoHorizontalOverflow(page);
    await attachViewport(testInfo, page, `${theme}-public-verification-${viewport.name}`);
    evidence.push({ kind: "canonical", name: "public-verification", theme, viewport: viewport.name });
  }
  await context.close();
  return { canonicalRenders: evidence.length, dashboardViewportCases: 0, evidence };
}

async function captureParentCanonical(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const evidence: EvidenceEntry[] = [];
  await signInParent(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoStable(page, "/portaal/planning");
  const lessonHref = await page.locator('a[href^="/portaal/lessen/"]').first().getAttribute("href");
  expect(lessonHref, "Een lesfixture is verplicht voor Lesdetail.").toBeTruthy();
  const parentRoutes = [
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
  const boardImages: Array<{ body: Buffer; name: string }> = [];
  for (const viewport of canonicalViewports) {
    await page.setViewportSize(viewport);
    for (const [index, routePath] of parentRoutes.entries()) {
      await gotoStable(page, routePath);
      await expect(page.locator("[data-portal-route-id]")).toHaveAttribute("data-portal-route-id", routes[index]!);
      await assertNoHorizontalOverflow(page);
      const body = await attachViewport(testInfo, page, `${theme}-parent-${routes[index]}-${viewport.name}`);
      if (viewport.name === "desktop") boardImages.push({ body, name: routes[index]! });
      evidence.push({ kind: "canonical", name: `parent-${routes[index]}`, theme, viewport: viewport.name });
    }
  }
  await attachBoard(testInfo, page, `${theme}-parent-board`, boardImages);
  await context.close();
  return { canonicalRenders: evidence.length, dashboardViewportCases: 0, evidence };
}

async function captureParentDashboards(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const evidence: EvidenceEntry[] = [];
  await signInParent(page);
  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    await gotoStable(page, "/portaal");
    await assertDashboardLayout(page, "parent", viewport.width, viewport.height);
    await attachViewport(testInfo, page, `${theme}-parent-dashboard-${viewport.name}`);
    evidence.push({ kind: "dashboard-viewport", name: "parent", theme, viewport: viewport.name });
  }
  const dashboardViewportCases = evidence.length;
  for (const viewport of highResolutionViewports) {
    await page.setViewportSize(viewport);
    await gotoStable(page, "/portaal");
    await attachViewport(testInfo, page, `${theme}-parent-dashboard-highres-${viewport.name}`);
    evidence.push({ kind: "canonical-highres", name: "parent-dashboard", theme, viewport: viewport.name });
  }
  await context.close();
  return { canonicalRenders: highResolutionViewports.length, dashboardViewportCases, evidence };
}

async function captureChildCanonical(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const evidence: EvidenceEntry[] = [];
  await signInParent(page);
  await enterChildPortal(page);
  const childRoutes = await resolveChildRoutes(page);
  const boardImages: Array<{ body: Buffer; name: string }> = [];
  for (const viewport of canonicalViewports) {
    await page.setViewportSize(viewport);
    for (const route of childRoutes) {
      await gotoStable(page, route.path);
      await expect(page.locator("[data-child-route-state]")).toHaveAttribute("data-child-route-state", route.state);
      await assertNoHorizontalOverflow(page);
      await assertChildTouchTargets(page);
      const body = await attachViewport(testInfo, page, `${theme}-child-${route.state}-${viewport.name}`);
      if (viewport.name === "desktop") boardImages.push({ body, name: route.state });
      evidence.push({ kind: "canonical", name: `child-${route.state}`, theme, viewport: viewport.name });
    }
  }
  await attachBoard(testInfo, page, `${theme}-child-board`, boardImages);
  await context.close();
  return { canonicalRenders: evidence.length, dashboardViewportCases: 0, evidence };
}

async function captureChildDashboardsAndStates(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const evidence: EvidenceEntry[] = [];
  await signInParent(page);
  await enterChildPortal(page);
  for (const viewport of requiredViewports) {
    await page.setViewportSize(viewport);
    await gotoStable(page, "/kind");
    await assertDashboardLayout(page, "child", viewport.width, viewport.height);
    await attachViewport(testInfo, page, `${theme}-child-dashboard-${viewport.name}`);
    evidence.push({ kind: "dashboard-viewport", name: "child", theme, viewport: viewport.name });
  }
  const dashboardViewportCases = evidence.length;
  for (const viewport of highResolutionViewports) {
    await page.setViewportSize(viewport);
    await gotoStable(page, "/kind");
    await attachViewport(testInfo, page, `${theme}-child-dashboard-highres-${viewport.name}`);
    evidence.push({ kind: "canonical-highres", name: "child-dashboard", theme, viewport: viewport.name });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tab of ["prijzenkast", "momenten", "instellingen"]) {
    await gotoStable(page, `/kind/ik?tab=${tab}`);
    await attachViewport(testInfo, page, `${theme}-child-profile-${tab}-mobile`);
  }
  await gotoStable(page, "/kind/badges");
  const earnedBadgeHref = await page.locator('a[data-state="earned"]').first().getAttribute("href");
  const lockedBadgeHref = await page.locator('a[data-state="locked"]').first().getAttribute("href");
  expect(earnedBadgeHref, "Een verdiende badgefixture is verplicht voor het viermoment.").toBeTruthy();
  expect(lockedBadgeHref, "Een bekende vergrendelde badgefixture is verplicht voor de veilige locked state.").toBeTruthy();
  await gotoStable(page, earnedBadgeHref!);
  await expect(page.locator('[data-celebration="open"]')).toBeVisible();
  await attachViewport(testInfo, page, `${theme}-child-badge-celebration-mobile`);
  await gotoStable(page, lockedBadgeHref!);
  await expect(page.locator('[data-celebration="closed"]')).toBeVisible();
  await attachViewport(testInfo, page, `${theme}-child-badge-locked-mobile`);
  for (const requestState of ["verstuurd", "limiet", "mislukt"]) {
    await gotoStable(page, `/kind/ik?tab=instellingen&verzoek=${requestState}`);
    await expect(page.locator('.child-safe-feedback[role="status"]')).toBeVisible();
    await attachViewport(testInfo, page, `${theme}-child-parent-request-${requestState}-mobile`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoStable(page, "/kind");
  await expect(page.locator(".child-journey-map")).toBeVisible();
  await context.close();
  return { canonicalRenders: highResolutionViewports.length, dashboardViewportCases, evidence };
}

async function captureThemeAccessibility(
  browser: Browser,
  baseURL: string,
  theme: string
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInParent(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoStable(page, "/portaal");
  await expect(page.locator('[data-portal-route-id="overview"]')).toBeVisible();
  await assertA11y(page, `${theme} parent dashboard`);
  await enterChildPortal(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, "/kind");
  await expect(page.locator('[data-child-route-state="today"]')).toBeVisible();
  await assertA11y(page, `${theme} child dashboard`);
  await context.close();
  return { canonicalRenders: 0, dashboardViewportCases: 0, evidence: [] };
}

async function captureChildParentReauth(
  browser: Browser,
  baseURL: string,
  theme: string,
  testInfo: TestInfo
): Promise<ThemeMatrixResult> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signInParent(page);
  await enterChildPortal(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, "/kind");
  await page.getByRole("button", { name: "Naar ouderportaal" }).click();
  await page.waitForURL(/\/login\?/);
  await attachViewport(testInfo, page, `${theme}-child-parent-reauth-mobile`);
  await context.close();
  return { canonicalRenders: 0, dashboardViewportCases: 0, evidence: [] };
}

async function enterChildPortal(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoStable(page, "/portaal/kinderen");
  await page.getByRole("button", { name: /Open kindmodus voor/i }).first().click();
  await page.waitForURL(/\/kind(?:\?|$)/);
}

async function resolveChildRoutes(page: Page) {
  await gotoStable(page, "/kind/reis");
  const goalHref = await page.locator(".child-goal-list a").first().getAttribute("href");
  expect(goalHref, "Een canoniek curriculumdoel is verplicht voor Doeldetail.").toBeTruthy();
  await gotoStable(page, "/kind/agenda");
  const lessonHref = await page.locator('.child-lesson-list a[href^="/kind/agenda/lessen/"]').first().getAttribute("href");
  expect(lessonHref, "Een kindveilige lesfixture is verplicht voor Lesdetail.").toBeTruthy();
  const childRoutes = [
    { path: "/kind", state: "today" },
    { path: "/kind/reis", state: "journey" },
    { path: goalHref!, state: "goal-detail" },
    { path: "/kind/badges", state: "badges" },
    { path: "/kind/agenda", state: "agenda" },
    { path: lessonHref!, state: "lesson-detail" },
    { path: "/kind/ik?tab=prijzenkast", state: "profile-prijzenkast" }
  ];
  expect(childRoutes.map((route) => route.state)).toEqual([...CHILD_VISUAL_STATES]);
  return childRoutes;
}

async function signIn(page: Page) {
  const email = requiredEnv("E2E_PLATFORM_OWNER_EMAIL");
  const password = requiredEnv("E2E_PLATFORM_OWNER_PASSWORD");
  await page.goto("/login?next=%2Fplatform%2Fthemes", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/platform\/themes/);
}

async function signInParent(page: Page) {
  const email = requiredEnv("E2E_PARENT_EMAIL");
  const password = requiredEnv("E2E_PARENT_PASSWORD");
  await page.goto("/login?next=%2Fportaal", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/portaal/);
}

async function signInTenantAdmin(page: Page) {
  await page.goto("/login?next=%2Fadmin%2Fbranding", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(requiredEnv("E2E_TENANT_ADMIN_EMAIL"));
  await page.locator("input[name='password']").fill(requiredEnv("E2E_TENANT_ADMIN_PASSWORD"));
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL(/\/admin\/branding/);
}

async function configureChildPortalPilot(page: Page) {
  await gotoStable(page, "/admin/instellingen");
  await page.locator('select[name="childPortalStatus"]').selectOption("pilot");
  await page.locator('input[name="childPortalTtlMinutes"]').fill("240");
  await page.locator('input[name="childPortalSecurityReviewed"]').check();
  await page.locator('input[name="childPortalVisualReviewed"]').check();
  await page.getByRole("button", { name: "Rollout opslaan" }).click();
  await page.waitForURL(/saved=child_portal/);
}

async function selectTheme(page: Page, theme: string) {
  await gotoStable(page, "/admin/branding");
  const card = page.locator(`[data-theme-choice="${theme}"]`);
  await expect(card, `${theme} moet tenantbeschikbaar zijn`).toHaveCount(1);
  const button = card.getByRole("button");
  if (await button.isDisabled()) return;
  await Promise.all([
    page.waitForURL(/saved=theme/, { timeout: 60_000 }),
    button.click()
  ]);
}

async function gotoStable(page: Page, path: string) {
  await page.goto(path, { timeout: 60_000, waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

async function attachViewport(testInfo: TestInfo, page: Page, name: string) {
  const body = await page.screenshot({ animations: "disabled", fullPage: false });
  await testInfo.attach(name, {
    body,
    contentType: "image/png"
  });
  return body;
}

async function attachBoard(
  testInfo: TestInfo,
  sourcePage: Page,
  name: string,
  images: Array<{ body: Buffer; name: string }>
) {
  const board = await sourcePage.context().newPage();
  await board.setViewportSize({ width: 1600, height: 1000 });
  const cards = images.map((entry) => `
    <article>
      <strong>${escapeHtml(entry.name)}</strong>
      <img alt="" src="data:image/png;base64,${entry.body.toString("base64")}" />
    </article>
  `).join("");
  await board.setContent(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#e8eef5;color:#10233c;font:600 14px/1.4 system-ui,sans-serif}
    h1{margin:0 0 20px;font-size:28px}.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
    article{overflow:hidden;border:1px solid #c6d2df;border-radius:18px;background:white;box-shadow:0 8px 24px #10233c1a}
    strong{display:block;padding:10px 14px;text-transform:uppercase;letter-spacing:.08em}img{display:block;width:100%;height:auto;border-top:1px solid #d9e2eb}
  </style></head><body><h1>${escapeHtml(name)}</h1><main class="board">${cards}</main></body></html>`);
  await testInfo.attach(name, {
    body: await board.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png"
  });
  await board.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]!);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertChildTouchTargets(page: Page) {
  const undersized = await page.locator(".child-shell a, .child-shell button, .child-shell select, .child-shell label:has(input)").evaluateAll((elements) =>
    elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || box.width === 0 || box.height === 0) return [];
      return box.width < 47.5 || box.height < 47.5
        ? [{ element: element.tagName, height: box.height, text: element.textContent?.trim().slice(0, 80), width: box.width }]
        : [];
    })
  );
  expect(undersized, JSON.stringify(undersized)).toEqual([]);
}

async function assertA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blockers = results.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious");
  expect(blockers, `${label}: ${JSON.stringify(blockers, null, 2)}`).toEqual([]);
}

async function assertDashboardLayout(
  page: Page,
  shell: "child" | "parent",
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
      childQuest: box(".child-today__quest"),
      childMap: box(".child-today .child-journey-map"),
      childNav: box(".child-shell__bottom-nav"),
      childSidebar: box(".child-shell__sidebar"),
      childHeader: box(".child-shell__header"),
      horizontalOverflow: Math.max(0, root.scrollWidth - width),
      parentNav: box(".portal-mobile-navigation"),
      parentSidebar: box(".portal-parent-sidebar"),
      parentHeader: box(".portal-parent-header"),
      verticalOverflow: Math.max(0, root.scrollHeight - height)
    };
  }, { width, height });
  expect(outcome.horizontalOverflow).toBeLessThanOrEqual(1);
  const sidebar = shell === "child" ? outcome.childSidebar : outcome.parentSidebar;
  const header = shell === "child" ? outcome.childHeader : outcome.parentHeader;
  const nav = shell === "child" ? outcome.childNav : outcome.parentNav;
  if (width >= 1280) {
    expect(sidebar?.width).toBeGreaterThanOrEqual(237);
    expect(sidebar?.width).toBeLessThanOrEqual(239);
    expect(header?.height).toBeGreaterThanOrEqual(71);
    expect(header?.height).toBeLessThanOrEqual(73);
    expect(outcome.verticalOverflow).toBeLessThanOrEqual(1);
    expect(nav).toBeNull();
  } else if (width >= 1024) {
    expect(sidebar?.width).toBeGreaterThanOrEqual(85);
    expect(sidebar?.width).toBeLessThanOrEqual(103);
    expect(nav).toBeNull();
  } else {
    expect(sidebar).toBeNull();
    expect(nav).not.toBeNull();
    if (shell === "child") {
      expect(await page.locator(".child-shell__bottom-nav a").count()).toBe(5);
      expect(outcome.childQuest?.top ?? 0).toBeGreaterThanOrEqual((header?.bottom ?? 0) - 1);
      expect(outcome.childQuest?.bottom ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual((nav?.top ?? 0) + 1);
      expect(outcome.childMap).not.toBeNull();
    } else {
      expect(await page.locator(".mobile-nav-item").count()).toBe(5);
    }
  }
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
