"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { queueParentEventMessages } from "@/lib/communication/event-hooks";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;
const financeExportBucket = "tenant-documents";

type TenantSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type InvoiceNumberingRuleRow = {
  id: string;
  prefix: string;
  next_number: number;
  padding: number;
  period_mode: "manual" | "monthly" | "quarterly" | "yearly";
  due_days: number;
};

type InvoiceForPayment = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  currency: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  refunded_amount_cents?: number | null;
};

type FinanceRow = Record<string, string | number | boolean | null>;

export async function createManualInvoiceAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const issuedOn = requiredDate(formData, "issued_on");
  const rule = await getActiveInvoiceRule(supabase, tenantId);
  const invoiceNumber = optionalString(formData, "invoice_number") ?? generateInvoiceNumber(rule, issuedOn);
  const periodMode = enumValue(formData, "period_mode", ["manual", "monthly", "quarterly", "yearly"], rule?.period_mode ?? "manual");
  const period = resolvePeriod(periodMode, issuedOn, optionalDate(formData, "period_start"), optionalDate(formData, "period_end"));
  const dueOn = optionalDate(formData, "due_on") ?? addDays(issuedOn, rule?.due_days ?? 14);
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
      invoice_number: invoiceNumber,
      invoice_sequence: rule?.next_number ?? null,
      title: requiredString(formData, "title"),
      description: optionalString(formData, "description"),
      period_start: period.start,
      period_end: period.end,
      period_mode: periodMode,
      issued_on: issuedOn,
      due_on: dueOn,
      amount_due_cents: priceCents(formData, "amount"),
      currency: requiredString(formData, "currency").toUpperCase(),
      status: enumValue(formData, "status", ["draft", "open", "partially_paid", "paid", "overdue", "void"], "open"),
      collection_method: "manual",
      created_by_profile_id: profileId,
      metadata: { phase: "manual_payment" }
    })
  );

  if (rule && !optionalString(formData, "invoice_number")) {
    await throwOnError(
      supabase
        .from("invoice_numbering_rules")
        .update({ next_number: rule.next_number + 1 })
        .eq("tenant_id", tenantId)
        .eq("id", rule.id)
    );
  }

  revalidatePayments();
}

export async function updateInvoiceNumberingRuleAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const id = optionalString(formData, "id");
  const payload = {
    tenant_id: tenantId,
    rule_name: requiredString(formData, "rule_name"),
    prefix: requiredString(formData, "prefix").toUpperCase(),
    next_number: intValue(formData, "next_number", 1, 1, 999999999),
    padding: intValue(formData, "padding", 4, 2, 12),
    period_mode: enumValue(formData, "period_mode", ["manual", "monthly", "quarterly", "yearly"], "monthly"),
    due_days: intValue(formData, "due_days", 14, 0, 90),
    status: "active",
    metadata: { source: "admin_payment_rules" }
  };

  if (id) {
    await throwOnError(supabase.from("invoice_numbering_rules").update(payload).eq("tenant_id", tenantId).eq("id", id));
  } else {
    await throwOnError(supabase.from("invoice_numbering_rules").insert(payload));
  }

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

