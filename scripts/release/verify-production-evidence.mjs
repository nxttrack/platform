#!/usr/bin/env node

const target = process.env.RELEASE_TARGET || process.env.TARGET || "";

if (target !== "production") {
  console.log("[production:evidence] Non-production target; evidence verification is not required.");
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const sourceSha = (process.env.GITHUB_SHA || "").toLowerCase();
const evidenceRuns = [
  {
    id: process.env.PRODUCTION_FOUNDATION_RUN_ID,
    label: "foundation audit",
    workflowPath: ".github/workflows/production-foundation-audit.yml"
  },
  {
    id: process.env.PRODUCTION_MIGRATION_REHEARSAL_RUN_ID,
    label: "migration rehearsal",
    workflowPath: ".github/workflows/production-migration-rehearsal.yml"
  }
];
const failures = [];

if (!token) failures.push("GITHUB_TOKEN is required to verify production evidence.");
if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) failures.push("GITHUB_REPOSITORY must identify owner/repository.");
if (!/^[a-f0-9]{40}$/.test(sourceSha)) failures.push("GITHUB_SHA must be a full commit SHA.");

for (const evidence of evidenceRuns) {
  if (!/^\d+$/.test(evidence.id || "")) {
    failures.push(`A numeric run ID is required for the production ${evidence.label}.`);
  }
}

if (failures.length === 0) {
  for (const evidence of evidenceRuns) {
    const run = await fetchRun(evidence.id);

    if (!run) continue;
    if (run.conclusion !== "success") failures.push(`Production ${evidence.label} run ${evidence.id} did not conclude successfully.`);
    if ((run.head_sha || "").toLowerCase() !== sourceSha) failures.push(`Production ${evidence.label} run ${evidence.id} does not prove source SHA ${sourceSha}.`);
    if (run.head_branch !== "main") failures.push(`Production ${evidence.label} run ${evidence.id} did not run from main.`);
    if (run.event !== "workflow_dispatch") failures.push(`Production ${evidence.label} run ${evidence.id} was not manually dispatched.`);

    const path = (run.path || "").split("@")[0];
    if (path !== evidence.workflowPath) failures.push(`Run ${evidence.id} is not the expected ${evidence.label} workflow.`);

    if (
      run.conclusion === "success" &&
      (run.head_sha || "").toLowerCase() === sourceSha &&
      run.head_branch === "main" &&
      run.event === "workflow_dispatch" &&
      path === evidence.workflowPath
    ) {
      console.log(`[production:evidence] PASS ${evidence.label} run=${evidence.id} sha=${sourceSha}.`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[production:evidence] FAIL ${failure}`);
  process.exit(1);
}

console.log("[production:evidence] PASS required production foundation evidence is current and successful.");

async function fetchRun(runId) {
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "nxttrack-production-evidence-verifier",
      "x-github-api-version": "2022-11-28"
    }
  });

  if (!response.ok) {
    failures.push(`Could not read Actions run ${runId}; GitHub returned HTTP ${response.status}.`);
    return null;
  }

  return response.json();
}
