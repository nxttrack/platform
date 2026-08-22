import { addAmsterdamCalendarDays, toAmsterdamDate } from "@/lib/date/business-date";
import { BadgeEuro, MousePointerClick, ShieldCheck, UserRoundCheck } from "lucide-react";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { CampaignRevenueTable } from "@/components/admin/campaign-revenue-table";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getCampaignRevenueReport } from "@/lib/analytics/campaign-revenue";
import { getActiveTenant } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function CampaignRevenuePage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/rapportages/campagnes");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const today = new Date();
  const defaultFrom = addAmsterdamCalendarDays(today, -89);
  const from = validDate(getParam(params, "from")) ?? defaultFrom;
  const to = validDate(getParam(params, "to")) ?? toAmsterdamDate(today);
  const report = await getCampaignRevenueReport({ tenantId: tenant.id, from, to });

  return (
    <div className="space-y-5">
      <PageHeader kicker="Inzichten" title="Campagnes" subtitle="Volg privacy-veilige first-party brondata van intake naar relationeel bewezen plaatsing, abonnement en netto ontvangen betaling." />
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-soft" method="get">
        <label className="grid gap-1.5 text-xs font-semibold">Cohort vanaf<input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={from} max={to} name="from" type="date" /></label>
        <label className="grid gap-1.5 text-xs font-semibold">Cohort tot<input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={to} min={from} name="to" type="date" /></label>
        <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">Periode toepassen</button>
        <span className="ml-auto text-xs text-muted-foreground">Cohort op server-ontvangstdatum; vervolgstappen lopen door tot nu.</span>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={MousePointerClick} label="Intakes" value={report.totalIntakes} />
        <AdminMetricCard icon={UserRoundCheck} label="Bewezen plaatsingen" tone="success" value={report.totalPlacements} />
        <AdminMetricCard icon={ShieldCheck} label="Actieve abonnementen" tone="info" value={report.totalActiveSubscriptions} />
        <AdminMetricCard icon={BadgeEuro} label="Netto ontvangen" value={formatMoneyMap(report.netReceivedByCurrency)} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm">
        <StatusPill tone="info">Privacy-first</StatusPill>
        <p className="font-semibold">{report.visitorsExplanation}</p>
        <p className="text-xs text-muted-foreground">First-party bron bij een werkelijk verstuurde intake blijft wel beschikbaar; ruwe click-ID’s, querystrings en persoonsgegevens worden niet opgeslagen.</p>
      </div>
      {report.orphanConvertedEvidence > 0 ? <p className="rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm font-semibold text-warning-foreground">{report.orphanConvertedEvidence} conversiesignaal/signalen missen relationele lineage en tellen daarom bewust niet als plaatsing of omzet.</p> : null}

      <AdminListSurface>
        <CampaignRevenueTable rows={report.campaigns} />
      </AdminListSurface>
    </div>
  );
}

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatMoneyMap(values: Record<string, number>) {
  const entries = Object.entries(values);
  if (entries.length === 0) return "€ 0,00";
  return entries.map(([currency, cents]) => new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100)).join(" · ");
}
