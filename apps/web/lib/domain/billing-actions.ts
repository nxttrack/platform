"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { createMolliePayment } from "./mollie";
import { createPaymentSessionDraft, isProviderConfigReady, type PaymentProviderConfigLike } from "./payment-provider";
import { createTenantNotifications } from "./tenant-notifications";

const planStatuses = new Set(["draft", "active", "archived"]);
const intervals = new Set(["monthly", "quarterly", "yearly", "one_time", "manual"]);
const subscriptionStatuses = new Set(["active", "paused", "cancelled", "completed"]);
const paymentStatuses = new Set(["due", "overdue", "paid", "waived", "cancelled"]);
const providerKinds = new Set(["manual", "mollie", "ideal", "other"]);
const providerModes = new Set(["test", "live"]);
const providerStatuses = new Set(["draft", "active", "disabled"]);
const collectionMethods = new Set(["manual", "provider"]);
const invoiceStatuses = new Set(["draft", "issued", "sent", "paid", "void", "exported"]);
const exportTypes = new Set(["invoices", "payments", "subscriptions", "provider_events"]);

export async function saveBillingProviderConfigAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const provider = readEnum(formData, "provider", providerKinds, "manual");
  const mode = readEnum(formData, "mode", providerModes, "test");
  const payload = {
    tenant_id: tenant.id,
    provider,
    mode,
    status: readEnum(formData, "status", providerStatuses, "draft"),
    display_name: readOptional(formData, "displayName") ?? `${provider.toUpperCase()} ${mode}`,
    secret_reference: readOptional(formData, "secretReference"),
    webhook_secret_reference: readOptional(formData, "webhookSecretReference"),
    public_config: {
      checkout_description: readOptional(formData, "checkoutDescription"),
      return_url: readOptional(formData, "returnUrl")
    }
  };
  const { error } = await admin.from("billing_provider_configs").upsert(payload, { onConflict: "tenant_id,provider,mode" });

  redirectAfterWrite(error, "provider");
}

export async function createPaymentPlanAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const { error } = await admin.from("payment_plans").insert({
    tenant_id: tenant.id,
    program_id: readOptional(formData, "programId"),
    code: readOptional(formData, "code"),
    name: readRequired(formData, "name"),
    description: readOptional(formData, "description"),
    amount_cents: readMoneyCents(formData, "amount"),
    currency: (readOptional(formData, "currency") ?? "EUR").toUpperCase(),
    billing_interval: readEnum(formData, "billingInterval", intervals, "monthly"),
    billing_day: readInteger(formData, "billingDay"),
    payment_terms_days: readInteger(formData, "paymentTermsDays") ?? 14,
    status: readEnum(formData, "status", planStatuses, "active"),
    sort_order: readInteger(formData, "sortOrder") ?? 0
  });

  redirectAfterWrite(error, "plan");
}

