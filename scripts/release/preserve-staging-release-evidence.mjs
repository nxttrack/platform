#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, chownSync, existsSync, linkSync, lstatSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { requiredStagingSteps } from "./verify-production-evidence.mjs";

function expect(condition, message) { if (!condition) throw new Error(message); }
function within(value, job) {
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) && timestamp >= Date.parse(job.started_at) && timestamp <= Date.parse(job.completed_at);
}

export function validateStagingRun(run, jobs, { repository, sourceSha, runId }) {
  expect(String(run.id) === String(runId) && run.head_sha === sourceSha && run.head_branch === "main"
    && run.event === "workflow_dispatch" && (run.path || "").split("@")[0] === ".github/workflows/deploy.yml",
  "Staging evidence must originate from the exact canonical deploy run.");
  expect(run.repository?.full_name === repository, "Staging run belongs to a different repository.");
  expect(Number.isInteger(run.run_attempt) && run.run_attempt > 0, "Staging run attempt is invalid.");
  // The new persistence job runs after both gates, while its own parent workflow
  // is still in progress. Historical recovery also accepts a completed success.
  expect((run.status === "in_progress" && run.conclusion === null)
    || (run.status === "completed" && run.conclusion === "success"), "Staging deploy run is not successful or awaiting evidence persistence.");
  const verified = {};
  for (const [name, required] of [
    ["deploy", ["Assert canonical release source", "Persist immutable release identity", "Health endpoint smoke", "Runtime smoke"]],
    ["staging browser validation", requiredStagingSteps]
  ]) {
    const matches = jobs.filter((job) => job.name === name);
    expect(matches.length === 1 && matches[0].status === "completed" && matches[0].conclusion === "success", `Staging ${name} must be successful before preserving evidence.`);
    const job = matches[0];
    expect(Number.isFinite(Date.parse(job.started_at)) && Number.isFinite(Date.parse(job.completed_at)), "Staging job timing is missing.");
    for (const stepName of required) {
      const steps = (job.steps || []).filter((step) => step.name === stepName);
      expect(steps.length === 1 && steps[0].status === "completed" && steps[0].conclusion === "success", `Staging gate '${stepName}' is missing, skipped or failed.`);
    }
    verified[name] = job;
  }
  return verified;
}

export function validateStagingEvidence(contents, exactContents, run, jobs, expected) {
  const verified = validateStagingRun(run, jobs, expected);
  const evidence = JSON.parse(contents.toString("utf8")), exact = JSON.parse(exactContents.toString("utf8"));
  expect(evidence.schemaVersion === 1 && evidence.application === "nxttrack-platform" && evidence.target === "staging", "Release evidence is not a staging application artifact.");
  expect(evidence.source?.commitSha === expected.sourceSha && evidence.source?.canonicalBranch === "main" && evidence.source?.refName === "main", "Release evidence source does not match the canonical candidate.");
  expect(evidence.workflow?.repository === expected.repository && String(evidence.workflow?.runId) === String(expected.runId)
    && String(evidence.workflow?.runAttempt) === String(run.run_attempt), "Release evidence workflow or attempt does not match its verified origin.");
  for (const name of ["repositoryTruth", "lovableBaselineContract", "authAudit", "migrationAudit", "rlsCoverageAudit", "build", "standaloneAssets", "healthSmoke", "runtimeSmoke", "phase15Staging", "phase16Staging"]) {
    expect(evidence.gates?.[name] === "passed", `Release evidence does not record a passed ${name} gate.`);
  }
  expect(["passed", "not_requested"].includes(evidence.gates?.databaseMigration), "Release evidence has an invalid migration result.");
  expect(within(evidence.createdAt, verified["staging browser validation"]), "Release evidence timestamp is outside its verified browser job.");
  validateExactIdentity(exact, expected);
  expect(within(exact.createdAt, verified["staging browser validation"]), "Downloaded identity timestamp is outside its verified browser job.");
  return verified;
}

