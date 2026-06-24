import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type InstructorRow = {
  id: string;
  profile_id: string | null;
  display_name: string;
  email: string | null;
  status: string;
};

export type InstructorProgramRow = {
  id: string;
  code: string;
  name: string;
};

export type InstructorStageRow = {
  id: string;
  program_id: string;
  code: string;
  name: string;
  sort_order: number;
};

export type InstructorStageModuleRow = {
  id: string;
  program_id: string;
  stage_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: string;
};

export type InstructorResourceRow = {
  id: string;
  name: string;
  location_name: string | null;
  capacity: number;
};

export type InstructorGroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  code: string;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
};

export type InstructorSessionRow = {
  id: string;
  group_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type InstructorParticipantRow = {
  id: string;
  external_reference: string | null;
  display_name: string;
  birthdate: string | null;
  status: string;
};

export type InstructorEnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  subscription_plan_id: string | null;
  status: string;
  started_on: string;
  ended_on: string | null;
};

export type InstructorGroupMembershipRow = {
  id: string;
  enrollment_id: string;
  group_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
};

export type InstructorProgressRow = {
  id: string;
  enrollment_id: string;
  stage_id: string | null;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

export type InstructorStageModuleProgressRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  stage_id: string;
  stage_module_id: string;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

export type InstructorBadgeRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string;
  name: string;
  description: string | null;
  status: string;
};

export type InstructorBadgeAwardRow = {
  id: string;
  badge_id: string;
  participant_id: string;
  enrollment_id: string | null;
  source: string;
  note: string | null;
  status: string;
  awarded_at: string;
};

export type InstructorStageTransitionProposalRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  reason: string | null;
  status: string;
  proposed_at: string;
  reviewed_at: string | null;
};

export type InstructorAttendanceRow = {
  id: string;
  session_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  note: string | null;
  recorded_at: string;
  recorded_by_profile_id: string | null;
};

export type InstructorStudentNoteRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  note_type: string;
  body: string;
  author_profile_id: string | null;
  status: string;
  created_at: string;
};

export type InstructorPortalData = {
  instructors: InstructorRow[];
  currentInstructor: InstructorRow | null;
  programs: InstructorProgramRow[];
  stages: InstructorStageRow[];
  stageModules: InstructorStageModuleRow[];
  resources: InstructorResourceRow[];
  groups: InstructorGroupRow[];
  sessions: InstructorSessionRow[];
  participants: InstructorParticipantRow[];
  enrollments: InstructorEnrollmentRow[];
  groupMemberships: InstructorGroupMembershipRow[];
  progress: InstructorProgressRow[];
  stageModuleProgress: InstructorStageModuleProgressRow[];
  badges: InstructorBadgeRow[];
  badgeAwards: InstructorBadgeAwardRow[];
  stageTransitionProposals: InstructorStageTransitionProposalRow[];
  attendance: InstructorAttendanceRow[];
  notes: InstructorStudentNoteRow[];
};