export async function recordManualRefundAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const invoiceId = requiredString(formData, "invoice_id");
  const invoice = await getInvoiceForPayment(supabase, tenantId, invoiceId);
  const amountCents = priceCents(formData, "amount");
  const refundable = Math.max(0, invoice.amount_paid_cents - (invoice.refunded_amount_cents ?? 0));

  if (amountCents > refundable) {
    throw new Error(`Refund mag niet hoger zijn dan reeds betaald min eerdere refunds (${formatMoneyText(refundable, invoice.currency)}).`);
  }

  await throwOnError(
    supabase.from("payment_refunds").insert({
      tenant_id: tenantId,
      invoice_id: invoice.id,
      payment_record_id: optionalString(formData, "payment_record_id"),
      enrollment_id: invoice.enrollment_id,
      participant_id: invoice.participant_id,
      provider: "manual",
      amount_cents: amountCents,
      currency: invoice.currency,
      status: enumValue(formData, "status", ["requested", "recorded", "processed", "failed", "cancelled"], "recorded"),
      reason: requiredString(formData, "reason"),
      refunded_on: optionalDate(formData, "refunded_on") ?? todayInput(),
      recorded_by_profile_id: profileId,
      metadata: { source: "admin_manual_refund" }
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
        period_start: optionalDate(formData, "period_start"),
        period_end: optionalDate(formData, "period_end"),
        period_mode: enumValue(formData, "period_mode", ["manual", "monthly", "quarterly", "yearly"], "manual"),
        due_on: optionalDate(formData, "due_on"),
        amount_due_cents: amountDueCents,
        status,
        corrected_at: new Date().toISOString(),
        corrected_by_profile_id: profileId,
        correction_reason: note,
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

export async function calculateOverdueInvoicesAction() {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const today = todayInput();
  const overdueResult = await supabase
    .from("invoices")
    .select("id, status, amount_due_cents, amount_paid_cents")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "partially_paid"])
    .lt("due_on", today);

  if (overdueResult.error) {
    throw new Error(overdueResult.error.message);
  }

  const overdueInvoices = (overdueResult.data ?? []).filter((invoice) => invoice.amount_paid_cents < invoice.amount_due_cents);

  if (overdueInvoices.length === 0) {
    revalidatePayments();
    return;
  }

  const invoiceIds = overdueInvoices.map((invoice) => invoice.id);

  await throwOnError(
    supabase
      .from("invoices")
      .update({
        status: "overdue",
        overdue_checked_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .in("id", invoiceIds)
  );

  await throwOnError(
    supabase.from("payment_events").insert(
      invoiceIds.map((invoiceId) => ({
        tenant_id: tenantId,
        invoice_id: invoiceId,
        provider: "manual",
        event_type: "invoice_marked_overdue",
        payload: { checked_on: today },
        created_by_profile_id: profileId
      }))
    )
  );

  revalidatePayments();
}

export async function queueInvoiceReminderAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const invoiceId = requiredString(formData, "invoice_id");
  const invoiceResult = await supabase
    .from("invoices")
    .select("id, enrollment_id, participant_id, invoice_number, title, amount_due_cents, amount_paid_cents, currency, due_on, status, reminder_count")
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .single();

  if (invoiceResult.error || !invoiceResult.data) {
    throw new Error(invoiceResult.error?.message ?? "Factuur niet gevonden.");
  }

  const remainingCents = Math.max(0, invoiceResult.data.amount_due_cents - invoiceResult.data.amount_paid_cents);
  const queued = await queueParentEventMessages(supabase, {
    tenantId,
    participantId: invoiceResult.data.participant_id,
    enrollmentId: invoiceResult.data.enrollment_id,
    eventKey: "payment_reminder",
    templateCode: "payment-reminder",
    context: {
      invoice: invoiceResult.data,
      invoice_number: invoiceResult.data.invoice_number,
      invoice_title: invoiceResult.data.title,
      remaining_amount: formatMoneyText(remainingCents, invoiceResult.data.currency),
      due_on: invoiceResult.data.due_on
    },
    sourceTable: "invoices",
    sourceRecordId: invoiceId,
    createdByProfileId: profileId,
    fallbackSubject: `Betalingsherinnering ${invoiceResult.data.invoice_number}`,
    fallbackBody: `Er staat nog ${formatMoneyText(remainingCents, invoiceResult.data.currency)} open voor ${invoiceResult.data.title}.`
  });

  if (queued.queued === 0) {
    throw new Error("Geen ouder/verzorger met e-mailadres gevonden of template mist verplichte variabelen.");
  }

  await throwOnError(
    supabase.from("payment_events").insert({
      tenant_id: tenantId,
      invoice_id: invoiceId,
      provider: "manual",
      event_type: "invoice_reminder_queued",
      payload: { recipients: queued.queued },
      created_by_profile_id: profileId
    })
  );

  await throwOnError(
    supabase
      .from("invoices")
      .update({
        reminder_count: ((invoiceResult.data as { reminder_count?: number }).reminder_count ?? 0) + 1,
        last_reminder_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", invoiceId)
  );

  revalidatePayments();
}

export async function updatePaymentProviderConfigAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const provider = enumValue(formData, "provider", ["manual", "mollie"], "manual");
  const status = enumValue(formData, "status", ["disabled", "configured", "active"], "disabled");

  if (provider === "mollie" && status === "active") {
    throw new Error("Mollie/iDEAL blijft voorbereid maar wordt pas geactiveerd nadat de handmatige flow betrouwbaar is goedgekeurd.");
  }

  await throwOnError(
    supabase
      .from("payment_provider_configs")
      .update({
        status,
        mode: enumValue(formData, "mode", ["test", "live"], "test"),
        display_name: requiredString(formData, "display_name"),
        external_profile_id: optionalString(formData, "external_profile_id"),
        capabilities: listValue(formData, "capabilities"),
        metadata: { source: "admin_provider_config", mollie_activation_guard: provider === "mollie" }
      })
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
  );

  revalidatePayments();
}

export async function createFinanceExportRequestAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("finance_export_requests").insert({
      tenant_id: tenantId,
      export_type: enumValue(formData, "export_type", ["invoices", "payments", "refunds", "ledger"], "ledger"),
      export_format: enumValue(formData, "export_format", ["csv", "json"], "csv"),
      period_start: optionalDate(formData, "period_start"),
      period_end: optionalDate(formData, "period_end"),
      status: "requested",
      requested_by_profile_id: profileId,
      metadata: { source: "admin_finance_export" }
    })
  );

  revalidatePayments();
}

export async function generateFinanceExportAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const requestId = requiredString(formData, "id");
  const requestResult = await supabase
    .from("finance_export_requests")
    .select("id, export_type, export_format, period_start, period_end")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .single();

  if (requestResult.error || !requestResult.data) {
    throw new Error(requestResult.error?.message ?? "Finance export niet gevonden.");
  }

  await supabase.from("finance_export_requests").update({ status: "processing", error_message: null }).eq("tenant_id", tenantId).eq("id", requestId);

  try {
    const request = requestResult.data as { id: string; export_type: string; export_format: "csv" | "json"; period_start: string | null; period_end: string | null };
    const rows = await buildFinanceRows(supabase, tenantId, request);
    const body = request.export_format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
    const contentType = request.export_format === "json" ? "application/json" : "text/csv";
    const filePath = `${tenantId}/finance/${request.export_type}-${request.id}.${request.export_format}`;
    const uploadResult = await createAdminClient().storage.from(financeExportBucket).upload(filePath, new Blob([body], { type: contentType }), {
      contentType,
      upsert: true
    });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    await throwOnError(
      supabase
        .from("finance_export_requests")
        .update({
          status: "ready",
          file_path: filePath,
          row_count: rows.length,
          completed_at: new Date().toISOString(),
          error_message: null,
          metadata: { source: "admin_finance_export", generated_format: request.export_format }
        })
        .eq("tenant_id", tenantId)
        .eq("id", requestId)
    );
  } catch (error) {
    await supabase
      .from("finance_export_requests")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Finance export genereren mislukt.",
        metadata: { source: "admin_finance_export", failure: "generation" }
      })
      .eq("tenant_id", tenantId)
      .eq("id", requestId);
    throw error;
  }

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
  for (const path of ["/admin", "/admin/payments", "/admin/berichten", "/admin/rapportages", "/parent", "/parent/betalingen", "/parent/notificaties", "/parent/documenten"]) {
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

function intValue(formData: FormData, key: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
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

async function getActiveInvoiceRule(supabase: TenantSupabaseClient, tenantId: string) {
  const result = await supabase
    .from("invoice_numbering_rules")
    .select("id, prefix, next_number, padding, period_mode, due_days")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data as InvoiceNumberingRuleRow | null) ?? null;
}

async function getInvoiceForPayment(supabase: TenantSupabaseClient, tenantId: string, invoiceId: string) {
  const result = await supabase
    .from("invoices")
    .select("id, enrollment_id, participant_id, currency, amount_due_cents, amount_paid_cents, refunded_amount_cents")
    .eq("tenant_id", tenantId)
    .eq("id", invoiceId)
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Factuur niet gevonden.");
  }

  return result.data as InvoiceForPayment;
}

