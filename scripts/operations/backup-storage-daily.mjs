import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRuntimeEnvironment } from "./runtime-operations-contract.mjs";
import { requiredStorageBucketNames } from "../storage/storage-bucket-contract.mjs";
import { storageProjectFingerprint } from "../storage/storage-restore-contract.mjs";

export function assertCompleteBackupSummary(manifest, target, environment) {
  const complete = manifest.environment === target
    && manifest.sourceProjectFingerprint === storageProjectFingerprint(environment.NEXT_PUBLIC_SUPABASE_URL || environment.SUPABASE_URL)
    && manifest.prefix === null && Array.isArray(manifest.missingBuckets) && manifest.missingBuckets.length === 0
    && Array.isArray(manifest.buckets) && manifest.buckets.length === requiredStorageBucketNames.length
    && requiredStorageBucketNames.every((bucket) => manifest.buckets.includes(bucket))
    && Number.isInteger(manifest.objectCount) && manifest.objectCount >= 0;
  assert.ok(complete, "Daily Storage backup must contain every required bucket for this environment and project, without a scoped prefix.");
}

export async function createDailyBackup({ target, shared, environment, sourceRoot }, { execute = execFileSync, heartbeat = publishHeartbeat, now = () => new Date(), remove = rmSync } = {}) {
  let temp, partial, manifest;
  try {
    try {
      temp = mkdtempSync(join(shared, ".v4-storage-backup-"));
      const destination = join(shared, "storage-backups-v4");
      const timestamp = now().toISOString().replaceAll(":", "-").replaceAll(".", "-");
      const encrypted = join(destination, `${timestamp}.tar.gz.gpg`);
      partial = `${encrypted}.partial`;
      const options = { env: { ...process.env, ...environment,
        STORAGE_BACKUP_DIR: join(temp, "objects"), STORAGE_BACKUP_ALLOW_EMPTY_FIRST_INSTALL: "false",
        STORAGE_BACKUP_PREFIX: "", STORAGE_BACKUP_BUCKETS: requiredStorageBucketNames.join(","),
        STORAGE_BACKUP_DEFER_SUCCESS_HEARTBEAT: "true" }, stdio: "inherit" };
      const script = join(sourceRoot, "scripts/storage/object-backup.mjs");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      execute(process.execPath, [script, "export"], options);
      execute(process.execPath, [script, "verify-local"], options);
      const summary = execute(process.execPath, [script, "summary"], { ...options, stdio: "pipe", encoding: "utf8" });
      manifest = JSON.parse(summary);
      assertCompleteBackupSummary(manifest, target, environment);
      execute("tar", ["-C", join(temp, "objects"), "-czf", join(temp, "backup.tar.gz"), "."]);
      const encryption = ["--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-file", join(shared, "operations-v4/backup-passphrase")];
      execute("gpg", [...encryption, "--symmetric", "--cipher-algo", "AES256", "--output", partial, join(temp, "backup.tar.gz")]);
      execute("gpg", [...encryption, "--decrypt", "--output", join(temp, "verified.tar.gz"), partial]);
      execute("cmp", [join(temp, "backup.tar.gz"), join(temp, "verified.tar.gz")]);
      renameSync(partial, encrypted);
      writeFileSync(join(destination, `${timestamp}.summary.json`), summary, { mode: 0o600 });
      for (const file of readdirSync(destination)) {
        if (!/^\d{4}-.*\.(?:tar\.gz\.gpg|summary\.json)$/.test(file)) continue;
        const path = join(destination, file);
        if (statSync(path).mtimeMs < now().getTime() - 14 * 86_400_000) remove(path);
      }
    } finally {
      // Always attempt plaintext cleanup, even if ciphertext cleanup fails.
      try { if (partial) remove(partial, { force: true }); }
      finally { if (temp) remove(temp, { recursive: true, force: true }); }
    }
    await heartbeat(environment, "pass", { objectCount: manifest.objectCount, bucketCount: manifest.buckets.length, encrypted: true });
    return { at: now().toISOString(), target, status: "pass", encrypted: true, retentionDays: 14 };
  } catch (error) {
    await heartbeat(environment, "fail", { encryptedBackupVerified: false }).catch(() => {});
    throw error;
  }
}

async function publishHeartbeat(environment, status, metadata) {
  if (!environment.CRON_SECRET || environment.CRON_SECRET.length < 32) throw new Error("Backup heartbeat authentication is missing.");
  const response = await fetch(`${environment.APP_URL}/api/internal/platform-health/heartbeat`, {
    method: "POST", headers: { authorization: `Bearer ${environment.CRON_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ serviceKey: "storage_backup", status, detail: status === "pass" ? "Versleutelde Storage-back-up gecontroleerd en opgeslagen." : "Versleutelde Storage-back-up niet bevestigd.", ttlMinutes: status === "pass" ? 2160 : 120, metadata }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok || (await response.json()).accepted !== true) throw new Error("Backup heartbeat was not accepted.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  const { shared, environment } = readRuntimeEnvironment(target);
  const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  console.log(JSON.stringify(await createDailyBackup({ target, shared, environment, sourceRoot })));
}
