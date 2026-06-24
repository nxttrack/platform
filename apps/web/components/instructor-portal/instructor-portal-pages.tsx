import type { ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, MessageSquareText, UsersRound } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  awardBadgeAction,
  createProgressUpdateAction,
  createStageModuleProgressAction,
  createStudentNoteAction,
  proposeStageTransitionAction,
  recordAttendanceAction
} from "@/lib/instructor-portal/instructor-portal-actions";
import type {
  InstructorAttendanceRow,
  InstructorBadgeAwardRow,
  InstructorBadgeRow,
  InstructorEnrollmentRow,
  InstructorGroupMembershipRow,
  InstructorGroupRow,
  InstructorRow,
  InstructorParticipantRow,
  InstructorPortalData,
  InstructorPortalSnapshot,
  InstructorProgramRow,
  InstructorProgressRow,
  InstructorResourceRow,
  InstructorSessionRow,
  InstructorStageModuleProgressRow,
  InstructorStageModuleRow,
  InstructorStageTransitionProposalRow,
  InstructorStageRow,
  InstructorStudentNoteRow
} from "@/lib/instructor-portal/instructor-portal-read-model";

type InstructorPageProps = {
  snapshot: InstructorPortalSnapshot;
};

type LookupMaps = {
  instructors: Map<string, InstructorRow>;
  programs: Map<string, InstructorProgramRow>;
  stages: Map<string, InstructorStageRow>;
  stageModules: Map<string, InstructorStageModuleRow>;
  stageModulesByStage: Map<string, InstructorStageModuleRow[]>;
  resources: Map<string, InstructorResourceRow>;
  groups: Map<string, InstructorGroupRow>;
  participants: Map<string, InstructorParticipantRow>;
  enrollments: Map<string, InstructorEnrollmentRow>;
  sessionsByGroup: Map<string, InstructorSessionRow[]>;
  membershipsByGroup: Map<string, InstructorGroupMembershipRow[]>;
  membershipsByEnrollment: Map<string, InstructorGroupMembershipRow[]>;
  progressByEnrollment: Map<string, InstructorProgressRow[]>;
  moduleProgressByEnrollment: Map<string, InstructorStageModuleProgressRow[]>;
  badges: Map<string, InstructorBadgeRow>;
  badgeAwardsByParticipant: Map<string, InstructorBadgeAwardRow[]>;
  transitionProposalsByEnrollment: Map<string, InstructorStageTransitionProposalRow[]>;
  attendanceBySessionEnrollment: Map<string, InstructorAttendanceRow>;
  notesByParticipant: Map<string, InstructorStudentNoteRow[]>;
};

type SessionRosterRow = {
  session: InstructorSessionRow;
  group: InstructorGroupRow;
  membership: InstructorGroupMembershipRow;
  enrollment: InstructorEnrollmentRow;
  participant: InstructorParticipantRow;
  attendance: InstructorAttendanceRow | null;
  progress: InstructorProgressRow[];
  resource: InstructorResourceRow | null;
};

type StudentRow = {
  participant: InstructorParticipantRow;
  enrollments: InstructorEnrollmentRow[];
  memberships: InstructorGroupMembershipRow[];
  progress: InstructorProgressRow[];
  moduleProgress: InstructorStageModuleProgressRow[];
  badgeAwards: InstructorBadgeAwardRow[];
  transitionProposals: InstructorStageTransitionProposalRow[];
  notes: InstructorStudentNoteRow[];
};

