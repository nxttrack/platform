import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { assertExactSourceSha } from "../../scripts/release/exact-source-artifact.mjs";
import { requiredStorageBucketNames } from "../../scripts/storage/storage-bucket-contract.mjs";

function repositoryFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("logical restore derives its table inventory from source and restored dumps", () => {
  const script = repositoryFile("scripts/db/rehearse-logical-restore.sh");
  const workflow = repositoryFile(".github/workflows/staging-backup-restore-rehearsal.yml");
  const forceRls = repositoryFile("scripts/db/verify-force-rls.mjs");
  assert.match(script, /source_public_table_count=.*source-counts\.txt/);
  assert.match(script, /public_table_count=.*target-counts\.txt/);
  assert.match(script, /public_table_count.*source_public_table_count/);
  assert.doesNotMatch(script, /EXPECTED_PUBLIC_TABLES|:-63|expected_public_tables/);
  assert.doesNotMatch(workflow, /EXPECTED_PUBLIC_TABLES|"63"/);
  assert.doesNotMatch(forceRls, /< 63|at least 63/);
});

test("Storage evidence covers the complete current five-bucket contract", () => {
  assert.deepEqual(requiredStorageBucketNames, [
    "tenant-documents",
    "diploma-vault",
    "participant-media",
    "badge-studio-assets",
    "tenant-media-assets"
  ]);
  const privateFiles = repositoryFile("apps/web/lib/storage/private-files.ts");
  const migrationsDirectory = new URL("../../supabase/migrations/", import.meta.url);
  const migrations = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .map((file) => readFileSync(new URL(file, migrationsDirectory), "utf8"))
    .join("\n");
  for (const bucket of requiredStorageBucketNames) {
    assert.match(privateFiles, new RegExp(`= "${bucket}"`));
    assert.match(migrations, new RegExp(`storage\\.buckets[\\s\\S]{0,800}'${bucket}'`));
  }
  const backup = repositoryFile("scripts/storage/object-backup.mjs");
  assert.match(backup, /bucketContractVersion: storageBucketContractVersion/);
  assert.match(backup, /entry\.file !== `objects\/\$\{entry\.bucket\}/);
  assert.doesNotMatch(backup, /participant-media\|badge-studio-assets/);
});

test("critical release and tenant-isolation suites fail configuration instead of skipping", () => {
  for (const path of [
    "apps/web/tests/e2e/sprint4-isolation.spec.ts",
    "apps/web/tests/e2e/premium-release-hardening.spec.ts"
  ]) {
    const source = repositoryFile(path);
    assert.match(source, /critical .+ configuration is present/);
    assert.match(source, /may not silently skip/);
    assert.doesNotMatch(source, /test\.skip\(!enabled/);
  }
});

test("release evidence requires and retains the exact checked-out SHA", () => {
  const sha = "a".repeat(40);
  assert.equal(assertExactSourceSha(sha.toUpperCase(), sha), sha);
  assert.throws(() => assertExactSourceSha("abc", sha), /full 40-character/);
  assert.throws(() => assertExactSourceSha("b".repeat(40), sha), /does not match/);

  const writer = repositoryFile("scripts/release/write-release-evidence.mjs");
  const ci = repositoryFile(".github/workflows/ci.yml");
  const deploy = repositoryFile(".github/workflows/deploy.yml");
  assert.match(writer, /resolveExactSourceSha\(\)/);
  assert.match(writer, /writeExactSourceArtifact/);
  assert.match(ci, /artifacts\/exact-source-sha\.json[\s\S]+if-no-files-found: error/);
  assert.match(deploy, /artifacts\/exact-source-sha\.json/);
  assert.match(deploy, /ref: \$\{\{ inputs\.staging_preview_sha \|\| github\.sha \}\}/);
  assert.match(deploy, /DEPLOYED_SOURCE_SHA: \$\{\{ inputs\.staging_preview_sha \|\| github\.sha \}\}/);
});
