import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { parseEnv } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cronEntries, readRuntimeEnvironment, reconcileCrontab, scheduledJobs, validateRuntimeEnvironment } from "./runtime-operations-contract.mjs";

export const operationsFiles = Object.freeze([
  "scripts/operations/runtime-operations-contract.mjs", "scripts/operations/run-scheduled-jobs.mjs", "scripts/operations/backup-storage-daily.mjs",
  "scripts/storage/object-backup.mjs", "scripts/storage/storage-bucket-contract.mjs", "scripts/storage/storage-restore-contract.mjs"
]);

export function operationsDigest(sourceRoot) {
  const digest = createHash("sha256");
  for (const file of operationsFiles) digest.update(file).update("\0").update(readFileSync(join(sourceRoot, file)));
  return digest.digest("hex");
}

export function preflightRuntimeInstallation(target, { sourceRoot, passphrase = process.env.STORAGE_BACKUP_PASSPHRASE, candidateEnvironmentPath } = {}) {
  const { base, shared, environment } = readRuntimeEnvironment(target);
  assert.ok(sourceRoot, "Operations source directory is required.");
  assert.ok(typeof passphrase === "string" && passphrase.length >= 32 && !/[\r\n\0]/.test(passphrase), "A retained single-line Storage backup passphrase of at least 32 characters is required.");
  scheduledJobs(environment);
  if (candidateEnvironmentPath) {
    const candidate = parseEnv(readFileSync(candidateEnvironmentPath, "utf8"));
    validateCandidateOperationsEnvironment(target, candidate);
  }
  execFileSync("systemctl", ["is-active", "--quiet", "cron"]);
  for (const command of ["gpg", "tar", "cmp", "flock", "crontab"]) execFileSync("which", [command], { stdio: "ignore" });
  readCrontab();
  const directory = join(shared, "operations-v4");
  const keyFile = join(directory, "backup-passphrase");
  if (existsSync(keyFile) && readFileSync(keyFile, "utf8") !== passphrase) throw new Error("Backup key rotation requires a separate retained-key recovery plan.");
  const digest = operationsDigest(sourceRoot);
  return { base, shared, directory, keyFile, digest };
}

