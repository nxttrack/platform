import type { ReactNode } from "react";
import { Bell, CalendarDays, FileText, GraduationCap, Repeat2, UserRound, Waves } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { markNotificationReadAction, requestCatchUpLessonAction } from "@/lib/parent-portal/parent-portal-actions";
import type {
  ParentCatchUpRequestRow,
  ParentCertificateRow,
  ParentDocumentRow,
  ParentEnrollmentRow,
  ParentGroupMembershipRow,
  ParentGroupRow,
  ParentNotificationRow,
  ParentParticipantRow,
  ParentPortalData,
  ParentPortalSnapshot,
  ParentProgramRow,
  ParentProgressRow,
  ParentResourceRow,
  ParentSessionRow,
  ParentStageRow,
  ParentSubscriptionPlanRow
} from "@/lib/parent-portal/parent-portal-read-model";

type ParentPageProps = {
  snapshot: ParentPortalSnapshot;
};

type LookupMaps = {
  participants: Map<string, ParentParticipantRow>;
  programs: Map<string, ParentProgramRow>;
  stages: Map<string, ParentStageRow>;
  subscriptionPlans: Map<string, ParentSubscriptionPlanRow>;
  groups: Map<string, ParentGroupRow>;
  resources: Map<string, ParentResourceRow>;
  enrollmentsByParticipant: Map<string, ParentEnrollmentRow[]>;
  membershipsByEnrollment: Map<string, ParentGroupMembershipRow[]>;
  sessionsByGroup: Map<string, ParentSessionRow[]>;
  progressByEnrollment: Map<string, ParentProgressRow[]>;
  certificatesByParticipant: Map<string, ParentCertificateRow[]>;
  documentsByParticipant: Map<string, ParentDocumentRow[]>;
  notificationsByParticipant: Map<string, ParentNotificationRow[]>;
  catchUpsBySession: Map<string, ParentCatchUpRequestRow[]>;
};

type LessonRow = {
  participant: ParentParticipantRow;
  enrollment: ParentEnrollmentRow;
  group: ParentGroupRow;
  session: ParentSessionRow;
  resource: ParentResourceRow | null;
};

export function ParentDashboardPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);
  const lessons = buildLessonRows(snapshot.data, lookups);
  const nextLesson = lessons[0] ?? null;
  const unread = snapshot.data.notifications.filter((notification) => notification.status === "unread").length;

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - Phase 6" title="Dashboard" subtitle="Een data-backed overzicht van kinderen, lessen, notificaties en documenten.">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<UserRound className="h-5 w-5" />} label="Kinderen" value={snapshot.data.participants.length.toString()} detail="gekoppelde profielen" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Lessen" value={lessons.length.toString()} detail="aankomende sessies" />
        <MetricCard icon={<Bell className="h-5 w-5" />} label="Ongelezen" value={unread.toString()} detail="notificaties" />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Documenten" value={snapshot.data.documents.length.toString()} detail="read-only" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionHeader title="Kinderen" count={snapshot.data.participants.length} />
          <ChildCards data={snapshot.data} lookups={lookups} />
        </Card>

        <Card>
          <SectionHeader title="Volgende les" count={nextLesson ? 1 : 0} />
          {nextLesson ? <LessonSummary lesson={nextLesson} lookups={lookups} /> : <EmptyState>Geen aankomende lessen gevonden.</EmptyState>}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <NotificationList notifications={snapshot.data.notifications.slice(0, 5)} title="Laatste notificaties" />
        <DocumentList documents={snapshot.data.documents.slice(0, 5)} lookups={lookups} title="Documenten en diploma's" />
      </div>
    </ParentFrame>
  );
}

export function ParentProfilePage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - kindprofiel" title="Kindprofiel(en)" subtitle="Read-only kindprofielen met programma, stage, groep en abonnement. Billing blijft apart van stage/badje.">
      <Card>
        <SectionHeader title="Kindprofielen" count={snapshot.data.participants.length} />
        <ChildCards data={snapshot.data} lookups={lookups} expanded />
      </Card>
    </ParentFrame>
  );
}

