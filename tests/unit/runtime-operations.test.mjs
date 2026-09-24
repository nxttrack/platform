import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cronEntries, reconcileCrontab, scheduledJobs, validateRuntimeEnvironment } from "../../scripts/operations/runtime-operations-contract.mjs";
import { runScheduledJobs } from "../../scripts/operations/run-scheduled-jobs.mjs";
import { assertCompleteBackupSummary, createDailyBackup } from "../../scripts/operations/backup-storage-daily.mjs";
import { installRuntimeOperations, installTargetCrontab, readCrontab, validateCandidateOperationsEnvironment } from "../../scripts/operations/install-runtime-operations.mjs";
import { assessBackupSummary, assessWorkerLog } from "../../scripts/operations/check-runtime-operations.mjs";
import { requiredStorageBucketNames } from "../../scripts/storage/storage-bucket-contract.mjs";
import { storageProjectFingerprint } from "../../scripts/storage/storage-restore-contract.mjs";

const environment = {
  APP_ENV: "staging", APP_URL: "https://staging.nxttrack.nl", RELEASE_COMMIT_SHA: "a".repeat(40),
  MAINTENANCE_NO_WRITE: "false", INTERNAL_JOBS_ENABLED: "true", EMAIL_SENDING_ENABLED: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  CRON_SECRET: "c".repeat(40), BILLING_AUTOMATION_SECRET: "b".repeat(40)
};

test("runtime jobs respect containment and never cross environments", async () => {
  assert.throws(() => validateRuntimeEnvironment("production", environment), /environment/);
  assert.deepEqual(scheduledJobs({ ...environment, MAINTENANCE_NO_WRITE: "true" }), []);
  assert.deepEqual(scheduledJobs({ ...environment, INTERNAL_JOBS_ENABLED: "false" }), []);
  assert.equal(scheduledJobs({ ...environment, EMAIL_SENDING_ENABLED: "false" }).length, 2);
  let calls = 0;
  await runScheduledJobs("staging", { ...environment, MAINTENANCE_NO_WRITE: "true" }, { fetchImpl: async () => { calls++; } });
  assert.equal(calls, 0);
});

test("one failed job does not prevent other queues from being processed or expose provider messages", async () => {
  const calls = [], logs = [];
  await assert.rejects(runScheduledJobs("staging", environment, {
    fetchImpl: async (url, options) => {
      calls.push(url);
      assert.equal(options.method, "POST");
      assert.ok(options.headers.authorization.startsWith("Bearer "));
      if (calls.length === 1) throw new Error(`private diagnostic ${environment.CRON_SECRET}`);
      return { ok: true, json: async () => ({ accepted: true, processed: 1 }) };
    }, log: (message) => logs.push(message)
  }), /1 scheduled job/);
  assert.equal(calls.length, 3);
  assert.deepEqual(logs.map((entry) => JSON.parse(entry).status), ["fail", "pass", "pass"]);
  assert.ok(!logs.join("\n").includes(environment.CRON_SECRET));
});

test("cron installation is idempotent and preserves other environments, comments and jobs", () => {
  const production = cronEntries("production", "/opt/node/bin/node");
  const old = ["# managed by someone else", "0 5 * * * /custom/backup", ...production,
    "* * * * * old-staging # nxttrack-v4-staging", "37 2 * * * old-backup # nxttrack-v4-storage-staging", ""].join("\n");
  const staging = cronEntries("staging", "/opt/node/bin/node");
  const updated = reconcileCrontab(old, "staging", staging);
  for (const entry of production) assert.ok(updated.includes(entry));
  assert.ok(updated.includes("# managed by someone else\n0 5 * * * /custom/backup"));
  assert.ok(!updated.includes("old-staging"));
  assert.equal(reconcileCrontab(updated, "staging", staging), updated);
  assert.throws(() => cronEntries("staging", "/bin/node%injected"), /Unsafe cron/);
});

test("backup failure removes private plaintext and incomplete archive without publishing success", async () => {
  const shared = mkdtempSync(join(tmpdir(), "nxttrack-backup-failure-"));
  const statuses = [];
  try {
    await assert.rejects(createDailyBackup({ target: "staging", shared, environment, sourceRoot: "/fixture" }, {
      execute: (command, args, options) => {
        if (command === process.execPath && args[1] === "export") {
          mkdirSync(options.env.STORAGE_BACKUP_DIR);
          writeFileSync(join(options.env.STORAGE_BACKUP_DIR, "private.txt"), "private object bytes");
        }
        if (command === process.execPath && args[1] === "summary") return JSON.stringify(completeSummary());
        if (command === "gpg") {
          writeFileSync(args[args.indexOf("--output") + 1], "incomplete ciphertext");
          throw new Error("Encryption process failed.");
        }
      }, heartbeat: async (_env, status) => statuses.push(status)
    }), /Encryption process failed/);
    assert.deepEqual(statuses, ["fail"]);
    assert.deepEqual(readdirSync(shared), ["storage-backups-v4"]);
    assert.deepEqual(readdirSync(join(shared, "storage-backups-v4")), []);
  } finally { rmSync(shared, { recursive: true, force: true }); }
});

