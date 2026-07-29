import { Armchair, Clock3, Gauge, Sparkles } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptySeatRecoveryWorkspace } from "@/components/admin/empty-seat-recovery-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getEmptySeatRecoveryData } from "@/lib/domain/empty-seat-recovery";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function EmptySeatRecoveryPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/plekherstel");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const data = await getEmptySeatRecoveryData(tenant.id);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Planning intelligence"
        title="Empty Seat Recovery"
        subtitle="Vul vrijgekomen capaciteit sneller met transparante matches uit wachtlijst, inhaalcredits, voorkeuren, FIFO en gezinsplanning."
      />
      <RouteFeedback error={error ? errorMessage(error) : null} success={saved ? successMessage(saved) : null} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Armchair} label="Open plekken" tone={data.metrics.openSeats ? "warning" : "success"} value={data.metrics.openSeats} />
        <AdminMetricCard icon={Sparkles} label="Passende kandidaten" tone="info" value={data.metrics.actionable} />
        <AdminMetricCard icon={Clock3} label="Binnen 24 uur" tone={data.metrics.urgent ? "success" : "neutral"} value={data.metrics.urgent} />
        <AdminMetricCard icon={Gauge} label="Afhandelratio" tone="success" value={`${data.metrics.recoveryRate}%`} />
      </div>
      <EmptySeatRecoveryWorkspace snapshots={data.snapshots} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  if (code.startsWith("refreshed_")) return `${code.slice("refreshed_".length)} herstelanalyses zijn veilig ververst.`;
  const messages: Record<string, string> = {
    task: "De menselijke reviewtaak staat klaar. Er is niets automatisch verstuurd of geboekt.",
    dismissed: "De kandidaat is voor deze herstelkans genegeerd.",
    resolved: "De herstelkans is als afgehandeld gemarkeerd."
  };
  return messages[code] ?? "Wijziging opgeslagen.";
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    refresh: "De analyse kon niet veilig worden ververst.",
    confirmation: "De vereiste menselijke bevestiging ontbreekt.",
    candidate: "Deze kandidaat is niet meer beschikbaar of heeft een blocker.",
    task: "De reviewtaak kon niet worden aangemaakt.",
    dismiss: "De kandidaat kon niet worden genegeerd.",
    resolve: "De herstelkans kon niet worden afgerond."
  };
  return messages[code] ?? `Actie niet uitgevoerd: ${code}.`;
}
