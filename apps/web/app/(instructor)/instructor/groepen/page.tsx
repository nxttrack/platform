import { ArrowRight, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getInstructorData, getRosterForGroup } from "@/lib/domain/instructor";

export const dynamic = "force-dynamic";

export default async function InstructorGroupsPage() {
  const data = await getInstructorData();
  const sessionsByGroup = groupBy(data.sessions, "group_id");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Mijn groepen" title="Groepen" subtitle="Rosters en eerstvolgende lessen per toegewezen groep." />

      {data.groups.length === 0 ? (
        <EmptyState>Geen toegewezen groepen.</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.groups.map((group) => {
            const roster = getRosterForGroup(data, group.id);
            const nextSession = (sessionsByGroup.get(group.id) ?? []).find((session) => new Date(session.starts_at).getTime() >= Date.now());

            return (
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={group.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UsersRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-foreground">{group.name}</h2>
                      <p className="text-sm text-muted-foreground">{roster.length} leerling(en)</p>
                    </div>
                  </div>
                  <StatusPill tone={group.status === "active" ? "success" : "neutral"}>{group.status}</StatusPill>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{nextSession ? `Volgende les: ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(nextSession.starts_at))}` : "Geen komende les gepland"}</p>
                <Link className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={`/instructor/group/${group.id}`}>
                  Open roster <ArrowRight className="h-4 w-4" />
                </Link>
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

function groupBy<Row extends Record<Key, string>, Key extends string>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    grouped.set(row[key], [...(grouped.get(row[key]) ?? []), row]);
  }

  return grouped;
}
