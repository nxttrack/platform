import { NextResponse } from "next/server";

import {
  isMolliePaymentId,
  MollieWebhookRequestError,
  normalizeMollieStatus,
  readClassicMollieWebhookId,
  validateMolliePaymentSnapshot,
  type MollieMode,
  type MollieSessionStatus
} from "@/lib/domain/mollie-contract";
import { getMolliePayment } from "@/lib/domain/mollie";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SessionRow = { amount_cents: number; currency: string; guardian_user_id: string | null; id: string; manual_payment_id: string; participant_id: string; provider_config_id: string; status: string; subscription_id: string; tenant_id: string };

export async function POST(request: Request) {
  let paymentId: string;
  try {
    paymentId = await readClassicMollieWebhookId(request);
  } catch (error) {
    const status = error instanceof MollieWebhookRequestError ? error.status : 400;
    return NextResponse.json({ accepted: false }, { status });
  }

  if (!isMolliePaymentId(paymentId)) return NextResponse.json({ accepted: true });

  const admin = createAdminClient();
  const sessionResult = await admin.from("payment_sessions").select("id, tenant_id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, amount_cents, currency, status").eq("provider", "mollie").eq("provider_session_id", paymentId).maybeSingle();
  if (sessionResult.error) return NextResponse.json({ accepted: false }, { status: 503 });
  if (!sessionResult.data) return NextResponse.json({ accepted: true });
  const session = sessionResult.data as SessionRow;
  const configResult = await admin.from("billing_provider_configs").select("secret_reference, mode").eq("tenant_id", session.tenant_id).eq("id", session.provider_config_id).eq("provider", "mollie").maybeSingle();
  const config = configResult.data;
  const secretReference = config?.secret_reference;
  if (configResult.error || !config || !secretReference) return NextResponse.json({ accepted: false }, { status: 503 });

  try {
    const mode = config.mode as MollieMode;
    const payment = await getMolliePayment(paymentId, secretReference, mode);
    validateMolliePaymentSnapshot({
      payment,
      session: {
        amountCents: session.amount_cents,
        currency: session.currency,
        id: session.id,
        manualPaymentId: session.manual_payment_id,
        tenantId: session.tenant_id
      }
    });

    const status = normalizeMollieStatus(payment.status);
    const now = new Date().toISOString();
    const failure = providerFailure(status);
    const sessionUpdate = await admin.from("payment_sessions").update({ status, webhook_received_at: now, failure_code: failure?.code ?? null, failure_message: failure?.message ?? null }).eq("tenant_id", session.tenant_id).eq("id", session.id);
    if (sessionUpdate.error) throw sessionUpdate.error;
    const providerEvent = await admin.from("payment_provider_events").upsert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      provider: "mollie",
      provider_event_id: `${payment.id}:${payment.status}`,
      event_type: `payment.${payment.status}`,
      processing_status: "processed",
      payload: { amount: payment.amount, id: payment.id, metadata: payment.metadata, status: payment.status },
      processed_at: now
    }, { onConflict: "tenant_id,provider,provider_event_id", ignoreDuplicates: true });
    if (providerEvent.error) throw providerEvent.error;

    if (status === "paid") {
      const paidOn = (payment.paidAt ?? now).slice(0, 10);
      const paymentUpdate = await admin.from("manual_payments").update({ status: "paid", paid_on: paidOn, method: "Mollie", reference: payment.id }).eq("tenant_id", session.tenant_id).eq("id", session.manual_payment_id).neq("status", "paid").select("id");
      if (paymentUpdate.error) throw paymentUpdate.error;
      if ((paymentUpdate.data ?? []).length) {
        const billingEvent = await admin.from("billing_events").insert({ tenant_id: session.tenant_id, subscription_id: session.subscription_id, manual_payment_id: session.manual_payment_id, participant_id: session.participant_id, guardian_user_id: session.guardian_user_id, type: "payment_paid", status: "processed", message: `Mollie betaling ${payment.id} geverifieerd.` });
        if (billingEvent.error) throw billingEvent.error;
      }
    }

    return NextResponse.json({ accepted: true });
  } catch (error) {
    await admin.from("payment_provider_events").upsert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      provider: "mollie",
      provider_event_id: `${paymentId}:webhook_error`,
      event_type: "payment.webhook_error",
      processing_status: "failed",
      payload: { id: paymentId },
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed"
    }, { onConflict: "tenant_id,provider,provider_event_id", ignoreDuplicates: true });
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}

function providerFailure(status: MollieSessionStatus) {
  if (status === "failed") return { code: "provider_failed", message: "Mollie heeft de betaling als mislukt gemarkeerd." };
  if (status === "expired") return { code: "provider_expired", message: "De Mollie-betaallink is verlopen." };
  if (status === "cancelled") return { code: "provider_cancelled", message: "De Mollie-betaling is geannuleerd." };
  return null;
}
