"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { queueParentEventMessages } from "@/lib/communication/event-hooks";
import { buildMollieSepaDebitPayload, type MollieSepaDebitPayload } from "@/lib/payments/payment-adapter";
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

type InvoiceForSepa = InvoiceForPayment & {
  invoice_number: string;
  title: string;
  status: string;
  due_on: string | null;
  collection_method: string;
};

type SepaMandateForRun = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  provider_customer_id: string | null;
  provider_mandate_id: string | null;
  mandate_reference: string;
  status: string;
};

type SepaCollectionRunForSubmit = {
  id: string;
  provider: "mollie" | "external";
  mode: "test" | "live";
  run_number: string;
  title: string;
  requested_collection_date: string;
  status: string;
  currency: string;
};

type SepaCollectionItemForSubmit = {
  id: string;
  collection_run_id: string;
  invoice_id: string;
  payment_record_id: string | null;
  mandate_id: string;
  enrollment_id: string;
  participant_id: string;
  amount_cents: number;
  currency: string;
  sequence_type: "first" | "recurring";
  status: string;
};

type MolliePaymentResponse = {
  id: string;
  status?: string;
  _links?: {
    checkout?: {
      href?: string;
    };
  };
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
      payment_method: enumValue(formData, "payment_method", ["manual_bank_transfer", "cash", "card_terminal", "ideal", "mollie", "direct_debit", "external"], "manual_bank_transfer"),
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

  await throwOnError(
    supabase
      .from("payment_provider_configs")
      .update({
        status,
        mode: enumValue(formData, "mode", ["test", "live"], "test"),
        display_name: requiredString(formData, "display_name"),
        external_profile_id: optionalString(formData, "external_profile_id"),
        capabilities: listValue(formData, "capabilities"),
        metadata: {
          source: "admin_provider_config",
          mollie_live_ready: provider === "mollie",
          secret_policy: provider === "mollie" ? "env_only_no_database_secret_storage" : "not_applicable"
        }
      })
      .eq("tenant_id", tenantId)
      .eq("provider", provider)
  );

  revalidatePayments();
}

export async function updateSepaCollectionSettingsAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const mollieConfigResult = await supabase
    .from("payment_provider_configs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("provider", "mollie")
    .eq("mode", enumValue(formData, "provider_mode", ["test", "live"], "test"))
    .maybeSingle();

  if (mollieConfigResult.error) {
    throw new Error(mollieConfigResult.error.message);
  }

  const payload = {
    tenant_id: tenantId,
    provider_config_id: (mollieConfigResult.data as { id: string } | null)?.id ?? null,
    status: enumValue(formData, "status", ["draft", "configured", "active", "paused", "disabled"], "configured"),
    mode: enumValue(formData, "mode", ["manual_review", "prepare_only", "submit_to_mollie"], "prepare_only"),
    creditor_name: optionalString(formData, "creditor_name"),
    creditor_reference: optionalString(formData, "creditor_reference"),
    default_collection_day: intValue(formData, "default_collection_day", 1, 1, 28),
    min_notice_days: intValue(formData, "min_notice_days", 5, 0, 30),
    mandate_intro: optionalString(formData, "mandate_intro"),
    parent_consent_text: optionalString(formData, "parent_consent_text"),
    metadata: {
      source: "admin_sepa_settings",
      provider: "mollie",
      secret_policy: "MOLLIE_API_KEY and MOLLIE_WEBHOOK_SECRET stay in environment"
    }
  };

  await throwOnError(supabase.from("sepa_collection_settings").upsert(payload, { onConflict: "tenant_id" }));

  revalidatePayments();
}

