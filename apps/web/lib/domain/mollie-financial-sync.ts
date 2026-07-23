import "server-only";

import { randomUUID } from "node:crypto";
import {
  listMolliePaymentChargebacks,
  listMolliePaymentRefunds,
  type MollieChargeback,
  type MollieRefund
} from "./mollie";
import {
  normalizeMollieRefundStatus,
  parseMollieAmountCents,
  type MollieMode
} from "./mollie-contract";
import { createTenantNotifications } from "./tenant-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

type FinancialSession = {
  amount_cents: number;
  currency: string;
  guardian_user_id: string | null;
  id: string;
  manual_payment_id: string;
  participant_id: string;
  provider_config_id: string;
  subscription_id: string;
  tenant_id: string;
};

export async function syncMollieFinancialAdjustments(input: {
  mode: MollieMode;
  paymentId: string;
  secretReference: string;
  session: FinancialSession;
}) {
  const [refunds, chargebacks] = await Promise.all([
    listMolliePaymentRefunds(input.paymentId, input.secretReference, input.mode),
    listMolliePaymentChargebacks(input.paymentId, input.secretReference, input.mode)
  ]);

  for (const refund of refunds) {
    await syncRefund(input.session, input.paymentId, refund);
  }
  for (const chargeback of chargebacks) {
    await syncChargeback(input.session, input.paymentId, chargeback);
  }

  const refundedCents = Math.min(
    input.session.amount_cents,
    refunds
      .filter((refund) => refund.status === "refunded")
      .reduce((total, refund) => total + parseMollieAmountCents(refund.amount.value), 0)
  );
  const chargebackCents = Math.min(
    input.session.amount_cents,
    chargebacks
      .filter((chargeback) => !chargeback.reversedAt)
      .reduce((total, chargeback) => total + parseMollieAmountCents(chargeback.amount.value), 0)
  );
  const status = chargebackCents > 0
    ? "chargeback"
    : refundedCents === input.session.amount_cents
      ? "refunded"
      : "paid";

  const admin = createAdminClient();
  const paymentUpdate = await admin
    .from("manual_payments")
    .update({
      refunded_cents: refundedCents,
      chargeback_cents: chargebackCents,
      status
    })
    .eq("tenant_id", input.session.tenant_id)
    .eq("id", input.session.manual_payment_id);
  if (paymentUpdate.error) throw paymentUpdate.error;

  return { chargebackCents, chargebacks: chargebacks.length, refundedCents, refunds: refunds.length };
}

async function syncRefund(session: FinancialSession, expectedPaymentId: string, refund: MollieRefund) {
  const admin = createAdminClient();
  const amountCents = parseMollieAmountCents(refund.amount.value);
  if (refund.amount.currency !== session.currency) throw new Error("Mollie refund currency does not match payment session.");
  if (refund.paymentId !== expectedPaymentId) throw new Error("Mollie refund payment does not match payment session.");
  const status = normalizeMollieRefundStatus(refund.status);
  const now = new Date().toISOString();
  const completedAt = ["refunded", "failed", "cancelled"].includes(status) ? now : null;
  const localRefundId = readUuid(refund.metadata?.refundRequestId);
  let syncError = null;

  if (localRefundId) {
    const update = await admin
      .from("billing_refunds")
      .update({
        provider_refund_id: refund.id,
        status,
        completed_at: completedAt,
        last_synced_at: now,
        failure_code: status === "failed" ? "provider_failed" : null,
        failure_message: status === "failed" ? "Mollie kon de refund niet voltooien." : null,
        provider_payload: refundPayload(refund)
      })
      .eq("tenant_id", session.tenant_id)
      .eq("id", localRefundId)
      .eq("manual_payment_id", session.manual_payment_id)
      .select("id");
    syncError = update.error;
    if (!update.error && (update.data ?? []).length > 0) {
      await recordRefundEvent(session, refund, status);
      return;
    }
  }

  const upsert = await admin
    .from("billing_refunds")
    .upsert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      participant_id: session.participant_id,
      guardian_user_id: session.guardian_user_id,
      provider: "mollie",
      provider_payment_id: refund.paymentId || "",
      provider_refund_id: refund.id,
      idempotency_key: randomUUID(),
      amount_cents: amountCents,
      currency: refund.amount.currency,
      status,
      description: refund.description || "Mollie refund",
      requested_by_user_id: null,
      requested_at: refund.createdAt,
      completed_at: completedAt,
      last_synced_at: now,
      failure_code: status === "failed" ? "provider_failed" : null,
      failure_message: status === "failed" ? "Mollie kon de refund niet voltooien." : null,
      provider_payload: refundPayload(refund)
    }, { onConflict: "tenant_id,provider,provider_refund_id" });
  if (upsert.error) throw upsert.error ?? syncError;
  await recordRefundEvent(session, refund, status);
}

