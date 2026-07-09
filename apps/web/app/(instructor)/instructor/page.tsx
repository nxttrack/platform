import { ArrowRight, Bell, CalendarCheck, CheckCircle2, ListChecks, MessageSquare, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { completeSessionAction } from "@/lib/domain/instructor-actions";
import { formatSessionTime, getInstructorData, getSessionRoster, getTodaySessions } from "@/lib/domain/instructor";
import { PageHeader, StatusPill } from "@/components/shell/ui";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function InstructorHomePage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getInstructorData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const todaySessions = getTodaySessions(data);
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const attendanceBySession = groupBy(data.attendance, "session_id");
  const unreadNotifications = data.notifications.filter((notification) => notification.status === "unread");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Instructor" title="Vandaag" subtitle="Toegewezen lessen, rosters en snelle registratie voor de zwemzaal." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<CalendarCheck className="h-5 w-5" />} label="Vandaag" value={todaySessions.length} />
        <Metric icon={<UsersRound className="h-5 w-5" />} label="Groepen" value={data.groups.length} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Registraties" value={todaySessions.reduce((total, session) => total + (attendanceBySession.get(session.id)?.length ?? 0), 0)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <QuickLink href="/instructor/berichten" icon={<MessageSquare className="h-5 w-5" />} label="Berichten" value={`${unreadNotifications.length} ongelezen`} />
        <QuickLink href="/instructor/taken" icon={<ListChecks className="h-5 w-5" />} label="Taken" value="Open teamacties" />
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

      {todaySessions.length === 0 ? (
        <EmptyState>Geen toegewezen lessen vandaag.</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {todaySessions.map((session) => {
            const group = groupById.get(session.group_id);
            const rosterSize = getSessionRoster(data, session.id).length;
            const attendanceCount = attendanceBySession.get(session.id)?.length ?? 0;

            return (
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={session.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{group?.name ?? "Lesgroep"}</p>
                    <h2 className="mt-1 text-xl font-bold text-foreground">{formatSessionTime(session.starts_at, session.ends_at)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {attendanceCount}/{rosterSize} geregistreerd
                    </p>
                  </div>
                  <StatusPill tone={session.status === "scheduled" ? "info" : session.status === "completed" ? "success" : "neutral"}>{session.status}</StatusPill>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href={`/instructor/group/${session.group_id}?session=${session.id}`}>
                    Roster <ArrowRight className="h-4 w-4" />
                  </Link>
                  {session.status === "scheduled" ? (
                    <form action={completeSessionAction}>
                      <input name="sessionId" type="hidden" value={session.id} />
                      <input name="next" type="hidden" value="/instructor" />
                      <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold hover:bg-muted" type="submit">
                        Afronden <CheckCircle2 className="h-4 w-4" />
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
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

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "completed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Les afgerond.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function groupBy<Row extends Record<Key, string>, Key extends string>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    grouped.set(row[key], [...(grouped.get(row[key]) ?? []), row]);
  }

  return grouped;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
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

  if (type === "task_assigned") {
    return "taak";
  }

  if (type === "progress_score" || type === "badge_award") {
    return "voortgang";
  }

  return "update";
}
