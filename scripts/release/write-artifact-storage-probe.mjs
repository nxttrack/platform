#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.cwd(), "artifacts/artifact-storage-audit.json");
const evidence = {
  schemaVersion: 1,
  purpose: "nxttrack-release-artifact-storage-audit",
  repository: process.env.GITHUB_REPOSITORY || null,
  commitSha: process.env.GITHUB_SHA || null,
  runId: process.env.GITHUB_RUN_ID || null,
  createdAt: new Date().toISOString()
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o640 });
console.log(`[release:artifact-storage] Wrote non-sensitive probe to ${outputPath}.`);
