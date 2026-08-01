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

test("de volledige 5 × 13 matrix heeft een geregistreerde renderpresentatie", () => {
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
      assert.equal(presentation.intensity, ["overview", "planning", "progress", "badges"].includes(routeId) ? "rich" : "quiet");
    }
  }

  assert.equal(combinations.size, 65);
  assert.equal(motifs.size, 5);
});

test("alle canonieke paden resolven naar de dertien route-ID’s", () => {
  const paths = {
    overview: "/portaal",
    planning: "/portaal/planning",
    "lesson-detail": "/portaal/lessen/les-1",
    progress: "/portaal/ontwikkeling",
    badges: "/portaal/ontwikkeling/badges",
    media: "/portaal/ontwikkeling/media",
    diplomas: "/portaal/ontwikkeling/diplomas",
    inbox: "/portaal/berichten",
    payments: "/portaal/betalingen",
    documents: "/portaal/documenten",
    feedback: "/portaal/feedback",
    "family-access": "/portaal/kinderen",
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

test("Default en Ocean leveren twaalf echte badgeassets; overige families gebruiken eigen code-native fallback", async () => {
  for (const manifest of portalThemeCatalog) {
    for (const badgeKey of portalBadgeArtworkKeys) {
      const url = portalBadgeArtworkUrl(manifest, badgeKey, badgeKey);
      if (manifest.theme.key === "nxttrack-default" || manifest.theme.key === "ocean-quest") {
        assert.ok(url);
        const bytes = await readFile(path.join(root, "apps/web/public", url));
        assert.ok(bytes.byteLength > 2_000);
      } else {
        assert.equal(url, null);
      }
    }
    assert.match(manifest.badges.fallbackRecipe, /^badge-fallback\//);
  }
});

test("native bundles bevatten routes, recipes, assets, offlinegedrag en exact vijf beoordelingsopties", () => {
  for (const manifest of portalThemeCatalog) {
    const bundle = toNativeThemeTokenExport(manifest);
    assert.equal(bundle.schemaVersion, 2);
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
      release: "1.2.2",
      routeId: "overview",
      themeKey: "ocean-quest"
    }).name,
    "portal_route_viewed"
  );
  assert.throws(() => buildPortalThemeAnalyticsEvent("portal_route_viewed", { errorCode: "naam van kind" }), /Unsafe/);
  assert.throws(
    () => buildPortalThemeAnalyticsEvent("learner_assessment_submitted", { ratingValue: 3.5 as 3 }),
    /1–5/
  );
});

test("Pearl Frame, routeframe, ronde kindselector en exacte Inboxacties zijn aangesloten", async () => {
  const [layout, shell, inbox] = await Promise.all([
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/layout.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/components/shell/app-shell-client.tsx"), "utf8"),
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/berichten/page.tsx"), "utf8")
  ]);
  assert.match(layout, /PortalRouteFrame/);
  assert.match(layout, /Alle kinderen/);
  assert.match(shell, /rounded-full/);
  assert.match(inbox, /Alles als gelezen markeren/);
  assert.match(inbox, /Nieuw bericht/);
});

test("publieke theme-assets krijgen een immutable cachecontract", async () => {
  const nextConfig = await readFile(path.join(root, "apps/web/next.config.ts"), "utf8");
  assert.match(nextConfig, /source: "\/portal-themes\/:path\*"/);
  assert.match(nextConfig, /public, max-age=31536000, immutable/);
});
