import { Award, Clock3, FileText, TrendingUp } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { GrowthAnalyticsWorkspace } from "@/components/admin/growth-analytics-workspace";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getGrowthAnalyticsData } from "@/lib/domain/growth-analytics";
import {
  approveManagementSummaryAction,
  generateManagementSummaryAction
} from "@/lib/domain/management-summary-actions";
import type { SwimFlowAnalytics } from "@/lib/domain/swim-flow-analytics-contract";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function GrowthAnalyticsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const data = await getGrowthAnalyticsData(getParam(params, "from"), getParam(params, "to"));

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <form action={generateManagementSummaryAction}>
            <Button type="submit"><FileText className="size-4" />Weekconcept maken</Button>
          </form>
        }
        kicker="School Health & Growth"
        subtitle="Van campagne en proefles naar plaatsing, diploma en uitval—uitsluitend op relationeel bewijs, met uitlegbare aggregaten."
        title="Groei, conversie & cohorten"
      />
      <RouteFeedback
        error={getParam(params, "error") ? "De rapportageactie kon niet veilig worden uitgevoerd." : null}
        success={successMessage(getParam(params, "saved"))}
      />
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-soft">
        <label className="grid gap-1 text-xs font-bold">
          Cohort vanaf
          <input className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={data.period.from} name="from" type="date" />
        </label>
        <label className="grid gap-1 text-xs font-bold">
          Cohort tot
          <input className="h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={data.period.to} name="to" type="date" />
        </label>
        <Button type="submit" variant="outline">Periode toepassen</Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={TrendingUp} label="Plaatsingsconversie" tone={data.report.metrics.placementConversion >= 50 ? "success" : "warning"} value={`${data.report.metrics.placementConversion}%`} />
        <AdminMetricCard icon={Clock3} label="Mediaan tot plaatsing" tone="info" value={data.report.metrics.medianDaysToPlace === null ? "—" : `${data.report.metrics.medianDaysToPlace} d`} />
        <AdminMetricCard icon={Award} label="Diploma’s in cohort" tone="success" value={data.report.metrics.diplomas} />
        <AdminMetricCard icon={Clock3} label="Mediaan tot diploma" tone="neutral" value={data.report.metrics.medianDaysToDiploma === null ? "—" : `${data.report.metrics.medianDaysToDiploma} d`} />
      </div>
      <FlowAnalyticsPanel flow={data.flow} />
      <GrowthAnalyticsWorkspace report={data.report} />
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Managementbrief</p>
            <h2 className="mt-1 text-lg font-bold">Wekelijkse concepten</h2>
          </div>
          <StatusPill tone="info">nooit automatisch verstuurd</StatusPill>
        </div>
        <div className="mt-4 grid gap-4">
          {data.drafts.length ? data.drafts.map((draft) => (
            <article className="rounded-xl border border-border bg-muted/20 p-4" key={draft.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold">{draft.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Gegenereerd {formatDateTime(draft.created_at)}</p>
                </div>
                <StatusPill tone={draft.status === "approved" ? "success" : "warning"}>
                  {draft.status === "approved" ? "menselijk goedgekeurd" : "concept"}
                </StatusPill>
              </div>
              <div className="mt-4 whitespace-pre-line rounded-xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
                {draft.narrative}
              </div>
              {draft.status === "draft" ? (
                <div className="mt-4">
                  <ConfirmActionForm
                    action={approveManagementSummaryAction}
                    confirmLabel="Als intern gecontroleerd markeren"
                    description="Goedkeuren verstuurt niets en publiceert niets; het legt alleen menselijke controle vast."
                    hiddenFields={{ humanConfirmation: "approve", summaryId: draft.id }}
                    title="Managementconcept goedkeuren?"
                    triggerLabel="Menselijk goedkeuren"
                  />
                </div>
              ) : null}
            </article>
          )) : (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nog geen wekelijkse managementconcepten.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function FlowAnalyticsPanel({ flow }: { flow: SwimFlowAnalytics }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Rolling twaalf maanden</p>
          <h2 className="mt-1 text-lg font-bold">Wacht-, doorstroom- en diplomaduur</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatDate(flow.windowStart)} t/m {formatDate(previousDate(flow.windowEnd))} · {flow.timeZone}
          </p>
        </div>
        <StatusPill tone="info">{flow.formulaVersion}</StatusPill>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {Object.values(flow.metrics).map((metric) => (
          <article className="rounded-xl border border-border bg-muted/20 p-4" key={metric.metricKey}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-foreground">{metric.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">n={metric.statistics.sampleSize}</p>
              </div>
              <StatusPill tone={metric.quality.cohortSize === "sufficient" ? "success" : metric.quality.cohortSize === "small" ? "warning" : "neutral"}>
                {metric.quality.cohortSize === "sufficient" ? "voldoende cohort" : metric.quality.cohortSize === "small" ? "klein cohort" : "geen cohort"}
              </StatusPill>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <FlowStat label="Gemiddeld" value={days(metric.statistics.meanDays)} />
              <FlowStat label="Mediaan" value={days(metric.statistics.medianDays)} />
              <FlowStat label="P75" value={days(metric.statistics.p75Days)} />
              <FlowStat label="P90" value={days(metric.statistics.p90Days)} />
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">{metric.definition}</p>
            <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Datadekking {metric.quality.completenessPercentage}% · {metric.quality.pauseDaysExcluded} pauzedagen uitgesloten · {metric.quality.invalidOrder} ongeldige volgordes
            </p>
          </article>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-border bg-background p-4 text-xs leading-5 text-muted-foreground">
        Cohortregel: afgeronde uitkomsten vallen op hun tenant-lokale einddatum in het venster. Open journeys blijven datakwaliteitsbewijs en vervormen de duurpercentielen niet. Testdata en imports zonder bevestigde historie zijn uitgesloten; een transfer binnen dezelfde inschrijving reset geen klok.
      </div>
    </section>
  );
}

function FlowStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-bold text-foreground">{value}</dd>
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
function successMessage(value?: string) {
  return ({
    approved: "Managementconcept menselijk gecontroleerd. Er is niets verstuurd.",
    draft: "Rule-based weekconcept aangemaakt. Controleer de inhoud vóór intern gebruik."
  } as Record<string, string>)[value ?? ""] ?? null;
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}
function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
function days(value: number | null) {
  return value === null ? "—" : `${value} dagen`;
}