function validateExactIdentity(identity, { repository, sourceSha, runId }) {
  expect(identity.schemaVersion === 1 && identity.purpose === "nxttrack-exact-source-sha" && identity.repository === repository
    && identity.commitSha === sourceSha && identity.refName === "main" && String(identity.workflowRunId) === String(runId), "Immutable release identity does not match the verified run and source.");
}

export function readEvidenceArchive(archive, expectedDigest, execute = execFileSync) {
  expect(archive.length <= 2 * 1024 * 1024 && /^sha256:[a-f0-9]{64}$/.test(expectedDigest || ""), "Release evidence archive size or digest is invalid.");
  expect(`sha256:${createHash("sha256").update(archive).digest("hex")}` === expectedDigest, "Downloaded evidence archive does not match the GitHub artifact digest.");
  // Python's standard ZIP reader checks the CRC and supports GitHub's ZIP/ZIP64
  // variants. No filesystem extraction, path traversal or unbounded inflation.
  const source = `import base64,io,json,sys,zipfile
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
expected={'release-evidence.json','exact-source-sha.json'}
entries=z.infolist()
if len(entries)!=2 or {i.filename for i in entries}!=expected: raise ValueError('Unexpected evidence archive members')
if any(i.file_size>65536 or i.flag_bits&1 for i in entries): raise ValueError('Invalid evidence archive entry')
print(json.dumps({i.filename:base64.b64encode(z.read(i)).decode('ascii') for i in entries}))
`;
  let decoded;
  try { decoded = JSON.parse(execute("python3", ["-c", source], { input: archive, encoding: "utf8", maxBuffer: 256 * 1024, stdio: ["pipe", "pipe", "pipe"] })); }
  catch { throw new Error("Could not validate the two-file release evidence ZIP; Python 3 is required."); }
  return { evidence: Buffer.from(decoded["release-evidence.json"], "base64"), exact: Buffer.from(decoded["exact-source-sha.json"], "base64") };
}

