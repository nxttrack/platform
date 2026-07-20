#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cli = process.env.SUPABASE_CLI_BIN || "supabase";
const baseOptions = {
  shell: process.platform === "win32",
  env: {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: process.env.SUPABASE_TELEMETRY_DISABLED || "1"
  }
};

const migrationsDirectory = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const legacyRemoteHistoryVersions = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith("_legacy_remote_history.sql"))
  .map((file) => file.slice(0, 14))
  .filter((version) => /^\d{14}$/.test(version));

const stagingExistingSchemaRepairCandidates = [
  { versions: ["20260623222604"], table: "profiles", label: "identity boundary", includeLegacyHistory: true },
  { versions: ["20260707152802"], table: "user_security", label: "phase 3 auth flows" },
  { versions: ["20260707160455"], table: "programs", label: "phase 4 core domain model" },
  { versions: ["20260707162139"], table: "intake_forms", label: "phase 5 public tenant intake" },
  { versions: ["20260707163627"], table: "waitlist_entries", label: "phase 6 waitlist placement" },
  { versions: ["20260707165845"], table: "participant_guardians", label: "phase 7 parent portal" },
  { versions: ["20260707171704"], table: "session_attendance", label: "phase 8 instructor shell" },
  { versions: ["20260707173644"], table: "progress_modules", label: "phase 9 progress badges" },
  { versions: ["20260707180102"], table: "graduation_readiness", label: "phase 10 graduation vault" },
  { versions: ["20260707181731"], table: "payment_plans", label: "phase 11 payments" },
  { versions: ["20260707195442"], table: "tenant_messages", label: "phase 12 admin operations" },
  { versions: ["20260707202417", "20260707232548"], table: "platform_email_settings", label: "phase 13 hardening and platform email settings" },
  { versions: ["20260708235317"], table: "email_delivery_attempts", label: "phase 17 communication and storage" },
  { versions: ["20260709002203"], table: "instructor_availability", label: "phase 18 planning and catch-up" },
  { versions: ["20260709005834"], table: "billing_provider_configs", label: "phase 20 billing boundary" }
];

console.log("[db:migrate] Supabase migrations are present in the repository.");

if (process.env.RUN_DB_MIGRATIONS !== "true") {
  console.log("[db:migrate] RUN_DB_MIGRATIONS is not true. Skipping migration execution.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[db:migrate] RUN_DB_MIGRATIONS is true, but DATABASE_URL is not set.");
  process.exit(1);
}

const version = spawnSync(cli, ["--version"], {
  ...baseOptions,
  encoding: "utf8"
});

if (version.error) {
  console.error(`[db:migrate] Could not start Supabase CLI (${cli}): ${version.error.message}`);
  console.error("[db:migrate] Install the Supabase CLI as a local devDependency or set SUPABASE_CLI_BIN.");
  process.exit(1);
}

if (version.status !== 0) {
  const stderr = version.stderr?.trim();
  const stdout = version.stdout?.trim();

  console.error(`[db:migrate] Supabase CLI version check failed with exit code ${version.status}.`);
  if (stdout) console.error(stdout);
  if (stderr) console.error(stderr);
  process.exit(version.status ?? 1);
}

console.log(`[db:migrate] Using Supabase CLI ${version.stdout.trim() || "unknown version"}.`);

if (process.env.DB_MIGRATE_DRY_RUN !== "true") {
  await repairAppliedMigrationHistoryWhenNeeded();
}

const args = ["db", "push", "--db-url", process.env.DATABASE_URL, "--yes"];

if (process.env.DB_MIGRATE_INCLUDE_ALL === "true") {
  args.push("--include-all");
}

if (process.env.DB_MIGRATE_DRY_RUN === "true") {
  args.push("--dry-run");
}

console.log(
  `[db:migrate] Running Supabase migrations with explicit opt-in. includeAll=${process.env.DB_MIGRATE_INCLUDE_ALL === "true"} dryRun=${process.env.DB_MIGRATE_DRY_RUN === "true"}`
);

const result = spawnSync(cli, args, {
  ...baseOptions,
  stdio: "inherit"
});

if (result.error) {
  console.error(`[db:migrate] Supabase CLI failed to start (${cli}): ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[db:migrate] Supabase migration command failed with exit code ${result.status ?? 1}.`);
}

process.exit(result.status ?? 1);

