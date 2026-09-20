import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { encryptAndVerifyBackup, publishRetainedBackupHeartbeat } from "../../scripts/storage/retained-backup.mjs";
import { requiredStorageBucketNames, storageBucketContractVersion } from "../../scripts/storage/storage-bucket-contract.mjs";
import { storageProjectFingerprint } from "../../scripts/storage/storage-restore-contract.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/storage/retained-backup.mjs");
const sensitive = "private-parent@example.test secret-artifact-content";
function fixture() {
  const workDirectory = mkdtempSync(join(tmpdir(), "storage-backup-test-"));
  mkdirSync(join(workDirectory, "objects"));
  writeFileSync(join(workDirectory, "objects", "private-document.txt"), sensitive);
  const environment = { APP_ENV: "staging", APP_URL: "https://staging.nxttrack.nl", NEXT_PUBLIC_SUPABASE_URL: "https://fixture-project.supabase.co",
    CRON_SECRET: "private-authentication-value-".repeat(3), STORAGE_BACKUP_PASSPHRASE: "private-encryption-value-".repeat(3),
    STORAGE_BACKUP_ARTIFACT_ID: "123456", STORAGE_BACKUP_ARTIFACT_DIGEST: "c".repeat(64) };
  const summary = { version: 3, bucketContractVersion: storageBucketContractVersion, createdAt: "2026-09-20T00:00:00Z", environment: "staging", buckets: requiredStorageBucketNames,
    missingBuckets: [], prefix: null, objectCount: 1, totalBytes: Buffer.byteLength(sensitive),
    sourceProjectFingerprint: storageProjectFingerprint(environment.NEXT_PUBLIC_SUPABASE_URL) };
  writeFileSync(join(workDirectory, "storage-backup-summary.json"), JSON.stringify(summary));
  return { workDirectory, environment, summary, cleanup: () => rmSync(workDirectory, { recursive: true, force: true }) };
}
async function withFixture(run) {
  const item = fixture();
  try { await run(item); } finally { item.cleanup(); }
}

