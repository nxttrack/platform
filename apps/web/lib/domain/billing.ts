import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantCoreData, type TenantCoreData } from "./core";

export type PaymentPlanRow = {
  id: string;
  program_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  amount_cents: number;
  refunded_cents: number;
  chargeback_cents: number;
  currency: string;
  billing_interval: string;
  billing_day: number | null;
  payment_terms_days: number;
  status: string;
  sort_order: number;
};

export type SubscriptionRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  guardian_user_id: string | null;
  payment_plan_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
  next_due_on: string | null;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  collection_method: string;
  provider_config_id: string | null;
  billing_provider_customer_id: string | null;
  billing_mandate_id: string | null;
  billing_anchor_day: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  lifecycle_status_reason: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  notes: string | null;
};

export type ManualPaymentRow = {
  id: string;
  subscription_id: string;
  participant_id: string;
  enrollment_id: string;
  guardian_user_id: string | null;
  amount_cents: number;
  currency: string;
  due_on: string;
  paid_on: string | null;
  status: string;
  reference: string | null;
  method: string | null;
  notes: string | null;
  recorded_by_user_id: string | null;
};

export type BillingEventRow = {
  id: string;
  subscription_id: string | null;
  manual_payment_id: string | null;
  payment_session_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  type: string;
  status: string;
  occurred_at: string;
  message: string;
};

