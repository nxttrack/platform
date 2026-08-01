import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const packageArgument = process.argv.slice(2).find((argument) => argument !== "--");
const packageRoot = path.resolve(packageArgument ?? "");
if (!packageRoot) {
  throw new Error("Pass the extracted NXTTRACK_five_theme_launch_v2.1 directory.");
}

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const masterRoot = path.join(repositoryRoot, "assets/portal-theme-masters");
const badgeRoot = path.join(masterRoot, "badges");

const files = [
  ["prototype/assets/default-dashboard-hero-v2.png", "nxttrack-default-dashboard.png"],
  ["prototype/assets/default-progress-hero-v2.png", "nxttrack-default-progress.png"],
  ["prototype/assets/ocean-dashboard-hero-v2.png", "ocean-quest-dashboard.png"],
  ["prototype/assets/ocean-dashboard-hero-mobile-v3.png", "ocean-quest-dashboard-mobile.png"],
  ["prototype/assets/ocean-journey-map.png", "ocean-quest-journey.png"],
  ["prototype/assets/ocean-journey-mobile-v3.png", "ocean-quest-journey-mobile.png"],
  ["prototype/assets/ocean-lesson-hero-v2.png", "ocean-quest-lesson.png"],
  ["prototype/assets/ocean-reward-hero-v2.png", "ocean-quest-reward.png"]
];

await mkdir(masterRoot, { recursive: true });
for (const [source, target] of files) {
  await copyFile(path.join(packageRoot, source), path.join(masterRoot, target));
}

for (const [theme, relativeRoot] of [
  ["ocean-quest", "prototype/assets/badges/ocean"],
  ["nxttrack-default", "prototype/theme-system-v2/assets/badges/nxttrack-default-medallions/1.0.0"]
]) {
  const sourceRoot = path.join(packageRoot, relativeRoot);
  const family = theme === "ocean-quest"
    ? JSON.parse(await readFile(path.join(packageRoot, "prototype/assets/badges/reference/badge-family.json"), "utf8"))
    : JSON.parse(await readFile(path.join(sourceRoot, "family.json"), "utf8"));
  const targetRoot = path.join(badgeRoot, theme);
  await mkdir(targetRoot, { recursive: true });
  const entries = badgeEntries(family);
  for (const entry of entries) {
    const sourceName = entry.file ?? entry.asset ?? entry.filename;
    const key = entry.badge_key ?? entry.badgeKey ?? entry.key ?? entry.id;
    if (!sourceName || !key) continue;
    await copyFile(path.join(sourceRoot, sourceName), path.join(targetRoot, `${key}.png`));
  }
  await copyFile(
    theme === "ocean-quest"
      ? path.join(packageRoot, "prototype/assets/badges/reference/badge-family.json")
      : path.join(sourceRoot, "family.json"),
    path.join(targetRoot, "family.json")
  );
}

process.stdout.write(`[themes:import] Imported handoff masters from ${packageRoot}\n`);

function badgeEntries(family) {
  for (const key of ["badges", "items", "assets"]) {
    if (Array.isArray(family[key])) return family[key];
  }
  return [];
}
