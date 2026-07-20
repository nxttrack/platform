import { Award, ChartNoAxesColumnIncreasing, ClipboardCheck, Eye, Lock, MessageSquare, Star, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { Field as FieldRoot, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { awardBadgeAction, installSwimProgressTemplateAction, saveProgressNoteAction, scoreProgressItemAction } from "@/lib/domain/instructor-actions";
import { getInstructorData } from "@/lib/domain/instructor";
import { getPositiveScoreLabel, positiveScoreLevels } from "@/lib/domain/progress-template";

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

  const saved = getParam(rawParams, "saved");
  const error = getParam(rawParams, "error");
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
  const progressModules = data.progressModules.filter((module) => {
    const matchesProgram = !module.program_id || module.program_id === enrollment?.program_id;
    const matchesStage = !module.stage_id || module.stage_id === enrollment?.current_stage_id;

    return module.status === "active" && matchesProgram && matchesStage;
  });
  const itemsByModuleId = new Map(
    progressModules.map((module) => [module.id, data.progressItems.filter((item) => item.module_id === module.id && item.status === "active")])
  );

  return (
    <div className="space-y-6">
      <PageHeader kicker="Student detail" title={participant.display_name} subtitle="Progress notes, zichtbaarheid en badge action foundation." />
      <Feedback saved={saved} error={error} />

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

      {data.progressModules.length === 0 ? (
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
        </TabsList>

        <TabsContent value="progress">
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="grid content-start gap-3">
              <Detail label="Programma" value={program?.name ?? "Niet gezet"} />
              <Detail label="Badje" value={stage?.badge_label ?? stage?.name ?? "Niet gezet"} />
              <Detail label="Scores" value={String(scores.length)} />
              <Detail label="Notities en badges" value={`${notes.length} notities · ${badgeAwards.length} badges`} />
            </section>
            <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Huidige voortgang</h2>
                  <p className="mt-1 text-sm text-muted-foreground">De laatst opgeslagen beoordeling per onderdeel.</p>
                </div>
                <StatusPill tone={scores.length > 0 ? "success" : "neutral"}>{scores.length} scores</StatusPill>
              </div>
              <div className="mt-4 space-y-4">
                {progressModules.length === 0 ? <EmptyState>Er zijn nog geen actieve voortgangsmodules.</EmptyState> : null}
                {progressModules.map((module) => {
                  const items = itemsByModuleId.get(module.id) ?? [];

                  return (
                    <section className="rounded-lg border border-border bg-white p-4" key={module.id}>
                      <h3 className="font-bold text-foreground">{module.name}</h3>
                      <div className="mt-3 grid gap-2">
                        {items.length === 0 ? <EmptyState>Deze module heeft nog geen items.</EmptyState> : null}
                        {items.map((item) => {
                          const currentScore = scoreByItemId.get(item.id);

                          return (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2" key={item.id}>
                              <span className="text-sm font-semibold text-foreground">{item.name}</span>
                              {currentScore ? <StatusPill tone={scoreTone(currentScore.score)}>{getPositiveScoreLabel(currentScore.score)}</StatusPill> : <StatusPill>Nog niet gescoord</StatusPill>}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </article>
          </div>
        </TabsContent>

        <TabsContent value="assessment">
          <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">Progress modules</h2>
                <p className="mt-1 text-sm text-muted-foreground">5-level scoring met positieve taal voor ouderupdates.</p>
              </div>
              <StatusPill tone={scores.length > 0 ? "success" : "neutral"}>{scores.length} scores</StatusPill>
            </div>
            <div className="mt-4 space-y-4">
              {progressModules.length === 0 ? <EmptyState>Installeer eerst het zwemsjabloon of koppel modules aan dit programma.</EmptyState> : null}
              {progressModules.map((module) => {
                const items = itemsByModuleId.get(module.id) ?? [];

                return (
                  <div className="rounded-lg border border-border bg-white p-3" key={module.id}>
                    <div className="mb-3">
                      <p className="font-bold text-foreground">{module.name}</p>
                      {module.description ? <p className="mt-1 text-sm text-muted-foreground">{module.description}</p> : null}
                    </div>
                    <div className="space-y-3">
                      {items.length === 0 ? <EmptyState>Deze module heeft nog geen items.</EmptyState> : null}
                      {items.map((item) => {
                        const currentScore = scoreByItemId.get(item.id);

                        return (
                          <form action={scoreProgressItemAction} className="rounded-lg border border-border bg-muted/30 p-3" key={item.id}>
                            <input name="participantId" type="hidden" value={participant.id} />
                            <input name="moduleId" type="hidden" value={module.id} />
                            <input name="itemId" type="hidden" value={item.id} />
                            <input name="next" type="hidden" value={`/instructor/student/${participant.id}?tab=assessment`} />
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">{item.name}</p>
                                {item.positive_goal ? <p className="mt-1 text-sm text-muted-foreground">{item.positive_goal}</p> : null}
                              </div>
                              {currentScore ? <StatusPill tone={scoreTone(currentScore.score)}>{getPositiveScoreLabel(currentScore.score)}</StatusPill> : <StatusPill>Nog niet gescoord</StatusPill>}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <SelectField defaultValue={String(currentScore?.score ?? 3)} fieldId={`score-${item.id}`} label="Score" name="score">
                                {positiveScoreLevels.map((level) => (
                                  <option key={level.score} value={level.score}>
                                    {level.score} - {level.label}
                                  </option>
                                ))}
                              </SelectField>
                              <SelectField defaultValue={currentScore?.visibility ?? "parent_visible"} fieldId={`visibility-${item.id}`} label="Zichtbaarheid" name="visibility">
                                <option value="parent_visible">Zichtbaar voor ouder</option>
                                <option value="internal">Alleen intern</option>
                              </SelectField>
                            </div>
                            <div className="mt-3">
                              <TextAreaField fieldId={`note-${item.id}`} label="Korte update" name="note" />
                            </div>
                            <Button className="mt-3" type="submit">
                              <Star className="h-4 w-4" />
                              Score opslaan
                            </Button>
                          </form>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
              <h2 className="text-lg font-bold text-foreground">Badge toekennen</h2>
              <form action={awardBadgeAction} className="mt-4 grid gap-3">
                <input name="participantId" type="hidden" value={participant.id} />
                <input name="enrollmentId" type="hidden" value={enrollment?.id ?? ""} />
                <input name="next" type="hidden" value={`/instructor/student/${participant.id}?tab=badges`} />
                <SelectField fieldId="badge-definition" label="Badgecatalogus" name="badgeDefinitionId">
                  <option value="">Vrije badge</option>
                  {data.badgeDefinitions.map((badge) => (
                    <option key={badge.id} value={badge.id}>
                      {badge.name}
                    </option>
                  ))}
                </SelectField>
                <TextField fieldId="badge-title" label="Badgetitel" name="title" placeholder="Optioneel bij catalogusbadge" />
                <TextAreaField fieldId="badge-note" label="Badgenotitie" name="note" />
                <SelectField fieldId="badge-visibility" label="Zichtbaarheid" name="visibility">
                  <option value="parent_visible">Zichtbaar voor ouder</option>
                  <option value="internal">Alleen intern</option>
                </SelectField>
                <Button type="submit">
                  <Award className="h-4 w-4" />
                  Badge toekennen
                </Button>
              </form>
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

function Feedback({ saved, error }: { saved?: string; error?: string }) {
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

function getDossierTab(value?: string): "progress" | "assessment" | "notes" | "badges" {
  if (value === "assessment" || value === "notes" || value === "badges") {
    return value;
  }

  return "progress";
}
