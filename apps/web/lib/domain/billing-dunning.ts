import "server-only";

import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { createTenantNotifications } from "./tenant-notifications";

const dayInMilliseconds = 24 * 60 * 60 * 1000;

export async function scheduleMollieCollectionRetry(input: {
  collectionAttemptId: string;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const attemptResult = await admin
    .from("billing_collection_attempts")
    .select("id, provider_config_id, subscription_id, manual_payment_id, billing_provider_customer_id, billing_mandate_id, guardian_user_id, attempt_number, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.collectionAttemptId)
    .maybeSingle();
  const attempt = attemptResult.data;
  if (attemptResult.error || !attempt || attempt.status !== "failed") return { scheduled: false, reason: "attempt_not_failed" };

  const [configResult, paymentResult, subscriptionResult, mandateResult, activeAttemptResult, tenantResult] = await Promise.all([
    admin
      .from("billing_provider_configs")
      .select("id, public_config")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.provider_config_id)
      .eq("provider", "mollie")
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("manual_payments")
      .select("id, participant_id, guardian_user_id, amount_cents, currency, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.manual_payment_id)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select("id, status, collection_method, billing_provider_customer_id, billing_mandate_id")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.subscription_id)
      .maybeSingle(),
    admin
      .from("billing_mandates")
      .select("id, status")
      .eq("tenant_id", input.tenantId)
      .eq("id", attempt.billing_mandate_id)
      .maybeSingle(),
    admin
      .from("billing_collection_attempts")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("manual_payment_id", attempt.manual_payment_id)
      .in("status", ["scheduled", "prenotified", "processing", "pending", "authorized"])
      .limit(1),
    admin.from("tenants").select("name").eq("id", input.tenantId).maybeSingle()
  ]);
  const config = configResult.data;
  const payment = paymentResult.data;
  const subscription = subscriptionResult.data;
  const mandate = mandateResult.data;
  if (
    configResult.error ||
    paymentResult.error ||
    subscriptionResult.error ||
    mandateResult.error ||
    activeAttemptResult.error ||
    !config ||
    !payment ||
    !subscription ||
    !mandate ||
    !["due", "overdue"].includes(payment.status) ||
    subscription.status !== "active" ||
    subscription.collection_method !== "provider" ||
    !subscription.billing_provider_customer_id ||
    !subscription.billing_mandate_id ||
    subscription.billing_provider_customer_id !== attempt.billing_provider_customer_id ||
    subscription.billing_mandate_id !== attempt.billing_mandate_id ||
    mandate.status !== "valid" ||
    (activeAttemptResult.data ?? []).length > 0
  ) {
    return { scheduled: false, reason: "payment_not_eligible" };
  }

  const publicConfig = (config.public_config ?? {}) as Record<string, unknown>;
  const maxAttempts = boundedInteger(publicConfig.max_collection_attempts, 2, 1, 5);
  if (
    publicConfig.recurring_enabled !== true ||
    publicConfig.automatic_retries_enabled !== true ||
    attempt.attempt_number >= maxAttempts
  ) {
    return { scheduled: false, reason: "retry_policy_disabled_or_exhausted" };
  }

  const noticeDays = boundedInteger(publicConfig.direct_debit_notice_days, 7, 2, 30);
  const retryDelayDays = boundedInteger(publicConfig.retry_delay_days, 3, 1, 30);
  const scheduledFor = new Date(Date.now() + Math.max(noticeDays, retryDelayDays) * dayInMilliseconds);
  const nextAttemptNumber = attempt.attempt_number + 1;
  const insertResult = await admin
    .from("billing_collection_attempts")
    .insert({
      tenant_id: input.tenantId,
      provider_config_id: attempt.provider_config_id,
      subscription_id: attempt.subscription_id,
      manual_payment_id: attempt.manual_payment_id,
      billing_provider_customer_id: subscription.billing_provider_customer_id,
      billing_mandate_id: subscription.billing_mandate_id,
      guardian_user_id: payment.guardian_user_id,
      sequence_type: "recurring",
      attempt_number: nextAttemptNumber,
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      idempotency_key: randomUUID()
    })
    .select("id")
    .single();
  if (insertResult.error || !insertResult.data) {
    return {
      scheduled: false,
      reason: insertResult.error?.code === "23505" ? "retry_already_scheduled" : "retry_insert_failed"
    };
  }

  const amount = formatMoney(payment.amount_cents, payment.currency);
  const collectionDate = formatDate(scheduledFor);
  const notifications = payment.guardian_user_id
    ? await createTenantNotifications({
        message: `De eerdere incasso is niet gelukt. We proberen ${amount} op of kort na ${collectionDate} opnieuw af te schrijven. Neem vóór die datum contact op als iets niet klopt.`,
        organizationName: tenantResult.data?.name ?? "NXTTRACK",
        participantId: payment.participant_id,
        recipientIds: [payment.guardian_user_id],
        tenantId: input.tenantId,
        title: "Nieuwe aankondiging automatische incasso",
        type: "payment_due"
      })
    : [];
  const notificationId = notifications[0]?.id ?? null;
  let deliveryStatus: "failed" | "in_app" | "sent" = notificationId ? "in_app" : "failed";
  if (notificationId) {
    const notificationResult = await admin
      .from("tenant_notifications")
      .select("delivery_status")
      .eq("tenant_id", input.tenantId)
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationResult.data?.delivery_status === "sent") deliveryStatus = "sent";
    else if (notificationResult.data?.delivery_status === "failed") deliveryStatus = "failed";
  }

  const now = new Date().toISOString();
  const updateResult = await admin
    .from("billing_collection_attempts")
    .update({
      status: "prenotified",
      prenotified_at: now,
      prenotification_id: notificationId,
      prenotification_delivery_status: deliveryStatus
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", insertResult.data.id);
  if (updateResult.error) return { scheduled: false, reason: "retry_prenotification_update_failed" };

  await admin.from("billing_events").insert({
    tenant_id: input.tenantId,
    subscription_id: attempt.subscription_id,
    manual_payment_id: attempt.manual_payment_id,
    participant_id: payment.participant_id,
    guardian_user_id: payment.guardian_user_id,
    type: "collection_retry_scheduled",
    status: deliveryStatus === "sent" ? "processed" : "open",
    message: `Incassopoging ${nextAttemptNumber} aangekondigd voor ${collectionDate}; levering ${deliveryStatus}.`
  });

  return {
    attemptId: insertResult.data.id,
    deliveryStatus,
    scheduled: true,
    scheduledFor: scheduledFor.toISOString()
  };
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { currency, style: "currency" }).format(cents / 100);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "Europe/Amsterdam" }).format(value);
}
