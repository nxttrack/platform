#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_MANDATE_STATE_PATH || "artifacts/mollie-mandate-runtime.json");
const evidencePath = path.resolve(process.cwd(), process.env.MOLLIE_MANDATE_EVIDENCE_PATH || "artifacts/mollie-mandate-evidence.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie mandate verification is restricted to staging.nxttrack.nl.");
}
if (!supabaseUrl || !supabaseSecret) throw new Error("Staging Supabase credentials are required.");

const state = JSON.parse(readFileSync(statePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const session = await pollSession();
for (let attempt = 0; attempt < 2; attempt += 1) {
  const response = await fetch(`${appUrl}/api/webhooks/mollie`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id: session.provider_session_id })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(`Repeated mandate webhook returned ${response.status}${body?.reason ? ` (${body.reason})` : ""}.`);
  }
}

const verified = await pollVerifiedState();
const [providerEvents, paidEvents, mandateEvents] = await Promise.all([
  count(admin.from("payment_provider_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("provider_event_id", `${session.provider_session_id}:paid`)),
  count(admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("payment_session_id", session.id).eq("type", "payment_paid")),
  count(admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("payment_session_id", session.id).eq("type", "mandate_activated"))
]);

const checks = {
  accountLast4: verified.mandate.account_last4,
  consentInitiated: Boolean(session.consent_initiated_at),
  consentRecorded: Boolean(verified.mandate.consent_recorded_at),
  consentTermsVersion: session.consent_terms_version,
  mandateEventCount: mandateEvents,
  mandateMethod: verified.mandate.method,
  mandateStatus: verified.mandate.status,
  manualPaymentStatus: verified.payment.status,
  paidEventCount: paidEvents,
  providerEventCount: providerEvents,
  repeatedWebhookCount: 2,
  sequenceType: session.sequence_type,
  subscriptionMandateLinked: verified.subscription.billing_mandate_id === verified.mandate.id
};
if (
  checks.manualPaymentStatus !== "paid" ||
  checks.sequenceType !== "first" ||
  checks.mandateStatus !== "valid" ||
  checks.mandateMethod !== "directdebit" ||
  !/^[A-Za-z0-9]{4}$/.test(checks.accountLast4 ?? "") ||
  !checks.consentInitiated ||
  !checks.consentRecorded ||
  !checks.consentTermsVersion ||
  !checks.subscriptionMandateLinked ||
  checks.providerEventCount !== 1 ||
  checks.paidEventCount !== 1 ||
  checks.mandateEventCount !== 1
) {
  throw new Error(`Mollie mandate onboarding verification failed: ${JSON.stringify(checks)}`);
}

const evidence = {
  schemaVersion: 1,
  rehearsal: "mollie-first-payment-mandate-onboarding",
  harnessSha: state.harnessSha,
  releaseSha: state.releaseSha,
  runId: state.runId,
  tenantSlug: state.tenant.slug,
  amount: { cents: state.payment.amount_cents, currency: state.payment.currency },
  result: { ...checks, verifiedAt: new Date().toISOString() }
};
mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log("[mollie:mandate:verify] PASS first payment activated one valid, masked and consent-audited mandate.");

async function pollSession() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await admin
      .from("payment_sessions")
      .select("id, provider_session_id, sequence_type, status, consent_terms_version, consent_initiated_at")
      .eq("tenant_id", state.tenant.id)
      .eq("manual_payment_id", state.payment.id)
      .eq("sequence_type", "first")
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.provider_session_id) return result.data;
    await wait(1_000);
  }
  throw new Error("First-payment session was not created.");
}

async function pollVerifiedState() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [paymentResult, subscriptionResult] = await Promise.all([
      admin.from("manual_payments").select("status").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
      admin.from("subscriptions").select("billing_mandate_id").eq("tenant_id", state.tenant.id).eq("id", state.subscriptionId).single()
    ]);
    if (paymentResult.error) throw paymentResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;
    if (paymentResult.data.status === "paid" && subscriptionResult.data.billing_mandate_id) {
      const mandateResult = await admin
        .from("billing_mandates")
        .select("id, method, status, account_last4, consent_recorded_at")
        .eq("tenant_id", state.tenant.id)
        .eq("id", subscriptionResult.data.billing_mandate_id)
        .single();
      if (mandateResult.error) throw mandateResult.error;
      if (mandateResult.data.status === "valid") {
        return { mandate: mandateResult.data, payment: paymentResult.data, subscription: subscriptionResult.data };
      }
    }
    await wait(1_000);
  }
  throw new Error("First payment did not activate the local mandate.");
}

async function count(query) {
  const result = await query;
  if (result.error) throw result.error;
  return result.count ?? 0;
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