export function InstructorDashboardPage({ snapshot }: InstructorPageProps) {
  const lookups = buildLookups(snapshot.data);
  const rosterRows = buildSessionRosterRows(snapshot.data, lookups);
  const upcomingSessions = snapshot.data.sessions.slice(0, 4);
  const students = buildStudentRows(snapshot.data, lookups);
  const recorded = rosterRows.filter((row) => row.attendance).length;

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - Phase 7"
      title="Vandaag"
      subtitle="Data-backed instructeursoverzicht met agenda, groepen, aanwezigheid, voortgang en notities."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Sessies" value={snapshot.data.sessions.length.toString()} detail="in de komende planning" />
        <MetricCard icon={<UsersRound className="h-5 w-5" />} label="Leerlingen" value={students.length.toString()} detail="in toegewezen groepen" />
        <MetricCard icon={<ClipboardCheck className="h-5 w-5" />} label="Aanwezigheid" value={`${recorded}/${rosterRows.length}`} detail="vastgelegd" />
        <MetricCard icon={<MessageSquareText className="h-5 w-5" />} label="Badges" value={snapshot.data.badgeAwards.length.toString()} detail="toegekend" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionHeader title="Aankomende sessies" count={upcomingSessions.length} />
          <div className="grid gap-3">
            {upcomingSessions.length === 0 ? <EmptyState>Geen sessies gevonden voor deze instructeur.</EmptyState> : null}
            {upcomingSessions.map((session) => {
              const group = lookups.groups.get(session.group_id);

              return group ? <SessionSummary key={session.id} session={session} group={group} lookups={lookups} /> : null;
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Aandacht vandaag" count={rosterRows.length} />
          <div className="grid gap-3">
            {rosterRows.slice(0, 5).map((row) => (
              <RosterMiniRow key={`${row.session.id}-${row.enrollment.id}`} row={row} />
            ))}
            {rosterRows.length === 0 ? <EmptyState>Geen rosters beschikbaar.</EmptyState> : null}
          </div>
        </Card>
      </div>
    </InstructorFrame>
  );
}

export function InstructorAgendaPage({ snapshot }: InstructorPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - agenda"
      title="Agenda"
      subtitle="Sessies vanuit groups/sessions met roster en attendance-flow per leerling."
    >
      <div className="grid gap-4">
        {snapshot.data.sessions.length === 0 ? <EmptyState>Geen agenda-items gevonden.</EmptyState> : null}
        {snapshot.data.sessions.map((session) => {
          const group = lookups.groups.get(session.group_id);
          const rows = buildSessionRosterRows(snapshot.data, lookups).filter((row) => row.session.id === session.id);

          return group ? <SessionAttendanceCard key={session.id} session={session} group={group} rows={rows} lookups={lookups} /> : null;
        })}
      </div>
    </InstructorFrame>
  );
}

export function InstructorGroupsPage({ snapshot }: InstructorPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - groepen"
      title="Mijn groepen"
      subtitle="Groepslijsten vanuit group memberships met capaciteit, rooster en voortgangssignalen."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {snapshot.data.groups.length === 0 ? <EmptyState>Geen groepen gevonden.</EmptyState> : null}
        {snapshot.data.groups.map((group) => {
          const memberships = lookups.membershipsByGroup.get(group.id) ?? [];
          const sessions = lookups.sessionsByGroup.get(group.id) ?? [];
          const stage = lookups.stages.get(group.stage_id);
          const program = lookups.programs.get(group.program_id);
          const instructor = group.instructor_id ? lookups.instructors.get(group.instructor_id) : null;

          return (
            <Card key={group.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold">{group.name}</p>
                  <p className="text-sm text-muted-foreground">{program?.name ?? "Programma"} - {stage?.name ?? "Stage"}</p>
                </div>
                <StatusPill tone={group.status === "active" ? "success" : "neutral"}>{group.status}</StatusPill>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <InfoTile label="Rooster" value={`${weekdayName(group.weekday)} ${formatTime(group.starts_at)}`} />
                <InfoTile label="Roster" value={`${memberships.length}/${group.capacity}`} />
                <InfoTile label="Instructor" value={instructor?.display_name ?? "Niet gekoppeld"} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" href={`/instructor/group/${group.id}`}>
                  Groepslijst openen
                </Link>
                <StatusPill tone="info">{sessions.length} sessies</StatusPill>
              </div>
            </Card>
          );
        })}
      </div>
    </InstructorFrame>
  );
}

export function InstructorGroupDetailPage({ snapshot, groupId }: InstructorPageProps & { groupId: string }) {
  const lookups = buildLookups(snapshot.data);
  const group = lookups.groups.get(groupId);
  const sessions = group ? (lookups.sessionsByGroup.get(group.id) ?? []) : [];
  const rosterRows = group ? buildSessionRosterRows(snapshot.data, lookups).filter((row) => row.group.id === group.id) : [];

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - groepslijst"
      title={group?.name ?? "Groep niet gevonden"}
      subtitle="Roster, sessies en aanwezigheid voor deze groep."
    >
      {!group ? (
        <EmptyState>Deze groep is niet beschikbaar binnen de actieve tenant of instructeurcontext.</EmptyState>
      ) : (
        <div className="grid gap-4">
          <Card>
            <div className="grid gap-3 md:grid-cols-4">
              <InfoTile label="Programma" value={lookups.programs.get(group.program_id)?.name ?? "-"} />
              <InfoTile label="Stage" value={lookups.stages.get(group.stage_id)?.name ?? "-"} />
              <InfoTile label="Capaciteit" value={`${(lookups.membershipsByGroup.get(group.id) ?? []).length}/${group.capacity}`} />
              <InfoTile label="Moment" value={`${weekdayName(group.weekday)} ${formatTime(group.starts_at)}`} />
            </div>
          </Card>

          <div className="grid gap-4">
            {sessions.map((session) => (
              <SessionAttendanceCard
                key={session.id}
                session={session}
                group={group}
                rows={rosterRows.filter((row) => row.session.id === session.id)}
                lookups={lookups}
              />
            ))}
            {sessions.length === 0 ? <EmptyState>Geen sessies gevonden voor deze groep.</EmptyState> : null}
          </div>
        </div>
      )}
    </InstructorFrame>
  );
}

