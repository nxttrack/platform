import { randomUUID } from "node:crypto";
import { CalendarDays, CalendarOff, CheckCircle2, Undo2 } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { TemporaryOfferingsPanel } from "@/components/admin/temporary-offerings-panel";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import {
  createPlanningSeasonAction,
  createSeasonBlackoutAction,
  publishSeasonBlackoutAction,
  undoSeasonBlackoutAction
} from "@/lib/domain/seasonal-planning-actions";
import { getSeasonalPlanningData } from "@/lib/domain/seasonal-planning";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function SeasonalPlanningPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([
    getSeasonalPlanningData(),
    searchParams ?? Promise.resolve({})
  ]);
  const resourceNames = new Map(data.resources.map((row) => [row.id, row.name]));
  const draftImpact = data.blackouts
    .filter((row) => row.status === "draft")
    .reduce((sum, row) => sum + row.impact, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <div className="flex gap-2">
            <AdminActionDrawer
              description="Definieer de kalenderperiode waar vakantie- en sluitingsregels onder vallen."
              title="Nieuw seizoen"
              triggerLabel="Seizoen"
            >
              <form action={createPlanningSeasonAction} className="space-y-4">
                <Field label="Naam" name="name" placeholder="Seizoen 2026–2027" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Start" name="startsOn" type="date" required />
                  <Field label="Einde" name="endsOn" type="date" required />
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input name="active" type="checkbox" />
                  Direct actief
                </label>
                <SubmitButton>Seizoen opslaan</SubmitButton>
              </form>
            </AdminActionDrawer>
            <AdminActionDrawer
              description="Maak eerst een concept. Les-, deelnemer- en financiële impact worden opnieuw transactioneel bepaald bij publicatie."
              title="Vakantie of sluiting"
              triggerLabel="Sluiting"
              width="wide"
            >
              <form action={createSeasonBlackoutAction} className="space-y-4">
                <Field label="Naam" name="name" placeholder="Kerstvakantie" required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField label="Seizoen" name="seasonId" required>
                    <option value="">Kies seizoen</option>
                    {data.seasons.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </SelectField>
                  <SelectField label="Locatie" name="resourceId">
                    <option value="">Alle locaties</option>
                    {data.resources.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </SelectField>
                  <Field label="Vanaf (lokale tenanttijd)" name="startsAt" type="datetime-local" required />
                  <Field label="Tot (lokale tenanttijd)" name="endsAt" type="datetime-local" required />
                  <SelectField defaultValue="review" label="Lesbehandeling" name="sessionHandling">
                    <option value="review">Alleen impact beoordelen</option>
                    <option value="cancel">Lessen annuleren na bevestiging</option>
                  </SelectField>
                  <SelectField defaultValue="no_change" label="Financieel beleid" name="financialHandling">
                    <option value="no_change">Geen financiële wijziging</option>
                    <option value="manual_review">Handmatige beoordeling</option>
                    <option value="credit_per_lesson">Vast creditbedrag per les</option>
                    <option value="refund_review">Refundbeoordeling</option>
                  </SelectField>
                  <Field label="Credit per les (alleen bij vast beleid)" name="creditPerLesson" placeholder="12,50" />
                </div>
                <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                  Een financiële keuze maakt alleen controlevoorstellen. Definitieve facturen worden nooit herschreven; een goedgekeurde correctie loopt via creditnota en eventueel de bestaande Mollie-refund.
                </p>
                <TextAreaField label="Interne reden" name="reason" />
                <SubmitButton>Als concept opslaan</SubmitButton>
              </form>
            </AdminActionDrawer>
          </div>
        }
        kicker="Roosterbeheer"
        subtitle="Plan sluitingen per locatie, bekijk de operationele én financiële impact en publiceer atomair met herstelbare historie."
        title="Seizoenen & vakantieroosters"
      />

      <RouteFeedback
        error={getParam(params, "error") ? "De roosteractie kon niet veilig worden uitgevoerd." : null}
        success={successMessage(
          getParam(params, "saved"),
          getParam(params, "changed"),
          getParam(params, "proposals")
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={CalendarDays} label="Seizoenen" tone="info" value={data.seasons.length} />
        <AdminMetricCard icon={CalendarOff} label="Sluitingsperiodes" tone="neutral" value={data.blackouts.length} />
        <AdminMetricCard icon={CheckCircle2} label="Gepubliceerd" tone="success" value={data.blackouts.filter((row) => row.status === "published").length} />
        <AdminMetricCard icon={Undo2} label="Conceptimpact" tone={draftImpact ? "warning" : "success"} value={`${draftImpact} lessen`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.7fr_1.3fr]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-bold">Seizoenskalender</h2>
          <div className="mt-4 grid gap-3">
            {data.seasons.length ? data.seasons.map((season) => (
              <article className="rounded-xl border border-border bg-muted/20 p-4" key={season.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{season.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(season.starts_on)} – {formatDate(season.ends_on)}</p>
                  </div>
                  <StatusPill tone={season.status === "active" ? "success" : "neutral"}>{season.status}</StatusPill>
                </div>
              </article>
            )) : <Empty>Maak eerst een seizoen.</Empty>}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-lg font-bold">Vakanties en sluitingen</h2>
          <div className="mt-4 grid gap-3">
            {data.blackouts.length ? data.blackouts.map((blackout) => {
              const preview = blackout.impactPreview;
              const participantCount = numberValue(preview.participantCount);
              const estimatedGross = numberValue(preview.estimatedGrossImpactCents);

              return (
                <article className="rounded-xl border border-border bg-muted/20 p-4" key={blackout.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{blackout.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatDateTime(blackout.starts_at)} – {formatDateTime(blackout.ends_at)} · {blackout.resource_id ? resourceNames.get(blackout.resource_id) : "alle locaties"}
                      </p>
                    </div>
                    <StatusPill tone={blackout.status === "published" ? "success" : blackout.status === "draft" ? "warning" : "neutral"}>{blackout.status}</StatusPill>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <StatusPill tone={blackout.impact ? "warning" : "success"}>{blackout.impact} lessen</StatusPill>
                    <StatusPill tone={participantCount ? "warning" : "neutral"}>{participantCount} deelnemers</StatusPill>
                    <StatusPill tone="info">{financialLabel(blackout.financial_handling)}</StatusPill>
                    {estimatedGross > 0 ? <StatusPill tone="warning">indicatie {formatMoney(estimatedGross)}</StatusPill> : null}
                    {blackout.appliedChanges ? <StatusPill tone="neutral">{blackout.appliedChanges} roosterwijzigingen</StatusPill> : null}
                    {blackout.financialProposals.count ? <StatusPill tone="warning">{blackout.financialProposals.count} financiële reviews</StatusPill> : null}
                  </div>

                  <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    Historie verwijderd: nee · definitieve facturen gewijzigd: nee
                    {blackout.financialProposals.incomplete ? ` · ${blackout.financialProposals.incomplete} reviews met onvolledige prijsdata` : ""}
                  </p>
                  {blackout.reason ? <p className="mt-3 text-sm text-muted-foreground">{blackout.reason}</p> : null}

                  {blackout.status === "draft" ? (
                    <div className="mt-4">
                      <ConfirmActionForm
                        action={publishSeasonBlackoutAction}
                        confirmLabel={blackout.session_handling === "cancel" ? `${blackout.impact} lessen annuleren` : "Periode publiceren"}
                        description={blackout.session_handling === "cancel"
                          ? "De actuele impact wordt onder locks herberekend. Lessen krijgen een herstelbare uitzondering; financiële gevolgen worden alleen als reviewvoorstel vastgelegd."
                          : "Er worden geen lessen of financiële documenten gewijzigd; de periode wordt als planningsregel gepubliceerd."}
                        hiddenFields={{
                          blackoutId: blackout.id,
                          humanConfirmation: "publish",
                          idempotencyKey: randomUUID()
                        }}
                        title={`${blackout.name} publiceren?`}
                        triggerLabel="Controleren en publiceren"
                      />
                    </div>
                  ) : null}
                  {blackout.status === "published" && blackout.appliedChanges ? (
                    <div className="mt-4">
                      <ConfirmActionForm
                        action={undoSeasonBlackoutAction}
                        confirmLabel="Roosterwijzigingen herstellen"
                        description="Alleen lessen die nog exact de door deze actie ingestelde status hebben, worden hersteld. Open financiële voorstellen worden gesloten; bestaande documenten blijven onaangetast."
                        hiddenFields={{ blackoutId: blackout.id, humanConfirmation: "undo" }}
                        title={`${blackout.name} terugdraaien?`}
                        triggerLabel="Undo"
                        triggerVariant="outline"
                      />
                    </div>
                  ) : null}
                </article>
              );
            }) : <Empty>Nog geen vakanties of sluitingen.</Empty>}
          </div>
        </section>
      </div>
      <TemporaryOfferingsPanel />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("nl-NL", { currency: "EUR", style: "currency" }).format(cents / 100);
}

function financialLabel(value: string) {
  return {
    credit_per_lesson: "vast creditvoorstel",
    manual_review: "financiële review",
    no_change: "geen financiële wijziging",
    refund_review: "refundreview"
  }[value] ?? value;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function successMessage(value?: string, changed?: string, proposals?: string) {
  return ({
    season: "Seizoen opgeslagen.",
    blackout: "Sluitingsperiode als concept opgeslagen; controleer nu de impact.",
    published: `Sluitingsperiode gepubliceerd; ${changed ?? "0"} lessen veilig gewijzigd en ${proposals ?? "0"} financiële reviews vastgelegd.`,
    undone: `Roosterwijzigingen teruggedraaid; ${changed ?? "0"} lessen hersteld.`
  } as Record<string, string>)[value ?? ""] ?? null;
}
