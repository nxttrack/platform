import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantCoreData, type GroupRow, type SessionRow, type TenantCoreData } from "./core";

export type InstructorAvailabilityRow = {
  id: string;
  instructor_user_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  availability_type: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  notes: string | null;
};

export type CatchUpRequestRow = {
  id: string;
  credit_id: string;
  participant_id: string;
  enrollment_id: string;
  requested_by_user_id: string;
  preferred_session_id: string;
  assigned_session_id: string | null;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
  admin_notes: string | null;
};

export type InstructorAbsenceRow = {
  session_id: string;
  instructor_user_id: string;
  status: string;
};

export type PlanningSessionInsight = {
  session: SessionRow;
  group: GroupRow | null;
  resourceName: string;
  instructorNames: string[];
  capacity: number;
  used: number;
  catchUpHolds: number;
  available: number;
  status: "available" | "full" | "over_capacity";
  dayKey: string;
};

export type PlanningConflict = {
  id: string;
  type: "capacity_over" | "resource_overlap" | "resource_capacity_over" | "instructor_overlap" | "instructor_unavailable";
  severity: "warning" | "danger";
  title: string;
  detail: string;
  sessionIds: string[];
};

export type PlanningDay = {
  key: string;
  label: string;
  sessions: PlanningSessionInsight[];
};

export type PlanningData = TenantCoreData & {
  availability: InstructorAvailabilityRow[];
  catchUpRequests: CatchUpRequestRow[];
  instructorAbsences: InstructorAbsenceRow[];
  conflicts: PlanningConflict[];
  dayPlan: PlanningDay[];
  sessionInsights: PlanningSessionInsight[];
};

const planningStatuses = new Set(["draft", "scheduled"]);

export async function getPlanningData(): Promise<PlanningData> {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [availabilityResult, catchUpResult, absencesResult] = await Promise.all([
    admin
      .from("instructor_availability")
      .select("id, instructor_user_id, weekday, starts_at, ends_at, availability_type, status, starts_on, ends_on, notes")
      .eq("tenant_id", core.tenant.id)
      .eq("status", "active")
      .order("weekday")
      .order("starts_at"),
    admin
      .from("catch_up_requests")
      .select("id, credit_id, participant_id, enrollment_id, requested_by_user_id, preferred_session_id, assigned_session_id, status, requested_at, decided_at, decided_by_user_id, admin_notes")
      .eq("tenant_id", core.tenant.id)
      .order("requested_at", { ascending: false }),
    admin
      .from("instructor_absences")
      .select("session_id, instructor_user_id, status")
      .eq("tenant_id", core.tenant.id)
      .in("status", ["reported", "reviewing", "covered"])
  ]);

  assertPlanningResult(availabilityResult.error, "instructor availability");
  assertPlanningResult(catchUpResult.error, "catch-up requests");
  assertPlanningResult(absencesResult.error, "instructor absences");

  const availability = (availabilityResult.data ?? []) as InstructorAvailabilityRow[];
  const catchUpRequests = (catchUpResult.data ?? []) as CatchUpRequestRow[];
  const instructorAbsences = (absencesResult.data ?? []) as InstructorAbsenceRow[];
  const sessionInsights = buildSessionInsights(core, catchUpRequests, instructorAbsences);
  const conflicts = buildPlanningConflicts(core, availability, catchUpRequests, sessionInsights, instructorAbsences);

  return {
    ...core,
    availability,
    catchUpRequests,
    instructorAbsences,
    conflicts,
    dayPlan: buildDayPlan(sessionInsights),
    sessionInsights
  };
}

