import { ArrowRight, Bell, CheckCircle2, CreditCard, GraduationCap, MessageSquare, RefreshCcw, TrendingUp, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FamilyCommandCenter, type FamilyChild } from "@/components/parent/family-command-center";
import { PortalOverviewHero } from "@/components/parent/portal-overview-hero";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { formatLessonDate, getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant, getNextLesson, getParentPortalData } from "@/lib/domain/parent-portal";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { resolveTenantPortalTheme } from "@/lib/theme/portal-theme-server";

export const dynamic = "force-dynamic";

export default async function ParentHomePage({ searchParams }: { searchParams?: Promise<ParentPortalSearchParams> }) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve({})]);
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipants = selectedParticipantId
    ? data.participants.filter((participant) => participant.id === selectedParticipantId)
    : data.participants;
  const visibleParticipantIds = new Set(visibleParticipants.map((participant) => participant.id));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const nextLesson = getNextLesson(data, selectedParticipantId ?? undefined);
  const activeCredits = data.catchUpCredits.filter((credit) => credit.status === "available" && visibleParticipantIds.has(credit.participant_id));
  const visibleNotifications = data.notifications.filter((notification) => !notification.participant_id || visibleParticipantIds.has(notification.participant_id));
  const unreadNotifications = visibleNotifications.filter((notification) => notification.status === "unread");
  const pendingGraduationInvite = data.graduationParticipants.find((invite) => invite.invite_status === "sent" && visibleParticipantIds.has(invite.participant_id));
  const openPayment = data.manualPayments.find((payment) => ["due", "overdue"].includes(payment.status) && visibleParticipantIds.has(payment.participant_id));
  const actions = [
    ...(pendingGraduationInvite ? [{
      href: participantContextHref("/portaal/planning#afzwemmen", selectedParticipantId),
      icon: <GraduationCap className="size-5" />,
      label: "Afzwemuitnodiging beantwoorden",
      tone: "warning" as const
    }] : []),
    ...(openPayment ? [{
      href: participantContextHref("/portaal/betalingen", selectedParticipantId),
      icon: <CreditCard className="size-5" />,
      label: "Openstaande betaling bekijken",
      tone: "danger" as const
    }] : []),
    ...(unreadNotifications.length ? [{
      href: participantContextHref("/portaal/inbox", selectedParticipantId),
      icon: <Bell className="size-5" />,
      label: `${unreadNotifications.length} ongelezen ${unreadNotifications.length === 1 ? "update" : "updates"}`,
      tone: "info" as const
    }] : []),
    ...(activeCredits.length ? [{
      href: participantContextHref("/portaal/planning#inhalen", selectedParticipantId),
      icon: <RefreshCcw className="size-5" />,
      label: `${activeCredits.length} ${activeCredits.length === 1 ? "inhaalcredit" : "inhaalcredits"} beschikbaar`,
      tone: "success" as const
    }] : [])
  ];
  const familyChildren: FamilyChild[] = visibleParticipants.map((participant) => {
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
      progressPercent: Math.max(0, Math.min(100, Math.round((averageScore / 5) * 100))),
      timeline
    };
  });
  const resolvedTheme = await resolveTenantPortalTheme(data.tenant.id);
  const overviewChild = selectedParticipantId
    ? familyChildren.find((child) => child.id === selectedParticipantId) ?? null
    : familyChildren[0] ?? null;
  const overviewLesson = overviewChild ? getNextLesson(data, overviewChild.id) : null;
  const overviewLocationId = overviewLesson?.resource_id
    ?? (overviewLesson ? groupById.get(overviewLesson.group_id)?.default_resource_id : null);
  const profileFirstName = data.profile?.full_name?.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Welkom${profileFirstName ? `, ${profileFirstName}` : ""}`}
        title="Overzicht"
        subtitle={selectedParticipantId ? `Alles wat nu belangrijk is voor ${visibleParticipants[0]?.display_name ?? "je kind"}.` : "Alles wat nu belangrijk is voor je gezin."}
      />

      <PortalOverviewHero
        child={overviewChild ? {
          initial: overviewChild.name.trim().charAt(0).toUpperCase() || "★",
          location: overviewLocationId ? resourceById.get(overviewLocationId)?.name ?? null : null,
          name: overviewChild.name,
          nextLesson: overviewChild.nextLesson,
          program: overviewChild.program,
          progressPercent: overviewChild.progressPercent,
          stage: overviewChild.stage
        } : null}
        href={participantContextHref("/portaal/ontwikkeling", selectedParticipantId ?? overviewChild?.id ?? null)}
        recipeId={resolvedTheme.manifest.recipes.pages.overview}
      />

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Actie nodig</p>
            <h2 className="mt-1 text-xl font-bold text-foreground">{actions.length ? `${actions.length} ${actions.length === 1 ? "aandachtspunt" : "aandachtspunten"}` : "Je bent helemaal bij"}</h2>
          </div>
          {actions.length ? <StatusPill tone="warning">{actions.length} open</StatusPill> : <CheckCircle2 className="size-7 text-success" />}
        </div>
        {actions.length ? (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {actions.map((action) => (
              <Link className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-background px-3 transition hover:border-primary/30 hover:bg-primary/5" href={action.href} key={action.label}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${action.tone === "danger" ? "bg-danger/10 text-danger" : action.tone === "warning" ? "bg-warning/15 text-warning-foreground" : action.tone === "success" ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>{action.icon}</span>
                <span className="min-w-0 flex-1 text-sm font-bold text-foreground">{action.label}</span>
                <ArrowRight className="size-4 shrink-0 text-primary" />
              </Link>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">Er staan geen open acties klaar.</p>}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <QuickLink href={participantContextHref("/portaal/planning", selectedParticipantId)} icon={<Waves className="h-5 w-5" />} label="Planning" value={nextLesson ? "Volgende les gepland" : "Geen les gepland"} />
        <QuickLink href={participantContextHref("/portaal/ontwikkeling", selectedParticipantId)} icon={<TrendingUp className="h-5 w-5" />} label="Ontwikkeling" value={`${data.badgeAwards.filter((award) => visibleParticipantIds.has(award.participant_id)).length} badges`} />
        <QuickLink href={participantContextHref("/portaal/inbox", selectedParticipantId)} icon={<MessageSquare className="h-5 w-5" />} label="Inbox" value={`${unreadNotifications.length} ongelezen`} />
      </div>

      {visibleNotifications.length > 0 ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Laatste updates</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {visibleNotifications.slice(0, 3).map((notification) => (
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
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={participantContextHref("/portaal/planning", selectedParticipantId)}>
              Naar planning <ArrowRight className="h-4 w-4" />
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
          <h2 className="text-lg font-bold text-foreground">{selectedParticipantId ? "Ontwikkeling" : "Je gezin"}</h2>
          <Link className="text-sm font-semibold text-primary hover:underline" href={participantContextHref("/portaal/ontwikkeling", selectedParticipantId)}>
            Alles bekijken
          </Link>
        </div>
        {visibleParticipants.length === 0 ? (
          <EmptyState>Er zijn nog geen kinderen gekoppeld aan dit portaal.</EmptyState>
        ) : selectedParticipantId ? (
          <FamilyCommandCenter children={familyChildren} contextParticipantId={selectedParticipantId} />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {familyChildren.map((child) => <FamilyOverviewCard child={child} key={child.id} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function FamilyOverviewCard({ child }: { child: FamilyChild }) {
  const recent = child.timeline[0];
  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{child.stage}</p>
          <h3 className="mt-1 text-xl font-bold text-foreground">{child.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{child.program} · {child.group}</p>
        </div>
        <Link aria-label={`Bekijk alles voor ${child.name}`} className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" href={`/portaal?kind=${encodeURIComponent(child.id)}`}>
          <ArrowRight className="size-5" />
        </Link>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Volgende les</p>
          <p className="mt-1 text-sm font-bold text-foreground">{child.nextLesson ?? "Nog niet gepland"}</p>
        </div>
        <div className="rounded-xl bg-muted/40 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Laatste update</p>
          <p className="mt-1 text-sm font-bold text-foreground">{recent?.title ?? "De zwemreis is gestart"}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex items-center justify-between text-sm"><span className="font-semibold">Voortgang</span><span className="font-bold text-primary">{child.progressPercent}%</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${child.progressPercent}%` }} /></div>
      </div>
    </article>
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
