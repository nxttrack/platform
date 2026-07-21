#!/usr/bin/env node

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const mode = process.env.PRODUCTION_FOUNDATION_AUDIT_MODE || "contract";
const target = process.env.AUDIT_TARGET || process.env.APP_ENV || "production";
const results = [];

if (mode === "fingerprint") {
  const identity = supabaseIdentity(process.env.NEXT_PUBLIC_SUPABASE_URL);

  if (!identity) {
    fail("supabase-project", "The staging Supabase URL does not expose a valid project identity.");
    finish();
  }

  const fingerprint = digest(identity);
  writeOutput("supabase_fingerprint", fingerprint);
  pass("supabase-project", "A non-sensitive staging Supabase project fingerprint was produced.");
  finish();
}

check("target", target === "production", "Audit target is production.");
check("app-env", process.env.APP_ENV === "production", "APP_ENV is production.");
check("node-env", process.env.NODE_ENV === "production", "NODE_ENV is production.");
check("port", process.env.PORT === "3800", "Production uses port 3800.");
check("service", process.env.SERVICE_NAME === "nxttrack-production", "Production uses the nxttrack-production systemd service.");
check("base-path", process.env.BASE_PATH === "/", "Production uses the root base path.");

const appUrl = httpsUrl(process.env.APP_URL);
const publicAppUrl = httpsUrl(process.env.NEXT_PUBLIC_APP_URL);
const adminUrl = httpsUrl(process.env.PLATFORM_ADMIN_URL);

check("app-url", appUrl?.hostname === "nxttrack.nl", "APP_URL is https://nxttrack.nl.");
check("public-app-url", publicAppUrl?.hostname === "nxttrack.nl", "NEXT_PUBLIC_APP_URL matches the production platform host.");
check("admin-url", adminUrl?.hostname === "admin.nxttrack.nl", "PLATFORM_ADMIN_URL is https://admin.nxttrack.nl.");
check("tenant-suffix", normalized(process.env.TENANT_DOMAIN_SUFFIX) === "nxttrack.nl", "TENANT_DOMAIN_SUFFIX is nxttrack.nl.");
includes("tenant-base-domains", process.env.TENANT_BASE_DOMAINS, ["nxttrack.nl"], "Tenant routing includes nxttrack.nl.");
includes("marketing-hosts", process.env.PLATFORM_MARKETING_HOSTNAMES, ["nxttrack.nl", "www.nxttrack.nl"], "Marketing routing includes apex and www hosts.");
includes("admin-hosts", process.env.PLATFORM_ADMIN_HOSTNAMES, ["admin.nxttrack.nl"], "Admin routing includes admin.nxttrack.nl.");
includes(
  "reserved-subdomains",
  process.env.RESERVED_TENANT_SUBDOMAINS,
  ["admin", "api", "app", "platform", "staging", "www"],
  "Reserved production tenant subdomains are explicit."
);

for (const name of ["APP_URL", "NEXT_PUBLIC_APP_URL", "PLATFORM_ADMIN_URL", "E2E_BASE_URL", "TENANT_SMOKE_URL"]) {
  const value = process.env[name] || "";
  check(`no-staging-${name.toLowerCase().replaceAll("_", "-")}`, !value.includes("staging.nxttrack.nl"), `${name} does not reference staging.`);
}

check("migrations-default-off", process.env.RUN_DB_MIGRATIONS === "false", "Production migrations default to disabled.");
check("migration-dry-run-default-off", process.env.DB_MIGRATE_DRY_RUN === "false", "Migration dry-run defaults to disabled until an explicit rehearsal.");
check("migration-include-all-default-off", process.env.DB_MIGRATE_INCLUDE_ALL === "false", "Legacy migration inclusion defaults to disabled.");
check("bootstrap-default-off", process.env.BOOTSTRAP_PLATFORM_OWNER === "false", "Production owner bootstrap defaults to disabled.");
check(
  "bootstrap-reset-default-off",
  process.env.BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD === "false",
  "Production owner password reset defaults to disabled."
);
check("database-health-enabled", process.env.HEALTH_CHECK_DATABASE === "true", "Database health probing is required.");
check("health-strict", process.env.HEALTH_STRICT === "true", "Production health is strict.");
check("health-database-required", process.env.REQUIRE_HEALTH_DATABASE === "true", "Production health requires a passing database probe.");
check("health-commit-required", process.env.REQUIRE_HEALTH_COMMIT === "true", "Production health requires release commit metadata.");
includes(
  "runtime-smoke-routes",
  process.env.RUNTIME_SMOKE_ROUTES,
  ["/", "/login", "/wachtwoord-vergeten", "/nxttrack"],
  "Critical public production smoke routes are explicit."
);

