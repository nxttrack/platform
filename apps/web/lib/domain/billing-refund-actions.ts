"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { createMollieRefund, MollieApiError } from "./mollie";
import { normalizeMollieRefundStatus, type MollieMode } from "./mollie-contract";
import { syncMollieFinancialAdjustments } from "./mollie-financial-sync";

export async function createMollieRefundAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const paymentSessionId = readRequired(formData, "paymentSessionId");
  const idempotencyKey = readUuid(formData, "idempotencyKey");
  const amountCents = readMoneyCents(formData, "amount");
  const description = readRequired(formData, "description").slice(0, 255);

  if (formData.get("confirmation") !== "REFUND") {
    redirect("/admin/betalingen?error=refund-confirmation");
  }

  const sessionResult = await admin
    .from("payment_sessions")
    .select("id, tenant_id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, provider_session_id, amount_cents, currency, status")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentSessionId)
    .eq("provider", "mollie")
    .eq("status", "paid")
    .maybeSingle();
  const session = sessionResult.data;
  if (
    sessionResult.error ||
    !session?.provider_config_id ||
    !session.manual_payment_id ||
    !session.participant_id ||
    !session.subscription_id ||
    !session.provider_session_id
  ) {
    redirect("/admin/betalingen?error=refund-session");
  }

  const [paymentResult, configResult] = await Promise.all([
    admin
      .from("manual_payments")
      .select("id, status, amount_cents, currency")
      .eq("tenant_id", tenant.id)
      .eq("id", session.manual_payment_id)
      .eq("status", "paid")
      .maybeSingle(),
    admin
      .from("billing_provider_configs")
      .select("id, mode, secret_reference")
      .eq("tenant_id", tenant.id)
      .eq("id", session.provider_config_id)
      .eq("provider", "mollie")
      .eq("status", "active")
      .maybeSingle()
  ]);
  if (
    paymentResult.error ||
    configResult.error ||
    !paymentResult.data ||
    !configResult.data?.secret_reference ||
    paymentResult.data.currency !== session.currency ||
    amountCents > paymentResult.data.amount_cents
  ) {
    redirect("/admin/betalingen?error=refund-not-ready");
  }

  let refundId: string;
  const reservation = await admin
    .from("billing_refunds")
    .insert({
      tenant_id: tenant.id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      participant_id: session.participant_id,
      guardian_user_id: session.guardian_user_id,
      provider: "mollie",
      provider_payment_id: session.provider_session_id,
      idempotency_key: idempotencyKey,
      amount_cents: amountCents,
      currency: session.currency,
      status: "draft",
      description,
      requested_by_user_id: context.user.id
    })
    .select("id")
    .single();

  if (reservation.error?.code === "23505") {
    const existing = await admin
      .from("billing_refunds")
      .select("id, payment_session_id, amount_cents, currency, description")
      .eq("tenant_id", tenant.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (
      existing.error ||
      !existing.data ||
      existing.data.payment_session_id !== session.id ||
      existing.data.amount_cents !== amountCents ||
      existing.data.currency !== session.currency ||
      existing.data.description !== description
    ) {
      redirect("/admin/betalingen?error=refund-idempotency");
    }
    refundId = existing.data.id;
  } else if (reservation.error || !reservation.data) {
    redirect(`/admin/betalingen?error=${reservation.error?.message.includes("refund_amount_exceeds_remaining") ? "refund-amount" : "refund-reservation"}`);
  } else {
    refundId = reservation.data.id;
  }

  try {
    const providerRefund = await createMollieRefund({
      amountCents,
      currency: session.currency,
      description,
      idempotencyKey,
      metadata: {
        refundRequestId: refundId,
        tenantId: tenant.id,
        paymentSessionId: session.id,
        manualPaymentId: session.manual_payment_id
      },
      mode: configResult.data.mode as MollieMode,
      paymentId: session.provider_session_id,
      secretReference: configResult.data.secret_reference
    });
    const status = normalizeMollieRefundStatus(providerRefund.status);
    const update = await admin
      .from("billing_refunds")
      .update({
        provider_refund_id: providerRefund.id,
        status,
        completed_at: ["refunded", "failed", "cancelled"].includes(status) ? new Date().toISOString() : null,
        last_synced_at: new Date().toISOString(),
        provider_payload: {
          amount: providerRefund.amount,
          createdAt: providerRefund.createdAt,
          id: providerRefund.id,
          paymentId: providerRefund.paymentId,
          status: providerRefund.status
        }
      })
      .eq("tenant_id", tenant.id)
      .eq("id", refundId);
    if (update.error) throw update.error;

    await syncMollieFinancialAdjustments({
      mode: configResult.data.mode as MollieMode,
      paymentId: session.provider_session_id,
      secretReference: configResult.data.secret_reference,
      session
    });
  } catch (error) {
    const indeterminate = error instanceof MollieApiError && error.indeterminate;
    await admin
      .from("billing_refunds")
      .update({
        status: indeterminate ? "unknown" : "failed",
        completed_at: indeterminate ? null : new Date().toISOString(),
        failure_code: indeterminate ? "provider_outcome_unknown" : "provider_rejected",
        failure_message: indeterminate
          ? "Provideruitkomst is onbekend; synchroniseer voordat je opnieuw handelt."
          : safeErrorMessage(error)
      })
      .eq("tenant_id", tenant.id)
      .eq("id", refundId);
    redirect(`/admin/betalingen?error=${indeterminate ? "refund-unknown" : "refund-provider"}`);
  }

  revalidateBilling();
  redirect("/admin/betalingen?saved=refund-created");
}

