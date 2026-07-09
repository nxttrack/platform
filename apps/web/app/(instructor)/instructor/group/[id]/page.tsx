import { ArrowRight, CheckCircle2, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { completeSessionAction, markAttendanceAction } from "@/lib/domain/instructor-actions";
import { formatSessionTime, getInstructorData, getSessionRoster } from "@/lib/domain/instructor";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const attendanceLabels = {
  present: "Aanwezig",
  absent: "Afwezig",
  late: "Laat",
  excused: "Afmelding",
  trial: "Proefles"
} as const;

export const dynamic = "force-dynamic";

export default async function InstructorGroupPage({ params, searchParams }: PageProps) {
  const [{ id }, rawParams, data] = await Promise.all([params, searchParams ?? Promise.resolve({}), getInstructorData()]);
  const group = data.groups.find((item) => item.id === id);

  if (!group) {
    notFound();
  }

  const selectedSessionId = getParam(rawParams, "session");
  const saved = getParam(rawParams, "saved");
  const error = getParam(rawParams, "error");
  const groupSessions = data.sessions.filter((session) => session.group_id === group.id);
  const selectedSession = groupSessions.find((session) => session.id === selectedSessionId) ?? groupSessions.find((session) => isToday(session.starts_at)) ?? groupSessions.find((session) => new Date(session.starts_at).getTime() >= Date.now()) ?? groupSessions[0] ?? null;
  const roster = selectedSession ? getSessionRoster(data, selectedSession.id) : [];
  const attendanceByParticipant = new Map(data.attendance.filter((attendance) => attendance.session_id === selectedSession?.id).map((attendance) => [attendance.participant_id, attendance]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Groep" title={group.name} subtitle="Roster en attendance registratie." />
      <Feedback saved={saved} error={error} />

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Sessies</h2>
          {selectedSession && selectedSession.status === "scheduled" ? (
            <form action={completeSessionAction}>
              <input name="sessionId" type="hidden" value={selectedSession.id} />
              <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
              <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted" type="submit">
                Afronden <CheckCircle2 className="h-4 w-4" />
              </button>
            </form>
          ) : null}
        </div>
        {groupSessions.length === 0 ? (
          <EmptyState>Geen sessies voor deze groep.</EmptyState>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groupSessions.map((session) => (
              <Link className={`rounded-lg border px-3 py-2 text-sm font-semibold ${session.id === selectedSession?.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:bg-muted"}`} href={`/instructor/group/${group.id}?session=${session.id}`} key={session.id}>
                {new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(session.starts_at))}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Attendance</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{selectedSession ? formatSessionTime(selectedSession.starts_at, selectedSession.ends_at) : "Geen sessie geselecteerd"}</h2>
          </div>
          {selectedSession ? <StatusPill tone={selectedSession.status === "scheduled" ? "info" : selectedSession.status === "completed" ? "success" : "neutral"}>{selectedSession.status}</StatusPill> : null}
        </div>

        {!selectedSession ? (
          <EmptyState>Kies een sessie om attendance te registreren.</EmptyState>
        ) : roster.length === 0 ? (
          <EmptyState>Geen actieve leerlingen in deze groep.</EmptyState>
        ) : (
          <div className="space-y-3">
            {roster.map(({ enrollment, participant }) => {
              const attendance = attendanceByParticipant.get(participant.id);

              return (
                <article className="rounded-lg border border-border bg-white p-3" key={participant.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-foreground">{participant.display_name}</h3>
                      <Link className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline" href={`/instructor/student/${participant.id}`}>
                        Student detail <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    <StatusPill tone={attendance ? "success" : "neutral"}>{attendance ? attendanceLabels[attendance.status as keyof typeof attendanceLabels] ?? attendance.status : "open"}</StatusPill>
                  </div>
                  <form action={markAttendanceAction} className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
                    <input name="sessionId" type="hidden" value={selectedSession.id} />
                    <input name="participantId" type="hidden" value={participant.id} />
                    <input name="enrollmentId" type="hidden" value={enrollment.id} />
                    <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                    <select className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={attendance?.status ?? "present"} name="status">
                      {Object.entries(attendanceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={attendance?.note ?? ""} name="note" placeholder="Korte lesnotitie" />
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                      <ClipboardCheck className="h-4 w-4" />
                      Opslaan
                    </button>
                  </form>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "attendance") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Attendance opgeslagen.</p>;
  }

  if (saved === "completed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Les afgerond.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function isToday(value: string) {
  const date = new Date(value);
  const now = new Date();

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
