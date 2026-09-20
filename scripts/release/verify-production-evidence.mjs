#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const requiredStagingSteps = [
  "Phase 16 operational flow validation",
  "Validate required seven-theme parent and child portal matrix",
  "Sprint 4 intake-to-placement browser mutation",
  "Sprint 4 instructor browser mutations",
  "Sprint 4 parent self-service browser mutations",
  "Sprint 4 tenant-admin browser mutations",
  "Sprint 4 role and tenant isolation",
  "Sprint 4 accessibility and performance budgets",
  "Communicationhub and Badge Studio browser validation",
  "Premium release browser validation",
  "Capture Priority A staging visual evidence",
  "Phase 15 staging truth and security validation",
  "Write release evidence"
];

export async function verifyProductionEvidence(environment = process.env, fetcher = fetch) {
  const target = environment.RELEASE_TARGET || environment.TARGET || "";
  if (target !== "production") return [];
  const token = environment.GITHUB_TOKEN;
  const repository = environment.GITHUB_REPOSITORY;
  const sourceSha = (environment.GITHUB_SHA || "").toLowerCase();
  const evidenceRuns = [
    { id: environment.PRODUCTION_FOUNDATION_RUN_ID, label: "foundation audit", workflowPath: ".github/workflows/production-foundation-audit.yml" },
    { id: environment.PRODUCTION_MIGRATION_REHEARSAL_RUN_ID, label: "migration rehearsal", workflowPath: ".github/workflows/production-migration-rehearsal.yml" },
    { id: environment.STAGING_RELEASE_RUN_ID, label: "staging release", workflowPath: ".github/workflows/deploy.yml" }
  ];
  if (!token) throw new Error("GITHUB_TOKEN is required to verify production evidence.");
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) throw new Error("GITHUB_REPOSITORY must identify owner/repository.");
  if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("GITHUB_SHA must be a full commit SHA.");
  for (const evidence of evidenceRuns) {
    if (!/^\d+$/.test(evidence.id || "")) throw new Error(`A numeric run ID is required for the production ${evidence.label}.`);
  }

  async function get(path) {
    const response = await fetcher(`https://api.github.com/repos/${repository}${path}`, {
      headers: {
        accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
        "user-agent": "nxttrack-production-evidence-verifier", "x-github-api-version": "2022-11-28"
      },
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) throw new Error(`Could not read Actions evidence; GitHub returned HTTP ${response.status}.`);
    return response.json();
  }

  for (const evidence of evidenceRuns) {
    const run = await get(`/actions/runs/${evidence.id}`);
    if (run.status !== "completed" || run.conclusion !== "success") throw new Error(`Production ${evidence.label} run ${evidence.id} did not conclude successfully.`);
    if ((run.head_sha || "").toLowerCase() !== sourceSha) throw new Error(`Production ${evidence.label} run ${evidence.id} does not prove source SHA ${sourceSha}.`);
    if (run.head_branch !== "main") throw new Error(`Production ${evidence.label} run ${evidence.id} did not run from main.`);
    if (run.event !== "workflow_dispatch") throw new Error(`Production ${evidence.label} run ${evidence.id} was not manually dispatched.`);
    if ((run.path || "").split("@")[0] !== evidence.workflowPath) throw new Error(`Run ${evidence.id} is not the expected ${evidence.label} workflow.`);

    if (evidence.label === "staging release") {
      if (!Number.isInteger(run.run_attempt) || run.run_attempt < 1) throw new Error("Staging evidence has no valid run attempt.");
      const jobs = [];
      for (let page = 1; ; page += 1) {
        if (page > 10) throw new Error("Staging evidence has too many jobs to verify safely.");
        const result = await get(`/actions/runs/${evidence.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`);
        if (!Array.isArray(result.jobs)) throw new Error("Staging evidence has no job list.");
        jobs.push(...result.jobs);
        if (result.jobs.length < 100) break;
      }
      for (const [jobName, steps] of [
        ["deploy", ["Assert canonical release source", "Health endpoint smoke", "Runtime smoke"]],
        ["staging browser validation", requiredStagingSteps]
      ]) {
        const matching = jobs.filter((job) => job.name === jobName);
        if (matching.length !== 1 || matching[0].status !== "completed" || matching[0].conclusion !== "success") {
          throw new Error(`Staging ${jobName} job must have completed successfully.`);
        }
        for (const stepName of steps) {
          const matches = (matching[0].steps || []).filter((step) => step.name === stepName);
          if (matches.length !== 1 || matches[0].conclusion !== "success" || matches[0].status !== "completed") {
            throw new Error(`Staging gate '${stepName}' must have run successfully; skipped gates are not release evidence.`);
          }
        }
      }
    }
  }
  return evidenceRuns.map(({ id, label }) => ({ id, label, sourceSha }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = await verifyProductionEvidence();
    for (const item of evidence) console.log(`[production:evidence] PASS ${item.label} run=${item.id} sha=${item.sourceSha}.`);
    console.log(evidence.length ? "[production:evidence] PASS exact-SHA staging and production evidence." : "[production:evidence] Non-production target; evidence verification is not required.");
  } catch (error) {
    console.error(`[production:evidence] FAIL ${error.message}`);
    process.exitCode = 1;
  }
}
