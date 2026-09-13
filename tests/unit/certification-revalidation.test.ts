import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readReleaseCommitSha } from "../../scripts/release/assert-rollback-release.mjs";
import {
  assertStorageRestoreBinding,
  storageProjectFingerprint,
  validateStorageManifestBucketContract
} from "../../scripts/storage/storage-restore-contract.mjs";

function repositoryFile(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

test("dependency certification fails on moderate production advisories and pins fixed Tiptap packages", () => {
  const rootPackage = JSON.parse(repositoryFile("package.json")) as { scripts: Record<string, string> };
  const pinnedRootPackage = JSON.parse(repositoryFile("package.json")) as { devDependencies: Record<string, string> };
  const webPackage = JSON.parse(repositoryFile("apps/web/package.json")) as { dependencies: Record<string, string> };

  assert.match(rootPackage.scripts["security:audit-dependencies"], /--audit-level moderate/);
  assert.equal(pinnedRootPackage.devDependencies.supabase, "2.117.0", "Supabase CLI must be an exact current pin");
  for (const name of [
    "@tiptap/extension-link",
    "@tiptap/extension-placeholder",
    "@tiptap/react",
    "@tiptap/starter-kit"
  ]) {
    assert.equal(webPackage.dependencies[name], "3.31.3", `${name} must be pinned to one coherent fixed release`);
  }
});

test("certification deploy enters verified maintenance containment before any migration", () => {
  const deploy = repositoryFile(".github/workflows/deploy.yml");
  const containment = deploy.indexOf("Enter and verify certification maintenance containment");
  const migration = deploy.indexOf("Run database migrations");

  assert.notEqual(containment, -1);
  assert.ok(containment < migration);
  assert.match(deploy.slice(containment, migration), /systemctl restart/);
  assert.match(deploy.slice(containment, migration), /maintenance_no_write|503/);
  assert.match(deploy, /Snapshot and validate certification rollback target/);
  assert.ok(deploy.indexOf("Snapshot and validate certification rollback target") < migration);
});

test("preview rollback target has an ancestry-checked immutable release identity", () => {
  const deploy = repositoryFile(".github/workflows/deploy.yml");
  const assertion = repositoryFile("scripts/release/assert-rollback-release.mjs");

  assert.match(deploy, /release:assert-rollback-target/);
  assert.match(assertion, /541fe5fd6cee083cb809eef236382cfd2d519ed3/);
  assert.match(assertion, /merge-base/);
  assert.match(assertion, /--is-ancestor/);
  assert.match(assertion, /RELEASE_COMMIT_SHA/);
  assert.match(assertion, /exact-source-sha\.json/);

  const release = mkdtempSync(join(tmpdir(), "nxttrack-rollback-metadata-"));
  mkdirSync(join(release, "artifacts"));
  const sha = "a".repeat(40);
  writeFileSync(join(release, ".env"), `RELEASE_COMMIT_SHA=${sha}\n`);
  writeFileSync(join(release, "artifacts", "exact-source-sha.json"), JSON.stringify({
    purpose: "nxttrack-exact-source-sha",
    commitSha: sha
  }));
  assert.equal(readReleaseCommitSha(release), sha);
  writeFileSync(join(release, ".env"), `RELEASE_COMMIT_SHA=${"b".repeat(40)}\n`);
  assert.throws(() => readReleaseCommitSha(release), /different commits/);
});

test("exact-SHA maintenance previews execute a read-only browser smoke", () => {
  const deploy = repositoryFile(".github/workflows/deploy.yml");
  const smoke = repositoryFile("apps/web/tests/e2e/production-readiness-maintenance-preview.spec.ts");

  assert.match(deploy, /Production-readiness maintenance preview browser smoke/);
  assert.match(deploy, /test:production-readiness-preview:e2e/);
  assert.match(smoke, /page\.goto/);
  assert.match(smoke, /\/api\/health/);
  assert.doesNotMatch(smoke, /test\.skip/);
});

test("logical restore binds the source to exact repository migration lineage", () => {
  const script = repositoryFile("scripts/db/rehearse-logical-restore.sh");
  const bootstrap = repositoryFile("scripts/db/restore-target-bootstrap.sql");

  assert.match(script, /supabase_migrations\.schema_migrations/);
  assert.match(script, /expected_migration_fingerprint/);
  assert.match(script, /source_migration_fingerprint/);
  assert.match(script, /Source migration lineage does not match/);
  assert.ok(script.indexOf("Source migration lineage does not match") < script.indexOf("Creating a logical dump"));
  for (const extension of ["btree_gist", "pgcrypto", '"uuid-ossp"']) {
    assert.match(bootstrap, new RegExp(`create extension if not exists ${extension}`));
  }
});

test("Storage restore is explicitly bound and keeps historical manifest validation version-aware", () => {
  const backup = repositoryFile("scripts/storage/object-backup.mjs");
  const contract = repositoryFile("scripts/storage/storage-restore-contract.mjs");

  assert.match(backup, /assertStorageRestoreBinding/);
  assert.match(backup, /assertRestoreTargetsAbsent/);
  assert.match(backup, /removeObjects\(created\)/);
  assert.ok(
    backup.indexOf("assertRestoreTargetsAbsent") < backup.indexOf(".upload(entry.path"),
    "all target collisions must be checked before the first restore upload"
  );
  assert.match(contract, /STORAGE_RESTORE_SOURCE_PROJECT_FINGERPRINT/);
  assert.match(contract, /STORAGE_RESTORE_TARGET_PROJECT_FINGERPRINT/);
  assert.match(contract, /RESTORE_STORAGE_OBJECTS_/);
  assert.match(contract, /manifest\.version === 3/);
  assert.match(contract, /historical/i);

  const required = ["tenant-documents", "diploma-vault", "participant-media", "badge-studio-assets", "tenant-media-assets"];
  const allowed = new Set(required);
  assert.doesNotThrow(() => validateStorageManifestBucketContract({ version: 1, buckets: required.slice(0, 2) }, required, allowed));
  assert.throws(
    () => validateStorageManifestBucketContract({ version: 3, buckets: required.slice(0, 2) }, required, allowed),
    /complete required bucket contract/
  );

  const targetUrl = "https://target-project.supabase.co";
  const sourceFingerprint = storageProjectFingerprint("https://source-project.supabase.co");
  const targetFingerprint = storageProjectFingerprint(targetUrl);
  const environment = {
    APP_ENV: "staging",
    STORAGE_RESTORE_SOURCE_ENVIRONMENT: "production",
    STORAGE_RESTORE_SOURCE_PROJECT_FINGERPRINT: sourceFingerprint,
    STORAGE_RESTORE_TARGET_ENVIRONMENT: "staging",
    STORAGE_RESTORE_TARGET_PROJECT_FINGERPRINT: targetFingerprint,
    STORAGE_RESTORE_CONFIRMATION: `RESTORE_STORAGE_OBJECTS_${sourceFingerprint}_TO_${targetFingerprint}`
  };
  assert.deepEqual(
    assertStorageRestoreBinding({
      environment,
      manifest: { environment: "production", sourceProjectFingerprint: sourceFingerprint },
      targetUrl
    }),
    { sourceEnvironment: "production", sourceFingerprint, targetEnvironment: "staging", targetFingerprint }
  );
  assert.throws(
    () => assertStorageRestoreBinding({
      environment: { ...environment, STORAGE_RESTORE_TARGET_PROJECT_FINGERPRINT: "0".repeat(16) },
      manifest: { environment: "production", sourceProjectFingerprint: sourceFingerprint },
      targetUrl
    }),
    /target fingerprint/
  );
});

test("import-created Auth identities have additive corrective database controls", () => {
  const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url));
  const migrationName = migrations.find((name) => name.endsWith("_production_readiness_recertification.sql"));
  assert.ok(migrationName, "CLI-generated re-certification migration must exist");
  const migration = repositoryFile(`supabase/migrations/${migrationName}`);

  assert.match(migration, /import_auth_users/);
  assert.match(migration, /import_auth_users_for_job/);
  assert.match(migration, /import_auth_user_exists/);
  assert.match(migration, /auth_user_exists and auth_owner is distinct from invitation\.id::text/);
  assert.match(migration, /claim_import_auth_user_rollback/);
  assert.match(migration, /complete_import_auth_user_rollback/);
  assert.match(migration, /revoke all on function public\.claim_import_auth_user_rollback/);
  assert.match(migration, /grant execute on function public\.claim_import_auth_user_rollback[\s\S]*?service_role/);
});
