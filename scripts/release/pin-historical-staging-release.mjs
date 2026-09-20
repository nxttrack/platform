#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const historicalSha = "6b3c9abb686be198830f417e663ac94124d7066f";
export const historicalName = "20260919230221-6b3c9ab";
export const pinnedName = `rollback-${historicalName}`;
const historicalRun = "35474984786";
const stat = (path) => { try { return lstatSync(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; } };
function artifact(release, name) {
  const directory = join(release, "artifacts"), path = join(directory, name);
  assert.equal(realpathSync(directory), directory, "Artifact directory must not redirect.");
  const info = lstatSync(path);
  assert.ok(info.isFile() && info.size <= 65536, "Artifact must be a bounded regular file.");
  return readFileSync(path);
}
function identity(release, sha) {
  const value = JSON.parse(artifact(release, "exact-source-sha.json"));
  assert.ok(value.schemaVersion === 1 && value.purpose === "nxttrack-exact-source-sha"
    && value.repository === "nxttrack/platform" && value.commitSha === sha,
  "Release has an unexpected immutable identity.");
  return value;
}

export function inspectHistoricalRelease({ baseDirectory, releaseSha }) {
  assert.match(releaseSha || "", /^[a-f0-9]{40}$/, "An exact active release SHA is required.");
  assert.notEqual(releaseSha, historicalSha, "Historical release must be inactive.");
  const root = realpathSync(join(baseDirectory, "releases"));
  const source = join(root, historicalName), destination = join(root, pinnedName);
  const sourceStat = stat(source), destinationStat = stat(destination);
  assert.ok(!(sourceStat && destinationStat), "Both historical paths exist; refusing any overwrite.");
  const release = sourceStat ? source : destination;
  const info = sourceStat || destinationStat;
  assert.ok(info?.isDirectory() && !info.isSymbolicLink(), "Historical release must be a real directory.");
  assert.ok(realpathSync(release) === release && dirname(release) === root, "Historical release must be a direct child.");
  const current = realpathSync(join(baseDirectory, "current"));
  assert.notEqual(current, release, "Historical release must not be current.");
  identity(current, releaseSha);
  const old = identity(release, historicalSha);
  assert.ok(old.refName === "main" && String(old.workflowRunId) === historicalRun,
    "Historical identity has the wrong original deployment.");
  return { current, releaseDirectory: release, destination, alreadyPinned: release === destination };
}

export function pinHistoricalRelease(options) {
  const before = inspectHistoricalRelease(options);
  const exact = artifact(before.releaseDirectory, "exact-source-sha.json");
  const evidence = artifact(before.releaseDirectory, "release-evidence.json");
  const value = JSON.parse(evidence);
  assert.ok(value.schemaVersion === 1 && value.application === "nxttrack-platform" && value.target === "staging"
    && value.source?.commitSha === historicalSha && value.workflow?.repository === "nxttrack/platform"
    && String(value.workflow?.runId) === historicalRun, "Verified historical staging evidence is required before pinning.");
  if (!before.alreadyPinned) {
    // Linux RENAME_NOREPLACE is atomic, including if another process creates the
    // destination after inspection. Never fall back to an overwriting rename.
    execFileSync("python3", ["-c", `import ctypes,os,sys
libc=ctypes.CDLL(None,use_errno=True)
rename=libc.renameat2
rename.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
rename.restype=ctypes.c_int
if rename(-100,os.fsencode(sys.argv[1]),-100,os.fsencode(sys.argv[2]),1)!=0:
 raise OSError(ctypes.get_errno(),"Atomic no-replace release rename failed")
`, before.releaseDirectory, before.destination], { timeout: 5000, maxBuffer: 4096, stdio: ["ignore", "pipe", "pipe"] });
  }
  const after = inspectHistoricalRelease(options);
  assert.equal(after.current, before.current, "Active release changed while pinning.");
  assert.ok(artifact(after.releaseDirectory, "exact-source-sha.json").equals(exact)
    && artifact(after.releaseDirectory, "release-evidence.json").equals(evidence), "Original artifact bytes changed.");
  return { pinned: true, alreadyPinned: before.alreadyPinned, releaseDirectory: after.releaseDirectory,
    historicalSha, immutableIdentityUnchanged: true, originalEvidenceUnchanged: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.ok(process.argv.length === 3 && ["inspect", "pin"].includes(process.argv[2]), "Expected inspect or pin.");
    const options = { baseDirectory: "/var/www/nxttrack/staging", releaseSha: process.env.RELEASE_SHA };
    console.log(JSON.stringify(process.argv[2] === "pin" ? pinHistoricalRelease(options) : inspectHistoricalRelease(options)));
  } catch {
    console.error("[staging:pin-rollback] FAIL: historical release validation or atomic no-replace operation failed.");
    process.exitCode = 1;
  }
}
