#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const statePath = path.resolve(process.cwd(), process.env.MOLLIE_REHEARSAL_STATE_PATH || "artifacts/mollie-rehearsal-state.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Mollie sandbox verification is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
}

const state = JSON.parse(readFileSync(statePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const session = await pollSession();
await pollProviderPaid(session.provider_session_id);

for (let attempt = 0; attempt < 2; attempt += 1) {
  const response = await fetch(`${appUrl}/api/webhooks/mollie`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id: session.provider_session_id })
  });
  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const diagnostic = await admin
      .from("payment_provider_events")
      .select("error_message")
      .eq("tenant_id", state.tenant.id)
      .eq("provider_event_id", `${session.provider_session_id}:webhook_error`)
      .maybeSingle();
    const message = diagnostic.data?.error_message ? ` ${String(diagnostic.data.error_message).slice(0, 300)}` : "";
    const reason = typeof responseBody?.reason === "string" ? ` reason=${responseBody.reason}.` : "";
    throw new Error(`Repeated Mollie webhook returned ${response.status}.${reason}${message}`);
  }
}

await pollPaidState();
const result = await verifyExactlyOnce(session);
writeFileSync(statePath, `${JSON.stringify({ ...state, result }, null, 2)}\n`);
console.log("[mollie:verify] PASS paid checkout and two repeated webhooks produced exactly one business effect.");

async function pollSession() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await admin
      .from("payment_sessions")
      .select("id, checkout_url, provider_session_id, status")
      .eq("tenant_id", state.tenant.id)
      .eq("manual_payment_id", state.payment.id)
      .maybeSingle();
    if (result.error) throw result.error;
    if (result.data?.checkout_url && result.data.provider_session_id) return result.data;
    await wait(1_000);
  }
  throw new Error("Mollie payment session did not become ready.");
}

async function pollPaidState() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [payment, sessionResult] = await Promise.all([
      admin.from("manual_payments").select("status").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
      admin.from("payment_sessions").select("status").eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).single()
    ]);
    if (payment.error) throw payment.error;
    if (sessionResult.error) throw sessionResult.error;
    if (payment.data.status === state.expected.finalPaymentStatus && sessionResult.data.status === state.expected.finalSessionStatus) return;
    await wait(1_000);
  }
  throw new Error("Mollie webhook did not produce the expected paid state.");
}

async function pollProviderPaid(providerPaymentId) {
  const apiKey = process.env.MOLLIE_API_KEY || "";
  if (!apiKey.startsWith("test_")) throw new Error("A Mollie test credential is required for provider verification.");

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(providerPaymentId)}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` }
    });
    const payment = await response.json().catch(() => null);
    if (!response.ok || !payment) throw new Error(`Mollie provider verification returned ${response.status}.`);
    if (payment.status === state.expected.finalPaymentStatus) return;
    await wait(1_000);
  }

  throw new Error("Mollie hosted checkout did not reach the expected paid provider state.");
}

async function verifyExactlyOnce(session) {
  const [payment, paymentSession, sessions, providerEvents, billingEvents] = await Promise.all([
    admin.from("manual_payments").select("status, method").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
    admin.from("payment_sessions").select("status, provider_session_id").eq("tenant_id", state.tenant.id).eq("id", session.id).single(),
    admin.from("payment_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id),
    admin.from("payment_provider_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("provider_event_id", `${session.provider_session_id}:paid`),
    admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).eq("type", "payment_paid")
  ]);

  for (const query of [payment, paymentSession, sessions, providerEvents, billingEvents]) {
    if (query.error) throw query.error;
  }

  const checks = {
    manualPaymentStatus: payment.data.status,
    paymentSessionStatus: paymentSession.data.status,
    sessionCount: sessions.count ?? 0,
    providerEventCount: providerEvents.count ?? 0,
    billingEventCount: billingEvents.count ?? 0
  };

  if (
    checks.manualPaymentStatus !== state.expected.finalPaymentStatus ||
    checks.paymentSessionStatus !== state.expected.finalSessionStatus ||
    checks.sessionCount !== state.expected.sessionCount ||
    checks.providerEventCount !== state.expected.providerEventCount ||
    checks.billingEventCount !== state.expected.billingEventCount
  ) {
    throw new Error(`Mollie exactly-once verification failed: ${JSON.stringify(checks)}`);
  }

  return {
    ...checks,
    providerSessionId: paymentSession.data.provider_session_id,
    repeatedWebhookCount: 2,
    verifiedAt: new Date().toISOString()
  };
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
