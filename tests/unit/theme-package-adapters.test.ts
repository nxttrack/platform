import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { analyzeThemePackage } from "../../apps/web/lib/theme/theme-package-adapters";
import { readThemeArchive, writeThemeArchive } from "../../apps/web/lib/theme/theme-package-archive";

const samples = { ocean: "NXTTRACK-Ocean-Quest-Referentiepakket-1.0.0.zip", golf: "NXTTRACK-De-Parelroute-Wereld-1-Referentiepakket-1.0.0.zip" };
const sample = (name: keyof typeof samples) => readFileSync(new URL(`../fixtures/portal-v42/${samples[name]}`, import.meta.url));

test("both supplied Package 1.0 references become separate immutable release candidates", async () => {
  for (const key of ["ocean", "golf"] as const) {
    const result = await analyzeThemePackage(sample(key), samples[key]);
    assert.equal(result.kind, "draft"); if (result.kind !== "draft") return;
    assert.equal(result.manifest.schemaVersion, 3);
    assert.equal(result.presentation.presentationContract, "rich-swim-journey/1.0");
    assert.equal(result.presentation.runtimeRelease, result.manifest.theme.release);
    assert.equal(result.presentation.sourcePackageVersion, "1.0");
    assert.equal(result.dialect, "package-1.0");
    assert.equal(result.digest.length, 64);
    assert.ok(result.files.size > 0);
    assert.ok(result.findings.some((finding) => finding.code === "SOURCE_RESOLUTION"));
    if (key === "ocean") {
      assert.equal(result.presentation.pearlArtwork.mode, "none");
      assert.equal(result.presentation.worlds.main.portrait.quality, "legacy-crop");
      assert.equal(result.presentation.worlds["quiet-preview"].portrait.quality, "fixture-only");
    } else {
      assert.equal(result.presentation.pearlArtwork.mode, "explicit");
      assert.equal(result.presentation.worlds["badje-01"].portrait.quality, "source-native");
      assert.equal(result.presentation.guide.mode, "character");
    }
  }
});

test("corrupt recognized manifests and unavailable Default source contract never become guided imports", async () => {
  const image = [...readThemeArchive(sample("ocean"))].find(([path]) => path.endsWith(".webp"))!;
  for (const [path, json] of [["manifest.json", "{}"], ["manifest.json", "{"], ["config/manifest.json", "{}"], ["source/deeper/manifest.json", "{}"], ["theme.json", "{}"]]) {
    const archive = writeThemeArchive(new Map([[path, Buffer.from(json)], image]));
    await assert.rejects(() => analyzeThemePackage(archive, "invalid.zip"));
  }
  const loose = writeThemeArchive(new Map([image]));
  const result = await analyzeThemePackage(loose, "loose.zip");
  assert.equal(result.kind, "guided");
  if (result.kind === "guided") { assert.equal(result.images.length, 1); assert.equal(result.findings[0].code, "MANUAL_MAPPING_REQUIRED"); }
});

test("source hashes, identity mismatches and uploaded behavior are rejected before a draft exists", async () => {
  const original = readThemeArchive(sample("ocean"));
  for (const mutate of [
    (files: Map<string, Buffer>) => { const index = JSON.parse(files.get("assets.json")!.toString()); Object.values(index).forEach((entry) => { (entry as { sha256: string }).sha256 = "0".repeat(64); }); files.set("assets.json", Buffer.from(JSON.stringify(index))); },
    (files: Map<string, Buffer>) => { const theme = JSON.parse(files.get("theme.json")!.toString()); theme.id = "different-id"; files.set("theme.json", Buffer.from(JSON.stringify(theme))); },
    (files: Map<string, Buffer>) => { const theme = JSON.parse(files.get("theme.json")!.toString()); theme.script = "unsafe"; files.set("theme.json", Buffer.from(JSON.stringify(theme))); }
  ]) {
    const files = new Map(original); mutate(files);
    await assert.rejects(() => analyzeThemePackage(writeThemeArchive(files), "invalid.zip"));
  }
});

test("Studio import uses explicit locally supplied assets and never fetches URLs", async () => {
  const bytes = readFileSync(new URL("../fixtures/portal-v42/legacy-studio.json", import.meta.url));
  const input = JSON.parse(bytes.toString());
  const packageFiles = readThemeArchive(sample("ocean"));
  const localFiles = new Map<string, Buffer>([["assets/ocean-quest/scene-demo-crop.webp", packageFiles.get("assets/scene-demo-crop.webp")!], ["assets/ocean-quest/mascot.webp", packageFiles.get("assets/mascot.webp")!]]);
  const imported = await analyzeThemePackage(bytes, "studio.json", { localFiles });
  assert.equal(imported.kind, "draft");
  if (imported.kind === "draft") assert.equal(imported.dialect, "studio-3.0");
  input.assets.scene = "https://example.com/private-image.png";
  await assert.rejects(() => analyzeThemePackage(Buffer.from(JSON.stringify(input)), "studio.json", { localFiles }), /path/);
});

test("an imported release cannot overwrite an existing built-in release", async () => {
  const files = new Map(readThemeArchive(sample("ocean")));
  const manifest = JSON.parse(files.get("manifest.json")!.toString()), theme = JSON.parse(files.get("theme.json")!.toString());
  manifest.themeId = theme.id = "nxttrack-default"; manifest.version = "3.0.0";
  files.set("manifest.json", Buffer.from(JSON.stringify(manifest))); files.set("theme.json", Buffer.from(JSON.stringify(theme)));
  await assert.rejects(() => analyzeThemePackage(writeThemeArchive(files), "collision.zip"), /already exists/);
});
