import { ArrowRight, CalendarDays, ClipboardCheck, Inbox, UsersRound } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import type { AdminOperationsData } from "@/lib/domain/admin-operations";
import type { PrioritizedOperationalSignal } from "@/lib/domain/operational-cockpit-contract";
import { cn } from "@/lib/utils";

export function TenantAdminDashboard({ data, signals, tenantName }: {
  data: AdminOperationsData;
  signals: PrioritizedOperationalSignal[];
  tenantName: string;
}) {
  const today = dayKey(new Date());
  const sessionsToday = data.sessions.filter((session) => dayKey(new Date(session.starts_at)) === today && session.status === "scheduled");
  const todayGroupIds = new Set(sessionsToday.map((session) => session.group_id));
  const learnersToday = new Set(data.groupMemberships.filter((membership) => todayGroupIds.has(membership.group_id) && (membership.status === "active" || membership.status === "trial")).map((membership) => membership.participant_id)).size;
  const attendanceRecorded = new Set(data.attendance.filter((entry) => sessionsToday.some((session) => session.id === entry.session_id)).map((entry) => entry.session_id)).size;
  const actionSignals = signals.filter((signal) => signal.window === "now" || signal.window === "today").slice(0, 5);
  const upcoming = data.sessions
    .filter((session) => session.status === "scheduled" && new Date(session.starts_at) >= new Date())
    .slice(0, 6);
  const groupNames = new Map(data.groups.map((group) => [group.id, group.name]));
  const capacityByGroup = new Map(data.groupCapacity.map((capacity) => [capacity.groupId, capacity]));

  return (
    <div className="admin-dashboard space-y-7">
      <section className="admin-dashboard-hero">
        <div className="min-w-0">
          <p className="admin-dashboard-eyebrow">Dagelijkse cockpit</p>
          <h1>Welkom terug.</h1>
          <p className="admin-dashboard-intro">{formatLongDate()} · {tenantName}. Houd lessen, instroom en opvolging in één rustige werkstroom.</p>
        </div>
        <div className="admin-dashboard-actions" aria-label="Snelle acties">
          <Link className="admin-dashboard-primary-action" href="/admin/agenda"><CalendarDays className="size-4" />Planbord openen</Link>
          <Link className="admin-dashboard-secondary-action" href="/admin/intake"><Inbox className="size-4" />Intake bekijken</Link>
        </div>
      </section>

      <DashboardSection title="Vandaag" subtitle="De operationele stand van zaken voor deze lesdag.">
        <div className="admin-today-grid">
          <TodayMetric icon={CalendarDays} label="Lessen vandaag" value={sessionsToday.length} detail={sessionsToday.length ? "Gepland in het rooster" : "Geen lessen gepland"} />
          <TodayMetric icon={UsersRound} label="Leerlingen verwacht" value={learnersToday} detail={learnersToday ? "Actieve groepsplaatsingen" : "Geen groepsplaatsingen vandaag"} />
          <TodayMetric icon={ClipboardCheck} label="Aanwezigheid" value={sessionsToday.length ? `${attendanceRecorded}/${sessionsToday.length}` : "—"} detail={sessionsToday.length ? "Lessen met registratie" : "Nog niets te registreren"} />
          <TodayMetric icon={Inbox} label="Aandacht vandaag" value={actionSignals.length} detail={actionSignals.length ? "Signalen met opvolging" : "Geen actie-signalen"} emphasis={actionSignals.length > 0} />
        </div>
      </DashboardSection>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <DashboardSection title="Actie nodig" subtitle="Alleen actuele punten die een bewuste opvolging vragen.">
          {actionSignals.length ? <div className="admin-action-list">
            {actionSignals.map((signal) => <ActionRow key={signal.key} signal={signal} />)}
          </div> : <EmptyState text="Er zijn geen actuele signalen die vandaag aandacht vragen." />}
          <Link className="admin-section-link" href="/admin/signalen">Open signalenwerkbak <ArrowRight className="size-4" /></Link>
        </DashboardSection>

        <DashboardSection title="Instroom" subtitle="Open werk in intake en plaatsing.">
          <div className="admin-stack-list">
            <SummaryLink href="/admin/intake" label="Onbehandelde intake" value={data.kpis.receivedIntake} tone={data.kpis.receivedIntake ? "warning" : "success"} />
            <SummaryLink href="/admin/wachtlijst" label="Open wachtlijst" value={data.kpis.openWaitlist} tone={data.kpis.openWaitlist ? "neutral" : "success"} />
            <SummaryLink href="/admin/wachtlijst" label="Lopende plaatsingsaanbiedingen" value={data.kpis.pendingSlotOffers} tone={data.kpis.pendingSlotOffers ? "warning" : "success"} />
            <SummaryLink href="/admin/taken" label="Open taken" value={data.kpis.openTasks} tone={data.kpis.urgentTasks ? "danger" : "neutral"} />
          </div>
        </DashboardSection>
      </div>

      <DashboardSection title="Planning & capaciteit" subtitle="Eerstvolgende lessen, met de huidige groepsbezetting.">
        {upcoming.length ? <div className="admin-planning-list">
          {upcoming.map((session) => {
            const capacity = capacityByGroup.get(session.group_id);
            return <Link className="admin-planning-row" href={`/admin/groepen?group=${session.group_id}`} key={session.id}>
              <time dateTime={session.starts_at}><strong>{formatTime(session.starts_at)}</strong><span>{formatShortDate(session.starts_at)}</span></time>
              <span className="min-w-0"><strong>{groupNames.get(session.group_id) ?? "Groep"}</strong><span>{session.notes || "Geplande les"}</span></span>
              <span className="admin-capacity"><strong>{capacity ? `${capacity.used}/${capacity.capacity}` : "—"}</strong><span>{capacity ? capacity.available > 0 ? `${capacity.available} plaatsen vrij` : "Vol" : "Capaciteit onbekend"}</span></span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>;
          })}
        </div> : <EmptyState text="Er zijn geen aankomende geplande lessen beschikbaar." />}
      </DashboardSection>

      <nav aria-label="Snelle navigatie" className="admin-quick-links">
        {[ ["Leerlingen", "/admin/leerlingen"], ["Groepen", "/admin/groepen"], ["Planning", "/admin/agenda"], ["Intake & wachtlijst", "/admin/intake"] ].map(([label, href]) => <Link href={href} key={href}>{label}<ArrowRight className="size-4" /></Link>)}
      </nav>
    </div>
  );
}

