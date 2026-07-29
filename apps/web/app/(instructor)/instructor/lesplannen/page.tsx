import { LessonPlanWorkspace } from "@/components/lesson-plans/lesson-plan-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getLessonPlanWorkspace } from "@/lib/domain/lesson-plans";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function InstructorLessonPlansPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/instructor/lesplannen");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const session = getParam(params, "session");
  const canManageTenant = context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)) ?? false;
  const data = await getLessonPlanWorkspace({
    tenantId: tenant.id,
    userId: context.user.id,
    canManageTenant,
    selectedSessionId: session
  });
  return (
    <div className="space-y-5">
      <PageHeader kicker="Poolside voorbereiding" title="Mijn lesplannen" subtitle="Bereid lessen voor met uitlegbare doelen en oefeningen. Jij controleert, keurt goed en evalueert altijd zelf." />
      <RouteFeedback error={getParam(params, "error") ? "De lesplanactie kon niet veilig worden uitgevoerd." : null} success={getParam(params, "saved") ? "Lesplan bijgewerkt." : null} />
      <LessonPlanWorkspace basePath="/instructor/lesplannen" data={data} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
