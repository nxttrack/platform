#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const allowedBuckets = new Set(["tenant-documents", "diploma-vault"]);
const buckets = parseBuckets(process.env.STORAGE_BACKUP_BUCKETS ?? "tenant-documents,diploma-vault");
const command = process.argv[2];
const backupDirectory = resolve(process.env.STORAGE_BACKUP_DIR ?? "artifacts/storage-backup");
const scopedPrefix = normalizePrefix(process.env.STORAGE_BACKUP_PREFIX ?? "");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseSecret) {
  fatal("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
}

if (!["staging", "production"].includes(process.env.APP_ENV ?? "")) {
  fatal("APP_ENV must be staging or production.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

try {
  if (command === "export") {
    output(await exportObjects());
  } else if (command === "verify-local") {
    output(await verifyLocalBackup());
  } else if (command === "restore") {
    requireConfirmation("STORAGE_RESTORE_CONFIRMATION", "RESTORE_STORAGE_OBJECTS");
    output(await restoreObjects());
  } else if (command === "verify-remote") {
    output(await verifyRemoteObjects());
  } else if (command === "seed-rehearsal") {
    requireStagingRehearsal();
    output(await seedRehearsal());
  } else if (command === "delete-rehearsal") {
    requireStagingRehearsal();
    output(await deleteRehearsalObjects());
  } else if (command === "summary") {
    output(await createSummary());
  } else {
    fatal("Expected export, verify-local, restore, verify-remote, seed-rehearsal, delete-rehearsal or summary.");
  }
} catch (error) {
  fatal(error instanceof Error ? error.message : String(error));
}

async function exportObjects() {
  await assertNewBackupDirectory();
  const entries = [];

  for (const bucket of buckets) {
    await assertBucketExists(bucket);
    const remoteObjects = await listAllObjects(bucket, scopedPrefix);

    for (const remoteObject of remoteObjects) {
      const bytes = await downloadObject(bucket, remoteObject.path);
      const storageName = `${sha256(`${bucket}\0${remoteObject.path}`)}.bin`;
      const relativeFile = join("objects", bucket, storageName);
      const absoluteFile = join(backupDirectory, relativeFile);
      await mkdir(dirname(absoluteFile), { recursive: true, mode: 0o700 });
      await writeFile(absoluteFile, bytes, { mode: 0o600 });

      entries.push({
        bucket,
        path: remoteObject.path,
        file: relativeFile.replaceAll("\\", "/"),
        size: bytes.length,
        sha256: sha256(bytes),
        contentType: remoteObject.contentType,
        cacheControl: remoteObject.cacheControl
      });
    }
  }

  entries.sort((left, right) => `${left.bucket}/${left.path}`.localeCompare(`${right.bucket}/${right.path}`));
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceProjectFingerprint: sha256(new URL(supabaseUrl).hostname).slice(0, 16),
    environment: process.env.APP_ENV,
    buckets,
    prefix: scopedPrefix || null,
    objectCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
    objects: entries
  };
  const manifestPath = join(backupDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(backupDirectory, "manifest.sha256"), `${sha256(await readFile(manifestPath))}  manifest.json\n`, {
    mode: 0o600
  });
  return summarizeManifest(manifest);
}

async function verifyLocalBackup() {
  const manifest = await readManifest();
  const seenObjects = new Set();
  const seenFiles = new Set();
  let totalBytes = 0;

  for (const entry of manifest.objects) {
    validateManifestEntry(entry);
    const objectKey = `${entry.bucket}\0${entry.path}`;

    if (seenObjects.has(objectKey) || seenFiles.has(entry.file)) {
      throw new Error("Backup manifest contains duplicate object or file entries.");
    }

    seenObjects.add(objectKey);
    seenFiles.add(entry.file);
    const bytes = await readFile(resolveBackupFile(entry.file));

    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error("Backup object size or checksum mismatch.");
    }

    totalBytes += bytes.length;
  }

  if (manifest.objectCount !== manifest.objects.length || manifest.totalBytes !== totalBytes) {
    throw new Error("Backup manifest totals do not match its object entries.");
  }

  const expectedManifestChecksum = (await readFile(join(backupDirectory, "manifest.sha256"), "utf8"))
    .trim()
    .split(/\s+/)[0];
  const actualManifestChecksum = sha256(await readFile(join(backupDirectory, "manifest.json")));

  if (expectedManifestChecksum !== actualManifestChecksum) {
    throw new Error("Backup manifest checksum mismatch.");
  }

  return summarizeManifest(manifest);
}

async function restoreObjects() {
  const manifest = await readManifest();
  await verifyLocalBackup();

  for (const entry of manifest.objects) {
    const bytes = await readFile(resolveBackupFile(entry.file));
    const options = {
      upsert: false,
      ...(entry.contentType ? { contentType: entry.contentType } : {}),
      ...(entry.cacheControl ? { cacheControl: entry.cacheControl } : {})
    };
    const { error } = await admin.storage.from(entry.bucket).upload(entry.path, bytes, options);

    if (error) {
      throw new Error(`Restore refused or failed for an object in ${entry.bucket}: ${error.message}`);
    }
  }

  return summarizeManifest(manifest);
}

async function verifyRemoteObjects() {
  const manifest = await readManifest();

  for (const entry of manifest.objects) {
    const bytes = await downloadObject(entry.bucket, entry.path);

    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) {
      throw new Error(`Remote object verification failed in ${entry.bucket}.`);
    }
  }

  return summarizeManifest(manifest);
}