export async function reconcileMollieRefundAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const refundId = readRequired(formData, "refundId");
  const refundResult = await admin
    .from("billing_refunds")
    .select("id, payment_session_id")
    .eq("tenant_id", tenant.id)
    .eq("id", refundId)
    .maybeSingle();
  if (refundResult.error || !refundResult.data) redirect("/admin/betalingen?error=refund-not-found");

  const sessionResult = await admin
    .from("payment_sessions")
    .select("id, tenant_id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, provider_session_id, amount_cents, currency")
    .eq("tenant_id", tenant.id)
    .eq("id", refundResult.data.payment_session_id)
    .eq("provider", "mollie")
    .maybeSingle();
  const session = sessionResult.data;
  if (
    sessionResult.error ||
    !session?.provider_config_id ||
    !session.provider_session_id ||
    !session.manual_payment_id ||
    !session.participant_id ||
    !session.subscription_id
  ) {
    redirect("/admin/betalingen?error=refund-session");
  }
  const configResult = await admin
    .from("billing_provider_configs")
    .select("mode, secret_reference")
    .eq("tenant_id", tenant.id)
    .eq("id", session.provider_config_id)
    .eq("provider", "mollie")
    .maybeSingle();
  if (configResult.error || !configResult.data?.secret_reference) redirect("/admin/betalingen?error=refund-provider");

  try {
    await syncMollieFinancialAdjustments({
      mode: configResult.data.mode as MollieMode,
      paymentId: session.provider_session_id,
      secretReference: configResult.data.secret_reference,
      session
    });
  } catch {
    redirect("/admin/betalingen?error=refund-reconcile");
  }

  revalidateBilling();
  redirect("/admin/betalingen?saved=refund-reconciled");
}

function readRequired(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function readUuid(formData: FormData, field: string) {
  const value = readRequired(formData, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} must be a UUID v4.`);
  }
  return value.toLowerCase();
}

function readMoneyCents(formData: FormData, field: string) {
  const value = readRequired(formData, field).replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${field} must be a positive amount.`);
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(`${field} must be a positive amount.`);
  return cents;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 500)
    : "Mollie refund request failed.";
}

function revalidateBilling() {
  revalidatePath("/admin/betalingen");
  revalidatePath("/portaal/betalingen");
}
