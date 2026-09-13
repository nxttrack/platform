import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { access, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const publicRoot = path.join(repositoryRoot, "apps/web/public");
const themeRoot = path.join(publicRoot, "portal-themes");
const manifestPath = path.join(themeRoot, "rendition-manifest.json");
const requireFromWeb = createRequire(path.join(repositoryRoot, "apps/web/package.json"));
const sharp = requireFromWeb("sharp");
const previousManifest = await readJsonIfPresent(manifestPath);
const previousByPath = new Map((previousManifest?.assets ?? []).map((asset) => [asset.path, asset]));

const outputSpecs = [
  { source: "journey-desktop.png", stem: "progress-journey-landscape", widths: [640, 960, 1440, 1920] },
  { source: "journey-mobile.png", stem: "progress-journey-portrait", widths: [640, 960] },
  { source: "mascot.png", stem: "mascot", widths: [256, 512] }
];
const themeKeys = (await readdir(themeRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const assets = [];

for (const themeKey of themeKeys) {
  const directory = path.join(themeRoot, themeKey);
  for (const spec of outputSpecs) {
    const source = path.join(directory, spec.source);
    if (!await exists(source)) continue;
    const sourceBytes = await readFile(source);
    const sourceSha256 = sha256(sourceBytes);
    for (const width of spec.widths) {
      for (const format of ["avif", "webp"]) {
        const target = path.join(directory, `${spec.stem}-${width}.${format}`);
        const publicPath = `/${path.relative(publicRoot, target)}`;
        if (!await exists(target)) {
          const pipeline = sharp(source).resize({ width, withoutEnlargement: true });
          if (format === "avif") await pipeline.avif({ effort: 6, quality: 64 }).toFile(target);
          else await pipeline.webp({ effort: 6, quality: 78 }).toFile(target);
        }
        const targetBytes = await readFile(target);
        const targetSha256 = sha256(targetBytes);
        const previous = previousByPath.get(publicPath);
        if (previous && (previous.sourceSha256 !== sourceSha256 || previous.sha256 !== targetSha256)) {
          throw new Error(`Immutable rendition or source changed without a versioned rebuild: ${publicPath}`);
        }
        assets.push({
          bytes: (await stat(target)).size,
          path: publicPath,
          sha256: targetSha256,
          sourcePath: `/${path.relative(publicRoot, source)}`,
          sourceSha256,
          width
        });
      }
    }
  }
}

await writeFile(
  manifestPath,
  `${JSON.stringify({ schemaVersion: 1, immutableSources: true, assets }, null, 2)}\n`
);

process.stdout.write(`[themes:renditions] Verified ${assets.length} responsive scenery renditions without rewriting source artwork.\n`);

async function exists(file) {
  return access(file).then(() => true).catch(() => false);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJsonIfPresent(file) {
  if (!await exists(file)) return null;
  return JSON.parse(await readFile(file, "utf8"));
}