export function buildSessionInsights(
  core: TenantCoreData,
  catchUpRequests: readonly CatchUpRequestRow[],
  instructorAbsences: readonly InstructorAbsenceRow[] = []
): PlanningSessionInsight[] {
  const groupById = new Map(core.groups.map((group) => [group.id, group]));
  const resourceById = new Map(core.resources.map((resource) => [resource.id, resource]));
  const membershipWeightByGroup = new Map<string, number>();
  const catchUpHoldsBySession = new Map<string, number>();
  const instructorNameById = new Map(core.instructors.map((instructor) => [instructor.userId, instructor.label]));
  const sessionInstructorIds = buildSessionInstructorMap(core, instructorAbsences);

  for (const membership of core.groupMemberships) {
    if (membership.status !== "active" && membership.status !== "trial") {
      continue;
    }

    membershipWeightByGroup.set(membership.group_id, (membershipWeightByGroup.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }

  for (const request of catchUpRequests) {
    const sessionId = request.assigned_session_id ?? request.preferred_session_id;

    if (!sessionId || (request.status !== "requested" && request.status !== "approved")) {
      continue;
    }

    catchUpHoldsBySession.set(sessionId, (catchUpHoldsBySession.get(sessionId) ?? 0) + 1);
  }

  return core.sessions
    .map((session) => {
      const group = groupById.get(session.group_id) ?? null;
      const resourceId = session.resource_id ?? group?.default_resource_id ?? null;
      const resource = resourceId ? resourceById.get(resourceId) : null;
      const capacity = session.capacity_override ?? group?.capacity ?? 0;
      const catchUpHolds = catchUpHoldsBySession.get(session.id) ?? 0;
      const used = (membershipWeightByGroup.get(session.group_id) ?? 0) + catchUpHolds;
      const available = capacity - used;
      const instructorNames = (sessionInstructorIds.get(session.id) ?? [])
        .map((instructorId) => instructorNameById.get(instructorId) ?? instructorId)
        .sort((a, b) => a.localeCompare(b));

      return {
        session,
        group,
        resourceName: resource?.name ?? "Geen resource",
        instructorNames,
        capacity,
        used,
        catchUpHolds,
        available,
        status: available < 0 ? "over_capacity" : available === 0 ? "full" : "available",
        dayKey: dateKey(session.starts_at)
      } satisfies PlanningSessionInsight;
    })
    .sort((a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime());
}

function buildPlanningConflicts(
  core: TenantCoreData,
  availability: readonly InstructorAvailabilityRow[],
  catchUpRequests: readonly CatchUpRequestRow[],
  insights: readonly PlanningSessionInsight[],
  instructorAbsences: readonly InstructorAbsenceRow[] = []
) {
  const conflicts: PlanningConflict[] = [];
  const resourceById = new Map(core.resources.map((resource) => [resource.id, resource]));
  const groupById = new Map(core.groups.map((group) => [group.id, group]));
  const sessionById = new Map(core.sessions.map((session) => [session.id, session]));
  const sessionInstructorIds = buildSessionInstructorMap(core, instructorAbsences);
  const instructorNameById = new Map(core.instructors.map((instructor) => [instructor.userId, instructor.label]));
  const activeSessions = core.sessions.filter((session) => planningStatuses.has(session.status));

  for (const insight of insights) {
    if (!planningStatuses.has(insight.session.status)) {
      continue;
    }

    if (insight.status === "over_capacity") {
      conflicts.push({
        id: `capacity:${insight.session.id}`,
        type: "capacity_over",
        severity: "danger",
        title: "Capaciteit overschreden",
        detail: `${insight.group?.name ?? "Les"} gebruikt ${formatNumber(insight.used)} van ${insight.capacity} plekken.`,
        sessionIds: [insight.session.id]
      });
    }

    const resource = resolvedResource(insight.session, groupById, resourceById);

    if (resource?.capacity !== null && resource?.capacity !== undefined && insight.used > resource.capacity) {
      conflicts.push({
        id: `resource-capacity:${insight.session.id}`,
        type: "resource_capacity_over",
        severity: "warning",
        title: "Resource capaciteit onder druk",
        detail: `${resource.name} heeft capaciteit ${resource.capacity}, deze les vraagt ${formatNumber(insight.used)} plekken.`,
        sessionIds: [insight.session.id]
      });
    }
  }

  for (let index = 0; index < activeSessions.length; index += 1) {
    const left = activeSessions[index];

    if (!left) {
      continue;
    }

    for (const right of activeSessions.slice(index + 1)) {
      if (!sessionsOverlap(left, right)) {
        continue;
      }

      const leftResource = resolvedResource(left, groupById, resourceById);
      const rightResource = resolvedResource(right, groupById, resourceById);

      if (leftResource && rightResource && leftResource.id === rightResource.id) {
        conflicts.push({
          id: `resource:${left.id}:${right.id}`,
          type: "resource_overlap",
          severity: "danger",
          title: "Resource dubbel gepland",
          detail: `${leftResource.name} heeft overlappende lessen: ${sessionLabel(left, groupById)} en ${sessionLabel(right, groupById)}.`,
          sessionIds: [left.id, right.id]
        });
      }

      for (const instructorId of intersect(sessionInstructorIds.get(left.id) ?? [], sessionInstructorIds.get(right.id) ?? [])) {
        conflicts.push({
          id: `instructor:${instructorId}:${left.id}:${right.id}`,
          type: "instructor_overlap",
          severity: "danger",
          title: "Instructeur dubbel gepland",
          detail: `${instructorNameById.get(instructorId) ?? instructorId} staat op overlappende lessen.`,
          sessionIds: [left.id, right.id]
        });
      }
    }
  }

  for (const [sessionId, instructorIds] of sessionInstructorIds) {
    const session = sessionById.get(sessionId);

    if (!session || !planningStatuses.has(session.status)) {
      continue;
    }

    for (const instructorId of instructorIds) {
      if (!isInstructorAvailable(availability, instructorId, session)) {
        conflicts.push({
          id: `availability:${instructorId}:${session.id}`,
          type: "instructor_unavailable",
          severity: "warning",
          title: "Beschikbaarheid mist",
          detail: `${instructorNameById.get(instructorId) ?? instructorId} heeft geen passende beschikbaarheid voor ${sessionLabel(session, groupById)}.`,
          sessionIds: [session.id]
        });
      }
    }
  }

  for (const request of catchUpRequests) {
    if (request.status !== "requested") {
      continue;
    }

    const session = sessionById.get(request.preferred_session_id);

    if (session && new Date(session.starts_at).getTime() <= Date.now()) {
      conflicts.push({
        id: `catch-up-expired:${request.id}`,
        type: "capacity_over",
        severity: "warning",
        title: "Inhaalverzoek verloopt",
        detail: "Een aangevraagde inhaalles ligt in het verleden en vraagt admin actie.",
        sessionIds: [session.id]
      });
    }
  }

  return conflicts.sort((a, b) => (a.severity === b.severity ? a.title.localeCompare(b.title) : a.severity === "danger" ? -1 : 1));
}

function buildDayPlan(insights: readonly PlanningSessionInsight[]) {
  const dayMap = new Map<string, PlanningSessionInsight[]>();
  const start = startOfDay(new Date());
  const end = new Date(start);

  end.setDate(end.getDate() + 13);

  for (const insight of insights) {
    const sessionDate = new Date(insight.session.starts_at);

    if (sessionDate < start || sessionDate > end) {
      continue;
    }

    const items = dayMap.get(insight.dayKey) ?? [];
    items.push(insight);
    dayMap.set(insight.dayKey, items);
  }

  return [...dayMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, sessions]) => ({
      key,
      label: new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${key}T00:00:00`)),
      sessions
    }));
}

function buildSessionInstructorMap(core: TenantCoreData, instructorAbsences: readonly InstructorAbsenceRow[] = []) {
  const bySession = new Map<string, Set<string>>();
  const sessionsByGroup = new Map<string, SessionRow[]>();
  const absentPairs = new Set(instructorAbsences.map((row) => `${row.session_id}:${row.instructor_user_id}`));

  for (const session of core.sessions) {
    const items = sessionsByGroup.get(session.group_id) ?? [];
    items.push(session);
    sessionsByGroup.set(session.group_id, items);
  }

  for (const assignment of core.groupInstructorAssignments) {
    if (assignment.status !== "active") {
      continue;
    }

    for (const session of sessionsByGroup.get(assignment.group_id) ?? []) {
      if (!absentPairs.has(`${session.id}:${assignment.instructor_user_id}`)) {
        addMapSet(bySession, session.id, assignment.instructor_user_id);
      }
    }
  }

  for (const assignment of core.sessionInstructorAssignments) {
    if (assignment.status === "active" && !absentPairs.has(`${assignment.session_id}:${assignment.instructor_user_id}`)) {
      addMapSet(bySession, assignment.session_id, assignment.instructor_user_id);
    }
  }

  return new Map([...bySession.entries()].map(([sessionId, instructorIds]) => [sessionId, [...instructorIds]]));
}

function isInstructorAvailable(availability: readonly InstructorAvailabilityRow[], instructorId: string, session: SessionRow) {
  const rows = availability.filter((row) => row.instructor_user_id === instructorId && row.status === "active");

  if (rows.length === 0) {
    return true;
  }

  const sessionStart = new Date(session.starts_at);
  const sessionEnd = new Date(session.ends_at);
  const weekday = sessionStart.getDay();
  const sessionStartTime = timeKey(sessionStart);
  const sessionEndTime = timeKey(sessionEnd);
  const activeRows = rows.filter((row) => {
    if (row.weekday !== weekday) {
      return false;
    }

    const sessionDate = dateKey(session.starts_at);

    return (!row.starts_on || row.starts_on <= sessionDate) && (!row.ends_on || row.ends_on >= sessionDate);
  });

  if (activeRows.some((row) => row.availability_type === "unavailable" && row.starts_at < sessionEndTime && row.ends_at > sessionStartTime)) {
    return false;
  }

  return activeRows.some((row) => row.availability_type === "available" && row.starts_at <= sessionStartTime && row.ends_at >= sessionEndTime);
}

function resolvedResource(session: SessionRow, groupById: Map<string, GroupRow>, resourceById: Map<string, { id: string; name: string; capacity: number | null }>) {
  const group = groupById.get(session.group_id);
  const resourceId = session.resource_id ?? group?.default_resource_id ?? null;

  return resourceId ? resourceById.get(resourceId) ?? null : null;
}

function sessionsOverlap(left: SessionRow, right: SessionRow) {
  return new Date(left.starts_at).getTime() < new Date(right.ends_at).getTime() && new Date(right.starts_at).getTime() < new Date(left.ends_at).getTime();
}

function sessionLabel(session: SessionRow, groupById: Map<string, GroupRow>) {
  return `${groupById.get(session.group_id)?.name ?? "Les"} om ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" }).format(new Date(session.starts_at))}`;
}

function addMapSet(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function intersect(left: string[], right: string[]) {
  const rightSet = new Set(right);

  return left.filter((value) => rightSet.has(value));
}

function startOfDay(value: Date) {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);

  return result;
}

function dateKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function timeKey(value: Date) {
  return value.toTimeString().slice(0, 8);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function assertPlanningResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
