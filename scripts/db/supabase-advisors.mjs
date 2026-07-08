#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const cli = process.env.SUPABASE_CLI_BIN || "supabase";
const advisorType = process.env.SUPABASE_ADVISOR_TYPE || "all";
const advisorLevel = process.env.SUPABASE_ADVISOR_LEVEL || "error";
const advisorFailOn = process.env.SUPABASE_ADVISOR_FAIL_ON || "error";
const baseOptions = {
  shell: process.platform === "win32",
  env: {
    ...process.env,
    SUPABASE_TELEMETRY_DISABLED: process.env.SUPABASE_TELEMETRY_DISABLED || "1"
  }
};

if (!process.env.DATABASE_URL) {
  console.error("[db:advisors] DATABASE_URL is required to run Supabase advisors against staging.");
  process.exit(1);
}

const version = spawnSync(cli, ["--version"], {
  ...baseOptions,
  encoding: "utf8"
});

if (version.error) {
  console.error(`[db:advisors] Could not start Supabase CLI (${cli}): ${version.error.message}`);
  process.exit(1);
}

if (version.status !== 0) {
  console.error(`[db:advisors] Supabase CLI version check failed with exit code ${version.status ?? 1}.`);
  if (version.stdout?.trim()) console.error(version.stdout.trim());
  if (version.stderr?.trim()) console.error(version.stderr.trim());
  process.exit(version.status ?? 1);
}

console.log(`[db:advisors] Using Supabase CLI ${version.stdout.trim() || "unknown version"}.`);

const help = spawnSync(cli, ["db", "advisors", "--help"], {
  ...baseOptions,
  encoding: "utf8"
});

if (help.error) {
  console.error(`[db:advisors] Could not inspect Supabase advisor command: ${help.error.message}`);
  process.exit(1);
}

if (help.status !== 0 || !help.stdout.includes("--db-url") || !help.stdout.includes("--fail-on")) {
  console.error("[db:advisors] Supabase CLI does not expose the required db advisors flags.");
  if (help.stdout?.trim()) console.error(help.stdout.trim());
  if (help.stderr?.trim()) console.error(help.stderr.trim());
  process.exit(1);
}

console.log(
  `[db:advisors] Running Supabase advisors: type=${advisorType} level=${advisorLevel} fail-on=${advisorFailOn}.`
);

const result = spawnSync(
  cli,
  [
    "db",
    "advisors",
    "--db-url",
    process.env.DATABASE_URL,
    "--type",
    advisorType,
    "--level",
    advisorLevel,
    "--fail-on",
    advisorFailOn
  ],
  {
    ...baseOptions,
    stdio: "inherit"
  }
);

if (result.error) {
  console.error(`[db:advisors] Supabase advisor command failed to start (${cli}): ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[db:advisors] Supabase advisors failed with exit code ${result.status ?? 1}.`);
  process.exit(result.status ?? 1);
}

console.log("[db:advisors] PASS No unresolved advisor findings at the configured fail level.");