export function InstructorStudentsPage({ snapshot }: InstructorPageProps) {
  const lookups = buildLookups(snapshot.data);
  const students = buildStudentRows(snapshot.data, lookups);

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - leerlingen"
      title="Leerlingen"
      subtitle="Leerlingoverzicht met huidige stage, laatste voortgang, aanwezigheid en notities."
    >
      <Card>
        <SectionHeader title="Leerlingen" count={students.length} />
        <div className="grid gap-3">
          {students.length === 0 ? <EmptyState>Geen leerlingen gevonden.</EmptyState> : null}
          {students.map((student) => (
            <StudentListRow key={student.participant.id} student={student} lookups={lookups} />
          ))}
        </div>
      </Card>
    </InstructorFrame>
  );
}

export function InstructorStudentDetailPage({ snapshot, participantId }: InstructorPageProps & { participantId: string }) {
  const lookups = buildLookups(snapshot.data);
  const student = buildStudentRows(snapshot.data, lookups).find((row) => row.participant.id === participantId) ?? null;
  const primaryEnrollment = student?.enrollments[0] ?? null;
  const primaryGroup = primaryEnrollment ? findGroupForEnrollment(lookups, primaryEnrollment.id) : null;

  return (
    <InstructorFrame
      snapshot={snapshot}
      kicker="Instructor portal - beoordeling"
      title={student?.participant.display_name ?? "Leerling niet gevonden"}
      subtitle="Voortgang beoordelen, notities vastleggen en complimenten registreren."
    >
      {!student || !primaryEnrollment ? (
        <EmptyState>Deze leerling is niet beschikbaar binnen de actieve tenant of instructeurcontext.</EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card>
            <SectionHeader title="Leerlingprofiel" count={student.enrollments.length} />
            <div className="grid gap-3">
              <InfoTile label="Naam" value={student.participant.display_name} />
              <InfoTile label="Leeftijd" value={student.participant.birthdate ? `${ageFromBirthdate(student.participant.birthdate)} jaar` : "Onbekend"} />
              <InfoTile label="Programma" value={lookups.programs.get(primaryEnrollment.program_id)?.name ?? "-"} />
              <InfoTile label="Stage" value={primaryEnrollment.current_stage_id ? (lookups.stages.get(primaryEnrollment.current_stage_id)?.name ?? "-") : "-"} />
              <InfoTile label="Groep" value={primaryGroup?.name ?? "-"} />
            </div>
          </Card>

          <Card>
            <SectionHeader title="Voortgang beoordelen" count={student.progress.length} />
            <ProgressForm enrollment={primaryEnrollment} participant={student.participant} group={primaryGroup} stages={snapshot.data.stages} />
          </Card>

          <Card>
            <SectionHeader title="Module-progress" count={student.moduleProgress.length} />
            <ModuleProgressForm enrollment={primaryEnrollment} participant={student.participant} group={primaryGroup} lookups={lookups} />
          </Card>

          <Card>
            <SectionHeader title="Badges en doorstroom" count={student.badgeAwards.length + student.transitionProposals.length} />
            <div className="grid gap-5">
              <BadgeAwardForm badges={snapshot.data.badges} enrollment={primaryEnrollment} participant={student.participant} group={primaryGroup} />
              <StageTransitionForm enrollment={primaryEnrollment} participant={student.participant} group={primaryGroup} stages={snapshot.data.stages} />
            </div>
          </Card>

          <Card>
            <SectionHeader title="Notities en complimenten" count={student.notes.length} />
            <NoteForm enrollment={primaryEnrollment} participant={student.participant} group={primaryGroup} />
          </Card>

          <Card>
            <SectionHeader title="Historie" count={student.progress.length + student.moduleProgress.length + student.badgeAwards.length + student.transitionProposals.length + student.notes.length} />
            <div className="grid gap-3">
              {student.progress.map((progress) => (
                <ProgressHistoryRow key={progress.id} progress={progress} lookups={lookups} />
              ))}
              {student.moduleProgress.map((progress) => (
                <ModuleProgressHistoryRow key={progress.id} progress={progress} lookups={lookups} />
              ))}
              {student.badgeAwards.map((award) => (
                <BadgeAwardHistoryRow key={award.id} award={award} lookups={lookups} />
              ))}
              {student.transitionProposals.map((proposal) => (
                <StageTransitionHistoryRow key={proposal.id} proposal={proposal} lookups={lookups} />
              ))}
              {student.notes.map((note) => (
                <NoteHistoryRow key={note.id} note={note} />
              ))}
              {student.progress.length + student.moduleProgress.length + student.badgeAwards.length + student.transitionProposals.length + student.notes.length === 0 ? <EmptyState>Nog geen voortgang of notities gevonden.</EmptyState> : null}
            </div>
          </Card>
        </div>
      )}
    </InstructorFrame>
  );
}

