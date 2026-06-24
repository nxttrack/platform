#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

auditEnvExample();
auditRepositorySecrets();
auditMigrations();
auditDeploymentWorkflow();
auditReleaseDocs();

if (warnings.length > 0) {
  console.warn("[security:audit] Warnings:");

  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error("[security:audit] Release readiness audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[security:audit] Release readiness audit passed.");

function auditEnvExample() {
  const envPath = join(root, ".env.example");

  if (!existsSync(envPath)) {
    failures.push(".env.example is missing.");
    return;
  }

  const envSource = readFileSync(envPath, "utf8");
  const requiredKeys = [
    "APP_ENV",
    "PLATFORM_HOSTNAMES",
    "TENANT_BASE_DOMAINS",
    "DEFAULT_TENANT_SLUG",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "DATABASE_URL",
    "RUN_DB_MIGRATIONS",
    "DB_MIGRATE_DRY_RUN",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "SMTP_FROM_EMAIL",
    "SMTP_FROM_NAME",
    "SENDGRID_API_KEY"
  ];

  for (const key of requiredKeys) {
    if (!new RegExp(`^${escapeRegExp(key)}=`, "m").test(envSource)) {
      failures.push(`.env.example is missing ${key}.`);
    }
  }

  if (/^NEXT_PUBLIC_.*(?:SECRET|SERVICE_ROLE|DATABASE_URL|DB_PASSWORD)/m.test(envSource)) {
    failures.push(".env.example exposes a server secret through NEXT_PUBLIC_.");
  }
}

function auditRepositorySecrets() {
  const sourceRoots = ["apps/web"];
  const forbiddenPatterns = [
    {
      pattern: /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|DATABASE_URL|DB_PASSWORD)[A-Z0-9_]*\b/,
      message: "must not expose server secrets through NEXT_PUBLIC_ env vars"
    },
    {
      pattern: /\b(?:raw_user_meta_data|user_metadata)\b/,
      message: "must not use editable user metadata for authorization"
    }
  ];

  for (const sourceRoot of sourceRoots) {
    scanFiles(join(root, sourceRoot), (filePath, source) => {
      const projectPath = normalizePath(relative(root, filePath));

      for (const { pattern, message } of forbiddenPatterns) {
        if (pattern.test(source)) {
          failures.push(`${projectPath}: ${message}.`);
        }
      }
    });
  }

  scanFiles(join(root, "apps/web"), (filePath, source) => {
    const projectPath = normalizePath(relative(root, filePath));

    if (/\bSUPABASE_SERVICE_ROLE_KEY\b|\bservice_role\b/i.test(source)) {
      failures.push(`${projectPath}: service-role credentials must not be referenced by the web app.`);
    }
  });
}

function auditMigrations() {
  const migrationsDir = join(root, "supabase", "migrations");

  if (!existsSync(migrationsDir)) {
    failures.push("supabase/migrations is missing.");
    return;
  }

  const normalizedSql = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const publicTables = Array.from(normalizedSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/g), (match) => match[1]);
  const allowedAnonAccess = new Set([
    "tenants:select",
    "tenant_settings:select",
    "tenant_domains:select",
    "programs:select",
    "stages:select",
    "tenant_public_profiles:select",
    "program_public_settings:select",
    "intake_form_configs:select",
    "intake_submissions:insert",
    "intake_submission_events:insert",
    "slot_offer_responses:insert"
  ]);

  for (const table of publicTables) {
    const escapedTable = escapeRegExp(table);

    if (!new RegExp(`alter\\s+table\\s+public\\.${escapedTable}\\s+enable\\s+row\\s+level\\s+security\\s*;`).test(normalizedSql)) {
      failures.push(`public.${table} must enable row level security.`);
    }

    if (!new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+service_role\\s*;`).test(normalizedSql)) {
      failures.push(`public.${table} must have an explicit service_role grant for migration/runtime operations.`);
    }
  }

  const anonGrantMatches = normalizedSql.matchAll(/grant\s+([^;]+?)\s+on\s+(?:table\s+)?public\.([a-z_][a-z0-9_]*)\s+to\s+anon(?:,\s*authenticated)?\s*;/g);

  for (const match of anonGrantMatches) {
    const privileges = match[1];
    const table = match[2];
    const privilege = privileges.includes("insert") ? "insert" : privileges.includes("select") ? "select" : privileges.split(/\s+/)[0];
    const key = `${table}:${privilege}`;

    if (!allowedAnonAccess.has(key)) {
      failures.push(`public.${table} grants ${privilege.toUpperCase()} to anon without an explicit Phase 13 allowlist entry.`);
    }
  }

  if (/create\s+(?:or\s+replace\s+)?view\s+public\.[\s\S]*?(?!security_invoker)/.test(normalizedSql)) {
    failures.push("public views must use security_invoker=true or stay out of exposed schemas.");
  }
}

function auditDeploymentWorkflow() {
  const deployPath = join(root, ".github", "workflows", "deploy.yml");

  if (!existsSync(deployPath)) {
    failures.push(".github/workflows/deploy.yml is missing.");
    return;
  }

  const source = readFileSync(deployPath, "utf8");
  const requiredSnippets = [
    "branches:",
    "- staging",
    "- production",
    "concurrency:",
    "pnpm install --frozen-lockfile",
    "pnpm build",
    "node scripts/deploy/prepare-standalone-assets.mjs",
    "pnpm run db:migrate",
    "sudo systemctl restart",
    "sudo systemctl reload caddy",
    "/api/health"
  ];

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      failures.push(`deploy.yml is missing required deployment guard: ${snippet}`);
    }
  }

  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL", "SMTP_FROM_NAME", "SENDGRID_API_KEY"]) {
    if (!source.includes(key)) {
      warnings.push(`deploy.yml does not surface ${key}; email sending may need this before live workers are enabled.`);
    }
  }
}

function auditReleaseDocs() {
  const requiredDocs = [
    "docs/VPS_DEPLOY_RUNBOOK.md",
    "docs/STAGING_SETUP_CHECKLIST.md",
    "docs/PHASE_13_HARDENING_PRODUCTION_LAUNCH.md"
  ];

  for (const doc of requiredDocs) {
    if (!existsSync(join(root, doc))) {
      failures.push(`${doc} is missing.`);
    }
  }
}

function scanFiles(directory, visit) {
  if (!existsSync(directory)) {
    return;
  }

  for (const entry of readdirSync(directory)) {
    const absolutePath = join(directory, entry);
    const stats = statSync(absolutePath);

    if (stats.isDirectory()) {
      if (!["node_modules", ".next", "dist", "coverage"].includes(entry)) {
        scanFiles(absolutePath, visit);
      }

      continue;
    }

    if (!/\.(?:ts|tsx|js|jsx|mjs|json|yml|yaml|md)$/.test(entry)) {
      continue;
    }

    visit(absolutePath, readFileSync(absolutePath, "utf8"));
  }
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
