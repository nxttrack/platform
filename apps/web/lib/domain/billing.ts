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
  participant_id: string | null;
  guardian_user_id: string | null;
  type: string;
  status: string;
  occurred_at: string;
  message: string;
};

export type BillingAdminData = TenantCoreData & {
  paymentPlans: PaymentPlanRow[];
  subscriptions: SubscriptionRow[];
  manualPayments: ManualPaymentRow[];
  billingEvents: BillingEventRow[];
};

export async function getBillingAdminData(): Promise<BillingAdminData> {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [plansResult, subscriptionsResult, paymentsResult, eventsResult] = await Promise.all([
    admin
      .from("payment_plans")
      .select("id, program_id, code, name, description, amount_cents, currency, billing_interval, billing_day, payment_terms_days, status, sort_order")
      .eq("tenant_id", core.tenant.id)
      .order("sort_order")
      .order("name"),
    admin
      .from("subscriptions")
      .select("id, participant_id, enrollment_id, guardian_user_id, payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents, currency, billing_interval, notes")
      .eq("tenant_id", core.tenant.id)
      .order("starts_on", { ascending: false }),
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, enrollment_id, guardian_user_id, amount_cents, currency, due_on, paid_on, status, reference, method, notes, recorded_by_user_id")
      .eq("tenant_id", core.tenant.id)
      .order("due_on", { ascending: false }),
    admin
      .from("billing_events")
      .select("id, subscription_id, manual_payment_id, participant_id, guardian_user_id, type, status, occurred_at, message")
      .eq("tenant_id", core.tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(80)
  ]);

  assertBillingResult(plansResult.error, "payment plans");
  assertBillingResult(subscriptionsResult.error, "subscriptions");
  assertBillingResult(paymentsResult.error, "manual payments");
  assertBillingResult(eventsResult.error, "billing events");

  return {
    ...core,
    paymentPlans: (plansResult.data ?? []) as PaymentPlanRow[],
    subscriptions: (subscriptionsResult.data ?? []) as SubscriptionRow[],
    manualPayments: (paymentsResult.data ?? []) as ManualPaymentRow[],
    billingEvents: (eventsResult.data ?? []) as BillingEventRow[]
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
