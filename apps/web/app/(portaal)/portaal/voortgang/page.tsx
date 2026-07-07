import { Award, Bell, Star, TrendingUp, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant, getParentPortalData } from "@/lib/domain/parent-portal";
import { getPositiveScoreLabel } from "@/lib/domain/progress-template";

export const dynamic = "force-dynamic";

export default async function ParentProgressPage() {
  const data = await getParentPortalData();
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const badgeDefinitionById = new Map(data.badgeDefinitions.map((badge) => [badge.id, badge]));
  const itemsByModuleId = new Map(data.progressModules.map((module) => [module.id, data.progressItems.filter((item) => item.module_id === module.id)]));
  const scoreByParticipantItem = new Map(data.progressScores.map((score) => [`${score.participant_id}:${score.item_id}`, score]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Voortgang" title="Zwemgroei en badges" subtitle="Bekijk de huidige route, positieve scores, badges en updates van de zwemschool." />

      {data.notifications.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Laatste updates</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.notifications.slice(0, 4).map((notification) => (
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

      {data.participants.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">Er zijn nog geen athletes gekoppeld.</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.participants.map((participant) => {
            const enrollment = getActiveEnrollmentForParticipant(data, participant.id);
            const memberships = getActiveMembershipsForParticipant(data, participant.id);
            const stage = enrollment?.current_stage_id ? stageById.get(enrollment.current_stage_id) : null;
            const progressModules = data.progressModules.filter((module) => {
              const matchesProgram = !module.program_id || module.program_id === enrollment?.program_id;
              const matchesStage = !module.stage_id || module.stage_id === enrollment?.current_stage_id;

              return matchesProgram && matchesStage;
            });
            const participantScores = data.progressScores.filter((score) => score.participant_id === participant.id);
            const participantBadges = data.badgeAwards.filter((badge) => badge.participant_id === participant.id);

            return (
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={participant.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">Athlete</p>
                    <h2 className="mt-1 text-xl font-bold text-foreground">{participant.display_name}</h2>
                  </div>
                  <StatusPill tone={enrollment?.status === "active" ? "success" : "neutral"}>{enrollment?.status ?? "geen inschrijving"}</StatusPill>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Detail icon={<Waves className="h-4 w-4" />} label="Programma" value={enrollment ? programById.get(enrollment.program_id)?.name ?? "Programma" : "Niet actief"} />
                  <Detail icon={<TrendingUp className="h-4 w-4" />} label="Badje" value={stage?.badge_label ?? stage?.name ?? "Nog niet gezet"} />
                  <Detail icon={<Waves className="h-4 w-4" />} label="Lesgroep" value={memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep").join(", ") || "Nog niet geplaatst"} />
                  <Detail icon={<TrendingUp className="h-4 w-4" />} label="Startdatum" value={enrollment?.starts_on ? formatDate(enrollment.starts_on) : "Onbekend"} />
                </div>

                <section className="mt-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-foreground">Progress</h3>
                    <StatusPill tone={participantScores.length > 0 ? "success" : "neutral"}>{participantScores.length} scores</StatusPill>
                  </div>
                  {progressModules.length === 0 ? <EmptyState>Nog geen voortgangsmodules zichtbaar.</EmptyState> : null}
                  {progressModules.map((module) => {
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
                                  {score ? <StatusPill tone={scoreTone(score.score)}>{getPositiveScoreLabel(score.score)}</StatusPill> : <StatusPill>Nog onderweg</StatusPill>}
                                </div>
                                {score?.note ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{score.note}</p> : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </section>

                <section className="mt-5 space-y-3">
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

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-primary">{icon}</div>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground">{value}</p>
    </div>
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
