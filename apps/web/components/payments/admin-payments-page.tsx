import type { ReactNode } from "react";
import Link from "next/link";
import { Banknote, CircleDollarSign, CreditCard, FileText, Landmark, Layers3, Repeat2, ShieldCheck } from "lucide-react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  calculateOverdueInvoicesAction,
  createFinanceExportRequestAction,
  createManualInvoiceAction,
  createPaymentBatchAction,
  generateFinanceExportAction,
  approvePaymentBatchAction,
  queueInvoiceReminderAction,
  recordManualPaymentAction,
  recordManualRefundAction,
  recordSepaCollectionItemOutcomeAction,
  cancelSepaCollectionRunAction,
  createSepaCollectionRunAction,
  skipPaymentBatchItemAction,
  stubProcessPaymentBatchAction,
  submitSepaCollectionRunAction,
  updateInvoiceCorrectionAction,
  updateInvoiceNumberingRuleAction,
  updatePaymentProviderConfigAction,
  updateSepaCollectionSettingsAction,
  upsertSepaMandateAction
} from "@/lib/payments/admin-payments-actions";
import type {
  AdminPaymentsData,
  AdminPaymentsSnapshot,
  FinanceExportRequestRow,
  InvoiceNumberingRuleRow,
  InvoiceRow,
  PaymentEnrollmentRow,
  PaymentEventRow,
  PaymentBatchItemRow,
  PaymentBatchRow,
  PaymentParticipantRow,
  PaymentProgramRow,
  PaymentProviderConfigRow,
  PaymentRefundRow,
  PaymentRecordRow,
  PaymentSubscriptionPlanRow,
  SepaCollectionItemRow,
  SepaCollectionRunRow,
  SepaCollectionSettingsRow,
  SepaMandateRow
} from "@/lib/payments/admin-payments-read-model";

type AdminPaymentsPageProps = {
  snapshot: AdminPaymentsSnapshot;
};

type LookupMaps = {
  programs: Map<string, PaymentProgramRow>;
  participants: Map<string, PaymentParticipantRow>;
  enrollments: Map<string, PaymentEnrollmentRow>;
  invoices: Map<string, InvoiceRow>;
  subscriptionPlans: Map<string, PaymentSubscriptionPlanRow>;
  paymentRecordsByInvoice: Map<string, PaymentRecordRow[]>;
  paymentRefundsByInvoice: Map<string, PaymentRefundRow[]>;
  paymentBatchItemsByBatch: Map<string, PaymentBatchItemRow[]>;
  sepaItemsByRun: Map<string, SepaCollectionItemRow[]>;
  sepaMandatesByEnrollment: Map<string, SepaMandateRow[]>;
};