async function seedRehearsal() {
  const created = [];

  try {
    for (const bucket of buckets) {
      await assertBucketExists(bucket);
      const path = `${scopedPrefix}/probe.pdf`;
      const bytes = Buffer.from(
        `%PDF-1.4\n% NXTTRACK controlled storage restore rehearsal\n% bucket=${bucket}\n%%EOF\n`,
        "utf8"
      );
      const { error } = await admin.storage.from(bucket).upload(path, bytes, {
        contentType: "application/pdf",
        cacheControl: "60",
        upsert: false
      });

      if (error) throw new Error(`Could not seed rehearsal object in ${bucket}: ${error.message}`);
      created.push({ bucket, path });
    }
  } catch (error) {
    await removeObjects(created);
    throw error;
  }

  return { buckets, prefix: scopedPrefix, objectCount: created.length };
}

async function deleteRehearsalObjects() {
  const objects = buckets.map((bucket) => ({ bucket, path: `${scopedPrefix}/probe.pdf` }));
  await removeObjects(objects);
  return { buckets, prefix: scopedPrefix, objectCount: objects.length };
}

async function createSummary() {
  const manifest = await readManifest();
  await verifyLocalBackup();
  return summarizeManifest(manifest);
}

async function listAllObjects(bucket, prefix) {
  const objects = [];
  let cursor;

  do {
    const { data, error } = await admin.storage.from(bucket).listV2({
      prefix: prefix ? `${prefix}/` : "",
      cursor,
      limit: 1000,
      with_delimiter: false,
      sortBy: { column: "name", order: "asc" }
    });

    if (error || !data) {
      throw new Error(`Could not list ${bucket}: ${error?.message ?? "missing response"}`);
    }

    for (const entry of data.objects) {
      let path = entry.key || entry.name;
      if (path.startsWith(`${bucket}/`)) path = path.slice(bucket.length + 1);
      if (prefix && !path.startsWith(`${prefix}/`)) path = `${prefix}/${entry.name}`;

      objects.push({
        path,
        contentType: entry.metadata?.mimetype ?? null,
        cacheControl: normalizeCacheControl(entry.metadata?.cacheControl)
      });
    }

    cursor = data.hasNext ? data.nextCursor : undefined;
    if (data.hasNext && !cursor) throw new Error(`Storage pagination for ${bucket} did not return a cursor.`);
  } while (cursor);

  return objects;
}

