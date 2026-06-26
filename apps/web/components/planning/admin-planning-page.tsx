import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CalendarDays, ClipboardCheck, RotateCcw, UsersRound } from "lucide-react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { buildCapacitySnapshots, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { createConflictCheckedSessionAction, generateGroupSessionsAction, refreshCatchUpCandidatesAction, updateCatchUpRequestAction } from "@/lib/planning/admin-planning-actions";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  EnrollmentRow,
  GroupMembershipRow,
  GroupRow,
  InstructorRow,
  LessonCatchUpRequestRow,
  MakeupCandidateSessionRow,
  MakeupCreditRow,
  LessonMakeupEventRow,
  ParticipantRow,
  ResourceRow,
  SessionAttendanceRow,
  SessionRow
} from "@/lib/domain/admin-domain-read-model";

type PlanningProps = {
  snapshot: AdminDomainSnapshot;
};

type LookupMaps = {
  enrollments: Map<string, EnrollmentRow>;
  groups: Map<string, GroupRow>;
  instructors: Map<string, InstructorRow>;
  membershipsByGroup: Map<string, GroupMembershipRow[]>;
  participants: Map<string, ParticipantRow>;
  resources: Map<string, ResourceRow>;
  sessions: Map<string, SessionRow>;
  sessionsByGroup: Map<string, SessionRow[]>;
  attendanceBySession: Map<string, SessionAttendanceRow[]>;
  makeupCredits: Map<string, MakeupCreditRow>;
  makeupCandidatesByCredit: Map<string, MakeupCandidateSessionRow[]>;
  makeupEventsByRequest: Map<string, LessonMakeupEventRow[]>;
};

type GroupPlanningRow = {
  group: GroupRow;
  resource: ResourceRow | null;
  instructor: InstructorRow | null;
  memberships: GroupMembershipRow[];
  sessions: SessionRow[];
  capacity: CapacitySnapshot;
  utilization: number;
  freeSpots: number;
};

type ConflictRow = {
  id: string;
  title: string;
  detail: string;
  tone: "warning" | "danger";
};

