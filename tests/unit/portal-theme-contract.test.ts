import assert from "node:assert/strict";
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
