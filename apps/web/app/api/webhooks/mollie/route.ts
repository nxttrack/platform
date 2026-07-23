import { NextResponse } from "next/server";

import {
  getMollieAccountLast4,
  isMolliePaymentId,
  MollieWebhookRequestError,
  normalizeMollieStatus,
  readClassicMollieWebhookId,
  validateMolliePaymentSnapshot,
  type MollieMode,
  type MollieSessionStatus
} from "@/lib/domain/mollie-contract";
import { getMolliePayment, listMollieMandates, type MollieMandate } from "@/lib/domain/mollie";
import { createTenantNotifications } from "@/lib/domain/tenant-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SessionRow = {
  amount_cents: number;
  billing_mandate_id: string | null;
  billing_provider_customer_id: string | null;
  collection_attempt_id: string | null;
  consent_initiated_at: string | null;
  consent_terms_version: string | null;
  currency: string;
  guardian_user_id: string | null;
  id: string;
  manual_payment_id: string;
  participant_id: string;
  provider_config_id: string;
  sequence_type: "first" | "oneoff" | "recurring";
  status: string;
  subscription_id: string;
  tenant_id: string;
};

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
  const sessionResult = await admin
    .from("payment_sessions")
    .select("id, tenant_id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, amount_cents, currency, status, sequence_type, billing_provider_customer_id, billing_mandate_id, collection_attempt_id, consent_terms_version, consent_initiated_at")
    .eq("provider", "mollie")
    .eq("provider_session_id", paymentId)
    .maybeSingle();
  if (sessionResult.error) return NextResponse.json({ accepted: false, reason: "session_lookup" }, { status: 503 });
  if (!sessionResult.data) return NextResponse.json({ accepted: true });
  const session = sessionResult.data as SessionRow;

  const configResult = await admin
    .from("billing_provider_configs")
    .select("secret_reference, mode")
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.provider_config_id)
    .eq("provider", "mollie")
    .maybeSingle();
  const config = configResult.data;
  const secretReference = config?.secret_reference;
  if (configResult.error || !config || !secretReference) {
    return NextResponse.json({ accepted: false, reason: "provider_config" }, { status: 503 });
  }

  let processingStage = "provider_fetch";
  try {
    const mode = config.mode as MollieMode;
    const payment = await getMolliePayment(paymentId, secretReference, mode);
    processingStage = "snapshot_validation";
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
    processingStage = "session_update";
    const sessionUpdate = await admin
      .from("payment_sessions")
      .update({
        status,
        webhook_received_at: now,
        failure_code: failure?.code ?? null,
        failure_message: failure?.message ?? null
      })
      .eq("tenant_id", session.tenant_id)
      .eq("id", session.id);
    if (sessionUpdate.error) throw sessionUpdate.error;

    if (session.collection_attempt_id) {
      processingStage = "collection_attempt_update";
      const attemptUpdate = await admin
        .from("billing_collection_attempts")
        .update({
          status,
          completed_at: isTerminalStatus(status) ? now : null,
          failure_code: failure?.code ?? null,
          failure_message: failure?.message ?? null
        })
        .eq("tenant_id", session.tenant_id)
        .eq("id", session.collection_attempt_id);
      if (attemptUpdate.error) throw attemptUpdate.error;
    }

    processingStage = "provider_event";
    const providerEvent = await admin.from("payment_provider_events").insert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      payment_session_id: session.id,
      manual_payment_id: session.manual_payment_id,
      provider: "mollie",
      provider_event_id: `${payment.id}:${payment.status}`,
      event_type: `payment.${payment.status}`,
      processing_status: "processed",
      payload: {
        amount: payment.amount,
        id: payment.id,
        mandateId: payment.mandateId,
        metadata: payment.metadata,
        sequenceType: payment.sequenceType,
        status: payment.status
      },
      processed_at: now
    });
    if (providerEvent.error && providerEvent.error.code !== "23505") throw providerEvent.error;

    if (status === "paid") {
      if (session.sequence_type === "first") {
        processingStage = "mandate_activation";
        await activateFirstPaymentMandate({
          mode,
          paidAt: payment.paidAt ?? now,
          secretReference,
          session
        });
      }

      const paidOn = (payment.paidAt ?? now).slice(0, 10);
      processingStage = "payment_update";
      const paymentUpdate = await admin
        .from("manual_payments")
        .update({ status: "paid", paid_on: paidOn, method: "Mollie", reference: payment.id })
        .eq("tenant_id", session.tenant_id)
        .eq("id", session.manual_payment_id)
        .neq("status", "paid")
        .select("id");
      if (paymentUpdate.error) throw paymentUpdate.error;
      if ((paymentUpdate.data ?? []).length) {
        processingStage = "billing_event";
        const billingEvent = await admin.from("billing_events").insert({
          tenant_id: session.tenant_id,
          subscription_id: session.subscription_id,
          manual_payment_id: session.manual_payment_id,
          payment_session_id: session.id,
          participant_id: session.participant_id,
          guardian_user_id: session.guardian_user_id,
          type: "payment_paid",
          status: "processed",
          message: `Mollie betaling ${payment.id} geverifieerd.`
        });
        if (billingEvent.error && billingEvent.error.code !== "23505") throw billingEvent.error;
      }
    } else if (session.sequence_type === "recurring" && isFailureStatus(status)) {
      processingStage = "collection_failure";
      await recordCollectionFailure({ failure, session, status });
    }

    return NextResponse.json({ accepted: true });
  } catch (error) {
    const errorEvent = await admin.from("payment_provider_events").insert({
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
    });
    if (errorEvent.error && errorEvent.error.code !== "23505") {
      processingStage = "error_event";
    }
    return NextResponse.json({ accepted: false, reason: `processing_${processingStage}` }, { status: 503 });
  }
}

