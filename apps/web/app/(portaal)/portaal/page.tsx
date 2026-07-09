import { ArrowRight, Bell, CalendarDays, MessageSquare, RefreshCcw, TrendingUp, UsersRound, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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
          <div className="grid gap-4 lg:grid-cols-2">
            {data.participants.map((participant) => {
              const enrollment = getActiveEnrollmentForParticipant(data, participant.id);
              const memberships = getActiveMembershipsForParticipant(data, participant.id);
              const next = getNextLesson(data, participant.id);
              const groupNames = memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Groep");

              return (
                <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={participant.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Athlete</p>
                      <h3 className="mt-1 text-xl font-bold text-foreground">{participant.display_name}</h3>
                    </div>
                    <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm">
                    <Info label="Programma" value={enrollment ? programById.get(enrollment.program_id)?.name ?? "Programma" : "Geen actieve inschrijving"} />
                    <Info label="Badje" value={enrollment?.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "Badje" : "Nog niet gezet"} />
                    <Info label="Groep" value={groupNames.length > 0 ? groupNames.join(", ") : "Nog niet geplaatst"} />
                    <Info label="Volgende les" value={next ? formatLessonDate(next.starts_at, next.ends_at) : "Nog niet gepland"} />
                  </div>
                </article>
              );
            })}
          </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2">
      <Waves className="h-4 w-4 text-primary" />
      <span className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
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