function DashboardSection({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="admin-dashboard-section"><header><h2>{title}</h2><p>{subtitle}</p></header>{children}</section>;
}
function TodayMetric({ icon: Icon, label, value, detail, emphasis = false }: { icon: typeof CalendarDays; label: string; value: string | number; detail: string; emphasis?: boolean }) {
  return <article className={cn("admin-today-metric", emphasis && "is-emphasis")}><span><Icon className="size-4" /></span><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>;
}
function ActionRow({ signal }: { signal: PrioritizedOperationalSignal }) {
  return <Link className="admin-action-row" href={signal.href}><span className={cn("admin-priority-dot", `is-${signal.priority}`)} /><span className="min-w-0 flex-1"><strong>{signal.title}</strong><small>{signal.summary}</small></span><StatusPill tone={signal.priority === "critical" ? "danger" : signal.priority === "high" ? "warning" : "info"}>{signal.window === "now" ? "Nu" : "Vandaag"}</StatusPill><ArrowRight className="size-4 shrink-0 text-muted-foreground" /></Link>;
}
function SummaryLink({ href, label, value, tone }: { href: string; label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" }) {
  return <Link className="admin-summary-link" href={href}><span>{label}</span><StatusPill tone={tone}>{value}</StatusPill><ArrowRight className="size-4" /></Link>;
}
function EmptyState({ text }: { text: string }) { return <div className="admin-dashboard-empty">{text}</div>; }
function dayKey(value: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(value); }
function formatLongDate() { return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(new Date()); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
