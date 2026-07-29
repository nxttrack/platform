import { Clock3, Gauge, Sparkles, UserRoundX, UsersRound } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { CrmPipelineWorkspace } from "@/components/admin/crm-pipeline-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getCrmPipelineData } from "@/lib/domain/crm-pipeline";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function CrmPipelinePage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/crm");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const selectedLeadId = getParam(params, "lead");
  const activeTab = getParam(params, "tab") ?? "board";
  const data = await getCrmPipelineData(tenant.id, selectedLeadId);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Relaties & groei"
        title="CRM-pipeline"
        subtitle="Van eerste aanvraag tot plaatsing en omzet. Iedere fase, reminder en contactactie blijft uitlegbaar en menselijk bevestigd."
      />
      <RouteFeedback
        success={saved ? successMessage(saved) : null}
        error={error ? errorMessage(error) : null}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard icon={UsersRound} label="Actieve leads" tone="info" value={data.metrics.active} />
        <AdminMetricCard icon={Clock3} label="SLA te laat" tone={data.metrics.overdue ? "danger" : "success"} value={data.metrics.overdue} />
        <AdminMetricCard icon={UserRoundX} label="Niet toegewezen" tone={data.metrics.unassigned ? "warning" : "success"} value={data.metrics.unassigned} />
        <AdminMetricCard icon={Gauge} label="Conversie" tone="success" value={`${data.metrics.conversionRate}%`} />
        <AdminMetricCard icon={Sparkles} label="Warme pipeline" tone="info" value={data.metrics.pipelineValue} detail="proefles t/m aanbod" />
      </div>
      <CrmPipelineWorkspace activeTab={activeTab} data={data} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  if (code.startsWith("duplicates_")) return `${code.slice("duplicates_".length)} nieuwe mogelijke duplicaten gevonden.`;
  const messages: Record<string, string> = {
    lead: "Lead en pipelinefase bijgewerkt.",
    contact: "Contactmoment toegevoegd aan de tijdlijn.",
    duplicate_dismissed: "Duplicaatsuggestie beoordeeld en genegeerd.",
    merged: "Leads herstelbaar samengevoegd.",
    merge_undone: "Samenvoeging volledig hersteld.",
    sla: "CRM-servicenormen opgeslagen."
  };
  return messages[code] ?? "CRM-wijziging opgeslagen.";
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    confirmation: "Bevestig dat dit contact werkelijk heeft plaatsgevonden.",
    contact: "Het contactmoment kon niet veilig worden opgeslagen.",
    duplicate_scan: "De duplicaatcontrole kon niet worden afgerond.",
    merge: "De leads konden niet veilig worden samengevoegd.",
    merge_confirmation: "De expliciete mergebevestiging ontbreekt.",
    undo_merge: "De samenvoeging kon niet worden hersteld.",
    lead_update: "De pipelinewijziging is geweigerd. Controleer fase, eigenaar en verloren-reden.",
    sla: "De servicenormen zijn niet opgeslagen."
  };
  return messages[code] ?? `CRM-actie niet uitgevoerd: ${code}.`;
}