test("readiness rejects stale, failed, missing or wrong-project operational evidence", () => {
  const now = Date.parse("2026-09-20T10:00:00Z");
  const event = (route, status = "pass", at = "2026-09-20T09:59:00Z") => JSON.stringify({ route, status, at });
  assert.equal(assessWorkerLog(event("/one"), ["/one"], now), true);
  assert.equal(assessWorkerLog(event("/one"), ["/one", "/two"], now), false);
  assert.equal(assessWorkerLog(`${event("/one")}\n${event("/one", "fail")}`, ["/one"], now), false);
  assert.equal(assessWorkerLog(event("/one", "pass", "2026-09-20T09:00:00Z"), ["/one"], now), false);
  const url = "https://fixture.supabase.co";
  const summary = { environment: "staging", sourceProjectFingerprint: storageProjectFingerprint(url), buckets: requiredStorageBucketNames,
    createdAt: "2026-09-20T02:37:00Z", missingBuckets: [], prefix: null };
  assert.equal(assessBackupSummary(summary, "staging", url, now), true);
  assert.equal(assessBackupSummary(summary, "production", url, now), false);
  assert.equal(assessBackupSummary(summary, "staging", "https://other.supabase.co", now), false);
  assert.equal(assessBackupSummary({ ...summary, buckets: requiredStorageBucketNames.slice(0, 5) }, "staging", url, now), false);
  assert.equal(assessBackupSummary({ ...summary, prefix: "rehearsal" }, "staging", url, now), false);
  assert.equal(assessBackupSummary({ ...summary, createdAt: "2026-09-18T02:37:00Z" }, "staging", url, now), false);
});

function completeSummary() {
  return { environment: "staging", sourceProjectFingerprint: storageProjectFingerprint(environment.NEXT_PUBLIC_SUPABASE_URL),
    prefix: null, missingBuckets: [], objectCount: 1, buckets: requiredStorageBucketNames };
}

test("candidate operations config is checked before activation and invalid cron reads fail closed", () => {
  validateCandidateOperationsEnvironment("staging", environment);
  assert.throws(() => validateCandidateOperationsEnvironment("production", environment), /environment/);
  assert.throws(() => validateCandidateOperationsEnvironment("staging", { ...environment, CRON_SECRET: "" }), /authentication/);
  assert.throws(() => validateCandidateOperationsEnvironment("staging", { ...environment, BILLING_AUTOMATION_SECRET: "" }), /authentication/);
  assert.throws(() => installRuntimeOperations("staging", {}), /host-wide installation lock/);
  assert.equal(readCrontab(() => ({ status: 1, stderr: "no crontab for runner" })), "");
  assert.throws(() => readCrontab(() => ({ status: 2, stderr: "secret diagnostic" })), /Could not read the existing crontab/);
});

test("installer preserves outside-lock edits made before its cron write", () => {
  let current = "# existing cron\n", writes = 0, restored = false;
  assert.throws(() => installTargetCrontab({ target: "staging", entries: cronEntries("staging", "/node"),
    read: () => current, write: () => { writes++; },
    publish: () => { current += "0 0 * * * /new/operator/job\n"; }, rollback: () => { restored = true; }
  }), /changed during operations installation/);
  assert.equal(writes, 0);
  assert.equal(restored, true);
  assert.ok(current.includes("/new/operator/job"));
});

test("failed readback rolls back only its own cron tags and never logs other cron credentials", () => {
  const oldOwn = "* * * * * old-staging # nxttrack-v4-staging";
  const secretJob = "0 1 * * * /other --token=private-do-not-log";
  const production = cronEntries("production", "/node");
  let current = [oldOwn, ...production, ""].join("\n"), writes = 0, restored = false;
  let failure;
  try {
    installTargetCrontab({ target: "staging", entries: cronEntries("staging", "/node"),
      read: () => current, write: (value) => { writes++; current = value + (writes === 1 ? `${secretJob}\n` : ""); },
      publish: () => {}, rollback: () => { restored = true; }
    });
  } catch (error) { failure = error; }
  assert.match(failure?.message ?? "", /differs from the requested entries/);
  assert.ok(!String(failure).includes("private-do-not-log"));
  assert.equal(writes, 2);
  assert.equal(restored, true);
  assert.ok(current.includes(oldOwn));
  assert.ok(current.includes(secretJob));
  for (const entry of production) assert.ok(current.includes(entry));
});

