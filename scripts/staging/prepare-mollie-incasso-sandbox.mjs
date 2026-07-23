#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const mollieApiKey = process.env.MOLLIE_API_KEY || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const tenantSlug = process.env.PHASE16_TENANT_SLUG || "aquaswim-demo";
const runId = process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
const releaseSha = process.env.STAGING_RELEASE_SHA || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_INCASSO_STATE_PATH || "artifacts/mollie-incasso-runtime.json");
const referencePrefix = "SPRINT6-MOLLIE-INCASSO-";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie incasso preparation is restricted to staging.nxttrack.nl.");
}

if (!mollieApiKey.startsWith("test_")) {
  throw new Error("A Mollie test credential is required.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
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
const providerConfig = await one(
  admin
    .from("billing_provider_configs")
    .select("id, mode, provider, status")
    .eq("tenant_id", tenant.id)
    .eq("provider", "mollie")
    .eq("mode", "test")
    .eq("status", "active")
    .maybeSingle(),
  "active Mollie test provider"
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
      amount_cents: 143,
      currency: "EUR",
      due_on: futureDate(14),
      paid_on: null,
      status: "due",
      reference,
      method: "mollie_directdebit_test",
      notes: `Bounded Sprint 6 Mollie incasso rehearsal ${runId}.`
    })
    .select("id, amount_cents, currency, reference, status")
    .single(),
  "sandbox incasso payment"
);

const paymentSessionId = randomUUID();
const idempotencyKey = randomUUID();
await one(
  admin
    .from("payment_sessions")
    .insert({
      id: paymentSessionId,
      tenant_id: tenant.id,
      provider_config_id: providerConfig.id,
      subscription_id: subscription.id,
      manual_payment_id: payment.id,
      participant_id: subscription.participant_id,
      guardian_user_id: subscription.guardian_user_id,
      provider: "mollie",
      idempotency_key: idempotencyKey,
      amount_cents: payment.amount_cents,
      currency: payment.currency,
      status: "pending",
      return_url: null,
      expires_at: null
    })
    .select("id")
    .single(),
  "sandbox incasso payment session"
);

let customer;
let mandate;
let providerPayment;
try {
  customer = await mollieRequest("/customers", {
    method: "POST",
    body: {
      name: "NXTTRACK Incasso Rehearsal",
      email: `incasso-${runId}@nxttrack.test`,
      metadata: { rehearsal: "nxttrack-staging-incasso", runId }
    }
  });
  mandate = await mollieRequest(`/customers/${encodeURIComponent(customer.id)}/mandates`, {
    method: "POST",
    body: {
      method: "directdebit",
      consumerName: "NXTTRACK Incasso Rehearsal",
      consumerAccount: "NL55INGB0000000000",
      consumerBic: "INGBNL2A",
      signatureDate: new Date().toISOString().slice(0, 10),
      mandateReference: `NXTTRACK-${runId}`.slice(0, 35)
    }
  });
  providerPayment = await mollieRequest("/payments", {
    method: "POST",
    idempotencyKey,
    body: {
      amount: { currency: payment.currency, value: (payment.amount_cents / 100).toFixed(2) },
      customerId: customer.id,
      mandateId: mandate.id,
      method: "directdebit",
      sequenceType: "recurring",
      description: `NXTTRACK staging incasso ${runId}`.slice(0, 255),
      webhookUrl: `${appUrl}/api/webhooks/mollie`,
      metadata: {
        tenantId: tenant.id,
        paymentSessionId,
        manualPaymentId: payment.id,
        rehearsal: "recurring_directdebit"
      }
    }
  });
} catch (error) {
  await admin
    .from("payment_sessions")
    .update({
      status: "failed",
      failure_code: "incasso_rehearsal_prepare",
      failure_message: error instanceof Error ? error.message.slice(0, 500) : "Mollie incasso preparation failed."
    })
    .eq("tenant_id", tenant.id)
    .eq("id", paymentSessionId);
  throw error;
}

const changePaymentStateUrl = providerPayment._links?.changePaymentState?.href;
if (!changePaymentStateUrl || !isMollieUrl(changePaymentStateUrl)) {
  throw new Error("Mollie recurring test payment did not expose a safe changePaymentState URL.");
}
if (providerPayment._links?.checkout?.href) {
  throw new Error("Mollie recurring payment unexpectedly exposed a customer checkout URL.");
}

const sessionUpdate = await admin
  .from("payment_sessions")
  .update({
    provider_session_id: providerPayment.id,
    checkout_url: null,
    status: normalizeProviderStatus(providerPayment.status),
    expires_at: providerPayment.expiresAt ?? null
  })
  .eq("tenant_id", tenant.id)
  .eq("id", paymentSessionId);
if (sessionUpdate.error) throw sessionUpdate.error;

const state = {
  schemaVersion: 1,
  appUrl,
  harnessSha: process.env.GITHUB_SHA || "",
  releaseSha,
  runId,
  tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
  providerConfigId: providerConfig.id,
  subscriptionId: subscription.id,
  payment,
  paymentSessionId,
  customerId: customer.id,
  mandateId: mandate.id,
  mandateStatus: mandate.status,
  providerPaymentId: providerPayment.id,
  providerPaymentStatus: providerPayment.status,
  changePaymentStateUrl,
  expected: {
    billingEventCount: 1,
    finalPaymentStatus: "paid",
    finalSessionStatus: "paid",
    mandateStatus: "valid",
    method: "directdebit",
    providerEventCount: 1,
    sequenceType: "recurring",
    sessionCount: 1
  }
};

mkdirSync(path.dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
console.log(`[mollie:incasso:prepare] PASS created test customer, mandate and €1.43 recurring payment for ${reference}.`);

async function mollieRequest(apiPath, input) {
  const response = await fetch(`https://api.mollie.com/v2${apiPath}`, {
    method: input.method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${mollieApiKey}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
    },
    body: input.body ? JSON.stringify(input.body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(`Mollie ${apiPath} returned ${response.status}: ${safeProviderMessage(payload)}`);
  }
  return payload;
}

async function removePreviousRehearsalRows(tenantId) {
  const paymentsResult = await admin
    .from("manual_payments")
    .select("id")
    .eq("tenant_id", tenantId)
    .like("reference", `${referencePrefix}%`);
  const payments = checked(paymentsResult, "previous incasso rehearsal payments").map((row) => row.id);
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

function isMollieUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com"));
  } catch {
    return false;
  }
}

function normalizeProviderStatus(status) {
  if (status === "paid") return "paid";
  if (status === "authorized") return "authorized";
  if (status === "failed") return "failed";
  if (status === "expired") return "expired";
  if (status === "canceled") return "cancelled";
  return "pending";
}

function safeProviderMessage(payload) {
  const value = payload?.detail || payload?.title || "provider request failed";
  return String(value).replace(/(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}