function InstructorFrame({ snapshot, kicker, title, subtitle, children }: InstructorPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Phase 7</StatusPill>} />
      {snapshot.status === "ready" ? children : <InstructorStatusPanel snapshot={snapshot} />}
    </div>
  );
}

function InstructorStatusPanel({ snapshot }: InstructorPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Instructor portal niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie, tenantcontext en instructorrechten nodig.</p>
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

function SessionAttendanceCard({ session, group, rows, lookups }: { session: InstructorSessionRow; group: InstructorGroupRow; rows: SessionRosterRow[]; lookups: LookupMaps }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{group.name}</p>
          <p className="text-sm text-muted-foreground">
            {formatDateTime(session.starts_at)} - {formatTime(session.ends_at)} - {session.resource_id ? (lookups.resources.get(session.resource_id)?.name ?? "Resource") : "Resource volgt"}
          </p>
        </div>
        <StatusPill tone={session.status === "scheduled" ? "success" : session.status === "cancelled" ? "danger" : "neutral"}>{session.status}</StatusPill>
      </div>
      <div className="grid gap-3">
        {rows.length === 0 ? <EmptyState>Geen leerlingen in deze sessie gevonden.</EmptyState> : null}
        {rows.map((row) => (
          <AttendanceRow key={`${row.session.id}-${row.enrollment.id}`} row={row} lookups={lookups} />
        ))}
      </div>
    </Card>
  );
}

