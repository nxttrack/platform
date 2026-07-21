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
checkFile(".github/workflows/production-foundation-audit.yml");
checkFile(".github/workflows/production-migration-rehearsal.yml");
checkFile(".github/workflows/communications-foundation-audit.yml");
checkFile(".github/workflows/operational-monitor.yml");
checkFile("docs/DEFERRED_CONFIGURATION.md");
checkFile("docs/SPRINT_04_FULL_JOURNEY_QUALITY_SECURITY.md");
checkFile("apps/web/tests/e2e/sprint4-mutations.spec.ts");
checkFile("scripts/staging/prepare-sprint4-offer-edges.mjs");

const readme = read("README.md");
const phaseZero = read("docs/PHASE_0_REPO_INFRA.md");
const deployWorkflow = read(".github/workflows/deploy.yml");
const productionAuditWorkflow = read(".github/workflows/production-foundation-audit.yml");
const productionMigrationRehearsal = read(".github/workflows/production-migration-rehearsal.yml");
const communicationsAuditWorkflow = read(".github/workflows/communications-foundation-audit.yml");
const operationalMonitorWorkflow = read(".github/workflows/operational-monitor.yml");

requireText(readme, `Canonical implementation and release branch: \`${canonicalBranch}\``, "README does not declare the canonical release branch.");
requireText(phaseZero, `Canonical implementation branch: \`${canonicalBranch}\``, "Phase 0 does not lock the canonical implementation branch.");
requireText(deployWorkflow, "workflow_dispatch:", "Deploy workflow is not manually dispatched.");
requireText(deployWorkflow, "github.ref_name == 'main'", "Deploy workflow does not restrict releases to main.");
requireText(deployWorkflow, "PRODUCTION_RELEASE_CONFIRMATION", "Deploy workflow has no explicit production confirmation contract.");
requireText(deployWorkflow, "PRODUCTION_APPROVAL_REFERENCE", "Deploy workflow has no recorded production approval reference contract.");
requireText(deployWorkflow, "verify-production-evidence.mjs", "Deploy workflow does not verify successful SHA-bound production foundation evidence.");
requireText(deployWorkflow, "PRODUCTION_MIGRATION_REHEARSAL_RUN_ID", "Deploy workflow does not require production migration rehearsal evidence.");
requireText(deployWorkflow, "sprint4:prepare-mutations", "Deploy workflow does not prepare bounded Sprint 4 mutation fixtures.");
requireText(deployWorkflow, "sprint4:prepare-offer-edges", "Deploy workflow does not prepare bounded Sprint 4 offer-edge fixtures.");
requireText(deployWorkflow, "sprint4:test-mutations", "Deploy workflow does not run the browser-driven Sprint 4 mutation journey.");
requireText(productionAuditWorkflow, "AUDIT_PRODUCTION_FOUNDATION", "Production foundation audit has no explicit read-only confirmation contract.");
requireText(productionAuditWorkflow, "audit-production-foundation.mjs", "Production foundation workflow does not run the environment contract audit.");
requireText(productionAuditWorkflow, "audit-production-host.sh", "Production foundation workflow does not run the host audit.");
requireText(productionAuditWorkflow, "db:inventory-production-read-only", "Production foundation workflow does not run the read-only database inventory.");
requireText(productionMigrationRehearsal, "REHEARSE_PRODUCTION_MIGRATIONS", "Production migration rehearsal has no explicit confirmation contract.");
requireText(productionMigrationRehearsal, 'DB_MIGRATE_DRY_RUN: "true"', "Production migration rehearsal is not locked to dry-run mode.");
requireText(productionMigrationRehearsal, "BEFORE_FINGERPRINT", "Production migration rehearsal does not prove an unchanged database fingerprint.");
requireText(communicationsAuditWorkflow, "AUDIT_COMMUNICATIONS_FOUNDATION", "Communications foundation audit has no explicit confirmation contract.");
requireText(communicationsAuditWorkflow, "operations:audit-communications", "Communications foundation workflow does not run the non-sending audit.");
requireText(operationalMonitorWorkflow, "MONITORING_ENABLED", "Operational monitor is not protected by an explicit enable switch.");
requireText(operationalMonitorWorkflow, "SEND_SYNTHETIC_ALERT", "Operational monitor has no explicit synthetic-alert confirmation contract.");
requireText(operationalMonitorWorkflow, "operations:monitor", "Operational monitor workflow does not run the canonical monitor.");

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
