import { AlertTriangle, CheckCircle2, Clock3, Radar, Sparkles } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { DailyOperationalCockpit } from "@/components/admin/daily-operational-cockpit";
import { CapacityChart, StatusDonutChart } from "@/components/admin/operational-charts";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { buildAdminChartData } from "@/lib/domain/admin-chart-data";
import { getAdminOperationsData } from "@/lib/domain/admin-operations";
import { getActiveTenant } from "@/lib/domain/core";
import { getDailyOperationalCockpit } from "@/lib/domain/operational-cockpit";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminHomePage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const [data, operations] = await Promise.all([
    getDailyOperationalCockpit(tenant.id),
    getAdminOperationsData()
  ]);
  const charts = buildAdminChartData(operations);
  const filter = getParam(params, "filter") ?? "all";
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Dagelijkse cockpit"
        title="Vandaag belangrijk"
        subtitle={`Eén geprioriteerde werkbak voor ${tenant.name}. Brondata en redenen blijven zichtbaar; opvolging blijft altijd een menselijke keuze.`}
      />
      <RouteFeedback error={error ? "De cockpitstatus kon niet veilig worden opgeslagen." : null} success={saved ? successMessage(saved) : null} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard icon={AlertTriangle} label="Nu handelen" tone={data.metrics.now ? "danger" : "success"} value={data.metrics.now} />
        <AdminMetricCard icon={Clock3} label="Vandaag" tone={data.metrics.today ? "warning" : "success"} value={data.metrics.today} />
        <AdminMetricCard icon={Radar} label="Deze week" tone="info" value={data.metrics.thisWeek} />
        <AdminMetricCard icon={Sparkles} label="Kritieke signalen" tone={data.metrics.critical ? "danger" : "success"} value={data.metrics.critical} />
        <AdminMetricCard icon={CheckCircle2} label="Gezien" tone="success" value={data.metrics.acknowledged} />
      </div>
      <section aria-labelledby="operational-overview-title" className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Operationele context</p>
          <h2 className="mt-1 text-xl font-bold" id="operational-overview-title">Capaciteit en instroom vandaag</h2>
          <p className="mt-1 text-sm text-muted-foreground">Werkelijke tenantdata naast de geprioriteerde signalen. Iedere visualisatie heeft een toegankelijke tabelweergave.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="rounded-xl border border-border bg-muted/20 p-4"><CapacityChart data={charts.capacity} /></div>
          <div className="rounded-xl border border-border bg-muted/20 p-4"><StatusDonutChart data={charts.intake} title="Intakestatus" description="Actuele verdeling van alle intake-aanvragen." /></div>
        </div>
      </section>
      <DailyOperationalCockpit filter={filter} generatedAt={data.generatedAt} signals={data.signals} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  return ({
    acknowledged: "Het signaal is als gezien gemarkeerd en blijft zichtbaar tot afhandeling.",
    snoozed: "Het signaal is tijdelijk gesnoozed en komt automatisch terug.",
    resolved: "Het signaal is voor deze bronversie afgehandeld."
  } as Record<string, string>)[code] ?? "Cockpitstatus opgeslagen.";
}
