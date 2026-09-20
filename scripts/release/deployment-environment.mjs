#!/usr/bin/env node

import { chmodSync, chownSync, closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

function value(contents, name) {
  const matches = contents.split(/\r?\n/).filter((line) => line.startsWith(`${name}=`));
  if (matches.length !== 1) throw new Error(`Deployment environment requires exactly one ${name}.`);
  return matches[0].slice(name.length + 1);
}

export function maintenanceEnvironment(contents) {
  const updates = { MAINTENANCE_NO_WRITE: "true", EMAIL_SENDING_ENABLED: "false", NEWSLETTER_DELIVERY_ENABLED: "false", INTERNAL_JOBS_ENABLED: "false" };
  for (const [name, setting] of Object.entries(updates)) {
    value(contents, name);
    contents = contents.replace(new RegExp(`^${name}=.*$`, "m"), `${name}=${setting}`);
  }
  return contents;
}

export function atomicEnvironmentWrite(file, contents) {
  const temporary = join(dirname(file), `.env.publish-${randomUUID()}`);
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o640);
    writeFileSync(descriptor, contents);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, 0o640);
    if (existsSync(file)) chownSync(temporary, -1, statSync(file).gid);
    renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function publishDeploymentEnvironment({ mode, sharedPath, snapshotPath, candidatePath, previousSha, candidateSha }) {
  const original = readFileSync(snapshotPath, "utf8");
  if (!/^[a-f0-9]{40}$/.test(previousSha ?? "") || value(original, "RELEASE_COMMIT_SHA") !== previousSha) {
    throw new Error("Deployment snapshot does not match the active immutable release.");
  }
  // Only the snapshotted configuration or our own containment transition may
  // be replaced. A concurrent operator change must not be silently overwritten.
  const current = readFileSync(sharedPath, "utf8");
  const contained = maintenanceEnvironment(original);
  if (current !== original && current !== contained) throw new Error("Shared environment changed after the deployment snapshot.");
  if (mode === "maintenance") {
    atomicEnvironmentWrite(sharedPath, contained);
    return;
  }
  if (mode !== "activate") throw new Error("Unknown environment publication mode.");
  const candidate = readFileSync(candidatePath, "utf8");
  if (!/^[a-f0-9]{40}$/.test(candidateSha ?? "") || value(candidate, "RELEASE_COMMIT_SHA") !== candidateSha) {
    throw new Error("Candidate environment does not match the release being activated.");
  }
  atomicEnvironmentWrite(sharedPath, candidate);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const state = JSON.parse(readFileSync(process.env.DEPLOYMENT_STATE_FILE, "utf8"));
  publishDeploymentEnvironment({
    mode: process.argv[2], sharedPath: join(process.env.BASE_DIR, "shared", ".env"),
    snapshotPath: process.env.DEPLOYMENT_ENV_SNAPSHOT, candidatePath: join(process.env.RELEASE, ".env.candidate"),
    previousSha: state.commitSha, candidateSha: process.env.GITHUB_SHA
  });
  console.log(`[deploy:environment] PASS ${process.argv[2]} publication; secrets were not logged.`);
}
