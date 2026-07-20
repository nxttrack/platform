import { CalendarX, MapPin, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cancelLessonAction } from "@/lib/domain/parent-portal-actions";
import { canCancelSession, formatLessonDate, getParentPortalData } from "@/lib/domain/parent-portal";
import type { SessionRow } from "@/lib/domain/core";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentLessonDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, rawParams, data] = await Promise.all([params, searchParams ?? Promise.resolve({}), getParentPortalData()]);
  const session = data.sessions.find((item) => item.id === id);

  if (!session) {
    notFound();
  }

  const group = data.groups.find((item) => item.id === session.group_id) ?? null;
  const resource = session.resource_id ? data.resources.find((item) => item.id === session.resource_id) ?? null : null;
  const memberships = data.groupMemberships.filter((membership) => membership.group_id === session.group_id && (membership.status === "active" || membership.status === "trial"));
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const cancellationByParticipant = new Map(data.cancellations.filter((cancellation) => cancellation.session_id === session.id).map((cancellation) => [cancellation.participant_id, cancellation]));
  const saved = getParam(rawParams, "saved");
  const error = getParam(rawParams, "error");
  const future = new Date(session.starts_at).getTime() > Date.now();
  const onTime = canCancelSession(data.settings, session.starts_at);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Lesdetails" title={formatLessonDate(session.starts_at, session.ends_at)} subtitle={group?.name ?? "Lesgroep"} />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <div className="space-y-4">
            <Detail icon={<MapPin className="h-4 w-4" />} label="Locatie/resource" value={resource?.name ?? "Nog niet gezet"} />
            <Detail icon={<UserRound className="h-4 w-4" />} label="Groep" value={group?.name ?? "Groep"} />
            <Detail icon={<CalendarX className="h-4 w-4" />} label="Status" value={session.status} />
            {session.notes ? <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{session.notes}</p> : null}
          </div>
        </Card>

        <section className="space-y-3">
          {memberships.map((membership) => {
            const participant = participantById.get(membership.participant_id);
            const cancellation = cancellationByParticipant.get(membership.participant_id);

            return (
              <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={membership.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Athlete</p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">{participant?.display_name ?? "Athlete"}</h2>
                  </div>
                  {cancellation ? <StatusPill tone={cancellation.eligible_for_credit ? "success" : "warning"}>{cancellation.policy_status}</StatusPill> : <StatusPill tone="info">gepland</StatusPill>}
                </div>
                <div className="mt-4">
                  {future && session.status === "scheduled" && !cancellation ? <CancelForm participantId={membership.participant_id} session={session} onTime={onTime} /> : null}
                  {cancellation ? <p className="text-sm font-semibold text-muted-foreground">Geannuleerd op {formatShortDate(cancellation.requested_at)}</p> : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
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
      hiddenFields={{ sessionId: session.id, participantId, next: `/portaal/lessen/${session.id}` }}
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

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
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

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