test("successful target cron publication reads back without changing other targets", () => {
  const production = cronEntries("production", "/node");
  let current = [...production, ""].join("\n"), published = false;
  installTargetCrontab({ target: "staging", entries: cronEntries("staging", "/node"), read: () => current,
    write: (value) => { current = value; }, publish: () => { published = true; }, rollback: () => assert.fail("Unexpected rollback") });
  assert.equal(published, true);
  for (const entry of production) assert.ok(current.includes(entry));
  for (const entry of cronEntries("staging", "/node")) assert.ok(current.includes(entry));
});

test("daily summary refuses scoped, incomplete, missing-bucket and wrong-project exports", () => {
  const summary = completeSummary();
  assertCompleteBackupSummary(summary, "staging", environment);
  for (const invalid of [
    { ...summary, prefix: "backup-rehearsal/test" },
    { ...summary, environment: "production" },
    { ...summary, sourceProjectFingerprint: "different" },
    { ...summary, buckets: requiredStorageBucketNames.slice(0, 5) },
    { ...summary, missingBuckets: [requiredStorageBucketNames[0]] },
    { ...summary, buckets: [...requiredStorageBucketNames.slice(0, -1), requiredStorageBucketNames[0]] }
  ]) assert.throws(() => assertCompleteBackupSummary(invalid, "staging", environment), /every required bucket/);
});

test("daily export overrides inherited rehearsal scope and publishes only after verification and cleanup", async (t) => {
  const shared = mkdtempSync(join(tmpdir(), "nxttrack-backup-success-"));
  t.after(() => rmSync(shared, { recursive: true, force: true }));
  const statuses = [], commands = [];
  const result = await createDailyBackup({ target: "staging", shared, environment: { ...environment, STORAGE_BACKUP_PREFIX: "rehearsal", STORAGE_BACKUP_BUCKETS: "tenant-documents" }, sourceRoot: "/fixture" }, {
    execute: (command, args, options) => {
      commands.push(command);
      if (command === process.execPath && args[1] === "export") {
        assert.equal(options.env.STORAGE_BACKUP_PREFIX, "");
        assert.equal(options.env.STORAGE_BACKUP_BUCKETS, requiredStorageBucketNames.join(","));
        assert.equal(options.env.STORAGE_BACKUP_DEFER_SUCCESS_HEARTBEAT, "true");
        mkdirSync(options.env.STORAGE_BACKUP_DIR);
        writeFileSync(join(options.env.STORAGE_BACKUP_DIR, "private.txt"), "private bytes");
      }
      if (command === process.execPath && args[1] === "summary") return JSON.stringify(completeSummary());
      if (command === "gpg") writeFileSync(args[args.indexOf("--output") + 1], "verified fixture bytes");
    }, heartbeat: async (_env, status) => {
      statuses.push(status);
      assert.deepEqual(readdirSync(shared), ["storage-backups-v4"], "Plaintext is removed before success is published");
      assert.ok(readdirSync(join(shared, "storage-backups-v4")).some((file) => file.endsWith(".tar.gz.gpg")));
    }
  });
  assert.equal(result.status, "pass");
  assert.ok(commands.includes("cmp"));
  assert.deepEqual(statuses, ["pass"]);
});

test("backup setup failure removes its temporary directory", async (t) => {
  const shared = mkdtempSync(join(tmpdir(), "nxttrack-backup-setup-"));
  t.after(() => rmSync(shared, { recursive: true, force: true }));
  writeFileSync(join(shared, "storage-backups-v4"), "occupied path");
  const statuses = [];
  await assert.rejects(createDailyBackup({ target: "staging", shared, environment, sourceRoot: "/fixture" }, {
    execute: () => assert.fail("Setup must fail before export"), heartbeat: async (_env, status) => statuses.push(status)
  }));
  assert.deepEqual(readdirSync(shared), ["storage-backups-v4"]);
  assert.deepEqual(statuses, ["fail"]);
});

test("ciphertext cleanup failure still removes plaintext and cannot publish success", async (t) => {
  const shared = mkdtempSync(join(tmpdir(), "nxttrack-backup-cleanup-"));
  t.after(() => rmSync(shared, { recursive: true, force: true }));
  const statuses = [];
  await assert.rejects(createDailyBackup({ target: "staging", shared, environment, sourceRoot: "/fixture" }, {
    execute: (command, args, options) => {
      if (command === process.execPath && args[1] === "export") {
        mkdirSync(options.env.STORAGE_BACKUP_DIR);
        writeFileSync(join(options.env.STORAGE_BACKUP_DIR, "private.txt"), "private bytes");
        throw new Error("Export aborted");
      }
    }, remove: (file, options) => {
      if (file.endsWith(".partial")) throw new Error("Ciphertext cleanup failed");
      rmSync(file, options);
    }, heartbeat: async (_env, status) => statuses.push(status)
  }), /Ciphertext cleanup failed/);
  assert.deepEqual(readdirSync(shared), ["storage-backups-v4"]);
  assert.deepEqual(statuses, ["fail"]);
});
