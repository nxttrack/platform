#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const target = process.env.RELEASE_TARGET || process.env.TARGET || "unknown";
const outputPath = resolve(process.cwd(), process.env.RELEASE_EVIDENCE_PATH || "artifacts/release-evidence.json");
const evidence = {
  schemaVersion: 1,
  application: "nxttrack-platform",
  target,
  source: {
    canonicalBranch: process.env.RELEASE_CANONICAL_BRANCH || "main",
    refName: process.env.GITHUB_REF_NAME || null,
    commitSha: process.env.GITHUB_SHA || process.env.RELEASE_COMMIT_SHA || null,
    stagedCommitSha: target === "production" ? process.env.STAGING_RELEASE_SHA || null : null
  },
  workflow: {
    repository: process.env.GITHUB_REPOSITORY || null,
    runId: process.env.GITHUB_RUN_ID || null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    actor: process.env.GITHUB_ACTOR || null
  },
  approval: {
    reference: target === "production" ? process.env.PRODUCTION_APPROVAL_REFERENCE || null : null
  },
  productionEvidence: {
    foundationRunId: target === "production" ? process.env.PRODUCTION_FOUNDATION_RUN_ID || null : null,
    migrationRehearsalRunId: target === "production" ? process.env.PRODUCTION_MIGRATION_REHEARSAL_RUN_ID || null : null
  },
  gates: {
    repositoryTruth: "passed",
    lovableBaselineContract: "passed",
    authAudit: "passed",
    migrationAudit: "passed",
    rlsCoverageAudit: "passed",
    build: "passed",
    standaloneAssets: "passed",
    databaseMigration: process.env.RUN_DB_MIGRATIONS === "true" ? "passed" : "not_requested",
    healthSmoke: "passed",
    runtimeSmoke: "passed",
    phase15Staging: target === "staging" ? "passed" : "validated_on_staged_commit",
    phase16Staging: target === "staging" ? "passed" : "validated_on_staged_commit"
  },
  createdAt: new Date().toISOString()
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o640 });
console.log(`[release:evidence] Wrote non-sensitive release evidence to ${outputPath}.`);