async function downloadObject(bucket, path) {
  const { data, error } = await admin.storage.from(bucket).download(path);

  if (error || !data) {
    throw new Error(`Could not download an object from ${bucket}: ${error?.message ?? "missing response"}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

async function removeObjects(objects) {
  for (const bucket of buckets) {
    const paths = objects.filter((entry) => entry.bucket === bucket).map((entry) => entry.path);

    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(offset, offset + 100));
      if (error) throw new Error(`Could not remove controlled rehearsal objects from ${bucket}: ${error.message}`);
    }
  }
}

async function assertBucketExists(bucket) {
  const { data, error } = await admin.storage.getBucket(bucket);
  if (error || !data) throw new Error(`Required private bucket ${bucket} is unavailable.`);
  if (data.public) throw new Error(`Required bucket ${bucket} must remain private.`);
}

async function assertNewBackupDirectory() {
  try {
    const info = await stat(backupDirectory);
    if (!info.isDirectory() || (await readdir(backupDirectory)).length > 0) {
      throw new Error("Backup output directory must be absent or empty.");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(join(backupDirectory, "manifest.json"), "utf8"));

  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.objects) ||
    !Array.isArray(manifest.buckets) ||
    !Number.isInteger(manifest.objectCount) ||
    !Number.isInteger(manifest.totalBytes)
  ) {
    throw new Error("Unsupported or invalid Storage backup manifest.");
  }

  for (const bucket of manifest.buckets) {
    if (!allowedBuckets.has(bucket)) throw new Error("Backup manifest contains an unsupported bucket.");
  }

  return manifest;
}

function validateManifestEntry(entry) {
  if (
    !entry ||
    !allowedBuckets.has(entry.bucket) ||
    typeof entry.path !== "string" ||
    !entry.path ||
    typeof entry.file !== "string" ||
    !/^objects\/(?:tenant-documents|diploma-vault)\/[a-f0-9]{64}\.bin$/.test(entry.file) ||
    !Number.isInteger(entry.size) ||
    entry.size < 0 ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error("Backup manifest contains an invalid object entry.");
  }
}

function resolveBackupFile(relativeFile) {
  const absoluteFile = resolve(backupDirectory, relativeFile);
  if (!absoluteFile.startsWith(`${backupDirectory}/`)) throw new Error("Backup file escapes its root directory.");
  return absoluteFile;
}

function parseBuckets(value) {
  const parsed = [...new Set(value.split(",").map((bucket) => bucket.trim()).filter(Boolean))];

  if (parsed.length === 0 || parsed.some((bucket) => !allowedBuckets.has(bucket))) {
    fatal("STORAGE_BACKUP_BUCKETS may only contain tenant-documents and diploma-vault.");
  }

  return parsed;
}

function normalizePrefix(value) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function normalizeCacheControl(value) {
  if (typeof value !== "string" || !value) return null;
  return value.replace(/^max-age=/, "");
}

function requireStagingRehearsal() {
  if (process.env.APP_ENV !== "staging") fatal("Storage restore rehearsal is staging-only.");
  requireConfirmation("STORAGE_REHEARSAL_CONFIRMATION", "REHEARSE_STAGING_STORAGE_RESTORE");

  if (!/^backup-rehearsal\/[A-Za-z0-9._-]+$/.test(scopedPrefix)) {
    fatal("STORAGE_BACKUP_PREFIX must be an exact controlled backup-rehearsal path.");
  }
}

function requireConfirmation(name, expected) {
  if (process.env[name] !== expected) fatal(`${name} must equal ${expected}.`);
}

function summarizeManifest(manifest) {
  return {
    version: manifest.version,
    createdAt: manifest.createdAt,
    sourceProjectFingerprint: manifest.sourceProjectFingerprint,
    environment: manifest.environment,
    buckets: manifest.buckets,
    prefix: manifest.prefix,
    objectCount: manifest.objectCount,
    totalBytes: manifest.totalBytes
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fatal(message) {
  process.stderr.write(`[storage-backup] ${message}\n`);
  process.exit(1);
}