export async function upsertSepaMandateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const status = enumValue(formData, "status", ["draft", "pending_first_payment", "pending", "valid", "invalid", "revoked", "expired", "failed"], "draft");
  const revokedReason = optionalString(formData, "revoked_reason");

  if (["invalid", "revoked", "failed"].includes(status) && !revokedReason) {
    throw new Error("Een reden is verplicht bij ongeldig, ingetrokken of mislukt mandaat.");
  }

  const enrollmentResult = await supabase
    .from("enrollments")
    .select("id, participant_id")
    .eq("tenant_id", tenantId)
    .eq("id", enrollmentId)
    .single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    throw new Error(enrollmentResult.error?.message ?? "Inschrijving niet gevonden.");
  }

  const id = optionalString(formData, "id");
  const nowIso = new Date().toISOString();
  const payload = {
    tenant_id: tenantId,
    enrollment_id: enrollmentId,
    participant_id: enrollmentResult.data.participant_id,
    guardian_profile_id: optionalString(formData, "guardian_profile_id"),
    provider: "mollie",
    provider_customer_id: optionalString(formData, "provider_customer_id"),
    provider_mandate_id: optionalString(formData, "provider_mandate_id"),
    mandate_reference: requiredString(formData, "mandate_reference").toUpperCase(),
    account_holder_name: optionalString(formData, "account_holder_name"),
    iban_last4: optionalString(formData, "iban_last4")?.toUpperCase() ?? null,
    iban_country: optionalString(formData, "iban_country")?.toUpperCase() ?? null,
    status,
    consent_given_at: optionalDateTime(formData, "consent_given_on") ?? (status === "valid" ? nowIso : null),
    signed_at: optionalDateTime(formData, "signed_on") ?? (status === "valid" ? nowIso : null),
    valid_from: optionalDate(formData, "valid_from") ?? (status === "valid" ? todayInput() : null),
    revoked_at: status === "revoked" ? nowIso : null,
    revoked_reason: revokedReason,
    created_by_profile_id: profileId,
    metadata: {
      source: "admin_sepa_mandate",
      provider_path: "mollie_customer_mandate"
    }
  };

  let mandateId = id;

  if (id) {
    await throwOnError(supabase.from("sepa_mandates").update(payload).eq("tenant_id", tenantId).eq("id", id));
  } else {
    const insertResult = await supabase.from("sepa_mandates").insert(payload).select("id").single();

    if (insertResult.error || !insertResult.data) {
      throw new Error(insertResult.error?.message ?? "Mandaat aanmaken mislukt.");
    }

    mandateId = (insertResult.data as { id: string }).id;
  }

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      mandate_id: mandateId,
      event_type: id ? "mandate_updated" : "mandate_created",
      payload: { status, mandate_reference: payload.mandate_reference },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

export async function createSepaCollectionRunAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const requestedCollectionDate = requiredDate(formData, "requested_collection_date");
  const periodStart = optionalDate(formData, "period_start");
  const periodEnd = optionalDate(formData, "period_end");
  const currency = requiredString(formData, "currency").toUpperCase();
  const mode = enumValue(formData, "mode", ["test", "live"], "test");
  const title = requiredString(formData, "title");

  const [invoicesResult, mandatesResult, pendingItemsResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, enrollment_id, participant_id, invoice_number, title, status, due_on, amount_due_cents, amount_paid_cents, refunded_amount_cents, currency, collection_method")
      .eq("tenant_id", tenantId)
      .in("status", ["open", "partially_paid", "overdue"])
      .eq("currency", currency)
      .order("due_on", { ascending: true }),
    supabase
      .from("sepa_mandates")
      .select("id, enrollment_id, participant_id, provider_customer_id, provider_mandate_id, mandate_reference, status")
      .eq("tenant_id", tenantId)
      .eq("status", "valid"),
    supabase
      .from("sepa_collection_items")
      .select("invoice_id")
      .eq("tenant_id", tenantId)
      .in("status", ["queued", "pending", "submitted"])
  ]);

  throwResultError(invoicesResult.error);
  throwResultError(mandatesResult.error);
  throwResultError(pendingItemsResult.error);

  const pendingInvoiceIds = new Set(((pendingItemsResult.data ?? []) as Array<{ invoice_id: string }>).map((item) => item.invoice_id));
  const mandatesByEnrollment = new Map(((mandatesResult.data ?? []) as SepaMandateForRun[]).map((mandate) => [mandate.enrollment_id, mandate]));
  const candidates = ((invoicesResult.data ?? []) as InvoiceForSepa[])
    .filter((invoice) => !pendingInvoiceIds.has(invoice.id))
    .flatMap((invoice) => {
      const remaining = Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents - (invoice.refunded_amount_cents ?? 0));
      const mandate = mandatesByEnrollment.get(invoice.enrollment_id);

      return remaining > 0 && mandate?.provider_customer_id && mandate.provider_mandate_id ? [{ invoice, mandate, remaining }] : [];
    });

  if (candidates.length === 0) {
    throw new Error("Geen open facturen met geldig Mollie SEPA-mandaat gevonden.");
  }

  const runId = crypto.randomUUID();
  const runNumber = optionalString(formData, "run_number") ?? `SEPA-${requestedCollectionDate.replaceAll("-", "")}-${runId.slice(0, 6).toUpperCase()}`;

  await throwOnError(
    supabase.from("sepa_collection_runs").insert({
      id: runId,
      tenant_id: tenantId,
      provider: "mollie",
      mode,
      run_number: runNumber,
      title,
      period_start: periodStart,
      period_end: periodEnd,
      requested_collection_date: requestedCollectionDate,
      status: "ready",
      currency,
      created_by_profile_id: profileId,
      metadata: {
        source: "admin_sepa_run",
        selection: "open_partially_paid_overdue_with_valid_mandate",
        provider_path: "mollie_directdebit"
      }
    })
  );

  await throwOnError(
    supabase.from("sepa_collection_items").insert(
      candidates.map(({ invoice, mandate, remaining }) => ({
        tenant_id: tenantId,
        collection_run_id: runId,
        invoice_id: invoice.id,
        mandate_id: mandate.id,
        enrollment_id: invoice.enrollment_id,
        participant_id: invoice.participant_id,
        amount_cents: remaining,
        currency: invoice.currency,
        sequence_type: "recurring",
        status: "queued",
        scheduled_collection_date: requestedCollectionDate,
        metadata: {
          invoice_number: invoice.invoice_number,
          mandate_reference: mandate.mandate_reference
        }
      }))
    )
  );

  await throwOnError(
    supabase
      .from("invoices")
      .update({ collection_method: "sepa_direct_debit" })
      .eq("tenant_id", tenantId)
      .in("id", candidates.map(({ invoice }) => invoice.id))
  );

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      collection_run_id: runId,
      event_type: "collection_run_created",
      payload: { run_number: runNumber, invoice_count: candidates.length },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

