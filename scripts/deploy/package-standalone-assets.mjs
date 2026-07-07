#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const webDir = join(repoRoot, "apps", "web");
const nextDir = join(webDir, ".next");
const standaloneWebDir = join(nextDir, "standalone", "apps", "web");
const standaloneNextDir = join(standaloneWebDir, ".next");
const sourceStaticDir = join(nextDir, "static");
const targetStaticDir = join(standaloneNextDir, "static");
const sourcePublicDir = join(webDir, "public");
const targetPublicDir = join(standaloneWebDir, "public");

assertPath(join(standaloneWebDir, "server.js"), "Next standalone server output is missing. Run `pnpm build` first.");
assertDirectory(sourceStaticDir, "Next static assets are missing. Run `pnpm build` first.");

mkdirSync(standaloneNextDir, { recursive: true });
replaceDirectory(sourceStaticDir, targetStaticDir);

if (existsSync(sourcePublicDir)) {
  replaceDirectory(sourcePublicDir, targetPublicDir);
}

assertDirectory(targetStaticDir, "Packaged standalone static assets are missing.");
assertHasAsset(join(targetStaticDir, "chunks"), [".js", ".css"], "Packaged standalone chunks do not contain JavaScript or CSS assets.");

console.log("[deploy:package-standalone-assets] Packaged .next/static and public assets for standalone runtime.");

function replaceDirectory(source, target) {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}

function assertPath(path, message) {
  if (!existsSync(path)) {
    fail(message);
  }
}

function assertDirectory(path, message) {
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    fail(message);
  }
}

function assertHasAsset(directory, extensions, message) {
  if (!existsSync(directory) || !containsAsset(directory, extensions)) {
    fail(message);
  }
}

function containsAsset(directory, extensions) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);

    if (entry.isDirectory() && containsAsset(path, extensions)) {
      return true;
    }

    if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      return true;
    }
  }

  return false;
}

function fail(message) {
  console.error(`[deploy:package-standalone-assets] ${message}`);
  process.exit(1);
}
