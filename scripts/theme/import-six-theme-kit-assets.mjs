import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageArgument = process.argv.slice(2).find((argument) => argument !== "--");
const packageRoot = path.resolve(packageArgument ?? "");
if (!packageRoot) {
  throw new Error("Pass the extracted nxttrack-theme-kit directory.");
}

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const masterRoot = path.join(repositoryRoot, "assets/portal-theme-masters");
const contractRoot = path.join(repositoryRoot, "contracts/parent-portal/theme-pack-v1");
const assetManifest = JSON.parse(
  await readFile(path.join(packageRoot, "manifests/asset-manifest.json"), "utf8")
);
const suppliedAssets = new Map(
  assetManifest.assets.map((asset) => [asset.path, asset])
);
const themes = [
  "nxttrack-default",
  "dolphin-bay",
  "turtle-trails",
  "polar-splash",
  "coastal-explorer",
  "nationaal-zwem-abc"
];

await mkdir(masterRoot, { recursive: true });
await mkdir(contractRoot, { recursive: true });

for (const theme of themes) {
  for (const role of ["journey-desktop", "journey-mobile", "mascot"]) {
    const relativeSource = `prototype/assets/themes/${theme}/${role}.png`;
    const expected = suppliedAssets.get(relativeSource);
    if (!expected) {
      if (role === "mascot") continue;
      throw new Error(`Required theme asset is absent from the signed manifest: ${relativeSource}`);
    }
    const source = path.join(packageRoot, relativeSource);
    const bytes = await readFile(source);
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expected.sha256 || bytes.byteLength !== expected.bytes) {
      throw new Error(`Theme asset checksum mismatch: ${relativeSource}`);
    }
    await copyFile(source, path.join(masterRoot, `${theme}-${role}.png`));
  }
}

for (const file of [
  "asset-manifest.json",
  "copy-snapshots.nl.json",
  "package-verification.json",
  "route-manifest.json",
  "screen-contracts.json",
  "theme-manifest.json"
]) {
  await copyFile(path.join(packageRoot, "manifests", file), path.join(contractRoot, file));
}
await mkdir(path.join(contractRoot, "schemas"), { recursive: true });
await copyFile(
  path.join(packageRoot, "manifests/schemas/theme-manifest.schema.json"),
  path.join(contractRoot, "schemas/theme-manifest.schema.json")
);

process.stdout.write(
  `[themes:import] Imported and checksum-verified ${themes.length} theme packs from ${packageRoot}\n`
);