async function activateFirstPaymentMandate(input: {
  mode: MollieMode;
  paidAt: string;
  secretReference: string;
  session: SessionRow;
}) {
  const { session } = input;
  if (!session.billing_provider_customer_id || !session.guardian_user_id) {
    throw new Error("First payment has no local provider customer.");
  }

  const admin = createAdminClient();
  const customerResult = await admin
    .from("billing_provider_customers")
    .select("id, provider_customer_id")
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.billing_provider_customer_id)
    .eq("guardian_user_id", session.guardian_user_id)
    .maybeSingle();
  if (customerResult.error || !customerResult.data) {
    throw customerResult.error ?? new Error("Mollie customer is unavailable.");
  }

  const mandates = await listMollieMandates(customerResult.data.provider_customer_id, input.secretReference, input.mode);
  const mandate = chooseValidDirectDebitMandate(mandates);
  if (!mandate) throw new Error("Mollie did not return a valid direct debit mandate.");

  const now = new Date().toISOString();
  const mandateResult = await admin
    .from("billing_mandates")
    .upsert({
      tenant_id: session.tenant_id,
      provider_config_id: session.provider_config_id,
      provider_customer_id: customerResult.data.id,
      guardian_user_id: session.guardian_user_id,
      provider: "mollie",
      provider_mandate_id: mandate.id,
      method: mandate.method,
      status: mandate.status,
      signature_date: mandate.signatureDate ?? input.paidAt.slice(0, 10),
      mandate_reference: mandate.mandateReference ?? null,
      account_holder: mandate.details?.consumerName?.slice(0, 200) ?? null,
      account_last4: getMollieAccountLast4(mandate.details?.consumerAccount),
      consent_source: "mollie_first_payment",
      consent_terms_version: session.consent_terms_version,
      consent_recorded_at: input.paidAt,
      revoked_at: null,
      last_synced_at: now
    }, { onConflict: "tenant_id,provider,provider_mandate_id" })
    .select("id")
    .single();
  if (mandateResult.error || !mandateResult.data) {
    throw mandateResult.error ?? new Error("Mollie mandate could not be stored.");
  }

  const subscriptionUpdate = await admin
    .from("subscriptions")
    .update({
      billing_provider_customer_id: customerResult.data.id,
      billing_mandate_id: mandateResult.data.id,
      collection_method: "provider"
    })
    .eq("tenant_id", session.tenant_id)
    .eq("id", session.subscription_id);
  if (subscriptionUpdate.error) throw subscriptionUpdate.error;

  const billingEvent = await admin.from("billing_events").insert({
    tenant_id: session.tenant_id,
    subscription_id: session.subscription_id,
    manual_payment_id: session.manual_payment_id,
    payment_session_id: session.id,
    participant_id: session.participant_id,
    guardian_user_id: session.guardian_user_id,
    type: "mandate_activated",
    status: "processed",
    message: `SEPA-incassomachtiging ${maskedMandateReference(mandate)} via Mollie geactiveerd.`
  });
  if (billingEvent.error && billingEvent.error.code !== "23505") throw billingEvent.error;
}

