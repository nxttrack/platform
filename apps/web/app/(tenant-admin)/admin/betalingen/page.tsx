import { randomUUID } from "node:crypto";
import { CreditCard, ReceiptText } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import {
  createBillingExportBatchAction,
  createInvoiceForPaymentAction,
  createManualPaymentAction,
  createPaymentPlanAction,
  createPaymentProviderSessionAction,
  createSubscriptionAction,
  recordPaymentSessionFailureAction,
  runBillingLifecycleAction,
  saveBillingProviderConfigAction,
  updateManualPaymentStatusAction,
  updateSubscriptionLifecycleAction
} from "@/lib/domain/billing-actions";
import {
  prenotifyMollieCollectionAction,
  reconcileMolliePaymentAction,
  startMollieCollectionAction
} from "@/lib/domain/billing-recurring-actions";
import {
  createMollieRefundAction,
  reconcileMollieRefundAction
} from "@/lib/domain/billing-refund-actions";
import { formatMoney, getBillingAdminData, isPaymentOverdue } from "@/lib/domain/billing";
import { paymentProviderLabel } from "@/lib/domain/payment-provider";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getBillingAdminData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const enrollmentById = new Map(data.enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const planById = new Map(data.paymentPlans.map((plan) => [plan.id, plan]));
  const openPayments = data.manualPayments.filter((payment) => payment.status === "due" || payment.status === "overdue");
  const overduePayments = data.manualPayments.filter((payment) => payment.status === "overdue" || isPaymentOverdue(payment));
  const paidPayments = data.manualPayments.filter((payment) => payment.status === "paid");
  const openAmount = openPayments.reduce((total, payment) => total + payment.amount_cents, 0);
  const overdueAmount = overduePayments.reduce((total, payment) => total + payment.amount_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Billing" title="Betalingen en subscriptions" subtitle="Handmatige billing en idempotente Mollie-checkout met provider-verified webhooks." />
      <Feedback saved={saved} error={error} />

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Automation boundary</p>
            <h2 className="mt-1 text-lg font-bold text-foreground">Lifecycle en provider-ready billing</h2>
            <p className="mt-1 text-sm text-muted-foreground">Markeer verlopen betalingen, maak follow-up taken en houd betaalproviders los van zwemvoortgang.</p>
          </div>
          <form action={runBillingLifecycleAction}>
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
              Lifecycle run
            </button>
          </form>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Providers" value={data.providerConfigs.length.toString()} />
        <Metric label="Payment plans" value={data.paymentPlans.length.toString()} />
        <Metric label="Actieve abonnementen" value={data.subscriptions.filter((subscription) => subscription.status === "active").length.toString()} />
        <Metric label="Openstaand" value={formatMoney(openAmount)} />
        <Metric label="Overdue" tone={overdueAmount > 0 ? "danger" : "success"} value={formatMoney(overdueAmount)} />
      </div>

      <AdminSection title="Payment provider boundary" description="Leg providerkeuze en secret-referenties vast zonder echte sleutels in de database te bewaren. Manual billing blijft altijd beschikbaar.">
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form action={saveBillingProviderConfigAction} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Provider" name="provider">
                <option value="manual">Handmatig</option>
                <option value="mollie">Mollie</option>
                <option value="ideal">iDEAL</option>
                <option value="other">Andere provider</option>
              </SelectField>
              <SelectField label="Mode" name="mode">
                <option value="test">Test</option>
                <option value="live">Live</option>
              </SelectField>
              <SelectField label="Status" name="status">
                <option value="draft">Concept</option>
                <option value="active">Actief</option>
                <option value="disabled">Uit</option>
              </SelectField>
            </div>
            <Field label="Naam" name="displayName" placeholder="Mollie test" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Secret reference" name="secretReference" placeholder="GITHUB_ENV:MOLLIE_API_KEY" />
              <Field label="Webhook secret reference" name="webhookSecretReference" placeholder="GITHUB_ENV:MOLLIE_WEBHOOK_SECRET" />
            </div>
            <Field label="Return URL" name="returnUrl" placeholder="https://staging.nxttrack.nl/portaal/betalingen" />
            <Field label="Incasso vooraf aankondigen (dagen, 2–30)" name="directDebitNoticeDays" type="number" defaultValue={7} />
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 text-sm font-semibold text-foreground">
              <input className="h-4 w-4 accent-primary" name="recurringEnabled" type="checkbox" />
              Terugkerende SEPA-incasso bewust inschakelen
            </label>
            <div className="grid gap-3 rounded-xl border border-amber-300/70 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/20">
              <p className="text-sm font-semibold text-foreground">Automatisering met dubbele veiligheidsgrendel</p>
              <p className="text-xs text-muted-foreground">
                Deze opties werken alleen wanneer incasso actief is én de beveiligde scheduler op de omgeving is ingericht.
              </p>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-foreground">
                <input className="h-4 w-4 accent-primary" name="automaticCollectionEnabled" type="checkbox" />
                Aangekondigde incasso's automatisch uitvoeren
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-foreground">
                <input className="h-4 w-4 accent-primary" name="automaticRetriesEnabled" type="checkbox" />
                Mislukte incasso's automatisch opnieuw aankondigen
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Maximaal aantal pogingen (1–5)" name="maxCollectionAttempts" type="number" defaultValue={2} />
                <Field label="Wachttijd retry (dagen, 1–30)" name="retryDelayDays" type="number" defaultValue={3} />
              </div>
            </div>
            <TextAreaField label="Checkout omschrijving" name="checkoutDescription" />
            <SubmitButton>Provider opslaan</SubmitButton>
          </form>
          <DataList>
            {data.providerConfigs.length === 0 ? (
              <div className="px-3 py-4">
                <EmptyState>Nog geen providerconfiguratie.</EmptyState>
              </div>
            ) : (
              data.providerConfigs.map((provider) => (
                <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={provider.id}>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{provider.display_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {paymentProviderLabel(provider.provider)} - {provider.mode} - secret: {provider.secret_reference ? "referentie gezet" : "geen referentie"}
                    </p>
                    {provider.provider === "mollie" ? (
                      <>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Incasso: {provider.public_config.recurring_enabled === true ? "ingeschakeld" : "uit"} · aankondiging {String(provider.public_config.direct_debit_notice_days ?? 7)} dagen
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Automatisch uitvoeren: {provider.public_config.automatic_collection_enabled === true ? "aan" : "uit"} · retries:{" "}
                          {provider.public_config.automatic_retries_enabled === true
                            ? `aan, max. ${String(provider.public_config.max_collection_attempts ?? 2)}`
                            : "uit"}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <StatusPill tone={provider.status === "active" ? "success" : provider.status === "draft" ? "warning" : "neutral"}>{provider.status}</StatusPill>
                </div>
              ))
            )}
          </DataList>
        </div>
      </AdminSection>

      <div className="grid gap-5 xl:grid-cols-3">
        <AdminSection title="Payment plan" description="Maak een handmatig tariefplan aan.">
          <form action={createPaymentPlanAction} className="grid gap-4">
            <Field label="Naam" name="name" required placeholder="Maandabonnement zwemles" />
            <Field label="Code" name="code" placeholder="MONTHLY-A" />
            <SelectField label="Programma" name="programId">
              <option value="">Alle programma's</option>
              {data.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bedrag" name="amount" required placeholder="79,95" />
              <Field label="Valuta" name="currency" defaultValue="EUR" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Interval" name="billingInterval">
                <option value="monthly">Maandelijks</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="yearly">Jaarlijks</option>
                <option value="one_time">Eenmalig</option>
                <option value="manual">Handmatig</option>
              </SelectField>
              <SelectField label="Status" name="status">
                <option value="active">Actief</option>
                <option value="draft">Concept</option>
                <option value="archived">Gearchiveerd</option>
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Factuurdag" name="billingDay" type="number" placeholder="1-28" />
              <Field label="Betaaltermijn" name="paymentTermsDays" type="number" defaultValue={14} />
            </div>
            <TextAreaField label="Omschrijving" name="description" />
            <SubmitButton>Plan opslaan</SubmitButton>
          </form>
        </AdminSection>

        <AdminSection title="Subscription" description="Koppel een inschrijving aan een payment plan.">
          <form action={createSubscriptionAction} className="grid gap-4">
            <SelectField label="Inschrijving" name="enrollmentId" required>
              <option value="">Kies inschrijving</option>
              {data.enrollments.map((enrollment) => {
                const participant = participantById.get(enrollment.participant_id);
                const program = programById.get(enrollment.program_id);

                return (
                  <option key={enrollment.id} value={enrollment.id}>
                    {participant?.display_name ?? "Leerling"} - {program?.name ?? "Programma"}
                  </option>
                );
              })}
            </SelectField>
            <SelectField label="Payment plan" name="paymentPlanId" required>
              <option value="">Kies plan</option>
              {data.paymentPlans
                .filter((plan) => plan.status === "active")
                .map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} - {formatMoney(plan.amount_cents, plan.currency)}
                  </option>
                ))}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Status" name="status">
                <option value="active">Actief</option>
                <option value="paused">Gepauzeerd</option>
                <option value="cancelled">Geannuleerd</option>
                <option value="completed">Afgerond</option>
              </SelectField>
              <SelectField label="Interval override" name="billingInterval">
                <option value="monthly">Maandelijks</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="yearly">Jaarlijks</option>
                <option value="one_time">Eenmalig</option>
                <option value="manual">Handmatig</option>
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Collectie" name="collectionMethod">
                <option value="manual">Handmatig</option>
                <option value="provider">Via provider later</option>
              </SelectField>
              <SelectField label="Providerconfig" name="providerConfigId">
                <option value="">Geen provider</option>
                {data.providerConfigs.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name} ({provider.mode})
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Startdatum" name="startsOn" type="date" />
              <Field label="Volgende vervaldatum" name="nextDueOn" type="date" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Billing anchor" name="billingAnchorDay" type="number" placeholder="1-28" />
              <Field label="Periode start" name="currentPeriodStart" type="date" />
              <Field label="Periode eind" name="currentPeriodEnd" type="date" />
            </div>
            <Field label="Bedrag override" name="amount" placeholder="Leeg = planbedrag" />
            <TextAreaField label="Notities" name="notes" />
            <SubmitButton>Subscription opslaan</SubmitButton>
          </form>
        </AdminSection>

        <AdminSection title="Handmatige betaling" description="Maak een openstaande of betaalde handmatige betaling aan.">
          <form action={createManualPaymentAction} className="grid gap-4">
            <SelectField label="Subscription" name="subscriptionId" required>
              <option value="">Kies subscription</option>
              {data.subscriptions.map((subscription) => {
                const participant = participantById.get(subscription.participant_id);
                const plan = planById.get(subscription.payment_plan_id);

                return (
                  <option key={subscription.id} value={subscription.id}>
                    {participant?.display_name ?? "Leerling"} - {plan?.name ?? "Plan"}
                  </option>
                );
              })}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bedrag" name="amount" placeholder="Leeg = subscription" />
              <Field label="Vervaldatum" name="dueOn" required type="date" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Status" name="status">
                <option value="due">Open</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Betaald</option>
                <option value="waived">Kwijtgescholden</option>
                <option value="cancelled">Geannuleerd</option>
              </SelectField>
              <Field label="Betaaldatum" name="paidOn" type="date" />
            </div>
            <Field label="Referentie" name="reference" placeholder="Bijvoorbeeld factuurnummer" />
            <Field label="Methode" name="method" placeholder="Bank, contant, pin" />
            <TextAreaField label="Notities" name="notes" />
            <SubmitButton>Betaling opslaan</SubmitButton>
          </form>
        </AdminSection>
      </div>

      <AdminSection title="Subscription lifecycle" description="Pauzeren, annuleren of afronden verandert alleen billingstatus; programma, badje en zwemvoortgang blijven onafhankelijk.">
        {data.subscriptions.length === 0 ? (
          <EmptyState>Nog geen abonnementen.</EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.subscriptions.map((subscription) => {
              const participant = participantById.get(subscription.participant_id);
              const plan = planById.get(subscription.payment_plan_id);
              const provider = subscription.provider_config_id ? data.providerConfigs.find((item) => item.id === subscription.provider_config_id) : null;
              const mandate = subscription.billing_mandate_id ? data.mandates.find((item) => item.id === subscription.billing_mandate_id) : null;

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={subscription.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Leerling"}</p>
                      <h2 className="mt-1 font-bold text-foreground">{plan?.name ?? "Abonnement"}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatMoney(subscription.amount_cents, subscription.currency)} - {subscription.billing_interval} - {subscription.collection_method}
                      </p>
                      {provider ? <p className="mt-1 text-xs text-muted-foreground">Provider: {provider.display_name}</p> : null}
                      {mandate ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Machtiging: {mandate.status} · rekening •••• {mandate.account_last4 ?? "onbekend"}
                        </p>
                      ) : subscription.collection_method === "provider" ? (
                        <p className="mt-1 text-xs font-semibold text-warning">Wacht op incassomachtiging van de ouder.</p>
                      ) : null}
                    </div>
                    <StatusPill tone={subscription.status === "active" ? "success" : subscription.status === "paused" ? "warning" : "neutral"}>{subscription.status}</StatusPill>
                  </div>
                  <form action={updateSubscriptionLifecycleAction} className="mt-3 grid gap-3 md:grid-cols-[160px_1fr_auto]">
                    <input name="subscriptionId" type="hidden" value={subscription.id} />
                    <SelectField label="Status" name="status">
                      <option value="active">Actief</option>
                      <option value="paused">Gepauzeerd</option>
                      <option value="cancelled">Geannuleerd</option>
                      <option value="completed">Afgerond</option>
                    </SelectField>
                    <Field label="Reden" name="reason" placeholder={subscription.lifecycle_status_reason ?? "Optioneel"} />
                    <div className="flex items-end">
                      <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                        Bijwerken
                      </button>
                    </div>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Payment overview">
        {data.manualPayments.length === 0 ? (
          <EmptyState>Nog geen handmatige betalingen.</EmptyState>
        ) : (
          <div className="space-y-3">
            {data.manualPayments.map((payment) => {
              const participant = participantById.get(payment.participant_id);
              const enrollment = enrollmentById.get(payment.enrollment_id);
              const plan = enrollment ? planById.get(data.subscriptions.find((subscription) => subscription.id === payment.subscription_id)?.payment_plan_id ?? "") : null;
              const overdue = isPaymentOverdue(payment);
              const subscription = data.subscriptions.find((item) => item.id === payment.subscription_id);
              const mandate = subscription?.billing_mandate_id ? data.mandates.find((item) => item.id === subscription.billing_mandate_id) : null;
              const latestAttempt = data.collectionAttempts.find((item) => item.manual_payment_id === payment.id);
              const activeAttempt = latestAttempt && ["scheduled", "prenotified", "processing", "pending", "authorized"].includes(latestAttempt.status);
              const canPrenotify = (payment.status === "due" || payment.status === "overdue") && subscription?.collection_method === "provider" && mandate?.status === "valid" && !activeAttempt;
              const canStartCollection = latestAttempt?.status === "prenotified" && latestAttempt.prenotification_delivery_status === "sent" && new Date(latestAttempt.scheduled_for).getTime() <= Date.now();

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={payment.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <ReceiptText className="h-5 w-5 text-primary" />
                        <h2 className="font-bold text-foreground">{participant?.display_name ?? "Leerling"}</h2>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plan?.name ?? "Subscription"} - {formatMoney(payment.amount_cents, payment.currency)} - vervalt {formatDate(payment.due_on)}
                      </p>
                      {payment.reference ? <p className="mt-1 text-xs text-muted-foreground">Referentie: {payment.reference}</p> : null}
                    </div>
                    <StatusPill tone={payment.status === "paid" ? "success" : overdue || payment.status === "overdue" ? "danger" : payment.status === "due" ? "warning" : "neutral"}>{overdue && payment.status === "due" ? "overdue" : payment.status}</StatusPill>
                  </div>
                  <form action={updateManualPaymentStatusAction} className="mt-3 grid gap-3 md:grid-cols-4">
                    <input name="paymentId" type="hidden" value={payment.id} />
                    <SelectField label="Status" name="status">
                      <option value="due">Open</option>
                      <option value="overdue">Overdue</option>
                      <option value="paid">Betaald</option>
                      <option value="waived">Kwijtgescholden</option>
                      <option value="cancelled">Geannuleerd</option>
                    </SelectField>
                    <Field label="Betaaldatum" name="paidOn" type="date" />
                    <Field label="Methode" name="method" placeholder={payment.method ?? "Bank"} />
                    <div className="flex items-end">
                      <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                        Status bijwerken
                      </button>
                    </div>
                  </form>
                  <div className="mt-3 grid gap-3 xl:grid-cols-3">
                    <form action={createInvoiceForPaymentAction} className="rounded-lg border border-border bg-muted/30 p-3">
                      <input name="paymentId" type="hidden" value={payment.id} />
                      <input name="status" type="hidden" value={payment.status === "paid" ? "paid" : "issued"} />
                      <Field label="Factuurregel" name="description" placeholder={payment.reference ?? "Zwemles betaling"} />
                      <div className="mt-3">
                        <button className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold hover:bg-muted" type="submit">
                          Factuur voorbereiden
                        </button>
                      </div>
                    </form>
                    <form action={createPaymentProviderSessionAction} className="rounded-lg border border-border bg-muted/30 p-3">
                      <input name="paymentId" type="hidden" value={payment.id} />
                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                      <SelectField label="Provider" name="providerConfigId" required>
                        <option value="">Kies provider</option>
                        {data.providerConfigs
                          .filter((provider) => provider.status === "active")
                          .map((provider) => (
                            <option key={provider.id} value={provider.id}>
                              {provider.display_name} ({provider.mode})
                            </option>
                          ))}
                      </SelectField>
                      <Field label="Return URL" name="returnUrl" placeholder="https://staging.nxttrack.nl/portaal/betalingen" />
                      <div className="mt-3">
                        <SubmitButton>Checkout aanmaken</SubmitButton>
                      </div>
                    </form>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <p className="text-sm font-bold text-foreground">Automatische incasso</p>
                      {latestAttempt ? (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Poging {latestAttempt.attempt_number}: {latestAttempt.status} · gepland {formatDateTime(latestAttempt.scheduled_for)} · e-mail {latestAttempt.prenotification_delivery_status ?? "nog niet"}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">Nog geen incassopoging voor deze betaling.</p>
                      )}
                      {latestAttempt?.failure_message ? <p className="mt-2 text-xs text-danger">{latestAttempt.failure_message}</p> : null}
                      {canStartCollection && latestAttempt ? (
                        <form action={startMollieCollectionAction} className="mt-3">
                          <input name="attemptId" type="hidden" value={latestAttempt.id} />
                          <SubmitButton>Incasso nu indienen</SubmitButton>
                        </form>
                      ) : canPrenotify ? (
                        <form action={prenotifyMollieCollectionAction} className="mt-3">
                          <input name="paymentId" type="hidden" value={payment.id} />
                          <SubmitButton>{latestAttempt ? "Nieuwe poging aankondigen" : "Incasso aankondigen"}</SubmitButton>
                        </form>
                      ) : (
                        <p className="mt-3 text-xs font-medium text-muted-foreground">
                          {mandate?.status === "valid" ? "Wacht op de geplande datum of lopende verwerking." : "Eerst is een geldige oudermachtiging nodig."}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Incassomachtigingen en pogingen" description="Alleen gemaskeerde rekeninggegevens worden getoond; volledige rekeningnummers en API-sleutels worden niet opgeslagen.">
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-bold text-foreground">Machtigingen</h3>
            {data.mandates.length === 0 ? (
              <EmptyState>Nog geen Mollie-machtigingen.</EmptyState>
            ) : (
              <DataList>
                {data.mandates.map((mandate) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={mandate.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{mandate.account_holder ?? "Rekeninghouder"} · •••• {mandate.account_last4 ?? "onbekend"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Toestemming {mandate.consent_recorded_at ? formatDateTime(mandate.consent_recorded_at) : "nog niet bevestigd"} · {mandate.method}
                      </p>
                    </div>
                    <StatusPill tone={mandate.status === "valid" ? "success" : mandate.status === "pending" ? "warning" : "neutral"}>{mandate.status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-bold text-foreground">Recente incassopogingen</h3>
            {data.collectionAttempts.length === 0 ? (
              <EmptyState>Nog geen terugkerende incassopogingen.</EmptyState>
            ) : (
              <DataList>
                {data.collectionAttempts.slice(0, 20).map((attempt) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={attempt.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Poging {attempt.attempt_number} · {formatDateTime(attempt.scheduled_for)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Voorafmelding: {attempt.prenotification_delivery_status ?? "niet verstuurd"}</p>
                      {attempt.failure_message ? <p className="mt-1 text-xs text-danger">{attempt.failure_message}</p> : null}
                    </div>
                    <StatusPill tone={attempt.status === "paid" ? "success" : ["failed", "expired", "cancelled"].includes(attempt.status) ? "danger" : "warning"}>{attempt.status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Provider payment sessions">
        {data.paymentSessions.length === 0 ? (
          <EmptyState>Nog geen provider-betaalsessies.</EmptyState>
        ) : (
          <div className="space-y-3">
            {data.paymentSessions.map((session) => {
              const participant = session.participant_id ? participantById.get(session.participant_id) : null;
              const sessionRefunds = data.refunds.filter((refund) => refund.payment_session_id === session.id);
              const reservedRefundCents = sessionRefunds
                .filter((refund) => !["failed", "cancelled"].includes(refund.status))
                .reduce((total, refund) => total + refund.amount_cents, 0);
              const refundableCents = Math.max(0, session.amount_cents - reservedRefundCents);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={session.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Betaling"}</p>
                      <h2 className="mt-1 font-bold text-foreground">
                        {paymentProviderLabel(session.provider)} - {formatMoney(session.amount_cents, session.currency)}
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.provider_session_id ?? "Nog geen provider id"} - {formatDateTime(session.created_at)}
                      </p>
                      {session.failure_message ? <p className="mt-1 text-xs text-danger">{session.failure_message}</p> : null}
                    </div>
                    <StatusPill tone={session.status === "paid" ? "success" : session.status === "failed" ? "danger" : session.status === "pending" ? "warning" : "neutral"}>{session.status}</StatusPill>
                  </div>
                  {session.status !== "failed" && session.status !== "paid" ? (
                    <div className="mt-3 grid gap-3 xl:grid-cols-[auto_1fr]">
                      {session.provider === "mollie" && session.provider_session_id ? (
                        <form action={reconcileMolliePaymentAction} className="flex items-end">
                          <input name="paymentSessionId" type="hidden" value={session.id} />
                          <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                            Status met Mollie synchroniseren
                          </button>
                        </form>
                      ) : null}
                      <form action={recordPaymentSessionFailureAction} className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
                        <input name="paymentSessionId" type="hidden" value={session.id} />
                        <Field label="Code" name="failureCode" placeholder="provider_failed" />
                        <Field label="Melding" name="failureMessage" placeholder="Betaling mislukt of verlopen" />
                        <div className="flex items-end">
                          <button className="h-10 rounded-lg border border-border bg-white px-4 text-sm font-semibold hover:bg-muted" type="submit">
                            Markeer mislukt
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}
                  {session.status === "paid" && refundableCents > 0 ? (
                    <form action={createMollieRefundAction} className="mt-3 grid gap-3 rounded-lg border border-warning/30 bg-warning/5 p-3 lg:grid-cols-[150px_1fr_150px_auto]">
                      <input name="paymentSessionId" type="hidden" value={session.id} />
                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                      <Field label={`Bedrag (max. ${formatMoney(refundableCents, session.currency)})`} name="amount" required defaultValue={(refundableCents / 100).toFixed(2)} />
                      <Field label="Reden voor terugbetaling" name="description" required placeholder="Correctie zwemlesfactuur" />
                      <Field label="Typ REFUND" name="confirmation" required />
                      <div className="flex items-end">
                        <button className="h-10 rounded-lg bg-warning px-4 text-sm font-semibold text-warning-foreground" type="submit">
                          Refund aanvragen
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {sessionRefunds.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {sessionRefunds.map((refund) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3" key={refund.id}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{formatMoney(refund.amount_cents, refund.currency)} · {refund.description}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {refund.provider_refund_id ?? "Provider-id nog onbekend"} · aangevraagd {formatDateTime(refund.requested_at)}
                            </p>
                            {refund.failure_message ? <p className="mt-1 text-xs text-danger">{refund.failure_message}</p> : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill tone={refund.status === "refunded" ? "success" : refund.status === "failed" ? "danger" : "warning"}>{refund.status}</StatusPill>
                            {!["refunded", "failed", "cancelled"].includes(refund.status) ? (
                              <form action={reconcileMollieRefundAction}>
                                <input name="refundId" type="hidden" value={refund.id} />
                                <button className="h-9 rounded-lg border border-border bg-white px-3 text-xs font-semibold hover:bg-muted" type="submit">
                                  Synchroniseren
                                </button>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Refunds en storneringen" description="Provider-geverifieerde mutaties. Refunds kunnen gedeeltelijk zijn; storneringen vereisen altijd operationele opvolging.">
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-bold text-foreground">Refundledger</h3>
            {data.refunds.length === 0 ? (
              <EmptyState>Nog geen refunds.</EmptyState>
            ) : (
              <DataList>
                {data.refunds.slice(0, 30).map((refund) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={refund.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatMoney(refund.amount_cents, refund.currency)} · {refund.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{refund.provider_refund_id ?? "reconciliatie nodig"} · {formatDateTime(refund.requested_at)}</p>
                    </div>
                    <StatusPill tone={refund.status === "refunded" ? "success" : refund.status === "failed" ? "danger" : "warning"}>{refund.status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-bold text-foreground">Chargebacks</h3>
            {data.chargebacks.length === 0 ? (
              <EmptyState>Nog geen storneringen gesynchroniseerd.</EmptyState>
            ) : (
              <DataList>
                {data.chargebacks.slice(0, 30).map((chargeback) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={chargeback.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{formatMoney(chargeback.amount_cents, chargeback.currency)} · {chargeback.provider_chargeback_id}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {chargeback.reason_code ?? "Geen redencode"} · ontvangen {formatDateTime(chargeback.occurred_at)}
                      </p>
                    </div>
                    <StatusPill tone={chargeback.status === "reversed" ? "success" : "danger"}>{chargeback.status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Facturen en export">
        <form action={createBillingExportBatchAction} className="mb-4 grid gap-3 rounded-lg border border-border bg-white p-4 md:grid-cols-[180px_1fr_1fr_auto]">
          <SelectField label="Exporttype" name="exportType">
            <option value="invoices">Facturen</option>
            <option value="payments">Betalingen</option>
            <option value="subscriptions">Abonnementen</option>
            <option value="provider_events">Provider events</option>
          </SelectField>
          <Field label="Vanaf" name="periodStart" type="date" />
          <Field label="Tot en met" name="periodEnd" type="date" />
          <div className="flex items-end">
            <button className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
              Export voorbereiden
            </button>
          </div>
        </form>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 font-bold text-foreground">Facturen</h3>
            {data.invoices.length === 0 ? (
              <EmptyState>Nog geen facturen voorbereid.</EmptyState>
            ) : (
              <DataList>
                {data.invoices.slice(0, 12).map((invoice) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={invoice.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{invoice.invoice_number ?? "Conceptfactuur"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatMoney(invoice.total_cents, invoice.currency)} - vervalt {invoice.due_on ? formatDate(invoice.due_on) : "n.v.t."}
                      </p>
                    </div>
                    <StatusPill tone={invoice.status === "paid" ? "success" : invoice.status === "issued" || invoice.status === "sent" ? "warning" : "neutral"}>{invoice.export_status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
          <div>
            <h3 className="mb-3 font-bold text-foreground">Export batches</h3>
            {data.exportBatches.length === 0 ? (
              <EmptyState>Nog geen export batches.</EmptyState>
            ) : (
              <DataList>
                {data.exportBatches.slice(0, 8).map((batch) => (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={batch.id}>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{batch.export_key}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {batch.export_type} - {batch.row_count} regels
                      </p>
                    </div>
                    <StatusPill tone={batch.status === "ready" || batch.status === "exported" ? "success" : batch.status === "failed" ? "danger" : "neutral"}>{batch.status}</StatusPill>
                  </div>
                ))}
              </DataList>
            )}
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Billing events">
        {data.billingEvents.length === 0 ? (
          <EmptyState>Nog geen billing events.</EmptyState>
        ) : (
          <DataList>
            {data.billingEvents.slice(0, 20).map((event) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={event.id}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{event.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.type} - {formatDateTime(event.occurred_at)}
                  </p>
                </div>
                <StatusPill tone={event.type === "payment_overdue" ? "danger" : event.type === "payment_paid" ? "success" : "neutral"}>{event.status}</StatusPill>
              </div>
            ))}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "danger" | "neutral" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : "text-foreground";

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
    </section>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    const message = {
      "incasso-prenotified": "De incasso is aangekondigd en staat klaar voor de geplande datum.",
      "incasso-reconciled": "De betaalstatus is opnieuw bij Mollie gecontroleerd.",
      "incasso-started": "De incasso is veilig bij Mollie gestart.",
      "refund-created": "De terugbetaling is bij Mollie aangevraagd.",
      "refund-reconciled": "De terugbetaling en eventuele storneringen zijn opnieuw gesynchroniseerd."
    }[saved] ?? `Opgeslagen: ${saved}.`;
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{message}</p>;
  }

  if (error) {
    const message = {
      "incasso-outcome-unknown": "Mollie heeft niet tijdig geantwoord. Dezelfde poging wordt eerst veilig gereconcilieerd; start geen nieuwe incasso.",
      "provider-automation-requires-incasso": "Schakel terugkerende SEPA-incasso in voordat je automatische uitvoering of retries activeert.",
      "provider-retry-policy": "Gebruik 1–5 pogingen en een wachttijd van 1–30 dagen.",
      "refund-amount": "Dit bedrag is hoger dan het nog beschikbare terug te betalen bedrag.",
      "refund-confirmation": "Typ REFUND om deze terugbetaling bewust te bevestigen.",
      "refund-idempotency": "Deze aanvraagcode hoort al bij een andere terugbetaling.",
      "refund-reconcile": "De provideruitkomst is bekend, maar de lokale synchronisatie vraagt aandacht. Gebruik ‘Synchroniseren’ voordat je opnieuw handelt.",
      "refund-unknown": "De provideruitkomst is onbekend. Synchroniseer de aanvraag voordat je opnieuw handelt."
    }[error] ?? `Actie is niet gelukt: ${error}.`;
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{message}</p>;
  }

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