export function AdminPaymentsPage({ snapshot }: AdminPaymentsPageProps) {
  const lookups = buildLookups(snapshot.data);
  const openAmount = snapshot.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0);
  const paidAmount = snapshot.data.paymentRecords.filter((payment) => ["recorded", "paid"].includes(payment.status)).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const refundedAmount = snapshot.data.paymentRefunds.filter((refund) => ["recorded", "processed"].includes(refund.status)).reduce((sum, refund) => sum + refund.amount_cents, 0);
  const activeSepaMandates = snapshot.data.sepaMandates.filter((mandate) => mandate.status === "valid").length;
  const readyBatchTotal = snapshot.data.paymentBatches.reduce((sum, batch) => sum + (["draft", "ready", "approved", "processing"].includes(batch.status) ? batch.total_amount_cents : 0), 0);
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={<FileText className="h-5 w-5" />} label="Facturen" value={snapshot.data.invoices.length.toString()} detail="handmatig eerst" />
            <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Openstaand" value={formatMoney(openAmount, "EUR")} detail="nog te betalen" />
            <MetricCard icon={<Banknote className="h-5 w-5" />} label="Geregistreerd" value={formatMoney(paidAmount, "EUR")} detail={`${formatMoney(refundedAmount, "EUR")} retour`} />
            <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Mollie" value={mollieProvider?.status ?? "disabled"} detail={`${activeSepaMandates} SEPA mandaten`} />
            <MetricCard icon={<Layers3 className="h-5 w-5" />} label="Payment batches" value={snapshot.data.paymentBatches.length.toString()} detail={formatMoney(readyBatchTotal, "EUR")} />
          </div>

          <AdminTabs
            tabs={[
              {
                id: "facturen",
                label: "Facturen",
                count: snapshot.data.invoices.length,
                children: (
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
                )
              },
              {
                id: "nieuw",
                label: "Nieuwe factuur",
                count: snapshot.data.enrollments.length,
                children: (
                  <Card>
                    <SectionHeader title="Nieuwe handmatige factuur" count={snapshot.data.enrollments.length} />
                    <ManualInvoiceForm activeRule={activeRule} data={snapshot.data} />
                  </Card>
                )
              },
              {
                id: "providers",
                label: "Regels & providers",
                count: snapshot.data.providerConfigs.length,
                children: (
                  <Card>
                    <SectionHeader title="Factuurregels en providers" count={snapshot.data.providerConfigs.length} />
                    <div className="grid gap-3">
                      <InvoiceRuleCard rule={activeRule} />
                      <ProviderCard provider={manualProvider} fallback="Handmatige betalingen" />
                      <ProviderCard provider={mollieProvider} fallback="Mollie/iDEAL voorbereiding" />
                    </div>
                  </Card>
                )
              },
              { id: "batches", label: "Batches", count: snapshot.data.paymentBatches.length, children: <PaymentBatchesPanel data={snapshot.data} lookups={lookups} /> },
              { id: "sepa", label: "SEPA incasso", count: snapshot.data.sepaCollectionRuns.length + snapshot.data.sepaMandates.length, children: <SepaIncassoPanel data={snapshot.data} lookups={lookups} mollieProvider={mollieProvider} /> },
              {
                id: "exports",
                label: "Exports",
                count: snapshot.data.financeExports.length,
                children: (
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
                )
              },
              {
                id: "betalingen",
                label: "Betalingen",
                count: snapshot.data.paymentRecords.length,
                children: (
                  <Card>
                    <SectionHeader title="Laatste betalingen" count={snapshot.data.paymentRecords.length} />
                    <div className="grid gap-3">
                      {snapshot.data.paymentRecords.length === 0 ? <EmptyState>Nog geen betalingen geregistreerd.</EmptyState> : null}
                      {snapshot.data.paymentRecords.map((payment) => (
                        <PaymentRecordRowView key={payment.id} lookups={lookups} payment={payment} />
                      ))}
                    </div>
                  </Card>
                )
              },
              {
                id: "logboek",
                label: "Refunds & logboek",
                count: snapshot.data.paymentEvents.length + snapshot.data.paymentRefunds.length,
                children: (
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
                )
              }
            ]}
          />
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
          {provider.provider === "mollie" ? <p className="text-xs text-muted-foreground">Mollie/iDEAL/SEPA mag actief zodra de echte secrets in de omgeving staan. Secrets worden niet in de database opgeslagen.</p> : null}
        </form>
      ) : null}
    </div>
  );
}

