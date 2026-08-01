import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const requireFromWeb = createRequire(path.join(repositoryRoot, "apps/web/package.json"));
const sharp = requireFromWeb("sharp");
const sourceRoot = path.join(repositoryRoot, "assets/portal-theme-masters");
const outputRoot = path.join(repositoryRoot, "apps/web/public/portal-themes");

const themes = [
  { key: "nxttrack-default", landscape: "nxttrack-default-landscape.png" },
  { key: "ocean-quest", landscape: "ocean-quest-landscape.png", portrait: "ocean-quest-portrait.png" },
  { key: "dolphin-bay", landscape: "dolphin-bay-landscape.png", portrait: "dolphin-bay-portrait.png" },
  { key: "turtle-trails", landscape: "turtle-trails-landscape.png", portrait: "turtle-trails-portrait.png" },
  { key: "aqua-academy", landscape: "aqua-academy-landscape.png", portrait: "aqua-academy-portrait.png" }
];

const results = [];
for (const theme of themes) {
  const target = path.join(outputRoot, theme.key);
  await mkdir(target, { recursive: true });
  await renderSet(path.join(sourceRoot, theme.landscape), target, "overview-landscape", [640, 960, 1440, 1920]);
  if (theme.portrait) {
    await renderSet(path.join(sourceRoot, theme.portrait), target, "overview-portrait", [640, 960]);
  }
}

for (const result of results) {
  process.stdout.write(`${result.hash}  ${path.relative(repositoryRoot, result.file)}  ${result.bytes} bytes\n`);
}

async function renderSet(source, target, stem, widths) {
  for (const width of widths) {
    for (const format of ["webp", "avif"]) {
      const file = path.join(target, `${stem}-${width}.${format}`);
      const pipeline = sharp(source).rotate().resize({ width, withoutEnlargement: true });
      if (format === "webp") await pipeline.webp({ quality: 78, effort: 5, smartSubsample: true }).toFile(file);
      else await pipeline.avif({ quality: 55, effort: 5, chromaSubsampling: "4:2:0" }).toFile(file);
      const bytes = await readFile(file);
      results.push({ file, bytes: bytes.length, hash: createHash("sha256").update(bytes).digest("hex") });
    }
  }
}
