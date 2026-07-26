import { ArrowRight, Bell, CalendarDays, MessageSquare, RefreshCcw, TrendingUp, UsersRound, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FamilyCommandCenter, type FamilyChild } from "@/components/parent/family-command-center";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { formatLessonDate, getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant, getNextLesson, getParentPortalData } from "@/lib/domain/parent-portal";

export const dynamic = "force-dynamic";

export default async function ParentHomePage() {
  const data = await getParentPortalData();
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const nextLesson = getNextLesson(data);
  const activeCredits = data.catchUpCredits.filter((credit) => credit.status === "available");
  const unreadNotifications = data.notifications.filter((notification) => notification.status === "unread");
  const familyChildren: FamilyChild[] = data.participants.map((participant) => {
    const enrollment = getActiveEnrollmentForParticipant(data, participant.id);
    const memberships = getActiveMembershipsForParticipant(data, participant.id);
    const next = getNextLesson(data, participant.id);
    const scores = data.progressScores.filter((score) => score.participant_id === participant.id);
    const badges = data.badgeAwards.filter((badge) => badge.participant_id === participant.id);
    const timeline: FamilyChild["timeline"] = [
      ...scores.map((score) => ({ date: score.scored_at, detail: score.note || score.positive_label, kind: "progress" as const, title: score.positive_label })),
      ...badges.map((badge) => ({ date: badge.awarded_at, detail: badge.note || "Een nieuwe mijlpaal is behaald.", kind: "badge" as const, title: badge.title })),
      ...data.sessions.filter((session) => memberships.some((membership) => membership.group_id === session.group_id) && new Date(session.ends_at).getTime() < Date.now()).slice(-3).map((session) => ({ date: session.ends_at, detail: groupById.get(session.group_id)?.name ?? "Lesgroep", kind: "lesson" as const, title: "Les gevolgd" }))
    ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const averageScore = scores.length ? scores.reduce((total, score) => total + Number(score.score), 0) / scores.length : 0;

    return {
      id: participant.id,
      name: participant.display_name,
      program: enrollment ? programById.get(enrollment.program_id)?.name ?? "Programma" : "Nog geen programma",
      stage: enrollment?.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "Niveau" : "Startniveau",
      group: memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep").join(", ") || "Nog niet geplaatst",
      nextLesson: next ? formatLessonDate(next.starts_at, next.ends_at) : null,
      progressPercent: Math.max(0, Math.min(100, Math.round((averageScore / 4) * 100))),
      timeline
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Ouderportaal" title={`Welkom${data.profile?.full_name ? `, ${data.profile.full_name}` : ""}`} subtitle="Overzicht van kinderen, lessen, plaatsing en inhaalmogelijkheden." />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<UsersRound className="h-5 w-5" />} label="Kinderen" value={data.participants.length} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Geplande lessen" value={data.sessions.filter((session) => new Date(session.starts_at).getTime() >= Date.now()).length} />
        <Metric icon={<RefreshCcw className="h-5 w-5" />} label="Inhaalcredits" value={activeCredits.length} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink href="/portaal/lessen" icon={<Waves className="h-5 w-5" />} label="Mijn lessen" value={nextLesson ? "Volgende les gepland" : "Geen les gepland"} />
        <QuickLink href="/portaal/voortgang" icon={<TrendingUp className="h-5 w-5" />} label="Voortgang" value={`${data.badgeAwards.length} badges`} />
        <QuickLink href="/portaal/berichten" icon={<MessageSquare className="h-5 w-5" />} label="Berichten" value={`${unreadNotifications.length} ongelezen`} />
      </div>

      {data.notifications.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Laatste updates</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {data.notifications.slice(0, 3).map((notification) => (
              <div className="rounded-lg border border-border bg-white px-3 py-3" key={notification.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone={notification.status === "unread" ? "info" : "neutral"}>{notificationLabel(notification.type)}</StatusPill>
                  <span className="text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</span>
                </div>
                <p className="font-bold text-foreground">{notification.title}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{notification.message}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Volgende les</p>
              <h2 className="mt-1 text-2xl font-bold text-foreground">{nextLesson ? formatLessonDate(nextLesson.starts_at, nextLesson.ends_at) : "Nog geen les gepland"}</h2>
              {nextLesson ? <p className="mt-2 text-sm text-muted-foreground">{groupById.get(nextLesson.group_id)?.name ?? "Lesgroep"}</p> : null}
            </div>
            <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/portaal/lessen">
              Lessen <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Inhalen</p>
          <h2 className="mt-1 text-2xl font-bold text-foreground">{activeCredits.length} beschikbaar</h2>
          <p className="mt-2 text-sm text-muted-foreground">Credits ontstaan automatisch bij een tijdige annulering volgens het beleid van de organisatie.</p>
        </Card>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground">Kinderen</h2>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/portaal/kinderen">
            Alle kinderen
          </Link>
        </div>
        {data.participants.length === 0 ? (
          <EmptyState>Er zijn nog geen kinderen gekoppeld aan dit portaal.</EmptyState>
        ) : (
          <FamilyCommandCenter children={familyChildren} />
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
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

function QuickLink({ href, icon, label, value }: { href: string; icon: ReactNode; label: string; value: string }) {
  return (
    <Link className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-soft transition hover:border-primary/40 hover:bg-primary/5" href={href}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <span className="min-w-0">
          <span className="block font-bold text-foreground">{label}</span>
          <span className="block truncate text-sm text-muted-foreground">{value}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
    </Link>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function notificationLabel(type: string) {
  if (type === "admin_message") {
    return "bericht";
  }

  if (type === "document_published") {
    return "document";
  }

  if (type === "payment_due" || type === "payment_overdue" || type === "payment_received") {
    return "betaling";
  }

  if (type === "graduation_invite" || type === "certificate_issued") {
    return "afzwemmen";
  }

  if (type === "badge_award") {
    return "badge";
  }

  return "update";
}
