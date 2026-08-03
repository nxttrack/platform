import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const sourceRoot = path.join(repositoryRoot, "assets/portal-theme-masters");
const outputRoot = path.join(repositoryRoot, "apps/web/public/portal-themes");

const themes = [
  { key: "nxttrack-default", mascot: false },
  { key: "dolphin-bay", mascot: true },
  { key: "turtle-trails", mascot: true },
  { key: "polar-splash", mascot: true },
  { key: "coastal-explorer", mascot: true },
  { key: "nationaal-zwem-abc", mascot: false }
];

const results = [];
for (const theme of themes) {
  const target = path.join(outputRoot, theme.key);
  await mkdir(target, { recursive: true });
  for (const role of ["journey-desktop", "journey-mobile", ...(theme.mascot ? ["mascot"] : [])]) {
    const source = path.join(sourceRoot, `${theme.key}-${role}.png`);
    const file = path.join(target, `${role}.png`);
    await copyFile(source, file);
    const bytes = await readFile(file);
    results.push({
      file,
      bytes: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex")
    });
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

process.stdout.write(`[themes:build] Published ${results.length} checksum-locked PNG assets.\n`);
