import { LessonPlanWorkspace } from "@/components/lesson-plans/lesson-plan-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getLessonPlanWorkspace } from "@/lib/domain/lesson-plans";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function AdminLessonPlansPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/lesplannen");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const session = getParam(params, "session");
  const data = await getLessonPlanWorkspace({
    tenantId: tenant.id,
    userId: context.user.id,
    canManageTenant: true,
    selectedSessionId: session
  });
  return (
    <div className="space-y-5">
      <PageHeader kicker="Leskwaliteit" title="Lesplanassistent" subtitle="Uitlegbare, rule-based lesvoorstellen met groepsdoelen, maximaal drie persoonlijke aandachtspunten, oefeningen, materiaal, menselijke goedkeuring en evaluatie." />
      <RouteFeedback error={errorMessage(getParam(params, "error"))} success={successMessage(getParam(params, "saved"))} />
      <LessonPlanWorkspace basePath="/admin/lesplannen" data={data} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(value?: string) {
  return ({ generated: "Een nieuwe, uitlegbare lesplanversie is als concept opgeslagen.", approved: "Lesplan menselijk goedgekeurd.", evaluated: "Lesevaluatie opgeslagen zonder automatische voortgangswijzigingen." } as Record<string, string>)[value ?? ""] ?? null;
}

function errorMessage(value?: string) {
  return ({ confirmation: "Menselijke bevestiging ontbreekt.", generate: "Het voorstel kon niet veilig worden berekend.", save: "De lesplanversie kon niet atomair worden opgeslagen.", stale: "Er is inmiddels een nieuwere versie of status.", state: "Alleen een goedgekeurd plan kan worden geëvalueerd.", access: "Je hebt geen toegang tot dit lesmoment." } as Record<string, string>)[value ?? ""] ?? null;
}
