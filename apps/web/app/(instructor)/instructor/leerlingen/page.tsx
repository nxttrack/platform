import { ArrowRight, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getInstructorData } from "@/lib/domain/instructor";

export const dynamic = "force-dynamic";

export default async function InstructorStudentsPage() {
  const data = await getInstructorData();
  const membershipByParticipant = groupBy(data.groupMemberships, "participant_id");
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const noteCountByParticipant = countBy(data.progressNotes, "participant_id");
  const badgeCountByParticipant = countBy(data.badgeAwards, "participant_id");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Leerlingen" title="Student detail" subtitle="Alle leerlingen uit toegewezen groepen met snelle toegang tot notes en badges." />

      {data.participants.length === 0 ? (
        <EmptyState>Geen leerlingen in toegewezen groepen.</EmptyState>
      ) : (
        <div className="space-y-3">
          {data.participants.map((participant) => {
            const memberships = membershipByParticipant.get(participant.id) ?? [];
            const groups = memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep");

            return (
              <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={participant.id}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UserRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{participant.display_name}</h2>
                      <p className="text-sm text-muted-foreground">{groups.join(", ") || "Geen actieve groep"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone="info">{noteCountByParticipant.get(participant.id) ?? 0} notes</StatusPill>
                    <StatusPill tone="success">{badgeCountByParticipant.get(participant.id) ?? 0} badges</StatusPill>
                    <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={`/instructor/student/${participant.id}`}>
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

function groupBy<Row extends Record<Key, string>, Key extends string>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    grouped.set(row[key], [...(grouped.get(row[key]) ?? []), row]);
  }

  return grouped;
}

function countBy<Row extends Record<Key, string>, Key extends string>(rows: Row[], key: Key) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  }

  return counts;
}
