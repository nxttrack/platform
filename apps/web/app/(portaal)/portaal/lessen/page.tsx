import { ArrowRight, CalendarX, Clock, RefreshCcw } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getParentCatchUpData } from "@/lib/domain/catch-up";
import { cancelLessonAction, requestCatchUpSessionAction } from "@/lib/domain/parent-portal-actions";
import { canCancelSession, formatLessonDate, getParentPortalData } from "@/lib/domain/parent-portal";
import type { SessionRow } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentLessonsPage({ searchParams }: PageProps) {
  const [data, catchUpData] = await Promise.all([getParentPortalData(), getParentCatchUpData()]);
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
        <Metric icon={<RefreshCcw className="h-5 w-5" />} label="Credits" value={catchUpData.credits.filter((credit) => credit.status === "available").length} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Inhaalles kiezen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Zet een beschikbare credit om naar een concrete inhaalles.</p>
          </div>
          <StatusPill tone={catchUpData.options.length > 0 ? "success" : "neutral"}>{catchUpData.options.length} opties</StatusPill>
        </div>
        {catchUpData.credits.length === 0 ? (
          <EmptyState>Je hebt nog geen beschikbare inhaalcredits.</EmptyState>
        ) : (
          <div className="space-y-3">
            {catchUpData.credits.map((credit) => {
              const participant = participantById.get(credit.participant_id);
              const request = catchUpData.requests.find((item) => item.credit_id === credit.id && (item.status === "requested" || item.status === "approved"));
              const options = catchUpData.options.filter((option) => option.creditId === credit.id).slice(0, 4);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={credit.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 font-bold text-foreground">Inhaalcredit</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Geldig tot {credit.expires_on ? formatDate(credit.expires_on) : "geen einddatum"}.</p>
                    </div>
                    <StatusPill tone={credit.status === "available" ? "success" : "warning"}>{request?.status ?? credit.status}</StatusPill>
                  </div>
                  {request ? (
                    <p className="mt-3 text-sm font-semibold text-muted-foreground">Aanvraag ingediend. Status: {request.status}.</p>
                  ) : options.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Geen passende les met vrije capaciteit binnen de boekingsperiode.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {options.map((option) => (
                        <form action={requestCatchUpSessionAction} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3" key={`${credit.id}:${option.sessionId}`}>
                          <input name="creditId" type="hidden" value={credit.id} />
                          <input name="sessionId" type="hidden" value={option.sessionId} />
                          <input name="next" type="hidden" value="/portaal/lessen" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{formatLessonDate(option.startsAt, option.endsAt)}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {option.groupName} - {option.available} vrije plek(ken)
                            </p>
                          </div>
                          <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" type="submit">
                            <RefreshCcw className="h-4 w-4" />
                            Kiezen
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

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
    <ConfirmActionForm
      action={cancelLessonAction}
      className="flex flex-wrap items-end gap-2"
      confirmLabel="Les definitief annuleren"
      description={
        onTime
          ? "Deze les wordt geannuleerd. Volgens de huidige termijn ontvang je hiervoor automatisch een inhaalcredit."
          : "Deze les wordt geannuleerd buiten de geldende termijn. Je ontvangt hiervoor geen inhaalcredit."
      }
      hiddenFields={{ sessionId: session.id, participantId, next: "/portaal/lessen" }}
      title="Wil je deze les annuleren?"
      triggerLabel={
        <>
          <CalendarX className="h-4 w-4" />
          {onTime ? "Annuleer met credit" : "Annuleer zonder credit"}
        </>
      }
      triggerVariant={onTime ? "outline" : "destructive"}
    >
      <Field className="w-48 gap-1">
        <FieldLabel className="text-xs text-muted-foreground" htmlFor={`reason-${session.id}-${participantId}`}>
          Reden
        </FieldLabel>
        <Input className="h-9" id={`reason-${session.id}-${participantId}`} name="reason" placeholder="Optioneel" />
      </Field>
    </ConfirmActionForm>
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

  if (saved === "catchup-requested") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Inhaalles aangevraagd. De administratie beoordeelt de aanvraag.</p>;
  }

  if (saved === "catchup-approved") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Inhaalles ingepland.</p>;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}


function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
