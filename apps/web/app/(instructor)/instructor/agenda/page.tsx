import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { formatSessionTime, getInstructorData, getSessionRoster } from "@/lib/domain/instructor";

export const dynamic = "force-dynamic";

export default async function InstructorAgendaPage() {
  const data = await getInstructorData();
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const futureSessions = data.sessions.filter((session) => new Date(session.starts_at).getTime() >= Date.now());

  return (
    <div className="space-y-6">
      <PageHeader kicker="Agenda" title="Toegewezen lessen" subtitle="Alle toegewezen sessies met rosterlinks voor tabletgebruik." />

      {futureSessions.length === 0 ? (
        <EmptyState>Geen komende assigned sessions.</EmptyState>
      ) : (
        <div className="space-y-3">
          {futureSessions.map((session) => {
            const group = groupById.get(session.group_id);
            const resource = session.resource_id ? resourceById.get(session.resource_id) : null;
            const rosterSize = getSessionRoster(data, session.id).length;

            return (
              <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={session.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{group?.name ?? "Lesgroep"}</p>
                      <h2 className="mt-1 text-lg font-bold text-foreground">{formatSessionTime(session.starts_at, session.ends_at)}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {resource?.name ?? "Resource niet gezet"} - {rosterSize} leerling(en)
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={session.status === "scheduled" ? "info" : session.status === "completed" ? "success" : "neutral"}>{session.status}</StatusPill>
                    <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={`/instructor/group/${session.group_id}?session=${session.id}`}>
                      Open <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}
