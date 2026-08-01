import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultPortalTheme,
  getThemeRelease,
  portalThemeCatalog,
  resolveRegisteredTheme
} from "../../apps/web/lib/theme/portal-theme-registry";
import {
  parentPortalRouteIds,
  validatePortalThemeManifest
} from "../../apps/web/lib/theme/portal-theme-contract";
import {
  getPortalOverviewRecipePresentation,
  portalOverviewRecipePresentations
} from "../../apps/web/lib/theme/portal-overview-recipes";

test("catalogus bevat exact de vijf launchreleases met alle dertien routes", () => {
  assert.deepEqual(
    portalThemeCatalog.map((theme) => `${theme.theme.key}@${theme.theme.release}`),
    [
      "nxttrack-default@2.2.2",
      "ocean-quest@1.2.2",
      "dolphin-bay@1.0.1",
      "turtle-trails@1.0.1",
      "aqua-academy@1.0.1"
    ]
  );
  for (const theme of portalThemeCatalog) {
    assert.equal(Object.keys(theme.recipes.pages).length, 13);
    for (const routeId of parentPortalRouteIds) assert.ok(theme.recipes.pages[routeId]);
    assert.ok(Object.isFrozen(theme));
  }
});

test("registry is open voor keys maar valt veilig terug bij onbekende releases", () => {
  assert.equal(getThemeRelease("dolphin-bay", "1.0.1")?.theme.displayName, "Dolphin Bay");
  assert.equal(resolveRegisteredTheme("future-pack", "9.0.0"), defaultPortalTheme);
});

test("manifestvalidator wijst raw onbekende recipe-ID af", () => {
  const unsafe = structuredClone(defaultPortalTheme);
  unsafe.recipes.pages.overview = "raw-css/from-database" as typeof unsafe.recipes.pages.overview;
  assert.throws(() => validatePortalThemeManifest(unsafe), /Unknown page recipe/);
});

test("manifestvalidator weigert onbekende databasevelden", () => {
  const unsafe = Object.assign(structuredClone(defaultPortalTheme), { rawCss: ".tenant { display: none }" });
  assert.throws(() => validatePortalThemeManifest(unsafe), /Invalid manifest keys/);
});

test("iedere launchrelease rendert een geregistreerde overview-compositie", () => {
  const overviewRecipes = portalThemeCatalog.map((theme) => theme.recipes.pages.overview);

  assert.equal(new Set(overviewRecipes).size, 5);
  for (const recipeId of overviewRecipes) {
    assert.ok(recipeId in portalOverviewRecipePresentations, `${recipeId} must have a real presentation recipe`);
    assert.ok(getPortalOverviewRecipePresentation(recipeId).ctaLabel);
  }

  const ocean = getPortalOverviewRecipePresentation("overview/pearl-route-v2");
  assert.equal(ocean.eyebrow, "Ocean Quest");
  assert.equal(ocean.progressLabel, "Reisvoortgang");

  const overviewSource = readFileSync(
    new URL("../../apps/web/app/(portaal)/portaal/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(overviewSource, /resolvedTheme\.manifest\.recipes\.pages\.overview/);
  assert.match(overviewSource, /PortalOverviewHero/);
});

test("badgeboards van onvolledige families blijven review met eigen fallback", () => {
  const expectedFallback = {
    "dolphin-bay": "badge-fallback/bay-medallion-v1",
    "turtle-trails": "badge-fallback/turtle-scute-v1",
    "aqua-academy": "badge-fallback/academy-crest-v1"
  } as const;
  for (const key of ["dolphin-bay", "turtle-trails", "aqua-academy"]) {
    const theme = portalThemeCatalog.find((entry) => entry.theme.key === key)!;
    assert.equal(theme.badges.status, "review");
    assert.equal(theme.badges.fallbackRecipe, expectedFallback[key as keyof typeof expectedFallback]);
  }
});

test("interactieve themakleuren halen WCAG AA met witte tekst", () => {
  const globals = readFileSync(new URL("../../apps/web/app/globals.css", import.meta.url), "utf8");
  assert.match(globals, /--primary:\s*var\(--portal-primary-strong\);/);
  for (const theme of portalThemeCatalog) {
    assert.ok(
      contrastRatio(theme.tokens.color.primaryStrong, "#FFFFFF") >= 4.5,
      `${theme.theme.key} primaryStrong must meet WCAG AA`
    );
  }
});

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g);
  assert.ok(channels);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
