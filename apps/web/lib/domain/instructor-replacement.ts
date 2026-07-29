import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  rankInstructorReplacements,
  type InstructorAvailabilityWindow,
  type InstructorQualification,
  type InstructorReplacementCandidate,
  type ScheduledInstructorSession
} from "./instructor-replacement-contract";

export type InstructorReplacementData = {
  sessions: Array<{
    id: string;
    groupName: string;
    startsAt: string;
    endsAt: string;
    programName: string;
    stageName: string;
    locationName: string;
    originalInstructorId: string | null;
    originalInstructorName: string | null;
    absenceId: string | null;
    needsReplacement: boolean;
  }>;
  selectedSession: InstructorReplacementData["sessions"][number] | null;
  candidates: InstructorReplacementCandidate[];
  instructors: Array<{
    userId: string;
    name: string;
    qualificationCount: number;
    workloadConfigured: boolean;
  }>;
  programs: Array<{ id: string; name: string }>;
  stages: Array<{ id: string; programId: string; name: string }>;
  resources: Array<{ id: string; name: string }>;
  requests: Array<{
    id: string;
    sessionId: string;
    replacementName: string;
    status: string;
    score: number;
    confidence: number;
    proposedMessage: string;
    createdAt: string;
  }>;
};

export async function getInstructorReplacementData(tenantId: string, selectedSessionId?: string | null): Promise<InstructorReplacementData> {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 21 * 86_400_000);
  const weekStart = startOfIsoWeek(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const [
    sessionsResult,
    groupsResult,
    programsResult,
    stagesResult,
    resourcesResult,
    membershipsResult,
    profilesResult,
    groupAssignmentsResult,
    sessionAssignmentsResult,
    availabilityResult,
    qualificationsResult,
    limitsResult,
    absencesResult,
    requestsResult
  ] = await Promise.all([
    admin.from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .eq("status", "scheduled")
      .gte("starts_at", weekStart.toISOString())
      .lte("starts_at", horizon.toISOString())
      .order("starts_at"),
    admin.from("groups").select("id, name, program_id, stage_id, default_resource_id").eq("tenant_id", tenantId),
    admin.from("programs").select("id, name").eq("tenant_id", tenantId).eq("status", "active").order("name"),
    admin.from("program_stages").select("id, program_id, name").eq("tenant_id", tenantId).eq("status", "active").order("sort_order"),
    admin.from("resources").select("id, name").eq("tenant_id", tenantId).eq("status", "active").order("name"),
    admin.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "instructor").eq("status", "active"),
    admin.from("profiles").select("id, full_name"),
    admin.from("group_instructor_assignments").select("id, group_id, instructor_user_id, role, status, starts_on, ends_on").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("session_instructor_assignments").select("id, session_id, instructor_user_id, role, status").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("instructor_availability").select("instructor_user_id, weekday, starts_at, ends_at, availability_type, starts_on, ends_on, status").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("instructor_qualifications").select("instructor_user_id, program_id, stage_id, resource_id, status, valid_from, valid_until").eq("tenant_id", tenantId),
    admin.from("instructor_workload_limits").select("instructor_user_id, max_weekly_minutes, max_daily_minutes, max_consecutive_minutes, max_sessions_per_day, minimum_break_minutes, cross_location_buffer_minutes, effective_from, effective_until, status").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("instructor_absences").select("id, session_id, instructor_user_id, status").eq("tenant_id", tenantId).in("status", ["reported", "reviewing", "covered"]),
    admin.from("instructor_replacement_requests").select("id, session_id, replacement_instructor_user_id, status, score, confidence, proposed_message, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(60)
  ]);
  for (const [label, result] of [
    ["replacement sessions", sessionsResult], ["groups", groupsResult], ["programs", programsResult],
    ["stages", stagesResult], ["resources", resourcesResult], ["instructor memberships", membershipsResult],
    ["profiles", profilesResult], ["group assignments", groupAssignmentsResult], ["session assignments", sessionAssignmentsResult],
    ["availability", availabilityResult], ["qualifications", qualificationsResult], ["workload limits", limitsResult],
    ["absences", absencesResult], ["replacement requests", requestsResult]
  ] as const) assertResult(result.error, label);

  const instructors = new Set((membershipsResult.data ?? []).map((row) => row.user_id));
  const profiles = new Map((profilesResult.data ?? []).filter((row) => instructors.has(row.id)).map((row) => [row.id, row.full_name ?? "Instructeur zonder naam"]));
  const groups = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
  const programs = new Map((programsResult.data ?? []).map((row) => [row.id, row.name]));
  const stages = new Map((stagesResult.data ?? []).map((row) => [row.id, row.name]));
  const resources = new Map((resourcesResult.data ?? []).map((row) => [row.id, row.name]));
  const groupAssignments = groupBy(groupAssignmentsResult.data ?? [], (row) => row.group_id);
  const sessionAssignments = groupBy(sessionAssignmentsResult.data ?? [], (row) => row.session_id);
  const absences = new Map((absencesResult.data ?? []).map((row) => [row.session_id, row]));
  const sessionRows = sessionsResult.data ?? [];
  const sessionViews = sessionRows.flatMap((session): InstructorReplacementData["sessions"] => {
    if (new Date(session.starts_at) <= now) return [];
    const group = groups.get(session.group_id);
    if (!group) return [];
    const directAssignments = sessionAssignments.get(session.id) ?? [];
    const assignment = directAssignments.find((row) => row.role === "primary")
      ?? (groupAssignments.get(group.id) ?? []).find((row) => row.role === "primary" && assignmentCovers(row, session.starts_at))
      ?? null;
    const substitute = directAssignments.find((row) => row.role === "substitute") ?? null;
    const absence = absences.get(session.id) ?? null;
    return [{
      id: session.id,
      groupName: group.name,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      programName: programs.get(group.program_id) ?? "Programma",
      stageName: stages.get(group.stage_id) ?? "Niveau niet ingesteld",
      locationName: resources.get(session.resource_id ?? group.default_resource_id) ?? "Locatie niet ingesteld",
      originalInstructorId: absence?.instructor_user_id ?? assignment?.instructor_user_id ?? null,
      originalInstructorName: profiles.get(absence?.instructor_user_id ?? assignment?.instructor_user_id ?? "") ?? null,
      absenceId: absence?.id ?? null,
      needsReplacement: (!!absence && absence.status !== "covered") || (!assignment && !substitute)
    }];
  });
  const selectedView = sessionViews.find((session) => session.id === selectedSessionId)
    ?? sessionViews.find((session) => session.needsReplacement)
    ?? sessionViews[0]
    ?? null;
  const selectedRow = selectedView ? sessionRows.find((session) => session.id === selectedView.id) ?? null : null;
  const selectedGroup = selectedRow ? groups.get(selectedRow.group_id) ?? null : null;
  const qualificationsByInstructor = groupBy(qualificationsResult.data ?? [], (row) => row.instructor_user_id);
  const availabilityByInstructor = groupBy(availabilityResult.data ?? [], (row) => row.instructor_user_id);
  const limitsByInstructor = new Map((limitsResult.data ?? []).map((row) => [row.instructor_user_id, row]));
  const scheduledByInstructor = buildInstructorSchedules({
    sessions: sessionRows,
    groups,
    groupAssignments: groupAssignmentsResult.data ?? [],
    sessionAssignments: sessionAssignmentsResult.data ?? [],
    absences: absencesResult.data ?? []
  });

  let candidates: InstructorReplacementCandidate[] = [];
  if (selectedRow && selectedGroup) {
    const targetDate = selectedRow.starts_at.slice(0, 10);
    candidates = rankInstructorReplacements({
      session: {
        id: selectedRow.id,
        programId: selectedGroup.program_id,
        stageId: selectedGroup.stage_id,
        locationId: selectedRow.resource_id ?? selectedGroup.default_resource_id,
        startsAt: selectedRow.starts_at,
        endsAt: selectedRow.ends_at
      },
      excludedInstructorId: selectedView?.originalInstructorId,
      now,
      instructors: [...instructors].map((instructorId) => {
        const schedule = scheduledByInstructor.get(instructorId) ?? [];
        const daySessions = schedule.filter((item) => item.startsAt.slice(0, 10) === targetDate);
        const weekSessions = schedule.filter((item) => new Date(item.startsAt) >= weekStart && new Date(item.startsAt) < weekEnd);
        const limit = limitsByInstructor.get(instructorId);
        return {
          instructorId,
          displayName: profiles.get(instructorId) ?? "Instructeur zonder naam",
          qualifications: (qualificationsByInstructor.get(instructorId) ?? []).map((row): InstructorQualification => ({
            programId: row.program_id,
            stageId: row.stage_id,
            resourceId: row.resource_id,
            status: row.status,
            validFrom: row.valid_from,
            validUntil: row.valid_until
          })),
          availability: (availabilityByInstructor.get(instructorId) ?? []).map((row): InstructorAvailabilityWindow => ({
            weekday: row.weekday,
            startsAt: row.starts_at.slice(0, 5),
            endsAt: row.ends_at.slice(0, 5),
            type: row.availability_type as "available" | "unavailable",
            startsOn: row.starts_on,
            endsOn: row.ends_on
          })),
          scheduledSessions: schedule,
          weeklyMinutes: sumMinutes(weekSessions),
          dailyMinutes: sumMinutes(daySessions),
          dailySessions: daySessions.length,
          limits: {
            maxWeeklyMinutes: limit?.max_weekly_minutes ?? 1200,
            maxDailyMinutes: limit?.max_daily_minutes ?? 360,
            maxConsecutiveMinutes: limit?.max_consecutive_minutes ?? 180,
            maxSessionsPerDay: limit?.max_sessions_per_day ?? 8,
            minimumBreakMinutes: limit?.minimum_break_minutes ?? 15,
            crossLocationBufferMinutes: limit?.cross_location_buffer_minutes ?? 45
          }
        };
      })
    });
  }

  return {
    sessions: sessionViews,
    selectedSession: selectedView,
    candidates,
    instructors: [...instructors].map((userId) => ({
      userId,
      name: profiles.get(userId) ?? "Instructeur zonder naam",
      qualificationCount: (qualificationsByInstructor.get(userId) ?? []).filter((row) => row.status === "active").length,
      workloadConfigured: limitsByInstructor.has(userId)
    })).sort((left, right) => left.name.localeCompare(right.name)),
    programs: (programsResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    stages: (stagesResult.data ?? []).map((row) => ({ id: row.id, programId: row.program_id, name: row.name })),
    resources: (resourcesResult.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    requests: (requestsResult.data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      replacementName: profiles.get(row.replacement_instructor_user_id) ?? "Instructeur zonder naam",
      status: row.status,
      score: row.score,
      confidence: Number(row.confidence),
      proposedMessage: row.proposed_message,
      createdAt: row.created_at
    }))
  };
}