export function installRuntimeOperations(target, { sourceRoot, passphrase = process.env.STORAGE_BACKUP_PASSPHRASE, lockHeld = false } = {}) {
  assert.ok(lockHeld, "Runtime operations installation requires the host-wide installation lock.");
  const { base, shared, directory, keyFile, digest } = preflightRuntimeInstallation(target, { sourceRoot, passphrase });
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!existsSync(keyFile)) writeFileSync(keyFile, passphrase, { mode: 0o600, flag: "wx" });
  chmodSync(keyFile, 0o600);
  const version = join(directory, "versions", digest);
  if (!existsSync(version)) {
    const temporary = `${version}.tmp-${process.pid}`;
    mkdirSync(temporary, { recursive: true, mode: 0o700 });
    try {
      for (const file of operationsFiles) {
        const destination = join(temporary, file);
        mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
        copyFileSync(join(sourceRoot, file), destination);
        chmodSync(destination, 0o600);
      }
      mkdirSync(join(temporary, "apps"), { mode: 0o700 });
      symlinkSync(join(base, "current/apps/web"), join(temporary, "apps/web"));
      writeFileSync(join(temporary, "manifest.json"), JSON.stringify({ digest, files: operationsFiles }, null, 2), { mode: 0o600 });
      renameSync(temporary, version);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  assert.equal(operationsDigest(version), digest, "Installed operations tools do not match their source.");
  const pointer = join(directory, "current");
  const previous = existsSync(pointer) ? realpathSync(pointer) : null;
  const updatePointer = (value) => {
    const pending = `${pointer}.tmp-${process.pid}`;
    rmSync(pending, { force: true });
    symlinkSync(value, pending);
    renameSync(pending, pointer);
  };
  installTargetCrontab({
    target, entries: cronEntries(target, process.execPath, shared),
    publish: () => updatePointer(version),
    rollback: () => { if (previous) updatePointer(previous); else rmSync(pointer, { force: true }); }
  });
  return { target, digest, cronEntries: 2, installed: true };
}

export function validateCandidateOperationsEnvironment(target, environment) {
  validateRuntimeEnvironment(target, environment);
  scheduledJobs(environment);
  assert.ok(environment.CRON_SECRET?.length >= 32, "Backup heartbeat authentication is missing from the candidate.");
}

export function readCrontab(run = spawnSync) {
  const result = run("crontab", ["-l"], { encoding: "utf8" });
  if (result.status === 0) return result.stdout || "";
  if (result.status === 1 && /no crontab for/i.test(result.stderr || "")) return "";
  throw new Error("Could not read the existing crontab.");
}

function writeCrontab(contents) {
  const result = spawnSync("crontab", ["-"], { input: contents, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Could not install environment-scoped cron entries.");
}

function targetEntries(contents, target) {
  const tags = [`# nxttrack-v4-${target}`, `# nxttrack-v4-storage-${target}`];
  return contents.split(/\r?\n/).filter((line) => tags.some((tag) => line.trimEnd().endsWith(tag)));
}

// The CLI holds one runner-wide flock for both environments. Recheck immediately
// before writing as well, so an operator edit made outside the lock is preserved.
export function installTargetCrontab({ target, entries, publish, rollback, read = readCrontab, write = writeCrontab }) {
  const original = read();
  const requested = reconcileCrontab(original, target, entries);
  const originalEntries = targetEntries(original, target);
  let published = false;
  let writeAttempted = false;
  try {
    publish();
    published = true;
    if (read() !== original) throw new Error("Crontab changed during operations installation; no cron entries were replaced.");
    writeAttempted = true;
    write(requested);
    if (read() !== requested) throw new Error("Installed crontab differs from the requested entries.");
  } catch (error) {
    let restorationFailed = false;
    try { if (published) rollback(); } catch { restorationFailed = true; }
    if (writeAttempted) {
      try {
        const latest = read();
        const latestEntries = targetEntries(latest, target);
        const ownEntriesUnchanged = JSON.stringify(latestEntries) === JSON.stringify(entries)
          || JSON.stringify(latestEntries) === JSON.stringify(originalEntries);
        if (!ownEntriesUnchanged) throw new Error("Environment cron entries changed outside the installation lock.");
        const restored = reconcileCrontab(latest, target, originalEntries);
        write(restored);
        if (read() !== restored) throw new Error("Cron restoration did not verify.");
      } catch { restorationFailed = true; }
    }
    if (restorationFailed) throw new Error("Operations installation failed; restore the recorded environment cron entries and tool version.");
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const target = process.argv[2];
  if (process.argv[3] === "--check") {
    assert.ok(process.argv.length === 4 || process.argv.length === 5, "Expected --check and an optional candidate environment path.");
    const { digest } = preflightRuntimeInstallation(target, { sourceRoot, candidateEnvironmentPath: process.argv[4] });
    console.log(JSON.stringify({ target, digest, installationPrerequisites: "pass" }));
  } else if (process.argv[3] === "--locked") {
    assert.equal(process.argv.length, 4, "Unexpected installation arguments.");
    console.log(JSON.stringify(installRuntimeOperations(target, { sourceRoot, lockHeld: true })));
  } else {
    assert.equal(process.argv.length, 3, "Expected an environment and optional --check.");
    const lockDirectory = join(homedir(), ".nxttrack-runner");
    mkdirSync(lockDirectory, { recursive: true, mode: 0o700 });
    const result = spawnSync("flock", ["--exclusive", "--timeout", "55", join(lockDirectory, "runtime-operations-install.lock"),
      process.execPath, fileURLToPath(import.meta.url), target, "--locked"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Locked runtime operations installation did not complete successfully.");
  }
}
