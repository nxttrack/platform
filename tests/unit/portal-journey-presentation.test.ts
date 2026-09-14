import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultJourneyFixture, defaultJourneyWorlds } from "../../apps/web/lib/theme/default-journey-profile";
import { clampJourneyCamera, distributeJourneyNodes, focusJourneyCamera, journeyPageSize, journeyRoutePath } from "../../apps/web/lib/theme/portal-journey-geometry";
import { parseJourneyPresentation, resolvePearlArtwork, safeThemeSourcePath, type PortalJourneyPresentationV1 } from "../../apps/web/lib/theme/portal-journey-presentation";
import { defaultPortalTheme } from "../../apps/web/lib/theme/portal-theme-registry";
import { validatePortalThemeManifest } from "../../apps/web/lib/theme/portal-theme-contract";
import { readThemeArchive, readThemeJson, themeReviewDigest, writeThemeArchive } from "../../apps/web/lib/theme/theme-package-archive";

const fixture = () => structuredClone(createDefaultJourneyFixture());
const asset = { objectKey: `nxttrack-default/4.0.0/${"a".repeat(64)}.png`, sourcePath: "assets/decorative-pearl.png", contentHash: "a".repeat(64), mime: "image/png", width: 941, height: 1672, hasAlpha: true, decorative: true };

test("Default fixtures preserve six visual IDs, separate orientations and explicit missing-art provenance", () => {
  const parsed = parseJourneyPresentation(fixture());
  assert.deepEqual(Object.keys(parsed.worlds), defaultJourneyWorlds.map((world) => world.id));
  assert.equal(parsed.worlds["badje-a"].name, "De A-poort");
  for (const world of Object.values(parsed.worlds)) {
    assert.notDeepEqual(world.portrait.controlPoints, world.landscape.controlPoints);
    for (const scene of [world.portrait, world.landscape]) {
      assert.equal(scene.anchorSource.status, "fixture-only"); assert.equal(scene.anchorSource.sha256, null); assert.equal(scene.parallax.enabled, false);
    }
  }
  assert.equal(parsed.guide.mode, "route-light");
  assert.ok(Object.isFrozen(parsed.worlds["badje-a"].portrait.controlPoints));
});

test("strict native schema 3 stays unchanged and rejects rich sidecar fields inside it", () => {
  assert.equal(validatePortalThemeManifest(defaultPortalTheme).schemaVersion, 3);
  assert.throws(() => validatePortalThemeManifest({ ...defaultPortalTheme, presentation: fixture() } as typeof defaultPortalTheme), /manifest keys/);
});

test("dotted support IDs stay distinct from source paths and cannot enable criterion artwork", () => {
  const input = fixture();
  const parsed = parseJourneyPresentation({ ...input, assets: { "progress.stage.pearl": asset }, supportSlots: { "progress.stage.pearl": "progress.stage.pearl" } });
  assert.equal(parsed.assets["progress.stage.pearl"].sourcePath, "assets/decorative-pearl.png");
  assert.equal(resolvePearlArtwork(parsed, "progress.stage.pearl"), null);
  assert.throws(() => parseJourneyPresentation({ ...parsed, pearlArtwork: { mode: "none", byCriterionIdentity: { "criterion.1": "progress.stage.pearl" } } }), /Neutral pearl/);
  // Defense in depth before resolution, even for a caller holding a forged typed object.
  const forged = { ...parsed, pearlArtwork: { mode: "explicit", byCriterionIdentity: { "criterion.1": "progress.stage.pearl" } } } as PortalJourneyPresentationV1;
  assert.equal(resolvePearlArtwork(forged, "criterion.1"), null);
});

test("presentation rejects extra behavior, learner records, unbounded numbers and URL references", () => {
  for (const extra of [{ script: "alert(1)" }, { tenantId: "tenant-a" }, { assessment: { rating: 5 } }, { css: "body{}" }]) assert.throws(() => parseJourneyPresentation({ ...fixture(), ...extra }), /unsupported/);
  assert.throws(() => parseJourneyPresentation({ ...fixture(), runtimeRelease: "../3" }), /runtime release/);
  assert.throws(() => parseJourneyPresentation({ ...fixture(), assets: { x: { ...asset, width: Infinity } } }), /width/);
  assert.throws(() => parseJourneyPresentation({ ...fixture(), assets: { x: { ...asset, objectKey: "https://example.com/image.png" } } }), /content-addressed/);
  assert.throws(() => parseJourneyPresentation({ ...fixture(), guide: { mode: "character", poses: { idle: "missing" }, widthDesktop: 120, widthMobile: 100, aspectRatio: 2 } }), /Missing asset/);
  for (const path of ["../image.png", "assets/../../image.png", "/image.png", "https://example.com", "a\\b", "a/%2e%2e/b", "a//b"]) assert.throws(() => safeThemeSourcePath(path));
});

test("review digest changes on anchor edits, not JSON key order", () => {
  const value = fixture();
  assert.equal(themeReviewDigest(value), themeReviewDigest(Object.fromEntries(Object.entries(value).reverse())));
  value.worlds["badje-01"].landscape.controlPoints[0].x = 16;
  assert.notEqual(themeReviewDigest(value), themeReviewDigest(fixture()));
});