export async function submitSepaCollectionRunAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const runId = requiredString(formData, "run_id");
  const run = await getSepaCollectionRun(supabase, tenantId, runId);

  if (!["ready", "draft"].includes(run.status)) {
    throw new Error("Alleen concept- of ready-incassobatches kunnen worden ingediend.");
  }

  const items = await getSepaCollectionItemsForSubmit(supabase, tenantId, runId);
  const queuedItems = items.filter((item) => item.status === "queued");

  if (queuedItems.length === 0) {
    throw new Error("Geen queued incassoregels gevonden.");
  }

  const mandateIds = [...new Set(queuedItems.map((item) => item.mandate_id))];
  const invoiceIds = [...new Set(queuedItems.map((item) => item.invoice_id))];
  const [mandatesResult, invoicesResult, settingsResult] = await Promise.all([
    supabase.from("sepa_mandates").select("id, enrollment_id, participant_id, provider_customer_id, provider_mandate_id, mandate_reference, status").eq("tenant_id", tenantId).in("id", mandateIds),
    supabase.from("invoices").select("id, invoice_number, title").eq("tenant_id", tenantId).in("id", invoiceIds),
    supabase.from("sepa_collection_settings").select("mode").eq("tenant_id", tenantId).maybeSingle()
  ]);

  throwResultError(mandatesResult.error);
  throwResultError(invoicesResult.error);
  throwResultError(settingsResult.error);

  const settingsMode = ((settingsResult.data as { mode?: string } | null)?.mode ?? "prepare_only") as "manual_review" | "prepare_only" | "submit_to_mollie";
  const mandates = new Map(((mandatesResult.data ?? []) as SepaMandateForRun[]).map((mandate) => [mandate.id, mandate]));
  const invoices = new Map(((invoicesResult.data ?? []) as Array<{ id: string; invoice_number: string; title: string }>).map((invoice) => [invoice.id, invoice]));
  const failures: string[] = [];

  for (const item of queuedItems) {
    const mandate = mandates.get(item.mandate_id);
    const invoice = invoices.get(item.invoice_id);

    if (!mandate?.provider_customer_id || !mandate.provider_mandate_id || mandate.status !== "valid") {
      failures.push(`Mandaat ontbreekt of is niet geldig voor item ${item.id}.`);
      await markSepaItemFailed(supabase, tenantId, item, "Mandaat ontbreekt of is niet geldig.", profileId);
      continue;
    }

    const payload = buildMollieSepaDebitPayload({
      tenantId,
      invoiceId: item.invoice_id,
      amountCents: item.amount_cents,
      currency: item.currency,
      description: invoice ? `${invoice.invoice_number} - ${invoice.title}` : `SEPA incasso ${run.run_number}`,
      customerId: mandate.provider_customer_id,
      mandateId: mandate.provider_mandate_id,
      sequenceType: item.sequence_type,
      webhookUrl: buildMollieWebhookUrl(),
      metadata: {
        tenant_id: tenantId,
        sepa_run_id: run.id,
        sepa_item_id: item.id,
        invoice_id: item.invoice_id,
        mandate_id: mandate.id
      }
    });

    try {
      const result = await createMolliePaymentOrPrepared(settingsMode, payload);
      const paymentRecordId = crypto.randomUUID();

      await throwOnError(
        supabase.from("payment_records").insert({
          id: paymentRecordId,
          tenant_id: tenantId,
          invoice_id: item.invoice_id,
          enrollment_id: item.enrollment_id,
          participant_id: item.participant_id,
          provider: "mollie",
          provider_payment_id: result.providerPaymentId,
          provider_checkout_url: result.checkoutUrl,
          payment_method: "direct_debit",
          amount_cents: item.amount_cents,
          currency: item.currency,
          status: "pending",
          recorded_by_profile_id: profileId,
          note: result.preparedOnly ? "SEPA incasso voorbereid; wacht op Mollie live-configuratie of handmatige uitkomst." : "SEPA incasso ingediend bij Mollie.",
          metadata: {
            source: "sepa_collection_run",
            prepared_only: result.preparedOnly,
            run_id: run.id,
            item_id: item.id,
            mollie_payload: payload
          }
        })
      );

      await throwOnError(
        supabase
          .from("sepa_collection_items")
          .update({
            payment_record_id: paymentRecordId,
            status: result.preparedOnly ? "pending" : "submitted",
            provider_payment_id: result.providerPaymentId,
            failure_reason: null,
            metadata: {
              source: "sepa_submit",
              prepared_only: result.preparedOnly,
              provider_status: result.providerStatus,
              provider_payment_id: result.providerPaymentId
            }
          })
          .eq("tenant_id", tenantId)
          .eq("id", item.id)
      );

      await throwOnError(
        supabase.from("sepa_incasso_events").insert({
          tenant_id: tenantId,
          mandate_id: mandate.id,
          collection_run_id: run.id,
          collection_item_id: item.id,
          event_type: result.preparedOnly ? "collection_item_prepared" : "collection_item_submitted",
          payload: { payment_record_id: paymentRecordId, provider_payment_id: result.providerPaymentId, prepared_only: result.preparedOnly },
          created_by_profile_id: profileId
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "SEPA item indienen mislukt.";
      failures.push(message);
      await markSepaItemFailed(supabase, tenantId, item, message, profileId);
    }
  }

  await throwOnError(
    supabase
      .from("sepa_collection_runs")
      .update({
        status: failures.length === queuedItems.length ? "failed" : failures.length > 0 ? "partially_failed" : "submitted",
        submitted_at: new Date().toISOString(),
        submitted_by_profile_id: profileId,
        metadata: {
          source: "sepa_submit",
          settings_mode: settingsMode,
          failure_count: failures.length,
          failures: failures.slice(0, 5)
        }
      })
      .eq("tenant_id", tenantId)
      .eq("id", run.id)
  );

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      collection_run_id: run.id,
      event_type: "collection_run_submitted",
      payload: { submitted_items: queuedItems.length, failures: failures.length, settings_mode: settingsMode },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

export async function recordSepaCollectionItemOutcomeAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const itemId = requiredString(formData, "item_id");
  const status = enumValue(formData, "status", ["paid", "failed", "cancelled"], "paid");
  const failureReason = optionalString(formData, "failure_reason");

  if (status !== "paid" && !failureReason) {
    throw new Error("Een reden is verplicht bij mislukt of geannuleerd.");
  }

  const itemResult = await supabase
    .from("sepa_collection_items")
    .select("id, collection_run_id, invoice_id, payment_record_id, mandate_id, status")
    .eq("tenant_id", tenantId)
    .eq("id", itemId)
    .single();

  if (itemResult.error || !itemResult.data) {
    throw new Error(itemResult.error?.message ?? "Incassoregel niet gevonden.");
  }

  const item = itemResult.data as { id: string; collection_run_id: string; invoice_id: string; payment_record_id: string | null; mandate_id: string; status: string };
  const providerPaymentId = optionalString(formData, "provider_payment_id");

  await throwOnError(
    supabase
      .from("sepa_collection_items")
      .update({
        status,
        provider_payment_id: providerPaymentId,
        processed_at: new Date().toISOString(),
        failure_reason: status === "paid" ? null : failureReason,
        metadata: { source: "admin_sepa_outcome", outcome: status }
      })
      .eq("tenant_id", tenantId)
      .eq("id", item.id)
  );

  if (item.payment_record_id) {
    await throwOnError(
      supabase
        .from("payment_records")
        .update({
          status,
          provider_payment_id: providerPaymentId,
          received_on: status === "paid" ? optionalDate(formData, "received_on") ?? todayInput() : null,
          note: status === "paid" ? "SEPA incasso betaald." : failureReason,
          metadata: { source: "admin_sepa_outcome", outcome: status }
        })
        .eq("tenant_id", tenantId)
        .eq("id", item.payment_record_id)
    );
  }

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      mandate_id: item.mandate_id,
      collection_run_id: item.collection_run_id,
      collection_item_id: item.id,
      event_type: `collection_item_${status}`,
      payload: { provider_payment_id: providerPaymentId, failure_reason: failureReason },
      created_by_profile_id: profileId
    })
  );

  await refreshSepaRunStatus(supabase, tenantId, item.collection_run_id);
  revalidatePayments();
}

export async function cancelSepaCollectionRunAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const runId = requiredString(formData, "run_id");
  const reason = requiredString(formData, "reason");
  const items = await getSepaCollectionItemsForSubmit(supabase, tenantId, runId);

  if (items.some((item) => item.status === "paid")) {
    throw new Error("Een incassobatch met betaalde regels kan niet volledig geannuleerd worden.");
  }

  await throwOnError(
    supabase
      .from("sepa_collection_items")
      .update({
        status: "cancelled",
        failure_reason: reason,
        processed_at: new Date().toISOString(),
        metadata: { source: "admin_sepa_cancel", reason }
      })
      .eq("tenant_id", tenantId)
      .eq("collection_run_id", runId)
      .in("status", ["queued", "pending", "submitted", "failed"])
  );

  const paymentRecordIds = items.map((item) => item.payment_record_id).filter((id): id is string => Boolean(id));

  if (paymentRecordIds.length > 0) {
    await throwOnError(
      supabase
        .from("payment_records")
        .update({ status: "cancelled", note: reason, metadata: { source: "admin_sepa_cancel" } })
        .eq("tenant_id", tenantId)
        .in("id", paymentRecordIds)
    );
  }

  await throwOnError(
    supabase
      .from("sepa_collection_runs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        metadata: { source: "admin_sepa_cancel", reason }
      })
      .eq("tenant_id", tenantId)
      .eq("id", runId)
  );

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      collection_run_id: runId,
      event_type: "collection_run_cancelled",
      payload: { reason },
      created_by_profile_id: profileId
    })
  );

  revalidatePayments();
}