function buildInstructorSchedules(input: {
  sessions: Array<{ id: string; group_id: string; resource_id: string | null; starts_at: string; ends_at: string }>;
  groups: Map<string, { default_resource_id: string | null }>;
  groupAssignments: Array<{ group_id: string; instructor_user_id: string; starts_on: string | null; ends_on: string | null }>;
  sessionAssignments: Array<{ session_id: string; instructor_user_id: string }>;
  absences: Array<{ session_id: string; instructor_user_id: string; status: string }>;
}) {
  const result = new Map<string, ScheduledInstructorSession[]>();
  const absent = new Set(input.absences.filter((row) => row.status !== "cancelled").map((row) => `${row.session_id}:${row.instructor_user_id}`));
  const groupAssignments = groupBy(input.groupAssignments, (row) => row.group_id);
  const sessionAssignments = groupBy(input.sessionAssignments, (row) => row.session_id);
  for (const session of input.sessions) {
    const group = input.groups.get(session.group_id);
    const instructorIds = new Set([
      ...(groupAssignments.get(session.group_id) ?? []).filter((row) => assignmentCovers(row, session.starts_at)).map((row) => row.instructor_user_id),
      ...(sessionAssignments.get(session.id) ?? []).map((row) => row.instructor_user_id)
    ]);
    for (const instructorId of instructorIds) {
      if (absent.has(`${session.id}:${instructorId}`)) continue;
      const item: ScheduledInstructorSession = {
        sessionId: session.id,
        locationId: session.resource_id ?? group?.default_resource_id ?? null,
        startsAt: session.starts_at,
        endsAt: session.ends_at
      };
      result.set(instructorId, [...(result.get(instructorId) ?? []), item]);
    }
  }
  return result;
}

function assignmentCovers(row: { starts_on: string | null; ends_on: string | null }, startsAt: string) {
  const date = startsAt.slice(0, 10);
  return (!row.starts_on || row.starts_on <= date) && (!row.ends_on || row.ends_on >= date);
}

function sumMinutes(sessions: ScheduledInstructorSession[]) {
  return sessions.reduce((total, session) => total + Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000), 0);
}

function startOfIsoWeek(value: Date) {
  const date = new Date(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
