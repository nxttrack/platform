"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { createTenantNotifications } from "./tenant-notifications";

const planStatuses = new Set(["draft", "active", "archived"]);
const intervals = new Set(["monthly", "quarterly", "yearly", "one_time", "manual"]);
const subscriptionStatuses = new Set(["active", "paused", "cancelled", "completed"]);
const paymentStatuses = new Set(["due", "overdue", "paid", "waived", "cancelled"]);

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

async function getActionContext() {
  const context = await requirePrivateShellContext("/admin");

  return {
    tenant: getActiveTenant(context),
    user: context.user
  };
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
  participantId: string;
  guardianUserId: string | null;
  type: string;
  message: string;
}) {
  const admin = createAdminClient();

  await admin.from("billing_events").insert({
    tenant_id: input.tenantId,
    subscription_id: input.subscriptionId ?? null,
    manual_payment_id: input.paymentId ?? null,
    participant_id: input.participantId,
    guardian_user_id: input.guardianUserId,
    type: input.type,
    status: "open",
    message: input.message
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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}
