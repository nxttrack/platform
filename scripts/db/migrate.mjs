#!/usr/bin/env node

import { spawnSync } from "node:child_process";

console.log("[db:migrate] Supabase migrations are present in the repository.");

if (process.env.RUN_DB_MIGRATIONS !== "true") {
  console.log("[db:migrate] RUN_DB_MIGRATIONS is not true. Skipping migration execution.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[db:migrate] RUN_DB_MIGRATIONS is true, but DATABASE_URL is not set.");
  process.exit(1);
}

const args = ["db", "push", "--db-url", process.env.DATABASE_URL, "--yes"];

if (process.env.DB_MIGRATE_DRY_RUN === "true") {
  args.push("--dry-run");
}

console.log("[db:migrate] Running Supabase migrations with explicit opt-in.");

const result = spawnSync("supabase", args, {
  stdio: "inherit",
  shell: process.platform === "win32"
});

process.exit(result.status ?? 1);