export function ParentLessonsPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);
  const lessons = buildLessonRows(snapshot.data, lookups);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - lessen" title="Mijn lessen" subtitle="Aankomende lessen vanuit group memberships en sessions, inclusief basisaanvraag voor een inhaalles.">
      <Card>
        <SectionHeader title="Mijn lessen" count={lessons.length} />
        <div className="grid gap-4">
          {lessons.length === 0 ? <EmptyState>Geen lessen gevonden voor gekoppelde kinderen.</EmptyState> : null}
          {lessons.map((lesson) => (
            <LessonCard key={`${lesson.enrollment.id}-${lesson.session.id}`} lesson={lesson} lookups={lookups} />
          ))}
        </div>
      </Card>
    </ParentFrame>
  );
}

export function ParentNotificationsPage({ snapshot }: ParentPageProps) {
  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - berichten" title="Notificaties" subtitle="Read status wordt opgeslagen op parent_notifications.read_at.">
      <NotificationList notifications={snapshot.data.notifications} title="Alle notificaties" />
    </ParentFrame>
  );
}

export function ParentDocumentsPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - documenten" title="Documenten" subtitle="Read-only documenten die aan een kind, enrollment of certificate gekoppeld zijn.">
      <DocumentList documents={snapshot.data.documents} lookups={lookups} title="Documenten" />
    </ParentFrame>
  );
}

export function ParentDiplomasPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - diploma's" title="Diploma's" subtitle="Read-only voorbereiding op de digitale diplomakluis. Genereren en delen volgt in Phase 9.">
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <SectionHeader title="Certificates" count={snapshot.data.certificates.length} />
          <div className="grid gap-3">
            {snapshot.data.certificates.length === 0 ? <EmptyState>Nog geen certificaten of diploma's gevonden.</EmptyState> : null}
            {snapshot.data.certificates.map((certificate) => (
              <div key={certificate.id} className="rounded-2xl border border-border bg-muted/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{certificate.title}</p>
                    <p className="text-sm text-muted-foreground">{participantName(lookups, certificate.participant_id)} - {lookups.programs.get(certificate.program_id)?.name ?? "Programma"}</p>
                  </div>
                  <StatusPill tone={certificate.status === "issued" ? "success" : "warning"}>{certificate.status}</StatusPill>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Nummer: {certificate.certificate_number ?? "Nog niet uitgegeven"} - Uitgiftedatum: {certificate.issued_on ? formatDate(certificate.issued_on) : "Nog niet bekend"}</p>
              </div>
            ))}
          </div>
        </Card>

        <DocumentList documents={snapshot.data.documents.filter((document) => ["diploma", "certificate"].includes(document.document_type))} lookups={lookups} title="Diplomadocumenten" />
      </div>
    </ParentFrame>
  );
}

function ParentFrame({ snapshot, kicker, title, subtitle, children }: ParentPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Phase 6</StatusPill>} />
      {snapshot.status === "ready" ? children : <ParentStatusPanel snapshot={snapshot} />}
    </div>
  );
}

