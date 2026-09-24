import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { requiredStagingSteps } from "../../scripts/release/verify-production-evidence.mjs";
import { fetchStagingEvidence, persistStagingEvidence, readEvidenceArchive, validateStagingEvidence } from "../../scripts/release/preserve-staging-release-evidence.mjs";

const repository = "nxttrack/platform", sourceSha = "a".repeat(40), runId = "42";
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const digest = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
function fixture() {
  const step = (name) => ({ name, status: "completed", conclusion: "success" });
  const run = { id: 42, repository: { full_name: repository }, head_sha: sourceSha, head_branch: "main", event: "workflow_dispatch",
    path: ".github/workflows/deploy.yml", run_attempt: 1, status: "completed", conclusion: "success" };
  const jobs = [
    { name: "deploy", status: "completed", conclusion: "success", started_at: "2026-09-20T11:00:00Z", completed_at: "2026-09-20T11:02:00Z",
      steps: ["Assert canonical release source", "Persist immutable release identity", "Health endpoint smoke", "Runtime smoke"].map(step) },
    { name: "staging browser validation", status: "completed", conclusion: "success", started_at: "2026-09-20T11:02:00Z", completed_at: "2026-09-20T11:20:00Z", steps: requiredStagingSteps.map(step) }
  ];
  const evidence = { schemaVersion: 1, application: "nxttrack-platform", target: "staging",
    source: { canonicalBranch: "main", refName: "main", commitSha: sourceSha }, workflow: { repository, runId, runAttempt: "1" },
    gates: Object.fromEntries(["repositoryTruth", "lovableBaselineContract", "authAudit", "migrationAudit", "rlsCoverageAudit", "build", "standaloneAssets", "healthSmoke", "runtimeSmoke", "phase15Staging", "phase16Staging", "databaseMigration"].map((name) => [name, "passed"])),
    createdAt: "2026-09-20T11:19:30Z" };
  const exact = { schemaVersion: 1, purpose: "nxttrack-exact-source-sha", repository, commitSha: sourceSha, refName: "main", workflowRunId: runId, createdAt: evidence.createdAt };
  return { repository, sourceSha, runId, run, jobs, evidence: bytes(evidence), exact: bytes(exact) };
}
function createZip(files) {
  return execFileSync("python3", ["-c", "import io,json,sys,zipfile\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED) as z:\n for name,value in json.load(sys.stdin).items(): z.writestr(name,value)\nsys.stdout.buffer.write(b.getvalue())"], {
    input: JSON.stringify(files), stdio: ["pipe", "pipe", "pipe"]
  });
}
function directoryFixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "nxttrack-staging-evidence-"));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const baseDirectory = join(parent, "staging"), releaseDirectory = join(baseDirectory, "releases", `20260920110000-${sourceSha.slice(0, 7)}`), data = fixture();
  mkdirSync(join(releaseDirectory, "artifacts"), { recursive: true });
  mkdirSync(join(releaseDirectory, "apps/web/.next/standalone/apps/web"), { recursive: true });
  writeFileSync(join(releaseDirectory, "apps/web/.next/standalone/apps/web/server.js"), "fixture server\n");
  const serverIdentity = { ...JSON.parse(data.exact), createdAt: "2026-09-20T11:01:00Z" };
  writeFileSync(join(releaseDirectory, "artifacts/exact-source-sha.json"), bytes(serverIdentity), { mode: 0o640 });
  mkdirSync(join(baseDirectory, "shared"));
  writeFileSync(join(baseDirectory, "shared/.env"), "unchanged-active-configuration\n", { mode: 0o600 });
  symlinkSync(releaseDirectory, join(baseDirectory, "current"));
  symlinkSync(join(baseDirectory, "shared/.env"), join(releaseDirectory, ".env"));
  return { ...data, parent, baseDirectory, releaseDirectory };
}

test("existing browser evidence is copied byte-for-byte without changing immutable identity, runtime config or active symlink", (t) => {
  const data = directoryFixture(t), identityPath = join(data.releaseDirectory, "artifacts/exact-source-sha.json"), identityBefore = readFileSync(identityPath);
  const first = persistStagingEvidence(data);
  assert.equal(first.alreadyPresent, false);
  assert.deepEqual(readFileSync(first.destination), data.evidence);
  assert.equal(statSync(first.destination).mode & 0o777, 0o640);
  assert.deepEqual(readFileSync(identityPath), identityBefore);
  assert.equal(readFileSync(join(data.baseDirectory, "shared/.env"), "utf8"), "unchanged-active-configuration\n");
  assert.equal(readlinkSync(join(data.baseDirectory, "current")), data.releaseDirectory);
  assert.equal(persistStagingEvidence(data).alreadyPresent, true);
});

