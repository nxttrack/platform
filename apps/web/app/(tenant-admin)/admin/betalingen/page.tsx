import { CreditCard, ReceiptText } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createManualPaymentAction, createPaymentPlanAction, createSubscriptionAction, updateManualPaymentStatusAction } from "@/lib/domain/billing-actions";
import { formatMoney, getBillingAdminData, isPaymentOverdue } from "@/lib/domain/billing";

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
      <PageHeader kicker="Billing" title="Betalingen en subscriptions" subtitle="Handmatige commerciële basis zonder Mollie/iDEAL-koppeling." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Payment plans" value={data.paymentPlans.length.toString()} />
        <Metric label="Actieve subscriptions" value={data.subscriptions.filter((subscription) => subscription.status === "active").length.toString()} />
        <Metric label="Openstaand" value={formatMoney(openAmount)} />
        <Metric label="Overdue" tone={overdueAmount > 0 ? "danger" : "success"} value={formatMoney(overdueAmount)} />
      </div>

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
              <Field label="Startdatum" name="startsOn" type="date" />
              <Field label="Volgende vervaldatum" name="nextDueOn" type="date" />
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
                </article>
              );
            })}
          </div>
        )}
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
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
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
