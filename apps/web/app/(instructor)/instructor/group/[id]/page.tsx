import { ArrowRight, CheckCircle2, ClipboardCheck, MessageSquarePlus, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { completeSessionAction, markAttendanceAction, markRosterPresentAction, saveProgressNoteAction } from "@/lib/domain/instructor-actions";
import { formatSessionTime, getInstructorData, getSessionRoster } from "@/lib/domain/instructor";
import { markLessonFocusTreatedAction } from "@/lib/domain/learning-intelligence-actions";
import { generateLessonFocusCards } from "@/lib/domain/learning-intelligence";

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
  const focusCards = selectedSession ? await generateLessonFocusCards({
    tenantId: data.tenant.id,
    sessionId: selectedSession.id,
    includeTestData: roster.some(({ participant }) => participant.is_test)
  }) : [];
  const groupFocus = [...new Map(
    focusCards.flatMap((card) => card.points)
      .filter((point) => point.source_type === "group_bottleneck")
      .map((point) => [point.fingerprint, point])
  ).values()].slice(0, 3);
  const attendanceByParticipant = new Map(data.attendance.filter((attendance) => attendance.session_id === selectedSession?.id).map((attendance) => [attendance.participant_id, attendance]));
  const registeredCount = attendanceByParticipant.size;
  const presentCount = [...attendanceByParticipant.values()].filter((attendance) => attendance.status === "present" || attendance.status === "trial" || attendance.status === "late").length;
  const openCount = Math.max(0, roster.length - registeredCount);

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
              <Link className={`inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-sm font-semibold ${session.id === selectedSession?.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground hover:bg-muted"}`} href={`/instructor/group/${group.id}?session=${session.id}`} key={session.id}>
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
          {selectedSession ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-primary hover:bg-primary/5" href={`/instructor/lesplannen?session=${selectedSession.id}`}>
                <Sparkles className="size-4" /> Lesplan
              </Link>
              <StatusPill tone={selectedSession.status === "scheduled" ? "info" : selectedSession.status === "completed" ? "success" : "neutral"}>{selectedSession.status}</StatusPill>
            </div>
          ) : null}
        </div>

        {!selectedSession ? (
          <EmptyState>Kies een sessie om attendance te registreren.</EmptyState>
        ) : roster.length === 0 ? (
          <EmptyState>Geen actieve leerlingen in deze groep.</EmptyState>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <SessionMetric label="Roster" value={roster.length} />
              <SessionMetric label="Aanwezig" value={presentCount} tone="success" />
              <SessionMetric label="Geregistreerd" value={registeredCount} />
              <SessionMetric label="Nog open" value={openCount} tone={openCount > 0 ? "warning" : "success"} />
            </div>
            {focusCards.length > 0 ? (
              <section aria-labelledby="today-focus" className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-aqua/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Sparkles className="size-4" />Voor de les</p>
                    <h3 className="mt-1 text-lg font-bold text-foreground" id="today-focus">Vandaag focus</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">Maximaal drie positieve aandachtspunten per kind; geen gevoelige dossierdetails.</p>
                  </div>
                  <StatusPill tone="info">{focusCards.length} focuskaarten</StatusPill>
                </div>
                {groupFocus.length ? (
                  <div className="mt-4 rounded-xl border border-border bg-card/80 p-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Groepsfocus · maximaal 3</p>
                    <ol className="mt-2 grid gap-2 md:grid-cols-3">
                      {groupFocus.map((point) => <li className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium text-foreground" key={point.fingerprint}>{point.label}</li>)}
                    </ol>
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {focusCards.map((card) => (
                    <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={card.id}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-foreground">{card.participant_name}</h4>
                          {card.is_test ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
                        </div>
                        <StatusPill tone={card.status === "treated" ? "success" : "neutral"}>{card.status === "treated" ? "Behandeld" : "Open"}</StatusPill>
                      </div>
                      <ol className="mt-3 space-y-2">
                        {card.points.slice(0, 3).map((point, index) => (
                          <li className="grid grid-cols-[1.5rem_1fr] gap-2 text-sm leading-6 text-foreground" key={point.fingerprint}>
                            <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span>
                            <span>{point.label}<span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{point.explanation}</span></span>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-4 grid gap-2">
                        {card.status !== "treated" ? (
                          <form action={markLessonFocusTreatedAction}>
                            <input name="cardId" type="hidden" value={card.id} />
                            <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                            <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-muted" type="submit"><CheckCircle2 className="size-4" />Markeer behandeld</button>
                          </form>
                        ) : null}
                        <form action={saveProgressNoteAction} className="grid gap-2">
                          <input name="participantId" type="hidden" value={card.participant_id} />
                          <input name="sessionId" type="hidden" value={selectedSession.id} />
                          <input name="visibility" type="hidden" value="internal" />
                          <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                          <label className="sr-only" htmlFor={`focus-note-${card.id}`}>Interne notitie voor {card.participant_name}</label>
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm" id={`focus-note-${card.id}`} name="note" placeholder="Korte interne notitie" required />
                            <button aria-label={`Notitie toevoegen voor ${card.participant_name}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground" type="submit"><MessageSquarePlus className="size-4" /></button>
                          </div>
                        </form>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <QuickAttendanceButton enrollmentId={enrollment.id} groupId={group.id} participantId={participant.id} sessionId={selectedSession.id} status="present" label="Aanwezig" />
                    <QuickAttendanceButton enrollmentId={enrollment.id} groupId={group.id} participantId={participant.id} sessionId={selectedSession.id} status="absent" label="Afwezig" />
                    <QuickAttendanceButton enrollmentId={enrollment.id} groupId={group.id} participantId={participant.id} sessionId={selectedSession.id} status="late" label="Laat" />
                  </div>
                  <form action={markAttendanceAction} className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]">
                    <input name="sessionId" type="hidden" value={selectedSession.id} />
                    <input name="participantId" type="hidden" value={participant.id} />
                    <input name="enrollmentId" type="hidden" value={enrollment.id} />
                    <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                    <select aria-label={`Aanwezigheidsstatus van ${participant.display_name}`} className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={attendance?.status ?? "present"} name="status">
                      {Object.entries(attendanceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input aria-label={`Lesnotitie voor ${participant.display_name}`} className="h-10 rounded-lg border border-border bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={attendance?.note ?? ""} name="note" placeholder="Korte lesnotitie" />
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                      <ClipboardCheck className="h-4 w-4" />
                      Opslaan
                    </button>
                  </form>
                </article>
              );
            })}
            {selectedSession.status === "scheduled" ? (
              <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-card/95 p-3 shadow-card backdrop-blur sm:flex-row sm:items-center">
                <div className="mr-auto">
                  <p className="text-sm font-bold text-foreground">Poolside acties</p>
                  <p className="text-xs text-muted-foreground">Grote touch targets · controleer uitzonderingen na de batch.</p>
                </div>
                <form action={markRosterPresentAction}>
                  <input name="sessionId" type="hidden" value={selectedSession.id} />
                  <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                  <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold transition hover:bg-muted sm:w-auto" type="submit">
                    <ClipboardCheck className="size-5 text-primary" /> Iedereen aanwezig
                  </button>
                </form>
                <form action={completeSessionAction}>
                  <input name="sessionId" type="hidden" value={selectedSession.id} />
                  <input name="next" type="hidden" value={`/instructor/group/${group.id}?session=${selectedSession.id}`} />
                  <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-glow sm:w-auto" type="submit">
                    <CheckCircle2 className="size-5" /> Les afronden
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function SessionMetric({ label, tone = "neutral", value }: { label: string; tone?: "success" | "warning" | "neutral"; value: number }) {
  const toneClass = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function QuickAttendanceButton({ enrollmentId, groupId, label, participantId, sessionId, status }: { enrollmentId: string; groupId: string; label: string; participantId: string; sessionId: string; status: string }) {
  return (
    <form action={markAttendanceAction}>
      <input name="sessionId" type="hidden" value={sessionId} />
      <input name="participantId" type="hidden" value={participantId} />
      <input name="enrollmentId" type="hidden" value={enrollmentId} />
      <input name="status" type="hidden" value={status} />
      <input name="next" type="hidden" value={`/instructor/group/${groupId}?session=${sessionId}`} />
      <button className="inline-flex h-10 min-w-24 items-center justify-center rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-muted" type="submit">
        {label}
      </button>
    </form>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "attendance") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Attendance opgeslagen.</p>;
  }

  if (saved === "roster") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Het volledige roster is als aanwezig geregistreerd. Uitzonderingen kunnen direct worden aangepast.</p>;
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