export function persistStagingEvidence({ baseDirectory, releaseDirectory, evidence, exact, run, jobs, repository, sourceSha, runId }) {
  const expected = { repository, sourceSha, runId };
  const verified = validateStagingEvidence(evidence, exact, run, jobs, expected);
  const releaseRoot = realpathSync(join(baseDirectory, "releases")), release = realpathSync(releaseDirectory);
  expect(dirname(release) === releaseRoot && statSync(release).isDirectory(), "Evidence destination must be a release directly inside this staging deployment.");
  const artifactDirectory = realpathSync(join(release, "artifacts"));
  expect(artifactDirectory === join(release, "artifacts"), "Evidence artifact directory cannot redirect outside its release.");
  expect(existsSync(join(release, "apps/web/.next/standalone/apps/web/server.js")), "Evidence destination has no packaged application server.");
  const identityPath = join(artifactDirectory, "exact-source-sha.json");
  expect(lstatSync(identityPath).isFile(), "Existing immutable release identity must be a regular file.");
  const identity = JSON.parse(readFileSync(identityPath, "utf8"));
  validateExactIdentity(identity, expected);
  expect(within(identity.createdAt, verified.deploy), "Server release identity was not created during this successful deployment attempt.");
  const destination = join(artifactDirectory, "release-evidence.json");
  const existingMatches = () => {
    expect(lstatSync(destination).isFile() && readFileSync(destination).equals(evidence), "Existing release evidence differs; refusing to overwrite it.");
  };
  if (existsSync(destination)) { existingMatches(); return { preserved: true, alreadyPresent: true, sourceSha, runId: String(runId), destination }; }
  const temporary = join(artifactDirectory, `.release-evidence-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, evidence, { mode: 0o640, flag: "wx" });
    chmodSync(temporary, 0o640);
    chownSync(temporary, -1, statSync(identityPath).gid);
    // A hard link publishes atomically without replacing a concurrently created
    // artifact. Existing byte-identical evidence is safely idempotent.
    try { linkSync(temporary, destination); }
    catch (error) { if (error.code !== "EEXIST") throw error; existingMatches(); }
  } finally { rmSync(temporary, { force: true }); }
  return { preserved: true, alreadyPresent: false, sourceSha, runId: String(runId), destination };
}

export async function fetchStagingEvidence({ repository, sourceSha, runId, token }, fetcher = fetch) {
  expect(repository === "nxttrack/platform" && /^[a-f0-9]{40}$/.test(sourceSha || "") && /^\d+$/.test(String(runId)) && Boolean(token), "Canonical repository, exact SHA, numeric run ID and GitHub token are required.");
  const headers = { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28" };
  const request = (path) => fetcher(`https://api.github.com/repos/${repository}${path}`, { headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  async function get(path) { const response = await request(path); expect(response.ok, "GitHub could not provide staging evidence metadata."); return response.json(); }
  const run = await get(`/actions/runs/${runId}`), jobs = [], artifacts = [];
  expect(Number.isInteger(run.run_attempt) && run.run_attempt > 0, "Staging run attempt is invalid.");
  for (const [suffix, key, list] of [[`/attempts/${run.run_attempt}/jobs`, "jobs", jobs], ["/artifacts", "artifacts", artifacts]]) {
    for (let page = 1; ; page++) {
      expect(page <= 10, "Staging evidence metadata is unexpectedly large.");
      const result = await get(`/actions/runs/${runId}${suffix}?per_page=100&page=${page}`);
      expect(Array.isArray(result[key]), "Staging evidence metadata is malformed.");
      list.push(...result[key]);
      if (result[key].length < 100) break;
    }
  }
  validateStagingRun(run, jobs, { repository, sourceSha, runId });
  const named = artifacts.filter((artifact) => artifact.name === `nxttrack-staging-${sourceSha}-release-evidence`);
  expect(named.length === 1, "Exactly one canonical staging release evidence artifact is required.");
  const artifact = named[0];
  expect(!artifact.expired && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 2 * 1024 * 1024
    && String(artifact.workflow_run?.id) === String(runId) && artifact.workflow_run?.head_sha === sourceSha && artifact.workflow_run?.head_branch === "main", "Staging evidence artifact origin or availability is invalid.");
  let response = await request(`/actions/artifacts/${artifact.id}/zip`);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    expect(location && new URL(location).protocol === "https:", "GitHub artifact download must use HTTPS.");
    // The signed blob URL is requested without the GitHub authorization header.
    response = await fetcher(location, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  }
  expect(response.ok, "The verified staging artifact could not be downloaded.");
  const archive = Buffer.from(await response.arrayBuffer());
  const contents = readEvidenceArchive(archive, artifact.digest);
  validateStagingEvidence(contents.evidence, contents.exact, run, jobs, { repository, sourceSha, runId });
  return { ...contents, run, jobs, repository, sourceSha, runId, artifactId: artifact.id, artifactDigest: artifact.digest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseDirectory = "/var/www/nxttrack/staging";
  const downloaded = await fetchStagingEvidence({ repository: process.env.GITHUB_REPOSITORY,
    sourceSha: process.env.STAGING_EVIDENCE_SOURCE_SHA || process.env.GITHUB_SHA,
    runId: process.env.STAGING_EVIDENCE_RUN_ID || process.env.GITHUB_RUN_ID,
    token: process.env.GITHUB_TOKEN });
  const result = persistStagingEvidence({ ...downloaded, baseDirectory,
    releaseDirectory: process.env.STAGING_EVIDENCE_RELEASE_DIRECTORY || join(baseDirectory, "current") });
  console.log(JSON.stringify({ ...result, artifactId: downloaded.artifactId, artifactDigest: downloaded.artifactDigest }));
}
