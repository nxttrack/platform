import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type PaymentProgramRow = {
  id: string;
  name: string;
  code: string;
};

export type PaymentParticipantRow = {
  id: string;
  display_name: string;
  status: string;
};

export type PaymentEnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  subscription_plan_id: string | null;
  status: string;
  started_on: string;
};

export type PaymentSubscriptionPlanRow = {
  id: string;
  name: string;
  billing_interval: string;
  price_cents: number;
  currency: string;
  lesson_frequency_per_week: number;
  status: string;
};

export type InvoiceRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  subscription_plan_id: string | null;
  invoice_number: string;
  title: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  issued_on: string;
  due_on: string | null;
  period_mode: string;
  reminder_count: number;
  last_reminder_at: string | null;
  overdue_checked_at: string | null;
  correction_reason: string | null;
  refunded_amount_cents: number;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: string;
  collection_method: string;
};

export type InvoiceNumberingRuleRow = {
  id: string;
  rule_name: string;
  prefix: string;
  next_number: number;
  padding: number;
  period_mode: string;
  due_days: number;
  status: string;
};

export type PaymentRecordRow = {
  id: string;
  invoice_id: string;
  enrollment_id: string;
  participant_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_url: string | null;
  payment_method: string;
  amount_cents: number;
  currency: string;
  status: string;
  received_on: string | null;
  note: string | null;
  created_at: string;
};

export type PaymentRefundRow = {
  id: string;
  invoice_id: string;
  payment_record_id: string | null;
  enrollment_id: string;
  participant_id: string;
  provider: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason: string | null;
  refunded_on: string | null;
  created_at: string;
};

export type FinanceExportRequestRow = {
  id: string;
  export_type: string;
  export_format: string;
  period_start: string | null;
  period_end: string | null;
  status: string;
  file_path: string | null;
  row_count: number | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type PaymentProviderConfigRow = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  display_name: string;
  external_profile_id: string | null;
  capabilities: string[];
};

export type PaymentEventRow = {
  id: string;
  invoice_id: string | null;
  payment_record_id: string | null;
  provider: string;
  event_type: string;
  created_at: string;
};

export type SepaCollectionSettingsRow = {
  id: string;
  provider_config_id: string | null;
  status: string;
  mode: string;
  creditor_name: string | null;
  creditor_reference: string | null;
  default_collection_day: number;
  min_notice_days: number;
  mandate_intro: string | null;
  parent_consent_text: string | null;
};

export type SepaMandateRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  guardian_profile_id: string | null;
  provider: string;
  provider_customer_id: string | null;
  provider_mandate_id: string | null;
  mandate_reference: string;
  account_holder_name: string | null;
  iban_last4: string | null;
  iban_country: string | null;
  status: string;
  consent_given_at: string | null;
  signed_at: string | null;
  valid_from: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
};

