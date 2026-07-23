"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  createMollieCustomer,
  createMollieFirstPayment,
  revokeMollieMandate
} from "./mollie";
import { MollieCollectionError, processMollieCollectionAttempt } from "./mollie-collection-processor";
import {
  isMolliePaymentId,
  normalizeMollieStatus,
  resolveMollieApplicationUrl,
  type MollieMode
} from "./mollie-contract";
import { createTenantNotifications } from "./tenant-notifications";

const consentTermsVersion = "nxttrack-sepa-v1-2026-07";

export async function reconcileMolliePaymentAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const paymentSessionId = readRequired(formData, "paymentSessionId");
  const sessionResult = await admin
    .from("payment_sessions")
    .select("id, provider_config_id, provider_session_id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentSessionId)
    .eq("provider", "mollie")
    .maybeSingle();
  const session = sessionResult.data;
  if (sessionResult.error || !session?.provider_config_id || !session.provider_session_id || !isMolliePaymentId(session.provider_session_id)) {
    redirect("/admin/betalingen?error=incasso-reconcile-session");
  }

  const configResult = await admin
    .from("billing_provider_configs")
    .select("public_config")
    .eq("tenant_id", tenant.id)
    .eq("id", session.provider_config_id)
    .eq("provider", "mollie")
    .eq("status", "active")
    .maybeSingle();
  if (configResult.error || !configResult.data) {
    redirect("/admin/betalingen?error=incasso-provider");
  }
  const publicConfig = (configResult.data.public_config ?? {}) as Record<string, unknown>;
  const returnUrl = optionalString(publicConfig.return_url);
  if (!returnUrl) redirect("/admin/betalingen?error=incasso-provider");

  const appUrl = resolveMollieApplicationUrl(returnUrl, process.env.APP_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${appUrl}/api/webhooks/mollie`, {
      body: new URLSearchParams({ id: session.provider_session_id }),
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Reconciliation endpoint returned ${response.status}.`);
  } catch (error) {
    await createBillingEvent({
      message: `Mollie-reconciliatie is mislukt: ${safeErrorMessage(error)}`,
      paymentSessionId: session.id,
      tenantId: tenant.id,
      type: "reconciliation_exception"
    });
    redirect("/admin/betalingen?error=incasso-reconcile");
  } finally {
    clearTimeout(timeout);
  }

  revalidateBillingPaths();
  redirect("/admin/betalingen?saved=incasso-reconciled");
}

