#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

export const minimumRollbackAppSha = "352b38cd69958a3d59d31b39aaa798e6de70a77f";

export function readReleaseCommitSha(releaseDirectory) {
  const artifactPath = join(releaseDirectory, "artifacts", "exact-source-sha.json");
  let artifactSha = null;
  if (existsSync(artifactPath)) {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
    if (artifact?.purpose !== "nxttrack-exact-source-sha") {
      throw new Error("Rollback release exact-source-sha.json has the wrong purpose.");
    }
    artifactSha = artifact.commitSha;
  }

  const environmentPath = join(releaseDirectory, ".env");
  if (!existsSync(environmentPath)) throw new Error("Rollback release has no environment metadata.");
  const environmentSha = readFileSync(environmentPath, "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("RELEASE_COMMIT_SHA="))
    ?.slice("RELEASE_COMMIT_SHA=".length)
    .trim();
  const commitSha = artifactSha ?? environmentSha;
  if (!/^[a-f0-9]{40}$/.test(commitSha ?? "")) {
    throw new Error("Rollback release does not identify an immutable commit SHA.");
  }
  if (artifactSha && environmentSha && artifactSha !== environmentSha) {
    throw new Error("Rollback release artifact and environment identify different commits.");
  }
  return commitSha;
}

export function assertRollbackRelease({ baseDirectory, releaseDirectory, sourceCheckout }) {
  const releaseRoot = realpathSync(join(baseDirectory, "releases"));
  const resolvedRelease = realpathSync(releaseDirectory);
  const relativeRelease = relative(releaseRoot, resolvedRelease);
  if (!relativeRelease || relativeRelease.startsWith(`..${sep}`) || relativeRelease === "..") {
    throw new Error("Rollback release is outside the configured release root.");
  }
  if (!existsSync(join(resolvedRelease, "apps", "web", ".next", "standalone", "apps", "web", "server.js"))) {
    throw new Error("Rollback release has no packaged application server.");
  }
  const commitSha = readReleaseCommitSha(resolvedRelease);
  execFileSync("git", ["cat-file", "-e", `${commitSha}^{commit}`], { cwd: sourceCheckout, stdio: "ignore" });
  execFileSync("git", ["merge-base", "--is-ancestor", minimumRollbackAppSha, commitSha], {
    cwd: sourceCheckout,
    stdio: "ignore"
  });
  return { commitSha, releaseDirectory: resolvedRelease };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const baseDirectory = process.env.BASE_DIR;
  const releaseDirectory = process.env.ROLLBACK_RELEASE;
  const sourceCheckout = process.env.GITHUB_WORKSPACE;
  const stateFile = process.env.ROLLBACK_STATE_FILE;
  if (!baseDirectory || !releaseDirectory || !sourceCheckout || !stateFile) {
    throw new Error("BASE_DIR, ROLLBACK_RELEASE, GITHUB_WORKSPACE and ROLLBACK_STATE_FILE are required.");
  }
  const state = assertRollbackRelease({ baseDirectory, releaseDirectory, sourceCheckout });
  const output = resolve(stateFile);
  if (dirname(output) !== realpathSync(join(baseDirectory, "shared"))) {
    throw new Error("Rollback state file must be inside the shared deployment directory.");
  }
  writeFileSync(output, `${JSON.stringify(state)}\n`, { mode: 0o640 });
  console.log(`[release:rollback-target] PASS commitSha=${state.commitSha}`);
}