export type SepaCollectionRunRow = {
  id: string;
  provider: string;
  mode: string;
  run_number: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  requested_collection_date: string;
  status: string;
  invoice_count: number;
  total_amount_cents: number;
  currency: string;
  provider_batch_id: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type SepaCollectionItemRow = {
  id: string;
  collection_run_id: string;
  invoice_id: string;
  payment_record_id: string | null;
  mandate_id: string;
  enrollment_id: string;
  participant_id: string;
  amount_cents: number;
  currency: string;
  sequence_type: string;
  status: string;
  provider_payment_id: string | null;
  scheduled_collection_date: string | null;
  processed_at: string | null;
  failure_reason: string | null;
  created_at: string;
};

export type SepaIncassoEventRow = {
  id: string;
  mandate_id: string | null;
  collection_run_id: string | null;
  collection_item_id: string | null;
  event_type: string;
  created_at: string;
};

export type PaymentBatchRow = {
  id: string;
  batch_number: string;
  batch_type: string;
  title: string;
  description: string | null;
  status: string;
  payment_method: string;
  period_start: string | null;
  period_end: string | null;
  due_on: string | null;
  currency: string;
  item_count: number;
  ready_item_count: number;
  exception_item_count: number;
  total_amount_cents: number;
  approved_at: string | null;
  processed_at: string | null;
  created_at: string;
};

export type PaymentBatchItemRow = {
  id: string;
  payment_batch_id: string;
  enrollment_id: string | null;
  participant_id: string | null;
  subscription_plan_id: string | null;
  guardian_profile_id: string | null;
  invoice_id: string | null;
  payment_record_id: string | null;
  source_type: string;
  source_id: string | null;
  title: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  warning_codes: string[];
  blocker_codes: string[];
  exception_message: string | null;
  created_at: string;
};

export type AdminPaymentsData = {
  programs: PaymentProgramRow[];
  participants: PaymentParticipantRow[];
  enrollments: PaymentEnrollmentRow[];
  subscriptionPlans: PaymentSubscriptionPlanRow[];
  invoiceNumberingRules: InvoiceNumberingRuleRow[];
  invoices: InvoiceRow[];
  paymentRecords: PaymentRecordRow[];
  paymentRefunds: PaymentRefundRow[];
  providerConfigs: PaymentProviderConfigRow[];
  paymentEvents: PaymentEventRow[];
  financeExports: FinanceExportRequestRow[];
  sepaSettings: SepaCollectionSettingsRow | null;
  sepaMandates: SepaMandateRow[];
  sepaCollectionRuns: SepaCollectionRunRow[];
  sepaCollectionItems: SepaCollectionItemRow[];
  sepaIncassoEvents: SepaIncassoEventRow[];
  paymentBatches: PaymentBatchRow[];
  paymentBatchItems: PaymentBatchItemRow[];
};

export type AdminPaymentsSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminPaymentsData;
  errors: string[];
};

