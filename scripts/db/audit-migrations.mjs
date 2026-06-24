#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(rootDir, "supabase", "migrations");

const failures = [];

if (!existsSync(migrationsDir)) {
  console.log("[db:audit] No migrations directory found.");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const normalizedMigrationSql = [];

for (const file of migrationFiles) {
  const filePath = join(migrationsDir, file);
  const sql = readFileSync(filePath, "utf8");
  const normalizedSql = normalizeSql(sql);
  normalizedMigrationSql.push(normalizedSql);

  checkForbiddenPatterns(file, normalizedSql);
  checkSecurityDefinerFunctions(file, normalizedSql);
  checkPolicies(file, normalizedSql);
  checkPublicTables(file, normalizedSql);
}

checkCoreDomainContracts(normalizedMigrationSql.join(" "));

if (failures.length > 0) {
  console.error("[db:audit] Migration audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`[db:audit] Checked ${migrationFiles.length} migration file(s).`);

function checkForbiddenPatterns(file, sql) {
  const forbiddenPatterns = [
    { pattern: /\bauth\.role\s*\(/, message: "uses deprecated auth.role(); use policy TO clauses instead" },
    { pattern: /\braw_user_meta_data\b|\buser_metadata\b/, message: "uses editable user metadata for authorization" },
    { pattern: /create\s+function\s+public\.[\s\S]*?\bsecurity\s+definer\b/, message: "creates a security definer function in public schema" }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(sql)) {
      failures.push(`${file}: ${message}.`);
    }
  }
}

function checkSecurityDefinerFunctions(file, sql) {
  const functionBlocks = sql.match(/create\s+function\s+[\s\S]*?\$\$\s*;/g) ?? [];

  for (const block of functionBlocks) {
    if (/\bsecurity\s+definer\b/.test(block) && !/\bset\s+search_path\s*=/.test(block)) {
      failures.push(`${file}: security definer function is missing an explicit search_path.`);
    }
  }
}

function checkPolicies(file, sql) {
  const policyBlocks = sql.match(/create\s+policy\s+[\s\S]*?;/g) ?? [];

  for (const block of policyBlocks) {
    if (!/\bto\s+authenticated\b/.test(block)) {
      failures.push(`${file}: policy is missing an explicit TO authenticated clause.`);
    }

    if (/\bfor\s+update\b/.test(block) && !/\bwith\s+check\b/.test(block)) {
      failures.push(`${file}: update policy is missing WITH CHECK.`);
    }
  }
}

function checkPublicTables(file, sql) {
  const tables = Array.from(sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/g), (match) => match[1]);

  for (const table of tables) {
    const escapedTable = escapeRegExp(table);
    const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${escapedTable}\\s+enable\\s+row\\s+level\\s+security\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const serviceRoleGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+service_role\\s*;`);

    if (!rlsPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing ALTER TABLE ... ENABLE ROW LEVEL SECURITY.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing an explicit authenticated grant.`);
    }

    if (!serviceRoleGrantPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing an explicit service_role grant.`);
    }
  }
}

function checkCoreDomainContracts(sql) {
  const requiredCoreTables = [
    "programs",
    "stages",
    "groups",
    "sessions",
    "resources",
    "instructors",
    "enrollments",
    "group_memberships",
    "subscription_plans",
    "progress",
    "badges",
    "certificates"
  ];

  for (const table of requiredCoreTables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Core domain contract is missing public.${table}.`);
    }
  }

  const enrollmentsBlock = extractCreateTableBlock(sql, "enrollments");
  const stagesBlock = extractCreateTableBlock(sql, "stages");
  const subscriptionPlansBlock = extractCreateTableBlock(sql, "subscription_plans");

  if (enrollmentsBlock && !/\bcurrent_stage_id\b/.test(enrollmentsBlock)) {
    failures.push("Core domain contract: public.enrollments must track current_stage_id separately from billing.");
  }

  if (enrollmentsBlock && !/\bsubscription_plan_id\b/.test(enrollmentsBlock)) {
    failures.push("Core domain contract: public.enrollments must track subscription_plan_id separately from stage progression.");
  }

  if (stagesBlock && /\b(price|billing|payment|subscription_plan)_?[a-z0-9_]*\b/.test(stagesBlock)) {
    failures.push("Core domain contract: public.stages must not contain billing/payment/subscription columns.");
  }

  if (subscriptionPlansBlock && /\bstage_id\b|\bbadge_id\b|\bbadje\b/.test(subscriptionPlansBlock)) {
    failures.push("Core domain contract: public.subscription_plans must not be tied to stage/badge progression.");
  }
}

function extractCreateTableBlock(sql, table) {
  const match = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\s*\\([\\s\\S]*?\\);`).exec(sql);

  return match?.[0] ?? "";
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