for (const orientation of ["portrait", "landscape"] as const) {
  test(`arc length route supports 0, 1, 4, 5, 7, 12, 24 and 48 items in ${orientation}`, () => {
    const scene = fixture().worlds["badje-01"][orientation];
    for (const count of [0, 1, 4, 5, 7, 12, 24, 48]) {
      const points = distributeJourneyNodes(scene, count);
      assert.equal(points.length, count);
      assert.equal(new Set(points.map((point) => `${point.x}:${point.y}`)).size, count);
      assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100));
    }
    const viewport = orientation === "portrait" ? { width: 360, height: 650 } : { width: 1440, height: 720 };
    const camera = clampJourneyCamera({ x: -9999, y: 9999, scale: NaN }, scene, viewport);
    for (const scale of [0, NaN, 1]) {
      const unmeasured = clampJourneyCamera({ x: 0, y: 0, scale }, scene, { width: 0, height: 0 });
      assert.ok(unmeasured.scale > 0 && Number.isFinite(1 / unmeasured.scale));
    }
    assert.equal(camera.y, 0);
    assert.ok(camera.x <= 0 && camera.x >= viewport.width - scene.intrinsic.width * camera.scale);
    const selected = focusJourneyCamera({ x: 100, y: 100 }, camera, scene, viewport);
    assert.ok(selected.x <= 0 && selected.y <= 0);
    assert.ok(journeyPageSize(scene, camera.scale) >= 1);
  });
}

test("ZIP roundtrip preserves bytes and Default dialect markers; no config-directory stripping", () => {
  const files = new Map([["config/manifest.json", Buffer.from('{"version":"1.1.0"}')], ["assets/a.png", Buffer.from("fixture")]]);
  const archive = writeThemeArchive(files);
  assert.deepEqual(readThemeArchive(archive), files);
  const wrapped = writeThemeArchive(new Map([...files].map(([key, bytes]) => [`source/${key}`, bytes])));
  assert.deepEqual(readThemeArchive(wrapped), files);
  assert.throws(() => readThemeArchive(archive.subarray(0, archive.length - 1)), /Incomplete/);
  const corrupted = Buffer.from(archive); corrupted[30 + "config/manifest.json".length] ^= 1;
  assert.throws(() => readThemeArchive(corrupted), /checksum/);
  const controller = new AbortController(); controller.abort();
  assert.throws(() => readThemeArchive(archive, controller.signal), /abort/i);
});

test("ZIP rejects duplicate case paths, executable entries, symlinks and excessive declared expansion", () => {
  assert.throws(() => readThemeArchive(writeThemeArchive(new Map([["a.png", Buffer.from("1")], ["A.png", Buffer.from("2")]]))), /Duplicate/);
  assert.throws(() => readThemeArchive(writeThemeArchive(new Map([["entry.js", Buffer.from("code")]]))), /Unsupported/);
  const archive = writeThemeArchive(new Map([["a.png", Buffer.from("1")]]));
  const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const linked = Buffer.from(archive); linked.writeUInt32LE((0xa000 * 65536) >>> 0, central + 38);
  assert.throws(() => readThemeArchive(linked), /linked/);
  const huge = Buffer.from(archive); huge.writeUInt32LE(21 * 1024 * 1024, central + 24);
  assert.throws(() => readThemeArchive(huge), /20 MiB/);
});

test("JSON rejects unsafe object keys, excessive nesting and malformed UTF-8", () => {
  assert.throws(() => readThemeJson(Buffer.from('{"__proto__": {}}'), "fixture"), /Reserved/);
  assert.throws(() => readThemeJson(Buffer.from("[".repeat(26) + "0" + "]".repeat(26)), "fixture"), /nesting/);
  assert.throws(() => readThemeJson(Buffer.from([0xff]), "fixture"), /UTF-8/);
});


test("registered cubic route and arc-length nodes share endpoints, stay inside anchor bounds and do not collapse degenerate segments", () => {
  for (const orientation of ["portrait", "landscape"] as const) {
    const scene = structuredClone(fixture().worlds["badje-01"][orientation]);
    scene.controlPoints = [{ slotId: "a", x: 10, y: 80 }, { slotId: "duplicate", x: 10, y: 80 }, { slotId: "b", x: 90, y: 20 }];
    const points = distributeJourneyNodes(scene, 7);
    assert.deepEqual(points[0], { x: 10, y: 80 }); assert.deepEqual(points.at(-1), { x: 90, y: 20 });
    assert.ok(points.every((point) => point.x >= 10 && point.x <= 90 && point.y >= 20 && point.y <= 80));
    assert.equal(new Set(points.map((point) => JSON.stringify(point))).size, 7);
    assert.match(journeyRoutePath(scene), /^M[\d.]+ [\d.]+ C/); assert.doesNotMatch(journeyRoutePath(scene), /NaN|Infinity| L/);
    assert.ok(Math.abs(points[3].x - 50) < .01 && Math.abs(points[3].y - 50) < .01);
    // Curvature is real: intermediate points are not on the straight anchor chord.
    assert.ok(Math.abs(points[1].y - (80 - (points[1].x - 10) * .75)) > 1);
    scene.controlPoints = scene.controlPoints.slice(0, 2);
    assert.deepEqual(distributeJourneyNodes(scene, 2), [{ x: 10, y: 80 }, { x: 10, y: 80 }]);
  }
});
