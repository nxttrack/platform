import { Baby, CalendarDays, RefreshCcw, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { formatLessonDate, getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant, getNextLesson, getParentPortalData } from "@/lib/domain/parent-portal";

export const dynamic = "force-dynamic";

export default async function ParentChildrenPage() {
  const data = await getParentPortalData();
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const accessByParticipant = new Map(data.accessLinks.map((link) => [link.participant_id, link]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Kinderen" title="Athletes" subtitle="Alle kinderen die via parent-mediated access aan dit account gekoppeld zijn." />

      {data.participants.length === 0 ? (
        <EmptyState>Er zijn nog geen athletes gekoppeld.</EmptyState>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.participants.map((participant) => {
            const enrollment = getActiveEnrollmentForParticipant(data, participant.id);
            const memberships = getActiveMembershipsForParticipant(data, participant.id);
            const next = getNextLesson(data, participant.id);
            const access = accessByParticipant.get(participant.id);
            const credits = data.catchUpCredits.filter((credit) => credit.participant_id === participant.id && credit.status === "available");

            return (
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={participant.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Baby className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{participant.display_name}</h2>
                      <p className="text-sm text-muted-foreground">{participant.birth_date ? `Geboren op ${formatDate(participant.birth_date)}` : "Geboortedatum niet ingevuld"}</p>
                    </div>
                  </div>
                  <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Detail icon={<Waves className="h-4 w-4" />} label="Programma" value={enrollment ? programById.get(enrollment.program_id)?.name ?? "Programma" : "Geen actieve inschrijving"} />
                  <Detail icon={<Waves className="h-4 w-4" />} label="Badje" value={enrollment?.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "Badje" : "Nog niet gezet"} />
                  <Detail icon={<CalendarDays className="h-4 w-4" />} label="Groep" value={memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep").join(", ") || "Nog niet geplaatst"} />
                  <Detail icon={<CalendarDays className="h-4 w-4" />} label="Volgende les" value={next ? formatLessonDate(next.starts_at, next.ends_at) : "Nog niet gepland"} />
                  <Detail icon={<RefreshCcw className="h-4 w-4" />} label="Inhaalcredits" value={`${credits.length} beschikbaar`} />
                  <Detail icon={<Baby className="h-4 w-4" />} label="Toegang" value={access ? `${access.relationship} - ${access.access_level}` : "Guardian"} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}