export async function startMollieMandateAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const subscriptionId = readRequired(formData, "subscriptionId");
  const paymentId = readRequired(formData, "paymentId");
  const idempotencyKey = readUuid(formData, "idempotencyKey");
  const customerIdempotencyKey = readUuid(formData, "customerIdempotencyKey");

  if (formData.get("consentAccepted") !== "accepted") {
    redirect("/portaal/betalingen?error=incasso-consent");
  }

  const [subscriptionResult, paymentResult, profileResult] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, participant_id, enrollment_id, guardian_user_id, provider_config_id, collection_method, status")
      .eq("tenant_id", tenant.id)
      .eq("id", subscriptionId)
      .eq("guardian_user_id", context.user.id)
      .maybeSingle(),
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, status")
      .eq("tenant_id", tenant.id)
      .eq("id", paymentId)
      .eq("guardian_user_id", context.user.id)
      .maybeSingle(),
    admin.from("profiles").select("id, full_name, email").eq("id", context.user.id).maybeSingle()
  ]);

  if (
    subscriptionResult.error ||
    paymentResult.error ||
    profileResult.error ||
    !subscriptionResult.data ||
    !paymentResult.data ||
    !profileResult.data ||
    paymentResult.data.subscription_id !== subscriptionResult.data.id ||
    subscriptionResult.data.status !== "active" ||
    subscriptionResult.data.collection_method !== "provider" ||
    !subscriptionResult.data.provider_config_id ||
    (paymentResult.data.status !== "due" && paymentResult.data.status !== "overdue") ||
    !profileResult.data.email
  ) {
    redirect("/portaal/betalingen?error=incasso-not-ready");
  }

  const configResult = await admin
    .from("billing_provider_configs")
    .select("id, provider, mode, status, secret_reference, public_config")
    .eq("tenant_id", tenant.id)
    .eq("id", subscriptionResult.data.provider_config_id)
    .eq("provider", "mollie")
    .eq("status", "active")
    .maybeSingle();
  const config = configResult.data;
  if (configResult.error || !config?.secret_reference) {
    redirect("/portaal/betalingen?error=incasso-provider");
  }

  const publicConfig = (config.public_config ?? {}) as Record<string, unknown>;
  if (publicConfig.recurring_enabled !== true) {
    redirect("/portaal/betalingen?error=incasso-disabled");
  }
  const returnUrl = optionalString(publicConfig.return_url);
  if (!returnUrl) redirect("/portaal/betalingen?error=incasso-provider");

  let customer;
  try {
    customer = await getOrCreateProviderCustomer({
      customerIdempotencyKey,
      email: profileResult.data.email,
      guardianUserId: context.user.id,
      mode: config.mode as MollieMode,
      name: profileResult.data.full_name || profileResult.data.email,
      providerConfigId: config.id,
      secretReference: config.secret_reference,
      tenantId: tenant.id
    });
  } catch {
    redirect("/portaal/betalingen?error=incasso-customer");
  }

  const sessionId = randomUUID();
  const sessionResult = await admin
    .from("payment_sessions")
    .insert({
      id: sessionId,
      tenant_id: tenant.id,
      provider_config_id: config.id,
      subscription_id: subscriptionResult.data.id,
      manual_payment_id: paymentResult.data.id,
      participant_id: paymentResult.data.participant_id,
      guardian_user_id: context.user.id,
      provider: "mollie",
      sequence_type: "first",
      billing_provider_customer_id: customer.id,
      idempotency_key: idempotencyKey,
      checkout_url: null,
      amount_cents: paymentResult.data.amount_cents,
      currency: paymentResult.data.currency,
      status: "pending",
      return_url: returnUrl,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      consent_terms_version: consentTermsVersion,
      consent_initiated_at: new Date().toISOString(),
      consent_initiated_by_user_id: context.user.id
    })
    .select("id")
    .single();

  if (sessionResult.error) {
    redirect(`/portaal/betalingen?error=${sessionResult.error.code === "23505" ? "incasso-already-started" : "incasso-session"}`);
  }

  try {
    const appUrl = resolveMollieApplicationUrl(returnUrl, process.env.APP_URL);
    const payment = await createMollieFirstPayment({
      amountCents: paymentResult.data.amount_cents,
      currency: paymentResult.data.currency,
      customerId: customer.provider_customer_id,
      description: `${tenant.name} eerste incassobetaling`,
      idempotencyKey,
      metadata: {
        tenantId: tenant.id,
        paymentSessionId: sessionId,
        manualPaymentId: paymentResult.data.id,
        subscriptionId: subscriptionResult.data.id,
        billingProviderCustomerId: customer.id,
        sequenceType: "first"
      },
      mode: config.mode as MollieMode,
      redirectUrl: returnUrl,
      secretReference: config.secret_reference,
      webhookUrl: `${appUrl}/api/webhooks/mollie`
    });
    const update = await admin
      .from("payment_sessions")
      .update({
        provider_session_id: payment.id,
        checkout_url: payment._links?.checkout?.href ?? null,
        status: normalizeMollieStatus(payment.status),
        expires_at: payment.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      })
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId);
    if (update.error) throw update.error;
  } catch (error) {
    await admin
      .from("payment_sessions")
      .update({
        status: "failed",
        failure_code: "provider_api",
        failure_message: safeErrorMessage(error)
      })
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId);
    redirect("/portaal/betalingen?error=incasso-provider-api");
  }

  await createBillingEvent({
    guardianUserId: context.user.id,
    message: "Ouder heeft de eerste Mollie-betaling voor incassotoestemming gestart.",
    participantId: paymentResult.data.participant_id,
    paymentId: paymentResult.data.id,
    paymentSessionId: sessionId,
    subscriptionId: subscriptionResult.data.id,
    tenantId: tenant.id,
    type: "mandate_pending"
  });
  revalidateBillingPaths();
  redirect("/portaal/betalingen?saved=incasso-started");
}