function generateInvoiceNumber(rule: InvoiceNumberingRuleRow | null, issuedOn: string) {
  if (!rule) {
    return `INV-${issuedOn.slice(0, 4)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `${rule.prefix}-${issuedOn.slice(0, 4)}-${String(rule.next_number).padStart(rule.padding, "0")}`;
}

function resolvePeriod(mode: string, issuedOn: string, start: string | null, end: string | null) {
  if (mode === "manual") {
    return { start, end };
  }

  const issued = new Date(`${issuedOn}T00:00:00.000Z`);
  const periodStart = start ? new Date(`${start}T00:00:00.000Z`) : new Date(Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth(), 1));
  const months = mode === "quarterly" ? 3 : mode === "yearly" ? 12 : 1;
  const calculatedEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + months, 0));

  return {
    start: formatDateInput(periodStart),
    end: end ?? formatDateInput(calculatedEnd)
  };
}

function addDays(dateInput: string, days: number) {
  const date = new Date(`${dateInput}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateInput(date);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function listValue(formData: FormData, key: string) {
  return (optionalString(formData, key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

async function buildFinanceRows(
  supabase: TenantSupabaseClient,
  tenantId: string,
  request: { export_type: string; period_start: string | null; period_end: string | null }
): Promise<FinanceRow[]> {
  if (request.export_type === "invoices") {
    let query = supabase
      .from("invoices")
      .select("invoice_number, title, status, issued_on, due_on, period_start, period_end, amount_due_cents, amount_paid_cents, refunded_amount_cents, currency")
      .eq("tenant_id", tenantId)
      .order("issued_on", { ascending: true });

    query = applyDateRange(query, "issued_on", request.period_start, request.period_end);
    const result = await query;
    throwResultError(result.error);
    return ((result.data ?? []) as Array<Record<string, string | number | null>>).map((row) => ({
      ...row,
      open_amount_cents: Math.max(0, Number(row.amount_due_cents ?? 0) - Number(row.amount_paid_cents ?? 0))
    }));
  }

  if (request.export_type === "payments") {
    let query = supabase
      .from("payment_records")
      .select("provider, payment_method, status, received_on, amount_cents, currency, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    query = applyDateRange(query, "received_on", request.period_start, request.period_end);
    const result = await query;
    throwResultError(result.error);
    return (result.data ?? []) as FinanceRow[];
  }

  if (request.export_type === "refunds") {
    let query = supabase
      .from("payment_refunds")
      .select("provider, status, refunded_on, amount_cents, currency, reason, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });

    query = applyDateRange(query, "refunded_on", request.period_start, request.period_end);
    const result = await query;
    throwResultError(result.error);
    return (result.data ?? []) as FinanceRow[];
  }

  const [invoices, payments, refunds]: [FinanceRow[], FinanceRow[], FinanceRow[]] = await Promise.all([
    buildFinanceRows(supabase, tenantId, { ...request, export_type: "invoices" }),
    buildFinanceRows(supabase, tenantId, { ...request, export_type: "payments" }),
    buildFinanceRows(supabase, tenantId, { ...request, export_type: "refunds" })
  ]);

  return [
    ...invoices.map((row: FinanceRow) => ({ entry_type: "invoice", ...row })),
    ...payments.map((row: FinanceRow) => ({ entry_type: "payment", ...row })),
    ...refunds.map((row: FinanceRow) => ({ entry_type: "refund", ...row }))
  ];
}

function applyDateRange<Query>(query: Query, column: string, start: string | null, end: string | null): Query {
  let nextQuery = query as Query & { gte: (column: string, value: string) => Query; lte: (column: string, value: string) => Query };

  if (start) {
    nextQuery = nextQuery.gte(column, start) as typeof nextQuery;
  }

  if (end) {
    nextQuery = nextQuery.lte(column, end) as typeof nextQuery;
  }

  return nextQuery;
}

function throwResultError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);

  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}