present("database-secret", process.env.DATABASE_URL, "DATABASE_URL is configured.");
present("session-secret", process.env.SESSION_SECRET || process.env.JWT_SESSION, "A server-side session secret is configured.");
present("supabase-public-url", process.env.NEXT_PUBLIC_SUPABASE_URL, "The Supabase public URL is configured.");
present(
  "supabase-public-key",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "A Supabase publishable/anon key is configured."
);
present(
  "supabase-server-secret",
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  "A Supabase server-only secret is configured."
);
check(
  "supabase-public-reachable",
  await urlReachable(process.env.NEXT_PUBLIC_SUPABASE_URL),
  "The production Supabase API hostname resolves and responds."
);

const productionIdentity = supabaseIdentity(process.env.NEXT_PUBLIC_SUPABASE_URL);
const databaseMatches = productionIdentity ? databaseContainsIdentity(process.env.DATABASE_URL, productionIdentity) : false;
check("supabase-database-match", databaseMatches, "DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL identify the same Supabase project.");

const productionFingerprint = productionIdentity ? digest(productionIdentity) : "";
const stagingFingerprint = process.env.STAGING_SUPABASE_FINGERPRINT || "";
check("supabase-staging-isolation-evidence", /^[a-f0-9]{64}$/.test(stagingFingerprint), "A staging Supabase project fingerprint is available for comparison.");
check(
  "supabase-project-isolated",
  Boolean(productionFingerprint && stagingFingerprint && productionFingerprint !== stagingFingerprint),
  "Production and staging use different Supabase project identities."
);

finish();

function check(id, condition, message) {
  results.push({ id, message, status: condition ? "pass" : "fail" });
}

function present(id, value, message) {
  check(id, Boolean(value), message);
}

function includes(id, value, expected, message) {
  const actual = csv(value).map(normalized);
  check(id, expected.every((entry) => actual.includes(normalized(entry))), message);
}

function pass(id, message) {
  results.push({ id, message, status: "pass" });
}

function fail(id, message) {
  results.push({ id, message, status: "fail" });
}

function finish() {
  const failures = results.filter((result) => result.status === "fail");

  for (const result of results) {
    console.log(`[production:foundation] ${result.status.toUpperCase()} ${result.id}: ${result.message}`);
  }

  writeSummary(results, failures.length);
  writeEvidence(results, failures.length);

  if (failures.length > 0) {
    console.error(`[production:foundation] Audit blocked by ${failures.length} failure(s).`);
    process.exit(1);
  }

  console.log(`[production:foundation] PASS ${results.length} foundation check(s).`);
  process.exit(0);
}

function writeSummary(entries, failureCount) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const lines = [
    "## Production foundation audit",
    "",
    `Result: ${failureCount === 0 ? "PASS" : `BLOCKED (${failureCount} failure(s))`}`,
    "",
    "| Check | Result | Contract |",
    "| --- | --- | --- |",
    ...entries.map((entry) => `| \`${entry.id}\` | ${entry.status.toUpperCase()} | ${entry.message} |`),
    ""
  ];

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function writeEvidence(entries, failureCount) {
  if (mode === "fingerprint") return;

  const outputPath = resolve(process.cwd(), process.env.PRODUCTION_FOUNDATION_EVIDENCE_PATH || "artifacts/production-foundation-audit.json");
  const evidence = {
    schemaVersion: 1,
    target,
    status: failureCount === 0 ? "pass" : "blocked",
    failureCount,
    checks: entries,
    commitSha: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null,
    createdAt: new Date().toISOString()
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o640 });
}

function supabaseIdentity(value) {
  try {
    const hostname = new URL(value || "").hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function databaseContainsIdentity(value, identity) {
  try {
    const url = new URL(value || "");
    const username = decodeURIComponent(url.username || "").toLowerCase();
    const hostname = url.hostname.toLowerCase();

    return hostname === `db.${identity}.supabase.co` || username === `postgres.${identity}` || username.endsWith(`.${identity}`);
  } catch {
    return false;
  }
}

function digest(value) {
  return createHash("sha256").update(`nxttrack-supabase-project:${value}`).digest("hex");
}

function httpsUrl(value) {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function csv(value) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalized(value) {
  return (value || "").trim().toLowerCase().replace(/\.$/, "");
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

async function urlReachable(value) {
  let url;

  try {
    url = new URL("/auth/v1/health", value || "");
  } catch {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
