import { NextResponse } from "next/server";

import { getMolliePayment, normalizeMollieStatus } from "@/lib/domain/mollie";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SessionRow = { amount_cents: number; currency: string; guardian_user_id: string | null; id: string; manual_payment_id: string; participant_id: string; provider_config_id: string; status: string; subscription_id: string; tenant_id: string };

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 10_000) return NextResponse.json({ accepted: false }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const paymentId = String(form?.get("id") ?? "");
  if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return NextResponse.json({ accepted: true });

  const admin = createAdminClient();
  const sessionResult = await admin.from("payment_sessions").select("id, tenant_id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, amount_cents, currency, status").eq("provider", "mollie").eq("provider_session_id", paymentId).maybeSingle();
  if (sessionResult.error) return NextResponse.json({ accepted: false }, { status: 503 });
  if (!sessionResult.data) return NextResponse.json({ accepted: true });
  const session = sessionResult.data as SessionRow;
  const configResult = await admin.from("billing_provider_configs").select("secret_reference, status").eq("tenant_id", session.tenant_id).eq("id", session.provider_config_id).eq("provider", "mollie").maybeSingle();
  const secretReference = configResult.data?.secret_reference;
  if (configResult.error || !secretReference || configResult.data?.status === "disabled") return NextResponse.json({ accepted: false }, { status: 503 });

  try {
    const payment = await getMolliePayment(paymentId, secretReference);
    const metadata = payment.metadata ?? {};
    if (metadata.tenantId !== session.tenant_id || metadata.paymentSessionId !== session.id || metadata.manualPaymentId !== session.manual_payment_id) throw new Error("Mollie metadata does not match payment session");
    const amountCents = Math.round(Number(payment.amount.value) * 100);
    if (amountCents !== session.amount_cents || payment.amount.currency !== session.currency) throw new Error("Mollie amount does not match payment session");

    const status = normalizeMollieStatus(payment.status);
    const now = new Date().toISOString();
    await admin.from("payment_sessions").update({ status, webhook_received_at: now, failure_code: status === "failed" ? "provider_failed" : null, failure_message: status === "failed" ? "Mollie marked the payment as failed." : null }).eq("tenant_id", session.tenant_id).eq("id", session.id);
    await admin.from("payment_provider_events").upsert({
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

    if (status === "paid") {
      const paidOn = (payment.paidAt ?? now).slice(0, 10);
      const paymentUpdate = await admin.from("manual_payments").update({ status: "paid", paid_on: paidOn, method: "Mollie", reference: payment.id }).eq("tenant_id", session.tenant_id).eq("id", session.manual_payment_id).neq("status", "paid").select("id");
      if ((paymentUpdate.data ?? []).length) {
        await admin.from("billing_events").insert({ tenant_id: session.tenant_id, subscription_id: session.subscription_id, manual_payment_id: session.manual_payment_id, participant_id: session.participant_id, guardian_user_id: session.guardian_user_id, type: "payment_paid", status: "processed", message: `Mollie betaling ${payment.id} geverifieerd.` });
      }
    }

    return NextResponse.json({ accepted: true });
  } catch (error) {
    await admin.from("payment_provider_events").insert({ tenant_id: session.tenant_id, provider_config_id: session.provider_config_id, payment_session_id: session.id, manual_payment_id: session.manual_payment_id, provider: "mollie", event_type: "payment.webhook_error", processing_status: "failed", payload: { id: paymentId }, error_message: error instanceof Error ? error.message.slice(0, 500) : "Webhook processing failed" });
    return NextResponse.json({ accepted: false }, { status: 503 });
  }
}