export async function createSubscriptionAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const enrollmentId = readRequired(formData, "enrollmentId");
  const paymentPlanId = readRequired(formData, "paymentPlanId");
  const [enrollmentResult, planResult] = await Promise.all([
    admin.from("enrollments").select("id, participant_id, guardian_user_id").eq("tenant_id", tenant.id).eq("id", enrollmentId).maybeSingle(),
    admin.from("payment_plans").select("id, amount_cents, currency, billing_interval").eq("tenant_id", tenant.id).eq("id", paymentPlanId).maybeSingle()
  ]);

  if (enrollmentResult.error || planResult.error || !enrollmentResult.data || !planResult.data) {
    redirect("/admin/betalingen?error=subscription");
  }

  const subscriptionResult = await admin
    .from("subscriptions")
    .insert({
      tenant_id: tenant.id,
      participant_id: enrollmentResult.data.participant_id,
      enrollment_id: enrollmentResult.data.id,
      guardian_user_id: enrollmentResult.data.guardian_user_id,
      payment_plan_id: planResult.data.id,
      status: readEnum(formData, "status", subscriptionStatuses, "active"),
      starts_on: readOptional(formData, "startsOn") ?? new Date().toISOString().slice(0, 10),
      ends_on: readOptional(formData, "endsOn"),
      next_due_on: readOptional(formData, "nextDueOn"),
      amount_cents: readMoneyCentsOptional(formData, "amount") ?? planResult.data.amount_cents,
      currency: (readOptional(formData, "currency") ?? planResult.data.currency).toUpperCase(),
      billing_interval: readEnum(formData, "billingInterval", intervals, planResult.data.billing_interval),
      collection_method: readEnum(formData, "collectionMethod", collectionMethods, "manual"),
      provider_config_id: readOptional(formData, "providerConfigId"),
      billing_anchor_day: readInteger(formData, "billingAnchorDay"),
      current_period_start: readOptional(formData, "currentPeriodStart"),
      current_period_end: readOptional(formData, "currentPeriodEnd"),
      notes: readOptional(formData, "notes")
    })
    .select("id")
    .single();

  if (subscriptionResult.error || !subscriptionResult.data) {
    redirect("/admin/betalingen?error=subscription");
  }

  await createBillingEvent({
    tenantId: tenant.id,
    subscriptionId: subscriptionResult.data.id,
    participantId: enrollmentResult.data.participant_id,
    guardianUserId: enrollmentResult.data.guardian_user_id,
    type: "subscription_created",
    message: "Subscription aangemaakt."
  });

  redirectAfterWrite(null, "subscription");
}

export async function createManualPaymentAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const subscriptionId = readRequired(formData, "subscriptionId");
  const subscriptionResult = await admin
    .from("subscriptions")
    .select("id, participant_id, enrollment_id, guardian_user_id, amount_cents, currency")
    .eq("tenant_id", tenant.id)
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionResult.error || !subscriptionResult.data) {
    redirect("/admin/betalingen?error=payment");
  }

  const status = readEnum(formData, "status", paymentStatuses, "due");
  const paymentResult = await admin
    .from("manual_payments")
    .insert({
      tenant_id: tenant.id,
      subscription_id: subscriptionResult.data.id,
      participant_id: subscriptionResult.data.participant_id,
      enrollment_id: subscriptionResult.data.enrollment_id,
      guardian_user_id: subscriptionResult.data.guardian_user_id,
      amount_cents: readMoneyCentsOptional(formData, "amount") ?? subscriptionResult.data.amount_cents,
      currency: (readOptional(formData, "currency") ?? subscriptionResult.data.currency).toUpperCase(),
      due_on: readRequired(formData, "dueOn"),
      paid_on: status === "paid" ? readOptional(formData, "paidOn") ?? new Date().toISOString().slice(0, 10) : readOptional(formData, "paidOn"),
      status,
      reference: readOptional(formData, "reference"),
      method: readOptional(formData, "method"),
      notes: readOptional(formData, "notes")
    })
    .select("id, amount_cents, currency, due_on")
    .single();

  if (paymentResult.error || !paymentResult.data) {
    redirect("/admin/betalingen?error=payment");
  }

  await recordPaymentSignal({
    tenantId: tenant.id,
    organizationName: tenant.name,
    paymentId: paymentResult.data.id,
    subscriptionId: subscriptionResult.data.id,
    participantId: subscriptionResult.data.participant_id,
    guardianUserId: subscriptionResult.data.guardian_user_id,
    status,
    amountCents: paymentResult.data.amount_cents,
    currency: paymentResult.data.currency,
    dueOn: paymentResult.data.due_on
  });

  redirectAfterWrite(null, "payment");
}

export async function updateManualPaymentStatusAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const paymentId = readRequired(formData, "paymentId");
  const status = readEnum(formData, "status", paymentStatuses, "due");
  const paymentResult = await admin
    .from("manual_payments")
    .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, due_on")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentResult.error || !paymentResult.data) {
    redirect("/admin/betalingen?error=payment");
  }

  const paidOn = status === "paid" ? readOptional(formData, "paidOn") ?? new Date().toISOString().slice(0, 10) : readOptional(formData, "paidOn");
  const { error } = await admin
    .from("manual_payments")
    .update({
      status,
      paid_on: paidOn,
      method: readOptional(formData, "method"),
      notes: readOptional(formData, "notes")
    })
    .eq("tenant_id", tenant.id)
    .eq("id", paymentResult.data.id);

  if (error) {
    redirect("/admin/betalingen?error=payment");
  }

  await recordPaymentSignal({
    tenantId: tenant.id,
    organizationName: tenant.name,
    paymentId: paymentResult.data.id,
    subscriptionId: paymentResult.data.subscription_id,
    participantId: paymentResult.data.participant_id,
    guardianUserId: paymentResult.data.guardian_user_id,
    status,
    amountCents: paymentResult.data.amount_cents,
    currency: paymentResult.data.currency,
    dueOn: paymentResult.data.due_on
  });

  redirectAfterWrite(null, "status");
}

export async function updateSubscriptionLifecycleAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const subscriptionId = readRequired(formData, "subscriptionId");
  const status = readEnum(formData, "status", subscriptionStatuses, "active");
  const reason = readOptional(formData, "reason");
  const subscriptionResult = await admin
    .from("subscriptions")
    .select("id, participant_id, guardian_user_id")
    .eq("tenant_id", tenant.id)
    .eq("id", subscriptionId)
    .maybeSingle();

  if (subscriptionResult.error || !subscriptionResult.data) {
    redirect("/admin/betalingen?error=subscription");
  }

  const now = new Date().toISOString();
  const update: Record<string, string | null> = {
    lifecycle_status_reason: reason,
    status
  };

  if (status === "paused" || status === "active") {
    update.paused_at = status === "paused" ? now : null;
  }

  if (status === "cancelled" || status === "active") {
    update.cancelled_at = status === "cancelled" ? now : null;
  }

  if (status === "completed" || status === "active") {
    update.completed_at = status === "completed" ? now : null;
  }

  const { error } = await admin.from("subscriptions").update(update).eq("tenant_id", tenant.id).eq("id", subscriptionResult.data.id);

  if (error) {
    redirect("/admin/betalingen?error=subscription");
  }

  await createBillingEvent({
    tenantId: tenant.id,
    subscriptionId: subscriptionResult.data.id,
    participantId: subscriptionResult.data.participant_id,
    guardianUserId: subscriptionResult.data.guardian_user_id,
    type: subscriptionEventType(status),
    message: reason ? `Abonnement ${subscriptionStatusLabel(status)}: ${reason}` : `Abonnement ${subscriptionStatusLabel(status)}.`
  });

  redirectAfterWrite(null, "subscription-status");
}

