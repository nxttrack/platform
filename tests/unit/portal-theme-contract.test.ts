import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultPortalTheme,
  getThemeDisplayName,
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

test("catalogus bevat exact de zeven v3-releases met alle dertien routes", () => {
  assert.deepEqual(
    portalThemeCatalog.map((theme) => `${theme.theme.key}@${theme.theme.release}`),
    [
      "nxttrack-default@3.0.0",
      "dolphin-bay@3.0.0",
      "turtle-trails@3.0.0",
      "polar-splash@3.0.0",
      "coastal-explorer@3.0.0",
      "ocean-quest@3.0.0",
      "nationaal-zwem-abc@3.0.0"
    ]
  );
  for (const theme of portalThemeCatalog) {
    assert.equal(Object.keys(theme.recipes.pages).length, 13);
    for (const routeId of parentPortalRouteIds) assert.ok(theme.recipes.pages[routeId]);
    assert.ok(Object.isFrozen(theme));
  }
});

test("registry is open voor keys maar valt veilig terug bij onbekende releases", () => {
  assert.equal(getThemeRelease("dolphin-bay", "3.0.0")?.theme.displayName, "Dolphin Bay");
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

test("iedere release gebruikt dezelfde Journey Engine en parentprojectie", () => {
  const overviewRecipes = portalThemeCatalog.map((theme) => theme.recipes.pages.overview);

  assert.equal(new Set(overviewRecipes).size, 1);
  for (const recipeId of overviewRecipes) {
    assert.ok(recipeId in portalOverviewRecipePresentations, `${recipeId} must have a real presentation recipe`);
    assert.ok(getPortalOverviewRecipePresentation(recipeId).ctaLabel);
  }

  const journey = getPortalOverviewRecipePresentation("overview/journey-engine-v1");
  assert.equal(journey.eyebrow, "NXTTRACK");
  assert.equal(journey.progressLabel, "Voortgang");

  const overviewSource = readFileSync(
    new URL("../../apps/web/app/(portaal)/portaal/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(overviewSource, /orderJourneyNodes/);
  assert.match(overviewSource, /ParentOverviewTop/);
  assert.match(overviewSource, /resolvedTheme\.manifest\.assets\["overview\.hero\.desktop"\]/);
});

test("alle thema's gebruiken uitsluitend de neutrale badgeplaceholderfamilie", () => {
  for (const theme of portalThemeCatalog) {
    assert.equal(theme.badges.status, "review");
    assert.equal(theme.badges.familyKey, "neutral-artwork-placeholders");
    assert.equal(theme.badges.fallbackRecipe, "badge-fallback/neutral-placeholder-v1");
  }
});

test("beschermde naam valt dicht zonder aantoonbare licentie", () => {
  const national = portalThemeCatalog.find((theme) => theme.theme.key === "nationaal-zwem-abc")!;
  assert.equal(getThemeDisplayName(national), "Diplomareis A–B–C");
  assert.equal(getThemeDisplayName(national, true), "Nationaal Zwem ABC");
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
