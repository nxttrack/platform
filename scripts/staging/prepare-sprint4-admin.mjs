#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const phaseStatePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 admin preparation is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
}

if (!existsSync(phaseStatePath)) {
  throw new Error(`Phase 16 state is missing at ${phaseStatePath}.`);
}

const phase = JSON.parse(readFileSync(phaseStatePath, "utf8"));
const tenantId = phase.tenant.id;
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const [programs, stages, groups, participants, plans, subscriptions, payments, sessions] = await Promise.all([
  idsLike("programs", "code", "sprint4-admin-program-%"),
  idsLike("program_stages", "code", "sprint4-admin-stage-%"),
  idsLike("groups", "code", "sprint4-admin-group-%"),
  idsLike("participants", "display_name", "Sprint 4 Admin Leerling%"),
  idsLike("payment_plans", "code", "sprint4-admin-plan-%"),
  idsLike("subscriptions", "notes", "sprint4-admin:%"),
  idsLike("manual_payments", "reference", "sprint4-admin-payment-%"),
  idsLike("sessions", "notes", "sprint4-admin:%")
]);

const enrollmentIds = participants.length > 0 ? await idsIn("enrollments", "participant_id", participants) : [];

await removeLike("tenant_messages", "title", "Sprint 4 Admin Bericht%");
await removeLike("tenant_documents", "title", "Sprint 4 Admin Document%");

if (payments.length > 0) {
  await removeIn("billing_events", "manual_payment_id", payments);
  await removeIn("manual_payments", "id", payments);
}

if (subscriptions.length > 0) {
  await removeIn("billing_events", "subscription_id", subscriptions);
  await removeIn("subscriptions", "id", subscriptions);
}

if (plans.length > 0) await removeIn("payment_plans", "id", plans);
if (sessions.length > 0) await removeIn("sessions", "id", sessions);

if (enrollmentIds.length > 0) {
  await removeIn("group_memberships", "enrollment_id", enrollmentIds);
  await removeIn("enrollments", "id", enrollmentIds);
}

if (participants.length > 0) await removeIn("participants", "id", participants);

if (groups.length > 0) {
  await removeIn("group_instructor_assignments", "group_id", groups);
  await removeIn("group_memberships", "group_id", groups);
  await removeIn("sessions", "group_id", groups);
  await removeIn("groups", "id", groups);
}

if (stages.length > 0) await removeIn("program_stages", "id", stages);
if (programs.length > 0) await removeIn("programs", "id", programs);

console.log("[sprint4:prepare-admin] PASS removed only bounded Sprint 4 admin records.");

async function idsLike(table, field, pattern) {
  const result = await admin.from(table).select("id").eq("tenant_id", tenantId).like(field, pattern);
  return checked(result, table).map((row) => row.id);
}

async function idsIn(table, field, values) {
  const result = await admin.from(table).select("id").eq("tenant_id", tenantId).in(field, values);
  return checked(result, table).map((row) => row.id);
}

async function removeLike(table, field, pattern) {
  const result = await admin.from(table).delete().eq("tenant_id", tenantId).like(field, pattern);
  checked(result, table);
}

async function removeIn(table, field, values) {
  const result = await admin.from(table).delete().eq("tenant_id", tenantId).in(field, values);
  checked(result, table);
}

function checked(result, label) {
  if (result.error) throw new Error(`Could not clean Sprint 4 ${label}: ${result.error.message}`);
  return result.data ?? [];
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
