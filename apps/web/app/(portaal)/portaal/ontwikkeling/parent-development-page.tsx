import { Award, Bell, Star, TrendingUp, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { FivePointAssessment } from "@/components/assessments/five-point-assessment";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { SwimJourneyRings } from "@/components/progress/swim-journey-rings";
import { PageHeader, ProgressRing, StatusPill } from "@/components/shell/ui";
import { getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant, getParentPortalData } from "@/lib/domain/parent-portal";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { getPositiveScoreLabel } from "@/lib/domain/progress-template";
import { parseLearnerAssessmentValue } from "@/lib/domain/learner-assessment";
import {
  getJourneyForEnrollment,
  type CanonicalSwimJourney
} from "@/lib/domain/swim-progress";
import {
  getThemeDisplayName,
  getThemeRelease
} from "@/lib/theme/portal-theme-registry";
import {
  getPortalTerminology,
  type PortalTerminology
} from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ParentDevelopmentPage({ searchParams }: { searchParams?: Promise<ParentPortalSearchParams> }) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipants = selectedParticipantId ? data.participants.filter((participant) => participant.id === selectedParticipantId) : data.participants;
  const visibleParticipantIds = new Set(visibleParticipants.map((participant) => participant.id));
  const visibleProgressScores = data.progressScores.filter((score) => visibleParticipantIds.has(score.participant_id));
  const participantsWithCanonicalJourney = new Set(
    [...data.swimJourneys.byEnrollmentId.values()].map((journey) => journey.participantId)
  );
  const visibleAssessmentRatings = [
    ...data.swimJourneys.observations
      .filter((observation) => visibleParticipantIds.has(observation.participant_id))
      .map((observation) => observation.rating),
    ...visibleProgressScores
      .filter((score) => !participantsWithCanonicalJourney.has(score.participant_id))
      .map((score) => score.score)
  ];
  const visibleBadgeAwards = data.badgeAwards.filter((award) => visibleParticipantIds.has(award.participant_id));
  const visibleNotifications = data.notifications.filter((notification) =>
    ["badge_award", "progress_score"].includes(notification.type) &&
    (!notification.participant_id || visibleParticipantIds.has(notification.participant_id))
  );
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const badgeDefinitionById = new Map(data.badgeDefinitions.map((badge) => [badge.id, badge]));
  const itemsByModuleId = new Map(data.progressModules.map((module) => [module.id, data.progressItems.filter((item) => item.module_id === module.id)]));
  const scoreByParticipantItem = new Map(data.progressScores.map((score) => [`${score.participant_id}:${score.item_id}`, score]));
  const averageScore = visibleAssessmentRatings.length > 0
    ? Math.round((visibleAssessmentRatings.reduce((total, rating) => total + rating, 0) / visibleAssessmentRatings.length) * 10) / 10
    : null;
  const terminology = getPortalTerminology(data.portalTheme.manifest, data.tenant.sector);

  return (
    <div className="space-y-6">
      <PageHeader kicker={`De ${terminology.journey} in beeld`} title="Ontwikkeling" subtitle="Volg vaardigheden, positieve feedback en bijzondere mijlpalen per kind." />
      <ParentSectionNav
        items={[
          { active: true, href: participantContextHref("/portaal/ontwikkeling", selectedParticipantId), label: "Voortgang" },
          { href: participantContextHref("/portaal/ontwikkeling/badges", selectedParticipantId), label: "Badges" },
          { href: participantContextHref("/portaal/ontwikkeling/media", selectedParticipantId), label: "Media" },
          { href: participantContextHref("/portaal/ontwikkeling/diplomas", selectedParticipantId), label: titleCase(terminology.finalCredentials) }
        ]}
        label="Ontwikkeling onderdelen"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Summary icon={<Waves className="h-5 w-5" />} label={selectedParticipantId ? "Kind" : "Kinderen"} value={visibleParticipants.length.toString()} />
        <Summary icon={<TrendingUp className="h-5 w-5" />} label="Vaardigheden" value={visibleAssessmentRatings.length.toString()} />
        <Summary icon={<Star className="h-5 w-5" />} label="Gemiddelde" value={averageScore ? `${averageScore} / 5` : "Nog niet beoordeeld"} />
        <Summary icon={<Award className="h-5 w-5" />} label="Badges" value={visibleBadgeAwards.length.toString()} />
      </div>

      {visibleNotifications.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Laatste updates</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {visibleNotifications.slice(0, 4).map((notification) => (
              <div className="rounded-lg border border-border bg-white px-3 py-3" key={notification.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={notification.status === "unread" ? "info" : "neutral"}>{notification.type === "badge_award" ? "badge" : "voortgang"}</StatusPill>
                  <span className="text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</span>
                </div>
                <p className="font-bold text-foreground">{notification.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {visibleParticipants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">Er zijn nog geen athletes gekoppeld.</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {visibleParticipants.map((participant) => {
            const enrollment = getActiveEnrollmentForParticipant(data, participant.id);
            const memberships = getActiveMembershipsForParticipant(data, participant.id);
            const stage = enrollment?.current_stage_id ? stageById.get(enrollment.current_stage_id) : null;
            const progressModules = data.progressModules.filter((module) => {
              const matchesProgram = !module.program_id || module.program_id === enrollment?.program_id;
              const matchesStage = !module.stage_id || module.stage_id === enrollment?.current_stage_id;

              return matchesProgram && matchesStage;
            });
            const participantScores = data.progressScores.filter((score) => score.participant_id === participant.id);
            const journey = getJourneyForEnrollment(data.swimJourneys, enrollment?.id);
            const canonicalScores = journey?.effectiveObservations ?? [];
            const participantBadges = data.badgeAwards.filter((badge) => badge.participant_id === participant.id);
            const participantAverage = journey
              ? canonicalScores.length > 0
                ? canonicalScores.reduce((total, score) => total + score.rating, 0) / canonicalScores.length
                : 0
              : participantScores.length > 0
                ? participantScores.reduce((total, score) => total + score.score, 0) / participantScores.length
                : 0;
            const progressPercent = journey?.rings.find((ring) => ring.kind === "diploma")?.progressPercent
              ?? Math.round((participantAverage / 5) * 100);
            const latestScore = journey ? canonicalScores[0] ?? null : participantScores[0] ?? null;
            const assessmentCount = journey ? canonicalScores.length : participantScores.length;

            return (
              <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-card" key={participant.id}>
                <div className="grid gap-5 bg-gradient-to-br from-aqua-soft via-card to-primary/10 p-5 sm:grid-cols-2 sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground shadow-glow">{getInitials(participant.display_name)}</div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Mijn {terminology.route}</p>
                      <h2 className="mt-1 text-2xl font-bold text-foreground">{participant.display_name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{journey?.currentStage?.name ?? stage?.badge_label ?? stage?.name ?? `De ${terminology.journey} is gestart`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:justify-end">
                    {journey
                      ? <SwimJourneyRings compact labels={{ stage: terminology.stage, diploma: terminology.finalCredential }} rings={journey.rings} />
                      : <ProgressRing label="groei" size={94} value={progressPercent} />}
                    <StatusPill tone={enrollment?.status === "active" ? "success" : "neutral"}>{enrollment?.status === "active" ? "actief" : enrollment?.status ?? "geen inschrijving"}</StatusPill>
                  </div>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  <Detail icon={<Waves className="h-4 w-4" />} label="Programma" value={enrollment ? programById.get(enrollment.program_id)?.name ?? "Programma" : "Niet actief"} />
                  <Detail icon={<TrendingUp className="h-4 w-4" />} label={titleCase(terminology.stage)} value={journey?.currentStage?.name ?? stage?.badge_label ?? stage?.name ?? "Nog niet gezet"} />
                  <Detail icon={<Waves className="h-4 w-4" />} label="Groep" value={memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep").join(", ") || "Nog niet geplaatst"} />
                  <Detail icon={<TrendingUp className="h-4 w-4" />} label="Startdatum" value={enrollment?.starts_on ? formatDate(enrollment.starts_on) : "Onbekend"} />
                </div>

                {latestScore?.note ? (
                  <div className="mx-5 rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Laatste compliment</p>
                    <p className="mt-2 text-sm leading-6 text-foreground">“{latestScore.note}”</p>
                  </div>
                ) : null}

                <section className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-foreground">Progress</h3>
                    <StatusPill tone={assessmentCount > 0 ? "success" : "neutral"}>{assessmentCount} beoordelingen</StatusPill>
                  </div>
                  {journey ? (
                    <CanonicalJourneyItems assessmentDisplay={data.settings.assessment_rating_display} journey={journey} terminology={terminology} />
                  ) : null}
                  {!journey && progressModules.length === 0 ? <EmptyState>Nog geen voortgangsmodules zichtbaar.</EmptyState> : null}
                  {!journey ? progressModules.map((module) => {
                    const items = itemsByModuleId.get(module.id) ?? [];

                    return (
                      <div className="rounded-lg border border-border bg-white p-3" key={module.id}>
                        <p className="font-semibold text-foreground">{module.name}</p>
                        <div className="mt-3 space-y-2">
                          {items.length === 0 ? <EmptyState>Deze module heeft nog geen items.</EmptyState> : null}
                          {items.map((item) => {
                            const score = scoreByParticipantItem.get(`${participant.id}:${item.id}`);

                            return (
                              <div className="rounded-lg border border-border bg-muted/30 px-3 py-3" key={item.id}>
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{item.name}</p>
                                    {item.positive_goal ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.positive_goal}</p> : null}
                                  </div>
                                  {score ? <StatusPill tone={scoreTone(score.score)}>{getPositiveScoreLabel(score.score)}</StatusPill> : <StatusPill>Nog niet beoordeeld</StatusPill>}
                                </div>
                                <div className="mt-3">
                                  <FivePointAssessment
                                    display={data.settings.assessment_rating_display}
                                    label={item.name}
                                    readOnly
                                    value={score ? parseLearnerAssessmentValue(score.score) : null}
                                  />
                                </div>
                                {score?.note ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{score.note}</p> : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }) : null}
                </section>

                <section className="space-y-3 border-t border-border p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-foreground">Badges</h3>
                    <StatusPill tone={participantBadges.length > 0 ? "success" : "neutral"}>{participantBadges.length} badges</StatusPill>
                  </div>
                  {participantBadges.length === 0 ? <EmptyState>Nog geen badges zichtbaar.</EmptyState> : null}
                  {participantBadges.map((badge) => {
                    const definition = badge.badge_definition_id ? badgeDefinitionById.get(badge.badge_definition_id) : null;

                    return (
                      <div className="rounded-lg border border-border bg-white px-3 py-3" key={badge.id}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Award className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-bold text-foreground">{badge.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{definition?.description ?? formatDateTime(badge.awarded_at)}</p>
                            </div>
                          </div>
                          <StatusPill tone="success">
                            <Star className="h-3.5 w-3.5" />
                            behaald
                          </StatusPill>
                        </div>
                        {badge.note ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{badge.note}</p> : null}
                      </div>
                    );
                  })}
                </section>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CanonicalJourneyItems({
  assessmentDisplay,
  journey,
  terminology
}: {
  assessmentDisplay: "smileys" | "stars";
  journey: CanonicalSwimJourney;
  terminology: PortalTerminology;
}) {
  const observationByItemId = new Map(
    journey.effectiveObservations.map((observation) => [observation.curriculum_item_id, observation])
  );
  const openCarryoverItemIds = new Set(
    journey.carryovers
      .filter((carryover) => carryover.status === "open")
      .map((carryover) => carryover.curriculum_item_id)
  );

  return (
    <div className="space-y-3">
      {journey.chapterSnapshots.length ? (
        <section className="rounded-lg border border-border bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">Afgeronde hoofdstukken</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Deze hoofdstukken behouden de route, voortgang en vormgeving van het voltooiingsmoment.</p>
            </div>
            <StatusPill tone="success">{journey.chapterSnapshots.length} voltooid</StatusPill>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {journey.chapterSnapshots.map((snapshot) => {
              const stage = journey.stages.find((candidate) => candidate.id === snapshot.curriculum_stage_id);
              const release = getThemeRelease(snapshot.theme_key, snapshot.theme_release);
              const artwork = release?.assets["progress.journey.desktop"]?.path === snapshot.artwork_id
                ? snapshot.artwork_id
                : null;
              return (
                <article className="overflow-hidden rounded-lg border border-border bg-muted/20" key={snapshot.id}>
                  {artwork ? (
                    // The checksum-locked snapshot artwork is decorative and validated against the immutable registry.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt="" aria-hidden="true" className="h-24 w-full object-cover" src={artwork} />
                  ) : null}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-foreground">{stage?.name ?? "Afgerond hoofdstuk"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {release ? getThemeDisplayName(release) : "Historische vormgeving"} · v{snapshot.theme_release}
                        </p>
                      </div>
                      <StatusPill tone="success">voltooid</StatusPill>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {snapshot.route_order_json.length} onderdelen · {snapshot.badge_award_ids.length} badge{snapshot.badge_award_ids.length === 1 ? "" : "s"} · {formatDate(snapshot.completed_at)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {journey.stages.map((stage) => {
        const items = journey.items.filter((item) => item.curriculum_stage_id === stage.id);
        const isCurrent = stage.id === journey.currentStage?.id;

        return (
          <section className="rounded-lg border border-border bg-white p-3" key={stage.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{stage.name}</p>
                {stage.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</p> : null}
              </div>
              <StatusPill tone={isCurrent ? "info" : "neutral"}>{isCurrent ? `huidig ${terminology.stage}` : terminology.journey}</StatusPill>
            </div>
            <div className="mt-3 space-y-2">
              {items.length === 0 ? <EmptyState>Dit {terminology.stage} heeft nog geen onderdelen.</EmptyState> : null}
              {items.map((item) => {
                const observation = observationByItemId.get(item.id);

                return (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-3" key={item.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        {item.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p> : null}
                      </div>
                      <span className="flex flex-wrap gap-2">
                        {openCarryoverItemIds.has(item.id) ? <StatusPill tone="warning">open uit vorig {terminology.stage}</StatusPill> : null}
                        {observation
                          ? <StatusPill tone={scoreTone(observation.rating)}>{observation.positive_label}</StatusPill>
                          : <StatusPill>Nog niet beoordeeld</StatusPill>}
                      </span>
                    </div>
                    <div className="mt-3">
                      <FivePointAssessment
                        display={assessmentDisplay}
                        label={item.name}
                        readOnly
                        value={observation ? parseLearnerAssessmentValue(observation.rating) : null}
                      />
                    </div>
                    {observation?.note ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{observation.note}</p> : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
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

function Summary({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
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

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
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

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
