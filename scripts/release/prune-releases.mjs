#!/usr/bin/env node

import { lstatSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function pruneReleases({ baseDirectory, previousReleaseDirectory, retainCount = 5 }) {
  if (!Number.isInteger(retainCount) || retainCount < 1) throw new Error("Release retention must keep at least one recent release.");
  const releaseRoot = realpathSync(join(baseDirectory, "releases"));
  function pin(directory, label) {
    const resolved = realpathSync(directory);
    if (dirname(resolved) !== releaseRoot || !statSync(resolved).isDirectory()) {
      throw new Error(`${label} must be an existing release directly inside the configured release root.`);
    }
    return resolved;
  }
  // Validate both pins before considering any deletion. Newer failed candidate
  // folders must never push the last working application out of retention.
  const current = pin(join(baseDirectory, "current"), "Current application");
  const previous = pin(previousReleaseDirectory, "Previous application snapshot");
  const pinned = new Set([current, previous]);
  const ignored = [], candidates = [];
  for (const entry of readdirSync(releaseRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d{14}-[a-f0-9]{7}$/.test(entry.name)) {
      ignored.push(entry.name);
      continue;
    }
    const directory = join(releaseRoot, entry.name);
    candidates.push({ name: entry.name, directory, modifiedAt: statSync(directory).mtimeMs });
  }
  candidates.sort((a, b) => b.modifiedAt - a.modifiedAt || b.name.localeCompare(a.name));
  const recent = new Set(candidates.slice(0, retainCount).map((entry) => entry.directory));
  const removed = [], retained = [];
  for (const entry of candidates) {
    if (pinned.has(entry.directory) || recent.has(entry.directory)) {
      retained.push(entry.name);
      continue;
    }
    if (lstatSync(entry.directory).isSymbolicLink() || realpathSync(entry.directory) !== entry.directory) {
      throw new Error("A release path changed during pruning; refusing deletion.");
    }
    rmSync(entry.directory, { recursive: true });
    removed.push(entry.name);
  }
  return { current: basename(current), previous: basename(previous), retained, removed, ignored };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.BASE_DIR || !process.env.DEPLOYMENT_STATE_FILE) throw new Error("BASE_DIR and DEPLOYMENT_STATE_FILE are required for release pruning.");
  const snapshot = JSON.parse(readFileSync(process.env.DEPLOYMENT_STATE_FILE, "utf8"));
  const result = pruneReleases({ baseDirectory: process.env.BASE_DIR, previousReleaseDirectory: snapshot.releaseDirectory });
  console.log(`[deploy:prune] ${JSON.stringify(result)}`);
}