function PaymentBatchesPanel({ data, lookups }: { data: AdminPaymentsData; lookups: LookupMaps }) {
  const openItems = data.paymentBatchItems.filter((item) => ["pending", "ready", "processing"].includes(item.status));
  const exceptionItems = data.paymentBatchItems.filter((item) => item.warning_codes.length > 0 || item.blocker_codes.length > 0 || ["skipped", "failed"].includes(item.status));

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Payment batches</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Bereid periodieke of gegroepeerde betalingen voor. Preview, uitzonderingen en goedkeuring staan los van niveau, groep en voortgang.
          </p>
        </div>
        <StatusPill tone="info">provider execution stubbed</StatusPill>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Layers3 className="h-5 w-5" />} label="Batches" value={data.paymentBatches.length.toString()} detail="concept tot verwerking" />
        <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Preview totaal" value={formatMoney(data.paymentBatches.reduce((sum, batch) => sum + batch.total_amount_cents, 0), "EUR")} detail={`${openItems.length} open regels`} />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Uitzonderingen" value={exceptionItems.length.toString()} detail="warnings en blockers" />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <details className="rounded-2xl border border-border bg-muted/35 p-4" open>
          <summary className="cursor-pointer text-sm font-bold text-primary">Nieuwe conceptbatch</summary>
          <PaymentBatchForm data={data} />
        </details>

        <div className="grid gap-3">
          <SectionHeader title="Batch overzicht" count={data.paymentBatches.length} />
          {data.paymentBatches.length === 0 ? <EmptyState>Nog geen payment batches. Maak eerst een conceptbatch om de preview te zien.</EmptyState> : null}
          {data.paymentBatches.map((batch) => (
            <PaymentBatchCard key={batch.id} batch={batch} items={lookups.paymentBatchItemsByBatch.get(batch.id) ?? []} lookups={lookups} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function PaymentBatchForm({ data }: { data: AdminPaymentsData }) {
  return (
    <form action={createPaymentBatchAction} className="mt-4 grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue="monthly_tuition" label="Batchtype" name="batch_type" options={paymentBatchTypeOptions} />
        <SelectField defaultValue="manual" label="Betaalmethode" name="payment_method" options={paymentBatchMethodOptions} />
        <TextField defaultValue={`Betaalbatch ${todayInput()}`} label="Titel" name="title" required />
        <TextField label="Batchnummer override" name="batch_number" />
        <SelectField includeEmpty label="Programmafilter" name="program_id" options={data.programs.map(optionFromName)} />
        <TextField defaultValue="EUR" label="Valuta" maxLength={3} name="currency" required />
        <TextField defaultValue={todayInput()} label="Periode start" name="period_start" type="date" />
        <TextField defaultValue={todayInput()} label="Periode einde" name="period_end" type="date" />
        <TextField label="Vervaldatum" name="due_on" type="date" />
        <TextField label="Bedrag voor eenmalige types" name="amount" type="number" />
      </div>
      <TextAreaField label="Omschrijving" name="description" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Conceptbatch maken
      </button>
      <p className="text-xs leading-5 text-muted-foreground">
        Maand- en kwartaalbatches gebruiken het abonnementbedrag. Eenmalige types gebruiken het ingevulde bedrag. Mollie/SEPA uitvoering blijft veilig voorbereid totdat de provider expliciet live staat.
      </p>
    </form>
  );
}

function PaymentBatchCard({ batch, items, lookups }: { batch: PaymentBatchRow; items: PaymentBatchItemRow[]; lookups: LookupMaps }) {
  const canApprove = ["draft", "ready"].includes(batch.status) && batch.ready_item_count > 0;
  const canProcess = batch.status === "approved";

  return (
    <details className="rounded-2xl border border-border bg-card p-4" open={dataShouldOpenBatch(batch)}>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{batch.batch_number} - {batch.title}</p>
            <p className="text-sm text-muted-foreground">
              {paymentBatchTypeLabel(batch.batch_type)} - {paymentBatchMethodLabel(batch.payment_method)} - {batch.period_start ?? "geen start"} t/m {batch.period_end ?? "geen einde"}
            </p>
          </div>
          <StatusPill tone={paymentBatchStatusTone(batch.status)}>{batch.status}</StatusPill>
        </div>
      </summary>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <InfoTile label="Regels" value={batch.item_count.toString()} />
        <InfoTile label="Klaar" value={batch.ready_item_count.toString()} />
        <InfoTile label="Exceptions" value={batch.exception_item_count.toString()} />
        <InfoTile label="Totaal" value={formatMoney(batch.total_amount_cents, batch.currency)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canApprove ? (
          <form action={approvePaymentBatchAction}>
            <input name="batch_id" type="hidden" value={batch.id} />
            <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
              Batch goedkeuren
            </button>
          </form>
        ) : null}
        {canProcess ? (
          <form action={stubProcessPaymentBatchAction}>
            <input name="batch_id" type="hidden" value={batch.id} />
            <button className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
              Verwerking voorbereiden
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {items.length === 0 ? <EmptyState>Deze batch heeft nog geen previewregels.</EmptyState> : null}
        {items.map((item) => (
          <PaymentBatchItemCard key={item.id} item={item} lookups={lookups} />
        ))}
      </div>
    </details>
  );
}

function PaymentBatchItemCard({ item, lookups }: { item: PaymentBatchItemRow; lookups: LookupMaps }) {
  const participant = item.participant_id ? lookups.participants.get(item.participant_id) : null;
  const enrollment = item.enrollment_id ? lookups.enrollments.get(item.enrollment_id) : null;
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;
  const plan = item.subscription_plan_id ? lookups.subscriptionPlans.get(item.subscription_plan_id) : null;
  const hasException = item.warning_codes.length > 0 || item.blocker_codes.length > 0 || Boolean(item.exception_message);
  const canSkip = !["paid", "cancelled", "skipped"].includes(item.status);

  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-3" open={hasException}>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="text-sm text-muted-foreground">
              {participant?.display_name ?? "Leerling"} - {program?.name ?? "Programma"} - {plan?.name ?? "geen abonnement"}
            </p>
            {item.exception_message ? <p className="mt-1 text-sm text-destructive">{item.exception_message}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={item.blocker_codes.length > 0 || item.status === "failed" ? "danger" : item.warning_codes.length > 0 || item.status === "skipped" ? "warning" : item.status === "paid" ? "success" : "info"}>{item.status}</StatusPill>
            <span className="text-sm font-bold">{formatMoney(item.amount_cents, item.currency)}</span>
          </div>
        </div>
      </summary>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <InfoTile label="Warnings" value={item.warning_codes.length > 0 ? item.warning_codes.join(", ") : "-"} />
        <InfoTile label="Blockers" value={item.blocker_codes.length > 0 ? item.blocker_codes.join(", ") : "-"} />
        <InfoTile label="Bron" value={item.source_type} />
      </div>
      {canSkip ? (
        <form action={skipPaymentBatchItemAction} className="mt-3 flex flex-wrap gap-2">
          <input name="item_id" type="hidden" value={item.id} />
          <input className={fieldClassName} name="reason" placeholder="Reden overslaan" required />
          <button className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
            Regel overslaan
          </button>
        </form>
      ) : null}
    </details>
  );
}

function SepaIncassoPanel({ data, lookups, mollieProvider }: { data: AdminPaymentsData; lookups: LookupMaps; mollieProvider: PaymentProviderConfigRow | undefined }) {
  const settings = data.sepaSettings;
  const validMandates = data.sepaMandates.filter((mandate) => mandate.status === "valid");
  const queuedItems = data.sepaCollectionItems.filter((item) => ["queued", "pending", "submitted"].includes(item.status));
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
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">SEPA incasso via Mollie</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Mandaten, incasso batches en uitkomsten. Abonnement en factuur blijven los van niveau/badje; incasso wijzigt alleen betaalstatus.
          </p>
        </div>
        <StatusPill tone={settings?.status === "active" ? "success" : settings?.status === "configured" ? "warning" : "neutral"}>{settings?.status ?? "niet ingesteld"}</StatusPill>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Mandaten" value={validMandates.length.toString()} detail={`${data.sepaMandates.length} totaal`} />
        <MetricCard icon={<Repeat2 className="h-5 w-5" />} label="Open regels" value={queuedItems.length.toString()} detail="queued / pending / submitted" />
        <MetricCard icon={<Landmark className="h-5 w-5" />} label="Provider" value={mollieProvider?.status ?? "disabled"} detail={settings?.mode ?? "prepare_only"} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-4">
          <details className="rounded-2xl border border-border bg-muted/35 p-4" open>
            <summary className="cursor-pointer text-sm font-bold text-primary">Incasso instellingen</summary>
            <SepaSettingsForm settings={settings} mollieProvider={mollieProvider} />
          </details>

          <details className="rounded-2xl border border-border bg-muted/35 p-4">
            <summary className="cursor-pointer text-sm font-bold text-primary">Mandaat toevoegen</summary>
            <SepaMandateForm enrollmentOptions={enrollmentOptions} />
          </details>

          <details className="rounded-2xl border border-border bg-muted/35 p-4">
            <summary className="cursor-pointer text-sm font-bold text-primary">Nieuwe incasso batch</summary>
            <SepaRunForm defaultMode={mollieProvider?.mode ?? "test"} />
          </details>
        </div>

        <div className="grid gap-4">
          <div>
            <SectionHeader title="Mandaten" count={data.sepaMandates.length} />
            <div className="grid gap-3">
              {data.sepaMandates.length === 0 ? <EmptyState>Nog geen SEPA mandaten.</EmptyState> : null}
              {data.sepaMandates.slice(0, 6).map((mandate) => (
                <SepaMandateCard key={mandate.id} enrollmentOptions={enrollmentOptions} lookups={lookups} mandate={mandate} />
              ))}
            </div>
          </div>

          <div>
            <SectionHeader title="Incasso batches" count={data.sepaCollectionRuns.length} />
            <div className="grid gap-3">
              {data.sepaCollectionRuns.length === 0 ? <EmptyState>Nog geen SEPA incasso batches.</EmptyState> : null}
              {data.sepaCollectionRuns.map((run) => (
                <SepaRunCard key={run.id} items={lookups.sepaItemsByRun.get(run.id) ?? []} lookups={lookups} run={run} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SepaSettingsForm({ settings, mollieProvider }: { settings: SepaCollectionSettingsRow | null; mollieProvider: PaymentProviderConfigRow | undefined }) {
  return (
    <form action={updateSepaCollectionSettingsAction} className="mt-4 grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={settings?.status ?? "configured"} label="Status" name="status" options={sepaSettingsStatusOptions} />
        <SelectField defaultValue={settings?.mode ?? "prepare_only"} label="Modus" name="mode" options={sepaSettingsModeOptions} />
        <SelectField defaultValue={mollieProvider?.mode ?? "test"} label="Provider mode" name="provider_mode" options={providerModeOptions} />
        <TextField defaultValue={settings?.default_collection_day ?? 1} label="Incassodag maand" max={28} min={1} name="default_collection_day" required type="number" />
        <TextField defaultValue={settings?.min_notice_days ?? 5} label="Aankondiging dagen" max={30} min={0} name="min_notice_days" required type="number" />
        <TextField defaultValue={settings?.creditor_name} label="Incassant naam" name="creditor_name" />
        <TextField defaultValue={settings?.creditor_reference} label="Creditor referentie" name="creditor_reference" />
      </div>
      <TextAreaField defaultValue={settings?.mandate_intro} label="Mandaatintro ouder" name="mandate_intro" />
      <TextAreaField defaultValue={settings?.parent_consent_text} label="Machtigingstekst" name="parent_consent_text" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        SEPA instellingen opslaan
      </button>
      <p className="text-xs text-muted-foreground">Live indienen werkt alleen met echte `MOLLIE_API_KEY` en webhook secret in de serveromgeving.</p>
    </form>
  );
}

function SepaMandateForm({ enrollmentOptions, mandate }: { enrollmentOptions: { label: string; value: string }[]; mandate?: SepaMandateRow }) {
  return (
    <form action={upsertSepaMandateAction} className="mt-4 grid gap-3">
      {mandate ? <input name="id" type="hidden" value={mandate.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={mandate?.enrollment_id} label="Inschrijving" name="enrollment_id" options={enrollmentOptions} required />
        <SelectField defaultValue={mandate?.status ?? "draft"} label="Status" name="status" options={sepaMandateStatusOptions} />
        <TextField defaultValue={mandate?.mandate_reference} label="Mandaatreferentie" name="mandate_reference" required />
        <TextField defaultValue={mandate?.account_holder_name} label="Rekeninghouder" name="account_holder_name" />
        <TextField defaultValue={mandate?.provider_customer_id} label="Mollie customer ID" name="provider_customer_id" />
        <TextField defaultValue={mandate?.provider_mandate_id} label="Mollie mandate ID" name="provider_mandate_id" />
        <TextField defaultValue={mandate?.iban_last4} label="IBAN laatste 4" maxLength={4} name="iban_last4" />
        <TextField defaultValue={mandate?.iban_country ?? "NL"} label="IBAN land" maxLength={2} name="iban_country" />
        <TextField defaultValue={mandate?.consent_given_at?.slice(0, 10)} label="Toestemming op" name="consent_given_on" type="date" />
        <TextField defaultValue={mandate?.signed_at?.slice(0, 10)} label="Ondertekend op" name="signed_on" type="date" />
        <TextField defaultValue={mandate?.valid_from} label="Geldig vanaf" name="valid_from" type="date" />
      </div>
      <TextAreaField defaultValue={mandate?.revoked_reason} label="Reden intrekken/ongeldig/mislukt" name="revoked_reason" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Mandaat opslaan
      </button>
    </form>
  );
}

function SepaMandateCard({ enrollmentOptions, lookups, mandate }: { enrollmentOptions: { label: string; value: string }[]; lookups: LookupMaps; mandate: SepaMandateRow }) {
  const participant = lookups.participants.get(mandate.participant_id);

  return (
    <details className="rounded-2xl border border-border bg-card p-3">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{mandate.mandate_reference}</p>
            <p className="text-sm text-muted-foreground">
              {participant?.display_name ?? "Leerling"} - {mandate.account_holder_name ?? "rekeninghouder onbekend"} - {mandate.iban_country ?? "--"} ****{mandate.iban_last4 ?? "----"}
            </p>
          </div>
          <StatusPill tone={mandate.status === "valid" ? "success" : mandate.status === "revoked" || mandate.status === "failed" ? "danger" : "warning"}>{mandate.status}</StatusPill>
        </div>
      </summary>
      <SepaMandateForm enrollmentOptions={enrollmentOptions} mandate={mandate} />
    </details>
  );
}

function SepaRunForm({ defaultMode }: { defaultMode: string }) {
  return (
    <form action={createSepaCollectionRunAction} className="mt-4 grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={`SEPA incasso ${todayInput()}`} label="Titel" name="title" required />
        <TextField label="Batchnummer override" name="run_number" />
        <TextField defaultValue={todayInput()} label="Incassodatum" name="requested_collection_date" required type="date" />
        <SelectField defaultValue={defaultMode} label="Mode" name="mode" options={providerModeOptions} />
        <TextField label="Periode vanaf" name="period_start" type="date" />
        <TextField label="Periode tot" name="period_end" type="date" />
        <TextField defaultValue="EUR" label="Valuta" name="currency" required />
      </div>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Batch samenstellen
      </button>
      <p className="text-xs text-muted-foreground">Alleen open/deels betaalde/overdue facturen met geldig Mollie SEPA-mandaat worden toegevoegd.</p>
    </form>
  );
}

function SepaRunCard({ items, lookups, run }: { items: SepaCollectionItemRow[]; lookups: LookupMaps; run: SepaCollectionRunRow }) {
  const canSubmit = ["draft", "ready"].includes(run.status);
  const canCancel = !items.some((item) => item.status === "paid") && !["cancelled", "processed"].includes(run.status);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{run.run_number} - {run.title}</p>
          <p className="text-sm text-muted-foreground">
            {formatDate(run.requested_collection_date)} - {run.invoice_count} regels - {formatMoney(run.total_amount_cents, run.currency)}
          </p>
        </div>
        <StatusPill tone={run.status === "processed" ? "success" : run.status === "failed" || run.status === "partially_failed" ? "danger" : run.status === "ready" ? "warning" : "info"}>{run.status}</StatusPill>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canSubmit ? (
          <form action={submitSepaCollectionRunAction}>
            <input name="run_id" type="hidden" value={run.id} />
            <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
              Indienen / voorbereiden
            </button>
          </form>
        ) : null}
        {canCancel ? (
          <form action={cancelSepaCollectionRunAction} className="flex flex-wrap gap-2">
            <input name="run_id" type="hidden" value={run.id} />
            <input className={fieldClassName} name="reason" placeholder="Reden annuleren" required />
            <button className="rounded-xl border border-destructive/30 bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90" type="submit">
              Batch annuleren
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2">
        {items.length === 0 ? <EmptyState>Deze batch heeft nog geen regels.</EmptyState> : null}
        {items.map((item) => (
          <SepaItemRow key={item.id} item={item} lookups={lookups} />
        ))}
      </div>
    </div>
  );
}

function SepaItemRow({ item, lookups }: { item: SepaCollectionItemRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(item.participant_id);
  const invoice = lookups.invoices.get(item.invoice_id);

  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-3">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{formatMoney(item.amount_cents, item.currency)}</p>
            <p className="text-sm text-muted-foreground">
              {participant?.display_name ?? "Leerling"} - {invoice?.invoice_number ?? "factuur"} - {item.sequence_type}
            </p>
            {item.failure_reason ? <p className="mt-1 text-sm text-destructive">{item.failure_reason}</p> : null}
          </div>
          <StatusPill tone={item.status === "paid" ? "success" : item.status === "failed" || item.status === "cancelled" ? "danger" : "warning"}>{item.status}</StatusPill>
        </div>
      </summary>
      <form action={recordSepaCollectionItemOutcomeAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <input name="item_id" type="hidden" value={item.id} />
        <SelectField defaultValue={item.status === "paid" || item.status === "failed" || item.status === "cancelled" ? item.status : "paid"} label="Uitkomst" name="status" options={sepaItemOutcomeOptions} />
        <TextField defaultValue={item.provider_payment_id} label="Mollie payment ID" name="provider_payment_id" />
        <TextField defaultValue={todayInput()} label="Ontvangen op" name="received_on" type="date" />
        <button className="h-fit self-end rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Uitkomst opslaan
        </button>
        <div className="md:col-span-4">
          <TextAreaField defaultValue={item.failure_reason} label="Fout-/annuleerreden" name="failure_reason" />
        </div>
      </form>
    </details>
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

function TextField({
  defaultValue,
  label,
  max,
  maxLength,
  min,
  name,
  required,
  type = "text"
}: {
  defaultValue?: string | number | null;
  label: string;
  max?: number;
  maxLength?: number;
  min?: number;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} max={max} maxLength={maxLength} min={min} name={name} required={required} step={type === "number" ? "0.01" : undefined} type={type} />
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
    invoices: byId(data.invoices),
    subscriptionPlans: byId(data.subscriptionPlans),
    paymentRecordsByInvoice: groupBy(data.paymentRecords, (payment) => payment.invoice_id),
    paymentRefundsByInvoice: groupBy(data.paymentRefunds, (refund) => refund.invoice_id),
    paymentBatchItemsByBatch: groupBy(data.paymentBatchItems, (item) => item.payment_batch_id),
    sepaItemsByRun: groupBy(data.sepaCollectionItems, (item) => item.collection_run_id),
    sepaMandatesByEnrollment: groupBy(data.sepaMandates, (mandate) => mandate.enrollment_id)
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

function dataShouldOpenBatch(batch: PaymentBatchRow) {
  return ["draft", "ready", "approved", "processing", "partially_failed", "failed"].includes(batch.status);
}

function paymentBatchStatusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["completed", "approved"].includes(status)) {
    return "success";
  }

  if (["partially_failed", "failed", "cancelled"].includes(status)) {
    return "danger";
  }

  if (["draft", "ready"].includes(status)) {
    return "warning";
  }

  return "info";
}

function paymentBatchTypeLabel(type: string) {
  return paymentBatchTypeOptions.find((option) => option.value === type)?.label ?? type;
}

function paymentBatchMethodLabel(method: string) {
  return paymentBatchMethodOptions.find((option) => option.value === method)?.label ?? method;
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const paymentBatchTypeOptions = [
  { label: "Maandelijkse lesgelden", value: "monthly_tuition" },
  { label: "Kwartaalbetalingen", value: "quarterly_tuition" },
  { label: "Inschrijfgeld", value: "registration_fee" },
  { label: "Extra activiteit", value: "extra_activity" },
  { label: "Diploma-eventkosten", value: "diploma_event_fee" },
  { label: "Vakantiecursus", value: "holiday_course" },
  { label: "Handmatige correctie", value: "manual_correction" }
];

const paymentBatchMethodOptions = [
  { label: "Handmatig", value: "manual" },
  { label: "SEPA incasso", value: "sepa_direct_debit" },
  { label: "Mollie/iDEAL", value: "mollie" },
  { label: "Extern", value: "external" }
];

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
  { label: "SEPA incasso", value: "direct_debit" },
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
  { label: "Refunds", value: "refunds" },
  { label: "SEPA incasso", value: "sepa_collections" }
];

const financeExportFormatOptions = [
  { label: "CSV", value: "csv" },
  { label: "JSON", value: "json" }
];

const sepaSettingsStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Geconfigureerd", value: "configured" },
  { label: "Actief", value: "active" },
  { label: "Gepauzeerd", value: "paused" },
  { label: "Uitgeschakeld", value: "disabled" }
];

const sepaSettingsModeOptions = [
  { label: "Handmatige review", value: "manual_review" },
  { label: "Alleen voorbereiden", value: "prepare_only" },
  { label: "Indienen bij Mollie", value: "submit_to_mollie" }
];

const sepaMandateStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Eerste betaling nodig", value: "pending_first_payment" },
  { label: "In behandeling", value: "pending" },
  { label: "Geldig", value: "valid" },
  { label: "Ongeldig", value: "invalid" },
  { label: "Ingetrokken", value: "revoked" },
  { label: "Verlopen", value: "expired" },
  { label: "Mislukt", value: "failed" }
];

const sepaItemOutcomeOptions = [
  { label: "Betaald", value: "paid" },
  { label: "Mislukt", value: "failed" },
  { label: "Geannuleerd", value: "cancelled" }
];
