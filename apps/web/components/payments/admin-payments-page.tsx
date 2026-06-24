import type { ReactNode } from "react";
import { Banknote, CircleDollarSign, CreditCard, FileText } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { createManualInvoiceAction, recordManualPaymentAction } from "@/lib/payments/admin-payments-actions";
import type {
  AdminPaymentsData,
  AdminPaymentsSnapshot,
  InvoiceRow,
  PaymentEnrollmentRow,
  PaymentEventRow,
  PaymentParticipantRow,
  PaymentProgramRow,
  PaymentProviderConfigRow,
  PaymentRecordRow,
  PaymentSubscriptionPlanRow
} from "@/lib/payments/admin-payments-read-model";

type AdminPaymentsPageProps = {
  snapshot: AdminPaymentsSnapshot;
};

type LookupMaps = {
  programs: Map<string, PaymentProgramRow>;
  participants: Map<string, PaymentParticipantRow>;
  enrollments: Map<string, PaymentEnrollmentRow>;
  subscriptionPlans: Map<string, PaymentSubscriptionPlanRow>;
  paymentRecordsByInvoice: Map<string, PaymentRecordRow[]>;
};

export function AdminPaymentsPage({ snapshot }: AdminPaymentsPageProps) {
  const lookups = buildLookups(snapshot.data);
  const openAmount = snapshot.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0);
  const paidAmount = snapshot.data.paymentRecords.filter((payment) => ["recorded", "paid"].includes(payment.status)).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const manualProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "manual");
  const mollieProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "mollie");

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Handmatig eerst</StatusPill>}
        kicker="Backoffice - betalingen"
        subtitle="Handmatige betaalstatus eerst. Abonnementen blijven product- en facturatieconfiguratie; facturen en betalingen staan los van niveau of badje."
        title="Betalingen"
      />
      {snapshot.status === "ready" ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={<FileText className="h-5 w-5" />} label="Facturen" value={snapshot.data.invoices.length.toString()} detail="handmatig eerst" />
            <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Openstaand" value={formatMoney(openAmount, "EUR")} detail="nog te betalen" />
            <MetricCard icon={<Banknote className="h-5 w-5" />} label="Geregistreerd" value={formatMoney(paidAmount, "EUR")} detail="handmatige betalingen" />
            <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Mollie" value={mollieProvider?.status ?? "disabled"} detail="adapter voorbereid" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <SectionHeader title="Nieuwe handmatige factuur" count={snapshot.data.enrollments.length} />
              <ManualInvoiceForm data={snapshot.data} />
            </Card>

            <Card>
              <SectionHeader title="Betaalproviders" count={snapshot.data.providerConfigs.length} />
              <div className="grid gap-3">
                <ProviderCard provider={manualProvider} fallback="Handmatige betalingen" />
                <ProviderCard provider={mollieProvider} fallback="Mollie/iDEAL voorbereiding" />
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader title="Facturen en betalingen" count={snapshot.data.invoices.length} />
            <div className="grid gap-4">
              {snapshot.data.invoices.length === 0 ? <EmptyState>Nog geen facturen gevonden.</EmptyState> : null}
              {snapshot.data.invoices.map((invoice) => (
                <InvoiceCard key={invoice.id} invoice={invoice} lookups={lookups} />
              ))}
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
            <Card>
              <SectionHeader title="Laatste betalingen" count={snapshot.data.paymentRecords.length} />
              <div className="grid gap-3">
                {snapshot.data.paymentRecords.length === 0 ? <EmptyState>Nog geen betalingen geregistreerd.</EmptyState> : null}
                {snapshot.data.paymentRecords.map((payment) => (
                  <PaymentRecordRowView key={payment.id} lookups={lookups} payment={payment} />
                ))}
              </div>
            </Card>

            <Card>
              <SectionHeader title="Betaalgebeurtenissen" count={snapshot.data.paymentEvents.length} />
              <div className="grid gap-3">
                {snapshot.data.paymentEvents.length === 0 ? <EmptyState>Nog geen betaalgebeurtenissen.</EmptyState> : null}
                {snapshot.data.paymentEvents.map((event) => (
                  <PaymentEventRowView key={event.id} event={event} />
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : (
        <PaymentsStatusPanel snapshot={snapshot} />
      )}
    </div>
  );
}

function ManualInvoiceForm({ data }: { data: AdminPaymentsData }) {
  const lookups = buildLookups(data);
  const enrollmentOptions = data.enrollments.map((enrollment) => {
    const participant = lookups.participants.get(enrollment.participant_id);
    const program = lookups.programs.get(enrollment.program_id);
    const plan = enrollment.subscription_plan_id ? lookups.subscriptionPlans.get(enrollment.subscription_plan_id) : null;

    return {
      label: `${participant?.display_name ?? "Leerling"} - ${program?.name ?? "Programma"} - ${plan?.name ?? "geen abonnement"}`,
      value: enrollment.id
    };
  });

  return (
    <form action={createManualInvoiceAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Factuurnummer" name="invoice_number" required />
        <TextField label="Titel" name="title" required />
      <SelectField label="Inschrijving" name="enrollment_id" options={enrollmentOptions} required />
      <SelectField includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
        <TextField defaultValue={todayInput()} label="Factuurdatum" name="issued_on" required type="date" />
        <TextField label="Vervaldatum" name="due_on" type="date" />
        <TextField label="Periode start" name="period_start" type="date" />
        <TextField label="Periode einde" name="period_end" type="date" />
        <TextField label="Bedrag" name="amount" required type="number" />
        <TextField defaultValue="EUR" label="Valuta" name="currency" required />
        <SelectField defaultValue="open" label="Status" name="status" options={invoiceStatusOptions} />
      </div>
      <TextAreaField label="Omschrijving" name="description" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Factuur opslaan
      </button>
    </form>
  );
}

function ProviderCard({ provider, fallback }: { provider: PaymentProviderConfigRow | undefined; fallback: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{provider?.display_name ?? fallback}</p>
          <p className="text-sm text-muted-foreground">{provider?.provider ?? "provider"} - {provider?.mode ?? "test"}</p>
        </div>
        <StatusPill tone={provider?.status === "active" ? "success" : provider?.status === "configured" ? "warning" : "neutral"}>{paymentProviderStatusLabel(provider?.status)}</StatusPill>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {(provider?.capabilities ?? ["adapter voorbereid"]).join(", ")}
      </p>
    </div>
  );
}

function InvoiceCard({ invoice, lookups }: { invoice: InvoiceRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(invoice.participant_id);
  const enrollment = lookups.enrollments.get(invoice.enrollment_id);
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;
  const plan = invoice.subscription_plan_id ? lookups.subscriptionPlans.get(invoice.subscription_plan_id) : null;
  const records = lookups.paymentRecordsByInvoice.get(invoice.id) ?? [];
  const remaining = Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents);

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{invoice.invoice_number} - {invoice.title}</p>
          <p className="text-sm text-muted-foreground">
            {participant?.display_name ?? "Leerling"} - {program?.name ?? "Programma"} - {plan?.name ?? "geen abonnement"}
          </p>
        </div>
        <StatusPill tone={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "danger" : invoice.status === "partially_paid" ? "warning" : "info"}>{invoice.status}</StatusPill>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <InfoTile label="Bedrag" value={formatMoney(invoice.amount_due_cents, invoice.currency)} />
        <InfoTile label="Betaald" value={formatMoney(invoice.amount_paid_cents, invoice.currency)} />
        <InfoTile label="Open" value={formatMoney(remaining, invoice.currency)} />
        <InfoTile label="Vervalt" value={invoice.due_on ? formatDate(invoice.due_on) : "-"} />
      </div>
      <details className="mt-4 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Handmatige betaling registreren</summary>
        <ManualPaymentForm invoice={invoice} remaining={remaining} />
      </details>
      {records.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {records.map((payment) => (
            <PaymentRecordRowView key={payment.id} lookups={lookups} payment={payment} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ManualPaymentForm({ invoice, remaining }: { invoice: InvoiceRow; remaining: number }) {
  return (
    <form action={recordManualPaymentAction} className="mt-4 grid gap-3">
      <input name="invoice_id" type="hidden" value={invoice.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={(remaining / 100).toFixed(2)} label="Bedrag" name="amount" required type="number" />
        <TextField defaultValue={todayInput()} label="Ontvangen op" name="received_on" type="date" />
        <SelectField defaultValue="manual_bank_transfer" label="Methode" name="payment_method" options={paymentMethodOptions} />
        <SelectField defaultValue="recorded" label="Status" name="status" options={paymentStatusOptions} />
      </div>
      <TextAreaField label="Notitie" name="note" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Betaling registreren
      </button>
    </form>
  );
}

function PaymentRecordRowView({ payment, lookups }: { payment: PaymentRecordRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(payment.participant_id);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{formatMoney(payment.amount_cents, payment.currency)}</p>
          <p className="text-sm text-muted-foreground">{participant?.display_name ?? "Leerling"} - {payment.payment_method} - {payment.provider}</p>
          {payment.note ? <p className="mt-1 text-sm text-muted-foreground">{payment.note}</p> : null}
        </div>
        <StatusPill tone={payment.status === "recorded" || payment.status === "paid" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status}</StatusPill>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{payment.received_on ? formatDate(payment.received_on) : formatDate(payment.created_at)}</p>
    </div>
  );
}

function PaymentEventRowView({ event }: { event: PaymentEventRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{event.event_type}</p>
          <p className="text-sm text-muted-foreground">{event.provider}</p>
        </div>
        <StatusPill tone="neutral">{formatDate(event.created_at)}</StatusPill>
      </div>
    </div>
  );
}

function PaymentsStatusPanel({ snapshot }: AdminPaymentsPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Betalingen niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie en tenant adminrechten nodig.</p>
      {snapshot.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{children}</div>;
}

function TextField({ defaultValue, label, min, name, required, type = "text" }: { defaultValue?: string | number | null; label: string; min?: number; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} min={min} name={name} required={required} step={type === "number" ? "0.01" : undefined} type={type} />
    </label>
  );
}

function TextAreaField({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <textarea className={`${fieldClassName} min-h-20`} name={name} />
    </label>
  );
}

function SelectField({ defaultValue, includeEmpty, label, name, options, required }: { defaultValue?: string | number | null; includeEmpty?: boolean; label: string; name: string; options: { label: string; value: string | number }[]; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
        {includeEmpty || required ? <option value="">{required ? "Selecteer" : "-"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildLookups(data: AdminPaymentsData): LookupMaps {
  return {
    programs: byId(data.programs),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    subscriptionPlans: byId(data.subscriptionPlans),
    paymentRecordsByInvoice: groupBy(data.paymentRecords, (payment) => payment.invoice_id)
  };
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<Row>(rows: Row[], getKey: (row: Row) => string) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function optionFromName(row: { id: string; name: string }) {
  return { label: row.name, value: row.id };
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function paymentProviderStatusLabel(status: string | null | undefined) {
  if (status === "active") {
    return "actief";
  }

  if (status === "configured") {
    return "geconfigureerd";
  }

  return "ontbreekt";
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const invoiceStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Open", value: "open" },
  { label: "Deels betaald", value: "partially_paid" },
  { label: "Betaald", value: "paid" },
  { label: "Te laat", value: "overdue" },
  { label: "Vervallen", value: "void" }
];

const paymentMethodOptions = [
  { label: "Bankoverschrijving", value: "manual_bank_transfer" },
  { label: "Contant", value: "cash" },
  { label: "Pinterminal", value: "card_terminal" },
  { label: "iDEAL voorbereid", value: "ideal" },
  { label: "Extern", value: "external" }
];

const paymentStatusOptions = [
  { label: "Geregistreerd", value: "recorded" },
  { label: "In behandeling", value: "pending" },
  { label: "Betaald", value: "paid" },
  { label: "Mislukt", value: "failed" },
  { label: "Teruggestort", value: "refunded" },
  { label: "Geannuleerd", value: "cancelled" }
];
