import { Award, ChartNoAxesColumnIncreasing, ClipboardCheck, Eye, Lock, MessageSquare, Sparkles, Star, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { FivePointAssessment } from "@/components/assessments/five-point-assessment";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { InstructorBadgeAwardForm } from "@/components/badges/instructor-badge-award-form";
import { SwimJourneyRings } from "@/components/progress/swim-journey-rings";
import { Button } from "@/components/ui/button";
import { Field as FieldRoot, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { installSwimProgressTemplateAction, saveProgressNoteAction, scoreProgressItemAction } from "@/lib/domain/instructor-actions";
import { getInstructorData } from "@/lib/domain/instructor";
import { getJourneyForEnrollment } from "@/lib/domain/swim-progress";
import { markInstructorReadinessRecommendationAction } from "@/lib/domain/learning-intelligence-actions";
import { calculateDiplomaReadiness, detectAttendanceRisks } from "@/lib/domain/learning-intelligence";
import { getPositiveScoreLabel } from "@/lib/domain/progress-template";
import { parseLearnerAssessmentValue } from "@/lib/domain/learner-assessment";
import { getTenantAssessmentRatingDisplay } from "@/lib/theme/portal-theme-server";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function InstructorStudentPage({ params, searchParams }: PageProps) {
  const [{ id }, rawParams, data] = await Promise.all([params, searchParams ?? Promise.resolve({}), getInstructorData()]);
  const participant = data.participants.find((item) => item.id === id);

  if (!participant) {
    notFound();
  }
  const assessmentDisplay = await getTenantAssessmentRatingDisplay(data.tenant.id);

  const saved = getParam(rawParams, "saved");
  const error = getParam(rawParams, "error");
  const success = getParam(rawParams, "success");
  const activeTab = getDossierTab(getParam(rawParams, "tab"));
  const memberships = data.groupMemberships.filter((membership) => membership.participant_id === participant.id && (membership.status === "active" || membership.status === "trial"));
  const enrollment = data.enrollments.find((item) => item.id === memberships[0]?.enrollment_id) ?? data.enrollments.find((item) => item.participant_id === participant.id) ?? null;
  const program = enrollment ? data.programs.find((item) => item.id === enrollment.program_id) : null;
  const stage = enrollment?.current_stage_id ? data.stages.find((item) => item.id === enrollment.current_stage_id) : null;
  const groupNames = memberships.map((membership) => data.groups.find((group) => group.id === membership.group_id)?.name ?? "Groep");
  const notes = data.progressNotes.filter((note) => note.participant_id === participant.id);
  const badgeAwards = data.badgeAwards.filter((badge) => badge.participant_id === participant.id);
  const scores = data.progressScores.filter((score) => score.participant_id === participant.id);
  const scoreByItemId = new Map(scores.map((score) => [score.item_id, score]));
  const canonicalJourney = getJourneyForEnrollment(data.swimJourneys, enrollment?.id);
  const canonicalObservationByItemId = new Map(
    (canonicalJourney?.effectiveObservations ?? []).map((observation) => [
      observation.curriculum_item_id,
      observation
    ])
  );
  const progressModules = data.progressModules.filter((module) => {
    const matchesProgram = !module.program_id || module.program_id === enrollment?.program_id;
    const matchesStage = !module.stage_id || module.stage_id === enrollment?.current_stage_id;

    return module.status === "active" && matchesProgram && matchesStage;
  });
  const itemsByModuleId = new Map(
    progressModules.map((module) => [module.id, data.progressItems.filter((item) => item.module_id === module.id && item.status === "active")])
  );
  const progressSections = canonicalJourney
    ? canonicalJourney.currentStage
      ? [{
          canonical: true as const,
          description: canonicalJourney.currentStage.description,
          id: canonicalJourney.currentStage.id,
          items: canonicalJourney.currentStageItems.map((item) => ({
            currentObservation: canonicalObservationByItemId.get(item.id) ?? null,
            id: item.id,
            name: item.name,
            positiveGoal: item.description
          })),
          name: canonicalJourney.currentStage.name
        }]
      : []
    : progressModules.map((module) => ({
        canonical: false as const,
        description: module.description,
        id: module.id,
        items: (itemsByModuleId.get(module.id) ?? []).map((item) => ({
          currentObservation: null,
          id: item.id,
          name: item.name,
          positiveGoal: item.positive_goal
        })),
        name: module.name
      }));
  const scoreCount = canonicalJourney ? canonicalJourney.effectiveObservations.length : scores.length;
  const [attendanceRisks, diplomaReadiness] = await Promise.all([
    detectAttendanceRisks(data.tenant.id, { includeTestData: participant.is_test }),
    enrollment && program && !participant.is_test
      ? calculateDiplomaReadiness({
          tenantId: data.tenant.id,
          participantId: participant.id,
          programId: program.id
        })
      : Promise.resolve(null)
  ]);
  const participantAttendanceRisks = attendanceRisks.filter((risk) => risk.participant_id === participant.id);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Student detail" title={participant.display_name} subtitle="Progress notes, zichtbaarheid en badge action foundation." />
      <Feedback saved={saved} error={error} success={success} />

      <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{participant.display_name}</h2>
              <p className="text-sm text-muted-foreground">{groupNames.join(", ") || "Geen actieve groep"}</p>
            </div>
          </div>
          <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
        </div>
      </article>

      {data.progressModules.length === 0 && !canonicalJourney ? (
        <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <h2 className="text-lg font-bold text-foreground">Zwemsjabloon</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Installeer de standaard NXTTRACK zwemmodules, score-items en badgecatalogus voor deze organisatie.</p>
          <form action={installSwimProgressTemplateAction} className="mt-4">
            <input name="next" type="hidden" value={`/instructor/student/${participant.id}`} />
            <Button type="submit">
              <Star className="h-4 w-4" />
              Sjabloon installeren
            </Button>
          </form>
        </article>
      ) : null}

      <Tabs defaultValue={activeTab}>
        <TabsList aria-label={`Dossier van ${participant.display_name}`}>
          <TabsTrigger value="progress">
            <ChartNoAxesColumnIncreasing className="h-4 w-4" />
            Voortgang
          </TabsTrigger>
          <TabsTrigger value="assessment">
            <ClipboardCheck className="h-4 w-4" />
            Beoordelen
          </TabsTrigger>
          <TabsTrigger value="notes">
            <MessageSquare className="h-4 w-4" />
            Notities
          </TabsTrigger>
          <TabsTrigger value="badges">
            <Award className="h-4 w-4" />
            Badges
          </TabsTrigger>
          <TabsTrigger value="graduation">
            <Sparkles className="h-4 w-4" />
            Afzwemmen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="progress">
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="grid content-start gap-3">
              <Detail label="Programma" value={program?.name ?? "Niet gezet"} />
              <Detail label="Badje" value={canonicalJourney?.currentStage?.name ?? stage?.badge_label ?? stage?.name ?? "Niet gezet"} />
              <Detail label="Scores" value={String(scoreCount)} />
              <Detail label="Notities en badges" value={`${notes.length} notities · ${badgeAwards.length} badges`} />
            </section>
            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Huidige voortgang</h2>
                  <p className="mt-1 text-sm text-muted-foreground">De laatste definitieve beoordeling per onderdeel; dekking blijft afzonderlijk zichtbaar.</p>
                </div>
                <StatusPill tone={scoreCount > 0 ? "success" : "neutral"}>{scoreCount} scores</StatusPill>
              </div>
              {canonicalJourney ? <SwimJourneyRings className="mt-5" rings={canonicalJourney.rings} /> : null}
              <div className="mt-4 space-y-4">
                {progressSections.length === 0 ? <EmptyState>Er zijn nog geen actieve voortgangsonderdelen.</EmptyState> : null}
                {progressSections.map((section) => (
                    <section className="rounded-lg border border-border bg-white p-4" key={section.id}>
                      <h3 className="font-bold text-foreground">{section.name}</h3>
                      <div className="mt-3 grid gap-2">
                        {section.items.length === 0 ? <EmptyState>Dit badje heeft nog geen onderdelen.</EmptyState> : null}
                        {section.items.map((item) => {
                          const currentScore = section.canonical
                            ? item.currentObservation?.rating ?? null
                            : scoreByItemId.get(item.id)?.score ?? null;

                          return (
                            <div className="grid gap-2 rounded-lg bg-muted/50 px-3 py-3 sm:grid-cols-[1fr_auto] sm:items-center" key={item.id}>
                              <span className="text-sm font-semibold text-foreground">{item.name}</span>
                              <FivePointAssessment
                                display={assessmentDisplay}
                                label={item.name}
                                readOnly
                                value={currentScore ? parseLearnerAssessmentValue(currentScore) : null}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </section>
                ))}
              </div>
            </article>
          </div>
        </TabsContent>

        <TabsContent value="assessment">
          <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">Progress modules</h2>
                <p className="mt-1 text-sm text-muted-foreground">Canonieke 1–5 beoordeling; een wijziging wordt als correctie toegevoegd en overschrijft nooit historie.</p>
              </div>
              <StatusPill tone={scoreCount > 0 ? "success" : "neutral"}>{scoreCount} scores</StatusPill>
            </div>
            <div className="mt-4 space-y-4">
              {progressSections.length === 0 ? <EmptyState>Publiceer en koppel eerst een leerlijn aan deze inschrijving.</EmptyState> : null}
              {progressSections.map((section) => (
                  <div className="rounded-lg border border-border bg-white p-3" key={section.id}>
                    <div className="mb-3">
                      <p className="font-bold text-foreground">{section.name}</p>
                      {section.description ? <p className="mt-1 text-sm text-muted-foreground">{section.description}</p> : null}
                    </div>
                    <div className="space-y-3">
                      {section.items.length === 0 ? <EmptyState>Dit badje heeft nog geen onderdelen.</EmptyState> : null}
                      {section.items.map((item) => {
                        const legacyScore = section.canonical ? null : scoreByItemId.get(item.id);
                        const currentObservation = section.canonical ? item.currentObservation : null;
                        const currentScore = currentObservation?.rating ?? legacyScore?.score ?? null;

                        return (
                          <form action={scoreProgressItemAction} className="rounded-lg border border-border bg-muted/30 p-3" key={item.id}>
                            <input name="participantId" type="hidden" value={participant.id} />
                            {section.canonical ? null : <input name="moduleId" type="hidden" value={section.id} />}
                            <input name="itemId" type="hidden" value={item.id} />
                            <input name="operationId" type="hidden" value={crypto.randomUUID()} />
                            {currentObservation ? <input name="correctsObservationId" type="hidden" value={currentObservation.id} /> : null}
                            <input name="next" type="hidden" value={`/instructor/student/${participant.id}?tab=assessment`} />
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">{item.name}</p>
                                {item.positiveGoal ? <p className="mt-1 text-sm text-muted-foreground">{item.positiveGoal}</p> : null}
                              </div>
                              {currentScore ? <StatusPill tone={scoreTone(currentScore)}>{getPositiveScoreLabel(currentScore)}</StatusPill> : <StatusPill>Nog niet beoordeeld</StatusPill>}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-[auto_1fr]">
                              <FivePointAssessment
                                display={assessmentDisplay}
                                label="Beoordeling"
                                required
                                value={currentScore ? parseLearnerAssessmentValue(currentScore) : null}
                              />
                              <SelectField defaultValue={currentObservation?.visibility ?? legacyScore?.visibility ?? "parent_visible"} fieldId={`visibility-${item.id}`} label="Zichtbaarheid" name="visibility">
                                <option value="parent_visible">Zichtbaar voor ouder</option>
                                <option value="internal">Alleen intern</option>
                              </SelectField>
                            </div>
                            <div className="mt-3">
                              <TextAreaField fieldId={`note-${item.id}`} label="Korte update" name="note" />
                            </div>
                            {currentObservation ? (
                              <div className="mt-3">
                                <TextAreaField fieldId={`correction-${item.id}`} label="Reden voor wijziging" name="correctionReason" required />
                              </div>
                            ) : null}
                            <Button className="mt-3" type="submit">
                              <Star className="h-4 w-4" />
                              {currentObservation ? "Correctie vastleggen" : "Beoordeling vastleggen"}
                            </Button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
              ))}
            </div>
          </article>
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-bold text-foreground">Notitie toevoegen</h2>
              <form action={saveProgressNoteAction} className="mt-4 grid gap-3">
                <input name="participantId" type="hidden" value={participant.id} />
                <input name="enrollmentId" type="hidden" value={enrollment?.id ?? ""} />
                <input name="next" type="hidden" value={`/instructor/student/${participant.id}?tab=notes`} />
                <TextAreaField fieldId="progress-note" label="Notitie" name="note" required />
                <SelectField fieldId="progress-note-visibility" label="Zichtbaarheid" name="visibility">
                  <option value="internal">Alleen intern</option>
                  <option value="parent_visible">Zichtbaar voor ouder</option>
                </SelectField>
                <Button type="submit">
                  <MessageSquare className="h-4 w-4" />
                  Notitie opslaan
                </Button>
              </form>
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-bold text-foreground">Notitiegeschiedenis</h2>
              <div className="mt-4 space-y-3">
                {notes.length === 0 ? <EmptyState>Nog geen voortgangsnotities.</EmptyState> : null}
                {notes.map((note) => (
                  <div className="rounded-lg border border-border bg-white p-3" key={note.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Visibility visibility={note.visibility} />
                      <span className="text-xs text-muted-foreground">{formatDate(note.created_at)}</span>
                    </div>
                    <p className="text-sm leading-6 text-foreground">{note.note}</p>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </TabsContent>

        <TabsContent value="badges">
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-bold text-foreground">Positief moment vastleggen</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Kies een passende complimentbadge. De aanspreekvorm gebruikt alleen de badgevoorkeur en beïnvloedt geen enkel operationeel besluit.</p>
              <InstructorBadgeAwardForm
                badges={[
                  ...data.premiumBadgeCatalog.map((badge) => ({
                    id: badge.id,
                    kind: "catalog" as const,
                    badgeKey: badge.badge_key,
                    nameDefault: badge.name_default,
                    nameBoy: badge.name_boy,
                    nameGirl: badge.name_girl,
                    description: badge.description_default,
                    category: badge.category,
                    audience: badge.audience
                  })),
                  ...data.customBadges.map((badge) => ({
                    id: badge.id,
                    kind: "custom" as const,
                    badgeKey: badge.badge_key,
                    nameDefault: badge.name_default,
                    nameBoy: badge.name_boy,
                    nameGirl: badge.name_girl,
                    description: badge.description_default,
                    category: badge.category,
                    audience: badge.audience
                  }))
                ]}
                directAward={data.badgeModuleSettings?.instructor_can_award_directly === true && data.badgeModuleSettings?.manual_badge_requires_admin_approval === false}
                nextPath={`/instructor/student/${participant.id}?tab=badges`}
                participantGender={participant.gender}
                participantId={participant.id}
                suggestions={data.badgeSuggestions}
              />
            </article>

            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-bold text-foreground">Toegekende badges</h2>
              <div className="mt-4 space-y-3">
                {badgeAwards.length === 0 ? <EmptyState>Nog geen badges.</EmptyState> : null}
                {badgeAwards.map((badge) => (
                  <div className="rounded-lg border border-border bg-white p-3" key={badge.id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <StatusPill tone={badge.visibility === "parent_visible" ? "success" : "neutral"}>{badge.visibility}</StatusPill>
                      <span className="text-xs text-muted-foreground">{formatDate(badge.awarded_at)}</span>
                    </div>
                    <p className="font-bold text-foreground">{badge.title}</p>
                    {badge.note ? <p className="mt-1 text-sm text-muted-foreground">{badge.note}</p> : null}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </TabsContent>

        <TabsContent value="graduation">
          {!diplomaReadiness || !enrollment || !program ? (
            <EmptyState>De afzwemassistent is beschikbaar bij een actieve, niet-synthetische programma-inschrijving.</EmptyState>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary"><Sparkles className="size-4" />Adviserend</p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">Afzwemgereedheid</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Uitlegbaar, zonder automatisch besluit of exact schijncijfer.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={readinessTone(diplomaReadiness.readiness_band)}>{readinessLabel(diplomaReadiness.readiness_band)}</StatusPill>
                    <StatusPill tone="info">{diplomaReadiness.confidence} vertrouwen</StatusPill>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Detail label="Vaardigheden" value={`${diplomaReadiness.required_skills_completed.length} stabiel op niveau`} />
                  <Detail label="Aanwezigheidscontext" value={diplomaReadiness.attendance_summary} />
                  <Detail label="Stabiliteit" value={diplomaReadiness.recent_score_stability} />
                  <Detail label="Menselijke aanbeveling" value={diplomaReadiness.instructor_recommendation?.replaceAll("_", " ") ?? "Nog niet vastgelegd"} />
                </div>
                <div className="mt-4 space-y-2">
                  {diplomaReadiness.reasons.map((reason) => (
                    <article className="rounded-lg border border-border bg-muted/35 p-3" key={reason.code}>
                      <p className="text-sm font-semibold text-foreground">{reason.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{reason.explanation}</p>
                      <p className="mt-2 text-xs font-semibold text-primary">{reason.evidence}</p>
                    </article>
                  ))}
                </div>
                <p className="mt-4 rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium leading-6 text-foreground">{diplomaReadiness.suggested_next_step}</p>
              </article>
              <div className="grid content-start gap-4">
                <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
                  <h2 className="font-bold text-foreground">Menselijke aanbeveling</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Deze keuze wordt gelogd als review. Alleen een admin kan daarna een afzwemevent kiezen en een uitnodiging versturen.</p>
                  <div className="mt-4 grid gap-2">
                    <ReadinessRecommendationButton participantId={participant.id} programId={program.id} status="not_ready" label="Verder ontwikkelen" />
                    <ReadinessRecommendationButton participantId={participant.id} programId={program.id} status="nearly_ready" label="Bijna klaar" />
                    <ReadinessRecommendationButton participantId={participant.id} programId={program.id} status="ready" label="Klaar voor admin-review" />
                  </div>
                </article>
                <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
                  <h2 className="font-bold text-foreground">Begeleidingscontext</h2>
                  {participantAttendanceRisks.length ? (
                    <div className="mt-3 space-y-2">
                      {participantAttendanceRisks.slice(0, 3).map((risk) => (
                        <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs leading-5 text-muted-foreground" key={`${risk.group_id}-${risk.signal_type}`}>{risk.reason}</p>
                      ))}
                    </div>
                  ) : <p className="mt-3 text-sm text-muted-foreground">Geen actueel aanwezigheidssignaal.</p>}
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">Aanwezigheid geeft context en beslist nooit zelfstandig over afzwemmen.</p>
                </article>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Visibility({ visibility }: { visibility: string }) {
  if (visibility === "parent_visible") {
    return (
      <StatusPill tone="success">
        <Eye className="h-3.5 w-3.5" /> ouder zichtbaar
      </StatusPill>
    );
  }

  return (
    <StatusPill tone="neutral">
      <Lock className="h-3.5 w-3.5" /> intern
    </StatusPill>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function TextField({ name, fieldId = name, label, placeholder, required = false }: { fieldId?: string; label: string; name: string; placeholder?: string; required?: boolean }) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input id={fieldId} name={name} placeholder={placeholder} required={required} />
    </FieldRoot>
  );
}

function TextAreaField({ name, fieldId = name, label, required = false }: { fieldId?: string; label: string; name: string; required?: boolean }) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Textarea id={fieldId} name={name} required={required} />
    </FieldRoot>
  );
}

function SelectField({ children, defaultValue, name, fieldId = name, label }: { children: ReactNode; defaultValue?: string; fieldId?: string; label: string; name: string }) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <NativeSelect defaultValue={defaultValue} id={fieldId} name={name}>
        {children}
      </NativeSelect>
    </FieldRoot>
  );
}

function Feedback({ saved, error, success }: { saved?: string; error?: string; success?: string }) {
  if (success) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">{success}</p>;
  }
  if (saved === "note") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Note opgeslagen.</p>;
  }

  if (saved === "badge") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Badge toegekend.</p>;
  }

  if (saved === "progress") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Progress score opgeslagen.</p>;
  }

  if (saved === "template") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Zwemsjabloon geinstalleerd.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function scoreTone(score: number): "success" | "warning" | "info" | "neutral" {
  if (score >= 4) {
    return "success";
  }

  if (score === 3) {
    return "info";
  }

  if (score === 2) {
    return "warning";
  }

  return "neutral";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function ReadinessRecommendationButton({ label, participantId, programId, status }: { label: string; participantId: string; programId: string; status: "not_ready" | "nearly_ready" | "ready" }) {
  return <form action={markInstructorReadinessRecommendationAction}><input name="participantId" type="hidden" value={participantId} /><input name="programId" type="hidden" value={programId} /><input name="status" type="hidden" value={status} /><input name="next" type="hidden" value={`/instructor/student/${participantId}?tab=graduation`} /><Button className="w-full justify-start" type="submit" variant={status === "ready" ? "default" : "outline"}>{label}</Button></form>;
}

function readinessLabel(value: string) {
  return ({ laag: "Verder ontwikkelen", in_ontwikkeling: "In ontwikkeling", bijna_klaar: "Bijna klaar", hoog_vertrouwen: "Hoog vertrouwen", klaar_voor_admin_review: "Klaar voor admin-review" } as Record<string, string>)[value] ?? value;
}

function readinessTone(value: string): "neutral" | "info" | "warning" | "success" {
  if (value === "klaar_voor_admin_review" || value === "hoog_vertrouwen") return "success";
  if (value === "bijna_klaar") return "warning";
  if (value === "in_ontwikkeling") return "info";
  return "neutral";
}

function getDossierTab(value?: string): "progress" | "assessment" | "notes" | "badges" | "graduation" {
  if (value === "assessment" || value === "notes" || value === "badges" || value === "graduation") {
    return value;
  }

  return "progress";
}
