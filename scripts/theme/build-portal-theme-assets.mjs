import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const requireFromWeb = createRequire(path.join(repositoryRoot, "apps/web/package.json"));
const sharp = requireFromWeb("sharp");
const sourceRoot = path.join(repositoryRoot, "assets/portal-theme-masters");
const outputRoot = path.join(repositoryRoot, "apps/web/public/portal-themes");

const themes = [
  {
    key: "nxttrack-default",
    landscape: "nxttrack-default-landscape.png",
    progressLandscape: "nxttrack-default-progress.png",
    badgeFamily: true
  },
  {
    key: "ocean-quest",
    landscape: "ocean-quest-landscape.png",
    portrait: "ocean-quest-portrait.png",
    progressLandscape: "ocean-quest-journey.png",
    progressPortrait: "ocean-quest-journey-mobile.png",
    badgeFamily: true
  },
  {
    key: "dolphin-bay",
    landscape: "dolphin-bay-landscape.png",
    portrait: "dolphin-bay-portrait.png",
    progressLandscape: "dolphin-bay-landscape.png",
    progressPortrait: "dolphin-bay-portrait.png"
  },
  {
    key: "turtle-trails",
    landscape: "turtle-trails-landscape.png",
    portrait: "turtle-trails-portrait.png",
    progressLandscape: "turtle-trails-landscape.png",
    progressPortrait: "turtle-trails-portrait.png"
  },
  {
    key: "aqua-academy",
    landscape: "aqua-academy-landscape.png",
    portrait: "aqua-academy-portrait.png",
    progressLandscape: "aqua-academy-landscape.png",
    progressPortrait: "aqua-academy-portrait.png"
  }
];

const results = [];
for (const theme of themes) {
  const target = path.join(outputRoot, theme.key);
  await mkdir(target, { recursive: true });
  await renderSet(path.join(sourceRoot, theme.landscape), target, "overview-landscape", [640, 960, 1440, 1920]);
  if (theme.portrait) {
    await renderSet(path.join(sourceRoot, theme.portrait), target, "overview-portrait", [640, 960]);
  }
  if (theme.progressLandscape) {
    await renderSet(path.join(sourceRoot, theme.progressLandscape), target, "progress-journey-landscape", [640, 960, 1440, 1920]);
  }
  if (theme.progressPortrait) {
    await renderSet(path.join(sourceRoot, theme.progressPortrait), target, "progress-journey-portrait", [640, 960]);
  }
  if (theme.badgeFamily) {
    await renderBadgeFamily(theme.key, target);
  }
}

await writeFile(
  path.join(outputRoot, "asset-build-manifest.json"),
  `${JSON.stringify({
    schemaVersion: 1,
    assets: results.map((result) => ({
      bytes: result.bytes,
      path: `/${path.relative(path.join(repositoryRoot, "apps/web/public"), result.file)}`,
      sha256: result.hash
    }))
  }, null, 2)}\n`
);

for (const result of results) {
  process.stdout.write(`${result.hash}  ${path.relative(repositoryRoot, result.file)}  ${result.bytes} bytes\n`);
}

async function renderBadgeFamily(themeKey, target) {
  const familySource = path.join(sourceRoot, "badges", themeKey);
  const familyTarget = path.join(target, "badges");
  const family = JSON.parse(await readFile(path.join(familySource, "family.json"), "utf8"));
  const entries = Array.isArray(family.badges) ? family.badges : [];
  await mkdir(familyTarget, { recursive: true });
  await copyFile(path.join(familySource, "family.json"), path.join(familyTarget, "family.json"));
  for (const entry of entries) {
    const key = entry.badge_key ?? entry.badgeKey;
    if (!key) continue;
    const source = path.join(familySource, `${key}.png`);
    await renderSet(source, familyTarget, key, [128, 256, 512, 1024], ["webp"]);
    const pngTarget = path.join(familyTarget, `${key}-1024.png`);
    await sharp(source)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "contain", withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: false })
      .toFile(pngTarget);
    const bytes = await readFile(pngTarget);
    results.push({
      file: pngTarget,
      bytes: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex")
    });
  }
}

async function renderSet(source, target, stem, widths, formats = ["webp", "avif"]) {
  for (const width of widths) {
    for (const format of formats) {
      const file = path.join(target, `${stem}-${width}.${format}`);
      const pipeline = sharp(source).rotate().resize({ width, withoutEnlargement: true });
      if (format === "webp") await pipeline.webp({ quality: 78, effort: 5, smartSubsample: true }).toFile(file);
      else await pipeline.avif({ quality: 55, effort: 5, chromaSubsampling: "4:2:0" }).toFile(file);
      const bytes = await readFile(file);
      results.push({ file, bytes: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
