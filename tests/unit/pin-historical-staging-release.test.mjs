import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { historicalName, historicalSha, inspectHistoricalRelease, pinHistoricalRelease, pinnedName } from "../../scripts/release/pin-historical-staging-release.mjs";

const releaseSha = "b5511f16ad8367aca342aac9b5c0e83c4ee4d362";
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "staging-pin-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const baseDirectory = join(directory, "staging"), root = join(baseDirectory, "releases");
  const source = join(root, historicalName), destination = join(root, pinnedName), current = join(root, "20260920130000-b5511f1");
  const exact = (sha) => ({ schemaVersion: 1, purpose: "nxttrack-exact-source-sha", repository: "nxttrack/platform",
    commitSha: sha, refName: "main", workflowRunId: sha === historicalSha ? "35474984786" : "35512095754" });
  for (const [path, sha] of [[source, historicalSha], [current, releaseSha]]) {
    mkdirSync(join(path, "artifacts"), { recursive: true });
    writeFileSync(join(path, "artifacts/exact-source-sha.json"), JSON.stringify(exact(sha)) + "\n");
  }
  const evidence = JSON.stringify({ schemaVersion: 1, application: "nxttrack-platform", target: "staging",
    source: { commitSha: historicalSha }, workflow: { repository: "nxttrack/platform", runId: "35474984786" } }) + "\n";
  writeFileSync(join(source, "artifacts/release-evidence.json"), evidence);
  mkdirSync(join(baseDirectory, "shared"));
  writeFileSync(join(baseDirectory, "shared/.env"), "fixture-configuration-unchanged\n");
  symlinkSync(current, join(baseDirectory, "current"));
  return { baseDirectory, releaseSha, source, destination, current, evidence };
}

test("real atomic pin preserves original artifact bytes, active link and environment; retries are idempotent", (t) => {
  const state = fixture(t);
  const identity = readFileSync(join(state.source, "artifacts/exact-source-sha.json"));
  const beforeEnvironment = readFileSync(join(state.baseDirectory, "shared/.env"));
  assert.equal(inspectHistoricalRelease(state).alreadyPinned, false);
  assert.equal(pinHistoricalRelease(state).alreadyPinned, false);
  assert.equal(inspectHistoricalRelease(state).releaseDirectory, state.destination);
  assert.equal(pinHistoricalRelease(state).alreadyPinned, true);
  assert.equal(realpathSync(join(state.baseDirectory, "current")), state.current);
  assert.deepEqual(readFileSync(join(state.baseDirectory, "shared/.env")), beforeEnvironment);
  assert.deepEqual(readFileSync(join(state.destination, "artifacts/exact-source-sha.json")), identity);
  assert.equal(readFileSync(join(state.destination, "artifacts/release-evidence.json"), "utf8"), state.evidence);
});

test("conflicting destination is never overwritten, even when empty or byte-identical", (t) => {
  const state = fixture(t);
  mkdirSync(state.destination);
  assert.throws(() => pinHistoricalRelease(state), /Both historical paths exist/);
  assert.equal(readFileSync(join(state.source, "artifacts/release-evidence.json"), "utf8"), state.evidence);
  mkdirSync(join(state.destination, "artifacts"));
  for (const name of ["exact-source-sha.json", "release-evidence.json"]) {
    writeFileSync(join(state.destination, "artifacts", name), readFileSync(join(state.source, "artifacts", name)));
  }
  assert.throws(() => pinHistoricalRelease(state), /Both historical paths exist/);
});

test("refuses current historical release and wrong active SHA", (t) => {
  const state = fixture(t);
  assert.throws(() => pinHistoricalRelease({ ...state, releaseSha: historicalSha }), /inactive/);
  assert.throws(() => pinHistoricalRelease({ ...state, releaseSha: "a".repeat(40) }), /unexpected immutable identity/);
  rmSync(join(state.baseDirectory, "current"));
  symlinkSync(state.source, join(state.baseDirectory, "current"));
  assert.throws(() => pinHistoricalRelease(state), /must not be current/);
});

test("refuses source redirection outside the release root", (t) => {
  const state = fixture(t), outside = join(state.baseDirectory, "outside");
  renameSync(state.source, outside);
  symlinkSync(outside, state.source);
  assert.throws(() => pinHistoricalRelease(state), /real directory/);
});

test("refuses incorrect historical SHA, original run or evidence target", (t) => {
  const state = fixture(t), exactPath = join(state.source, "artifacts/exact-source-sha.json");
  const original = readFileSync(exactPath), exact = JSON.parse(original);
  writeFileSync(exactPath, JSON.stringify({ ...exact, commitSha: releaseSha }));
  assert.throws(() => pinHistoricalRelease(state), /unexpected immutable identity/);
  writeFileSync(exactPath, JSON.stringify({ ...exact, workflowRunId: "1" }));
  assert.throws(() => pinHistoricalRelease(state), /wrong original deployment/);
  writeFileSync(exactPath, original);
  writeFileSync(join(state.source, "artifacts/release-evidence.json"), state.evidence.replace('"staging"', '"production"'));
  assert.throws(() => pinHistoricalRelease(state), /historical staging evidence/);
});

test("refuses missing evidence and malformed or redirected pinned fallback", (t) => {
  const state = fixture(t);
  rmSync(join(state.source, "artifacts/release-evidence.json"));
  assert.throws(() => pinHistoricalRelease(state));
  renameSync(state.source, state.destination);
  assert.throws(() => pinHistoricalRelease(state));
  rmSync(state.destination, { recursive: true });
  symlinkSync(state.current, state.destination);
  assert.throws(() => inspectHistoricalRelease(state), /real directory/);
});

test("workflow verifies full original evidence before pinning and checks only the pinned rollback", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/production-migration-recovery.yml", import.meta.url), "utf8");
  const job = workflow.split("  restore-staging-release-evidence:\n")[1].split("  check-production-rollback:\n")[0];
  const preserve = job.indexOf('node scripts/release/preserve-staging-release-evidence.mjs');
  const pin = job.indexOf('node "$PIN_HELPER" pin');
  const check = job.indexOf('rehearse-runtime-rollback.sh staging "$HISTORICAL_RELEASE" --check-only');
  assert.ok(job.includes("verified.run.status==='completed' && verified.run.conclusion==='success'"));
  assert.ok(job.includes("verified.evidence.equals(evidenceBytes)"));
  assert.ok(preserve > 0 && pin > preserve && check > pin);
  assert.ok(job.includes("Runtime state changed during the evidence-only operation."));
  assert.ok(!job.includes("systemctl restart") && !job.includes("systemctl stop"));
});
