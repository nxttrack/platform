import { createHash, timingSafeEqual } from "node:crypto";

export function storageProjectFingerprint(url) {
  return createHash("sha256").update(new URL(url).hostname).digest("hex").slice(0, 16);
}

export function validateStorageManifestBucketContract(manifest, requiredBuckets, allowedBuckets) {
  if (manifest.version === 3) {
    if (manifest.buckets.length !== requiredBuckets.length
      || requiredBuckets.some((bucket) => !manifest.buckets.includes(bucket))) {
      throw new Error("Storage backup manifest does not cover the complete required bucket contract.");
    }
    return;
  }

  // Historical v1/v2 manifests intentionally supported a selected non-empty
  // subset. Preserve their recoverability without weakening the complete v3
  // five-bucket evidence contract used for every new export.
  if (manifest.buckets.length === 0 || manifest.buckets.some((bucket) => !allowedBuckets.has(bucket))) {
    throw new Error("Historical Storage backup manifest has an invalid bucket inventory.");
  }
}

export function assertStorageRestoreBinding({ environment, manifest, targetUrl }) {
  const sourceFingerprint = String(environment.STORAGE_RESTORE_SOURCE_PROJECT_FINGERPRINT ?? "").trim();
  const expectedTargetFingerprint = String(environment.STORAGE_RESTORE_TARGET_PROJECT_FINGERPRINT ?? "").trim();
  const sourceEnvironment = String(environment.STORAGE_RESTORE_SOURCE_ENVIRONMENT ?? "").trim();
  const targetEnvironment = String(environment.STORAGE_RESTORE_TARGET_ENVIRONMENT ?? "").trim();
  const targetFingerprint = storageProjectFingerprint(targetUrl);
  const expectedConfirmation = `RESTORE_STORAGE_OBJECTS_${sourceFingerprint}_TO_${targetFingerprint}`;

  for (const [label, value] of [
    ["source project", sourceFingerprint],
    ["target project", expectedTargetFingerprint]
  ]) {
    if (!/^[a-f0-9]{16}$/.test(value)) throw new Error(`Storage restore ${label} fingerprint is required.`);
  }
  if (!safeEqual(sourceFingerprint, String(manifest.sourceProjectFingerprint ?? ""))) {
    throw new Error("Storage restore source fingerprint does not match the backup manifest.");
  }
  if (!safeEqual(expectedTargetFingerprint, targetFingerprint)) {
    throw new Error("Storage restore target fingerprint does not match the configured Supabase project.");
  }
  if (!safeEqual(sourceEnvironment, String(manifest.environment ?? ""))) {
    throw new Error("Storage restore source environment does not match the backup manifest.");
  }
  if (!safeEqual(targetEnvironment, String(environment.APP_ENV ?? ""))) {
    throw new Error("Storage restore target environment does not match APP_ENV.");
  }
  if (!safeEqual(String(environment.STORAGE_RESTORE_CONFIRMATION ?? ""), expectedConfirmation)) {
    throw new Error(`STORAGE_RESTORE_CONFIRMATION must equal ${expectedConfirmation}.`);
  }

  return { sourceFingerprint, targetFingerprint, sourceEnvironment, targetEnvironment };
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
