import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveTenant,
  type EnrollmentRow,
  type GroupMembershipRow,
  type GroupRow,
  type InstructorAssignmentRow,
  type ParticipantRow,
  type ProgramRow,
  type ProgramStageRow,
  type ResourceRow,
  type SessionRow
} from "./core";

export type SessionInstructorAssignmentRow = {
  id: string;
  session_id: string;
  instructor_user_id: string;
  role: string;
  status: string;
};

export type AttendanceRow = {
  id: string;
  session_id: string;
  participant_id: string;
  enrollment_id: string;
  status: string;
  marked_by_user_id: string | null;
  marked_at: string;
  note: string | null;
};

export type ProgressNoteRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  session_id: string | null;
  instructor_user_id: string | null;
  visibility: string;
  note: string;
  status: string;
  created_at: string;
};

export type BadgeAwardRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  badge_definition_id: string | null;
  awarded_by_user_id: string | null;
  source_session_id: string | null;
  title: string;
  note: string | null;
  visibility: string;
  status: string;
  awarded_at: string;
};

export type BadgeDefinitionRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  icon_name: string | null;
  status: string;
  sort_order: number;
};

export type ProgressModuleRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  template_key: string | null;
  status: string;
  sort_order: number;
};

export type ProgressItemRow = {
  id: string;
  module_id: string;
  code: string | null;
  name: string;
  description: string | null;
  positive_goal: string | null;
  status: string;
  sort_order: number;
};

export type ProgressScoreRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  module_id: string;
  item_id: string;
  session_id: string | null;
  score: number;
  positive_label: string;
  note: string | null;
  visibility: string;
  status: string;
  scored_by_user_id: string | null;
  scored_at: string;
};

export type InstructorNotificationRow = {
  id: string;
  participant_id: string | null;
  type: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  read_at: string | null;
};

export type InstructorCatchUpRequestRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  preferred_session_id: string;
  assigned_session_id: string | null;
  status: string;
};

export type InstructorData = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
  };
  canManageTenant: boolean;
  groups: GroupRow[];
  sessions: SessionRow[];
  resources: ResourceRow[];
  programs: ProgramRow[];
  stages: ProgramStageRow[];
  participants: ParticipantRow[];
  enrollments: EnrollmentRow[];
  groupMemberships: GroupMembershipRow[];
  groupAssignments: InstructorAssignmentRow[];
  sessionAssignments: SessionInstructorAssignmentRow[];
  catchUpRequests: InstructorCatchUpRequestRow[];
  attendance: AttendanceRow[];
  progressNotes: ProgressNoteRow[];
  badgeAwards: BadgeAwardRow[];
  badgeDefinitions: BadgeDefinitionRow[];
  progressModules: ProgressModuleRow[];
  progressItems: ProgressItemRow[];
  progressScores: ProgressScoreRow[];
  notifications: InstructorNotificationRow[];
};

