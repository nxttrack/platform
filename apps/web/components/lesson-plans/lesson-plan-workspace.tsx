import {
  Beaker,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Dumbbell,
  History,
  Lightbulb,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundCheck
} from "lucide-react";
import Link from "next/link";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import {
  approveLessonPlanAction,
  evaluateLessonPlanAction,
  generateLessonPlanAction
} from "@/lib/domain/lesson-plan-actions";
import type { getLessonPlanWorkspace } from "@/lib/domain/lesson-plans";
import { cn } from "@/lib/utils";

type Workspace = Awaited<ReturnType<typeof getLessonPlanWorkspace>>;

export function LessonPlanWorkspace({
  basePath,
  data
}: {
  basePath: "/admin/lesplannen" | "/instructor/lesplannen";
  data: Workspace;
}) {
  const selected = data.selected;
  const plan = data.selectedPlan;
  const proposal = plan?.proposal ?? data.preview;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Clock3} label="Komende lessen" value={data.metrics.scheduled} />
        <AdminMetricCard icon={Lightbulb} label="Concepten" tone={data.metrics.drafts ? "warning" : "neutral"} value={data.metrics.drafts} />
        <AdminMetricCard icon={CheckCircle2} label="Goedgekeurd" tone="success" value={data.metrics.approved} />
        <AdminMetricCard icon={ClipboardCheck} label="Geëvalueerd" tone="info" value={data.metrics.completed} />
      </div>

      {!selected ? (
        <section className="rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-soft">
          <Sparkles className="mx-auto size-8 text-primary" />
          <h2 className="mt-3 text-xl font-bold">Nog geen lesmomenten</h2>
          <p className="mt-2 text-sm text-muted-foreground">Plan eerst een sessie; daarna kan de assistent een uitlegbaar lesvoorstel maken.</p>
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <section className="rounded-2xl border border-border bg-card p-3 shadow-soft">
              <div className="px-2 pb-3">
                <p className="text-xs font-bold uppercase tracking-wider text-primary">Lesmomenten</p>
                <p className="mt-1 text-xs text-muted-foreground">Selecteer een les om het voorstel en de menselijke status te bekijken.</p>
              </div>
              <nav aria-label="Lesmoment kiezen" className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {data.sessions.map((session) => {
                  const sessionPlan = data.plansBySession.get(session.id);
                  return (
                    <Link
                      aria-current={session.id === selected.id ? "page" : undefined}
                      className={cn(
                        "block rounded-xl border p-3 transition",
                        session.id === selected.id
                          ? "border-primary/30 bg-primary/5 shadow-soft"
                          : "border-border bg-background hover:border-primary/20"
                      )}
                      href={`${basePath}?session=${session.id}`}
                      key={session.id}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-foreground">{session.groupName}</p>
                        <PlanStatus status={sessionPlan?.status ?? "not_started"} />
                      </div>
                      <p className="mt-1 text-xs font-medium text-muted-foreground">{formatSession(session.startsAt, session.endsAt)}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{session.stageName ?? "Niveau niet gekoppeld"}{session.resourceName ? ` · ${session.resourceName}` : ""}</p>
                    </Link>
                  );
                })}
              </nav>
            </section>
          </aside>

          <div className="min-w-0 space-y-4">
            <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Lesplanassistent</p>
                  <PlanStatus status={plan?.status ?? "not_started"} />
                  {plan ? <StatusPill tone="neutral">Versie {plan.versionNumber}</StatusPill> : null}
                  {selected.isTest ? <StatusPill tone="info">Journey Bot</StatusPill> : null}
                </div>
                <h2 className="mt-2 text-2xl font-bold text-foreground">{selected.groupName}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{formatSession(selected.startsAt, selected.endsAt)} · {selected.stageName ?? "Niveau niet gekoppeld"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ConfirmActionForm
                  action={generateLessonPlanAction}
                  confirmLabel={plan ? "Nieuwe versie genereren" : "Voorstel genereren"}
                  description="De assistent herberekent alleen een concept op basis van recente, niet-gevoelige lesfocus. Voortgang, berichten en plaatsingen blijven ongewijzigd. Een bestaand goedgekeurd plan wordt weer concept."
                  hiddenFields={{ sessionId: selected.id, next: `${basePath}?session=${selected.id}`, humanConfirmation: "generate" }}
                  title={plan ? "Lesplan opnieuw berekenen?" : "Lesplanvoorstel maken?"}
                  triggerLabel={<><RefreshCcw className="size-4" />{plan ? "Opnieuw berekenen" : "Voorstel maken"}</>}
                  triggerVariant={plan ? "outline" : "default"}
                />
                {plan?.status === "draft" ? (
                  <ConfirmActionForm
                    action={approveLessonPlanAction}
                    confirmLabel="Plan goedkeuren"
                    description="Je bevestigt dat een bevoegde medewerker doelen, oefeningen, materialen en persoonlijke aandacht heeft gecontroleerd. Dit legt alleen het lesplan vast."
                    hiddenFields={{ sessionId: selected.id, versionId: plan.currentVersionId, next: `${basePath}?session=${selected.id}`, humanConfirmation: "approve" }}
                    title="Dit lesplan menselijk goedkeuren?"
                    triggerLabel={<><CheckCircle2 className="size-4" />Goedkeuren</>}
                  />
                ) : null}
              </div>
            </section>

            {proposal ? (
              <>
                <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-aqua/10 p-5 shadow-soft">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><ShieldCheck className="size-4" />Uitlegbaar voorstel</p>
                      <h3 className="mt-1 text-xl font-bold">Bronnen en zekerheid</h3>
                    </div>
                    <StatusPill tone={proposal.confidence === "hoog" ? "success" : proposal.confidence === "gemiddeld" ? "warning" : "neutral"}>Zekerheid {proposal.confidence}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {proposal.reasons.map((reason) => <p className="rounded-xl border border-border bg-card/80 px-3 py-2 text-xs leading-5 text-muted-foreground" key={reason}>{reason}</p>)}
                  </div>
                  <p className="mt-3 text-[11px] font-medium text-muted-foreground">Engine {proposal.sourceData.engineVersion} · {proposal.sourceData.focusCardCount} focuskaarten · {proposal.sourceData.focusPointCount} bronpunten</p>
                </section>

                <div className="grid gap-4 lg:grid-cols-2">
                  <PlanPanel icon={Target} kicker="Maximaal drie" title="Groepsdoelen">
                    <ol className="space-y-3">
                      {proposal.groupGoals.map((goal, index) => (
                        <li className="grid grid-cols-[2rem_1fr] gap-3" key={goal.label}>
                          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-sm font-bold text-primary">{index + 1}</span>
                          <div><p className="font-bold text-foreground">{goal.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{goal.reason} · {goal.evidenceCount || "basis"} bron{goal.evidenceCount === 1 ? "" : "nen"}</p></div>
                        </li>
                      ))}
                    </ol>
                  </PlanPanel>
                  <PlanPanel icon={UserRoundCheck} kicker="Privacybewust" title="Persoonlijke aandacht">
                    {proposal.personalAttention.length ? (
                      <div className="space-y-3">
                        {proposal.personalAttention.map((attention) => (
                          <article className="rounded-xl border border-border bg-muted/25 p-3" key={`${attention.participantId}-${attention.label}`}>
                            <p className="text-sm font-bold text-foreground">{attention.participantName}</p>
                            <p className="mt-1 text-sm text-primary">{attention.label}</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{attention.reason}</p>
                          </article>
                        ))}
                      </div>
                    ) : <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nog geen recente niet-gevoelige persoonlijke focus. De instructeur observeert tijdens de les.</p>}
                  </PlanPanel>
                </div>

                <PlanPanel icon={Dumbbell} kicker="Tijdgebonden en differentieerbaar" title="Oefenopbouw">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {proposal.exercises.map((exercise, index) => (
                      <article className="rounded-xl border border-border bg-muted/20 p-4" key={exercise.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Blok {index + 1}</p><h4 className="mt-1 font-bold text-foreground">{exercise.title}</h4></div>
                          <StatusPill tone="info">{exercise.durationMinutes} min</StatusPill>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">{exercise.instruction}</p>
                        <p className="mt-3 rounded-lg bg-background px-3 py-2 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Differentiatie:</strong> {exercise.differentiation}</p>
                        <p className="mt-2 text-[11px] font-semibold text-primary">Doel: {exercise.linkedGoal}</p>
                      </article>
                    ))}
                  </div>
                </PlanPanel>

                <div className="grid gap-4 lg:grid-cols-2">
                  <PlanPanel icon={Beaker} kicker="Voorbereiden" title="Materiaal">
                    <div className="flex flex-wrap gap-2">{proposal.equipment.map((item) => <span className="rounded-full border border-border bg-muted/35 px-3 py-1.5 text-xs font-semibold text-foreground" key={item}>{item}</span>)}</div>
                  </PlanPanel>
                  <PlanPanel icon={ClipboardCheck} kicker="Na de les" title="Evaluatievragen">
                    <ol className="space-y-2">{proposal.evaluationPrompts.map((prompt, index) => <li className="flex gap-2 text-sm leading-6 text-muted-foreground" key={prompt}><span className="font-bold text-primary">{index + 1}.</span>{prompt}</li>)}</ol>
                  </PlanPanel>
                </div>

                {plan?.status === "approved" ? (
                  <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Menselijke afronding</p>
                    <h3 className="mt-1 text-xl font-bold">Les evalueren</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Leg alleen professionele lesobservaties vast. Dit past geen individuele voortgangsscores automatisch aan.</p>
                    <form action={evaluateLessonPlanAction} className="mt-4 grid gap-4 md:grid-cols-2">
                      <input name="sessionId" type="hidden" value={selected.id} />
                      <input name="next" type="hidden" value={`${basePath}?session=${selected.id}`} />
                      <SelectField label="Resultaat groepsdoelen" name="outcome" defaultValue="deels_behaald"><option value="behaald">Behaald</option><option value="deels_behaald">Deels behaald</option><option value="aanpassen">Volgende les aanpassen</option></SelectField>
                      <Field label="Wat werkte goed?" name="workedWell" required maxLength={600} />
                      <div className="md:col-span-2"><TextAreaField label="Wat passen we volgende les aan?" name="nextAdjustment" required maxLength={600} /></div>
                      <div className="md:col-span-2"><TextAreaField label="Professionele observatie — optioneel" name="observationNote" maxLength={600} /></div>
                      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold md:col-span-2"><input name="humanConfirmation" required type="checkbox" value="evaluate" />Ik heb deze evaluatie zelf gecontroleerd; er worden geen voortgangsscores automatisch gewijzigd.</label>
                      <SubmitButton>Evaluatie vastleggen</SubmitButton>
                    </form>
                  </section>
                ) : null}

                {plan?.status === "completed" && plan.evaluation ? (
                  <PlanPanel icon={CheckCircle2} kicker="Afgerond" title="Vastgelegde lesevaluatie">
                    <div className="grid gap-3 md:grid-cols-3">
                      <EvaluationItem label="Uitkomst" value={plan.evaluation.outcome.replaceAll("_", " ")} />
                      <EvaluationItem label="Werkte goed" value={plan.evaluation.workedWell} />
                      <EvaluationItem label="Volgende aanpassing" value={plan.evaluation.nextAdjustment} />
                    </div>
                  </PlanPanel>
                ) : null}

                {plan && plan.versions.length > 1 ? (
                  <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
                    <div className="flex items-center gap-2"><History className="size-5 text-primary" /><h3 className="font-bold">Herleidbare versies</h3></div>
                    <div className="mt-3 flex flex-wrap gap-2">{plan.versions.map((version) => <StatusPill key={version.id} tone={version.id === plan.currentVersionId ? "info" : "neutral"}>v{version.number} · {version.confidence} · {formatDate(version.createdAt)}</StatusPill>)}</div>
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanPanel({ children, icon: Icon, kicker, title }: { children: React.ReactNode; icon: typeof Target; kicker: string; title: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span><div><p className="text-[11px] font-bold uppercase tracking-wider text-primary">{kicker}</p><h3 className="mt-0.5 text-lg font-bold text-foreground">{title}</h3></div></div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PlanStatus({ status }: { status: string }) {
  const config = {
    not_started: ["Nog niet gestart", "neutral"],
    draft: ["Concept", "warning"],
    approved: ["Goedgekeurd", "success"],
    completed: ["Geëvalueerd", "info"],
    archived: ["Gearchiveerd", "neutral"]
  } as const;
  const [label, tone] = config[status as keyof typeof config] ?? config.not_started;
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function EvaluationItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-muted/25 p-3"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-6 text-foreground">{value || "Niet ingevuld"}</p></div>;
}

function formatSession(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" }).format(start)} · ${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(start)}–${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(end)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
