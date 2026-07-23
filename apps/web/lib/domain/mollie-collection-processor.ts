import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createMollieRecurringPayment, MollieApiError } from "./mollie";
import {
  normalizeMollieStatus,
  resolveMollieApplicationUrl,
  type MollieMode
} from "./mollie-contract";

export class MollieCollectionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MollieCollectionError";
  }
}

export async function processMollieCollectionAttempt(input: {
  attemptId: string;
  organizationName: string;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const attemptResult = await admin
    .from("billing_collection_attempts")
    .select("id, provider_config_id, subscription_id, manual_payment_id, billing_provider_customer_id, billing_mandate_id, guardian_user_id, attempt_number, status, scheduled_for, prenotification_delivery_status, idempotency_key, failure_code")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.attemptId)
    .maybeSingle();
  const attempt = attemptResult.data;
  const isRecovery = attempt?.status === "processing" &&
    ["provider_outcome_unknown", "provider_state_persistence_pending"].includes(attempt.failure_code ?? "");
  if (
    attemptResult.error ||
    !attempt ||
    (!isRecovery && attempt.status !== "prenotified") ||
    attempt.prenotification_delivery_status !== "sent" ||
    new Date(attempt.scheduled_for).getTime() > Date.now()
  ) {
    throw new MollieCollectionError("not_due", "Collection attempt is not eligible for processing.");
  }

  const [paymentResult, customerResult, mandateResult, configResult] = await Promise.all([
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.manual_payment_id)
      .maybeSingle(),
    admin
      .from("billing_provider_customers")
      .select("id, provider_customer_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.billing_provider_customer_id)
      .maybeSingle(),
    admin
      .from("billing_mandates")
      .select("id, provider_mandate_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.billing_mandate_id)
      .maybeSingle(),
    admin
      .from("billing_provider_configs")
      .select("id, mode, secret_reference, public_config")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.provider_config_id)
      .eq("provider", "mollie")
      .eq("status", "active")
      .maybeSingle()
  ]);
  if (
    paymentResult.error ||
    customerResult.error ||
    mandateResult.error ||
    configResult.error ||
    !paymentResult.data ||
    !customerResult.data ||
    !mandateResult.data ||
    !configResult.data?.secret_reference ||
    !["due", "overdue"].includes(paymentResult.data.status) ||
    customerResult.data.status !== "active" ||
    mandateResult.data.status !== "valid"
  ) {
    throw new MollieCollectionError("not_ready", "Collection payment, customer or mandate is not ready.");
  }

  const publicConfig = (configResult.data.public_config ?? {}) as Record<string, unknown>;
  if (publicConfig.recurring_enabled !== true) {
    throw new MollieCollectionError("disabled", "Recurring collection is disabled.");
  }
  const returnUrl = optionalString(publicConfig.return_url);
  if (!returnUrl) throw new MollieCollectionError("provider", "Provider return URL is missing.");
  const appUrl = resolveMollieApplicationUrl(returnUrl, process.env.APP_URL);

  let sessionId: string;
  if (isRecovery) {
    const existingSession = await admin
      .from("payment_sessions")
      .select("id, provider_session_id")
      .eq("tenant_id", input.tenantId)
      .eq("collection_attempt_id", attempt.id)
      .maybeSingle();
    if (existingSession.error || !existingSession.data) {
      throw new MollieCollectionError("already_processing", "Recoverable attempt has no reusable local session.");
    }
    sessionId = existingSession.data.id;
  } else {
    const now = new Date().toISOString();
    const claim = await admin
      .from("billing_collection_attempts")
      .update({ status: "processing", initiated_at: now, failure_code: null, failure_message: null })
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.id)
      .eq("status", "prenotified")
      .select("id");
    if (claim.error || (claim.data ?? []).length !== 1) {
      throw new MollieCollectionError("already_processing", "Collection attempt was claimed by another worker.");
    }

    sessionId = randomUUID();
    const sessionResult = await admin
      .from("payment_sessions")
      .insert({
        id: sessionId,
        tenant_id: input.tenantId,
        provider_config_id: attempt.provider_config_id,
        subscription_id: attempt.subscription_id,
        manual_payment_id: attempt.manual_payment_id,
        participant_id: paymentResult.data.participant_id,
        guardian_user_id: attempt.guardian_user_id,
        provider: "mollie",
        sequence_type: "recurring",
        billing_provider_customer_id: attempt.billing_provider_customer_id,
        billing_mandate_id: attempt.billing_mandate_id,
        collection_attempt_id: attempt.id,
        idempotency_key: attempt.idempotency_key,
        amount_cents: paymentResult.data.amount_cents,
        currency: paymentResult.data.currency,
        status: "pending",
        return_url: null,
        expires_at: null
      })
      .select("id")
      .single();
    if (sessionResult.error) {
      await admin
        .from("billing_collection_attempts")
        .update({ status: "prenotified", initiated_at: null })
        .eq("tenant_id", input.tenantId)
        .eq("id", attempt.id);
      throw new MollieCollectionError("session", "Collection payment session could not be stored.");
    }
  }

  let providerPayment;
  try {
    providerPayment = await createMollieRecurringPayment({
      amountCents: paymentResult.data.amount_cents,
      currency: paymentResult.data.currency,
      customerId: customerResult.data.provider_customer_id,
      description: `${input.organizationName} incasso ${attempt.attempt_number}`,
      idempotencyKey: attempt.idempotency_key,
      mandateId: mandateResult.data.provider_mandate_id,
      metadata: {
        tenantId: input.tenantId,
        paymentSessionId: sessionId,
        manualPaymentId: paymentResult.data.id,
        subscriptionId: attempt.subscription_id,
        billingProviderCustomerId: attempt.billing_provider_customer_id,
        billingMandateId: attempt.billing_mandate_id,
        collectionAttemptId: attempt.id,
        sequenceType: "recurring"
      },
      mode: configResult.data.mode as MollieMode,
      secretReference: configResult.data.secret_reference,
      webhookUrl: `${appUrl}/api/webhooks/mollie`
    });
  } catch (error) {
    const indeterminate = error instanceof MollieApiError && error.indeterminate;
    const message = safeErrorMessage(error);
    await Promise.all([
      admin
        .from("payment_sessions")
        .update({
          status: indeterminate ? "pending" : "failed",
          failure_code: indeterminate ? "provider_outcome_unknown" : "provider_api",
          failure_message: message
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", sessionId),
      admin
        .from("billing_collection_attempts")
        .update({
          status: indeterminate ? "processing" : "failed",
          completed_at: indeterminate ? null : new Date().toISOString(),
          failure_code: indeterminate ? "provider_outcome_unknown" : "provider_api",
          failure_message: message
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", attempt.id)
    ]);
    throw new MollieCollectionError(indeterminate ? "outcome_unknown" : "provider_api", message);
  }

  const status = normalizeMollieStatus(providerPayment.status);
  const [sessionUpdate, attemptUpdate] = await Promise.all([
    admin
      .from("payment_sessions")
      .update({
        provider_session_id: providerPayment.id,
        checkout_url: null,
        status,
        failure_code: null,
        failure_message: null
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", sessionId),
    admin
      .from("billing_collection_attempts")
      .update({
        provider_payment_id: providerPayment.id,
        status,
        completed_at: ["paid", "failed", "expired", "cancelled"].includes(status) ? new Date().toISOString() : null,
        failure_code: null,
        failure_message: null
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.id)
  ]);
  if (sessionUpdate.error || attemptUpdate.error) {
    const message = "Mollie accepted the collection, but local provider state still needs persistence.";
    await Promise.all([
      admin
        .from("payment_sessions")
        .update({
          provider_session_id: providerPayment.id,
          status: "pending",
          failure_code: "provider_state_persistence_pending",
          failure_message: message
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", sessionId),
      admin
        .from("billing_collection_attempts")
        .update({
          provider_payment_id: providerPayment.id,
          status: "processing",
          completed_at: null,
          failure_code: "provider_state_persistence_pending",
          failure_message: message
        })
        .eq("tenant_id", input.tenantId)
        .eq("id", attempt.id)
    ]);
    throw new MollieCollectionError("persistence_pending", message);
  }

  await recordCollectionStarted({
    attemptNumber: attempt.attempt_number,
    guardianUserId: paymentResult.data.guardian_user_id,
    participantId: paymentResult.data.participant_id,
    paymentId: paymentResult.data.id,
    sessionId,
    subscriptionId: attempt.subscription_id,
    tenantId: input.tenantId
  });
  return { attemptId: attempt.id, paymentSessionId: sessionId, providerPaymentId: providerPayment.id, status };
}

async function recordCollectionStarted(input: {
  attemptNumber: number;
  guardianUserId: string | null;
  participantId: string;
  paymentId: string;
  sessionId: string;
  subscriptionId: string;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const result = await admin.from("billing_events").insert({
    tenant_id: input.tenantId,
    subscription_id: input.subscriptionId,
    manual_payment_id: input.paymentId,
    payment_session_id: input.sessionId,
    participant_id: input.participantId,
    guardian_user_id: input.guardianUserId,
    type: "collection_started",
    status: "open",
    message: `SEPA-incasso poging ${input.attemptNumber} gestart.`
  });
  if (result.error && result.error.code !== "23505") throw result.error;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 500)
    : "Mollie API request failed.";
}
