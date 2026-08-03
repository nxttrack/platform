import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { portalThemeEventNames, buildPortalThemeAnalyticsEvent } from "../../apps/web/lib/analytics/portal-theme-events";
import { portalBadgeArtworkKeys, portalBadgeArtworkUrl } from "../../apps/web/lib/theme/portal-badge-family";
import { parentPortalRouteIds } from "../../apps/web/lib/theme/portal-theme-contract";
import { getPortalRoutePresentation, resolvePortalRouteId } from "../../apps/web/lib/theme/portal-page-recipes";
import { portalThemeCatalog } from "../../apps/web/lib/theme/portal-theme-registry";
import { portalThemeCssVariables, toNativeThemeTokenExport } from "../../apps/web/lib/theme/portal-theme-web";

const root = path.resolve(import.meta.dirname, "../..");

test("de volledige 6 × 13 matrix heeft een geregistreerde renderpresentatie", () => {
  const combinations = new Set<string>();
  const motifs = new Set<string>();

  for (const manifest of portalThemeCatalog) {
    for (const routeId of parentPortalRouteIds) {
      const presentation = getPortalRoutePresentation(manifest, routeId);
      combinations.add(`${manifest.theme.key}:${routeId}`);
      motifs.add(presentation.motif);
      assert.equal(presentation.routeId, routeId);
      assert.equal(presentation.recipeId, manifest.recipes.pages[routeId]);
      assert.ok(presentation.cue.length > 3);
      assert.equal(presentation.milestones.length, 3);
      assert.equal(presentation.intensity, ["overview", "planning", "development", "badges"].includes(routeId) ? "rich" : "quiet");
    }
  }

  assert.equal(combinations.size, 78);
  assert.equal(motifs.size, 6);
});

test("alle canonieke paden resolven naar de dertien route-ID’s", () => {
  const paths = {
    overview: "/portaal",
    planning: "/portaal/planning",
    "lesson-detail": "/portaal/lessen/les-1",
    development: "/portaal/ontwikkeling",
    badges: "/portaal/ontwikkeling/badges",
    media: "/portaal/ontwikkeling/media",
    diplomas: "/portaal/ontwikkeling/diplomas",
    inbox: "/portaal/inbox",
    payments: "/portaal/betalingen",
    documents: "/portaal/documenten",
    feedback: "/portaal/feedback",
    children: "/portaal/kinderen",
    profile: "/portaal/profiel"
  } as const;
  for (const [routeId, routePath] of Object.entries(paths)) assert.equal(resolvePortalRouteId(routePath), routeId);
});

test("mobiel gebruikt uitsluitend portraitassets en nooit een desktopcrop", () => {
  for (const manifest of portalThemeCatalog) {
    const css = portalThemeCssVariables(manifest);
    const mobileOverview = manifest.assets["overview.hero.mobile"]?.path;
    const mobileProgress = manifest.assets["progress.journey.mobile"]?.path;
    assert.equal(css["--portal-hero-mobile"], mobileOverview ? `url("${mobileOverview}")` : "none");
    assert.equal(css["--portal-progress-mobile"], mobileProgress ? `url("${mobileProgress}")` : "none");
  }
});