function AttendanceRow({ row, lookups }: { row: SessionRosterRow; lookups: LookupMaps }) {
  const latestProgress = row.progress[0] ?? null;
  const stage = row.enrollment.current_stage_id ? lookups.stages.get(row.enrollment.current_stage_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-base font-bold text-foreground hover:text-primary" href={`/instructor/student/${row.participant.id}`}>
            {row.participant.display_name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {stage?.name ?? "Stage"} - laatste score: {latestProgress?.score ?? "-"}
          </p>
        </div>
        <StatusPill tone={attendanceTone(row.attendance?.status)}>{row.attendance?.status ?? "nog niet geregistreerd"}</StatusPill>
      </div>
      <AttendanceForm row={row} />
    </div>
  );
}

function AttendanceForm({ row }: { row: SessionRosterRow }) {
  return (
    <form action={recordAttendanceAction} className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
      <input name="group_id" type="hidden" value={row.group.id} />
      <input name="session_id" type="hidden" value={row.session.id} />
      <input name="enrollment_id" type="hidden" value={row.enrollment.id} />
      <input name="participant_id" type="hidden" value={row.participant.id} />
      <select className={fieldClassName} defaultValue={row.attendance?.status ?? "present"} name="status">
        <option value="present">Aanwezig</option>
        <option value="absent">Afwezig</option>
        <option value="late">Te laat</option>
        <option value="excused">Afbericht</option>
      </select>
      <input className={fieldClassName} defaultValue={row.attendance?.note ?? ""} name="note" placeholder="Korte attendance-notitie" />
      <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Opslaan
      </button>
    </form>
  );
}

function ProgressForm({
  enrollment,
  participant,
  group,
  stages
}: {
  enrollment: InstructorEnrollmentRow;
  participant: InstructorParticipantRow;
  group: InstructorGroupRow | null;
  stages: InstructorStageRow[];
}) {
  const programStages = stages.filter((stage) => stage.program_id === enrollment.program_id);

  return (
    <form action={createProgressUpdateAction} className="grid gap-3">
      <input name="participant_id" type="hidden" value={participant.id} />
      <input name="enrollment_id" type="hidden" value={enrollment.id} />
      {group ? <input name="group_id" type="hidden" value={group.id} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Stage
          <select className={fieldClassName} defaultValue={enrollment.current_stage_id ?? ""} name="stage_id">
            <option value="">Geen stage</option>
            {programStages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Status
          <select className={fieldClassName} defaultValue="observed" name="status">
            <option value="observed">Geobserveerd</option>
            <option value="in_progress">In ontwikkeling</option>
            <option value="passed">Behaald</option>
            <option value="needs_attention">Aandacht nodig</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Score
          <input className={fieldClassName} max="100" min="0" name="score" placeholder="0-100" type="number" />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Observatie
        <textarea className={`${fieldClassName} min-h-24`} name="note" placeholder="Wat zag je in de les?" />
      </label>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Voortgang opslaan
      </button>
    </form>
  );
}

function NoteForm({ enrollment, participant, group }: { enrollment: InstructorEnrollmentRow; participant: InstructorParticipantRow; group: InstructorGroupRow | null }) {
  return (
    <form action={createStudentNoteAction} className="grid gap-3">
      <input name="participant_id" type="hidden" value={participant.id} />
      <input name="enrollment_id" type="hidden" value={enrollment.id} />
      {group ? <input name="group_id" type="hidden" value={group.id} /> : null}
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Type
        <select className={fieldClassName} defaultValue="internal" name="note_type">
          <option value="internal">Interne notitie</option>
          <option value="parent_visible">Ouderzichtbaar</option>
          <option value="compliment">Compliment</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Notitie
        <textarea className={`${fieldClassName} min-h-24`} name="body" placeholder="Korte notitie of compliment" />
      </label>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Notitie opslaan
      </button>
    </form>
  );
}

function ModuleProgressForm({ enrollment, participant, group, lookups }: { enrollment: InstructorEnrollmentRow; participant: InstructorParticipantRow; group: InstructorGroupRow | null; lookups: LookupMaps }) {
  const currentStageId = enrollment.current_stage_id ?? group?.stage_id ?? "";
  const modules = currentStageId ? (lookups.stageModulesByStage.get(currentStageId) ?? []) : [];

  return (
    <form action={createStageModuleProgressAction} className="grid gap-3">
      <input name="participant_id" type="hidden" value={participant.id} />
      <input name="enrollment_id" type="hidden" value={enrollment.id} />
      <input name="stage_id" type="hidden" value={currentStageId} />
      {group ? <input name="group_id" type="hidden" value={group.id} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Module
          <select className={fieldClassName} name="stage_module_id" required>
            <option value="">Selecteer module</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Status
          <select className={fieldClassName} defaultValue="in_progress" name="status">
            <option value="observed">Geobserveerd</option>
            <option value="in_progress">In ontwikkeling</option>
            <option value="passed">Behaald</option>
            <option value="needs_attention">Aandacht nodig</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Score
          <input className={fieldClassName} max="100" min="0" name="score" placeholder="0-100" type="number" />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Module-notitie
        <textarea className={`${fieldClassName} min-h-20`} name="note" placeholder="Korte module-observatie" />
      </label>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Module-progress opslaan
      </button>
    </form>
  );
}

function BadgeAwardForm({ badges, enrollment, participant, group }: { badges: InstructorBadgeRow[]; enrollment: InstructorEnrollmentRow; participant: InstructorParticipantRow; group: InstructorGroupRow | null }) {
  const availableBadges = badges.filter((badge) => badge.status === "active" && (!badge.program_id || badge.program_id === enrollment.program_id));

  return (
    <form action={awardBadgeAction} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4">
      <input name="participant_id" type="hidden" value={participant.id} />
      <input name="enrollment_id" type="hidden" value={enrollment.id} />
      {group ? <input name="group_id" type="hidden" value={group.id} /> : null}
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Badge
        <select className={fieldClassName} name="badge_id" required>
          <option value="">Selecteer badge</option>
          {availableBadges.map((badge) => (
            <option key={badge.id} value={badge.id}>
              {badge.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Bericht
        <input className={fieldClassName} name="note" placeholder="Waarom verdient deze leerling de badge?" />
      </label>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Badge toekennen
      </button>
    </form>
  );
}

function StageTransitionForm({ enrollment, participant, group, stages }: { enrollment: InstructorEnrollmentRow; participant: InstructorParticipantRow; group: InstructorGroupRow | null; stages: InstructorStageRow[] }) {
  const programStages = stages.filter((stage) => stage.program_id === enrollment.program_id && stage.id !== enrollment.current_stage_id);

  return (
    <form action={proposeStageTransitionAction} className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4">
      <input name="participant_id" type="hidden" value={participant.id} />
      <input name="enrollment_id" type="hidden" value={enrollment.id} />
      <input name="from_stage_id" type="hidden" value={enrollment.current_stage_id ?? ""} />
      {group ? <input name="group_id" type="hidden" value={group.id} /> : null}
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Nieuwe stage
        <select className={fieldClassName} name="to_stage_id" required>
          <option value="">Selecteer stage</option>
          {programStages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
        Reden
        <textarea className={`${fieldClassName} min-h-20`} name="reason" placeholder="Waarom is doorstroom passend? Subscription blijft ongewijzigd." />
      </label>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Doorstroom voorstellen
      </button>
    </form>
  );
}

function StudentListRow({ student, lookups }: { student: StudentRow; lookups: LookupMaps }) {
  const enrollment = student.enrollments[0] ?? null;
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;
  const stage = enrollment?.current_stage_id ? lookups.stages.get(enrollment.current_stage_id) : null;
  const group = enrollment ? findGroupForEnrollment(lookups, enrollment.id) : null;
  const latestProgress = student.progress[0] ?? null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-lg font-bold text-foreground hover:text-primary" href={`/instructor/student/${student.participant.id}`}>
            {student.participant.display_name}
          </Link>
          <p className="text-sm text-muted-foreground">{program?.name ?? "Programma"} - {stage?.name ?? "Stage"} - {group?.name ?? "Geen groep"}</p>
        </div>
        <StatusPill tone={student.participant.status === "active" ? "success" : "neutral"}>{student.participant.status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoTile label="Laatste voortgang" value={latestProgress ? `${latestProgress.status} ${latestProgress.score ?? "-"}%` : "Nog geen"} />
        <InfoTile label="Badges" value={student.badgeAwards.length.toString()} />
        <InfoTile label="Start" value={enrollment ? formatDate(enrollment.started_on) : "-"} />
      </div>
    </div>
  );
}

function SessionSummary({ session, group, lookups }: { session: InstructorSessionRow; group: InstructorGroupRow; lookups: LookupMaps }) {
  const resource = session.resource_id ? lookups.resources.get(session.resource_id) : group.resource_id ? lookups.resources.get(group.resource_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="font-bold text-foreground hover:text-primary" href={`/instructor/group/${group.id}`}>
            {group.name}
          </Link>
          <p className="text-sm text-muted-foreground">{formatDateTime(session.starts_at)} - {resource?.location_name ?? resource?.name ?? "Locatie volgt"}</p>
        </div>
        <StatusPill tone={session.status === "scheduled" ? "success" : "neutral"}>{session.status}</StatusPill>
      </div>
    </div>
  );
}

function RosterMiniRow({ row }: { row: SessionRosterRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{row.participant.display_name}</p>
          <p className="text-xs text-muted-foreground">{row.group.name} - {formatDateTime(row.session.starts_at)}</p>
        </div>
        <StatusPill tone={attendanceTone(row.attendance?.status)}>{row.attendance?.status ?? "open"}</StatusPill>
      </div>
    </div>
  );
}

function ProgressHistoryRow({ progress, lookups }: { progress: InstructorProgressRow; lookups: LookupMaps }) {
  const stage = progress.stage_id ? lookups.stages.get(progress.stage_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{stage?.name ?? "Algemene voortgang"}</p>
          {progress.note ? <p className="mt-1 text-sm text-muted-foreground">{progress.note}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(progress.assessed_at)}</p>
        </div>
        <StatusPill tone={progress.status === "passed" ? "success" : progress.status === "needs_attention" ? "warning" : "info"}>
          {progress.status}
          {progress.score === null ? "" : ` ${progress.score}%`}
        </StatusPill>
      </div>
    </div>
  );
}

function ModuleProgressHistoryRow({ progress, lookups }: { progress: InstructorStageModuleProgressRow; lookups: LookupMaps }) {
  const module = lookups.stageModules.get(progress.stage_module_id);

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{module?.name ?? "Module"}</p>
          {progress.note ? <p className="mt-1 text-sm text-muted-foreground">{progress.note}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(progress.assessed_at)}</p>
        </div>
        <StatusPill tone={progress.status === "passed" ? "success" : progress.status === "needs_attention" ? "warning" : "info"}>
          {progress.status}
          {progress.score === null ? "" : ` ${progress.score}%`}
        </StatusPill>
      </div>
    </div>
  );
}

function BadgeAwardHistoryRow({ award, lookups }: { award: InstructorBadgeAwardRow; lookups: LookupMaps }) {
  const badge = lookups.badges.get(award.badge_id);

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{badge?.name ?? "Badge"}</p>
          {award.note ? <p className="mt-1 text-sm text-muted-foreground">{award.note}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(award.awarded_at)}</p>
        </div>
        <StatusPill tone={award.status === "awarded" ? "success" : "neutral"}>{award.status}</StatusPill>
      </div>
    </div>
  );
}

function StageTransitionHistoryRow({ proposal, lookups }: { proposal: InstructorStageTransitionProposalRow; lookups: LookupMaps }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {proposal.from_stage_id ? (lookups.stages.get(proposal.from_stage_id)?.name ?? "Huidige stage") : "Geen stage"} naar {lookups.stages.get(proposal.to_stage_id)?.name ?? "Nieuwe stage"}
          </p>
          {proposal.reason ? <p className="mt-1 text-sm text-muted-foreground">{proposal.reason}</p> : null}
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(proposal.proposed_at)}</p>
        </div>
        <StatusPill tone={proposal.status === "approved" || proposal.status === "applied" ? "success" : proposal.status === "rejected" ? "danger" : "warning"}>{proposal.status}</StatusPill>
      </div>
    </div>
  );
}

function NoteHistoryRow({ note }: { note: InstructorStudentNoteRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{note.note_type === "compliment" ? "Compliment" : note.note_type === "parent_visible" ? "Ouderzichtbare notitie" : "Interne notitie"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{note.body}</p>
          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(note.created_at)}</p>
        </div>
        <StatusPill tone={note.note_type === "compliment" ? "success" : "neutral"}>{note.note_type}</StatusPill>
      </div>
    </div>
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

function buildLookups(data: InstructorPortalData): LookupMaps {
  return {
    instructors: byId(data.instructors),
    programs: byId(data.programs),
    stages: byId(data.stages),
    stageModules: byId(data.stageModules),
    stageModulesByStage: groupBy(data.stageModules, (module) => module.stage_id),
    resources: byId(data.resources),
    groups: byId(data.groups),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    sessionsByGroup: groupBy(data.sessions, (session) => session.group_id),
    membershipsByGroup: groupBy(data.groupMemberships, (membership) => membership.group_id),
    membershipsByEnrollment: groupBy(data.groupMemberships, (membership) => membership.enrollment_id),
    progressByEnrollment: groupBy(data.progress, (progress) => progress.enrollment_id),
    moduleProgressByEnrollment: groupBy(data.stageModuleProgress, (progress) => progress.enrollment_id),
    badges: byId(data.badges),
    badgeAwardsByParticipant: groupBy(data.badgeAwards, (award) => award.participant_id),
    transitionProposalsByEnrollment: groupBy(data.stageTransitionProposals, (proposal) => proposal.enrollment_id),
    attendanceBySessionEnrollment: new Map(data.attendance.map((attendance) => [`${attendance.session_id}:${attendance.enrollment_id}`, attendance])),
    notesByParticipant: groupBy(data.notes, (note) => note.participant_id)
  };
}

function buildSessionRosterRows(data: InstructorPortalData, lookups: LookupMaps): SessionRosterRow[] {
  const rows: SessionRosterRow[] = [];

  for (const session of data.sessions) {
    const group = lookups.groups.get(session.group_id);

    if (!group) {
      continue;
    }

    for (const membership of lookups.membershipsByGroup.get(group.id) ?? []) {
      const enrollment = lookups.enrollments.get(membership.enrollment_id);
      const participant = enrollment ? lookups.participants.get(enrollment.participant_id) : null;

      if (!enrollment || !participant) {
        continue;
      }

      rows.push({
        session,
        group,
        membership,
        enrollment,
        participant,
        attendance: lookups.attendanceBySessionEnrollment.get(`${session.id}:${enrollment.id}`) ?? null,
        progress: lookups.progressByEnrollment.get(enrollment.id) ?? [],
        resource: session.resource_id ? (lookups.resources.get(session.resource_id) ?? null) : group.resource_id ? (lookups.resources.get(group.resource_id) ?? null) : null
      });
    }
  }

  return rows.sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at) || a.participant.display_name.localeCompare(b.participant.display_name));
}

function buildStudentRows(data: InstructorPortalData, lookups: LookupMaps): StudentRow[] {
  return data.participants
    .map((participant) => {
      const enrollments = data.enrollments.filter((enrollment) => enrollment.participant_id === participant.id);
      const enrollmentIds = enrollments.map((enrollment) => enrollment.id);

      return {
        participant,
        enrollments,
        memberships: data.groupMemberships.filter((membership) => enrollmentIds.includes(membership.enrollment_id)),
        progress: enrollmentIds.flatMap((enrollmentId) => lookups.progressByEnrollment.get(enrollmentId) ?? []),
        moduleProgress: enrollmentIds.flatMap((enrollmentId) => lookups.moduleProgressByEnrollment.get(enrollmentId) ?? []),
        badgeAwards: lookups.badgeAwardsByParticipant.get(participant.id) ?? [],
        transitionProposals: enrollmentIds.flatMap((enrollmentId) => lookups.transitionProposalsByEnrollment.get(enrollmentId) ?? []),
        notes: lookups.notesByParticipant.get(participant.id) ?? []
      };
    })
    .sort((a, b) => a.participant.display_name.localeCompare(b.participant.display_name));
}

function findGroupForEnrollment(lookups: LookupMaps, enrollmentId: string) {
  const membership = (lookups.membershipsByEnrollment.get(enrollmentId) ?? []).find((candidate) => ["planned", "active"].includes(candidate.status));

  return membership ? (lookups.groups.get(membership.group_id) ?? null) : null;
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

function attendanceTone(status?: string | null) {
  if (status === "present") {
    return "success";
  }

  if (status === "late" || status === "excused") {
    return "warning";
  }

  if (status === "absent") {
    return "danger";
  }

  return "neutral";
}

function weekdayName(value: number) {
  return ["ma", "di", "wo", "do", "vr", "za", "zo"][Math.max(0, Math.min(6, value - 1))] ?? "-";
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  const normalized = value.includes("T") || value.includes("-") ? value : `2026-01-01T${value}`;

  return new Intl.DateTimeFormat("nl-NL", { timeStyle: "short" }).format(new Date(normalized));
}

const fieldClassName = "rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