export async function createPaymentProviderSessionAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const paymentId = readRequired(formData, "paymentId");
  const providerConfigId = readRequired(formData, "providerConfigId");
  const [paymentResult, providerResult] = await Promise.all([
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, status")
      .eq("tenant_id", tenant.id)
      .eq("id", paymentId)
      .maybeSingle(),
    admin
      .from("billing_provider_configs")
      .select("id, provider, mode, status, display_name, secret_reference, public_config")
      .eq("tenant_id", tenant.id)
      .eq("id", providerConfigId)
      .maybeSingle()
  ]);

  if (paymentResult.error || providerResult.error || !paymentResult.data || !providerResult.data) {
    redirect("/admin/betalingen?error=provider-session");
  }

  const providerConfig = providerResult.data as PaymentProviderConfigLike;

  if (!isProviderConfigReady(providerConfig)) {
    redirect("/admin/betalingen?error=provider-not-ready");
  }

  const idempotencyKey = randomUUID();
  const publicConfig = providerConfig.public_config ?? {};
  const returnUrl = readOptional(formData, "returnUrl") ?? optionalString(publicConfig.return_url);
  const draft = createPaymentSessionDraft({
    amountCents: paymentResult.data.amount_cents,
    currency: paymentResult.data.currency,
    idempotencyKey,
    paymentId: paymentResult.data.id,
    providerConfig,
    returnUrl
  });
  const sessionResult = await admin
    .from("payment_sessions")
    .insert({
      tenant_id: tenant.id,
      provider_config_id: providerConfig.id,
      subscription_id: paymentResult.data.subscription_id,
      manual_payment_id: paymentResult.data.id,
      participant_id: paymentResult.data.participant_id,
      guardian_user_id: paymentResult.data.guardian_user_id,
      provider: draft.provider,
      provider_session_id: draft.providerSessionId,
      idempotency_key: idempotencyKey,
      checkout_url: draft.checkoutUrl,
      amount_cents: paymentResult.data.amount_cents,
      currency: paymentResult.data.currency,
      status: draft.status,
      return_url: returnUrl,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
    .select("id")
    .single();

  if (sessionResult.error || !sessionResult.data) {
    redirect("/admin/betalingen?error=provider-session");
  }

  if (draft.provider === "mollie") {
    if (!providerConfig.secret_reference || !returnUrl) {
      await admin.from("payment_sessions").update({ status: "failed", failure_code: "configuration", failure_message: "Mollie secret reference or return URL is missing." }).eq("tenant_id", tenant.id).eq("id", sessionResult.data.id);
      redirect("/admin/betalingen?error=provider-not-ready");
    }

    try {
      const appUrl = resolveApplicationUrl(returnUrl);
      const molliePayment = await createMolliePayment({
        amountCents: paymentResult.data.amount_cents,
        currency: paymentResult.data.currency,
        description: optionalString(publicConfig.checkout_description) ?? `${tenant.name} betaling`,
        idempotencyKey,
        metadata: { tenantId: tenant.id, paymentSessionId: sessionResult.data.id, manualPaymentId: paymentResult.data.id },
        redirectUrl: returnUrl,
        secretReference: providerConfig.secret_reference,
        webhookUrl: `${appUrl}/api/webhooks/mollie`
      });
      const { error } = await admin.from("payment_sessions").update({
        provider_session_id: molliePayment.id,
        checkout_url: molliePayment._links?.checkout?.href ?? null,
        status: "pending",
        expires_at: molliePayment.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }).eq("tenant_id", tenant.id).eq("id", sessionResult.data.id);
      if (error) throw error;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Mollie payment creation failed.";
      await admin.from("payment_sessions").update({ status: "failed", failure_code: "provider_api", failure_message: message }).eq("tenant_id", tenant.id).eq("id", sessionResult.data.id);
      redirect("/admin/betalingen?error=provider-api");
    }
  }

  await createBillingEvent({
    tenantId: tenant.id,
    paymentId: paymentResult.data.id,
    subscriptionId: paymentResult.data.subscription_id,
    participantId: paymentResult.data.participant_id,
    guardianUserId: paymentResult.data.guardian_user_id,
    type: "payment_session_created",
    message: `${providerConfig.display_name}: betaalpoging voorbereid.`
  });

  redirectAfterWrite(null, "provider-session");
}

export async function recordPaymentSessionFailureAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const sessionId = readRequired(formData, "paymentSessionId");
  const failureMessage = readOptional(formData, "failureMessage") ?? "Payment attempt failed.";
  const sessionResult = await admin
    .from("payment_sessions")
    .select("id, provider_config_id, manual_payment_id, subscription_id, participant_id, guardian_user_id, provider")
    .eq("tenant_id", tenant.id)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error || !sessionResult.data) {
    redirect("/admin/betalingen?error=payment-session");
  }

  const { error } = await admin
    .from("payment_sessions")
    .update({
      status: "failed",
      failure_code: readOptional(formData, "failureCode") ?? "manual_failure",
      failure_message: failureMessage
    })
    .eq("tenant_id", tenant.id)
    .eq("id", sessionResult.data.id);

  if (error) {
    redirect("/admin/betalingen?error=payment-session");
  }

  await admin.from("payment_provider_events").insert({
    tenant_id: tenant.id,
    provider_config_id: sessionResult.data.provider_config_id,
    payment_session_id: sessionResult.data.id,
    manual_payment_id: sessionResult.data.manual_payment_id,
    provider: sessionResult.data.provider,
    event_type: "payment.failed",
    processing_status: "processed",
    payload: { source: "admin", message: failureMessage },
    processed_at: new Date().toISOString()
  });

  await createBillingEvent({
    tenantId: tenant.id,
    paymentId: sessionResult.data.manual_payment_id,
    subscriptionId: sessionResult.data.subscription_id,
    participantId: sessionResult.data.participant_id,
    guardianUserId: sessionResult.data.guardian_user_id,
    type: "payment_failed",
    message: failureMessage
  });

  await createBillingFollowUpTask({
    tenantId: tenant.id,
    userId: user.id,
    participantId: sessionResult.data.participant_id,
    title: "Mislukte betaling opvolgen",
    description: failureMessage,
    priority: "high"
  });

  redirectAfterWrite(null, "payment-failed");
}