test("wrong run, target, attempt, SHA, gate, timestamp and unsuccessful browser jobs are rejected before any write", (t) => {
  const source = directoryFixture(t);
  const mutations = [
    (value) => { value.run.head_branch = "feature"; },
    (value) => { value.run.head_sha = "b".repeat(40); },
    (value) => { value.run.repository.full_name = "other/repository"; },
    (value) => { value.run.conclusion = "failure"; },
    (value) => { value.jobs[1].steps[0].conclusion = "skipped"; },
    (value) => { value.jobs[1].status = "in_progress"; },
    (value) => { value.evidence = bytes({ ...JSON.parse(value.evidence), target: "production" }); },
    (value) => { const parsed = JSON.parse(value.evidence); parsed.workflow.runAttempt = "2"; value.evidence = bytes(parsed); },
    (value) => { const parsed = JSON.parse(value.evidence); parsed.gates.phase16Staging = "not_requested"; value.evidence = bytes(parsed); },
    (value) => { value.evidence = bytes({ ...JSON.parse(value.evidence), createdAt: "2026-09-19T11:19:30Z" }); }
  ];
  for (const mutate of mutations) {
    const data = { ...source, ...fixture() };
    mutate(data);
    assert.throws(() => persistStagingEvidence(data));
    assert.equal(existsSync(join(source.releaseDirectory, "artifacts/release-evidence.json")), false);
  }
});

test("persistence supports a running parent workflow only after both required jobs finished", () => {
  const data = fixture();
  data.run.status = "in_progress"; data.run.conclusion = null;
  validateStagingEvidence(data.evidence, data.exact, data.run, data.jobs, data);
  data.jobs[1].conclusion = null;
  assert.throws(() => validateStagingEvidence(data.evidence, data.exact, data.run, data.jobs, data), /must be successful/);
});

test("destination release and deployed run identity are bound and conflicting evidence is never overwritten", (t) => {
  const data = directoryFixture(t);
  assert.throws(() => persistStagingEvidence({ ...data, releaseDirectory: data.parent }), /directly inside/);
  const path = join(data.releaseDirectory, "artifacts/release-evidence.json");
  writeFileSync(path, "existing different evidence\n");
  assert.throws(() => persistStagingEvidence(data), /refusing to overwrite/);
  assert.equal(readFileSync(path, "utf8"), "existing different evidence\n");
  rmSync(path);
  const identityPath = join(data.releaseDirectory, "artifacts/exact-source-sha.json");
  const identity = JSON.parse(readFileSync(identityPath));
  writeFileSync(identityPath, bytes({ ...identity, workflowRunId: "41" }));
  assert.throws(() => persistStagingEvidence(data), /Immutable release identity/);
  writeFileSync(identityPath, bytes({ ...identity, createdAt: "2026-09-19T11:01:00Z" }));
  assert.throws(() => persistStagingEvidence(data), /successful deployment attempt/);
});

test("real ZIP validation requires the GitHub digest and exactly the two bounded evidence files", () => {
  const data = fixture(), files = { "release-evidence.json": data.evidence.toString(), "exact-source-sha.json": data.exact.toString() };
  const archive = createZip(files), parsed = readEvidenceArchive(archive, digest(archive));
  assert.deepEqual(parsed.evidence, data.evidence);
  assert.deepEqual(parsed.exact, data.exact);
  assert.throws(() => readEvidenceArchive(archive, `sha256:${"0".repeat(64)}`), /GitHub artifact digest/);
  for (const altered of [{ ...files, "../../unexpected": "escape" }, { ...files, "release-evidence.json": "a".repeat(65537) }]) {
    const invalid = createZip(altered);
    assert.throws(() => readEvidenceArchive(invalid, digest(invalid)), /two-file release evidence ZIP/);
  }
});

test("GitHub artifact download is bound to run metadata and never forwards its token to blob storage", async () => {
  const data = fixture(), archive = createZip({ "release-evidence.json": data.evidence.toString(), "exact-source-sha.json": data.exact.toString() });
  const fetcher = async (url, options) => {
    if (url === "https://blob.example/evidence.zip") {
      assert.equal(options.headers, undefined);
      return { ok: true, arrayBuffer: async () => archive };
    }
    assert.equal(options.headers.authorization, "Bearer test-token");
    if (url.endsWith("/actions/runs/42")) return { ok: true, json: async () => data.run };
    if (url.includes("/attempts/1/jobs?")) return { ok: true, json: async () => ({ jobs: data.jobs }) };
    if (url.includes("/artifacts?")) return { ok: true, json: async () => ({ artifacts: [{ id: 7, name: `nxttrack-staging-${sourceSha}-release-evidence`, expired: false,
      size_in_bytes: archive.length, digest: digest(archive), workflow_run: { id: 42, head_sha: sourceSha, head_branch: "main" } }] }) };
    if (url.endsWith("/actions/artifacts/7/zip")) return { status: 302, headers: { get: () => "https://blob.example/evidence.zip" } };
    assert.fail("Unexpected request");
  };
  const result = await fetchStagingEvidence({ repository, sourceSha, runId, token: "test-token" }, fetcher);
  assert.deepEqual(result.evidence, data.evidence);
  assert.equal(result.artifactId, 7);
});