export async function getAdminPaymentsSnapshot(): Promise<AdminPaymentsSnapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor betalingen."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const [
    programsResult,
    participantsResult,
    enrollmentsResult,
    subscriptionPlansResult,
    invoiceNumberingRulesResult,
    invoicesResult,
    paymentRecordsResult,
    paymentRefundsResult,
    providerConfigsResult,
    paymentEventsResult,
    financeExportsResult,
    sepaSettingsResult,
    sepaMandatesResult,
    sepaCollectionRunsResult,
    sepaCollectionItemsResult,
    sepaIncassoEventsResult,
    paymentBatchesResult,
    paymentBatchItemsResult
  ] = await Promise.all([
    supabase.from("programs").select("id, name, code").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("participants").select("id, display_name, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("enrollments").select("id, participant_id, program_id, subscription_plan_id, status, started_on").eq("tenant_id", tenantId).order("started_on", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, billing_interval, price_cents, currency, lesson_frequency_per_week, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("invoice_numbering_rules").select("id, rule_name, prefix, next_number, padding, period_mode, due_days, status").eq("tenant_id", tenantId).order("status", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, enrollment_id, participant_id, subscription_plan_id, invoice_number, title, description, period_start, period_end, issued_on, due_on, period_mode, reminder_count, last_reminder_at, overdue_checked_at, correction_reason, refunded_amount_cents, amount_due_cents, amount_paid_cents, currency, status, collection_method")
      .eq("tenant_id", tenantId)
      .order("issued_on", { ascending: false })
      .limit(100),
    supabase
      .from("payment_records")
      .select("id, invoice_id, enrollment_id, participant_id, provider, provider_payment_id, provider_checkout_url, payment_method, amount_cents, currency, status, received_on, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("payment_refunds")
      .select("id, invoice_id, payment_record_id, enrollment_id, participant_id, provider, amount_cents, currency, status, reason, refunded_on, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("payment_provider_configs").select("id, provider, mode, status, display_name, external_profile_id, capabilities").eq("tenant_id", tenantId).order("provider", { ascending: true }),
    supabase.from("payment_events").select("id, invoice_id, payment_record_id, provider, event_type, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25),
    supabase
      .from("finance_export_requests")
      .select("id, export_type, export_format, period_start, period_end, status, file_path, row_count, completed_at, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("sepa_collection_settings")
      .select("id, provider_config_id, status, mode, creditor_name, creditor_reference, default_collection_day, min_notice_days, mandate_intro, parent_consent_text")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("sepa_mandates")
      .select("id, enrollment_id, participant_id, guardian_profile_id, provider, provider_customer_id, provider_mandate_id, mandate_reference, account_holder_name, iban_last4, iban_country, status, consent_given_at, signed_at, valid_from, revoked_at, revoked_reason, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sepa_collection_runs")
      .select("id, provider, mode, run_number, title, period_start, period_end, requested_collection_date, status, invoice_count, total_amount_cents, currency, provider_batch_id, submitted_at, completed_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("sepa_collection_items")
      .select("id, collection_run_id, invoice_id, payment_record_id, mandate_id, enrollment_id, participant_id, amount_cents, currency, sequence_type, status, provider_payment_id, scheduled_collection_date, processed_at, failure_reason, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("sepa_incasso_events")
      .select("id, mandate_id, collection_run_id, collection_item_id, event_type, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("payment_batches")
      .select("id, batch_number, batch_type, title, description, status, payment_method, period_start, period_end, due_on, currency, item_count, ready_item_count, exception_item_count, total_amount_cents, approved_at, processed_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("payment_batch_items")
      .select("id, payment_batch_id, enrollment_id, participant_id, subscription_plan_id, guardian_profile_id, invoice_id, payment_record_id, source_type, source_id, title, description, amount_cents, currency, status, warning_codes, blocker_codes, exception_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);

  const errors = collectErrors({
    programs: programsResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    subscription_plans: subscriptionPlansResult.error,
    invoice_numbering_rules: invoiceNumberingRulesResult.error,
    invoices: invoicesResult.error,
    payment_records: paymentRecordsResult.error,
    payment_refunds: paymentRefundsResult.error,
    payment_provider_configs: providerConfigsResult.error,
    payment_events: paymentEventsResult.error,
    finance_export_requests: financeExportsResult.error,
    sepa_collection_settings: sepaSettingsResult.error,
    sepa_mandates: sepaMandatesResult.error,
    sepa_collection_runs: sepaCollectionRunsResult.error,
    sepa_collection_items: sepaCollectionItemsResult.error,
    sepa_incasso_events: sepaIncassoEventsResult.error,
    payment_batches: paymentBatchesResult.error,
    payment_batch_items: paymentBatchItemsResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      programs: asRows<PaymentProgramRow>(programsResult.data),
      participants: asRows<PaymentParticipantRow>(participantsResult.data),
      enrollments: asRows<PaymentEnrollmentRow>(enrollmentsResult.data),
      subscriptionPlans: asRows<PaymentSubscriptionPlanRow>(subscriptionPlansResult.data),
      invoiceNumberingRules: asRows<InvoiceNumberingRuleRow>(invoiceNumberingRulesResult.data),
      invoices: asRows<InvoiceRow>(invoicesResult.data),
      paymentRecords: asRows<PaymentRecordRow>(paymentRecordsResult.data),
      paymentRefunds: asRows<PaymentRefundRow>(paymentRefundsResult.data),
      providerConfigs: asRows<PaymentProviderConfigRow>(providerConfigsResult.data),
      paymentEvents: asRows<PaymentEventRow>(paymentEventsResult.data),
      financeExports: asRows<FinanceExportRequestRow>(financeExportsResult.data),
      sepaSettings: (sepaSettingsResult.data as SepaCollectionSettingsRow | null) ?? null,
      sepaMandates: asRows<SepaMandateRow>(sepaMandatesResult.data),
      sepaCollectionRuns: asRows<SepaCollectionRunRow>(sepaCollectionRunsResult.data),
      sepaCollectionItems: asRows<SepaCollectionItemRow>(sepaCollectionItemsResult.data),
      sepaIncassoEvents: asRows<SepaIncassoEventRow>(sepaIncassoEventsResult.data),
      paymentBatches: asRows<PaymentBatchRow>(paymentBatchesResult.data),
      paymentBatchItems: asRows<PaymentBatchItemRow>(paymentBatchItemsResult.data)
    }
  };
}

function createEmptyData(): AdminPaymentsData {
  return {
    programs: [],
    participants: [],
    enrollments: [],
    subscriptionPlans: [],
    invoiceNumberingRules: [],
    invoices: [],
    paymentRecords: [],
    paymentRefunds: [],
    providerConfigs: [],
    paymentEvents: [],
    financeExports: [],
    sepaSettings: null,
    sepaMandates: [],
    sepaCollectionRuns: [],
    sepaCollectionItems: [],
    sepaIncassoEvents: [],
    paymentBatches: [],
    paymentBatchItems: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