export function AdminPlanningOperationsPage({ snapshot }: PlanningProps) {
  if (snapshot.status !== "ready") {
    return <PlanningStatusPanel snapshot={snapshot} />;
  }

  const lookups = buildLookups(snapshot.data);
  const groupRows = buildGroupRows(snapshot.data, lookups);
  const recurringConflicts = buildRecurringConflicts(groupRows);
  const sessionConflicts = buildSessionConflicts(snapshot.data, lookups);
  const attendanceStats = buildAttendanceStats(snapshot.data, lookups);
  const openCatchUps = snapshot.data.catchUpRequests.filter((request) => ["requested", "approved"].includes(request.status));
  const rosterTotal = groupRows.reduce((sum, row) => sum + row.memberships.length * Math.max(1, row.sessions.length), 0);
  const recordedAttendance = snapshot.data.attendance.length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Sprint 3</StatusPill>}
        kicker="Backoffice - planning"
        subtitle="Dagelijkse lesoperatie met groepsplanning, sessiegeneratie, conflictchecks, aanwezigheid en inhaallessen."
        title="Planning en lessen"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<UsersRound className="h-5 w-5" />} label="Groepen" value={snapshot.data.groups.length.toString()} detail="met vaste planning" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Sessies" value={snapshot.data.sessions.length.toString()} detail="aangemaakt" />
        <MetricCard icon={<ClipboardCheck className="h-5 w-5" />} label="Aanwezigheid" value={`${recordedAttendance}/${rosterTotal}`} detail="registraties versus rooster" />
        <MetricCard icon={<RotateCcw className="h-5 w-5" />} label="Inhaallessen" value={openCatchUps.length.toString()} detail="open of goedgekeurd" />
      </div>

      <AdminTabs
        tabs={[
          {
            id: "planning",
            label: "Groepsplanning",
            count: groupRows.length,
            children: (
              <Card>
                <SectionHeader title="Groepsplanning" count={groupRows.length} />
                <div className="grid gap-4">
                  {weekdayOptions.map((day) => {
                    const rows = groupRows.filter((row) => row.group.weekday === day.value);

                    return rows.length > 0 ? (
                      <div key={day.value} className="grid gap-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold">{day.label}</h2>
                          <StatusPill tone="neutral">{rows.length}</StatusPill>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                          {rows.map((row) => (
                            <GroupPlanningCard key={row.group.id} row={row} />
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })}
                  {groupRows.length === 0 ? <EmptyState>Geen groepen gevonden om lessen voor te plannen.</EmptyState> : null}
                </div>
              </Card>
            )
          },
          {
            id: "les",
            label: "Losse les",
            count: snapshot.data.groups.length,
            children: (
              <Card>
                <SectionHeader title="Losse les aanmaken" count={snapshot.data.groups.length} />
                <SessionCreateForm data={snapshot.data} />
              </Card>
            )
          },
          {
            id: "conflicten",
            label: "Conflicten",
            count: recurringConflicts.length + sessionConflicts.length,
            children: (
              <Card>
                <SectionHeader title="Conflictchecks" count={recurringConflicts.length + sessionConflicts.length} />
                <ConflictList conflicts={[...recurringConflicts, ...sessionConflicts]} />
              </Card>
            )
          },
          {
            id: "aanwezigheid",
            label: "Aanwezigheid",
            count: attendanceStats.length,
            children: (
              <Card>
                <SectionHeader title="Aanwezigheidsrapportage" count={attendanceStats.length} />
                <div className="grid gap-3">
                  {attendanceStats.length === 0 ? <EmptyState>Er zijn nog geen sessies om aanwezigheid op te rapporteren.</EmptyState> : null}
                  {attendanceStats.slice(0, 12).map((row) => (
                    <AttendanceReportCard key={row.session.id} row={row} />
                  ))}
                </div>
              </Card>
            )
          },
          {
            id: "inhaallessen",
            label: "Inhaallessen",
            count: snapshot.data.catchUpRequests.length,
            children: (
              <Card>
                <SectionHeader title="Inhaalles lifecycle" count={snapshot.data.catchUpRequests.length} />
                <div className="grid gap-3">
                  {snapshot.data.catchUpRequests.length === 0 ? <EmptyState>Geen inhaallesaanvragen gevonden.</EmptyState> : null}
                  {snapshot.data.catchUpRequests.map((request) => (
                    <CatchUpRequestCard key={request.id} lookups={lookups} request={request} />
                  ))}
                </div>
              </Card>
            )
          }
        ]}
      />
    </div>
  );
}

function GroupPlanningCard({ row }: { row: GroupPlanningRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{row.group.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatTime(row.group.starts_at)}-{formatTime(row.group.ends_at)} - {row.resource?.name ?? "Geen locatie"} - {row.instructor?.display_name ?? "Geen instructeur"}
          </p>
        </div>
        <StatusPill tone={capacityTone(row.capacity)}>{capacityText(row.capacity)}</StatusPill>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, row.utilization))}%` }} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <InfoTile label="Sessies" value={row.sessions.length.toString()} />
        <InfoTile label="Open" value={row.capacity.openSpots.toString()} />
        <InfoTile label="Hold" value={row.capacity.heldSpots.toString()} />
        <InfoTile label="Status" value={row.group.status} />
      </div>
      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
        <p>
          {row.capacity.activeMemberships} actief, {row.capacity.futureStarts} toekomstige start, {row.capacity.reservedSpots + row.capacity.trialSpots + row.capacity.makeupSpots} gereserveerd.
        </p>
        {row.capacity.blockers.length > 0 ? <p className="font-semibold text-red-700">{row.capacity.blockers[0]?.label}: {row.capacity.blockers[0]?.detail}</p> : null}
      </div>
      <form action={generateGroupSessionsAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_120px_auto]">
        <input name="group_id" type="hidden" value={row.group.id} />
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Vanaf datum
          <input className={fieldClassName} defaultValue={todayInputValue()} name="from_date" type="date" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Weken
          <input className={fieldClassName} defaultValue="4" max="16" min="1" name="weeks" type="number" />
        </label>
        <button className="self-end rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Lessen genereren
        </button>
      </form>
    </div>
  );
}

function SessionCreateForm({ data }: { data: AdminDomainData }) {
  return (
    <form action={createConflictCheckedSessionAction} className="grid gap-3">
      <SelectField label="Groep" name="group_id" options={data.groups.map((group) => ({ label: group.name, value: group.id }))} required />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Start
          <input className={fieldClassName} name="starts_at" type="datetime-local" required />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Einde
          <input className={fieldClassName} name="ends_at" type="datetime-local" required />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField label="Locatie override" name="resource_id" options={data.resources.map((resource) => ({ label: resource.name, value: resource.id }))} />
        <SelectField label="Instructeur override" name="instructor_id" options={data.instructors.map((instructor) => ({ label: instructor.display_name, value: instructor.id }))} />
        <SelectField
          defaultValue="scheduled"
          label="Status"
          name="status"
          options={[
            { label: "Gepland", value: "scheduled" },
            { label: "Afgerond", value: "completed" },
            { label: "Geannuleerd", value: "cancelled" }
          ]}
        />
      </div>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Les aanmaken met conflictcheck
      </button>
    </form>
  );
}

function ConflictList({ conflicts }: { conflicts: ConflictRow[] }) {
  if (conflicts.length === 0) {
    return <EmptyState>Geen resource- of instructeurconflicten gevonden.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {conflicts.map((conflict) => (
        <div key={conflict.id} className={`rounded-2xl border p-4 ${conflict.tone === "danger" ? "border-red-200 bg-red-50/80" : "border-amber-200 bg-amber-50/80"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{conflict.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{conflict.detail}</p>
              <p className="mt-2 text-xs font-semibold text-foreground">Actie: verplaats een les, resource of instructeur voordat je nieuwe sessies genereert.</p>
            </div>
            <StatusPill tone={conflict.tone}>check</StatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}

function AttendanceReportCard({ row }: { row: ReturnType<typeof buildAttendanceStats>[number] }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{row.group?.name ?? "Onbekende groep"}</p>
          <p className="text-sm text-muted-foreground">{formatDateTime(row.session.starts_at)}</p>
        </div>
        <StatusPill tone={row.open === 0 ? "success" : "warning"}>{row.recorded}/{row.roster}</StatusPill>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <InfoTile label="Aanwezig" value={row.present.toString()} />
        <InfoTile label="Afwezig" value={row.absent.toString()} />
        <InfoTile label="Te laat" value={row.late.toString()} />
        <InfoTile label="Afbericht" value={row.excused.toString()} />
        <InfoTile label="Open" value={row.open.toString()} />
      </div>
    </div>
  );
}

function CatchUpRequestCard({ lookups, request }: { lookups: LookupMaps; request: LessonCatchUpRequestRow }) {
  const participant = lookups.participants.get(request.participant_id);
  const missedSession = request.missed_session_id ? [...lookups.sessionsByGroup.values()].flat().find((session) => session.id === request.missed_session_id) : null;
  const credit = request.makeup_credit_id ? lookups.makeupCredits.get(request.makeup_credit_id) : null;
  const candidates = request.makeup_credit_id ? (lookups.makeupCandidatesByCredit.get(request.makeup_credit_id) ?? []) : [];
  const targetSession = request.target_session_id ? lookups.sessions.get(request.target_session_id) : null;
  const events = lookups.makeupEventsByRequest.get(request.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{participant?.display_name ?? "Leerling"}</p>
          <p className="text-sm text-muted-foreground">
            Aangevraagd {formatDateTime(request.requested_at)}
            {missedSession ? ` - gemiste les ${formatDateTime(missedSession.starts_at)}` : ""}
          </p>
          {request.reason ? <p className="mt-2 text-sm text-muted-foreground">{request.reason}</p> : null}
        </div>
        <StatusPill tone={request.status === "approved" || request.status === "used" ? "success" : request.status === "rejected" ? "danger" : "warning"}>{request.status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <InfoTile label="Credit" value={credit ? `${credit.credit_code} - ${credit.status}` : "Nog geen credit"} />
        <InfoTile label="Geldig tot" value={credit ? formatDateTime(credit.expires_at) : "-"} />
        <InfoTile label="Bron" value={credit?.granted_by ?? request.approval_mode} />
        <InfoTile label="Doelmoment" value={targetSession ? formatDateTime(targetSession.starts_at) : "Nog te kiezen"} />
      </div>

      {candidates.length > 0 ? (
        <div className="mt-4 grid gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Kandidaatlessen</p>
          {candidates.slice(0, 3).map((candidate) => {
            const session = lookups.sessions.get(candidate.session_id);
            const group = lookups.groups.get(candidate.group_id);
            const hasBlocker = candidate.blockers.length > 0;

            return (
              <div key={candidate.id} className={`rounded-2xl border p-3 ${hasBlocker ? "border-amber-200 bg-amber-50/80" : "border-border bg-card"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{group?.name ?? "Groep"} - {session ? formatDateTime(session.starts_at) : "Moment"}</p>
                    <p className="text-xs text-muted-foreground">{candidate.reasons[0]?.detail ?? "Match op programma, niveau en capaciteit."}</p>
                    {hasBlocker ? <p className="mt-1 text-xs font-semibold text-amber-800">{candidate.blockers[0]?.label}: {candidate.blockers[0]?.detail}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={hasBlocker ? "warning" : "success"}>{candidate.score}/100</StatusPill>
                    <StatusPill tone="neutral">{candidate.status}</StatusPill>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-3 text-sm text-muted-foreground">
          Nog geen kandidaatlessen berekend.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={refreshCatchUpCandidatesAction}>
          <input name="id" type="hidden" value={request.id} />
          <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
            Kandidaten verversen
          </button>
        </form>
      </div>

      <form action={updateCatchUpRequestAction} className="mt-4 grid gap-3 md:grid-cols-[160px_minmax(180px,1fr)_minmax(180px,1fr)_auto]">
        <input name="id" type="hidden" value={request.id} />
        <select className={fieldClassName} defaultValue={request.status} name="status">
          <option value="requested">Aangevraagd</option>
          <option value="approved">Goedgekeurd</option>
          <option value="rejected">Afgewezen</option>
          <option value="cancelled">Geannuleerd</option>
          <option value="used">Gebruikt</option>
        </select>
        <select className={fieldClassName} defaultValue={request.candidate_session_id ?? ""} name="candidate_session_id">
          <option value="">Geen kandidaat gekozen</option>
          {candidates.map((candidate) => {
            const session = lookups.sessions.get(candidate.session_id);
            const group = lookups.groups.get(candidate.group_id);

            return (
              <option key={candidate.id} value={candidate.id}>
                {candidate.score}/100 - {group?.name ?? "Groep"} - {session ? formatDateTime(session.starts_at) : "moment"}
              </option>
            );
          })}
        </select>
        <input className={fieldClassName} name="note" placeholder="Bericht / override reden" required={request.status === "rejected" || request.status === "cancelled"} />
        <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Status opslaan
        </button>
      </form>
      {events.length > 0 ? (
        <div className="mt-4 grid gap-2 text-xs text-muted-foreground">
          {events.slice(0, 3).map((event) => (
            <p key={event.id}>{formatDateTime(event.created_at)} - {event.summary}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlanningStatusPanel({ snapshot }: PlanningProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Planning niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze planningpagina heeft Supabase-configuratie en een actieve tenant nodig.</p>
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

function buildLookups(data: AdminDomainData): LookupMaps {
  return {
    enrollments: byId(data.enrollments),
    groups: byId(data.groups),
    instructors: byId(data.instructors),
    membershipsByGroup: groupBy(data.groupMemberships.filter((membership) => ["planned", "active"].includes(membership.status)), (membership) => membership.group_id),
    participants: byId(data.participants),
    resources: byId(data.resources),
    sessions: byId(data.sessions),
    sessionsByGroup: groupBy(data.sessions, (session) => session.group_id),
    attendanceBySession: groupBy(data.attendance, (attendance) => attendance.session_id),
    makeupCredits: byId(data.makeupCredits),
    makeupCandidatesByCredit: groupBy(data.makeupCandidates, (candidate) => candidate.makeup_credit_id),
    makeupEventsByRequest: groupBy(
      data.makeupEvents.filter((event): event is LessonMakeupEventRow & { catch_up_request_id: string } => Boolean(event.catch_up_request_id)),
      (event) => event.catch_up_request_id
    )
  };
}

function buildGroupRows(data: AdminDomainData, lookups: LookupMaps): GroupPlanningRow[] {
  const capacities = new Map(
    buildCapacitySnapshots({
      groups: data.groups,
      resources: data.resources,
      memberships: data.groupMemberships,
      holds: data.capacityHolds
    }).map((capacity) => [capacity.groupId, capacity])
  );

  return data.groups
    .map((group) => {
      const memberships = lookups.membershipsByGroup.get(group.id) ?? [];
      const capacity = capacities.get(group.id) ?? buildCapacitySnapshots({ groups: [group], resources: data.resources, memberships, holds: [] })[0];

      return {
        group,
        resource: group.resource_id ? (lookups.resources.get(group.resource_id) ?? null) : null,
        instructor: group.instructor_id ? (lookups.instructors.get(group.instructor_id) ?? null) : null,
        memberships,
        sessions: lookups.sessionsByGroup.get(group.id) ?? [],
        capacity,
        utilization: capacity.capacityLimit > 0 ? (capacity.usedSpots / capacity.capacityLimit) * 100 : 0,
        freeSpots: capacity.openSpots
      };
    })
    .sort((a, b) => a.group.weekday - b.group.weekday || a.group.starts_at.localeCompare(b.group.starts_at));
}

function buildRecurringConflicts(rows: GroupPlanningRow[]): ConflictRow[] {
  const conflicts: ConflictRow[] = [];

  for (const row of rows) {
    for (const other of rows) {
      if (row.group.id >= other.group.id || row.group.weekday !== other.group.weekday || !overlaps(row.group.starts_at, row.group.ends_at, other.group.starts_at, other.group.ends_at)) {
        continue;
      }

      if (row.group.resource_id && row.group.resource_id === other.group.resource_id) {
        conflicts.push({
          id: `resource-${row.group.id}-${other.group.id}`,
          title: "Resourceconflict in vaste groepsplanning",
          detail: `${row.group.name} en ${other.group.name} gebruiken ${row.resource?.name ?? "dezelfde locatie"} op hetzelfde moment.`,
          tone: "danger"
        });
      }

      if (row.group.instructor_id && row.group.instructor_id === other.group.instructor_id) {
        conflicts.push({
          id: `instructor-${row.group.id}-${other.group.id}`,
          title: "Instructeurconflict in vaste groepsplanning",
          detail: `${row.group.name} en ${other.group.name} hebben ${row.instructor?.display_name ?? "dezelfde instructeur"} op hetzelfde moment.`,
          tone: "warning"
        });
      }
    }
  }

  return conflicts;
}

function buildSessionConflicts(data: AdminDomainData, lookups: LookupMaps): ConflictRow[] {
  const conflicts: ConflictRow[] = [];

  for (const session of data.sessions) {
    for (const other of data.sessions) {
      if (session.id >= other.id || !overlaps(session.starts_at, session.ends_at, other.starts_at, other.ends_at)) {
        continue;
      }

      const group = lookups.groups.get(session.group_id);
      const otherGroup = lookups.groups.get(other.group_id);

      if (session.resource_id && session.resource_id === other.resource_id) {
        conflicts.push({
          id: `session-resource-${session.id}-${other.id}`,
          title: "Resourceconflict in lessen",
          detail: `${group?.name ?? "Les"} en ${otherGroup?.name ?? "les"} overlappen op ${lookups.resources.get(session.resource_id)?.name ?? "dezelfde locatie"}.`,
          tone: "danger"
        });
      }

      if (session.instructor_id && session.instructor_id === other.instructor_id) {
        conflicts.push({
          id: `session-instructor-${session.id}-${other.id}`,
          title: "Instructeurconflict in lessen",
          detail: `${group?.name ?? "Les"} en ${otherGroup?.name ?? "les"} overlappen met ${lookups.instructors.get(session.instructor_id)?.display_name ?? "dezelfde instructeur"}.`,
          tone: "warning"
        });
      }
    }
  }

  return conflicts;
}

function buildAttendanceStats(data: AdminDomainData, lookups: LookupMaps) {
  return data.sessions.slice(0, 24).map((session) => {
    const group = lookups.groups.get(session.group_id);
    const roster = group ? (lookups.membershipsByGroup.get(group.id) ?? []).length : 0;
    const attendance = lookups.attendanceBySession.get(session.id) ?? [];

    return {
      session,
      group,
      roster,
      recorded: attendance.length,
      present: attendance.filter((row) => row.status === "present").length,
      absent: attendance.filter((row) => row.status === "absent").length,
      late: attendance.filter((row) => row.status === "late").length,
      excused: attendance.filter((row) => row.status === "excused").length,
      open: Math.max(0, roster - attendance.length)
    };
  });
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

function capacityText(capacity: CapacitySnapshot) {
  if (capacity.status === "blocked") {
    return "Geblokkeerd";
  }

  if (capacity.blockedSpots > 0) {
    return `${capacity.blockedSpots} overboekt`;
  }

  return `${capacity.openSpots}/${capacity.capacityLimit} vrij`;
}

function capacityTone(capacity: CapacitySnapshot): "success" | "warning" | "danger" | "info" | "neutral" {
  if (capacity.status === "blocked" || capacity.blockers.some((blocker) => blocker.severity === "blocking")) {
    return "danger";
  }

  if (capacity.status === "overbooked" || capacity.status === "full") {
    return "warning";
  }

  if (capacity.status === "nearly_full") {
    return "info";
  }

  return "success";
}

function SelectField({ defaultValue, label, name, options, required }: { defaultValue?: string; label: string; name: string; options: { label: string; value: string }[]; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
        <option value="">{required ? "Selecteer" : "Geen override"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</div>;
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

function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && endA > startB;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const weekdayOptions = [
  { label: "Maandag", value: 1 },
  { label: "Dinsdag", value: 2 },
  { label: "Woensdag", value: 3 },
  { label: "Donderdag", value: 4 },
  { label: "Vrijdag", value: 5 },
  { label: "Zaterdag", value: 6 },
  { label: "Zondag", value: 7 }
];
