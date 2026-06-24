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
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: string;
  collection_method: string;
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

export type AdminPaymentsData = {
  programs: PaymentProgramRow[];
  participants: PaymentParticipantRow[];
  enrollments: PaymentEnrollmentRow[];
  subscriptionPlans: PaymentSubscriptionPlanRow[];
  invoices: InvoiceRow[];
  paymentRecords: PaymentRecordRow[];
  providerConfigs: PaymentProviderConfigRow[];
  paymentEvents: PaymentEventRow[];
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
    invoicesResult,
    paymentRecordsResult,
    providerConfigsResult,
    paymentEventsResult
  ] = await Promise.all([
    supabase.from("programs").select("id, name, code").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("participants").select("id, display_name, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("enrollments").select("id, participant_id, program_id, subscription_plan_id, status, started_on").eq("tenant_id", tenantId).order("started_on", { ascending: false }),
    supabase.from("subscription_plans").select("id, name, billing_interval, price_cents, currency, lesson_frequency_per_week, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase
      .from("invoices")
      .select("id, enrollment_id, participant_id, subscription_plan_id, invoice_number, title, description, period_start, period_end, issued_on, due_on, amount_due_cents, amount_paid_cents, currency, status, collection_method")
      .eq("tenant_id", tenantId)
      .order("issued_on", { ascending: false })
      .limit(100),
    supabase
      .from("payment_records")
      .select("id, invoice_id, enrollment_id, participant_id, provider, provider_payment_id, provider_checkout_url, payment_method, amount_cents, currency, status, received_on, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("payment_provider_configs").select("id, provider, mode, status, display_name, external_profile_id, capabilities").eq("tenant_id", tenantId).order("provider", { ascending: true }),
    supabase.from("payment_events").select("id, invoice_id, payment_record_id, provider, event_type, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25)
  ]);

  const errors = collectErrors({
    programs: programsResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    subscription_plans: subscriptionPlansResult.error,
    invoices: invoicesResult.error,
    payment_records: paymentRecordsResult.error,
    payment_provider_configs: providerConfigsResult.error,
    payment_events: paymentEventsResult.error
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
      invoices: asRows<InvoiceRow>(invoicesResult.data),
      paymentRecords: asRows<PaymentRecordRow>(paymentRecordsResult.data),
      providerConfigs: asRows<PaymentProviderConfigRow>(providerConfigsResult.data),
      paymentEvents: asRows<PaymentEventRow>(paymentEventsResult.data)
    }
  };
}

function createEmptyData(): AdminPaymentsData {
  return {
    programs: [],
    participants: [],
    enrollments: [],
    subscriptionPlans: [],
    invoices: [],
    paymentRecords: [],
    providerConfigs: [],
    paymentEvents: []
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
