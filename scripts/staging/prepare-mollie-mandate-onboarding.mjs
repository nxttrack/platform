#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const mollieApiKey = process.env.MOLLIE_API_KEY || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "nxttrack-e2e";
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
const releaseSha = process.env.STAGING_RELEASE_SHA || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_MANDATE_STATE_PATH || "artifacts/mollie-mandate-runtime.json");
const referencePrefix = "SPRINT6-MOLLIE-MANDATE-";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie mandate onboarding is restricted to staging.nxttrack.nl.");
}
if (!mollieApiKey.startsWith("test_")) throw new Error("A Mollie test credential is required.");
if (!supabaseUrl || !supabaseSecret || !process.env.E2E_PARENT_EMAIL) {
  throw new Error("Staging Supabase credentials and the parent fixture email are required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const tenant = await one(admin.from("tenants").select("id, slug, name").eq("slug", tenantSlug).maybeSingle(), "Phase 16 tenant");
const subscription = await one(
  admin
    .from("subscriptions")
    .select("id, enrollment_id, participant_id, guardian_user_id, payment_plan_id")
    .eq("tenant_id", tenant.id)
    .eq("notes", "phase16 subscription")
    .maybeSingle(),
  "Phase 16 subscription"
);
const [participant, providerConfig] = await Promise.all([
  one(admin.from("participants").select("display_name").eq("tenant_id", tenant.id).eq("id", subscription.participant_id).single(), "Phase 16 participant"),
  one(
    admin
      .from("billing_provider_configs")
      .select("id, public_config")
      .eq("tenant_id", tenant.id)
      .eq("provider", "mollie")
      .eq("mode", "test")
      .eq("status", "active")
      .maybeSingle(),
    "active Mollie test provider"
  )
]);

await removePreviousRows(tenant.id, subscription.id);

const publicConfig = { ...(providerConfig.public_config ?? {}) };
const configUpdate = await admin
  .from("billing_provider_configs")
  .update({
    public_config: {
      ...publicConfig,
      direct_debit_notice_days: 2,
      recurring_enabled: true,
      return_url: `${appUrl}/portaal/betalingen`
    }
  })
  .eq("tenant_id", tenant.id)
  .eq("id", providerConfig.id);
if (configUpdate.error) throw configUpdate.error;

const subscriptionUpdate = await admin
  .from("subscriptions")
  .update({
    provider_config_id: providerConfig.id,
    collection_method: "provider",
    billing_provider_customer_id: null,
    billing_mandate_id: null
  })
  .eq("tenant_id", tenant.id)
  .eq("id", subscription.id);
if (subscriptionUpdate.error) throw subscriptionUpdate.error;

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
      amount_cents: 151,
      currency: "EUR",
      due_on: futureDate(60),
      paid_on: null,
      status: "due",
      reference,
      method: "mollie_first_test",
      notes: `Bounded Mollie mandate onboarding rehearsal ${runId}.`
    })
    .select("id, amount_cents, currency, reference")
    .single(),
  "first payment fixture"
);

const state = {
  schemaVersion: 1,
  appUrl,
  harnessSha: process.env.GITHUB_SHA || "",
  releaseSha,
  runId,
  tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  subscriptionId: subscription.id,
  participantName: participant.display_name,
  parentEmail: process.env.E2E_PARENT_EMAIL,
  payment
};

mkdirSync(path.dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(`[mollie:mandate:prepare] PASS created bounded first-payment fixture ${reference}.`);

async function removePreviousRows(tenantId, subscriptionId) {
  const subscriptionReset = await admin
    .from("subscriptions")
    .update({ billing_provider_customer_id: null, billing_mandate_id: null })
    .eq("tenant_id", tenantId)
    .eq("id", subscriptionId);
  if (subscriptionReset.error) throw subscriptionReset.error;

  const paymentsResult = await admin
    .from("manual_payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .like("reference", `${referencePrefix}%`);
  const paymentIds = checked(paymentsResult, "previous mandate rehearsal payments").map((row) => row.id);
  if (paymentIds.length === 0) return;

  await checkedDelete(admin.from("payment_provider_events").delete().eq("tenant_id", tenantId).in("manual_payment_id", paymentIds), "provider events");
  await checkedDelete(admin.from("billing_events").delete().eq("tenant_id", tenantId).in("manual_payment_id", paymentIds), "billing events");
  await checkedDelete(admin.from("payment_sessions").delete().eq("tenant_id", tenantId).in("manual_payment_id", paymentIds), "payment sessions");
  await checkedDelete(admin.from("manual_payments").delete().eq("tenant_id", tenantId).in("id", paymentIds), "manual payments");
}

async function checkedDelete(query, label) {
  checked(await query, label);
}

async function one(query, label) {
  const result = await query;
  if (result.error || !result.data) throw new Error(`Could not load ${label}: ${result.error?.message ?? "row missing"}`);
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
