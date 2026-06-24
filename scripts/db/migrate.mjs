#!/usr/bin/env node

import { spawnSync } from "node:child_process";

console.log("[db:migrate] Supabase migrations are present in the repository.");

const target = process.env.TARGET ?? process.env.APP_ENV ?? "";
const shouldRunMigrations = process.env.RUN_DB_MIGRATIONS === "true" || target === "staging";

if (!shouldRunMigrations) {
  console.log("[db:migrate] RUN_DB_MIGRATIONS is not true and target is not staging. Skipping migration execution.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[db:migrate] Migrations are enabled, but DATABASE_URL is not set.");
  process.exit(1);
}

const args = ["db", "push", "--db-url", process.env.DATABASE_URL, "--yes"];

if (process.env.DB_MIGRATE_DRY_RUN === "true") {
  args.push("--dry-run");
}

console.log(`[db:migrate] Running Supabase migrations for target=${target || "unknown"}.`);

const result = spawnSync("supabase", args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