async function recordCollectionFailure(input: {
  failure: { code: string; message: string } | null;
  session: SessionRow;
  status: MollieSessionStatus;
}) {
  const admin = createAdminClient();
  const message = input.failure?.message ?? `De incasso heeft status ${input.status}.`;
  const billingEvent = await admin.from("billing_events").insert({
    tenant_id: input.session.tenant_id,
    subscription_id: input.session.subscription_id,
    manual_payment_id: input.session.manual_payment_id,
    payment_session_id: input.session.id,
    participant_id: input.session.participant_id,
    guardian_user_id: input.session.guardian_user_id,
    type: "payment_failed",
    status: "open",
    message
  });
  if (billingEvent.error?.code === "23505") return;
  if (billingEvent.error) throw billingEvent.error;

  const taskResult = await admin.from("tenant_tasks").insert({
    tenant_id: input.session.tenant_id,
    created_by_user_id: null,
    related_participant_id: input.session.participant_id,
    title: "Mislukte incasso opvolgen",
    description: `${message} De betaling blijft openstaan; controleer de machtiging en plan zo nodig een nieuwe poging.`,
    priority: "high",
    status: "open",
    due_on: new Date().toISOString().slice(0, 10)
  });
  if (taskResult.error) throw taskResult.error;

  if (input.session.guardian_user_id) {
    await createTenantNotifications({
      message: `${message} Het bedrag blijft openstaan. Controleer je betaalgegevens of neem contact op met de zwemschool.`,
      participantId: input.session.participant_id,
      recipientIds: [input.session.guardian_user_id],
      tenantId: input.session.tenant_id,
      title: "Automatische incasso niet gelukt",
      type: "payment_due"
    });
  }
}

function chooseValidDirectDebitMandate(mandates: MollieMandate[]) {
  return mandates.find((mandate) => mandate.method === "directdebit" && mandate.status === "valid") ?? null;
}

function maskedMandateReference(mandate: MollieMandate) {
  const last4 = getMollieAccountLast4(mandate.details?.consumerAccount);
  return last4 ? `•••• ${last4}` : mandate.id.slice(-6);
}

function isFailureStatus(status: MollieSessionStatus) {
  return status === "failed" || status === "expired" || status === "cancelled";
}

function isTerminalStatus(status: MollieSessionStatus) {
  return status === "paid" || isFailureStatus(status);
}

function providerFailure(status: MollieSessionStatus) {
  if (status === "failed") return { code: "provider_failed", message: "Mollie heeft de betaling als mislukt gemarkeerd." };
  if (status === "expired") return { code: "provider_expired", message: "De Mollie-betaling is verlopen." };
  if (status === "cancelled") return { code: "provider_cancelled", message: "De Mollie-betaling is geannuleerd." };
  return null;
}
