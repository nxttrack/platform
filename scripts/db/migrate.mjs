#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const cli = process.env.SUPABASE_CLI_BIN || "supabase";
const baseOptions = {
  shell: process.platform === "win32",
  env: {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: process.env.SUPABASE_TELEMETRY_DISABLED || "1"
  }
};

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

const args = ["db", "push", "--db-url", process.env.DATABASE_URL, "--yes"];

if (process.env.DB_MIGRATE_DRY_RUN === "true") {
  args.push("--dry-run");
}

console.log("[db:migrate] Running Supabase migrations with explicit opt-in.");

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
