import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";
import { legacyJourneyVisual } from "../../apps/web/lib/theme/legacy-journey-presentation";
import { portalThemeCatalog } from "../../apps/web/lib/theme/portal-theme-registry";
import { analyzeThemePackage } from "../../apps/web/lib/theme/theme-package-adapters";
import { readThemeArchive, themeReviewDigest, writeThemeArchive } from "../../apps/web/lib/theme/theme-package-archive";
import { exportPresentationPackage } from "../../apps/web/lib/theme/theme-presentation-package";
import { assertThemePublishable, validateThemeDeliverySet, validateThemeReleaseDocument } from "../../apps/web/lib/theme/theme-release-validation";
import { compareThemeDocuments } from "../../apps/web/lib/theme/theme-revision-tools";
import { matchesThemeDocument } from "../../apps/web/lib/theme/theme-document-equality";
import { inspectThemeRaster } from "../../apps/web/lib/theme/theme-raster";

test("raster validation rejects EXIF rotation that would detach anchors from the displayed canvas", async () => {
  const sharp = createRequire(new URL("../../apps/web/package.json", import.meta.url))("sharp");
  const input = { create: { width: 32, height: 48, channels: 3, background: "#0088aa" } };
  const rotated = await sharp(input).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  await assert.rejects(() => inspectThemeRaster(rotated, "rotated.jpg"), /EXIF/);
  const upright = await sharp(input).jpeg().toBuffer(), result = await inspectThemeRaster(upright, "upright.jpg");
  assert.equal(result.width, 32); assert.equal(result.height, 48);
});

test("editor accepts jsonb map reordering after its own save without accepting another edit", () => {
  const local = JSON.stringify({ worlds: { ocean: { name: "Zee", layers: ["back", "front"] } }, assets: { uploaded: { width: 512, height: 400 } } });
  const saved = { assets: { uploaded: { height: 400, width: 512 } }, worlds: { ocean: { layers: ["back", "front"], name: "Zee" } } };
  assert.equal(matchesThemeDocument(local, saved), true);
  assert.equal(matchesThemeDocument(local, { ...saved, worlds: { ocean: { ...saved.worlds.ocean, name: "Nieuwe invoer" } } }), false);
  assert.equal(matchesThemeDocument(local, { ...saved, worlds: { ocean: { ...saved.worlds.ocean, layers: ["front", "back"] } } }), false);
  assert.equal(matchesThemeDocument("{", saved), false);
});

async function reference() {
  const bytes = readFileSync(new URL("../fixtures/portal-v42/NXTTRACK-De-Parelroute-Wereld-1-Referentiepakket-1.0.0.zip", import.meta.url));
  const value = await analyzeThemePackage(bytes, "reference.zip");
  if (value.kind !== "draft") throw new Error("Expected reference package draft");
  return value;
}

test("revision comparison separates world, guide and asset changes and ignores map order and rebased delivery paths", async () => {
  const original = await reference(), changed = structuredClone(original.presentation);
  const worldId = Object.keys(changed.worlds)[0], assetId = Object.keys(changed.assets)[0];
  Object.assign(changed.worlds[worldId], { name: "Andere wereldnaam" });
  Object.assign(changed.assets[assetId], { contentHash: "f".repeat(64) });
  Object.assign(changed, { guide: { mode: "none" } });
  const differences = compareThemeDocuments(original, { manifest: original.manifest, presentation: changed });
  assert.deepEqual(differences.map((row) => row.area), ["Werelden", "Gids", "Assets"]);
  const reordered = { ...original.presentation, assets: Object.fromEntries(Object.entries(original.presentation.assets).reverse().map(([id, asset]) => [id, { ...asset, objectKey: asset.objectKey.replace("/1.0.0/", "/1.0.1/") }])) };
  assert.deepEqual(compareThemeDocuments(original, { manifest: original.manifest, presentation: reordered }), []);
});

