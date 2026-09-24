#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, lstatSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { requiredStorageBucketNames, storageBucketContractVersion } from "./storage-bucket-contract.mjs";
import { storageProjectFingerprint } from "./storage-restore-contract.mjs";

const names = Object.freeze({ summary: "storage-backup-summary.json", encrypted: "storage-backup.tar.gz.gpg", proof: "encryption-proof.json" });

function assertPrivateWorkingDirectory(directory) {
  const info = lstatSync(directory);
  assert.ok(info.isDirectory() && !info.isSymbolicLink() && basename(directory).startsWith("storage-backup-"), "An isolated backup working directory is required.");
  assert.equal(info.mode & 0o077, 0, "Backup working directory must be private.");
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function readSummary(workDirectory, environment) {
  const summary = JSON.parse(readFileSync(join(workDirectory, names.summary), "utf8"));
  const allowedFields = new Set(["version", "bucketContractVersion", "createdAt", "sourceProjectFingerprint", "environment", "buckets", "missingBuckets", "prefix", "objectCount", "totalBytes"]);
  assert.ok(Object.keys(summary).every(key => allowedFields.has(key)), "Backup summary contains unexpected fields.");
  assert.ok(typeof summary.createdAt === "string" && Number.isFinite(Date.parse(summary.createdAt)), "Backup creation time is required.");
  assert.ok(["staging", "production"].includes(environment.APP_ENV), "Explicit backup environment is required.");
  assert.equal(summary.environment, environment.APP_ENV, "Backup summary environment mismatch.");
  assert.equal(summary.version, 3, "Current backup manifest version is required.");
  assert.equal(summary.bucketContractVersion, storageBucketContractVersion, "Current bucket contract is required.");
  assert.deepEqual([...summary.buckets].sort(), [...requiredStorageBucketNames].sort(), "Complete bucket inventory is required.");
  assert.equal(summary.prefix, null, "A scoped export cannot claim a full backup.");
  assert.ok(Number.isSafeInteger(summary.objectCount) && summary.objectCount >= 0, "Invalid backup object count.");
  assert.ok(Number.isSafeInteger(summary.totalBytes) && summary.totalBytes >= 0, "Invalid backup byte count.");
  assert.equal(summary.sourceProjectFingerprint, storageProjectFingerprint(environment.NEXT_PUBLIC_SUPABASE_URL), "Backup project fingerprint mismatch.");
  assert.ok(Array.isArray(summary.missingBuckets), "Missing bucket inventory is required.");
  if (summary.missingBuckets.length) {
    assert.equal(environment.APP_ENV, "production", "Missing buckets require production bootstrap.");
    assert.equal(environment.STORAGE_BACKUP_ALLOW_EMPTY_FIRST_INSTALL, "true", "Empty first install must be explicitly selected.");
    assert.deepEqual([...summary.missingBuckets].sort(), [...requiredStorageBucketNames].sort(), "Mixed missing buckets are invalid.");
    assert.equal(summary.objectCount, 0, "Empty first install cannot contain objects.");
    assert.equal(summary.totalBytes, 0, "Empty first install cannot contain bytes.");
  }
  return summary;
}

export async function encryptAndVerifyBackup({ workDirectory, environment }, { execute = execFileSync } = {}) {
  assertPrivateWorkingDirectory(workDirectory);
  const archive = join(workDirectory, "storage-backup.tar.gz");
  const decrypted = join(workDirectory, "storage-backup.verified.tar.gz");
  const passphrase = join(workDirectory, "storage-backup-passphrase");
  const gpgHome = join(workDirectory, "gnupg");
  const encrypted = join(workDirectory, names.encrypted);
  const proofPath = join(workDirectory, names.proof);
  let verified = false;
  try {
    readSummary(workDirectory, environment);
    assert.ok(environment.STORAGE_BACKUP_PASSPHRASE?.length >= 32 && !/[\r\n]/.test(environment.STORAGE_BACKUP_PASSPHRASE), "Backup encryption requires a retained single-line secret of at least 32 characters.");
    mkdirSync(gpgHome, { mode: 0o700 });
    writeFileSync(passphrase, environment.STORAGE_BACKUP_PASSPHRASE, { mode: 0o600, flag: "wx" });
    const options = { stdio: "pipe" };
    execute("tar", ["-C", join(workDirectory, "objects"), "-czf", archive, "."], options);
    const args = ["--no-options", "--homedir", gpgHome, "--batch", "--yes", "--pinentry-mode", "loopback", "--no-symkey-cache", "--passphrase-file", passphrase];
    execute("gpg", [...args, "--symmetric", "--cipher-algo", "AES256", "--output", encrypted, archive], options);
    execute("gpg", [...args, "--decrypt", "--output", decrypted, encrypted], options);
    execute("cmp", [archive, decrypted], options);
    assert.ok(statSync(encrypted).size > 0, "Encrypted backup is empty.");
    const proof = { version: 1, purpose: "nxttrack-storage-encryption-proof", environment: environment.APP_ENV,
      cipherSha256: await hashFile(encrypted), summarySha256: await hashFile(join(workDirectory, names.summary)),
      decryptionByteVerified: true, encryption: "AES256" };
    writeFileSync(proofPath, `${JSON.stringify(proof)}\n`, { mode: 0o600, flag: "wx" });
    verified = true;
    return proof;
  } finally {
    for (const path of [archive, decrypted, passphrase, gpgHome, join(workDirectory, "objects")]) rmSync(path, { force: true, recursive: true });
    if (!verified) for (const path of [encrypted, proofPath]) rmSync(path, { force: true });
  }
}

export async function publishRetainedBackupHeartbeat({ status, workDirectory, environment }, { request = fetch } = {}) {
  assert.ok(["pass", "fail"].includes(status), "Unsupported backup heartbeat status.");
  const targetUrl = { staging: "https://staging.nxttrack.nl", production: "https://nxttrack.nl" }[environment.APP_ENV];
  assert.ok(targetUrl && environment.APP_URL === targetUrl, "Backup heartbeat URL does not match the requested environment.");
  assert.ok(environment.CRON_SECRET?.length >= 32, "Backup heartbeat authentication is missing.");
  let metadata;
  if (status === "pass") {
    assertPrivateWorkingDirectory(workDirectory);
    const summary = readSummary(workDirectory, environment);
    const proof = JSON.parse(readFileSync(join(workDirectory, names.proof), "utf8"));
    assert.equal(proof.version, 1, "Invalid encryption proof version.");
    assert.equal(proof.purpose, "nxttrack-storage-encryption-proof", "Invalid encryption proof purpose.");
    assert.equal(proof.environment, environment.APP_ENV, "Encryption proof environment mismatch.");
    assert.equal(proof.encryption, "AES256", "Unsupported encryption proof.");
    assert.equal(proof.decryptionByteVerified, true, "Decryption byte verification is missing.");
    assert.equal(proof.summarySha256, await hashFile(join(workDirectory, names.summary)), "Backup summary changed after verification.");
    assert.equal(proof.cipherSha256, await hashFile(join(workDirectory, names.encrypted)), "Encrypted backup changed after verification.");
    assert.match(environment.STORAGE_BACKUP_ARTIFACT_ID ?? "", /^[1-9][0-9]*$/, "Successful artifact upload evidence is required.");
    assert.match(environment.STORAGE_BACKUP_ARTIFACT_DIGEST ?? "", /^[a-f0-9]{64}$/, "Artifact digest is required.");
    metadata = { objectCount: summary.objectCount, bucketCount: summary.buckets.length, totalBytes: summary.totalBytes,
      sourceProjectFingerprint: summary.sourceProjectFingerprint, encrypted: true, decryptionByteVerified: true,
      cipherSha256: proof.cipherSha256, artifactId: environment.STORAGE_BACKUP_ARTIFACT_ID,
      artifactDigest: environment.STORAGE_BACKUP_ARTIFACT_DIGEST, retentionDays: 30 };
  } else {
    const stage = environment.STORAGE_BACKUP_FAILED_STAGE;
    metadata = { encryptedBackupRetained: false, failureStage: ["export", "encrypt", "upload", "heartbeat", "cancelled"].includes(stage) ? stage : "unknown" };
  }
  const response = await request(`${targetUrl}/api/internal/platform-health/heartbeat`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { authorization: `Bearer ${environment.CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ serviceKey: "storage_backup", status, detail: status === "pass"
      ? "Versleutelde Storage-back-up byte-gecontroleerd en als artifact opgeslagen."
      : "Versleutelde Storage-back-up niet als opgeslagen bevestigd.", ttlMinutes: status === "pass" ? 2160 : 120, metadata })
  });
  if (!response.ok || (await response.json()).accepted !== true) throw new Error("Backup heartbeat was not accepted.");
  return { status, artifactRetained: status === "pass" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const command = process.argv[2];
    assert.ok(process.env.STORAGE_BACKUP_WORK_DIR, "Backup working directory is required.");
    const input = { workDirectory: process.env.STORAGE_BACKUP_WORK_DIR, environment: process.env };
    if (command === "encrypt") await encryptAndVerifyBackup(input);
    else if (command === "pass" || command === "fail") await publishRetainedBackupHeartbeat({ ...input, status: command });
    else throw new Error("Expected encrypt, pass or fail.");
    console.log(`[storage:retention] ${command} completed.`);
  } catch {
    // Provider responses and child-process errors may contain credentials or
    // private paths. The workflow step identifies the failed stage already.
    console.error("[storage:retention] Verification or heartbeat failed; no success was recorded.");
    process.exitCode = 1;
  }
}