export type BillingProviderConfigRow = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  display_name: string;
  secret_reference: string | null;
  webhook_secret_reference: string | null;
  public_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type PaymentSessionRow = {
  id: string;
  provider_config_id: string | null;
  subscription_id: string | null;
  manual_payment_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  provider: string;
  provider_session_id: string | null;
  sequence_type: string;
  billing_provider_customer_id: string | null;
  billing_mandate_id: string | null;
  collection_attempt_id: string | null;
  consent_terms_version: string | null;
  consent_initiated_at: string | null;
  consent_initiated_by_user_id: string | null;
  idempotency_key: string | null;
  checkout_url: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  return_url: string | null;
  webhook_received_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingProviderCustomerRow = {
  id: string;
  provider_config_id: string;
  guardian_user_id: string | null;
  provider: string;
  provider_customer_id: string;
  status: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingMandateRow = {
  id: string;
  provider_config_id: string;
  provider_customer_id: string;
  guardian_user_id: string | null;
  provider: string;
  provider_mandate_id: string;
  method: string;
  status: string;
  signature_date: string | null;
  mandate_reference: string | null;
  account_holder: string | null;
  account_last4: string | null;
  consent_source: string;
  consent_terms_version: string | null;
  consent_recorded_at: string | null;
  revoked_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingCollectionAttemptRow = {
  id: string;
  provider_config_id: string;
  subscription_id: string;
  manual_payment_id: string;
  billing_provider_customer_id: string;
  billing_mandate_id: string;
  guardian_user_id: string | null;
  sequence_type: string;
  attempt_number: number;
  status: string;
  scheduled_for: string;
  prenotified_at: string | null;
  prenotification_id: string | null;
  prenotification_delivery_status: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  provider_payment_id: string | null;
  idempotency_key: string;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingRefundRow = {
  id: string;
  provider_config_id: string;
  payment_session_id: string;
  manual_payment_id: string;
  participant_id: string | null;
  guardian_user_id: string | null;
  provider_payment_id: string;
  provider_refund_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  description: string;
  requested_at: string;
  completed_at: string | null;
  last_synced_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

export type BillingChargebackRow = {
  id: string;
  provider_config_id: string;
  payment_session_id: string;
  manual_payment_id: string;
  participant_id: string | null;
  guardian_user_id: string | null;
  provider_payment_id: string;
  provider_chargeback_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  reason_code: string | null;
  occurred_at: string;
  reversed_at: string | null;
  last_synced_at: string;
};

export type PaymentProviderEventRow = {
  id: string;
  provider_config_id: string | null;
  payment_session_id: string | null;
  manual_payment_id: string | null;
  provider: string;
  provider_event_id: string | null;
  event_type: string;
  processing_status: string;
  payload: Record<string, unknown>;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
};

export type BillingInvoiceRow = {
  id: string;
  subscription_id: string | null;
  manual_payment_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  invoice_number: string | null;
  status: string;
  issued_on: string | null;
  due_on: string | null;
  paid_on: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  export_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingInvoiceLineRow = {
  id: string;
  invoice_id: string;
  manual_payment_id: string | null;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  tax_rate_basis_points: number;
  total_cents: number;
  sort_order: number;
};

export type BillingExportBatchRow = {
  id: string;
  export_key: string;
  export_type: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  file_path: string | null;
  generated_by_user_id: string | null;
  generated_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingAdminData = TenantCoreData & {
  providerConfigs: BillingProviderConfigRow[];
  providerCustomers: BillingProviderCustomerRow[];
  mandates: BillingMandateRow[];
  collectionAttempts: BillingCollectionAttemptRow[];
  refunds: BillingRefundRow[];
  chargebacks: BillingChargebackRow[];
  paymentPlans: PaymentPlanRow[];
  subscriptions: SubscriptionRow[];
  manualPayments: ManualPaymentRow[];
  billingEvents: BillingEventRow[];
  paymentSessions: PaymentSessionRow[];
  providerEvents: PaymentProviderEventRow[];
  invoices: BillingInvoiceRow[];
  invoiceLines: BillingInvoiceLineRow[];
  exportBatches: BillingExportBatchRow[];
};

export async function getBillingAdminData(): Promise<BillingAdminData> {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [providerConfigsResult, providerCustomersResult, mandatesResult, collectionAttemptsResult, refundsResult, chargebacksResult, plansResult, subscriptionsResult, paymentsResult, eventsResult, paymentSessionsResult, providerEventsResult, invoicesResult, exportBatchesResult] = await Promise.all([
    admin
      .from("billing_provider_configs")
      .select("id, provider, mode, status, display_name, secret_reference, webhook_secret_reference, public_config, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("provider")
      .order("mode"),
    admin
      .from("billing_provider_customers")
      .select("id, provider_config_id, guardian_user_id, provider, provider_customer_id, status, last_synced_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("billing_mandates")
      .select("id, provider_config_id, provider_customer_id, guardian_user_id, provider, provider_mandate_id, method, status, signature_date, mandate_reference, account_holder, account_last4, consent_source, consent_terms_version, consent_recorded_at, revoked_at, last_synced_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("billing_collection_attempts")
      .select("id, provider_config_id, subscription_id, manual_payment_id, billing_provider_customer_id, billing_mandate_id, guardian_user_id, sequence_type, attempt_number, status, scheduled_for, prenotified_at, prenotification_id, prenotification_delivery_status, initiated_at, completed_at, provider_payment_id, idempotency_key, failure_code, failure_message, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("billing_refunds")
      .select("id, provider_config_id, payment_session_id, manual_payment_id, participant_id, guardian_user_id, provider_payment_id, provider_refund_id, amount_cents, currency, status, description, requested_at, completed_at, last_synced_at, failure_code, failure_message")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("billing_chargebacks")
      .select("id, provider_config_id, payment_session_id, manual_payment_id, participant_id, guardian_user_id, provider_payment_id, provider_chargeback_id, amount_cents, currency, status, reason_code, occurred_at, reversed_at, last_synced_at")
      .eq("tenant_id", core.tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(80),
    admin
      .from("payment_plans")
      .select("id, program_id, code, name, description, amount_cents, currency, billing_interval, billing_day, payment_terms_days, status, sort_order")
      .eq("tenant_id", core.tenant.id)
      .order("sort_order")
      .order("name"),
    admin
      .from("subscriptions")
      .select("id, participant_id, enrollment_id, guardian_user_id, payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents, currency, billing_interval, collection_method, provider_config_id, billing_provider_customer_id, billing_mandate_id, billing_anchor_day, current_period_start, current_period_end, lifecycle_status_reason, paused_at, cancelled_at, completed_at, notes")
      .eq("tenant_id", core.tenant.id)
      .order("starts_on", { ascending: false }),
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, enrollment_id, guardian_user_id, amount_cents, refunded_cents, chargeback_cents, currency, due_on, paid_on, status, reference, method, notes, recorded_by_user_id")
      .eq("tenant_id", core.tenant.id)
      .order("due_on", { ascending: false }),
    admin
      .from("billing_events")
      .select("id, subscription_id, manual_payment_id, payment_session_id, participant_id, guardian_user_id, type, status, occurred_at, message")
      .eq("tenant_id", core.tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(80),
    admin
      .from("payment_sessions")
      .select("id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, provider, provider_session_id, sequence_type, billing_provider_customer_id, billing_mandate_id, collection_attempt_id, consent_terms_version, consent_initiated_at, consent_initiated_by_user_id, idempotency_key, checkout_url, amount_cents, currency, status, failure_code, failure_message, return_url, webhook_received_at, expires_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("payment_provider_events")
      .select("id, provider_config_id, payment_session_id, manual_payment_id, provider, provider_event_id, event_type, processing_status, payload, error_message, received_at, processed_at, created_at")
      .eq("tenant_id", core.tenant.id)
      .order("received_at", { ascending: false })
      .limit(80),
    admin
      .from("billing_invoices")
      .select("id, subscription_id, manual_payment_id, participant_id, guardian_user_id, invoice_number, status, issued_on, due_on, paid_on, subtotal_cents, tax_cents, total_cents, currency, export_status, notes, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("billing_export_batches")
      .select("id, export_key, export_type, status, period_start, period_end, row_count, file_path, generated_by_user_id, generated_at, error_message, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(40)
  ]);

  assertBillingResult(providerConfigsResult.error, "billing provider configs");
  assertBillingResult(providerCustomersResult.error, "billing provider customers");
  assertBillingResult(mandatesResult.error, "billing mandates");
  assertBillingResult(collectionAttemptsResult.error, "billing collection attempts");
  assertBillingResult(refundsResult.error, "billing refunds");
  assertBillingResult(chargebacksResult.error, "billing chargebacks");
  assertBillingResult(plansResult.error, "payment plans");
  assertBillingResult(subscriptionsResult.error, "subscriptions");
  assertBillingResult(paymentsResult.error, "manual payments");
  assertBillingResult(eventsResult.error, "billing events");
  assertBillingResult(paymentSessionsResult.error, "payment sessions");
  assertBillingResult(providerEventsResult.error, "payment provider events");
  assertBillingResult(invoicesResult.error, "billing invoices");
  assertBillingResult(exportBatchesResult.error, "billing export batches");

  const invoices = (invoicesResult.data ?? []) as BillingInvoiceRow[];
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const invoiceLinesResult =
    invoiceIds.length > 0
      ? await admin
          .from("billing_invoice_lines")
          .select("id, invoice_id, manual_payment_id, description, quantity, unit_amount_cents, tax_rate_basis_points, total_cents, sort_order")
          .eq("tenant_id", core.tenant.id)
          .in("invoice_id", invoiceIds)
          .order("sort_order")
      : { data: [], error: null };

  assertBillingResult(invoiceLinesResult.error, "billing invoice lines");

  return {
    ...core,
    providerConfigs: (providerConfigsResult.data ?? []) as BillingProviderConfigRow[],
    providerCustomers: (providerCustomersResult.data ?? []) as BillingProviderCustomerRow[],
    mandates: (mandatesResult.data ?? []) as BillingMandateRow[],
    collectionAttempts: (collectionAttemptsResult.data ?? []) as BillingCollectionAttemptRow[],
    refunds: (refundsResult.data ?? []) as BillingRefundRow[],
    chargebacks: (chargebacksResult.data ?? []) as BillingChargebackRow[],
    paymentPlans: (plansResult.data ?? []) as PaymentPlanRow[],
    subscriptions: (subscriptionsResult.data ?? []) as SubscriptionRow[],
    manualPayments: (paymentsResult.data ?? []) as ManualPaymentRow[],
    billingEvents: (eventsResult.data ?? []) as BillingEventRow[],
    paymentSessions: (paymentSessionsResult.data ?? []) as PaymentSessionRow[],
    providerEvents: (providerEventsResult.data ?? []) as PaymentProviderEventRow[],
    invoices,
    invoiceLines: (invoiceLinesResult.data ?? []) as BillingInvoiceLineRow[],
    exportBatches: (exportBatchesResult.data ?? []) as BillingExportBatchRow[]
  };
}

export function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}

export function isPaymentOverdue(payment: Pick<ManualPaymentRow, "status" | "due_on">) {
  return payment.status !== "paid" && payment.status !== "waived" && payment.status !== "cancelled" && new Date(payment.due_on).getTime() < startOfToday().getTime();
}

function startOfToday() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

function assertBillingResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