test("real tar/GPG roundtrip produces byte-verification evidence and removes plaintext and passphrase", async () => {
  await withFixture(async item => {
    const proof = await encryptAndVerifyBackup(item);
    assert.equal(proof.decryptionByteVerified, true);
    assert.match(proof.cipherSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(readdirSync(item.workDirectory).sort(), ["encryption-proof.json", "storage-backup-summary.json", "storage-backup.tar.gz.gpg"]);
    assert.equal(readFileSync(join(item.workDirectory, "storage-backup.tar.gz.gpg")).includes(Buffer.from(sensitive)), false);
    let published;
    await publishRetainedBackupHeartbeat({ ...item, status: "pass" }, { request: async (url, options) => {
      assert.equal(url, "https://staging.nxttrack.nl/api/internal/platform-health/heartbeat");
      assert.equal(options.headers.authorization, `Bearer ${item.environment.CRON_SECRET}`);
      assert.equal(options.redirect, "error");
      published = JSON.parse(options.body);
      return { ok: true, json: async () => ({ accepted: true }) };
    } });
    assert.equal(published.status, "pass");
    assert.equal(published.metadata.artifactId, "123456");
    assert.equal(published.metadata.retentionDays, 30);
    assert.equal(published.metadata.decryptionByteVerified, true);
    for (const secret of [sensitive, item.environment.CRON_SECRET, item.environment.STORAGE_BACKUP_PASSPHRASE]) {
      assert.equal(JSON.stringify(published).includes(secret), false);
      assert.equal(JSON.stringify(proof).includes(secret), false);
    }
  });
});

test("archive, encryption and decrypted-byte failures never leave a proof or plaintext behind", async () => {
  for (const stage of ["tar", "encrypt", "compare"]) {
    await withFixture(async item => {
      await assert.rejects(encryptAndVerifyBackup(item, { execute(command, args, options) {
        if (stage === "tar" && command === "tar") throw new Error("archive failure");
        if (stage === "encrypt" && command === "gpg" && args.includes("--symmetric")) throw new Error("encryption failure");
        const result = execFileSync(command, args, options);
        if (stage === "compare" && command === "gpg" && args.includes("--decrypt")) writeFileSync(join(item.workDirectory, "storage-backup.verified.tar.gz"), "corrupt decrypted archive");
        return result;
      } }));
      assert.deepEqual(readdirSync(item.workDirectory), ["storage-backup-summary.json"]);
    });
  }
});

test("success requires retained upload evidence and rejects altered cipher, summary or proof", async () => {
  await withFixture(async item => {
    await encryptAndVerifyBackup(item);
    let calls = 0;
    const request = async () => { calls++; return { ok: true, json: async () => ({ accepted: true }) }; };
    for (const patch of [{ STORAGE_BACKUP_ARTIFACT_ID: "" }, { STORAGE_BACKUP_ARTIFACT_DIGEST: "" }, { APP_URL: "https://nxttrack.nl" }]) {
      await assert.rejects(publishRetainedBackupHeartbeat({ ...item, environment: { ...item.environment, ...patch }, status: "pass" }, { request }));
    }
    for (const file of ["storage-backup.tar.gz.gpg", "storage-backup-summary.json", "encryption-proof.json"]) {
      const path = join(item.workDirectory, file);
      const original = readFileSync(path);
      writeFileSync(path, file.endsWith(".gpg") ? "changed encrypted bytes" : "{}");
      await assert.rejects(publishRetainedBackupHeartbeat({ ...item, status: "pass" }, { request }));
      writeFileSync(path, original);
    }
    assert.equal(calls, 0);
  });
});

test("failure heartbeat needs no archive and publishes only a bounded stage without private diagnostics", async () => {
  await withFixture(async item => {
    for (const stage of ["export", "encrypt", "upload", sensitive]) {
      let body;
      await publishRetainedBackupHeartbeat({ ...item, environment: { ...item.environment, STORAGE_BACKUP_FAILED_STAGE: stage }, status: "fail" }, { request: async (_url, options) => {
        body = JSON.parse(options.body);
        return { ok: true, json: async () => ({ accepted: true }) };
      } });
      assert.equal(body.status, "fail");
      assert.equal(body.metadata.encryptedBackupRetained, false);
      assert.equal(body.metadata.failureStage, stage === sensitive ? "unknown" : stage);
      assert.equal(JSON.stringify(body).includes(sensitive), false);
    }
  });
});

test("plaintext summary cannot include private object inventory or a scoped export", async () => {
  for (const patch of [{ objects: [{ email: sensitive }] }, { prefix: "private-tenant-folder" }]) {
    await withFixture(async item => {
      writeFileSync(join(item.workDirectory, "storage-backup-summary.json"), JSON.stringify({ ...item.summary, ...patch }));
      let executed = false;
      await assert.rejects(encryptAndVerifyBackup(item, { execute() { executed = true; } }));
      assert.equal(executed, false);
      assert.deepEqual(readdirSync(item.workDirectory), ["storage-backup-summary.json"]);
    });
  }
});

test("manual encryption rejects short or multiline secrets before any archive is created", async () => {
  for (const passphrase of ["too-short", `short\n${"x".repeat(40)}`, `${"x".repeat(40)}\r\n`]) {
    await withFixture(async item => {
      let executed = false;
      await assert.rejects(encryptAndVerifyBackup({ ...item, environment: { ...item.environment, STORAGE_BACKUP_PASSPHRASE: passphrase } }, { execute() { executed = true; } }), /single-line secret/);
      assert.equal(executed, false);
      assert.deepEqual(readdirSync(item.workDirectory), ["storage-backup-summary.json"]);
    });
  }
});

test("CLI suppresses credentials even when a failed transport error embeds authorization headers", async () => {
  await withFixture(async item => {
    await encryptAndVerifyBackup(item);
    const injectedFetch = join(item.workDirectory, "private-failing-fetch.mjs");
    writeFileSync(injectedFetch, 'globalThis.fetch = async (_url, options) => { throw new Error(JSON.stringify(options.headers)); };');
    const result = spawnSync(process.execPath, ["--import", injectedFetch, script, "pass"], {
      cwd: root, encoding: "utf8", env: { ...process.env, ...item.environment, STORAGE_BACKUP_WORK_DIR: item.workDirectory }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no success was recorded/);
    for (const privateValue of [item.environment.CRON_SECRET, item.environment.STORAGE_BACKUP_PASSPHRASE, "authorization", sensitive]) {
      assert.equal((result.stdout + result.stderr).includes(privateValue), false);
    }
  });
});

test("manual workflow defers success until upload and always cleans temporary backup material", () => {
  const workflow = readFileSync(join(root, ".github/workflows/storage-object-backup.yml"), "utf8");
  assert.match(workflow, /STORAGE_BACKUP_DEFER_SUCCESS_HEARTBEAT: "true"/);
  assert.ok(workflow.indexOf("retained-backup.mjs encrypt") < workflow.indexOf("uses: actions\/upload-artifact@v6"));
  assert.ok(workflow.indexOf("uses: actions\/upload-artifact@v6") < workflow.indexOf("retained-backup.mjs pass"));
  assert.match(workflow, /STORAGE_BACKUP_ARTIFACT_ID: \$\{\{ steps\.retain\.outputs\.artifact-id \}\}/);
  assert.match(workflow, /STORAGE_BACKUP_ARTIFACT_DIGEST: \$\{\{ steps\.retain\.outputs\.artifact-digest \}\}/);
  assert.match(workflow, /Record failed or cancelled backup[\s\S]*?always\(\)[\s\S]*?retained-backup\.mjs fail/);
  assert.match(workflow, /Remove all temporary backup material\n\s+if: always\(\)/);
  assert.match(workflow, /rm -rf -- "\$STORAGE_BACKUP_WORK_DIR"/);
});