async function syncChargeback(session: FinancialSession, expectedPaymentId: string, chargeback: MollieChargeback) {
  const admin = createAdminClient();
  const amountCents = parseMollieAmountCents(chargeback.amount.value);
  if (chargeback.amount.currency !== session.currency) throw new Error("Mollie chargeback currency does not match payment session.");
  if (chargeback.paymentId !== expectedPaymentId) throw new Error("Mollie chargeback payment does not match payment session.");
  const status = chargeback.reversedAt ? "reversed" : "received";
  const now = new Date().toISOString();
  const upsert = await admin
    .from("billing_chargebacks")
    .upsert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      participant_id: session.participant_id,
      guardian_user_id: session.guardian_user_id,
      provider: "mollie",
      provider_payment_id: chargeback.paymentId || "",
      provider_chargeback_id: chargeback.id,
      amount_cents: amountCents,
      currency: chargeback.amount.currency,
      status,
      reason_code: chargeback.reason?.code ?? null,
      occurred_at: chargeback.createdAt,
      reversed_at: chargeback.reversedAt ?? null,
      last_synced_at: now,
      provider_payload: chargebackPayload(chargeback)
    }, { onConflict: "tenant_id,provider,provider_chargeback_id" });
  if (upsert.error) throw upsert.error;

  const eventInserted = await recordProviderEvent({
    eventId: `chargeback:${chargeback.id}:${status}`,
    eventType: `chargeback.${status}`,
    payload: chargebackPayload(chargeback),
    session
  });
  if (!eventInserted) return;

  const billingEvent = await admin.from("billing_events").insert({
    tenant_id: session.tenant_id,
    subscription_id: session.subscription_id,
    manual_payment_id: session.manual_payment_id,
    payment_session_id: session.id,
    participant_id: session.participant_id,
    guardian_user_id: session.guardian_user_id,
    type: "payment_chargeback",
    status: status === "reversed" ? "processed" : "open",
    message: status === "reversed"
      ? `Stornering ${chargeback.id} is teruggedraaid.`
      : `Stornering ${chargeback.id} ontvangen; financiële opvolging vereist.`
  });
  if (billingEvent.error && billingEvent.error.code !== "23505") throw billingEvent.error;

  if (status === "received") {
    const task = await admin.from("tenant_tasks").insert({
      tenant_id: session.tenant_id,
      created_by_user_id: null,
      related_participant_id: session.participant_id,
      title: "Stornering opvolgen",
      description: `Mollie-chargeback ${chargeback.id} van ${formatMoney(amountCents, chargeback.amount.currency)} controleren en administratief verwerken.`,
      priority: "urgent",
      status: "open",
      due_on: new Date().toISOString().slice(0, 10)
    });
    if (task.error) throw task.error;
    await notifyGuardian(session, "Betaling gestorneerd", `De bank heeft ${formatMoney(amountCents, chargeback.amount.currency)} teruggeboekt. Neem contact op met de zwemschool om de betaling te herstellen.`);
  }
}

async function recordRefundEvent(session: FinancialSession, refund: MollieRefund, status: string) {
  const inserted = await recordProviderEvent({
    eventId: `refund:${refund.id}:${status}`,
    eventType: `refund.${status}`,
    payload: refundPayload(refund),
    session
  });
  if (!inserted || status !== "refunded") return;

  const admin = createAdminClient();
  const amountCents = parseMollieAmountCents(refund.amount.value);
  const billingEvent = await admin.from("billing_events").insert({
    tenant_id: session.tenant_id,
    subscription_id: session.subscription_id,
    manual_payment_id: session.manual_payment_id,
    payment_session_id: session.id,
    participant_id: session.participant_id,
    guardian_user_id: session.guardian_user_id,
    type: "payment_refunded",
    status: "processed",
    message: `Refund ${refund.id} van ${formatMoney(amountCents, refund.amount.currency)} voltooid.`
  });
  if (billingEvent.error && billingEvent.error.code !== "23505") throw billingEvent.error;
  await notifyGuardian(session, "Terugbetaling verwerkt", `${formatMoney(amountCents, refund.amount.currency)} is via Mollie terugbetaald.`);
}

async function recordProviderEvent(input: {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  session: FinancialSession;
}) {
  const admin = createAdminClient();
  const result = await admin.from("payment_provider_events").insert({
    tenant_id: input.session.tenant_id,
    provider_config_id: input.session.provider_config_id,
    payment_session_id: input.session.id,
    manual_payment_id: input.session.manual_payment_id,
    provider: "mollie",
    provider_event_id: input.eventId,
    event_type: input.eventType,
    processing_status: "processed",
    payload: input.payload,
    processed_at: new Date().toISOString()
  });
  if (result.error?.code === "23505") return false;
  if (result.error) throw result.error;
  return true;
}

async function notifyGuardian(session: FinancialSession, title: string, message: string) {
  if (!session.guardian_user_id) return;
  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("name").eq("id", session.tenant_id).maybeSingle();
  await createTenantNotifications({
    message,
    organizationName: tenantResult.data?.name ?? "NXTTRACK",
    participantId: session.participant_id,
    recipientIds: [session.guardian_user_id],
    tenantId: session.tenant_id,
    title,
    type: "payment_received"
  });
}

function refundPayload(refund: MollieRefund) {
  return {
    amount: refund.amount,
    createdAt: refund.createdAt,
    description: refund.description,
    id: refund.id,
    metadata: refund.metadata ?? null,
    paymentId: refund.paymentId,
    status: refund.status
  };
}

function chargebackPayload(chargeback: MollieChargeback) {
  return {
    amount: chargeback.amount,
    createdAt: chargeback.createdAt,
    id: chargeback.id,
    paymentId: chargeback.paymentId,
    reason: chargeback.reason ?? null,
    reversedAt: chargeback.reversedAt ?? null
  };
}

function readUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}
