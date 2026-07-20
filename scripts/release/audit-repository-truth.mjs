#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const canonicalBranch = process.env.RELEASE_CANONICAL_BRANCH || "main";
const failures = [];
const warnings = [];

checkFile("README.md");
checkFile("docs/PHASE_0_REPO_INFRA.md");
checkFile(".github/workflows/deploy.yml");

const readme = read("README.md");
const phaseZero = read("docs/PHASE_0_REPO_INFRA.md");
const deployWorkflow = read(".github/workflows/deploy.yml");

requireText(readme, `Canonical implementation and release branch: \`${canonicalBranch}\``, "README does not declare the canonical release branch.");
requireText(phaseZero, `Canonical implementation branch: \`${canonicalBranch}\``, "Phase 0 does not lock the canonical implementation branch.");
requireText(deployWorkflow, "workflow_dispatch:", "Deploy workflow is not manually dispatched.");
requireText(deployWorkflow, "github.ref_name == 'main'", "Deploy workflow does not restrict releases to main.");
requireText(deployWorkflow, "PRODUCTION_RELEASE_CONFIRMATION", "Deploy workflow has no explicit production confirmation contract.");

if (/\bpush:\s*[\s\S]{0,240}\b(?:staging|production)\b/.test(deployWorkflow)) {
  failures.push("Deploy workflow still contains a push-triggered staging/production release path.");
}

const currentBranch = git(["branch", "--show-current"]) || process.env.GITHUB_HEAD_REF || "detached";
const currentSha = git(["rev-parse", "HEAD"]);

console.log(`[release:truth] canonical=${canonicalBranch} current=${currentBranch} sha=${currentSha.slice(0, 12)}`);

for (const branch of ["main", "staging", "production"]) {
  reportBranch(branch);
}

if (warnings.length > 0) {
  console.warn("[release:truth] Warnings:");

  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error("[release:truth] Repository truth audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[release:truth] PASS Canonical source and release invariants are explicit.");

function reportBranch(branch) {
  const ref = `refs/remotes/origin/${branch}`;

  if (!gitOk(["show-ref", "--verify", "--quiet", ref])) {
    warnings.push(`origin/${branch} is not available locally; divergence was not measured.`);
    return;
  }

  const [ahead = "0", behind = "0"] = git(["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`]).split(/\s+/);
  const branchSha = git(["rev-parse", `origin/${branch}`]).slice(0, 12);

  console.log(`[release:truth] origin/${branch} sha=${branchSha} head-only=${ahead} branch-only=${behind}`);

  if (branch !== canonicalBranch && Number(behind) > 0) {
    warnings.push(`origin/${branch} contains ${behind} commit(s) outside the current canonical history; do not merge it wholesale.`);
  }
}

function checkFile(relativePath) {
  if (!existsSync(join(repoRoot, relativePath))) {
    failures.push(`Missing required repository truth file: ${relativePath}`);
  }
}

function read(relativePath) {
  const path = join(repoRoot, relativePath);

  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function requireText(content, expected, message) {
  if (!content.includes(expected)) {
    failures.push(message);
  }
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function gitOk(args) {
  try {
    execFileSync("git", args, { cwd: repoRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