function ParentStatusPanel({ snapshot }: ParentPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Ouderportaal niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie, tenantcontext en parent-child-koppelingen nodig.</p>
      {snapshot.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ChildCards({ data, lookups, expanded = false }: { data: ParentPortalData; lookups: LookupMaps; expanded?: boolean }) {
  if (data.participants.length === 0) {
    return <EmptyState>Er zijn nog geen kinderen gekoppeld aan dit ouderaccount.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {data.participants.map((participant) => {
        const enrollments = lookups.enrollmentsByParticipant.get(participant.id) ?? [];
        const primaryEnrollment = enrollments[0] ?? null;
        const stage = primaryEnrollment?.current_stage_id ? lookups.stages.get(primaryEnrollment.current_stage_id) : null;
        const program = primaryEnrollment ? lookups.programs.get(primaryEnrollment.program_id) : null;
        const plan = primaryEnrollment?.subscription_plan_id ? lookups.subscriptionPlans.get(primaryEnrollment.subscription_plan_id) : null;
        const latestProgress = primaryEnrollment ? (lookups.progressByEnrollment.get(primaryEnrollment.id) ?? [])[0] : null;

        return (
          <div key={participant.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{participant.display_name}</p>
                <p className="text-sm text-muted-foreground">{participant.birthdate ? `${ageFromBirthdate(participant.birthdate)} jaar` : "Leeftijd onbekend"}</p>
              </div>
              <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoTile label="Programma" value={program?.name ?? "-"} />
              <InfoTile label="Stage" value={stage?.name ?? "-"} />
              <InfoTile label="Abonnement" value={plan ? `${plan.name} (${formatMoney(plan.price_cents, plan.currency)})` : "-"} />
            </div>
            {expanded ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoTile label="Laatste voortgang" value={latestProgress ? `${latestProgress.status}${latestProgress.score === null ? "" : ` - ${latestProgress.score}%`}` : "Nog geen voortgang"} />
                <InfoTile label="Start deelname" value={primaryEnrollment ? formatDate(primaryEnrollment.started_on) : "-"} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LessonCard({ lesson, lookups }: { lesson: LessonRow; lookups: LookupMaps }) {
  const catchUps = lookups.catchUpsBySession.get(lesson.session.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <LessonSummary lesson={lesson} lookups={lookups} />
      <div className="mt-4 border-t border-border pt-4">
        {catchUps.length > 0 ? (
          <div className="mb-3 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            Inhaalaanvraag: {catchUps[0]?.status ?? "requested"}
          </div>
        ) : (
          <CatchUpForm lesson={lesson} />
        )}
      </div>
    </div>
  );
}

function LessonSummary({ lesson, lookups }: { lesson: LessonRow; lookups: LookupMaps }) {
  const program = lookups.programs.get(lesson.enrollment.program_id);
  const stage = lesson.enrollment.current_stage_id ? lookups.stages.get(lesson.enrollment.current_stage_id) : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-lg font-bold">{lesson.participant.display_name}</p>
        <p className="text-sm text-muted-foreground">{program?.name ?? "Programma"} - {stage?.name ?? "Stage"} - {lesson.group.name}</p>
        <p className="mt-2 text-sm font-semibold">{formatDateTime(lesson.session.starts_at)} - {formatTime(lesson.session.ends_at)}</p>
        <p className="text-xs text-muted-foreground">{lesson.resource?.location_name ?? lesson.resource?.name ?? "Locatie volgt"} </p>
      </div>
      <StatusPill tone={lesson.session.status === "scheduled" ? "success" : lesson.session.status === "cancelled" ? "danger" : "neutral"}>{lesson.session.status}</StatusPill>
    </div>
  );
}

function CatchUpForm({ lesson }: { lesson: LessonRow }) {
  return (
    <details className="rounded-2xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Inhaalles aanvragen</summary>
      <form action={requestCatchUpLessonAction} className="mt-4 grid gap-3">
        <input name="participant_id" type="hidden" value={lesson.participant.id} />
        <input name="enrollment_id" type="hidden" value={lesson.enrollment.id} />
        <input name="session_id" type="hidden" value={lesson.session.id} />
        <fieldset className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {preferredTimes.map((time) => (
            <label key={time.value} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold">
              <input className="h-4 w-4 accent-primary" name="preferred_time_windows" type="checkbox" value={time.value} />
              {time.label}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Reden
          <textarea className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" name="reason" />
        </label>
        <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Aanvraag versturen
        </button>
      </form>
    </details>
  );
}

function NotificationList({ notifications, title }: { notifications: ParentNotificationRow[]; title: string }) {
  return (
    <Card>
      <SectionHeader title={title} count={notifications.length} />
      <div className="grid gap-3">
        {notifications.length === 0 ? <EmptyState>Geen notificaties gevonden.</EmptyState> : null}
        {notifications.map((notification) => (
          <div key={notification.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{notification.title}</p>
                {notification.body ? <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</p>
              </div>
              <StatusPill tone={notification.status === "unread" ? "warning" : "neutral"}>{notification.status}</StatusPill>
            </div>
            {notification.status === "unread" ? (
              <form action={markNotificationReadAction} className="mt-3">
                <input name="notification_id" type="hidden" value={notification.id} />
                <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" type="submit">
                  Markeer gelezen
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DocumentList({ documents, lookups, title }: { documents: ParentDocumentRow[]; lookups: LookupMaps; title: string }) {
  return (
    <Card>
      <SectionHeader title={title} count={documents.length} />
      <div className="grid gap-3">
        {documents.length === 0 ? <EmptyState>Geen documenten gevonden.</EmptyState> : null}
        {documents.map((document) => (
          <div key={document.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{document.title}</p>
                <p className="text-sm text-muted-foreground">{participantName(lookups, document.participant_id)} - {document.document_type}</p>
                <p className="mt-2 text-xs text-muted-foreground">Beschikbaar: {document.available_on ? formatDate(document.available_on) : formatDate(document.created_at)}</p>
              </div>
              <StatusPill tone={document.status === "available" ? "success" : "neutral"}>{document.status}</StatusPill>
            </div>
            <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
              {document.file_path ? `Bestand: ${document.file_path}` : "Bestand/download wordt in een latere fase gekoppeld."}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{children}</div>;
}

function buildLookups(data: ParentPortalData): LookupMaps {
  return {
    participants: byId(data.participants),
    programs: byId(data.programs),
    stages: byId(data.stages),
    subscriptionPlans: byId(data.subscriptionPlans),
    groups: byId(data.groups),
    resources: byId(data.resources),
    enrollmentsByParticipant: groupBy(data.enrollments, (enrollment) => enrollment.participant_id),
    membershipsByEnrollment: groupBy(data.groupMemberships, (membership) => membership.enrollment_id),
    sessionsByGroup: groupBy(data.sessions, (session) => session.group_id),
    progressByEnrollment: groupBy(data.progress, (progress) => progress.enrollment_id),
    certificatesByParticipant: groupBy(data.certificates, (certificate) => certificate.participant_id),
    documentsByParticipant: groupBy(data.documents, (document) => document.participant_id),
    notificationsByParticipant: groupBy(data.notifications.filter((notification) => notification.participant_id), (notification) => notification.participant_id ?? ""),
    catchUpsBySession: groupBy(data.catchUpRequests, (request) => request.missed_session_id)
  };
}

function buildLessonRows(data: ParentPortalData, lookups: LookupMaps): LessonRow[] {
  const lessons: LessonRow[] = [];

  for (const enrollment of data.enrollments) {
    const participant = lookups.participants.get(enrollment.participant_id);

    if (!participant) {
      continue;
    }

    for (const membership of lookups.membershipsByEnrollment.get(enrollment.id) ?? []) {
      if (!["planned", "active"].includes(membership.status)) {
        continue;
      }

      const group = lookups.groups.get(membership.group_id);

      if (!group) {
        continue;
      }

      for (const session of lookups.sessionsByGroup.get(group.id) ?? []) {
        lessons.push({
          participant,
          enrollment,
          group,
          session,
          resource: session.resource_id ? (lookups.resources.get(session.resource_id) ?? null) : group.resource_id ? (lookups.resources.get(group.resource_id) ?? null) : null
        });
      }
    }
  }

  return lessons.sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<Row>(rows: Row[], getKey: (row: Row) => string) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function participantName(lookups: LookupMaps, participantId: string) {
  return lookups.participants.get(participantId)?.display_name ?? "Onbekend kind";
}

function ageFromBirthdate(birthdate: string) {
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return Math.max(0, age);
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { timeStyle: "short" }).format(new Date(value));
}

const preferredTimes = [
  { label: "Ochtend", value: "morning" },
  { label: "Middag", value: "afternoon" },
  { label: "Avond", value: "evening" },
  { label: "Weekend", value: "weekend" }
];
