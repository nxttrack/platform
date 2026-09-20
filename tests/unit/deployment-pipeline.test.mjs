import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { maintenanceEnvironment, publishDeploymentEnvironment } from "../../scripts/release/deployment-environment.mjs";
import { requiredStagingSteps, verifyProductionEvidence } from "../../scripts/release/verify-production-evidence.mjs";

const sha = "a".repeat(40);
const nextSha = "b".repeat(40);
const environment = {
  RELEASE_TARGET: "production", GITHUB_TOKEN: "test-only", GITHUB_REPOSITORY: "example/release",
  GITHUB_SHA: sha, STAGING_RELEASE_RUN_ID: "3", PRODUCTION_FOUNDATION_RUN_ID: "1", PRODUCTION_MIGRATION_REHEARSAL_RUN_ID: "2"
};
function fixture() {
  const makeStep = (name) => ({ name, status: "completed", conclusion: "success" });
  const common = { status: "completed", conclusion: "success", head_sha: sha, head_branch: "main", event: "workflow_dispatch", run_attempt: 2 };
  const runs = {
    "1": { ...common, path: ".github/workflows/production-foundation-audit.yml" },
    "2": { ...common, path: ".github/workflows/production-migration-rehearsal.yml" },
    "3": { ...common, path: ".github/workflows/deploy.yml" }
  };
  const jobs = [
    { name: "deploy", status: "completed", conclusion: "success", steps: ["Assert canonical release source", "Health endpoint smoke", "Runtime smoke"].map(makeStep) },
    { name: "staging browser validation", status: "completed", conclusion: "success", steps: requiredStagingSteps.map(makeStep) }
  ];
  const calls = [];
  return { runs, jobs, calls, fetcher: async (url) => {
    calls.push(url);
    const match = /\/actions\/runs\/(\d+)(.*)$/.exec(url);
    assert.ok(match, "Only repository run evidence is fetched");
    if (match[2]) assert.equal(match[2], "/attempts/2/jobs?per_page=100&page=1", "Jobs belong to the successful attempt");
    return { ok: true, json: async () => match[2] ? { jobs } : runs[match[1]] };
  }};
}

test("production requires exact-SHA deploy and full staging validation from the successful attempt", async () => {
  const data = fixture();
  assert.equal((await verifyProductionEvidence(environment, data.fetcher)).length, 3);
  assert.equal(data.calls.length, 4);
});

test("staging does not need production credentials or evidence", async () => {
  assert.deepEqual(await verifyProductionEvidence({ RELEASE_TARGET: "staging" }, () => assert.fail("No request expected")), []);
});

test("production refuses absent staging run and misleading successful runs", async () => {
  await assert.rejects(verifyProductionEvidence({ ...environment, STAGING_RELEASE_RUN_ID: "" }, () => assert.fail()), /staging release/);
  for (const mutation of [
    (data) => { data.runs["3"].head_sha = nextSha; },
    (data) => { data.runs["3"].head_branch = "feature"; },
    (data) => { data.runs["3"].conclusion = "failure"; },
    (data) => { data.runs["3"].path = ".github/workflows/ci.yml"; },
    (data) => { data.jobs[1].conclusion = "skipped"; },
    (data) => { data.jobs.splice(1, 1); },
    (data) => { data.jobs[1].steps[0].conclusion = "skipped"; },
    (data) => { data.jobs[1].steps.pop(); }
  ]) {
    const data = fixture();
    mutation(data);
    await assert.rejects(verifyProductionEvidence(environment, data.fetcher));
  }
});

test("network denial fails closed without exposing the bearer token", async () => {
  await assert.rejects(verifyProductionEvidence(environment, async () => ({ ok: false, status: 403 })), /HTTP 403/);
});

function environmentFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "nxttrack-deploy-env-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const original = `RELEASE_COMMIT_SHA=${sha}\nMAINTENANCE_NO_WRITE=false\nEMAIL_SENDING_ENABLED=true\nNEWSLETTER_DELIVERY_ENABLED=false\nINTERNAL_JOBS_ENABLED=true\nSESSION_SECRET=test-original\n`;
  const candidate = original.replace(sha, nextSha).replace("test-original", "test-candidate");
  const args = { sharedPath: join(root, ".env"), snapshotPath: join(root, "previous.env"), candidatePath: join(root, "candidate.env"), previousSha: sha, candidateSha: nextSha };
  writeFileSync(args.sharedPath, original);
  writeFileSync(args.snapshotPath, original, { mode: 0o600 });
  writeFileSync(args.candidatePath, candidate, { mode: 0o600 });
  return { root, args, original, candidate };
}

test("preparing a candidate leaves live config unchanged until atomic activation", (t) => {
  const { root, args, original, candidate } = environmentFixture(t);
  assert.equal(readFileSync(args.sharedPath, "utf8"), original);
  publishDeploymentEnvironment({ ...args, mode: "activate" });
  assert.equal(readFileSync(args.sharedPath, "utf8"), candidate);
  assert.equal(readFileSync(args.snapshotPath, "utf8"), original);
  assert.equal(statSync(args.sharedPath).mode & 0o777, 0o640);
  assert.equal(readdirSync(root).filter((file) => file.startsWith(".env.publish-")).length, 0);
});

test("migration containment retains old identity and disables every writer before activation", (t) => {
  const { args, original, candidate } = environmentFixture(t);
  publishDeploymentEnvironment({ ...args, mode: "maintenance" });
  const live = readFileSync(args.sharedPath, "utf8");
  assert.equal(live, maintenanceEnvironment(original));
  assert.match(live, new RegExp(`RELEASE_COMMIT_SHA=${sha}`));
  for (const name of ["EMAIL_SENDING_ENABLED", "NEWSLETTER_DELIVERY_ENABLED", "INTERNAL_JOBS_ENABLED"]) assert.match(live, new RegExp(`${name}=false`));
  assert.match(live, /MAINTENANCE_NO_WRITE=true/);
  assert.match(live, /SESSION_SECRET=test-original/);
  // An aborted migration keeps containment and the original snapshot. There is
  // deliberately no automatic activation/rollback following a schema change.
  assert.equal(readFileSync(args.snapshotPath, "utf8"), original);
  publishDeploymentEnvironment({ ...args, mode: "activate" });
  assert.equal(readFileSync(args.sharedPath, "utf8"), candidate);
});

test("concurrent config changes and mismatched identities are rejected without writes", (t) => {
  const { args, original } = environmentFixture(t);
  const changed = `${original}OPERATOR_CHANGE=true\n`;
  writeFileSync(args.sharedPath, changed);
  assert.throws(() => publishDeploymentEnvironment({ ...args, mode: "activate" }), /changed after/);
  assert.equal(readFileSync(args.sharedPath, "utf8"), changed);
  writeFileSync(args.sharedPath, original);
  assert.throws(() => publishDeploymentEnvironment({ ...args, candidateSha: sha, mode: "activate" }), /Candidate environment/);
  assert.throws(() => publishDeploymentEnvironment({ ...args, previousSha: nextSha, mode: "maintenance" }), /snapshot/);
  assert.equal(readFileSync(args.sharedPath, "utf8"), original);
});