export async function runBillingLifecycleAction() {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const paymentsResult = await admin
    .from("manual_payments")
    .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, due_on")
    .eq("tenant_id", tenant.id)
    .eq("status", "due")
    .lt("due_on", today)
    .limit(100);

  if (paymentsResult.error) {
    redirect("/admin/betalingen?error=lifecycle");
  }

  const payments = (paymentsResult.data ?? []) as Array<{ amount_cents: number; currency: string; due_on: string; guardian_user_id: string | null; id: string; participant_id: string; subscription_id: string }>;

  for (const payment of payments) {
    const { error } = await admin.from("manual_payments").update({ status: "overdue" }).eq("tenant_id", tenant.id).eq("id", payment.id).eq("status", "due");

    if (error) {
      continue;
    }

    await recordPaymentSignal({
      tenantId: tenant.id,
      organizationName: tenant.name,
      paymentId: payment.id,
      subscriptionId: payment.subscription_id,
      participantId: payment.participant_id,
      guardianUserId: payment.guardian_user_id,
      status: "overdue",
      amountCents: payment.amount_cents,
      currency: payment.currency,
      dueOn: payment.due_on
    });
    await createBillingFollowUpTask({
      tenantId: tenant.id,
      userId: user.id,
      participantId: payment.participant_id,
      title: "Overdue betaling opvolgen",
      description: `${formatMoney(payment.amount_cents, payment.currency)} verlopen sinds ${formatDate(payment.due_on)}.`,
      priority: "urgent"
    });
  }

  redirectAfterWrite(null, `lifecycle-${payments.length}`);
}

export async function createInvoiceForPaymentAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const paymentId = readRequired(formData, "paymentId");
  const existingInvoiceResult = await admin.from("billing_invoices").select("id").eq("tenant_id", tenant.id).eq("manual_payment_id", paymentId).limit(1);

  if (existingInvoiceResult.error) {
    redirect("/admin/betalingen?error=invoice");
  }

  if ((existingInvoiceResult.data ?? []).length > 0) {
    redirectAfterWrite(null, "invoice-exists");
  }

  const paymentResult = await admin
    .from("manual_payments")
    .select("id, subscription_id, participant_id, guardian_user_id, amount_cents, currency, due_on, paid_on, status, reference")
    .eq("tenant_id", tenant.id)
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentResult.error || !paymentResult.data) {
    redirect("/admin/betalingen?error=invoice");
  }

  const status = readEnum(formData, "status", invoiceStatuses, paymentResult.data.status === "paid" ? "paid" : "issued");
  const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const invoiceResult = await admin
    .from("billing_invoices")
    .insert({
      tenant_id: tenant.id,
      subscription_id: paymentResult.data.subscription_id,
      manual_payment_id: paymentResult.data.id,
      participant_id: paymentResult.data.participant_id,
      guardian_user_id: paymentResult.data.guardian_user_id,
      invoice_number: invoiceNumber,
      status,
      issued_on: new Date().toISOString().slice(0, 10),
      due_on: paymentResult.data.due_on,
      paid_on: status === "paid" ? paymentResult.data.paid_on ?? new Date().toISOString().slice(0, 10) : null,
      subtotal_cents: paymentResult.data.amount_cents,
      tax_cents: 0,
      total_cents: paymentResult.data.amount_cents,
      currency: paymentResult.data.currency,
      export_status: "ready",
      notes: readOptional(formData, "notes")
    })
    .select("id")
    .single();

  if (invoiceResult.error || !invoiceResult.data) {
    redirect("/admin/betalingen?error=invoice");
  }

  const lineError = await admin.from("billing_invoice_lines").insert({
    tenant_id: tenant.id,
    invoice_id: invoiceResult.data.id,
    manual_payment_id: paymentResult.data.id,
    description: readOptional(formData, "description") ?? paymentResult.data.reference ?? "Zwemles betaling",
    quantity: 1,
    unit_amount_cents: paymentResult.data.amount_cents,
    tax_rate_basis_points: 0,
    total_cents: paymentResult.data.amount_cents,
    sort_order: 0
  });

  if (lineError.error) {
    redirect("/admin/betalingen?error=invoice-line");
  }

  await createBillingEvent({
    tenantId: tenant.id,
    paymentId: paymentResult.data.id,
    subscriptionId: paymentResult.data.subscription_id,
    participantId: paymentResult.data.participant_id,
    guardianUserId: paymentResult.data.guardian_user_id,
    type: "invoice_created",
    message: `Factuur ${invoiceNumber} aangemaakt.`
  });

  redirectAfterWrite(null, "invoice");
}

