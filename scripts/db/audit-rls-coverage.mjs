#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(rootDir, "supabase", "migrations");
const failures = [];
const warnings = [];

if (!existsSync(migrationsDir)) {
  console.log("[db:rls-audit] No migrations directory found.");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const combinedSql = migrationFiles.map((file) => readFileSync(join(migrationsDir, file), "utf8")).join("\n\n");
const normalizedSql = normalizeSql(combinedSql);
const forceRlsMissing = [];

const publicTables = unique(Array.from(normalizedSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/g), (match) => match[1]));

for (const table of publicTables) {
  checkRlsForTable(table);
}

if (forceRlsMissing.length > 0) {
  warnings.push(`${forceRlsMissing.length} public table(s) do not FORCE ROW LEVEL SECURITY; acceptable for Supabase service_role, but verify owner access expectations.`);
}

checkPolicies();
checkSecurityDefiners();
checkNotificationTypes();
checkNoServiceSecretsInPublicEnv();

if (warnings.length > 0) {
  console.warn("[db:rls-audit] Warnings:");

  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error("[db:rls-audit] RLS/security audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`[db:rls-audit] Checked ${publicTables.length} public table(s), ${migrationFiles.length} migration file(s).`);

function checkRlsForTable(table) {
  const escaped = escapeRegExp(table);
  const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${escaped}\\s+enable\\s+row\\s+level\\s+security\\s*;`);
  const forceRlsPattern = new RegExp(`alter\\s+table\\s+public\\.${escaped}\\s+force\\s+row\\s+level\\s+security\\s*;`);
  const policyPattern = new RegExp(`create\\s+policy\\s+[^;]+?\\s+on\\s+public\\.${escaped}\\b[\\s\\S]*?;`);
  const authenticatedGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escaped}\\s+to\\s+authenticated\\s*;`);
  const serviceGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escaped}\\s+to\\s+service_role\\s*;`);

  if (!rlsPattern.test(normalizedSql)) {
    failures.push(`public.${table} is missing ENABLE ROW LEVEL SECURITY.`);
  }

  if (!policyPattern.test(normalizedSql)) {
    failures.push(`public.${table} has RLS enabled but no explicit policy found.`);
  }

  if (!authenticatedGrantPattern.test(normalizedSql)) {
    failures.push(`public.${table} is missing an authenticated grant for Data API exposure.`);
  }

  if (!serviceGrantPattern.test(normalizedSql)) {
    failures.push(`public.${table} is missing a service_role grant.`);
  }

  if (!forceRlsPattern.test(normalizedSql)) {
    forceRlsMissing.push(table);
  }
}

function checkPolicies() {
  const policyBlocks = normalizedSql.match(/create\s+policy\s+[\s\S]*?;/g) ?? [];

  for (const policy of policyBlocks) {
    const tableMatch = policy.match(/\s+on\s+public\.([a-z_][a-z0-9_]*)/);
    const table = tableMatch?.[1] ?? "unknown table";

    if (!/\bto\s+authenticated\b/.test(policy)) {
      failures.push(`Policy on ${table} is missing TO authenticated.`);
    }

    if (/\bfor\s+update\b/.test(policy) && !/\bwith\s+check\b/.test(policy)) {
      failures.push(`Update policy on ${table} is missing WITH CHECK.`);
    }

    if (/\bauth\.role\s*\(/.test(policy)) {
      failures.push(`Policy on ${table} uses deprecated auth.role().`);
    }

    if (/\bto\s+authenticated\b/.test(policy) && !/\busing\s*\(/.test(policy) && !/\bwith\s+check\s*\(/.test(policy)) {
      failures.push(`Policy on ${table} has TO authenticated without a row predicate.`);
    }
  }
}

function checkSecurityDefiners() {
  const functionBlocks = normalizedSql.match(/create\s+(?:or\s+replace\s+)?function\s+[\s\S]*?\$\$\s*;/g) ?? [];

  for (const block of functionBlocks) {
    const nameMatch = block.match(/create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)/);
    const functionName = nameMatch?.[1] ?? "unknown function";

    if (!/\bsecurity\s+definer\b/.test(block)) {
      continue;
    }

    if (functionName.startsWith("public.")) {
      failures.push(`${functionName} is SECURITY DEFINER in public schema.`);
    }

    if (!functionName.startsWith("app_private.")) {
      failures.push(`${functionName} is SECURITY DEFINER outside app_private.`);
    }

    if (!/\bset\s+search_path\s*=/.test(block)) {
      failures.push(`${functionName} is SECURITY DEFINER without explicit search_path.`);
    }

    const functionBaseName = functionName.split(".")[1];
    const revokePattern = new RegExp(`revoke\\s+all\\s+on\\s+function\\s+${escapeRegExp(functionName)}\\s*\\(`);

    if (!revokePattern.test(normalizedSql)) {
      warnings.push(`${functionName} should explicitly revoke PUBLIC execute access after creation.`);
    }

    if (!new RegExp(`grant\\s+execute\\s+on\\s+function\\s+app_private\\.${escapeRegExp(functionBaseName)}\\s*\\([\\s\\S]*?\\)\\s+to\\s+authenticated\\s*;`).test(normalizedSql)) {
      warnings.push(`${functionName} has no authenticated execute grant detected.`);
    }
  }
}

function checkNotificationTypes() {
  const requiredTypes = [
    "progress_score",
    "badge_award",
    "graduation_invite",
    "certificate_issued",
    "payment_due",
    "payment_overdue",
    "payment_received",
    "admin_message",
    "task_assigned",
    "document_published",
    "report_ready",
    "system"
  ];
  const constraintMatches = Array.from(normalizedSql.matchAll(/tenant_notifications_type_check\s+check\s*\(type\s+in\s*\(([^)]*)\)/g));
  const latest = constraintMatches.at(-1)?.[1] ?? "";

  for (const type of requiredTypes) {
    if (!latest.includes(`'${type}'`)) {
      failures.push(`tenant_notifications_type_check is missing '${type}' in the latest constraint.`);
    }
  }
}

function checkNoServiceSecretsInPublicEnv() {
  const files = ["README.md", ".env.example", ".github/workflows/deploy.yml"];

  for (const file of files) {
    const path = join(rootDir, file);

    if (!existsSync(path)) {
      continue;
    }

    const content = readFileSync(path, "utf8");

    if (/NEXT_PUBLIC_[A-Z0-9_]*(SERVICE_ROLE|SECRET_KEY|DATABASE_URL)/.test(content)) {
      failures.push(`${file} exposes a server-only secret through NEXT_PUBLIC_.`);
    }
  }
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
