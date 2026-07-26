#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const adjustment = process.env.MOLLIE_ADJUSTMENT || "";
const mollieApiKey = process.env.MOLLIE_API_KEY || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_INCASSO_STATE_PATH || "artifacts/mollie-incasso-runtime.json");
const evidencePath = path.resolve(process.cwd(), process.env.MOLLIE_ADJUSTMENT_EVIDENCE_PATH || "artifacts/mollie-adjustment-evidence.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie adjustment verification is restricted to staging.nxttrack.nl.");
}
if (!mollieApiKey.startsWith("test_")) throw new Error("A Mollie test credential is required.");
if (!supabaseUrl || !supabaseSecret) throw new Error("Staging Supabase credentials are required.");
if (!new Set(["refund", "chargeback"]).has(adjustment)) throw new Error("MOLLIE_ADJUSTMENT must be refund or chargeback.");

const state = JSON.parse(readFileSync(statePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const session = await one(
  admin
    .from("payment_sessions")
    .select("id, tenant_id, provider_config_id, manual_payment_id, participant_id, guardian_user_id, subscription_id, amount_cents, currency, status")
    .eq("tenant_id", state.tenant.id)
    .eq("id", state.paymentSessionId)
    .maybeSingle(),
  "paid payment session"
);
if (session.status !== "paid") throw new Error("Financial adjustment rehearsal requires a paid local payment session.");

const adjustmentResult = adjustment === "refund"
  ? await createAndVerifyRefund(session)
  : await verifyChargeback(session);

const evidence = {
  schemaVersion: 1,
  rehearsal: `mollie-${adjustment}`,
  harnessSha: process.env.GITHUB_SHA || "",
  releaseSha: state.releaseSha,
  runId: state.runId,
  tenantSlug: state.tenant.slug,
  providerPaymentId: state.providerPaymentId,
  result: {
    ...adjustmentResult,
    repeatedWebhookCount: 2,
    verifiedAt: new Date().toISOString()
  }
};
mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`[mollie:adjustment:verify] PASS ${adjustment} preserved provider-verified exactly-once effects.`);

async function createAndVerifyRefund(sessionRow) {
  const refundRequestId = randomUUID();
  const idempotencyKey = randomUUID();
  const amountCents = 43;
  const reservation = await one(
    admin
      .from("billing_refunds")
      .insert({
        id: refundRequestId,
        tenant_id: state.tenant.id,
        provider_config_id: sessionRow.provider_config_id,
        payment_session_id: sessionRow.id,
        manual_payment_id: sessionRow.manual_payment_id,
        participant_id: sessionRow.participant_id,
        guardian_user_id: sessionRow.guardian_user_id,
        provider: "mollie",
        provider_payment_id: state.providerPaymentId,
        idempotency_key: idempotencyKey,
        amount_cents: amountCents,
        currency: sessionRow.currency,
        status: "draft",
        description: `NXTTRACK staging refund ${state.runId}`.slice(0, 255),
        requested_by_user_id: null
      })
      .select("id")
      .single(),
    "local refund reservation"
  );
  if (reservation.id !== refundRequestId) throw new Error("Refund reservation ID changed unexpectedly.");

  const body = {
    amount: { currency: sessionRow.currency, value: (amountCents / 100).toFixed(2) },
    description: `NXTTRACK staging refund ${state.runId}`.slice(0, 255),
    metadata: {
      refundRequestId,
      tenantId: state.tenant.id,
      paymentSessionId: sessionRow.id,
      manualPaymentId: sessionRow.manual_payment_id
    }
  };
  const first = await mollieRequest(`/payments/${encodeURIComponent(state.providerPaymentId)}/refunds`, {
    body,
    idempotencyKey,
    method: "POST"
  });
  const replay = await mollieRequest(`/payments/${encodeURIComponent(state.providerPaymentId)}/refunds`, {
    body,
    idempotencyKey,
    method: "POST"
  });
  if (first.id !== replay.id) throw new Error("Mollie refund idempotency replay created a second provider refund.");

  const providerRefund = await getAcceptedProviderRefund(first.id);
  await repeatWebhook();
  const result = await pollLocalRefund(first.id, amountCents, providerRefund.status);
  return {
    amountCents,
    completionDeferred: providerRefund.status !== "refunded",
    currency: sessionRow.currency,
    idempotencyReplayId: replay.id,
    providerRefundId: first.id,
    providerStatus: providerRefund.status,
    ...result
  };
}

async function verifyChargeback(sessionRow) {
  let providerChargeback;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const payload = await mollieRequest(`/payments/${encodeURIComponent(state.providerPaymentId)}/chargebacks?limit=250`, { method: "GET" });
    providerChargeback = payload._embedded?.chargebacks?.find((item) => !item.reversedAt);
    if (providerChargeback) break;
    await wait(1_000);
  }
  if (!providerChargeback) throw new Error("Mollie test payment did not expose the requested chargeback.");

  await repeatWebhook();
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [chargeback, payment, providerEvents, billingEvents, tasks] = await Promise.all([
      admin
        .from("billing_chargebacks")
        .select("id, status, amount_cents, currency", { count: "exact" })
        .eq("tenant_id", state.tenant.id)
        .eq("provider_chargeback_id", providerChargeback.id),
      admin
        .from("manual_payments")
        .select("status, chargeback_cents")
        .eq("tenant_id", state.tenant.id)
        .eq("id", sessionRow.manual_payment_id)
        .single(),
      admin
        .from("payment_provider_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .eq("provider_event_id", `chargeback:${providerChargeback.id}:received`),
      admin
        .from("billing_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .eq("manual_payment_id", sessionRow.manual_payment_id)
        .eq("type", "payment_chargeback"),
      admin
        .from("tenant_tasks")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .ilike("description", `%${providerChargeback.id}%`)
    ]);
    for (const query of [chargeback, payment, providerEvents, billingEvents, tasks]) {
      if (query.error) throw query.error;
    }
    const local = chargeback.data?.[0];
    if (
      chargeback.count === 1 &&
      local?.status === "received" &&
      payment.data.status === "chargeback" &&
      payment.data.chargeback_cents === local.amount_cents &&
      providerEvents.count === 1 &&
      billingEvents.count === 1 &&
      tasks.count === 1
    ) {
      return {
        amountCents: local.amount_cents,
        billingEventCount: billingEvents.count,
        currency: local.currency,
        localChargebackCount: chargeback.count,
        manualPaymentStatus: payment.data.status,
        providerChargebackId: providerChargeback.id,
        providerEventCount: providerEvents.count,
        taskCount: tasks.count
      };
    }
    await wait(1_000);
  }
  throw new Error("Mollie chargeback did not produce the expected exactly-once local state.");
}

async function getAcceptedProviderRefund(refundId) {
  const refund = await mollieRequest(
    `/payments/${encodeURIComponent(state.providerPaymentId)}/refunds/${encodeURIComponent(refundId)}`,
    { method: "GET" }
  );
  if (!new Set(["queued", "pending", "processing", "refunded"]).has(refund.status)) {
    throw new Error(`Mollie refund reached unexpected status ${refund.status}.`);
  }
  return refund;
}

async function pollLocalRefund(refundId, expectedAmountCents, expectedStatus) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [refund, payment, providerEvents, billingEvents] = await Promise.all([
      admin
        .from("billing_refunds")
        .select("id, status, amount_cents, provider_refund_id", { count: "exact" })
        .eq("tenant_id", state.tenant.id)
        .eq("provider_refund_id", refundId),
      admin
        .from("manual_payments")
        .select("status, refunded_cents")
        .eq("tenant_id", state.tenant.id)
        .eq("id", session.manual_payment_id)
        .single(),
      admin
        .from("payment_provider_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .eq("provider_event_id", `refund:${refundId}:${expectedStatus}`),
      admin
        .from("billing_events")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .eq("manual_payment_id", session.manual_payment_id)
        .eq("type", "payment_refunded")
    ]);
    for (const query of [refund, payment, providerEvents, billingEvents]) {
      if (query.error) throw query.error;
    }
    const local = refund.data?.[0];
    const completed = expectedStatus === "refunded";
    if (
      refund.count === 1 &&
      local?.status === expectedStatus &&
      local.amount_cents === expectedAmountCents &&
      payment.data.status === "paid" &&
      payment.data.refunded_cents === (completed ? expectedAmountCents : 0) &&
      providerEvents.count === 1 &&
      billingEvents.count === (completed ? 1 : 0)
    ) {
      return {
        billingEventCount: billingEvents.count,
        localRefundCount: refund.count,
        localRefundStatus: local.status,
        manualPaymentStatus: payment.data.status,
        providerEventCount: providerEvents.count,
        refundedCents: payment.data.refunded_cents
      };
    }
    await wait(1_000);
  }
  throw new Error(`Mollie refund did not produce the expected exactly-once ${expectedStatus} local state.`);
}

async function repeatWebhook() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${appUrl}/api/webhooks/mollie`, {
      body: new URLSearchParams({ id: state.providerPaymentId }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST"
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(`Adjustment webhook returned ${response.status}${payload?.reason ? ` (${payload.reason})` : ""}.`);
    }
  }
}

async function mollieRequest(apiPath, input) {
  const response = await fetch(`https://api.mollie.com/v2${apiPath}`, {
    body: input.body ? JSON.stringify(input.body) : undefined,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${mollieApiKey}`,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
      ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {})
    },
    method: input.method
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(`Mollie ${apiPath} returned ${response.status}: ${safeProviderMessage(payload)}`);
  return payload;
}

async function one(query, label) {
  const result = await query;
  if (result.error || !result.data) throw new Error(`Could not load ${label}: ${result.error?.message ?? "row missing"}`);
  return result.data;
}

function safeProviderMessage(payload) {
  const value = payload?.detail || payload?.title || "provider request failed";
  return String(value).replace(/(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
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
