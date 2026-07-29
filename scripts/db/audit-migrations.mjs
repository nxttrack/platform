#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(rootDir, "supabase", "migrations");

const failures = [];
const normalizedMigrations = [];

if (!existsSync(migrationsDir)) {
  console.log("[db:audit] No migrations directory found.");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const file of migrationFiles) {
  const filePath = join(migrationsDir, file);
  const sql = readFileSync(filePath, "utf8");
  const normalizedSql = normalizeSql(sql);
  normalizedMigrations.push({ file, sql: normalizedSql });

  checkForbiddenPatterns(file, normalizedSql);
  checkSecurityDefinerFunctions(file, normalizedSql);
  checkPolicies(file, normalizedSql);
  checkPublicTables(file, normalizedSql);
}

checkCompositeForeignKeyTargets(normalizedMigrations);

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
    { pattern: /create\s+function\s+public\.[\s\S]*?\bsecurity\s+definer\b/, message: "creates a security definer function in public schema" },
    {
      pattern: /\bon\s+delete\s+(?:restrict|cascade|no\s+action)\s*\(/,
      message: "uses a foreign-key column list with an ON DELETE action that does not support one"
    }
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

function checkCompositeForeignKeyTargets(migrations) {
  const uniqueColumnSetsByTable = new Map();

  for (const { sql } of migrations) {
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\)\s*;/g)) {
      const [, table, definition] = match;

      for (const uniqueMatch of definition.matchAll(/(?:primary\s+key|unique)\s*\(([^)]+)\)/g)) {
        addUniqueColumnSet(uniqueColumnSetsByTable, table, uniqueMatch[1]);
      }
    }

    for (const match of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z_][a-z0-9_]*)\s+([^;]*);/g)) {
      const uniqueMatch = match[2].match(/add\s+constraint\s+[a-z_][a-z0-9_]*\s+unique\s*\(([^)]+)\)/);

      if (uniqueMatch) {
        addUniqueColumnSet(uniqueColumnSetsByTable, match[1], uniqueMatch[1]);
      }
    }
  }

  for (const { file, sql } of migrations) {
    for (const match of sql.matchAll(/foreign\s+key\s*\(([^)]+)\)\s+references\s+public\.([a-z_][a-z0-9_]*)\s*\(([^)]+)\)/g)) {
      const sourceColumns = parseColumnList(match[1]);

      if (sourceColumns.length < 2) {
        continue;
      }

      const referencedTable = match[2];
      const referencedColumns = parseColumnList(match[3]);
      const referencedKey = referencedColumns.join(",");

      if (!uniqueColumnSetsByTable.get(referencedTable)?.has(referencedKey)) {
        failures.push(
          `${file}: composite foreign key references public.${referencedTable} (${referencedColumns.join(", ")}) without a matching primary or unique constraint.`
        );
      }
    }
  }
}

function addUniqueColumnSet(uniqueColumnSetsByTable, table, columns) {
  const key = parseColumnList(columns).join(",");
  const existing = uniqueColumnSetsByTable.get(table) ?? new Set();
  existing.add(key);
  uniqueColumnSetsByTable.set(table, existing);
}

function parseColumnList(columns) {
  return columns
    .split(",")
    .map((column) => column.trim().replaceAll('"', ""))
    .filter(Boolean);
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