export async function revokeMollieMandateAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const mandateId = readRequired(formData, "mandateId");
  if (formData.get("confirmRevoke") !== "REVOKE") {
    redirect("/portaal/betalingen?error=mandate-confirmation");
  }

  const mandateResult = await admin
    .from("billing_mandates")
    .select("id, provider_config_id, provider_customer_id, provider_mandate_id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", mandateId)
    .eq("guardian_user_id", context.user.id)
    .maybeSingle();
  if (mandateResult.error || !mandateResult.data || mandateResult.data.status === "revoked") {
    redirect("/portaal/betalingen?error=mandate");
  }

  const [customerResult, configResult] = await Promise.all([
    admin
      .from("billing_provider_customers")
      .select("id, provider_customer_id")
      .eq("tenant_id", tenant.id)
      .eq("id", mandateResult.data.provider_customer_id)
      .eq("guardian_user_id", context.user.id)
      .maybeSingle(),
    admin
      .from("billing_provider_configs")
      .select("id, mode, secret_reference")
      .eq("tenant_id", tenant.id)
      .eq("id", mandateResult.data.provider_config_id)
      .eq("provider", "mollie")
      .maybeSingle()
  ]);
  if (customerResult.error || configResult.error || !customerResult.data || !configResult.data?.secret_reference) {
    redirect("/portaal/betalingen?error=mandate-provider");
  }

  try {
    await revokeMollieMandate(
      customerResult.data.provider_customer_id,
      mandateResult.data.provider_mandate_id,
      configResult.data.secret_reference,
      configResult.data.mode as MollieMode
    );
  } catch {
    redirect("/portaal/betalingen?error=mandate-provider-api");
  }

  const subscriptionsResult = await admin
    .from("subscriptions")
    .select("id, participant_id, guardian_user_id")
    .eq("tenant_id", tenant.id)
    .eq("billing_mandate_id", mandateResult.data.id);
  if (subscriptionsResult.error) redirect("/portaal/betalingen?error=mandate-update");

  const now = new Date().toISOString();
  const mandateUpdate = await admin
    .from("billing_mandates")
    .update({ status: "revoked", revoked_at: now, last_synced_at: now })
    .eq("tenant_id", tenant.id)
    .eq("id", mandateResult.data.id);
  const subscriptionUpdate = await admin
    .from("subscriptions")
    .update({ billing_mandate_id: null, collection_method: "manual" })
    .eq("tenant_id", tenant.id)
    .eq("billing_mandate_id", mandateResult.data.id);
  if (mandateUpdate.error || subscriptionUpdate.error) {
    redirect("/portaal/betalingen?error=mandate-update");
  }

  for (const subscription of subscriptionsResult.data ?? []) {
    await createBillingEvent({
      guardianUserId: subscription.guardian_user_id,
      message: "Incassomachtiging door de ouder ingetrokken; handmatige betaling is opnieuw actief.",
      participantId: subscription.participant_id,
      subscriptionId: subscription.id,
      tenantId: tenant.id,
      type: "mandate_revoked"
    });
  }
  revalidateBillingPaths();
  redirect("/portaal/betalingen?saved=mandate-revoked");
}

export async function prenotifyMollieCollectionAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/betalingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const paymentId = readRequired(formData, "paymentId");

  const paymentResult = await admin
    .from("manual_payments")
    .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, due_on, status")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentResult.error || !paymentResult.data || !["due", "overdue"].includes(paymentResult.data.status) || !paymentResult.data.guardian_user_id) {
    redirect("/admin/betalingen?error=incasso-payment");
  }

  const subscriptionResult = await admin
    .from("subscriptions")
    .select("id, provider_config_id, billing_provider_customer_id, billing_mandate_id, collection_method, status")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentResult.data.subscription_id)
    .maybeSingle();
  if (
    subscriptionResult.error ||
    !subscriptionResult.data ||
    subscriptionResult.data.status !== "active" ||
    subscriptionResult.data.collection_method !== "provider" ||
    !subscriptionResult.data.provider_config_id ||
    !subscriptionResult.data.billing_provider_customer_id ||
    !subscriptionResult.data.billing_mandate_id
  ) {
    redirect("/admin/betalingen?error=incasso-mandate");
  }

  const [mandateResult, configResult, activeAttemptResult, attemptsResult] = await Promise.all([
    admin
      .from("billing_mandates")
      .select("id, status")
      .eq("tenant_id", tenant.id)
      .eq("id", subscriptionResult.data.billing_mandate_id)
      .eq("status", "valid")
      .maybeSingle(),
    admin
      .from("billing_provider_configs")
      .select("id, public_config")
      .eq("tenant_id", tenant.id)
      .eq("id", subscriptionResult.data.provider_config_id)
      .eq("provider", "mollie")
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("billing_collection_attempts")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("manual_payment_id", paymentResult.data.id)
      .in("status", ["scheduled", "prenotified", "processing", "pending"])
      .limit(1),
    admin
      .from("billing_collection_attempts")
      .select("attempt_number")
      .eq("tenant_id", tenant.id)
      .eq("manual_payment_id", paymentResult.data.id)
      .order("attempt_number", { ascending: false })
      .limit(1)
  ]);
  if (mandateResult.error || configResult.error || !mandateResult.data || !configResult.data) {
    redirect("/admin/betalingen?error=incasso-mandate");
  }
  if (!isRecurringEnabled(configResult.data.public_config)) {
    redirect("/admin/betalingen?error=incasso-disabled");
  }
  if (activeAttemptResult.error || (activeAttemptResult.data ?? []).length > 0) {
    redirect("/admin/betalingen?error=incasso-attempt-active");
  }

  const noticeDays = directDebitNoticeDays(configResult.data.public_config);
  const scheduledFor = new Date(Date.now() + noticeDays * 24 * 60 * 60 * 1000);
  const attemptNumber = Number(attemptsResult.data?.[0]?.attempt_number ?? 0) + 1;
  const attemptResult = await admin
    .from("billing_collection_attempts")
    .insert({
      tenant_id: tenant.id,
      provider_config_id: subscriptionResult.data.provider_config_id,
      subscription_id: subscriptionResult.data.id,
      manual_payment_id: paymentResult.data.id,
      billing_provider_customer_id: subscriptionResult.data.billing_provider_customer_id,
      billing_mandate_id: subscriptionResult.data.billing_mandate_id,
      guardian_user_id: paymentResult.data.guardian_user_id,
      sequence_type: "recurring",
      attempt_number: attemptNumber,
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      idempotency_key: randomUUID()
    })
    .select("id")
    .single();
  if (attemptResult.error || !attemptResult.data) {
    redirect("/admin/betalingen?error=incasso-attempt");
  }

  const amount = formatMoney(paymentResult.data.amount_cents, paymentResult.data.currency);
  const collectionDate = formatDate(scheduledFor.toISOString());
  const notifications = await createTenantNotifications({
    message: `We schrijven ${amount} op of kort na ${collectionDate} af via SEPA-incasso. Neem vóór die datum contact op als iets niet klopt.`,
    organizationName: tenant.name,
    participantId: paymentResult.data.participant_id,
    recipientIds: [paymentResult.data.guardian_user_id],
    tenantId: tenant.id,
    title: "Aankondiging automatische incasso",
    type: "payment_due"
  });
  const notificationId = notifications[0]?.id ?? null;
  let deliveryStatus: "failed" | "in_app" | "sent" = notificationId ? "in_app" : "failed";
  if (notificationId) {
    const notificationResult = await admin
      .from("tenant_notifications")
      .select("delivery_status")
      .eq("tenant_id", tenant.id)
      .eq("id", notificationId)
      .maybeSingle();
    if (notificationResult.data?.delivery_status === "sent") deliveryStatus = "sent";
    else if (notificationResult.data?.delivery_status === "failed") deliveryStatus = "failed";
  }

  const now = new Date().toISOString();
  const attemptUpdate = await admin
    .from("billing_collection_attempts")
    .update({
      status: "prenotified",
      prenotified_at: now,
      prenotification_id: notificationId,
      prenotification_delivery_status: deliveryStatus
    })
    .eq("tenant_id", tenant.id)
    .eq("id", attemptResult.data.id);
  if (attemptUpdate.error) redirect("/admin/betalingen?error=incasso-notice");

  await createBillingEvent({
    guardianUserId: paymentResult.data.guardian_user_id,
    message: `Incasso ${amount} aangekondigd voor ${collectionDate}; levering ${deliveryStatus}.`,
    participantId: paymentResult.data.participant_id,
    paymentId: paymentResult.data.id,
    subscriptionId: paymentResult.data.subscription_id,
    tenantId: tenant.id,
    type: "collection_prenotified"
  });
  revalidateBillingPaths();
  redirect(`/admin/betalingen?${deliveryStatus === "sent" ? "saved=incasso-prenotified" : "error=incasso-notice-delivery"}`);
}

