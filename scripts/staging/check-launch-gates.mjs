#!/usr/bin/env node

const strict = process.env.STAGING_LAUNCH_STRICT === "true";
const target = process.env.APP_ENV ?? process.env.TARGET ?? "local";
const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const tenantDomainSuffix = normalizeHostname(process.env.TENANT_DOMAIN_SUFFIX ?? "");
const tenantBaseDomains = csv(process.env.TENANT_BASE_DOMAINS).map(normalizeHostname);
const results = [];

check("app-url-present", !!appUrl, "APP_URL or NEXT_PUBLIC_APP_URL is set.");
check("staging-host", target !== "staging" || hostnameOf(appUrl) === "staging.nxttrack.nl", "Staging APP_URL is https://staging.nxttrack.nl.");
check("production-host-not-staging", target !== "production" || hostnameOf(appUrl) !== "staging.nxttrack.nl", "Production APP_URL is not staging.");
check("node-env-production", target === "local" || process.env.NODE_ENV === "production", "NODE_ENV is production outside local runs.");
check(
  "tenant-domain-routing",
  target !== "staging" || (!!tenantDomainSuffix && tenantBaseDomains.includes(tenantDomainSuffix)),
  "Staging tenant base domains include TENANT_DOMAIN_SUFFIX."
);
check("supabase-url", !!process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL is configured.");
check("supabase-public-key", !!(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY), "Supabase publishable/anon key is configured.");
check("supabase-server-secret", !!(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY), "Supabase server-only secret is configured.");
check("database-url-policy", process.env.RUN_DB_MIGRATIONS !== "true" || !!process.env.DATABASE_URL, "DATABASE_URL is present when RUN_DB_MIGRATIONS=true.");
check("migration-dry-run-policy", process.env.DB_MIGRATE_DRY_RUN !== "true" || process.env.RUN_DB_MIGRATIONS === "true", "DB_MIGRATE_DRY_RUN is only enabled with RUN_DB_MIGRATIONS=true.");
check("bootstrap-owner-email", (process.env.BOOTSTRAP_PLATFORM_OWNER_EMAIL ?? "admin@nxttrack.nl") === "admin@nxttrack.nl", "Bootstrap platform owner email is admin@nxttrack.nl.");
check("bootstrap-password-policy", process.env.BOOTSTRAP_PLATFORM_OWNER !== "true" || !!(process.env.BOOTSTRAP_PLATFORM_OWNER_TEMP_PASSWORD || process.env.SENDGRID_API_KEY), "Bootstrap has temp password or mail delivery configured.");

manual("RLS_STAGING_TESTS_CONFIRMED", "RLS/security tests have been run against staging with platform owner, tenant admin, instructor and parent.");
manual("PLAYWRIGHT_STAGING_SMOKE_CONFIRMED", "Playwright smoke tests have been run against staging.");
manual("LOVABLE_VISUAL_CHECK_CONFIRMED", "Visual checks have been compared against the Lovable baseline.");
manual("SUPABASE_BACKUPS_CONFIRMED", "Supabase staging backups and restore policy have been checked.");
manual("ROLLBACK_REHEARSAL_CONFIRMED", "Rollback rehearsal has been performed or explicitly accepted as manual.");

const failed = results.filter((result) => result.status === "fail");
const warnings = results.filter((result) => result.status === "warn");

for (const result of results) {
  console.log(`[staging:gate] ${result.status.toUpperCase()} ${result.id}: ${result.message}`);
}

if (failed.length > 0 || (strict && warnings.length > 0)) {
  console.error(`[staging:gate] Launch gate blocked: ${failed.length} failure(s), ${warnings.length} warning(s), strict=${strict}.`);
  process.exit(1);
}

console.log(`[staging:gate] Launch gate complete: ${failed.length} failure(s), ${warnings.length} warning(s), strict=${strict}.`);

function check(id, condition, message) {
  results.push({
    id,
    message,
    status: condition ? "pass" : strict ? "fail" : "warn"
  });
}

function manual(envName, message) {
  const confirmed = process.env[envName] === "true";

  results.push({
    id: envName.toLowerCase(),
    message,
    status: confirmed ? "pass" : "warn"
  });
}

function hostnameOf(value) {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

function csv(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHostname(value) {
  if (!value) return "";

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  }
}