export async function getInstructorData(): Promise<InstructorData> {
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const canManageTenant = context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff") ?? false;
  const admin = createAdminClient();
  const since = new Date();
  const until = new Date();

  since.setDate(since.getDate() - 7);
  until.setDate(until.getDate() + 30);

  const [groupAssignmentsResult, sessionAssignmentsResult, groupsResult, sessionsResult, notificationsResult] = await Promise.all([
    canManageTenant
      ? admin.from("group_instructor_assignments").select("id, group_id, instructor_user_id, role, status").eq("tenant_id", tenant.id).eq("status", "active")
      : admin.from("group_instructor_assignments").select("id, group_id, instructor_user_id, role, status").eq("tenant_id", tenant.id).eq("instructor_user_id", context.user.id).eq("status", "active"),
    canManageTenant
      ? admin.from("session_instructor_assignments").select("id, session_id, instructor_user_id, role, status").eq("tenant_id", tenant.id).eq("status", "active")
      : admin.from("session_instructor_assignments").select("id, session_id, instructor_user_id, role, status").eq("tenant_id", tenant.id).eq("instructor_user_id", context.user.id).eq("status", "active"),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", tenant.id)
      .order("name"),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, capacity_override, notes")
      .eq("tenant_id", tenant.id)
      .gte("starts_at", since.toISOString())
      .lte("starts_at", until.toISOString())
      .order("starts_at"),
    admin
      .from("tenant_notifications")
      .select("id, participant_id, type, title, message, status, created_at, read_at")
      .eq("tenant_id", tenant.id)
      .eq("recipient_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  assertInstructorResult(groupAssignmentsResult.error, "group instructor assignments");
  assertInstructorResult(sessionAssignmentsResult.error, "session instructor assignments");
  assertInstructorResult(groupsResult.error, "groups");
  assertInstructorResult(sessionsResult.error, "sessions");
  assertInstructorResult(notificationsResult.error, "notifications");

  const groupAssignments = (groupAssignmentsResult.data ?? []) as InstructorAssignmentRow[];
  const sessionAssignments = (sessionAssignmentsResult.data ?? []) as SessionInstructorAssignmentRow[];
  const assignedGroupIds = new Set(groupAssignments.map((assignment) => assignment.group_id));
  const assignedSessionIds = new Set(sessionAssignments.map((assignment) => assignment.session_id));
  const sessions = ((sessionsResult.data ?? []) as SessionRow[]).filter((session) => canManageTenant || assignedGroupIds.has(session.group_id) || assignedSessionIds.has(session.id));
  const visibleGroupIds = new Set([...sessions.map((session) => session.group_id), ...assignedGroupIds]);
  const groups = ((groupsResult.data ?? []) as GroupRow[]).filter((group) => canManageTenant || visibleGroupIds.has(group.id));
  const groupIds = groups.map((group) => group.id);
  const sessionIds = sessions.map((session) => session.id);

  const [membershipsResult, catchUpRequestsResult, attendanceResult] = await Promise.all([
    groupIds.length > 0
      ? admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id).in("group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? admin.from("catch_up_requests").select("id, participant_id, enrollment_id, preferred_session_id, assigned_session_id, status").eq("tenant_id", tenant.id).eq("status", "approved").in("assigned_session_id", sessionIds)
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length > 0
      ? admin.from("session_attendance").select("id, session_id, participant_id, enrollment_id, status, marked_by_user_id, marked_at, note").eq("tenant_id", tenant.id).in("session_id", sessionIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  assertInstructorResult(membershipsResult.error, "group memberships");
  assertInstructorResult(catchUpRequestsResult.error, "catch-up requests");
  assertInstructorResult(attendanceResult.error, "session attendance");

  const groupMemberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const catchUpRequests = (catchUpRequestsResult.data ?? []) as InstructorCatchUpRequestRow[];
  const participantIds = unique(groupMemberships.map((membership) => membership.participant_id).concat(catchUpRequests.map((request) => request.participant_id)));
  const enrollmentIds = unique(groupMemberships.map((membership) => membership.enrollment_id).concat(catchUpRequests.map((request) => request.enrollment_id)));
  const [participantsResult, enrollmentsResult, notesResult, badgeAwardsResult, progressScoresResult] = await Promise.all([
    participantIds.length > 0 ? admin.from("participants").select("id, guardian_user_id, display_name, birth_date, status").eq("tenant_id", tenant.id).in("id", participantIds).order("display_name") : Promise.resolve({ data: [], error: null }),
    enrollmentIds.length > 0
      ? admin.from("enrollments").select("id, participant_id, guardian_user_id, program_id, current_stage_id, status, source, starts_on").eq("tenant_id", tenant.id).in("id", enrollmentIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length > 0
      ? admin
          .from("progress_notes")
          .select("id, participant_id, enrollment_id, session_id, instructor_user_id, visibility, note, status, created_at")
          .eq("tenant_id", tenant.id)
          .in("participant_id", participantIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    participantIds.length > 0
      ? admin
          .from("participant_badge_awards")
          .select("id, participant_id, enrollment_id, badge_definition_id, awarded_by_user_id, source_session_id, title, note, visibility, status, awarded_at")
          .eq("tenant_id", tenant.id)
          .in("participant_id", participantIds)
          .order("awarded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    participantIds.length > 0
      ? admin
          .from("participant_progress_scores")
          .select("id, participant_id, enrollment_id, module_id, item_id, session_id, score, positive_label, note, visibility, status, scored_by_user_id, scored_at")
          .eq("tenant_id", tenant.id)
          .eq("status", "active")
          .in("participant_id", participantIds)
          .order("scored_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  assertInstructorResult(participantsResult.error, "participants");
  assertInstructorResult(enrollmentsResult.error, "enrollments");
  assertInstructorResult(notesResult.error, "progress notes");
  assertInstructorResult(badgeAwardsResult.error, "badge awards");
  assertInstructorResult(progressScoresResult.error, "progress scores");

  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const programIds = unique(enrollments.map((enrollment) => enrollment.program_id).concat(groups.map((group) => group.program_id)));
  const stageIds = unique(enrollments.flatMap((enrollment) => (enrollment.current_stage_id ? [enrollment.current_stage_id] : [])).concat(groups.flatMap((group) => (group.stage_id ? [group.stage_id] : []))));
  const resourceIds = unique(groups.flatMap((group) => (group.default_resource_id ? [group.default_resource_id] : [])).concat(sessions.flatMap((session) => (session.resource_id ? [session.resource_id] : []))));
  const [programsResult, stagesResult, resourcesResult, badgeDefinitionsResult, progressModulesResult, progressItemsResult] = await Promise.all([
    programIds.length > 0 ? admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).in("id", programIds) : Promise.resolve({ data: [], error: null }),
    stageIds.length > 0 ? admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).in("id", stageIds) : Promise.resolve({ data: [], error: null }),
    resourceIds.length > 0 ? admin.from("resources").select("id, parent_resource_id, kind, name, code, capacity, status, sort_order").eq("tenant_id", tenant.id).in("id", resourceIds) : Promise.resolve({ data: [], error: null }),
    admin.from("badge_definitions").select("id, program_id, stage_id, code, name, description, icon_name, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    admin.from("progress_modules").select("id, program_id, stage_id, code, name, description, template_key, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order"),
    admin.from("progress_items").select("id, module_id, code, name, description, positive_goal, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order")
  ]);

  assertInstructorResult(programsResult.error, "programs");
  assertInstructorResult(stagesResult.error, "program stages");
  assertInstructorResult(resourcesResult.error, "resources");
  assertInstructorResult(badgeDefinitionsResult.error, "badge definitions");
  assertInstructorResult(progressModulesResult.error, "progress modules");
  assertInstructorResult(progressItemsResult.error, "progress items");

  return {
    tenant,
    user: context.user,
    canManageTenant,
    groups,
    sessions,
    resources: (resourcesResult.data ?? []) as ResourceRow[],
    programs: (programsResult.data ?? []) as ProgramRow[],
    stages: (stagesResult.data ?? []) as ProgramStageRow[],
    participants: (participantsResult.data ?? []) as ParticipantRow[],
    enrollments,
    groupMemberships,
    groupAssignments,
    sessionAssignments,
    catchUpRequests,
    attendance: (attendanceResult.data ?? []) as AttendanceRow[],
    progressNotes: (notesResult.data ?? []) as ProgressNoteRow[],
    badgeAwards: (badgeAwardsResult.data ?? []) as BadgeAwardRow[],
    badgeDefinitions: (badgeDefinitionsResult.data ?? []) as BadgeDefinitionRow[],
    progressModules: (progressModulesResult.data ?? []) as ProgressModuleRow[],
    progressItems: (progressItemsResult.data ?? []) as ProgressItemRow[],
    progressScores: (progressScoresResult.data ?? []) as ProgressScoreRow[],
    notifications: (notificationsResult.data ?? []) as InstructorNotificationRow[]
  };
}

export function getTodaySessions(data: InstructorData) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return data.sessions.filter((session) => {
    const startsAt = new Date(session.starts_at).getTime();

    return startsAt >= start.getTime() && startsAt <= end.getTime();
  });
}

export function getRosterForGroup(data: InstructorData, groupId: string) {
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const enrollmentById = new Map(data.enrollments.map((enrollment) => [enrollment.id, enrollment]));

  return data.groupMemberships
    .filter((membership) => membership.group_id === groupId && (membership.status === "active" || membership.status === "trial"))
    .flatMap((membership) => {
      const participant = participantById.get(membership.participant_id);
      const enrollment = enrollmentById.get(membership.enrollment_id);

      return participant && enrollment ? [{ membership, participant, enrollment }] : [];
    })
    .sort((a, b) => a.participant.display_name.localeCompare(b.participant.display_name));
}

export function getSessionRoster(data: InstructorData, sessionId: string) {
  const session = data.sessions.find((item) => item.id === sessionId);
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const enrollmentById = new Map(data.enrollments.map((enrollment) => [enrollment.id, enrollment]));

  if (!session) {
    return [];
  }

  const baseRoster = getRosterForGroup(data, session.group_id);
  const participantIds = new Set(baseRoster.map((item) => item.participant.id));
  const catchUpRoster = data.catchUpRequests
    .filter((request) => request.assigned_session_id === session.id && !participantIds.has(request.participant_id))
    .flatMap((request) => {
      const participant = participantById.get(request.participant_id);
      const enrollment = enrollmentById.get(request.enrollment_id);

      return participant && enrollment
        ? [
            {
              membership: {
                id: `catch-up:${request.id}`,
                group_id: session.group_id,
                enrollment_id: request.enrollment_id,
                participant_id: request.participant_id,
                status: "trial",
                capacity_weight: 1
              },
              participant,
              enrollment
            }
          ]
        : [];
    });

  return [...baseRoster, ...catchUpRoster].sort((a, b) => a.participant.display_name.localeCompare(b.participant.display_name));
}

export function formatSessionTime(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  const date = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(start);
  const startTime = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(start);
  const endTime = endsAt ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(endsAt)) : null;

  return `${date}, ${startTime}${endTime ? ` - ${endTime}` : ""}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function assertInstructorResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