export async function startMollieCollectionAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/betalingen");
  const tenant = getActiveTenant(context);
  const attemptId = readRequired(formData, "attemptId");
  try {
    await processMollieCollectionAttempt({
      attemptId,
      organizationName: tenant.name,
      tenantId: tenant.id
    });
  } catch (error) {
    const code = error instanceof MollieCollectionError ? error.code : "not_ready";
    const feedback = {
      disabled: "incasso-disabled",
      not_due: "incasso-not-due",
      outcome_unknown: "incasso-outcome-unknown",
      persistence_pending: "incasso-outcome-unknown",
      provider_api: "incasso-provider-api"
    }[code] ?? "incasso-not-ready";
    redirect(`/admin/betalingen?error=${feedback}`);
  }

  revalidateBillingPaths();
  redirect("/admin/betalingen?saved=incasso-started");
}

async function getOrCreateProviderCustomer(input: {
  customerIdempotencyKey: string;
  email: string;
  guardianUserId: string;
  mode: MollieMode;
  name: string;
  providerConfigId: string;
  secretReference: string;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const existing = await admin
    .from("billing_provider_customers")
    .select("id, provider_customer_id")
    .eq("tenant_id", input.tenantId)
    .eq("provider_config_id", input.providerConfigId)
    .eq("guardian_user_id", input.guardianUserId)
    .eq("status", "active")
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const providerCustomer = await createMollieCustomer({
    email: input.email,
    guardianUserId: input.guardianUserId,
    idempotencyKey: input.customerIdempotencyKey,
    mode: input.mode,
    name: input.name,
    secretReference: input.secretReference,
    tenantId: input.tenantId
  });
  const created = await admin
    .from("billing_provider_customers")
    .insert({
      tenant_id: input.tenantId,
      provider_config_id: input.providerConfigId,
      guardian_user_id: input.guardianUserId,
      provider: "mollie",
      provider_customer_id: providerCustomer.id,
      status: "active",
      last_synced_at: new Date().toISOString()
    })
    .select("id, provider_customer_id")
    .single();
  if (!created.error && created.data) return created.data;
  if (created.error?.code !== "23505") throw created.error;

  const raced = await admin
    .from("billing_provider_customers")
    .select("id, provider_customer_id")
    .eq("tenant_id", input.tenantId)
    .eq("provider_config_id", input.providerConfigId)
    .eq("guardian_user_id", input.guardianUserId)
    .eq("status", "active")
    .single();
  if (raced.error || !raced.data) throw raced.error ?? new Error("Provider customer race could not be resolved.");
  return raced.data;
}

async function createBillingEvent(input: {
  guardianUserId?: string | null;
  message: string;
  participantId?: string | null;
  paymentId?: string | null;
  paymentSessionId?: string | null;
  subscriptionId?: string | null;
  tenantId: string;
  type: string;
}) {
  const admin = createAdminClient();
  const result = await admin.from("billing_events").insert({
    tenant_id: input.tenantId,
    subscription_id: input.subscriptionId ?? null,
    manual_payment_id: input.paymentId ?? null,
    payment_session_id: input.paymentSessionId ?? null,
    participant_id: input.participantId ?? null,
    guardian_user_id: input.guardianUserId ?? null,
    type: input.type,
    status: "open",
    message: input.message
  });
  if (result.error && result.error.code !== "23505") throw result.error;
}

function directDebitNoticeDays(value: unknown) {
  const config = (value ?? {}) as Record<string, unknown>;
  const days = Number(config.direct_debit_notice_days);
  return Number.isInteger(days) && days >= 2 && days <= 30 ? days : 7;
}

function isRecurringEnabled(value: unknown) {
  return ((value ?? {}) as Record<string, unknown>).recurring_enabled === true;
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

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/(?:test|live)_[A-Za-z0-9]+/g, "[redacted]").slice(0, 500) : "Mollie API request failed.";
}

function revalidateBillingPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/betalingen");
  revalidatePath("/portaal");
  revalidatePath("/portaal/betalingen");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value));
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}