async function repairAppliedMigrationHistoryWhenNeeded() {
  const explicitRepairVersions = parseVersionList(process.env.DB_MIGRATION_REPAIR_APPLIED);

  if (explicitRepairVersions.length > 0) {
    console.log(`[db:migrate] Repairing ${explicitRepairVersions.length} explicitly configured migration history entry(s).`);
    repairMigrationHistory(explicitRepairVersions);
    return;
  }

  if (!isStagingTarget() || process.env.DB_MIGRATION_REPAIR_EXISTING_SCHEMA === "false") {
    return;
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    console.warn("[db:migrate] Skipping staging schema history repair because Supabase admin client config is unavailable.");
    return;
  }

  const remoteAppliedVersions = getRemoteAppliedMigrationVersions();
  const repairs = [];

  console.log("[db:migrate] Checking staging schema for migration history drift.");

  for (const candidate of stagingExistingSchemaRepairCandidates) {
    const candidateVersions = candidate.includeLegacyHistory ? [...candidate.versions, ...legacyRemoteHistoryVersions] : candidate.versions;
    const missingVersions = candidateVersions.filter((version) => !remoteAppliedVersions?.has(version));

    if (missingVersions.length === 0) {
      continue;
    }

    const exists = await publicTableExists(admin, candidate.table);

    if (exists) {
      repairs.push(...missingVersions);
      console.log(`[db:migrate] ${candidate.label} already exists in schema; will mark ${missingVersions.length} migration history entry(s) as applied.`);
    }
  }

  if (repairs.length === 0) {
    console.log("[db:migrate] No staging migration history repair needed.");
    return;
  }

  repairMigrationHistory(repairs);
}

function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !secretKey) {
    return null;
  }

  const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
  const { createClient } = requireFromWeb("@supabase/supabase-js");

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function publicTableExists(admin, table) {
  const { error } = await admin.from(table).select("*", { head: true, count: "exact" }).limit(1);

  if (!error) {
    return true;
  }

  if (isMissingTableError(error)) {
    return false;
  }

  console.error(`[db:migrate] Could not inspect public.${table}: ${error.message}`);
  process.exit(1);
}

function isMissingTableError(error) {
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  return (
    code === "42P01" ||
    code === "PGRST106" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function getRemoteAppliedMigrationVersions() {
  const list = spawnSync(cli, ["migration", "list", "--db-url", process.env.DATABASE_URL], {
    ...baseOptions,
    encoding: "utf8"
  });

  if (list.error) {
    console.warn(`[db:migrate] Could not read remote migration history: ${list.error.message}`);
    return null;
  }

  if (list.status !== 0) {
    const stderr = list.stderr?.trim();
    console.warn(`[db:migrate] Remote migration history check exited with ${list.status}; continuing with schema checks.`);
    if (stderr) console.warn(stderr);
    return null;
  }

  const versions = parseRemoteMigrationVersions(list.stdout ?? "");

  if (!versions) {
    console.warn("[db:migrate] Could not parse remote migration history; continuing with schema checks.");
    return null;
  }

  console.log(`[db:migrate] Remote migration history contains ${versions.size} applied version(s).`);
  return versions;
}

function parseRemoteMigrationVersions(output) {
  const fromJson = parseRemoteMigrationVersionsFromJson(output);

  if (fromJson) {
    return fromJson;
  }

  const versions = new Set();
  let remoteColumnIndex = 1;

  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("│") && !line.includes("|")) {
      continue;
    }

    const columns = line.split(/[│|]/).map((column) => column.trim());
    const remoteHeaderIndex = columns.findIndex((column) => column.toLowerCase() === "remote");

    if (remoteHeaderIndex >= 0) {
      remoteColumnIndex = remoteHeaderIndex;
      continue;
    }

    const remoteColumn = columns[remoteColumnIndex] ?? "";

    for (const match of remoteColumn.matchAll(/\b\d{14}\b/g)) {
      versions.add(match[0]);
    }
  }

  return versions.size > 0 ? versions : null;
}

function parseRemoteMigrationVersionsFromJson(output) {
  const jsonStart = Math.min(...["[", "{"].map((token) => output.indexOf(token)).filter((index) => index >= 0));

  if (!Number.isFinite(jsonStart)) {
    return null;
  }

  try {
    const parsed = JSON.parse(output.slice(jsonStart));
    const versions = new Set();
    collectRemoteVersions(parsed, versions);
    return versions.size > 0 ? versions : null;
  } catch {
    return null;
  }
}

function collectRemoteVersions(value, versions, parentKey = "") {
  if (typeof value === "string") {
    if (parentKey.toLowerCase().includes("remote")) {
      for (const match of value.matchAll(/\b\d{14}\b/g)) {
        versions.add(match[0]);
      }
    }

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectRemoteVersions(item, versions, parentKey);
    }

    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    collectRemoteVersions(nestedValue, versions, key);
  }
}

function repairMigrationHistory(versions) {
  const uniqueVersions = [...new Set(versions)];
  const repair = spawnSync(
    cli,
    ["migration", "repair", "--status", "applied", "--db-url", process.env.DATABASE_URL, "--yes", ...uniqueVersions],
    {
      ...baseOptions,
      stdio: "inherit"
    }
  );

  if (repair.error) {
    console.error(`[db:migrate] Supabase migration repair failed to start (${cli}): ${repair.error.message}`);
    process.exit(1);
  }

  if (repair.status !== 0) {
    console.error(`[db:migrate] Supabase migration repair failed with exit code ${repair.status ?? 1}.`);
    process.exit(repair.status ?? 1);
  }
}

function parseVersionList(value) {
  return (value ?? "")
    .split(/[\s,]+/)
    .map((version) => version.trim())
    .filter(Boolean);
}

function isStagingTarget() {
  return process.env.APP_ENV === "staging" || process.env.TARGET === "staging" || process.env.GITHUB_REF_NAME === "staging";
}
