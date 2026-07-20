import { CalendarCheck, CheckCircle2, GraduationCap, MapPin, XCircle } from "lucide-react";
import Link from "next/link";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { respondGraduationInviteAction } from "@/lib/domain/parent-portal-actions";
import { getParentPortalData } from "@/lib/domain/parent-portal";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentGraduationPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const eventById = new Map(data.graduationEvents.map((event) => [event.id, event]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const invitations = data.graduationParticipants.filter((participant) => ["sent", "confirmed", "declined"].includes(participant.invite_status));

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <Link className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-semibold text-foreground shadow-soft transition hover:bg-muted" href="/portaal/diplomas">
            <GraduationCap className="h-4 w-4" /> Diploma's bekijken
          </Link>
        }
        kicker="Afzwemmen"
        title="Klaar voor het volgende moment"
        subtitle="Bekijk uitnodigingen, praktische informatie en de actuele afzwemstatus."
      />

      <Feedback error={getParam(params, "error")} saved={getParam(params, "saved")} />

      {invitations.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">Er zijn nog geen afzwemuitnodigingen. Zodra een kind klaar is, verschijnt de uitnodiging hier.</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {invitations.map((invite) => {
            const participant = participantById.get(invite.participant_id);
            const event = eventById.get(invite.event_id);
            const stage = event?.stage_id ? stageById.get(event.stage_id) : null;
            const resource = event?.resource_id ? resourceById.get(event.resource_id) : null;

            return (
              <Card key={invite.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                    <h2 className="mt-1 text-xl font-bold text-foreground">{event?.title ?? "Afzwemevent"}</h2>
                  </div>
                  <StatusPill tone={invite.invite_status === "confirmed" ? "success" : invite.invite_status === "declined" ? "danger" : "info"}>{inviteLabel(invite.invite_status)}</StatusPill>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Detail icon={<CalendarCheck className="h-4 w-4" />} label="Moment" value={event ? formatDateTime(event.starts_at) : "Datum volgt"} />
                  <Detail icon={<MapPin className="h-4 w-4" />} label="Locatie" value={resource?.name ?? "Locatie volgt"} />
                  <Detail icon={<GraduationCap className="h-4 w-4" />} label="Niveau" value={stage?.badge_label ?? stage?.name ?? "Wordt bepaald"} />
                  <Detail icon={<CheckCircle2 className="h-4 w-4" />} label="Resultaat" value={invite.result === "pending" ? "Nog niet bekend" : invite.result} />
                </div>

                {invite.invite_status === "sent" ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <ResponseForm eventParticipantId={invite.id} response="confirmed">
                      <CheckCircle2 className="h-4 w-4" /> Bevestigen
                    </ResponseForm>
                    <ResponseForm eventParticipantId={invite.id} response="declined" secondary>
                      <XCircle className="h-4 w-4" /> Afwijzen
                    </ResponseForm>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-3">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span></div>
      <p className="mt-2 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function ResponseForm({ eventParticipantId, response, secondary = false, children }: { eventParticipantId: string; response: "confirmed" | "declined"; secondary?: boolean; children: React.ReactNode }) {
  return (
    <form action={respondGraduationInviteAction}>
      <input name="eventParticipantId" type="hidden" value={eventParticipantId} />
      <input name="response" type="hidden" value={response} />
      <button className={secondary ? "inline-flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold text-foreground transition hover:bg-muted" : "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90"} type="submit">
        {children}
      </button>
    </form>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "confirmed") return <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">De uitnodiging is bevestigd.</p>;
  if (saved === "declined") return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">De uitnodiging is afgewezen.</p>;
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">De reactie kon niet worden opgeslagen: {error}.</p>;
  return null;
}

function inviteLabel(value: string) {
  if (value === "confirmed") return "bevestigd";
  if (value === "declined") return "afgewezen";
  return "actie nodig";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
