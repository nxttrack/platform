"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function createManualInvoiceAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const enrollmentResult = await supabase
    .from("enrollments")
    .select("participant_id, subscription_plan_id")
    .eq("tenant_id", tenantId)
    .eq("id", enrollmentId)
    .single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    throw new Error(enrollmentResult.error?.message ?? "Enrollment niet gevonden.");
  }

  await throwOnError(
    supabase.from("invoices").insert({
      tenant_id: tenantId,
      enrollment_id: enrollmentId,
      participant_id: enrollmentResult.data.participant_id,
      subscription_plan_id: optionalString(formData, "subscription_plan_id") ?? enrollmentResult.data.subscription_plan_id,
      invoice_number: requiredString(formData, "invoice_number"),
      title: requiredString(formData, "title"),
      description: optionalString(formData, "description"),
      period_start: optionalDate(formData, "period_start"),
      period_end: optionalDate(formData, "period_end"),
      issued_on: requiredDate(formData, "issued_on"),
      due_on: optionalDate(formData, "due_on"),
      amount_due_cents: priceCents(formData, "amount"),
      currency: requiredString(formData, "currency").toUpperCase(),
      status: enumValue(formData, "status", ["draft", "open", "partially_paid", "paid", "overdue", "void"], "open"),
      collection_method: "manual",
      created_by_profile_id: profileId,
      metadata: { phase: "manual_payment" }
    })
  );

  revalidatePayments();
}

export async function recordManualPaymentAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const invoiceId = requiredString(formData, "invoice_id");
  const invoiceResult = await supabase
    .from("invoices")
    .select("enrollment_id, participant_id, currency")
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .single();

  if (invoiceResult.error || !invoiceResult.data) {
    throw new Error(invoiceResult.error?.message ?? "Factuur niet gevonden.");
  }

  await throwOnError(
    supabase.from("payment_records").insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      enrollment_id: invoiceResult.data.enrollment_id,
      participant_id: invoiceResult.data.participant_id,
      provider: "manual",
      payment_method: enumValue(formData, "payment_method", ["manual_bank_transfer", "cash", "card_terminal", "ideal", "mollie", "external"], "manual_bank_transfer"),
      amount_cents: priceCents(formData, "amount"),
      currency: invoiceResult.data.currency,
      status: enumValue(formData, "status", ["recorded", "pending", "paid", "failed", "refunded", "cancelled"], "recorded"),
      received_on: optionalDate(formData, "received_on"),
      recorded_by_profile_id: profileId,
      note: optionalString(formData, "note"),
      metadata: { source: "admin_manual_flow" }
    })
  );

  revalidatePayments();
}

export async function updateInvoiceCorrectionAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const invoiceId = requiredString(formData, "invoice_id");
  const amountDueCents = priceCents(formData, "amount_due");
  const status = enumValue(formData, "status", ["draft", "open", "partially_paid", "paid", "overdue", "void"], "open");
  const note = optionalString(formData, "correction_note") ?? "Handmatige factuurcorrectie.";

  await throwOnError(
    supabase
      .from("invoices")
      .update({
        title: requiredString(formData, "title"),
        description: optionalString(formData, "description"),
        due_on: optionalDate(formData, "due_on"),
        amount_due_cents: amountDueCents,
        status,
        metadata: { source: "admin_manual_correction", correction_note: note }
      })
      .eq("tenant_id", tenantId)
      .eq("id", invoiceId)
  );

  await throwOnError(
    supabase.from("payment_events").insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider: "manual",
      event_type: "invoice_manual_correction",
      payload: { amount_due_cents: amountDueCents, status, note },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

export async function queueInvoiceReminderAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const invoiceId = requiredString(formData, "invoice_id");
  const invoiceResult = await supabase
    .from("invoices")
    .select("id, enrollment_id, participant_id, invoice_number, title, amount_due_cents, amount_paid_cents, currency, due_on, status")
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .single();

  if (invoiceResult.error || !invoiceResult.data) {
    throw new Error(invoiceResult.error?.message ?? "Factuur niet gevonden.");
  }

  const guardiansResult = await supabase
    .from("participant_guardians")
    .select("profile_id, email, display_name")
    .eq("tenant_id", tenantId)
    .eq("participant_id", invoiceResult.data.participant_id)
    .eq("status", "active");

  if (guardiansResult.error) {
    throw new Error(guardiansResult.error.message);
  }

  const remainingCents = Math.max(0, invoiceResult.data.amount_due_cents - invoiceResult.data.amount_paid_cents);
  const guardians = (guardiansResult.data ?? []).filter((guardian) => Boolean(guardian.email));

  if (guardians.length === 0) {
    throw new Error("Geen ouder/verzorger met e-mailadres gevonden voor deze factuur.");
  }

  await throwOnError(
    supabase.from("message_outbox").insert(
      guardians.map((guardian) => ({
        tenant_id: tenantId,
        channel: "email",
        provider: "smtp",
        recipient_profile_id: guardian.profile_id,
        recipient_email: guardian.email,
        participant_id: invoiceResult.data.participant_id,
        enrollment_id: invoiceResult.data.enrollment_id,
        subject: `Betalingsherinnering ${invoiceResult.data.invoice_number}`,
        body: [
          `Hallo ${guardian.display_name ?? ""}`.trim() + ",",
          "",
          `Er staat nog ${formatMoneyText(remainingCents, invoiceResult.data.currency)} open voor ${invoiceResult.data.title}.`,
          invoiceResult.data.due_on ? `Vervaldatum: ${invoiceResult.data.due_on}.` : null,
          "",
          "Log in op het ouderportaal voor de actuele betaalstatus.",
          "",
          "NXTTRACK"
        ].filter(Boolean).join("\n"),
        status: "queued",
        delivery_status: "pending",
        render_context: {
          invoice: invoiceResult.data,
          remaining_cents: remainingCents
        },
        metadata: { source: "payment_reminder", invoice_id: invoiceId },
        created_by_profile_id: profileId
      }))
    )
  );

  await throwOnError(
    supabase.from("payment_events").insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider: "manual",
      event_type: "invoice_reminder_queued",
      payload: { recipients: guardians.length },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om betalingen te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidatePayments() {
  for (const path of ["/admin", "/admin/payments", "/admin/berichten", "/parent", "/parent/betalingen", "/parent/notificaties", "/parent/documenten"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function requiredDate(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function priceCents(formData: FormData, key: string) {
  const value = requiredString(formData, key);
  const parsed = Number.parseFloat(value.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} heeft geen geldig bedrag.`);
  }

  return Math.round(parsed * 100);
}

function formatMoneyText(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}
