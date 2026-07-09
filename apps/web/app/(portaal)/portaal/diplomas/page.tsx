import Link from "next/link";
import { CalendarCheck, CheckCircle2, Download, FileBadge, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { respondGraduationInviteAction } from "@/lib/domain/parent-portal-actions";
import { getParentPortalData } from "@/lib/domain/parent-portal";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentDiplomaVaultPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const eventById = new Map(data.graduationEvents.map((event) => [event.id, event]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const pendingInvites = data.graduationParticipants.filter((participant) => participant.invite_status === "sent" || participant.invite_status === "confirmed" || participant.invite_status === "declined");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Diploma vault" title="Afzwemmen en diploma's" subtitle="Bekijk uitnodigingen, afzwemstatus en uitgegeven diploma's van je kinderen." />
      <Feedback saved={saved} error={error} />

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Afzwemuitnodigingen</h2>
        </div>
        {pendingInvites.length === 0 ? (
          <EmptyState>Er zijn nog geen afzwemuitnodigingen.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {pendingInvites.map((invite) => {
              const participant = participantById.get(invite.participant_id);
              const event = eventById.get(invite.event_id);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={invite.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 font-bold text-foreground">{event?.title ?? "Afzwemevent"}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{event ? formatDateTime(event.starts_at) : "Datum volgt"}</p>
                    </div>
                    <StatusPill tone={invite.invite_status === "confirmed" ? "success" : invite.invite_status === "declined" ? "danger" : "info"}>{invite.invite_status}</StatusPill>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">Status: {invite.status}. Resultaat: {invite.result === "pending" ? "nog niet bekend" : invite.result}.</p>
                  {invite.invite_status === "sent" ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <form action={respondGraduationInviteAction}>
                        <input name="eventParticipantId" type="hidden" value={invite.id} />
                        <input name="response" type="hidden" value="confirmed" />
                        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                          <CheckCircle2 className="h-4 w-4" />
                          Bevestigen
                        </button>
                      </form>
                      <form action={respondGraduationInviteAction}>
                        <input name="eventParticipantId" type="hidden" value={invite.id} />
                        <input name="response" type="hidden" value="declined" />
                        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground" type="submit">
                          <XCircle className="h-4 w-4" />
                          Afwijzen
                        </button>
                      </form>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <FileBadge className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Private diploma vault</h2>
        </div>
        {data.certificates.length === 0 ? (
          <EmptyState>Nog geen diploma's of certificaten beschikbaar.</EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.certificates.map((certificate) => {
              const participant = participantById.get(certificate.participant_id);
              const program = programById.get(certificate.program_id);
              const stage = stageById.get(certificate.stage_id);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={certificate.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{certificate.title}</h3>
                    </div>
                    <StatusPill tone="success">uitgegeven</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Detail label="Programma" value={program?.name ?? "Programma"} />
                    <Detail label="Badje" value={stage?.badge_label ?? stage?.name ?? "Badje"} />
                    <Detail label="Uitgegeven" value={formatDate(certificate.issued_on)} />
                    <Detail label="Nummer" value={certificate.certificate_number ?? "Niet gezet"} />
                  </div>
                  {certificate.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{certificate.notes}</p> : null}
                  {certificate.file_path ? (
                    <Link className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/api/files/certificate/${certificate.id}`}>
                      <Download className="h-4 w-4" />
                      Diploma downloaden
                    </Link>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "confirmed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Afzwemuitnodiging bevestigd.</p>;
  }

  if (saved === "declined") {
    return <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Afzwemuitnodiging afgewezen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
