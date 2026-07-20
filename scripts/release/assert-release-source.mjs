#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const target = process.env.RELEASE_TARGET || process.env.TARGET || "";
const canonicalBranch = process.env.RELEASE_CANONICAL_BRANCH || "main";
const sourceBranch = process.env.GITHUB_REF_NAME || currentBranch();
const sourceSha = (process.env.GITHUB_SHA || gitSha()).toLowerCase();
const failures = [];

if (!["staging", "production"].includes(target)) {
  failures.push("RELEASE_TARGET must be staging or production.");
}

if (sourceBranch !== canonicalBranch) {
  failures.push(`Releases must originate from ${canonicalBranch}; received ${sourceBranch || "unknown"}.`);
}

if (!/^[a-f0-9]{40}$/.test(sourceSha)) {
  failures.push("A full 40-character release commit SHA is required.");
}

if (target === "production") {
  const stagedSha = (process.env.STAGING_RELEASE_SHA || "").trim().toLowerCase();
  const confirmation = process.env.PRODUCTION_RELEASE_CONFIRMATION || "";

  if (confirmation !== "PROMOTE_PRODUCTION") {
    failures.push("Production requires PRODUCTION_RELEASE_CONFIRMATION=PROMOTE_PRODUCTION.");
  }

  if (!/^[a-f0-9]{40}$/.test(stagedSha)) {
    failures.push("Production requires the full validated STAGING_RELEASE_SHA.");
  } else if (stagedSha !== sourceSha) {
    failures.push(`Production source ${sourceSha} differs from validated staging commit ${stagedSha}.`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[release:source] FAIL ${failure}`);
  }

  process.exit(1);
}

console.log(`[release:source] PASS target=${target} branch=${sourceBranch} sha=${sourceSha}.`);

function currentBranch() {
  return runGit(["branch", "--show-current"]);
}

function gitSha() {
  return runGit(["rev-parse", "HEAD"]);
}

function runGit(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}
