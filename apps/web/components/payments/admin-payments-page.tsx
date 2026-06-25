import type { ReactNode } from "react";
import Link from "next/link";
import { Banknote, CircleDollarSign, CreditCard, FileText } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  calculateOverdueInvoicesAction,
  createFinanceExportRequestAction,
  createManualInvoiceAction,
  generateFinanceExportAction,
  queueInvoiceReminderAction,
  recordManualPaymentAction,
  recordManualRefundAction,
  updateInvoiceCorrectionAction,
  updateInvoiceNumberingRuleAction,
  updatePaymentProviderConfigAction
} from "@/lib/payments/admin-payments-actions";
import type {
  AdminPaymentsData,
  AdminPaymentsSnapshot,
  FinanceExportRequestRow,
  InvoiceNumberingRuleRow,
  InvoiceRow,
  PaymentEnrollmentRow,
  PaymentEventRow,
  PaymentParticipantRow,
  PaymentProgramRow,
  PaymentProviderConfigRow,
  PaymentRefundRow,
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
  paymentRefundsByInvoice: Map<string, PaymentRefundRow[]>;
};

export function AdminPaymentsPage({ snapshot }: AdminPaymentsPageProps) {
  const lookups = buildLookups(snapshot.data);
  const openAmount = snapshot.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0);
  const paidAmount = snapshot.data.paymentRecords.filter((payment) => ["recorded", "paid"].includes(payment.status)).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const refundedAmount = snapshot.data.paymentRefunds.filter((refund) => ["recorded", "processed"].includes(refund.status)).reduce((sum, refund) => sum + refund.amount_cents, 0);
  const manualProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "manual");
  const mollieProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "mollie");
  const activeRule = snapshot.data.invoiceNumberingRules.find((rule) => rule.status === "active");

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
            <MetricCard icon={<Banknote className="h-5 w-5" />} label="Geregistreerd" value={formatMoney(paidAmount, "EUR")} detail={`${formatMoney(refundedAmount, "EUR")} retour`} />
            <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Mollie" value={mollieProvider?.status ?? "disabled"} detail="adapter voorbereid" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <SectionHeader title="Nieuwe handmatige factuur" count={snapshot.data.enrollments.length} />
              <ManualInvoiceForm activeRule={activeRule} data={snapshot.data} />
            </Card>

            <Card>
              <SectionHeader title="Factuurregels en providers" count={snapshot.data.providerConfigs.length} />
              <div className="grid gap-3">
                <InvoiceRuleCard rule={activeRule} />
                <ProviderCard provider={manualProvider} fallback="Handmatige betalingen" />
                <ProviderCard provider={mollieProvider} fallback="Mollie/iDEAL voorbereiding" />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Card>
              <SectionHeader title="Overdue en finance export" count={snapshot.data.financeExports.length} />
              <form action={calculateOverdueInvoicesAction} className="mb-4">
                <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
                  Overdue status berekenen
                </button>
              </form>
              <FinanceExportForm />
            </Card>
            <Card>
              <SectionHeader title="Finance exports" count={snapshot.data.financeExports.length} />
              <div className="grid gap-3">
                {snapshot.data.financeExports.length === 0 ? <EmptyState>Nog geen finance exports.</EmptyState> : null}
                {snapshot.data.financeExports.map((financeExport) => (
                  <FinanceExportCard key={financeExport.id} financeExport={financeExport} />
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <SectionHeader title="Facturen en betalingen" count={snapshot.data.invoices.length} />
              <Link className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" href="/api/admin-exports/payments/download">
                Payments CSV
              </Link>
            </div>
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
              <SectionHeader title="Refunds en gebeurtenissen" count={snapshot.data.paymentEvents.length + snapshot.data.paymentRefunds.length} />
              <div className="mb-4 grid gap-3">
                {snapshot.data.paymentRefunds.length === 0 ? <EmptyState>Nog geen refunds geregistreerd.</EmptyState> : null}
                {snapshot.data.paymentRefunds.slice(0, 5).map((refund) => (
                  <RefundRowView key={refund.id} lookups={lookups} refund={refund} />
                ))}
              </div>
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

function ManualInvoiceForm({ activeRule, data }: { activeRule: InvoiceNumberingRuleRow | undefined; data: AdminPaymentsData }) {
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
        <TextField label="Factuurnummer override" name="invoice_number" />
        <TextField label="Titel" name="title" required />
        <SelectField label="Inschrijving" name="enrollment_id" options={enrollmentOptions} required />
        <SelectField includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
        <TextField defaultValue={todayInput()} label="Factuurdatum" name="issued_on" required type="date" />
        <TextField label="Vervaldatum" name="due_on" type="date" />
        <TextField label="Periode start" name="period_start" type="date" />
        <TextField label="Periode einde" name="period_end" type="date" />
        <SelectField defaultValue={activeRule?.period_mode ?? "monthly"} label="Periode-regel" name="period_mode" options={periodModeOptions} />
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
      {provider ? (
        <form action={updatePaymentProviderConfigAction} className="mt-4 grid gap-3 border-t border-border pt-4">
          <input name="provider" type="hidden" value={provider.provider} />
          <div className="grid gap-3 md:grid-cols-2">
            <TextField defaultValue={provider.display_name} label="Naam" name="display_name" required />
            <SelectField defaultValue={provider.status} label="Status" name="status" options={providerStatusOptions} />
            <SelectField defaultValue={provider.mode} label="Mode" name="mode" options={providerModeOptions} />
            <TextField defaultValue={provider.external_profile_id} label="Extern profiel" name="external_profile_id" />
          </div>
          <TextField defaultValue={provider.capabilities.join(", ")} label="Capabilities" name="capabilities" />
          <button className="w-fit rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
            Provider opslaan
          </button>
          {provider.provider === "mollie" ? <p className="text-xs text-muted-foreground">Mollie/iDEAL kan hier voorbereid worden; actief zetten is bewust geblokkeerd tot manual flow is goedgekeurd.</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function InvoiceRuleCard({ rule }: { rule: InvoiceNumberingRuleRow | undefined }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4" open>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{rule?.rule_name ?? "Factuurnummering"}</p>
            <p className="text-sm text-muted-foreground">
              {rule ? `${rule.prefix}-jaar-${String(rule.next_number).padStart(rule.padding, "0")} - ${rule.period_mode} - ${rule.due_days} dagen` : "Nog geen actieve regel"}
            </p>
          </div>
          <StatusPill tone={rule?.status === "active" ? "success" : "warning"}>{rule?.status ?? "missing"}</StatusPill>
        </div>
      </summary>
      <form action={updateInvoiceNumberingRuleAction} className="mt-4 grid gap-3">
        {rule ? <input name="id" type="hidden" value={rule.id} /> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <TextField defaultValue={rule?.rule_name ?? "Standaard factuurnummering"} label="Naam" name="rule_name" required />
          <TextField defaultValue={rule?.prefix ?? "INV"} label="Prefix" name="prefix" required />
          <TextField defaultValue={rule?.next_number ?? 1} label="Volgend nummer" name="next_number" required type="number" />
          <TextField defaultValue={rule?.padding ?? 4} label="Padding" name="padding" required type="number" />
          <SelectField defaultValue={rule?.period_mode ?? "monthly"} label="Periode-regel" name="period_mode" options={periodModeOptions} />
          <TextField defaultValue={rule?.due_days ?? 14} label="Betaaltermijn dagen" name="due_days" required type="number" />
        </div>
        <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Factuurregels opslaan
        </button>
      </form>
    </details>
  );
}

function InvoiceCard({ invoice, lookups }: { invoice: InvoiceRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(invoice.participant_id);
  const enrollment = lookups.enrollments.get(invoice.enrollment_id);
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;
  const plan = invoice.subscription_plan_id ? lookups.subscriptionPlans.get(invoice.subscription_plan_id) : null;
  const records = lookups.paymentRecordsByInvoice.get(invoice.id) ?? [];
  const refunds = lookups.paymentRefundsByInvoice.get(invoice.id) ?? [];
  const remaining = Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents);
  const refundable = Math.max(0, invoice.amount_paid_cents - invoice.refunded_amount_cents);

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-lg font-bold text-primary hover:underline" href={`/admin/payments/${invoice.id}`}>
            {invoice.invoice_number} - {invoice.title}
          </Link>
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
        <InfoTile label="Terugbetaald" value={formatMoney(invoice.refunded_amount_cents, invoice.currency)} />
        <InfoTile label="Reminders" value={invoice.reminder_count.toString()} />
        <InfoTile label="Periode" value={invoice.period_start && invoice.period_end ? `${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}` : invoice.period_mode} />
        <InfoTile label="Laatste check" value={invoice.overdue_checked_at ? formatDate(invoice.overdue_checked_at) : "-"} />
      </div>
      <details className="mt-4 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Handmatige betaling registreren</summary>
        <ManualPaymentForm invoice={invoice} remaining={remaining} />
      </details>
      <details className="mt-3 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Factuur corrigeren</summary>
        <InvoiceCorrectionForm invoice={invoice} />
      </details>
      <details className="mt-3 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Refund registreren</summary>
        <ManualRefundForm invoice={invoice} paymentRecords={records} refundable={refundable} />
      </details>
      <form action={queueInvoiceReminderAction} className="mt-3">
        <input name="invoice_id" type="hidden" value={invoice.id} />
        <button className="w-fit rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
          Betalingsherinnering klaarzetten
        </button>
      </form>
      {records.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {records.map((payment) => (
            <PaymentRecordRowView key={payment.id} lookups={lookups} payment={payment} />
          ))}
        </div>
      ) : null}
      {refunds.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {refunds.map((refund) => (
            <RefundRowView key={refund.id} lookups={lookups} refund={refund} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InvoiceCorrectionForm({ invoice }: { invoice: InvoiceRow }) {
  return (
    <form action={updateInvoiceCorrectionAction} className="mt-4 grid gap-3">
      <input name="invoice_id" type="hidden" value={invoice.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={invoice.title} label="Titel" name="title" required />
        <TextField defaultValue={(invoice.amount_due_cents / 100).toFixed(2)} label="Bedrag" name="amount_due" required type="number" />
        <TextField defaultValue={invoice.period_start} label="Periode start" name="period_start" type="date" />
        <TextField defaultValue={invoice.period_end} label="Periode einde" name="period_end" type="date" />
        <SelectField defaultValue={invoice.period_mode} label="Periode-regel" name="period_mode" options={periodModeOptions} />
        <TextField defaultValue={invoice.due_on} label="Vervaldatum" name="due_on" type="date" />
        <SelectField defaultValue={invoice.status} label="Status" name="status" options={invoiceStatusOptions} />
      </div>
      <TextAreaField defaultValue={invoice.description} label="Omschrijving" name="description" />
      <TextAreaField label="Correctienotitie" name="correction_note" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Correctie opslaan
      </button>
    </form>
  );
}

function ManualRefundForm({ invoice, paymentRecords, refundable }: { invoice: InvoiceRow; paymentRecords: PaymentRecordRow[]; refundable: number }) {
  return (
    <form action={recordManualRefundAction} className="mt-4 grid gap-3">
      <input name="invoice_id" type="hidden" value={invoice.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField includeEmpty label="Betaling" name="payment_record_id" options={paymentRecords.map((payment) => ({ label: `${formatMoney(payment.amount_cents, payment.currency)} - ${payment.payment_method}`, value: payment.id }))} />
        <TextField defaultValue={(refundable / 100).toFixed(2)} label="Refund bedrag" name="amount" required type="number" />
        <TextField defaultValue={todayInput()} label="Refund datum" name="refunded_on" type="date" />
        <SelectField defaultValue="recorded" label="Status" name="status" options={refundStatusOptions} />
      </div>
      <TextAreaField label="Reden" name="reason" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Refund registreren
      </button>
    </form>
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

function RefundRowView({ refund, lookups }: { refund: PaymentRefundRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(refund.participant_id);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{formatMoney(refund.amount_cents, refund.currency)} refund</p>
          <p className="text-sm text-muted-foreground">{participant?.display_name ?? "Leerling"} - {refund.provider}</p>
          {refund.reason ? <p className="mt-1 text-sm text-muted-foreground">{refund.reason}</p> : null}
        </div>
        <StatusPill tone={refund.status === "recorded" || refund.status === "processed" ? "success" : refund.status === "failed" ? "danger" : "warning"}>{refund.status}</StatusPill>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{refund.refunded_on ? formatDate(refund.refunded_on) : formatDate(refund.created_at)}</p>
    </div>
  );
}

function FinanceExportForm() {
  return (
    <form action={createFinanceExportRequestAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue="ledger" label="Export" name="export_type" options={financeExportTypeOptions} />
        <SelectField defaultValue="csv" label="Format" name="export_format" options={financeExportFormatOptions} />
        <TextField label="Vanaf" name="period_start" type="date" />
        <TextField label="Tot en met" name="period_end" type="date" />
      </div>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Finance export aanvragen
      </button>
    </form>
  );
}

function FinanceExportCard({ financeExport }: { financeExport: FinanceExportRequestRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {financeExport.export_type} - {financeExport.export_format}
          </p>
          <p className="text-sm text-muted-foreground">
            {financeExport.period_start ?? "begin"} t/m {financeExport.period_end ?? "nu"} - {financeExport.row_count ?? 0} regels
          </p>
          {financeExport.error_message ? <p className="mt-2 text-sm text-destructive">{financeExport.error_message}</p> : null}
        </div>
        <StatusPill tone={financeExport.status === "ready" ? "success" : financeExport.status === "failed" ? "danger" : "warning"}>{financeExport.status}</StatusPill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={generateFinanceExportAction}>
          <input name="id" type="hidden" value={financeExport.id} />
          <button className="w-fit rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
            Genereren
          </button>
        </form>
        {financeExport.file_path ? (
          <a className="w-fit rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" href={`/api/finance-exports/${financeExport.id}/download`}>
            Download
          </a>
        ) : null}
      </div>
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

function TextAreaField({ defaultValue, label, name }: { defaultValue?: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <textarea className={`${fieldClassName} min-h-20`} defaultValue={defaultValue ?? ""} name={name} />
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
    paymentRecordsByInvoice: groupBy(data.paymentRecords, (payment) => payment.invoice_id),
    paymentRefundsByInvoice: groupBy(data.paymentRefunds, (refund) => refund.invoice_id)
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

const refundStatusOptions = [
  { label: "Aangevraagd", value: "requested" },
  { label: "Geregistreerd", value: "recorded" },
  { label: "Verwerkt", value: "processed" },
  { label: "Mislukt", value: "failed" },
  { label: "Geannuleerd", value: "cancelled" }
];

const periodModeOptions = [
  { label: "Handmatig", value: "manual" },
  { label: "Maandelijks", value: "monthly" },
  { label: "Per kwartaal", value: "quarterly" },
  { label: "Jaarlijks", value: "yearly" }
];

const providerStatusOptions = [
  { label: "Uitgeschakeld", value: "disabled" },
  { label: "Geconfigureerd", value: "configured" },
  { label: "Actief", value: "active" }
];

const providerModeOptions = [
  { label: "Test", value: "test" },
  { label: "Live", value: "live" }
];

const financeExportTypeOptions = [
  { label: "Grootboek", value: "ledger" },
  { label: "Facturen", value: "invoices" },
  { label: "Betalingen", value: "payments" },
  { label: "Refunds", value: "refunds" }
];

const financeExportFormatOptions = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" }
];
