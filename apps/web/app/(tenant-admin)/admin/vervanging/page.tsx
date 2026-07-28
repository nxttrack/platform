import { BadgeCheck, CalendarClock, ShieldCheck, UsersRound } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { InstructorReplacementWorkspace } from "@/components/admin/instructor-replacement-workspace";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getInstructorReplacementData } from "@/lib/domain/instructor-replacement";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function InstructorReplacementPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/vervanging");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const data = await getInstructorReplacementData(tenant.id, getParam(params, "session"));
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const configured = data.instructors.filter((instructor) => instructor.qualificationCount > 0 && instructor.workloadConfigured).length;

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Planning intelligence"
        title="Instructor vervangingsassistent"
        subtitle="Vind veilige vervangers op kwalificatie, beschikbaarheid, rooster, reistijdbuffer en belastbaarheid. Concept en definitieve planning blijven gescheiden."
      />
      <RouteFeedback error={error ? errorMessage(error) : null} success={saved ? successMessage(saved) : null} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={CalendarClock} label="Lessen in beeld" value={data.sessions.length} />
        <AdminMetricCard icon={UsersRound} label="Vervanging nodig" tone={data.sessions.some((session) => session.needsReplacement) ? "danger" : "success"} value={data.sessions.filter((session) => session.needsReplacement).length} />
        <AdminMetricCard icon={BadgeCheck} label="Volledig geconfigureerd" tone={configured === data.instructors.length ? "success" : "warning"} value={`${configured}/${data.instructors.length}`} />
        <AdminMetricCard icon={ShieldCheck} label="Veilige kandidaten" tone="info" value={data.candidates.filter((candidate) => candidate.actionable).length} />
      </div>
      <InstructorReplacementWorkspace data={data} />
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(code: string) {
  return ({
    qualification: "De kwalificatie is expliciet geverifieerd en actief.",
    workload: "De belastbaarheidsgrenzen zijn opgeslagen.",
    absence: "De uitval is operationeel vastgelegd.",
    draft: "Intern concept gemaakt. Er is niets verzonden en het rooster is niet gewijzigd.",
    confirmed: "De vervanger is na actuele hercontrole handmatig aan de sessie gekoppeld."
  } as Record<string, string>)[code] ?? "Wijziging opgeslagen.";
}

function errorMessage(code: string) {
  return ({
    qualification_scope: "Kies minimaal een programma, niveau of locatie voor de kwalificatie.",
    qualification: "De kwalificatie kon niet worden opgeslagen.",
    workload: "De belastbaarheidsgrenzen zijn ongeldig of konden niet worden opgeslagen.",
    instructor: "De gekozen instructeur is niet actief binnen deze organisatie.",
    absence_context: "De uitval past niet meer bij de actuele lesbezetting.",
    absence: "De uitval kon niet worden vastgelegd.",
    candidate: "Deze kandidaat heeft een blocker of is niet meer beschikbaar.",
    draft: "Het interne concept kon niet worden gemaakt.",
    request: "Dit concept is niet meer beschikbaar voor bevestiging.",
    revalidation: "De kandidaat voldoet bij de actuele hercontrole niet meer aan alle veilige voorwaarden.",
    assignment: "De vervanger kon niet veilig aan de sessie worden gekoppeld.",
    confirmation: "De vereiste menselijke bevestiging ontbreekt."
  } as Record<string, string>)[code] ?? `Actie niet uitgevoerd: ${code}.`;
}