export async function createBillingExportBatchAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const exportType = readEnum(formData, "exportType", exportTypes, "invoices");
  const periodStart = readOptional(formData, "periodStart");
  const periodEnd = readOptional(formData, "periodEnd");
  let invoiceQuery = admin.from("billing_invoices").select("id").eq("tenant_id", tenant.id).eq("export_status", "ready");

  if (periodStart) {
    invoiceQuery = invoiceQuery.gte("issued_on", periodStart);
  }

  if (periodEnd) {
    invoiceQuery = invoiceQuery.lte("issued_on", periodEnd);
  }

  const invoicesResult = exportType === "invoices" ? await invoiceQuery : { data: [], error: null };

  if (invoicesResult.error) {
    redirect("/admin/betalingen?error=export");
  }

  const invoiceIds = ((invoicesResult.data ?? []) as { id: string }[]).map((invoice) => invoice.id);
  const exportKey = `${exportType}-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const batchResult = await admin
    .from("billing_export_batches")
    .insert({
      tenant_id: tenant.id,
      export_key: exportKey,
      export_type: exportType,
      status: "ready",
      period_start: periodStart,
      period_end: periodEnd,
      row_count: invoiceIds.length,
      generated_by_user_id: user.id,
      generated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (batchResult.error || !batchResult.data) {
    redirect("/admin/betalingen?error=export");
  }

  if (invoiceIds.length > 0) {
    await admin.from("billing_invoices").update({ export_status: "exported", status: "exported" }).eq("tenant_id", tenant.id).in("id", invoiceIds);
  }

  await createBillingEvent({
    tenantId: tenant.id,
    type: "invoice_exported",
    message: `${invoiceIds.length} factuurregel(s) klaargezet voor export.`
  });

  redirectAfterWrite(null, "export");
}

async function getActionContext() {
  const context = await requirePrivateShellContext("/admin");

  return {
    tenant: getActiveTenant(context),
    user: context.user
  };
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resolveApplicationUrl(returnUrl: string) {
  const configured = process.env.APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const parsed = new URL(returnUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Return URL must use HTTPS");
  return parsed.origin;
}

async function recordPaymentSignal(input: {
  tenantId: string;
  organizationName: string;
  paymentId: string;
  subscriptionId: string;
  participantId: string;
  guardianUserId: string | null;
  status: string;
  amountCents: number;
  currency: string;
  dueOn: string;
}) {
  const eventType = input.status === "paid" ? "payment_paid" : input.status === "overdue" ? "payment_overdue" : "payment_due";
  const notificationType = input.status === "paid" ? "payment_received" : input.status === "overdue" ? "payment_overdue" : "payment_due";
  const title = input.status === "paid" ? "Betaling verwerkt" : input.status === "overdue" ? "Betaling verlopen" : "Betaling open";
  const message = `${formatMoney(input.amountCents, input.currency)} - vervaldatum ${formatDate(input.dueOn)}`;

  await createBillingEvent({
    tenantId: input.tenantId,
    paymentId: input.paymentId,
    subscriptionId: input.subscriptionId,
    participantId: input.participantId,
    guardianUserId: input.guardianUserId,
    type: eventType,
    message
  });

  await createParentNotification({
    tenantId: input.tenantId,
    organizationName: input.organizationName,
    participantId: input.participantId,
    guardianUserId: input.guardianUserId,
    type: notificationType,
    title,
    message
  });
}

async function createBillingEvent(input: {
  tenantId: string;
  paymentId?: string;
  subscriptionId?: string;
  participantId?: string | null;
  guardianUserId?: string | null;
  type: string;
  message: string;
}) {
  const admin = createAdminClient();

  await admin.from("billing_events").insert({
    tenant_id: input.tenantId,
    subscription_id: input.subscriptionId ?? null,
    manual_payment_id: input.paymentId ?? null,
    participant_id: input.participantId ?? null,
    guardian_user_id: input.guardianUserId ?? null,
    type: input.type,
    status: "open",
    message: input.message
  });
}

async function createBillingFollowUpTask(input: { description: string; participantId: string | null; priority: "high" | "urgent"; tenantId: string; title: string; userId: string }) {
  const admin = createAdminClient();

  await admin.from("tenant_tasks").insert({
    tenant_id: input.tenantId,
    created_by_user_id: input.userId,
    related_participant_id: input.participantId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    status: "open",
    due_on: new Date().toISOString().slice(0, 10)
  });
}

async function createParentNotification(input: { tenantId: string; organizationName: string; participantId: string; guardianUserId: string | null; type: "payment_due" | "payment_overdue" | "payment_received"; title: string; message: string }) {
  const admin = createAdminClient();
  const [participantResult, guardiansResult] = await Promise.all([
    admin.from("participants").select("guardian_user_id, display_name").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin.from("participant_guardians").select("guardian_user_id").eq("tenant_id", input.tenantId).eq("participant_id", input.participantId).eq("status", "active")
  ]);

  if (participantResult.error || guardiansResult.error || !participantResult.data) {
    return;
  }

  const participant = participantResult.data as { guardian_user_id: string | null; display_name: string };
  const guardianRows = (guardiansResult.data ?? []) as { guardian_user_id: string }[];
  const recipientIds = unique([input.guardianUserId, participant.guardian_user_id, ...guardianRows.map((guardian) => guardian.guardian_user_id)]);

  if (recipientIds.length === 0) {
    return;
  }

  await createTenantNotifications({
    message: `${participant.display_name}: ${input.message}`,
    organizationName: input.organizationName,
    participantId: input.participantId,
    recipientIds,
    tenantId: input.tenantId,
    title: input.title,
    type: input.type
  });

  revalidatePath("/portaal");
  revalidatePath("/portaal/betalingen");
}

function redirectAfterWrite(error: { message: string } | null, saved: string): never {
  revalidatePath("/admin");
  revalidatePath("/admin/betalingen");
  revalidatePath("/portaal");
  revalidatePath("/portaal/betalingen");

  if (error) {
    redirect("/admin/betalingen?error=write");
  }

  redirect(`/admin/betalingen?saved=${encodeURIComponent(saved)}`);
}

function readEnum(formData: FormData, field: string, allowed: Set<string>, fallback: string) {
  const value = readOptional(formData, field) ?? fallback;

  return allowed.has(value) ? value : fallback;
}

function readRequired(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function readOptional(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function readInteger(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function readMoneyCents(formData: FormData, field: string) {
  const value = readMoneyCentsOptional(formData, field);

  if (value === null) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function readMoneyCentsOptional(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const normalized = value.replace(",", ".");
  const parsed = Number.parseFloat(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function subscriptionEventType(status: string) {
  if (status === "paused") {
    return "subscription_paused";
  }

  if (status === "cancelled") {
    return "subscription_cancelled";
  }

  if (status === "completed") {
    return "subscription_completed";
  }

  return "subscription_changed";
}

function subscriptionStatusLabel(status: string) {
  if (status === "paused") {
    return "gepauzeerd";
  }

  if (status === "cancelled") {
    return "geannuleerd";
  }

  if (status === "completed") {
    return "afgerond";
  }

  return "bijgewerkt";
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}
