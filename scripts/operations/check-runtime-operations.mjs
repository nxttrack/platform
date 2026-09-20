import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import { pathToFileURL } from "node:url";
import { requiredStorageBucketNames } from "../storage/storage-bucket-contract.mjs";
import { storageProjectFingerprint } from "../storage/storage-restore-contract.mjs";
import { runtimeTarget, scheduledJobs, validateRuntimeEnvironment } from "./runtime-operations-contract.mjs";

export function assessWorkerLog(text, expectedRoutes, now = Date.now()) {
  const latest = new Map();
  for (const line of text.split(/\r?\n/)) {
    try { const value = JSON.parse(line); if (value.route && value.at) latest.set(value.route, value); } catch { /* Old stderr is not proof of a successful tick. */ }
  }
  return expectedRoutes.every((route) => {
    const event = latest.get(route), age = now - Date.parse(event?.at ?? "");
    return event?.status === "pass" && age >= -60_000 && age < 5 * 60_000;
  });
}

export function assessBackupSummary(summary, target, url, now = Date.now()) {
  const age = now - Date.parse(summary.createdAt);
  return summary.environment === target && summary.sourceProjectFingerprint === storageProjectFingerprint(url)
    && summary.buckets?.length === requiredStorageBucketNames.length
    && requiredStorageBucketNames.every((bucket) => summary.buckets.includes(bucket))
    && Array.isArray(summary.missingBuckets) && summary.missingBuckets.length === 0
    && summary.prefix === null && age >= -5 * 60_000 && age < 36 * 3_600_000;
}

export async function checkRuntimeOperations(target, { execute = execFileSync, fetchImpl = fetch } = {}) {
  const config = runtimeTarget(target), checks = [], details = {};
  const check = (id, condition) => checks.push({ id, status: condition ? "pass" : "fail" });
  const commandPasses = (command, args) => { try { execute(command, args, { stdio: "ignore" }); return true; } catch { return false; } };
  const environment = parseEnv(readFileSync(join(config.shared, ".env"), "utf8"));
  validateRuntimeEnvironment(target, environment);
  check("maintenance-disabled", environment.MAINTENANCE_NO_WRITE !== "true");
  check("internal-jobs-enabled", environment.INTERNAL_JOBS_ENABLED === "true");
  check("service-active", commandPasses("systemctl", ["is-active", "--quiet", `nxttrack-${target}`]));
  check("service-enabled", commandPasses("systemctl", ["is-enabled", "--quiet", `nxttrack-${target}`]));
  check("cron-active", commandPasses("systemctl", ["is-active", "--quiet", "cron"]));
  const current = realpathSync(join(config.base, "current"));
  const identity = JSON.parse(readFileSync(join(current, "artifacts/exact-source-sha.json"), "utf8"));
  check("immutable-release-matches-env", identity.commitSha === environment.RELEASE_COMMIT_SHA);
  details.releaseSha = identity.commitSha;
  const response = await fetchImpl(`${config.url}/api/health`, { signal: AbortSignal.timeout(20_000) });
  const health = await response.json();
  check("public-runtime-health", response.ok && health.ok && health.env === target && health.commitSha === identity.commitSha
    && health.checks?.database?.status === "pass" && health.checks?.schemaCompatibility?.status === "pass");
  const crontab = execute("crontab", ["-l"], { encoding: "utf8" });
  for (const [name, tag] of [["workers", `# nxttrack-v4-${target}`], ["backup", `# nxttrack-v4-storage-${target}`]]) {
    const entries = crontab.split(/\r?\n/).filter((line) => line.trimEnd().endsWith(tag));
    check(`${name}-single-schedule`, entries.length === 1 && entries[0].includes("flock"));
  }
  const jobs = scheduledJobs(environment);
  const log = execute("tail", ["-n", "80", join(config.shared, "v4-recurring-jobs.log")], { encoding: "utf8" });
  check("recent-successful-worker-ticks", jobs.length > 0 && assessWorkerLog(log, jobs.map((job) => job.route)));
  const keyFile = join(config.shared, "operations-v4/backup-passphrase");
  check("backup-key-private", existsSync(keyFile) && (statSync(keyFile).mode & 0o077) === 0 && statSync(keyFile).size >= 32);
  const backupDirectory = join(config.shared, "storage-backups-v4");
  const summaryName = existsSync(backupDirectory) ? readdirSync(backupDirectory).filter((file) => file.endsWith(".summary.json")).sort().at(-1) : null;
  let backupValid = false;
  if (summaryName) {
    const summary = JSON.parse(readFileSync(join(backupDirectory, summaryName), "utf8"));
    const archive = join(backupDirectory, summaryName.replace(/\.summary\.json$/, ".tar.gz.gpg"));
    backupValid = assessBackupSummary(summary, target, environment.NEXT_PUBLIC_SUPABASE_URL)
      && existsSync(archive) && statSync(archive).size > 0;
    details.latestBackup = { createdAt: summary.createdAt, buckets: summary.buckets?.length, objects: summary.objectCount, encryptedArchivePresent: existsSync(archive) };
  }
  check("fresh-complete-encrypted-backup", backupValid);
  const installed = join(config.shared, "operations-v4/current/manifest.json");
  details.operationsMode = existsSync(installed) ? "versioned" : "legacy-v4-installed";
  return { target, checkedAt: new Date().toISOString(), ready: checks.every((item) => item.status === "pass"), checks, details };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkRuntimeOperations(process.argv[2]);
  if (process.env.OPERATIONS_AUDIT_OUTPUT) {
    mkdirSync(dirname(process.env.OPERATIONS_AUDIT_OUTPUT), { recursive: true });
    writeFileSync(process.env.OPERATIONS_AUDIT_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