export type InstructorPortalSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
  } | null;
  data: InstructorPortalData;
  errors: string[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const managerRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function getInstructorPortalSnapshot(): Promise<InstructorPortalSnapshot> {
  const emptyData = createEmptyData();
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      user: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor de instructeursshell."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };
  const user = {
    id: context.user.id,
    displayName: context.user.displayName,
    email: context.user.email
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      user,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;

  const [programsResult, stagesResult, resourcesResult, instructorsResult, groupsResult, sessionsResult] = await Promise.all([
    supabase.from("programs").select("id, code, name").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("stages").select("id, program_id, code, name, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }),
    supabase.from("resources").select("id, name, location_name, capacity").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("instructors").select("id, profile_id, display_name, email, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase
      .from("groups")
      .select("id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status")
      .eq("tenant_id", tenantId)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true }),
    supabase
      .from("sessions")
      .select("id, group_id, resource_id, instructor_id, starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .order("starts_at", { ascending: true })
      .limit(80)
  ]);

  const instructors = asRows<InstructorRow>(instructorsResult.data);
  const linkedInstructor = findLinkedInstructor(instructors, user.id, user.email);
  const canSeeAllGroups = context.activeTenant.roles.some((role) => managerRoles.includes(role as (typeof managerRoles)[number]));
  const allGroups = asRows<InstructorGroupRow>(groupsResult.data);
  const groups = linkedInstructor && !canSeeAllGroups ? allGroups.filter((group) => group.instructor_id === linkedInstructor.id) : allGroups;
  const groupIds = unique(groups.map((group) => group.id));
  const allSessions = asRows<InstructorSessionRow>(sessionsResult.data);
  const sessions = groupIds.length > 0 ? allSessions.filter((session) => groupIds.includes(session.group_id)) : [];

  const groupMembershipsResult = await rowsByIds<InstructorGroupMembershipRow>(
    supabase,
    "group_memberships",
    "id, enrollment_id, group_id, status, starts_on, ends_on",
    tenantId,
    "group_id",
    groupIds,
    "starts_on",
    false
  );
  const memberships = groupMembershipsResult.rows.filter((membership) => ["planned", "active"].includes(membership.status));
  const enrollmentIds = unique(memberships.map((membership) => membership.enrollment_id));
  const enrollmentsResult = await rowsByIds<InstructorEnrollmentRow>(
    supabase,
    "enrollments",
    "id, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on",
    tenantId,
    "id",
    enrollmentIds,
    "started_on",
    false
  );
  const enrollments = enrollmentsResult.rows;
  const participantIds = unique(enrollments.map((enrollment) => enrollment.participant_id));
  const sessionIds = unique(sessions.map((session) => session.id));
  const stages = asRows<InstructorStageRow>(stagesResult.data);
  const stageIds = unique(stages.map((stage) => stage.id));

  const [participantsResult, progressResult, moduleProgressResult, badgesResult, badgeAwardsResult, transitionProposalsResult, attendanceResult, notesResult, stageModulesResult] = await Promise.all([
    rowsByIds<InstructorParticipantRow>(supabase, "participants", "id, external_reference, display_name, birthdate, status", tenantId, "id", participantIds, "display_name"),
    rowsByIds<InstructorProgressRow>(supabase, "progress", "id, enrollment_id, stage_id, status, score, note, assessed_at", tenantId, "enrollment_id", enrollmentIds, "assessed_at", false, 80),
    rowsByIds<InstructorStageModuleProgressRow>(
      supabase,
      "stage_module_progress",
      "id, enrollment_id, participant_id, stage_id, stage_module_id, status, score, note, assessed_at",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "assessed_at",
      false,
      120
    ),
    supabase.from("badges").select("id, program_id, stage_id, code, name, description, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    rowsByIds<InstructorBadgeAwardRow>(supabase, "badge_awards", "id, badge_id, participant_id, enrollment_id, source, note, status, awarded_at", tenantId, "participant_id", participantIds, "awarded_at", false),
    rowsByIds<InstructorStageTransitionProposalRow>(
      supabase,
      "stage_transition_proposals",
      "id, enrollment_id, participant_id, from_stage_id, to_stage_id, reason, status, proposed_at, reviewed_at",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "proposed_at",
      false
    ),
    rowsByIds<InstructorAttendanceRow>(
      supabase,
      "session_attendance",
      "id, session_id, enrollment_id, participant_id, status, note, recorded_at, recorded_by_profile_id",
      tenantId,
      "session_id",
      sessionIds,
      "recorded_at",
      false
    ),
    rowsByIds<InstructorStudentNoteRow>(
      supabase,
      "instructor_student_notes",
      "id, participant_id, enrollment_id, note_type, body, author_profile_id, status, created_at",
      tenantId,
      "participant_id",
      participantIds,
      "created_at",
      false,
      80
    ),
    rowsByIds<InstructorStageModuleRow>(supabase, "stage_modules", "id, program_id, stage_id, code, name, description, sort_order, status", tenantId, "stage_id", stageIds, "sort_order")
  ]);

  const errors = collectErrors({
    programs: programsResult.error,
    stages: stagesResult.error,
    resources: resourcesResult.error,
    instructors: instructorsResult.error,
    groups: groupsResult.error,
    sessions: sessionsResult.error,
    group_memberships: groupMembershipsResult.error,
    enrollments: enrollmentsResult.error,
    participants: participantsResult.error,
    progress: progressResult.error,
    stage_module_progress: moduleProgressResult.error,
    badges: badgesResult.error,
    badge_awards: badgeAwardsResult.error,
    stage_transition_proposals: transitionProposalsResult.error,
    session_attendance: attendanceResult.error,
    instructor_student_notes: notesResult.error,
    stage_modules: stageModulesResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    user,
    errors,
    data: {
      instructors,
      currentInstructor: linkedInstructor,
      programs: asRows<InstructorProgramRow>(programsResult.data),
      stages,
      stageModules: stageModulesResult.rows,
      resources: asRows<InstructorResourceRow>(resourcesResult.data),
      groups,
      sessions,
      participants: participantsResult.rows,
      enrollments,
      groupMemberships: memberships,
      progress: progressResult.rows,
      stageModuleProgress: moduleProgressResult.rows,
      badges: asRows<InstructorBadgeRow>(badgesResult.data),
      badgeAwards: badgeAwardsResult.rows,
      stageTransitionProposals: transitionProposalsResult.rows,
      attendance: attendanceResult.rows,
      notes: notesResult.rows
    }
  };
}

async function rowsByIds<Row>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  tenantId: string,
  column: string,
  ids: string[],
  orderColumn: string,
  ascending = true,
  limit?: number
): Promise<{ rows: Row[]; error: { message: string } | null }> {
  if (ids.length === 0) {
    return { rows: [], error: null };
  }

  let query = supabase.from(table).select(select).eq("tenant_id", tenantId).in(column, ids).order(orderColumn, { ascending });

  if (limit) {
    query = query.limit(limit);
  }

  const result = await query;

  return {
    rows: asRows<Row>(result.data),
    error: result.error
  };
}

function findLinkedInstructor(instructors: InstructorRow[], profileId: string, email: string | null) {
  return instructors.find((instructor) => instructor.profile_id === profileId) ?? instructors.find((instructor) => email && instructor.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

function createEmptyData(): InstructorPortalData {
  return {
    instructors: [],
    currentInstructor: null,
    programs: [],
    stages: [],
    stageModules: [],
    resources: [],
    groups: [],
    sessions: [],
    participants: [],
    enrollments: [],
    groupMemberships: [],
    progress: [],
    stageModuleProgress: [],
    badges: [],
    badgeAwards: [],
    stageTransitionProposals: [],
    attendance: [],
    notes: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
