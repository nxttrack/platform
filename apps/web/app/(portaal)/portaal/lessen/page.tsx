import { ArrowRight, CalendarX, Clock, RefreshCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { cancelLessonAction } from "@/lib/domain/parent-portal-actions";
import { canCancelSession, formatLessonDate, getParentPortalData } from "@/lib/domain/parent-portal";
import type { SessionRow } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentLessonsPage({ searchParams }: PageProps) {
  const data = await getParentPortalData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const cancellationBySessionParticipant = new Map(data.cancellations.map((cancellation) => [`${cancellation.session_id}:${cancellation.participant_id}`, cancellation]));
  const lessonItems = data.sessions
    .flatMap((session) =>
      data.groupMemberships
        .filter((membership) => membership.group_id === session.group_id && (membership.status === "active" || membership.status === "trial"))
        .map((membership) => ({ session, membership }))
    )
    .sort((a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime());

  return (
    <div className="space-y-6">
      <PageHeader kicker="Mijn lessen" title="Lessen en inhalen" subtitle={`Annuleren kan tot ${data.settings.lesson_cancellation_cutoff_hours} uur vooraf met automatische inhaalcredit.`} />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Clock className="h-5 w-5" />} label="Komende lessen" value={lessonItems.filter((item) => new Date(item.session.starts_at).getTime() >= Date.now()).length} />
        <Metric icon={<CalendarX className="h-5 w-5" />} label="Annuleringen" value={data.cancellations.length} />
        <Metric icon={<RefreshCcw className="h-5 w-5" />} label="Credits" value={data.catchUpCredits.filter((credit) => credit.status === "available").length} />
      </div>

      {lessonItems.length === 0 ? (
        <EmptyState>Er zijn nog geen lessen gekoppeld aan dit portaal.</EmptyState>
      ) : (
        <div className="space-y-3">
          {lessonItems.map(({ session, membership }) => {
            const participant = participantById.get(membership.participant_id);
            const group = groupById.get(session.group_id);
            const cancellation = cancellationBySessionParticipant.get(`${session.id}:${membership.participant_id}`);
            const future = new Date(session.starts_at).getTime() > Date.now();
            const onTime = canCancelSession(data.settings, session.starts_at);

            return (
              <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={`${session.id}:${membership.participant_id}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Athlete"}</p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">{formatLessonDate(session.starts_at, session.ends_at)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{group?.name ?? "Lesgroep"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={session.status === "scheduled" ? "info" : session.status === "completed" ? "success" : "neutral"}>{session.status}</StatusPill>
                    {cancellation ? <StatusPill tone={cancellation.eligible_for_credit ? "success" : "warning"}>{cancellation.policy_status}</StatusPill> : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <Link className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted" href={`/portaal/lessen/${session.id}`}>
                    Details <ArrowRight className="h-4 w-4" />
                  </Link>
                  {future && session.status === "scheduled" && !cancellation ? <CancelForm participantId={membership.participant_id} session={session} onTime={onTime} /> : null}
                  {cancellation ? <p className="text-sm font-semibold text-muted-foreground">Geannuleerd op {formatShortDate(cancellation.requested_at)}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CancelForm({ onTime, participantId, session }: { onTime: boolean; participantId: string; session: SessionRow }) {
  return (
    <form action={cancelLessonAction} className="flex flex-wrap items-end gap-2">
      <input name="sessionId" type="hidden" value={session.id} />
      <input name="participantId" type="hidden" value={participantId} />
      <input name="next" type="hidden" value="/portaal/lessen" />
      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
        <span>Reden</span>
        <input className="h-9 w-48 rounded-lg border border-border bg-white px-3 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" name="reason" placeholder="Optioneel" />
      </label>
      <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" type="submit">
        <CalendarX className="h-4 w-4" />
        {onTime ? "Annuleer met credit" : "Annuleer zonder credit"}
      </button>
    </form>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "cancelled") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Les geannuleerd en inhaalcredit toegevoegd.</p>;
  }

  if (saved === "late") {
    return <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Les geannuleerd buiten de credittermijn.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
