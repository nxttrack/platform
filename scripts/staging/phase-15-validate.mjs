#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const stagingUrl = "https://staging.nxttrack.nl";
const platformOwnerEmail = "admin@nxttrack.nl";
const appUrl = normalizeUrl(process.env.PLAYWRIGHT_BASE_URL || process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || stagingUrl);
const phaseEnv = {
  ...process.env,
  APP_ENV: "staging",
  TARGET: "staging",
  NODE_ENV: process.env.NODE_ENV || "production",
  APP_URL: appUrl,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || appUrl,
  PLAYWRIGHT_BASE_URL: appUrl,
  RUN_DB_MIGRATIONS: "true",
  RLS_ROLE_SMOKE_REQUIRED: "true",
  RLS_PLATFORM_OWNER_EMAIL: platformOwnerEmail,
  E2E_REQUIRE_AUTHENTICATED_WORKFLOWS: "true",
  SUPABASE_ADVISOR_TYPE: process.env.SUPABASE_ADVISOR_TYPE || "all",
  SUPABASE_ADVISOR_LEVEL: process.env.SUPABASE_ADVISOR_LEVEL || "error",
  SUPABASE_ADVISOR_FAIL_ON: process.env.SUPABASE_ADVISOR_FAIL_ON || "error"
};

const failures = [
  hostnameOf(appUrl) === "staging.nxttrack.nl" ? null : `APP_URL/PLAYWRIGHT_BASE_URL must resolve to ${stagingUrl}.`,
  phaseEnv.NEXT_PUBLIC_SUPABASE_URL ? null : "NEXT_PUBLIC_SUPABASE_URL is required.",
  phaseEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || phaseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? null
    : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required.",
  phaseEnv.SUPABASE_SECRET_KEY || phaseEnv.SUPABASE_SERVICE_ROLE_KEY
    ? null
    : "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
  phaseEnv.DATABASE_URL ? null : "DATABASE_URL is required.",
  normalizeEmail(phaseEnv.E2E_PLATFORM_OWNER_EMAIL || "") === platformOwnerEmail
    ? null
    : `E2E_PLATFORM_OWNER_EMAIL must be ${platformOwnerEmail}.`,
  ...requiredCredentialFailures("E2E_PLATFORM_OWNER", "platform owner"),
  ...requiredCredentialFailures("E2E_TENANT_ADMIN", "organization admin"),
  ...requiredCredentialFailures("E2E_INSTRUCTOR", "instructor"),
  ...requiredCredentialFailures("E2E_PARENT", "parent")
].filter(Boolean);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[phase15] FAIL ${failure}`);
  }

  console.error("[phase15] Staging truth validation cannot start until the required environment is complete.");
  process.exit(1);
}

console.log(`[phase15] Starting staging truth and security validation against ${appUrl}.`);

runStep("apply Supabase migrations", "pnpm", ["run", "db:migrate"], phaseEnv);
runStep("run Supabase advisors", "pnpm", ["run", "db:advisors"], phaseEnv);
runStep("run required RLS role smoke", "pnpm", ["run", "db:rls-role-smoke"], phaseEnv);
runStep("check live staging health", "pnpm", ["run", "staging:health"], phaseEnv);

if (process.env.PHASE15_SKIP_PLAYWRIGHT_INSTALL !== "true") {
  runStep("ensure Playwright Chromium", "pnpm", ["--filter", "@nxttrack/web", "exec", "playwright", "install", "chromium"], phaseEnv);
}

runStep("run live Playwright staging smoke", "pnpm", ["run", "test:e2e"], phaseEnv);
runStep("run strict staging launch gate", "pnpm", ["run", "staging:gate"], {
  ...phaseEnv,
  STAGING_LAUNCH_STRICT: "true",
  RLS_STAGING_TESTS_CONFIRMED: "true",
  PLAYWRIGHT_STAGING_SMOKE_CONFIRMED: "true"
});

console.log("[phase15] PASS Staging truth and security validation completed.");

function runStep(label, command, args, env) {
  console.log(`[phase15] ${label}.`);

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  if (result.error) {
    console.error(`[phase15] FAIL ${label}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[phase15] FAIL ${label}: exit code ${result.status ?? 1}.`);
    process.exit(result.status ?? 1);
  }
}

function requiredCredentialFailures(prefix, label) {
  return [
    process.env[`${prefix}_EMAIL`] ? null : `${prefix}_EMAIL is required for ${label}.`,
    process.env[`${prefix}_PASSWORD`] ? null : `${prefix}_PASSWORD is required for ${label}.`
  ].filter(Boolean);
}

function hostnameOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function normalizeUrl(value) {
  return value.replace(/\/+$/, "");
}
