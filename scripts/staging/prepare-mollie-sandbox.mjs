#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "aquaswim-demo";
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
const releaseSha = process.env.STAGING_RELEASE_SHA || process.env.GITHUB_SHA || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_REHEARSAL_STATE_PATH || "artifacts/mollie-rehearsal-state.json");
const referencePrefix = "SPRINT6-MOLLIE-REHEARSAL-";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie sandbox preparation is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
}

if (!process.env.E2E_TENANT_ADMIN_EMAIL || !process.env.E2E_PARENT_EMAIL) {
  throw new Error("Staging tenant-admin and parent fixture emails are required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const tenant = await one(
  admin.from("tenants").select("id, slug, name").eq("slug", tenantSlug).maybeSingle(),
  "Phase 16 tenant"
);
const subscription = await one(
  admin
    .from("subscriptions")
    .select("id, enrollment_id, participant_id, guardian_user_id")
    .eq("tenant_id", tenant.id)
    .eq("notes", "phase16 subscription")
    .maybeSingle(),
  "Phase 16 subscription"
);

await removePreviousRehearsalRows(tenant.id);

const reference = `${referencePrefix}${runId}`;
const payment = await one(
  admin
    .from("manual_payments")
    .insert({
      tenant_id: tenant.id,
      subscription_id: subscription.id,
      participant_id: subscription.participant_id,
      enrollment_id: subscription.enrollment_id,
      guardian_user_id: subscription.guardian_user_id,
      amount_cents: 131,
      currency: "EUR",
      due_on: futureDate(14),
      paid_on: null,
      status: "due",
      reference,
      method: "mollie_test",
      notes: `Bounded Sprint 6 Mollie sandbox rehearsal ${runId}.`
    })
    .select("id, amount_cents, currency, reference, status")
    .single(),
  "sandbox manual payment"
);

const state = {
  schemaVersion: 2,
  appUrl,
  harnessSha: process.env.GITHUB_SHA || "",
  releaseSha,
  runId,
  tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  users: {
    parentEmail: process.env.E2E_PARENT_EMAIL,
    tenantAdminEmail: process.env.E2E_TENANT_ADMIN_EMAIL
  },
  payment,
  expected: {
    billingEventCount: 1,
    providerEventCount: 1,
    sessionCount: 1,
    finalPaymentStatus: "paid",
    finalSessionStatus: "paid"
  }
};

mkdirSync(path.dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`[mollie:prepare] PASS created bounded payment ${reference} and wrote ${statePath}.`);

async function removePreviousRehearsalRows(tenantId) {
  const paymentsResult = await admin
    .from("manual_payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .like("reference", `${referencePrefix}%`);
  const payments = checked(paymentsResult, "previous rehearsal payments").map((row) => row.id);

  if (payments.length === 0) return;

  await checkedDelete(admin.from("payment_provider_events").delete().eq("tenant_id", tenantId).in("manual_payment_id", payments), "provider events");
  await checkedDelete(admin.from("billing_events").delete().eq("tenant_id", tenantId).in("manual_payment_id", payments), "billing events");
  await checkedDelete(admin.from("payment_sessions").delete().eq("tenant_id", tenantId).in("manual_payment_id", payments), "payment sessions");
  await checkedDelete(admin.from("manual_payments").delete().eq("tenant_id", tenantId).in("id", payments), "manual payments");
}

async function checkedDelete(query, label) {
  checked(await query, label);
}

async function one(query, label) {
  const result = await query;
  if (result.error || !result.data) {
    throw new Error(`Could not load ${label}: ${result.error?.message ?? "row missing"}`);
  }
  return result.data;
}

function checked(result, label) {
  if (result.error) throw new Error(`Could not process ${label}: ${result.error.message}`);
  return result.data ?? [];
}

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
