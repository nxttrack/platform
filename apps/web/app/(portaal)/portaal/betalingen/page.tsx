import { randomUUID } from "node:crypto";
import { CreditCard, ReceiptText } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { formatMoney, isPaymentOverdue } from "@/lib/domain/billing";
import { revokeMollieMandateAction, startMollieMandateAction } from "@/lib/domain/billing-recurring-actions";
import { getSafeMollieCheckoutUrl } from "@/lib/domain/mollie-contract";
import { getParentPortalData } from "@/lib/domain/parent-portal";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ParentPaymentsPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const planById = new Map(data.paymentPlans.map((plan) => [plan.id, plan]));
  const subscriptionById = new Map(data.subscriptions.map((subscription) => [subscription.id, subscription]));
  const mandateById = new Map(data.mandates.map((mandate) => [mandate.id, mandate]));
  const openPayments = data.manualPayments.filter((payment) => payment.status === "due" || payment.status === "overdue");
  const overduePayments = data.manualPayments.filter((payment) => payment.status === "overdue" || isPaymentOverdue(payment));
  const paidPayments = data.manualPayments.filter((payment) => payment.status === "paid");
  const openAmount = openPayments.reduce((total, payment) => total + payment.amount_cents, 0);
  const overdueAmount = overduePayments.reduce((total, payment) => total + payment.amount_cents, 0);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Betalingen" title="Abonnementen en betalingen" subtitle="Bekijk abonnementen, openstaande bedragen, facturen en betaalpogingen." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Abonnementen" value={data.subscriptions.length.toString()} />
        <Metric label="Openstaand" value={formatMoney(openAmount)} />
        <Metric label="Overdue" tone={overdueAmount > 0 ? "danger" : "success"} value={formatMoney(overdueAmount)} />
        <Metric label="Betaald" value={paidPayments.length.toString()} />
        <Metric label="Facturen" value={data.invoices.length.toString()} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Abonnementen</h2>
        </div>
        {data.subscriptions.length === 0 ? (
          <EmptyState>Er zijn nog geen abonnementen gekoppeld.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.subscriptions.map((subscription) => {
              const participant = participantById.get(subscription.participant_id);
              const plan = planById.get(subscription.payment_plan_id);
              const mandate = subscription.billing_mandate_id ? mandateById.get(subscription.billing_mandate_id) : null;
              const openPayment = openPayments.find((payment) => payment.subscription_id === subscription.id);
              const pendingFirstSession = data.paymentSessions.find(
                (session) => session.subscription_id === subscription.id && session.sequence_type === "first" && ["pending", "authorized"].includes(session.status)
              );

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={subscription.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 font-bold text-foreground">{plan?.name ?? "Subscription"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatMoney(subscription.amount_cents, subscription.currency)} - {subscription.billing_interval} - {mandate?.status === "valid" ? "automatische incasso actief" : subscription.collection_method === "provider" ? "incasso nog activeren" : "handmatig"}
                      </p>
                    </div>
                    <StatusPill tone={subscription.status === "active" ? "success" : "neutral"}>{subscription.status}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Detail label="Start" value={formatDate(subscription.starts_on)} />
                    <Detail label="Volgende vervaldatum" value={subscription.next_due_on ? formatDate(subscription.next_due_on) : "Niet gezet"} />
                  </div>
                  {mandate?.status === "valid" ? (
                    <div className="mt-4 rounded-lg border border-success/20 bg-success/5 p-3">
                      <p className="text-sm font-bold text-foreground">SEPA-machtiging actief · •••• {mandate.account_last4 ?? "onbekend"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Vastgelegd {mandate.consent_recorded_at ? formatDateTime(mandate.consent_recorded_at) : "via Mollie"}; toekomstige bedragen worden vooraf aangekondigd.
                      </p>
                      <form action={revokeMollieMandateAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input name="mandateId" type="hidden" value={mandate.id} />
                        <label className="text-xs font-semibold text-muted-foreground">
                          Typ REVOKE om de machtiging in te trekken
                          <input className="mt-1 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm text-foreground" name="confirmRevoke" required />
                        </label>
                        <button className="self-end rounded-lg border border-danger/30 bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/5" type="submit">
                          Machtiging intrekken
                        </button>
                      </form>
                    </div>
                  ) : subscription.collection_method === "provider" && openPayment ? (
                    <form action={startMollieMandateAction} className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <input name="subscriptionId" type="hidden" value={subscription.id} />
                      <input name="paymentId" type="hidden" value={openPayment.id} />
                      <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                      <input name="customerIdempotencyKey" type="hidden" value={randomUUID()} />
                      <p className="text-sm font-bold text-foreground">{pendingFirstSession ? "Rond de eerste betaling af" : "Automatische incasso activeren"}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        De eerste betaling is {formatMoney(openPayment.amount_cents, openPayment.currency)}. Daarmee geef je {data.tenant.name} toestemming om toekomstige bedragen volgens dit abonnement via SEPA af te schrijven. Iedere incasso wordt vooraf aangekondigd en je kunt de machtiging hier weer intrekken.
                      </p>
                      {!pendingFirstSession ? (
                        <>
                          <label className="mt-3 flex items-start gap-2 text-xs font-medium leading-5 text-foreground">
                            <input className="mt-1 h-4 w-4 shrink-0 accent-primary" name="consentAccepted" required type="checkbox" value="accepted" />
                            Ik ga akkoord met de eerste betaling en de terugkerende SEPA-incasso voor dit abonnement.
                          </label>
                          <button className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90" type="submit">
                            Veilig activeren via Mollie
                          </button>
                        </>
                      ) : (
                        <p className="mt-3 text-xs font-semibold text-warning">Gebruik de betaallink hieronder om de activatie af te ronden.</p>
                      )}
                    </form>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold text-foreground">Aangekondigde incasso’s</h2>
        {data.collectionAttempts.length === 0 ? (
          <EmptyState>Er zijn nog geen automatische incasso’s aangekondigd.</EmptyState>
        ) : (
          <div className="mt-4 space-y-3">
            {data.collectionAttempts.map((attempt) => {
              const subscription = subscriptionById.get(attempt.subscription_id);
              const participant = subscription ? participantById.get(subscription.participant_id) : null;

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={attempt.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Incasso"}</p>
                      <p className="mt-1 text-sm font-bold text-foreground">Gepland op of kort na {formatDate(attempt.scheduled_for)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Voorafmelding: {attempt.prenotification_delivery_status === "sent" ? "per e-mail verstuurd" : "nog niet per e-mail bevestigd"}</p>
                      {attempt.failure_message ? <p className="mt-2 text-xs text-danger">{attempt.failure_message}</p> : null}
                    </div>
                    <StatusPill tone={attempt.status === "paid" ? "success" : ["failed", "expired", "cancelled"].includes(attempt.status) ? "danger" : "warning"}>{attempt.status}</StatusPill>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Betaalstatus</h2>
        </div>
        {data.manualPayments.length === 0 ? (
          <EmptyState>Er zijn nog geen handmatige betalingen geregistreerd.</EmptyState>
        ) : (
          <div className="space-y-3">
            {data.manualPayments.map((payment) => {
              const participant = participantById.get(payment.participant_id);
              const subscription = subscriptionById.get(payment.subscription_id);
              const plan = subscription ? planById.get(subscription.payment_plan_id) : null;
              const overdue = isPaymentOverdue(payment);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={payment.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 font-bold text-foreground">{formatMoney(payment.amount_cents, payment.currency)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {plan?.name ?? "Subscription"} - vervalt {formatDate(payment.due_on)}
                      </p>
                    </div>
                    <StatusPill tone={payment.status === "paid" ? "success" : overdue || payment.status === "overdue" ? "danger" : payment.status === "due" ? "warning" : "neutral"}>{overdue && payment.status === "due" ? "overdue" : payment.status}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Detail label="Betaaldatum" value={payment.paid_on ? formatDate(payment.paid_on) : "Niet betaald"} />
                    <Detail label="Methode" value={payment.method ?? "Niet gezet"} />
                    <Detail label="Referentie" value={payment.reference ?? "Niet gezet"} />
                  </div>
                  {payment.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{payment.notes}</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold text-foreground">Facturen</h2>
        {data.invoices.length === 0 ? (
          <EmptyState>Er zijn nog geen facturen beschikbaar.</EmptyState>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.invoices.map((invoice) => (
              <article className="rounded-lg border border-border bg-white p-4" key={invoice.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{invoice.invoice_number ?? "Conceptfactuur"}</p>
                    <h3 className="mt-1 font-bold text-foreground">{formatMoney(invoice.total_cents, invoice.currency)}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Vervalt {invoice.due_on ? formatDate(invoice.due_on) : "n.v.t."}</p>
                  </div>
                  <StatusPill tone={invoice.status === "paid" ? "success" : invoice.status === "issued" || invoice.status === "sent" ? "warning" : "neutral"}>{invoice.status}</StatusPill>
                </div>
                {invoice.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{invoice.notes}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold text-foreground">Betaalpogingen</h2>
        {data.paymentSessions.length === 0 ? (
          <EmptyState>Er zijn nog geen provider-betaalpogingen gestart.</EmptyState>
        ) : (
          <div className="mt-4 space-y-3">
            {data.paymentSessions.map((session) => {
              const participant = session.participant_id ? participantById.get(session.participant_id) : null;
              const checkoutUrl = getSafeMollieCheckoutUrl({
                checkoutUrl: session.checkout_url,
                expiresAt: session.expires_at,
                provider: session.provider,
                status: session.status
              });

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={session.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Betaling"}</p>
                      <h3 className="mt-1 font-bold text-foreground">{formatMoney(session.amount_cents, session.currency)}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {session.provider} - gestart {formatDateTime(session.created_at)}
                      </p>
                    </div>
                    <StatusPill tone={session.status === "paid" ? "success" : session.status === "failed" ? "danger" : session.status === "pending" ? "warning" : "neutral"}>{session.status}</StatusPill>
                  </div>
                  {session.failure_message ? <p className="mt-3 text-sm leading-6 text-danger">{session.failure_message}</p> : null}
                  {checkoutUrl ? (
                    <a
                      className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                      href={checkoutUrl}
                      rel="noreferrer"
                    >
                      Veilig betalen via Mollie
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-bold text-foreground">Billing events</h2>
        {data.billingEvents.length === 0 ? (
          <EmptyState>Nog geen billing events.</EmptyState>
        ) : (
          <div className="mt-4 divide-y divide-border rounded-lg border border-border bg-white">
            {data.billingEvents.slice(0, 12).map((event) => (
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
          </div>
        )}
      </section>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  const savedMessages: Record<string, string> = {
    "incasso-started": "Mollie is geopend voor de eerste betaling en incassomachtiging.",
    "mandate-revoked": "De incassomachtiging is ingetrokken; betalingen staan weer op handmatig."
  };
  const errorMessages: Record<string, string> = {
    "incasso-already-started": "Er loopt al een betaalpoging. Gebruik de bestaande Mollie-link hieronder.",
    "incasso-consent": "Bevestig expliciet dat je akkoord gaat met de terugkerende incasso.",
    "incasso-customer": "Het Mollie-klantprofiel kon niet veilig worden aangemaakt.",
    "incasso-disabled": "Automatische incasso is nog niet door de zwemschool ingeschakeld.",
    "incasso-not-ready": "Dit abonnement of deze betaling is nog niet klaar voor incasso.",
    "incasso-provider": "De Mollie-configuratie is niet compleet.",
    "incasso-provider-api": "Mollie kon de aanvraag niet verwerken. Probeer later opnieuw.",
    "incasso-session": "De betaalpoging kon niet worden vastgelegd.",
    "mandate": "Deze machtiging is niet beschikbaar.",
    "mandate-confirmation": "Typ exact REVOKE om de machtiging in te trekken.",
    "mandate-provider": "De providergegevens voor deze machtiging ontbreken.",
    "mandate-provider-api": "Mollie kon de machtiging niet intrekken.",
    "mandate-update": "De machtigingsstatus kon niet worden bijgewerkt."
  };

  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{savedMessages[saved] ?? "Opgeslagen."}</p>;
  }
  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{errorMessages[error] ?? "De actie kon niet worden uitgevoerd."}</p>;
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