export async function createFinanceExportRequestAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("finance_export_requests").insert({
      tenant_id: tenantId,
      export_type: enumValue(formData, "export_type", ["invoices", "payments", "refunds", "ledger", "sepa_collections"], "ledger"),
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

function optionalDateTime(formData: FormData, key: string) {
  const value = optionalDate(formData, key);

  return value ? new Date(`${value}T00:00:00.000Z`).toISOString() : null;
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

async function getSepaCollectionRun(supabase: TenantSupabaseClient, tenantId: string, runId: string) {
  const result = await supabase
    .from("sepa_collection_runs")
    .select("id, provider, mode, run_number, title, requested_collection_date, status, currency")
    .eq("tenant_id", tenantId)
    .eq("id", runId)
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "SEPA incassobatch niet gevonden.");
  }

  return result.data as SepaCollectionRunForSubmit;
}

async function getSepaCollectionItemsForSubmit(supabase: TenantSupabaseClient, tenantId: string, runId: string) {
  const result = await supabase
    .from("sepa_collection_items")
    .select("id, collection_run_id, invoice_id, payment_record_id, mandate_id, enrollment_id, participant_id, amount_cents, currency, sequence_type, status")
    .eq("tenant_id", tenantId)
    .eq("collection_run_id", runId)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return (result.data ?? []) as SepaCollectionItemForSubmit[];
}

async function createMolliePaymentOrPrepared(settingsMode: "manual_review" | "prepare_only" | "submit_to_mollie", payload: MollieSepaDebitPayload) {
  const apiKey = process.env.MOLLIE_API_KEY;
  const hasRealApiKey = Boolean(apiKey && !apiKey.startsWith("placeholder") && apiKey !== "placeholder_add_later");

  if (settingsMode !== "submit_to_mollie" || !hasRealApiKey) {
    return {
      providerPaymentId: `prepared_${crypto.randomUUID()}`,
      checkoutUrl: null,
      providerStatus: "prepared",
      preparedOnly: true
    };
  }

  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mollie SEPA betaling aanmaken mislukt (${response.status}): ${body.slice(0, 500)}`);
  }

  const payment = (await response.json()) as MolliePaymentResponse;

  return {
    providerPaymentId: payment.id,
    checkoutUrl: payment._links?.checkout?.href ?? null,
    providerStatus: payment.status ?? "pending",
    preparedOnly: false
  };
}

async function markSepaItemFailed(supabase: TenantSupabaseClient, tenantId: string, item: SepaCollectionItemForSubmit, failureReason: string, profileId: string) {
  await throwOnError(
    supabase
      .from("sepa_collection_items")
      .update({
        status: "failed",
        failure_reason: failureReason,
        processed_at: new Date().toISOString(),
        metadata: { source: "sepa_submit_failure", failure_reason: failureReason }
      })
      .eq("tenant_id", tenantId)
      .eq("id", item.id)
  );

  await throwOnError(
    supabase.from("sepa_incasso_events").insert({
      tenant_id: tenantId,
      collection_item_id: item.id,
      collection_run_id: item.collection_run_id,
      mandate_id: item.mandate_id,
      event_type: "collection_item_failed",
      payload: { failure_reason: failureReason },
      created_by_profile_id: profileId
    })
  );
}

async function refreshSepaRunStatus(supabase: TenantSupabaseClient, tenantId: string, runId: string) {
  const result = await supabase.from("sepa_collection_items").select("status").eq("tenant_id", tenantId).eq("collection_run_id", runId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  const statuses = ((result.data ?? []) as Array<{ status: string }>).map((row) => row.status);
  const terminal = statuses.filter((status) => ["paid", "failed", "cancelled", "skipped"].includes(status));
  const hasPaid = statuses.includes("paid");
  const hasFailed = statuses.some((status) => ["failed", "cancelled"].includes(status));
  const status = terminal.length === statuses.length ? (hasFailed ? (hasPaid ? "partially_failed" : "failed") : "processed") : "processing";

  await throwOnError(
    supabase
      .from("sepa_collection_runs")
      .update({
        status,
        completed_at: terminal.length === statuses.length ? new Date().toISOString() : null
      })
      .eq("tenant_id", tenantId)
      .eq("id", runId)
  );
}

function buildMollieWebhookUrl() {
  const explicitUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? process.env.E2E_BASE_URL;

  if (!explicitUrl) {
    return undefined;
  }

  return `${explicitUrl.replace(/\/$/, "")}/api/mollie/payments/webhook`;
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

  if (request.export_type === "sepa_collections") {
    let runsQuery = supabase
      .from("sepa_collection_runs")
      .select("id, run_number, title, status, requested_collection_date, invoice_count, total_amount_cents, currency, provider_batch_id, submitted_at, completed_at, created_at")
      .eq("tenant_id", tenantId)
      .order("requested_collection_date", { ascending: true });

    runsQuery = applyDateRange(runsQuery, "requested_collection_date", request.period_start, request.period_end);
    const runsResult = await runsQuery;
    throwResultError(runsResult.error);

    const runs = (runsResult.data ?? []) as Array<Record<string, string | number | null>>;
    const runIds = runs.map((run) => String(run.id));

    if (runIds.length === 0) {
      return [];
    }

    const itemsResult = await supabase
      .from("sepa_collection_items")
      .select("collection_run_id, invoice_id, amount_cents, currency, sequence_type, status, provider_payment_id, scheduled_collection_date, processed_at, failure_reason")
      .eq("tenant_id", tenantId)
      .in("collection_run_id", runIds)
      .order("created_at", { ascending: true });

    throwResultError(itemsResult.error);

    const runById = new Map(runs.map((run) => [String(run.id), run]));

    return ((itemsResult.data ?? []) as Array<Record<string, string | number | null>>).map((item) => {
      const run = runById.get(String(item.collection_run_id));

      return {
        run_number: run?.run_number ?? null,
        run_title: run?.title ?? null,
        run_status: run?.status ?? null,
        requested_collection_date: run?.requested_collection_date ?? null,
        invoice_id: item.invoice_id ?? null,
        amount_cents: item.amount_cents ?? 0,
        currency: item.currency ?? "EUR",
        sequence_type: item.sequence_type ?? null,
        item_status: item.status ?? null,
        provider_payment_id: item.provider_payment_id ?? null,
        scheduled_collection_date: item.scheduled_collection_date ?? null,
        processed_at: item.processed_at ?? null,
        failure_reason: item.failure_reason ?? null
      };
    });
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
