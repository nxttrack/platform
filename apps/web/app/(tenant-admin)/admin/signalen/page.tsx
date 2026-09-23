import { DailyOperationalCockpit } from "@/components/admin/daily-operational-cockpit";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getDailyOperationalCockpit } from "@/lib/domain/operational-cockpit";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminSignalsPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/signalen");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const data = await getDailyOperationalCockpit(tenant.id);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Operationele werkbak"
        title="Alle signalen"
        subtitle={`Beoordeel actuele aandachtspunten voor ${tenant.name}, met broninformatie en bewuste opvolgacties.`}
      />
      <RouteFeedback error={error ? "De signaalstatus kon niet veilig worden opgeslagen." : null} success={saved ? successMessage(saved) : null} />
      <DailyOperationalCockpit filter={getParam(params, "filter") ?? "all"} generatedAt={data.generatedAt} signals={data.signals} />
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