test("legacy built-ins retain their actual release artwork without claiming Default 1.1 provenance", () => {
  assert.equal(portalThemeCatalog.length, 7);
  for (const manifest of portalThemeCatalog) {
    const visual = legacyJourneyVisual(manifest);
    assert.equal(visual.presentation.themeId, manifest.theme.key);
    assert.equal(visual.presentation.sourcePackageVersion, "legacy-native-3");
    assert.equal(visual.presentation.pearlArtwork.mode, "none");
    assert.equal(visual.assetUrls?.desktop, manifest.assets["progress.journey.desktop"]?.path);
    assert.equal(visual.assetUrls?.mobile, manifest.assets["progress.journey.mobile"]?.path);
    if (manifest.theme.key === "nxttrack-default") assert.equal(visual.presentation.guide.mode, "route-light");
  }
});

test("portable export roundtrip preserves manifest, worlds, anchors and bytes with no management metadata", async () => {
  const source = await reference();
  const zip = await exportPresentationPackage(source, async (key) => source.files.get(key)!);
  const imported = await analyzeThemePackage(zip, "export.zip");
  assert.equal(imported.kind, "draft"); if (imported.kind !== "draft") return;
  assert.deepEqual(imported.manifest, source.manifest); assert.deepEqual(imported.presentation, source.presentation);
  assert.equal(themeReviewDigest({ manifest: imported.manifest, presentation: imported.presentation }), source.digest);
  for (const [key, bytes] of source.files) assert.deepEqual(imported.files.get(key), bytes);
  assert.ok([...readThemeArchive(zip).keys()].every((key) => ["manifest.json", "native-manifest.json", "presentation.json"].includes(key) || key.startsWith("assets/")));
});

test("a new version rebases every delivery key without changing asset hashes or curriculum semantics", async () => {
  const source = await reference(), zip = await exportPresentationPackage(source, async (key) => source.files.get(key)!);
  const next = await analyzeThemePackage(zip, "next.zip", { runtimeRelease: "1.0.1" });
  assert.equal(next.kind, "draft"); if (next.kind !== "draft") return;
  assert.equal(next.manifest.theme.release, "1.0.1");
  assert.deepEqual(next.presentation.worlds, source.presentation.worlds);
  for (const [id, asset] of Object.entries(next.presentation.assets)) { assert.equal(asset.contentHash, source.presentation.assets[id].contentHash); assert.ok(asset.objectKey.includes("/1.0.1/")); assert.ok(next.files.has(asset.objectKey)); }
});

test("modified raster bytes, external native references and unsafe tokens fail the release validation", async () => {
  const source = await reference(); validateThemeReleaseDocument(source.manifest, source.presentation);
  const changed = structuredClone(source.manifest); changed.tokens.typography.body = "url(https://example.invalid/font)";
  assert.throws(() => validateThemeReleaseDocument(changed, source.presentation), /font stacks/);
  const badColor = structuredClone(source.manifest); badColor.tokens.color.primary = "rgb(url(https://example.invalid/asset))";
  assert.throws(() => validateThemeReleaseDocument(badColor, source.presentation), /color/);
  await assert.rejects(() => validateThemeDeliverySet(source.presentation, async () => Buffer.from("not an image")));
  const zip = await exportPresentationPackage(source, async (key) => source.files.get(key)!);
  const files = new Map(readThemeArchive(zip)); files.set("presentation.json", Buffer.from("{}"));
  await assert.rejects(() => analyzeThemePackage(writeThemeArchive(files), "tampered.zip"));
});

test("publishing rejects explicit fixture worlds even when the surrounding package is valid", async () => {
  const bytes = readFileSync(new URL("../fixtures/portal-v42/NXTTRACK-Ocean-Quest-Referentiepakket-1.0.0.zip", import.meta.url));
  const value = await analyzeThemePackage(bytes, "ocean.zip"); if (value.kind !== "draft") throw new Error("Expected draft");
  assert.throws(() => assertThemePublishable(value.presentation), /fixture/);
  const publishable = await reference();
  assert.doesNotThrow(() => assertThemePublishable(publishable.presentation));
  assert.throws(() => assertThemePublishable({ ...publishable.presentation, themeId: "nxttrack-default" }, { dialect: "package-1.0" }), /bron.*geverifieerd/);
});