test("het themapakket levert bewust geen definitieve badge-art", async () => {
  for (const manifest of portalThemeCatalog) {
    for (const badgeKey of portalBadgeArtworkKeys) {
      const url = portalBadgeArtworkUrl(manifest, badgeKey, badgeKey);
      assert.equal(url, null);
    }
    assert.match(manifest.badges.fallbackRecipe, /^badge-fallback\//);
  }
});

test("native bundles bevatten routes, recipes, assets, offlinegedrag en exact vijf beoordelingsopties", () => {
  for (const manifest of portalThemeCatalog) {
    const bundle = toNativeThemeTokenExport(manifest);
    assert.equal(bundle.schemaVersion, 3);
    assert.equal(bundle.navigation.routeIds.length, 13);
    assert.equal(bundle.navigation.primaryDestinations.length, 5);
    assert.deepEqual(bundle.assessment.values, [1, 2, 3, 4, 5]);
    assert.equal(bundle.assessment.unratedValue, null);
    assert.equal(bundle.behavior.offlineCacheKey, "tenantId+themeKey+release");
    assert.deepEqual(bundle.recipes.pages, manifest.recipes.pages);
  }
});

test("analytics accepteert alleen semantische, PII-vrije properties", () => {
  assert.equal(portalThemeEventNames.length, 16);
  assert.deepEqual(
    buildPortalThemeAnalyticsEvent("portal_route_viewed", {
      platform: "web",
      release: "3.0.0",
      routeId: "overview",
      themeKey: "dolphin-bay"
    }).name,
    "portal_route_viewed"
  );
  assert.throws(() => buildPortalThemeAnalyticsEvent("portal_route_viewed", { errorCode: "naam van kind" }), /Unsafe/);
  assert.throws(
    () => buildPortalThemeAnalyticsEvent("learner_assessment_submitted", { ratingValue: 3.5 as 3 }),
    /1–5/
  );
});

test("gedeelde PortalShell, routeframe, ronde kindselector en exacte Inboxacties zijn aangesloten", async () => {
  const [layout, shell, inbox] = await Promise.all([
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/layout.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/components/shell/app-shell-client.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/inbox/parent-inbox-page.tsx"), "utf8")
  ]);
  assert.match(layout, /PortalRouteFrame/);
  assert.match(layout, /Alle kinderen/);
  assert.match(shell, /rounded-full/);
  assert.match(inbox, /Alles als gelezen markeren/);
  assert.match(inbox, /Nieuw bericht/);
});

test("runtime gebruikt de letterlijke shellankers en exact zeven compatibilityredirects", async () => {
  const [shell, overview, journey] = await Promise.all([
    readFile(path.join(root, "apps/web/components/shell/app-shell-client.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/page.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/components/parent/portal-journey-engine.tsx"), "utf8")
  ]);
  for (const anchor of ["sidebar", "topbar", "mobile-bottom-nav", "mobile-nav-item"]) {
    assert.match(shell, new RegExp(anchor));
  }
  assert.match(overview, /dashboard-page/);
  assert.match(overview, /dashboard-cards/);
  assert.match(journey, /quest-panel/);

  const redirects = [
    ["lessen/page.tsx", "/portaal/planning"],
    ["voortgang/page.tsx", "/portaal/ontwikkeling"],
    ["badges/page.tsx", "/portaal/ontwikkeling/badges"],
    ["media/page.tsx", "/portaal/ontwikkeling/media"],
    ["diplomas/page.tsx", "/portaal/ontwikkeling/diplomas"],
    ["berichten/page.tsx", "/portaal/inbox"],
    ["afzwemmen/page.tsx", "/portaal/planning"]
  ] as const;
  for (const [relativePath, destination] of redirects) {
    const source = await readFile(
      path.join(root, "apps/web/app/(portaal)/portaal", relativePath),
      "utf8"
    );
    assert.match(source, new RegExp(destination.replaceAll("/", "\\/")));
    assert.match(source, /redirectCompatibilityRoute/);
  }
});

test("Default gebruikt sectorneutrale terminologie en native ontvangt historische hoofdstukken", async () => {
  const [terminology, nativeBootstrap, androidContract, androidRepository] = await Promise.all([
    readFile(path.join(root, "apps/web/lib/theme/portal-terminology.ts"), "utf8"),
    readFile(path.join(root, "apps/web/lib/domain/native-mobile.ts"), "utf8"),
    readFile(path.join(root, "apps/android/core/domain/src/main/kotlin/nl/nxttrack/mobile/domain/Contracts.kt"), "utf8"),
    readFile(path.join(root, "apps/android/core/data/src/main/kotlin/nl/nxttrack/mobile/data/MobileRepository.kt"), "utf8")
  ]);
  assert.match(terminology, /activity: "activiteit"/);
  assert.match(terminology, /finalCredential: "certificaat"/);
  assert.match(terminology, /journey: "leerreis"/);
  assert.match(terminology, /stage: "niveau"/);
  assert.match(nativeBootstrap, /const terminology = getPortalTerminology/);
  assert.match(nativeBootstrap, /completedChapters: journey\.chapterSnapshots/);
  assert.match(androidContract, /THEME_SCHEMA_VERSION = 3/);
  assert.match(androidContract, /PORTAL_CONTRACT = "parent-portal\/1\.2"/);
  assert.match(androidContract, /"development"/);
  assert.match(androidContract, /"children"/);
  assert.match(androidContract, /"more"/);
  assert.match(androidRepository, /DEFAULT_THEME_ASSET = "nxttrack-default-3\.0\.0\.json"/);
});

test("publieke theme-assets krijgen een immutable cachecontract", async () => {
  const nextConfig = await readFile(path.join(root, "apps/web/next.config.ts"), "utf8");
  assert.match(nextConfig, /source: "\/portal-themes\/:path\*"/);
  assert.match(nextConfig, /public, max-age=31536000, immutable/);
});

test("annuleren blijft expliciet bevestigd in de canonieke planning en servercommand", async () => {
  const [planning, lessonDetail, actions] = await Promise.all([
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/planning/parent-planning-page.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/lessen/[id]/page.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/lib/domain/parent-portal-actions.ts"), "utf8")
  ]);
  assert.match(planning, /ConfirmActionForm/);
  assert.match(planning, /humanConfirmation: "confirmed"/);
  assert.match(lessonDetail, /humanConfirmation: "confirmed"/);
  assert.match(actions, /formData\.get\("humanConfirmation"\) !== "confirmed"/);
});
