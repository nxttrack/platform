#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const failures = [];

if (!existsSync(migrationsDir)) {
  fail("supabase/migrations is missing.");
} else {
  const sql = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDir, fileName), "utf8"))
    .join("\n");
  const normalized = normalizeSql(sql);
  const publicTables = unique([...normalized.matchAll(/create table public\.([a-z_][a-z0-9_]*)/g)].map((match) => match[1]));
  const sensitiveTables = [
    "tenant_memberships",
    "platform_memberships",
    "tenant_account_invitations",
    "tenant_super_admin_invitations",
    "participants",
    "participant_guardians",
    "enrollments",
    "group_memberships",
    "instructors",
    "groups",
    "sessions",
    "session_attendance",
    "progress",
    "stage_module_progress",
    "badge_awards",
    "certificates",
    "invoice_numbering_rules",
    "invoices",
    "payment_records",
    "payment_refunds",
    "message_outbox",
    "tenant_document_records",
    "report_export_requests",
    "report_permission_grants",
    "finance_export_requests",
    "tenant_account_invitations",
    "waitlist_entries",
    "placement_suggestions",
    "slot_offers",
    "platform_smtp_settings",
    "audit_events"
  ];
  const expectedAuditTriggers = [
    "tenant_memberships",
    "participants",
    "participant_guardians",
    "enrollments",
    "group_memberships",
    "instructors",
    "groups",
    "sessions",
    "invoices",
    "payment_records",
    "payment_refunds",
    "invoice_numbering_rules",
    "message_outbox",
    "tenant_document_records",
    "report_export_requests",
    "report_permission_grants",
    "finance_export_requests",
    "tenant_account_invitations",
    "waitlist_entries",
    "placement_suggestions",
    "slot_offers",
    "platform_smtp_settings"
  ];

  for (const table of publicTables) {
    assertIncludes(normalized, `alter table public.${table} enable row level security;`, `public.${table} must enable RLS.`);
    assertMatches(normalized, new RegExp(`create policy [\\s\\S]*? on public\\.${escapeRegExp(table)}[\\s\\S]*?;`), `public.${table} must have at least one RLS policy.`);
  }

  for (const table of sensitiveTables) {
    if (!publicTables.includes(table)) {
      fail(`Sensitive table public.${table} is expected but was not found.`);
      continue;
    }

    assertNoMatches(normalized, new RegExp(`grant\\s+[^;]+\\s+on\\s+(?:table\\s+)?public\\.${escapeRegExp(table)}\\s+to\\s+anon`), `Sensitive table public.${table} must not grant access to anon.`);
  }

  const updatePolicies = [...normalized.matchAll(/create policy [\s\S]*? for update [\s\S]*?;/g)].map((match) => match[0]);

  for (const policy of updatePolicies) {
    if (!policy.includes("with check")) {
      fail(`UPDATE policy must include WITH CHECK: ${shorten(policy)}`);
    }
  }

  assertNoMatches(normalized, /create\s+(?:or replace\s+)?view public\./, "Public views are not allowed unless a future audit enforces security_invoker=true.");
  assertNoMatches(normalized, /create\s+(?:or replace\s+)?function public\./, "Security-sensitive functions must not be created in the exposed public schema.");
  assertNoMatches(normalized, /\bauth\.role\s*\(/, "Policies must not use deprecated auth.role(); use TO clauses and explicit predicates.");
  assertNoMatches(normalized, /\braw_user_meta_data\b|\buser_metadata\b/, "Authorization must not depend on editable user metadata.");

  assertIncludes(normalized, "create table public.audit_events", "Generic audit_events table must exist.");
  assertIncludes(normalized, "alter table public.audit_events enable row level security;", "audit_events must be RLS-protected.");
  assertIncludes(normalized, "create policy \"tenant staff and platform staff can view tenant audit events\"", "audit_events must have scoped read policy.");

  for (const table of expectedAuditTriggers) {
    assertMatches(normalized, new RegExp(`create trigger ${escapeRegExp(table)}_audit_events[\\s\\S]*? on public\\.${escapeRegExp(table)}`), `public.${table} must emit generic audit events.`);
  }

  assertIncludes(normalized, "bucket_id = 'tenant-documents'", "tenant document storage policies must scope to tenant-documents bucket.");
  assertIncludes(normalized, "storage.foldername(name)", "tenant document storage policies must isolate tenant folders.");
}

if (failures.length > 0) {
  console.error("[rls:test] RLS contract tests failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[rls:test] RLS contract tests passed.");

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

function assertIncludes(source, needle, message) {
  if (!source.includes(needle.toLowerCase())) {
    fail(message);
  }
}

function assertMatches(source, pattern, message) {
  if (!pattern.test(source)) {
    fail(message);
  }
}

function assertNoMatches(source, pattern, message) {
  if (pattern.test(source)) {
    fail(message);
  }
}

function fail(message) {
  failures.push(message);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shorten(value) {
  return `${value.slice(0, 180)}${value.length > 180 ? "..." : ""}`;
}
