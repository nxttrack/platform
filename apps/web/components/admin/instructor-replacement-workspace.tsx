import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  MapPin,
  ShieldCheck,
  UserRoundCheck,
  UsersRound
} from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Progress } from "@/components/ui/progress";
import {
  confirmInstructorReplacementAction,
  createInstructorReplacementDraftAction,
  reportInstructorAbsenceAction,
  saveInstructorQualificationAction,
  saveInstructorWorkloadLimitsAction
} from "@/lib/domain/instructor-replacement-actions";
import type { InstructorReplacementData } from "@/lib/domain/instructor-replacement";
import { cn } from "@/lib/utils";

export function InstructorReplacementWorkspace({ data }: { data: InstructorReplacementData }) {
  const selected = data.selectedSession;
  const currentRequests = selected ? data.requests.filter((request) => request.sessionId === selected.id && request.status !== "superseded") : [];

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Les kiezen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Lessen zonder instructeur en gemelde uitval staan vooraan. Iedere kandidaat wordt live opnieuw berekend.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AdminActionDrawer description="Leg kwalificaties expliciet vast. Alleen geverifieerde, geldige scopes maken een kandidaat inzetbaar." title="Kwalificatie vastleggen" triggerLabel="Kwalificatie" triggerVariant="outline" width="wide">
            <QualificationForm data={data} />
          </AdminActionDrawer>
          <AdminActionDrawer description="Begrens week-, dag- en aaneengesloten belasting, pauzes en reistijdbuffer." title="Belastbaarheidsgrenzen" triggerLabel="Belastbaarheid" triggerVariant="outline">
            <WorkloadForm data={data} />
          </AdminActionDrawer>
        </div>
      </section>

      <nav aria-label="Lessen voor vervanging" className="flex gap-2 overflow-x-auto pb-1">
        {data.sessions.map((session) => (
          <Link
            aria-current={selected?.id === session.id ? "page" : undefined}
            className={cn(
              "min-w-[230px] rounded-xl border p-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected?.id === session.id ? "border-sky-300 bg-sky-50 shadow-soft" : "border-border bg-card hover:bg-muted/35"
            )}
            href={`/admin/vervanging?session=${session.id}`}
            key={session.id}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-foreground">{session.groupName}</p>
              {session.needsReplacement ? <StatusPill tone="danger">Actie</StatusPill> : <StatusPill tone="neutral">Bezet</StatusPill>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(session.startsAt)}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{session.originalInstructorName ?? "Nog geen instructeur"}</p>
          </Link>
        ))}
      </nav>

      {selected ? (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
            <div className="grid gap-4 bg-gradient-to-r from-sky-50 via-white to-cyan-50 p-5 xl:grid-cols-[1fr_auto] xl:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={selected.needsReplacement ? "danger" : "success"}>{selected.needsReplacement ? "Vervanging nodig" : "Instructeur gekoppeld"}</StatusPill>
                  {selected.absenceId ? <StatusPill tone="warning">Afwezigheid vastgelegd</StatusPill> : null}
                </div>
                <h2 className="mt-3 text-xl font-bold text-foreground">{selected.groupName}</h2>
                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <p className="flex items-center gap-2"><CalendarClock className="size-4 text-sky-600" />{formatDateTime(selected.startsAt)}–{formatTime(selected.endsAt)}</p>
                  <p className="flex items-center gap-2"><MapPin className="size-4 text-sky-600" />{selected.locationName}</p>
                  <p className="flex items-center gap-2"><BadgeCheck className="size-4 text-sky-600" />{selected.programName} · {selected.stageName}</p>
                  <p className="flex items-center gap-2"><UsersRound className="size-4 text-sky-600" />{selected.originalInstructorName ?? "Geen oorspronkelijke instructeur"}</p>
                </div>
              </div>
              {selected.originalInstructorId && !selected.absenceId ? (
                <AdminActionDrawer description="Medische details zijn niet nodig. Kies alleen een operationele categorie en optionele interne context." title="Uitval melden" triggerLabel="Uitval melden" triggerVariant="outline">
                  <form action={reportInstructorAbsenceAction} className="space-y-4">
                    <input name="sessionId" type="hidden" value={selected.id} />
                    <input name="instructorUserId" type="hidden" value={selected.originalInstructorId} />
                    <SelectField label="Reden" name="reasonCategory" defaultValue="illness">
                      <option value="illness">Ziekte</option>
                      <option value="emergency">Noodsituatie</option>
                      <option value="leave">Verlof</option>
                      <option value="training">Training</option>
                      <option value="unavailable">Onbeschikbaar</option>
                      <option value="other">Anders</option>
                    </SelectField>
                    <TextAreaField label="Interne context — optioneel" name="privateNote" maxLength={1000} placeholder="Alleen wat de planner operationeel moet weten." />
                    <SubmitButton>Uitval registreren</SubmitButton>
                  </form>
                </AdminActionDrawer>
              ) : null}
            </div>
          </section>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,0.6fr)]">
            <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-foreground">Vervangingsvoorstellen</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Kwalificatie, beschikbaarheid, rooster, reistijdbuffer en belastbaarheid worden als harde grenzen toegepast.</p>
                </div>
                <StatusPill tone="info">{data.candidates.filter((candidate) => candidate.actionable).length} inzetbaar</StatusPill>
              </div>
              <div className="mt-4 space-y-3">
                {data.candidates.map((candidate, index) => (
                  <article className={cn("rounded-xl border p-4", candidate.actionable ? "border-emerald-200 bg-emerald-50/35" : "border-border bg-muted/25")} key={candidate.instructorId}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background text-sm font-bold ring-1 ring-border">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-foreground">{candidate.displayName}</h3>
                          <StatusPill tone={candidate.actionable ? "success" : "warning"}>{candidate.actionable ? "Inzetbaar" : "Niet inzetbaar"}</StatusPill>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                          <Progress aria-label={`${candidate.score} procent match`} value={candidate.score} />
                          <span className="text-xs font-bold tabular-nums text-foreground">{candidate.score}% · {Math.round(candidate.confidence * 100)}% confidence</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {candidate.reasons.map((reason) => <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800" key={reason}>{reason}</span>)}
                          {candidate.blockers.map((blocker) => <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800" key={blocker}>{blocker}</span>)}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Na inzet: {candidate.workloadAfter.dailyMinutes} min vandaag · {candidate.workloadAfter.weeklyMinutes} min deze week · {candidate.workloadAfter.dailySessions} lessen vandaag
                        </p>
                        {candidate.actionable ? (
                          <ConfirmActionForm
                            action={createInstructorReplacementDraftAction}
                            className="mt-3"
                            confirmLabel="Intern concept maken"
                            description="NXTTRACK maakt alleen een intern conceptverzoek. Er wordt niets verzonden en het rooster blijft ongewijzigd tot een tweede, expliciete bevestiging."
                            hiddenFields={{ sessionId: selected.id, replacementInstructorId: candidate.instructorId, humanConfirmation: "draft" }}
                            title={`Concept voor ${candidate.displayName} maken?`}
                            triggerLabel={<><ArrowRight className="mr-1 size-3.5" />Maak conceptverzoek</>}
                            triggerVariant="outline"
                          >
                            <label className="mb-3 grid gap-1.5 text-xs font-semibold text-foreground">
                              Voorsteltekst — blijft intern
                              <textarea className="min-h-24 rounded-lg border border-border bg-background p-3 font-normal" maxLength={2000} name="proposedMessage" defaultValue={`Kun je ${selected.groupName} op ${formatDateTime(selected.startsAt)} overnemen? Controleer de lescontext in NXTTRACK en bevestig dit verzoek bij de planner.`} />
                            </label>
                          </ConfirmActionForm>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
                {!data.candidates.length ? <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Nog geen actieve instructeurs beschikbaar voor analyse.</p> : null}
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <h2 className="flex items-center gap-2 text-base font-bold text-foreground"><ShieldCheck className="size-5 text-emerald-600" />Veilige beslisgrens</h2>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                  <li>• Een blocker maakt een kandidaat niet inzetbaar.</li>
                  <li>• Een concept verstuurt geen bericht.</li>
                  <li>• Bevestigen herhaalt alle controles live.</li>
                  <li>• Alleen bevestigen wijzigt de sessieplanning.</li>
                </ul>
              </section>
              <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                <h2 className="text-base font-bold text-foreground">Interne concepten</h2>
                <div className="mt-3 space-y-3">
                  {currentRequests.map((request) => (
                    <article className="rounded-xl border border-border bg-muted/25 p-3" key={request.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-bold text-foreground">{request.replacementName}</p>
                        <StatusPill tone={request.status === "confirmed" ? "success" : "warning"}>{request.status === "confirmed" ? "Bevestigd" : "Concept"}</StatusPill>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">{request.proposedMessage}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">{request.score}% match · {Math.round(request.confidence * 100)}% confidence</p>
                      {request.status === "draft" || request.status === "ready" ? (
                        <ConfirmActionForm
                          action={confirmInstructorReplacementAction}
                          className="mt-3"
                          confirmLabel="Opnieuw controleren en inplannen"
                          description="NXTTRACK herhaalt kwalificatie-, beschikbaarheids-, conflict- en belastingcontroles. Alleen bij een volledig veilige uitkomst wordt de vervanger aan deze sessie gekoppeld. Er wordt geen extern bericht verzonden."
                          hiddenFields={{ requestId: request.id, humanConfirmation: "confirmed" }}
                          title={`${request.replacementName} werkelijk inplannen?`}
                          triggerLabel={<><UserRoundCheck className="mr-1 size-3.5" />Controleer en plan in</>}
                        />
                      ) : <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="size-4" />Planning bevestigd</p>}
                    </article>
                  ))}
                  {!currentRequests.length ? <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Nog geen concept voor deze les.</p> : null}
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-soft">
          <AlertTriangle className="mx-auto size-8 text-amber-600" />
          <h2 className="mt-3 font-bold text-foreground">Geen toekomstige lessen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Maak eerst een toekomstige sessie aan voordat vervangingsanalyse mogelijk is.</p>
        </section>
      )}
    </div>
  );
}

function QualificationForm({ data }: { data: InstructorReplacementData }) {
  return (
    <form action={saveInstructorQualificationAction} className="space-y-4">
      <SelectField label="Instructeur" name="instructorUserId" required>
        <option value="">Kies instructeur</option>
        {data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.name} · {instructor.qualificationCount} actief</option>)}
      </SelectField>
      <Field label="Naam kwalificatie" name="name" required maxLength={120} placeholder="Bijv. Lesgeven Badje 1–3" />
      <SelectField label="Programma — optioneel" name="programId">
        <option value="">Alleen ander gekozen bereik</option>
        {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
      </SelectField>
      <SelectField label="Niveau — optioneel" name="stageId">
        <option value="">Alle niveaus binnen programma</option>
        {data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </SelectField>
      <SelectField label="Locatie-ervaring — optioneel" name="resourceId">
        <option value="">Geen specifieke locatie</option>
        {data.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
      </SelectField>
      <Field label="Geldig tot — optioneel" name="validUntil" type="date" />
      <TextAreaField label="Verificatiebewijs — optioneel" name="evidenceNote" maxLength={1000} placeholder="Bijv. intern beoordeeld op 12 juni; diploma ingezien." />
      <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-900">Kies minimaal een programma, niveau of locatie. Opslaan markeert deze scope als door jou geverifieerd.</p>
      <SubmitButton>Kwalificatie verifiëren</SubmitButton>
    </form>
  );
}

function WorkloadForm({ data }: { data: InstructorReplacementData }) {
  return (
    <form action={saveInstructorWorkloadLimitsAction} className="space-y-4">
      <SelectField label="Instructeur" name="instructorUserId" required>
        <option value="">Kies instructeur</option>
        {data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.name}{instructor.workloadConfigured ? " · ingesteld" : ""}</option>)}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Max. minuten per week" name="maxWeeklyMinutes" required type="number" defaultValue={1200} />
        <Field label="Max. minuten per dag" name="maxDailyMinutes" required type="number" defaultValue={360} />
        <Field label="Max. aaneengesloten" name="maxConsecutiveMinutes" required type="number" defaultValue={180} />
        <Field label="Max. lessen per dag" name="maxSessionsPerDay" required type="number" defaultValue={8} />
        <Field label="Minimale pauze (min)" name="minimumBreakMinutes" required type="number" defaultValue={15} />
        <Field label="Buffer andere locatie (min)" name="crossLocationBufferMinutes" required type="number" defaultValue={45} />
      </div>
      <p className="rounded-lg bg-sky-50 p-3 text-xs leading-5 text-sky-900">Deze grenzen zijn harde blockers. Reistijd wordt voorlopig veilig benaderd met een configureerbare buffer, zonder externe locatie-API.</p>
      <SubmitButton>Grenzen opslaan</SubmitButton>
    </form>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
