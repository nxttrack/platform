#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const mollieApiKey = process.env.MOLLIE_API_KEY || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_INCASSO_STATE_PATH || "artifacts/mollie-incasso-runtime.json");
const evidencePath = path.resolve(process.cwd(), process.env.MOLLIE_INCASSO_EVIDENCE_PATH || "artifacts/mollie-incasso-evidence.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie incasso verification is restricted to staging.nxttrack.nl.");
}
if (!mollieApiKey.startsWith("test_")) throw new Error("A Mollie test credential is required.");
if (!supabaseUrl || !supabaseSecret) throw new Error("Staging Supabase credentials are required.");

const state = JSON.parse(readFileSync(statePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const providerPayment = await pollProviderFinalState();
const mandate = await mollieRequest(`/customers/${encodeURIComponent(state.customerId)}/mandates/${encodeURIComponent(state.mandateId)}`);

for (let attempt = 0; attempt < 2; attempt += 1) {
  const response = await fetch(`${appUrl}/api/webhooks/mollie`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id: state.providerPaymentId })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`Repeated Mollie incasso webhook returned ${response.status}${body?.reason ? ` (${body.reason})` : ""}.`);
  }
}

await pollLocalPaidState();
const result = await verifyExactlyOnce();
const providerContract = {
  hasCheckoutUrl: Boolean(providerPayment._links?.checkout?.href),
  hasChangePaymentStateUrl: Boolean(providerPayment._links?.changePaymentState?.href),
  mandateStatus: mandate.status,
  method: providerPayment.method,
  sequenceType: providerPayment.sequenceType
};

if (
  providerContract.hasCheckoutUrl ||
  providerContract.hasChangePaymentStateUrl !== (state.outcome === "paid") ||
  providerContract.mandateStatus !== state.expected.mandateStatus ||
  providerContract.method !== state.expected.method ||
  providerContract.sequenceType !== state.expected.sequenceType
) {
  throw new Error(`Mollie recurring provider contract failed: ${JSON.stringify(providerContract)}`);
}

const evidence = {
  schemaVersion: 1,
  rehearsal: "mollie-recurring-sepa-direct-debit",
  outcome: state.outcome,
  automationEnabled: state.automationEnabled === true,
  harnessSha: state.harnessSha,
  releaseSha: state.releaseSha,
  runId: state.runId,
  tenantSlug: state.tenant.slug,
  amount: {
    cents: state.payment.amount_cents,
    currency: state.payment.currency
  },
  provider: {
    customerId: state.customerId,
    mandateId: state.mandateId,
    paymentId: state.providerPaymentId,
    ...providerContract
  },
  result: {
    ...result,
    repeatedWebhookCount: 2,
    verifiedAt: new Date().toISOString()
  }
};

mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`[mollie:incasso:verify] PASS ${state.outcome} recurring SEPA payment preserved the expected exactly-once effects.`);

async function pollProviderFinalState() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const payment = await mollieRequest(`/payments/${encodeURIComponent(state.providerPaymentId)}`);
    if (payment.status === state.expected.finalProviderStatus) return payment;
    await wait(1_000);
  }
  throw new Error(`Mollie recurring payment did not reach ${state.expected.finalProviderStatus} provider state.`);
}

async function pollLocalPaidState() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [payment, session] = await Promise.all([
      admin.from("manual_payments").select("status").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
      admin.from("payment_sessions").select("status").eq("tenant_id", state.tenant.id).eq("id", state.paymentSessionId).single()
    ]);
    if (payment.error) throw payment.error;
    if (session.error) throw session.error;
    if (payment.data.status === state.expected.finalPaymentStatus && session.data.status === state.expected.finalSessionStatus) return;
    await wait(1_000);
  }
  throw new Error("Mollie incasso webhook did not produce the expected local state.");
}

async function verifyExactlyOnce() {
  const [payment, session, collectionAttempt, sessions, providerEvents, billingEvents, failedBillingEvents] = await Promise.all([
    admin.from("manual_payments").select("status, method, reference").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
    admin.from("payment_sessions").select("status, provider_session_id, failure_code, failure_message").eq("tenant_id", state.tenant.id).eq("id", state.paymentSessionId).single(),
    admin.from("billing_collection_attempts").select("status, provider_payment_id, failure_code, failure_message, completed_at").eq("tenant_id", state.tenant.id).eq("id", state.collectionAttemptId).single(),
    admin.from("payment_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id),
    admin.from("payment_provider_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("provider_event_id", `${state.providerPaymentId}:${state.expected.finalProviderStatus}`),
    admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).eq("type", "payment_paid"),
    admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).eq("type", "payment_failed")
  ]);
  for (const query of [payment, session, collectionAttempt, sessions, providerEvents, billingEvents, failedBillingEvents]) {
    if (query.error) throw query.error;
  }

  const checks = {
    billingEventCount: billingEvents.count ?? 0,
    collectionAttemptStatus: collectionAttempt.data.status,
    failedBillingEventCount: failedBillingEvents.count ?? 0,
    failureCode: session.data.failure_code,
    hasFailureMessage: Boolean(session.data.failure_message),
    manualPaymentMethod: payment.data.method,
    manualPaymentStatus: payment.data.status,
    paymentSessionStatus: session.data.status,
    providerEventCount: providerEvents.count ?? 0,
    sessionCount: sessions.count ?? 0
  };
  if (
    checks.manualPaymentStatus !== state.expected.finalPaymentStatus ||
    checks.paymentSessionStatus !== state.expected.finalSessionStatus ||
    checks.collectionAttemptStatus !== state.expected.collectionAttemptStatus ||
    (state.outcome === "failed" && (checks.failureCode !== "provider_failed" || !checks.hasFailureMessage)) ||
    (state.outcome === "paid" && (checks.failureCode !== null || checks.hasFailureMessage)) ||
    checks.sessionCount !== state.expected.sessionCount ||
    checks.providerEventCount !== state.expected.providerEventCount ||
    checks.billingEventCount !== state.expected.billingEventCount ||
    checks.failedBillingEventCount !== (state.outcome === "failed" ? 1 : 0)
  ) {
    throw new Error(`Mollie incasso exactly-once verification failed: ${JSON.stringify(checks)}`);
  }
  return checks;
}

async function mollieRequest(apiPath) {
  const response = await fetch(`https://api.mollie.com/v2${apiPath}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${mollieApiKey}` }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`Mollie verification returned ${response.status}.`);
  return payload;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
