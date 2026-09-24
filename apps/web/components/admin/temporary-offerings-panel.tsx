import { randomUUID } from "node:crypto";
import { CalendarPlus2, CreditCard, Users } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import {
  createTemporaryOfferingAction,
  publishTemporaryOfferingAction
} from "@/lib/domain/temporary-offering-actions";
import {
  calculateOfferingDisplayPrice,
  getTemporaryOfferingAdminData
} from "@/lib/domain/temporary-offerings";

export async function TemporaryOfferingsPanel() {
  const data = await getTemporaryOfferingAdminData();
  const groupNames = new Map(data.groups.map((group) => [group.id, group.name]));

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Vakantie- en turboaanbod</p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Tijdelijke cursussen</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Gebruik dezelfde gestructureerde groep, lesmomenten en fysieke capaciteitslimiet. Publicatie controleert rooster, factuurprofiel en betaalprovider opnieuw.
          </p>
        </div>
        <AdminActionDrawer
          description="Koppel verkoopvoorwaarden aan een reeds conflictvrij gepubliceerde vakantie-, turbo- of seriegroep."
          title="Tijdelijk aanbod maken"
          triggerLabel="Aanbod"
          width="wide"
        >
          <form action={createTemporaryOfferingAction} className="grid gap-4">
            <SelectField label="Tijdelijke groep" name="groupId" required>
              <option value="">Kies groep</option>
              {data.groups.filter((group) => !data.offerings.some((offering) => offering.group_id === group.id)).map((group) => (
                <option key={group.id} value={group.id}>{group.name} · {group.offering_type}</option>
              ))}
            </SelectField>
            <Field label="Titel voor ouders" name="title" required placeholder="Turbo A-diploma · meivakantie" />
            <TextAreaField label="Beschrijving" name="description" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Boeken vanaf (lokale tenanttijd)" name="bookingOpensAt" type="datetime-local" />
              <Field label="Boeken tot (lokale tenanttijd)" name="bookingClosesAt" type="datetime-local" />
              <SelectField defaultValue="free" label="Prijsmodel" name="pricingModel">
                <option value="free">Gratis</option>
                <option value="per_lesson">Prijs per les</option>
                <option value="package">Pakketprijs</option>
              </SelectField>
              <Field label="Brutoprijs incl. btw" name="price" placeholder="95,00" />
              <SelectField defaultValue="free" label="Betaling" name="paymentMode">
                <option value="free">Gratis</option>
                <option value="manual">Handmatige betaling</option>
                <option value="direct_mollie">Direct via Mollie</option>
                <option value="periodic_debit">Periodieke incasso</option>
              </SelectField>
              <SelectField label="Betaalplan (verplicht bij betaald)" name="paymentPlanId">
                <option value="">Kies betaalplan</option>
                {data.paymentPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.name} · {formatMoney(plan.amount_cents, plan.currency)} · {plan.billing_interval}</option>
                ))}
              </SelectField>
              <SelectField label="Mollie-config (direct/incasso)" name="providerConfigId">
                <option value="">Geen provider</option>
                {data.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>{provider.display_name} · {provider.mode}</option>
                ))}
              </SelectField>
              <SelectField defaultValue="2100" label="Btw" name="vatRateBasisPoints">
                <option value="2100">21%</option>
                <option value="900">9%</option>
                <option value="0">0%</option>
              </SelectField>
              <Field defaultValue={1440} label="Plaats vasthouden (minuten)" name="seatHoldMinutes" type="number" />
              <Field defaultValue="offering_terms_v1" label="Voorwaardenversie" name="termsVersion" />
              <SelectField defaultValue="manual_review" label="Annuleringsbeleid" name="cancellationPolicy">
                <option value="manual_review">Handmatige beoordeling</option>
                <option value="refund_until_start">Refund tot start</option>
                <option value="non_refundable">Niet restitueerbaar</option>
              </SelectField>
            </div>
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
              Bij directe Mollie-betaling blijft de stoel maximaal de ingestelde tijd gereserveerd. Alleen een geverifieerde betaalstatus maakt de groepsplaats definitief.
            </p>
            <SubmitButton>Conceptaanbod opslaan</SubmitButton>
          </form>
        </AdminActionDrawer>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {data.offerings.length === 0 ? (
          <p className="col-span-full rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Maak eerst een tijdelijke groep met gepubliceerde lesmomenten en voeg daarna het aanbod toe.
          </p>
        ) : data.offerings.map((offering) => {
          const evaluation = data.evaluations[offering.id] ?? {};
          const occurrenceCount = numberValue(evaluation.occurrenceCount);
          const totalPrice = numberValue(evaluation.totalPriceCents) || calculateOfferingDisplayPrice(offering, occurrenceCount);
          const registrations = data.registrations.filter((registration) => registration.offering_id === offering.id);
          const blocking = arrayValue(evaluation.blocking);
          const warnings = arrayValue(evaluation.warnings);

          return (
            <article className="rounded-xl border border-border bg-muted/20 p-4" key={offering.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-foreground">{offering.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{groupNames.get(offering.group_id) ?? "Tijdelijke groep"}</p>
                </div>
                <StatusPill tone={offering.status === "published" ? "success" : "warning"}>{offering.status}</StatusPill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Metric icon={<CalendarPlus2 className="size-4" />} label="Lessen" value={String(occurrenceCount)} />
                <Metric icon={<CreditCard className="size-4" />} label="Totaal" value={offering.pricing_model === "free" ? "Gratis" : formatMoney(totalPrice, offering.currency)} />
                <Metric icon={<Users className="size-4" />} label="Inschrijvingen" value={String(registrations.filter((row) => !["expired", "cancelled"].includes(row.status)).length)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatusPill tone="info">{offering.pricing_model}</StatusPill>
                <StatusPill tone="neutral">{offering.payment_mode}</StatusPill>
                <StatusPill tone="neutral">btw {offering.vat_rate_basis_points / 100}%</StatusPill>
                <StatusPill tone={blocking.length ? "danger" : "success"}>{blocking.length ? `${blocking.length} blokkades` : "publiceerbaar"}</StatusPill>
                {warnings.length ? <StatusPill tone="warning">{warnings.length} waarschuwingen</StatusPill> : null}
              </div>
              {blocking.map((item, index) => (
                <p className="mt-2 rounded-lg border border-danger/20 bg-danger/5 px-3 py-2 text-xs text-danger" key={index}>{recordMessage(item)}</p>
              ))}
              {offering.status === "draft" && blocking.length === 0 ? (
                <div className="mt-4">
                  <ConfirmActionForm
                    action={publishTemporaryOfferingAction}
                    confirmLabel="Aanbod publiceren"
                    description={`Publicatie maakt ${occurrenceCount} lesmomenten boekbaar. Prijs, voorwaarden en gekoppelde provider worden daarna immutable.`}
                    hiddenFields={{
                      humanConfirmation: "publish",
                      idempotencyKey: randomUUID(),
                      offeringId: offering.id
                    }}
                    title={`${offering.title} publiceren?`}
                    triggerLabel="Controleren en publiceren"
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span></div>
      <p className="mt-2 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { currency, style: "currency" }).format(cents / 100);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function recordMessage(value: unknown) {
  return typeof value === "object" && value !== null && "message" in value
    ? String((value as { message?: unknown }).message)
    : "Controle vereist.";
}
