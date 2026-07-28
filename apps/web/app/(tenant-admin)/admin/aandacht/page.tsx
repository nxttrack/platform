import { CheckCircle2, Heart, ListChecks, UsersRound } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { ParticipantAttentionWorkspace } from "@/components/admin/participant-attention-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getParticipantAttentionData } from "@/lib/domain/retention-signals";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParticipantAttentionPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/aandacht");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const data = await getParticipantAttentionData(tenant.id);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Relaties & retentie"
        title="Persoonlijke aandacht"
        subtitle="Uitlegbare signalen voor vriendelijk, menselijk contact. Nooit automatisch uitschrijven, stigmatiseren of communiceren."
      />
      <RouteFeedback error={error ? errorMessage(error) : null} success={saved ? successMessage(saved) : null} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Heart} label="Open signalen" tone={data.metrics.open ? "warning" : "success"} value={data.metrics.open} />
        <AdminMetricCard icon={UsersRound} label="Leerlingen in beeld" tone="info" value={data.metrics.observedParticipants} />
        <AdminMetricCard icon={ListChecks} label="Persoonlijk prioriteren" tone={data.metrics.priority ? "danger" : "success"} value={data.metrics.priority} />
        <AdminMetricCard icon={CheckCircle2} label="Contacttaken" tone="success" value={data.metrics.tasks} />
      </div>
      <ParticipantAttentionWorkspace data={data} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  if (code.startsWith("refreshed_")) return `${code.slice("refreshed_".length)} nieuwe aandachtssignalen toegevoegd; bestaande signalen zijn bijgewerkt.`;
  return ({
    task: "Interne contacttaak gemaakt. Er is niets automatisch verstuurd.",
    resolved: "Het signaal is na menselijke beoordeling opgelost.",
    dismissed: "Het signaal is bewust als niet relevant gemarkeerd.",
    pause: "De pauze en verwachte terugkeer zijn vastgelegd."
  } as Record<string, string>)[code] ?? "Wijziging opgeslagen.";
}

function errorMessage(code: string) {
  return ({
    refresh: "De aandachtssignalen konden niet veilig worden ververst.",
    confirmation: "De vereiste menselijke bevestiging ontbreekt.",
    signal: "Dit signaal is niet meer actueel.",
    task: "De interne contacttaak kon niet worden gemaakt.",
    resolve: "Het signaal kon niet worden afgerond.",
    enrollment: "De gekozen inschrijving is niet beschikbaar.",
    pause_dates: "De verwachte terugkeer kan niet vóór de start van de pauze liggen.",
    pause: "De pauze kon niet worden opgeslagen."
  } as Record<string, string>)[code] ?? `Actie niet uitgevoerd: ${code}.`;
}
