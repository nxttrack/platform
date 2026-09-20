#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runtimeTarget } from "./runtime-operations-contract.mjs";

const fingerprint = (bytes) => createHash("sha256").update(bytes).digest("hex");

function privateWrite(file, bytes, exclusive = false) {
  const descriptor = openSync(file, exclusive ? "wx" : "w", 0o600);
  try { writeFileSync(descriptor, bytes); fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
  chmodSync(file, 0o600);
}

function retainKey(history, bytes, timestamp) {
  const id = fingerprint(bytes), file = join(history, `${id}.key`), metadata = join(history, `${id}.json`);
  if (existsSync(file)) {
    if (!lstatSync(file).isFile() || !readFileSync(file).equals(bytes)) throw new Error("Retained backup key history does not match its immutable identity.");
    if ((lstatSync(file).mode & 0o077) !== 0) throw new Error("Retained backup key history is not private.");
  } else privateWrite(file, bytes, true);
  if (!existsSync(metadata)) privateWrite(metadata, `${JSON.stringify({ schemaVersion: 1, keyFingerprint: id, retainedAt: timestamp })}\n`, true);
  return { id, file };
}

function retainedKeys(history) {
  return readdirSync(history).filter((name) => /^[a-f0-9]{64}\.key$/.test(name)).map((name) => {
    const file = join(history, name);
    if (!lstatSync(file).isFile() || (lstatSync(file).mode & 0o077) !== 0 || fingerprint(readFileSync(file)) !== name.slice(0, 64)) {
      throw new Error("Retained backup key history failed identity or permission verification.");
    }
    return { id: name.slice(0, 64), file };
  });
}

// Archive bytes are deliberately preserved. Historical keys remain private and
// immutable; the encrypted recovery bundle allows off-host recovery using the
// new independently retained secret after the GitHub secret has been replaced.
export function rotateStorageBackupKey({ target, shared, newPassphrase, lockHeld = false }, { execute = execFileSync, now = () => new Date() } = {}) {
  runtimeTarget(target);
  if (!lockHeld) throw new Error("Storage key rotation requires the environment backup lock.");
  if (typeof newPassphrase !== "string" || newPassphrase.length < 32 || /[\r\n\0]/.test(newPassphrase)) {
    throw new Error("A new independently generated backup passphrase of at least 32 characters is required.");
  }
  const operations = join(shared, "operations-v4"), currentFile = join(operations, "backup-passphrase");
  if (!lstatSync(currentFile).isFile() || (lstatSync(currentFile).mode & 0o077) !== 0) throw new Error("The active backup key must be a private regular file.");
  const original = readFileSync(currentFile);
  if (!original.length) throw new Error("The active backup key is empty.");
  const next = Buffer.from(newPassphrase, "utf8"), history = join(operations, "key-history"), timestamp = now().toISOString();
  mkdirSync(history, { recursive: true, mode: 0o700 });
  chmodSync(history, 0o700);
  const previous = retainKey(history, original, timestamp), replacement = retainKey(history, next, timestamp);
  const keys = retainedKeys(history);
  const recoveryBundlePath = join(history, `recovery-${replacement.id}.tar.gz.gpg`);
  const partial = `${recoveryBundlePath}.partial-${randomUUID()}`;
  const pendingKey = join(operations, `.backup-passphrase.pending-${randomUUID()}`);
  let temp;
  const backups = join(shared, "storage-backups-v4"), bindings = [];
  const run = (command, args) => execute(command, args, { stdio: "pipe" });
  const gpg = (key, args) => run("gpg", ["--batch", "--yes", "--quiet", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", key, ...args]);
  try {
    temp = mkdtempSync(join(shared, ".v4-key-rotation-"));
    for (const name of existsSync(backups) ? readdirSync(backups).filter((file) => file.endsWith(".tar.gz.gpg")).sort() : []) {
      const archive = join(backups, name), plaintext = join(temp, "archive-check.tar.gz");
      if (!lstatSync(archive).isFile()) throw new Error("A retained encrypted backup is not a regular file.");
      let verified;
      const candidates = [...keys].sort((a, b) => Number(b.id === previous.id) - Number(a.id === previous.id));
      for (const key of candidates) {
        try { gpg(key.file, ["--decrypt", "--output", plaintext, archive]); verified = key.id; }
        catch { /* A previous rotation may have left archives encrypted by another retained key. */ }
        finally { rmSync(plaintext, { force: true }); }
        if (verified) break;
      }
      if (!verified) throw new Error("A retained encrypted backup cannot be recovered with the retained keys; the current key was not changed.");
      bindings.push({ archive: name, keyFingerprint: verified });
    }
    const verificationName = `rotation-${previous.id}-to-${replacement.id}.json`;
    if (!existsSync(join(history, verificationName))) privateWrite(join(history, verificationName), `${JSON.stringify({
      schemaVersion: 1, target, verifiedAt: timestamp, previousKeyFingerprint: previous.id,
      nextKeyFingerprint: replacement.id, archivePolicy: "preserve-existing-ciphertext", verifiedArchives: bindings
    }, null, 2)}\n`, true);
    const bundleFiles = readdirSync(history).filter((file) => /^(?:[a-f0-9]{64}\.(?:key|json)|rotation-[a-f0-9]{64}-to-[a-f0-9]{64}\.json)$/.test(file)).sort();
    const bundle = join(temp, "key-history.tar.gz"), decrypted = join(temp, "verified-key-history.tar.gz");
    run("tar", ["-C", history, "-czf", bundle, "--", ...bundleFiles]);
    gpg(replacement.file, ["--symmetric", "--cipher-algo", "AES256", "--output", partial, bundle]);
    gpg(replacement.file, ["--decrypt", "--output", decrypted, partial]);
    run("cmp", ["--silent", bundle, decrypted]);
    chmodSync(partial, 0o600);
    renameSync(partial, recoveryBundlePath);
    // No decrypted archive or unencrypted recovery bundle may remain when the
    // key used by the legacy cron entry is changed.
    rmSync(temp, { recursive: true, force: true });
    temp = undefined;
    if (!readFileSync(currentFile).equals(original)) throw new Error("The active backup key changed during rotation; refusing to overwrite it.");
    if (!original.equals(next)) { privateWrite(pendingKey, next, true); renameSync(pendingKey, currentFile); }
    return { target, rotated: !original.equals(next), retainedKeys: keys.length, verifiedArchives: bindings.length,
      archivePolicy: "preserve-existing-ciphertext", recoveryBundlePath, recoveryBundleRetentionDays: 90,
      newBackupVerificationRequired: true };
  } catch {
    // Child-process errors can include diagnostics and arguments. Only a fixed
    // message crosses the operation boundary; no key bytes are logged.
    throw new Error("Storage key rotation did not complete; retain current and historical keys and retry after checking archive recovery and tool availability.");
  } finally {
    try { rmSync(partial, { force: true }); }
    finally {
      try { rmSync(pendingKey, { force: true }); }
      finally { if (temp) rmSync(temp, { recursive: true, force: true }); }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2], { shared } = runtimeTarget(target);
  if (process.argv[3] === "--locked") {
    if (process.argv.length !== 4) throw new Error("Unexpected rotation arguments.");
    const result = rotateStorageBackupKey({ target, shared, newPassphrase: process.env.STORAGE_BACKUP_PASSPHRASE, lockHeld: true });
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `recovery_bundle_path=${result.recoveryBundlePath}\n`);
    console.log(JSON.stringify(result));
  } else {
    if (process.argv.length !== 3) throw new Error("Expected exactly one explicit environment.");
    // This is the exact lock used by the currently installed legacy backup job.
    const result = spawnSync("flock", ["--exclusive", "--timeout", "120", join(shared, "v4-storage-backup.lock"),
      process.execPath, fileURLToPath(import.meta.url), target, "--locked"], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Locked Storage key rotation did not complete successfully.");
  }
}
