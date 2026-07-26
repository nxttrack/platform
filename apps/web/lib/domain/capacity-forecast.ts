import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCapacityForecast,
  type CapacityForecast,
  type CapacityForecastGroup
} from "./learning-intelligence-contract";

export type CapacityForecastFilters = {
  programId?: string;
  stageId?: string;
  weekday?: number;
  locationId?: string;
  instructorId?: string;
};

export async function forecastCapacity(input: {
  tenantId: string;
  horizonWeeks: 4 | 8 | 12;
  filters?: CapacityForecastFilters;
  includeTestData?: boolean;
}): Promise<CapacityForecast[]> {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const horizon = new Date(now.getTime() + input.horizonWeeks * 7 * dayMs);
  const historyStart = new Date(now.getTime() - 12 * 7 * dayMs).toISOString().slice(0, 10);

  const [
    groupsResult,
    membershipsResult,
    waitlistResult,
    preferencesResult,
    readinessResult,
    stagesResult,
    assignmentsResult,
    availabilityResult,
    resourcesResult,
    sessionsResult
  ] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, program_id, stage_id, default_resource_id, default_weekday, default_start_time, capacity, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active"),
    admin
      .from("group_memberships")
      .select("id, group_id, participant_id, status, capacity_weight, starts_on, ends_on, is_test, journey_run_id")
      .eq("tenant_id", input.tenantId)
      .or(`ends_on.is.null,ends_on.gte.${historyStart}`),
    admin
      .from("waitlist_entries")
      .select("id, program_id, recommended_stage_id, status, is_test, journey_run_id")
      .eq("tenant_id", input.tenantId)
      .in("status", ["waiting", "reviewing", "offered"]),
    admin
      .from("waitlist_preferences")
      .select("waitlist_entry_id, weekday, starts_after, ends_before, preference_weight")
      .eq("tenant_id", input.tenantId),
    admin
      .from("graduation_readiness")
      .select("participant_id, program_id, stage_id, status, next_review_on, is_test, journey_run_id")
      .eq("tenant_id", input.tenantId)
      .in("status", ["nearly_ready", "ready", "invited"]),
    admin
      .from("program_stages")
      .select("id, program_id, sort_order")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .order("sort_order"),
    admin
      .from("group_instructor_assignments")
      .select("group_id, instructor_user_id, starts_on, ends_on, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active"),
    admin
      .from("instructor_availability")
      .select("instructor_user_id, weekday, starts_at, ends_at, availability_type, starts_on, ends_on, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active"),
    admin
      .from("resources")
      .select("id, parent_resource_id, kind, capacity, status")
      .eq("tenant_id", input.tenantId),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, is_test")
      .eq("tenant_id", input.tenantId)
      .in("status", ["draft", "scheduled"])
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizon.toISOString())
  ]);

  for (const [label, result] of [
    ["groups", groupsResult],
    ["memberships", membershipsResult],
    ["waitlist", waitlistResult],
    ["waitlist preferences", preferencesResult],
    ["graduation readiness", readinessResult],
    ["program stages", stagesResult],
    ["instructor assignments", assignmentsResult],
    ["instructor availability", availabilityResult],
    ["resources", resourcesResult],
    ["sessions", sessionsResult]
  ] as const) {
    assertResult(result.error, label);
  }

  const groups = (groupsResult.data ?? []) as GroupRow[];
  const memberships = ((membershipsResult.data ?? []) as MembershipRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const waitlist = ((waitlistResult.data ?? []) as WaitlistRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const readiness = ((readinessResult.data ?? []) as ReadinessRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const sessions = ((sessionsResult.data ?? []) as SessionRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const preferences = (preferencesResult.data ?? []) as PreferenceRow[];
  const stages = (stagesResult.data ?? []) as StageRow[];
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const availability = (availabilityResult.data ?? []) as AvailabilityRow[];
  const resources = (resourcesResult.data ?? []) as ResourceRow[];
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const preferencesByWaitlistId = groupBy(preferences, (row) => row.waitlist_entry_id);
  const stagesByProgram = groupBy(stages, (row) => row.program_id);
  const previousStageById = new Map<string, string>();
  for (const programStages of stagesByProgram.values()) {
    const sorted = [...programStages].sort((left, right) => left.sort_order - right.sort_order);
    for (let index = 1; index < sorted.length; index += 1) {
      previousStageById.set(sorted[index]!.id, sorted[index - 1]!.id);
    }
  }

  const model: CapacityForecastGroup[] = groups
    .filter((group) => matchesFilters(group, input.filters, assignments, resourceById))
    .map((group) => {
      const groupMemberships = memberships.filter((row) => row.group_id === group.id);
      const activeMemberships = groupMemberships.filter((row) =>
        ["active", "trial"].includes(row.status) &&
        row.starts_on <= horizon.toISOString().slice(0, 10) &&
        (!row.ends_on || row.ends_on >= today)
      );
      const currentMemberships = activeMemberships.filter((row) =>
        row.starts_on <= today && (!row.ends_on || row.ends_on >= today)
      );
      const datedOpenings = currentMemberships.filter((row) =>
        !!row.ends_on && row.ends_on > today && row.ends_on <= horizon.toISOString().slice(0, 10)
      ).reduce((total, row) => total + Number(row.capacity_weight), 0);
      const historicalExits = groupMemberships.filter((row) =>
        ["completed", "cancelled"].includes(row.status) &&
        !!row.ends_on &&
        row.ends_on >= historyStart &&
        row.ends_on < today
      ).length;
      const historicalExitsPerWeek = historicalExits / 12;
      const targetStageReadiness = readiness.filter((row) =>
        row.program_id === group.program_id &&
        row.stage_id === group.stage_id &&
        (!row.next_review_on || row.next_review_on <= horizon.toISOString().slice(0, 10))
      );
      const previousStageId = group.stage_id ? previousStageById.get(group.stage_id) : null;
      const expectedTransfersIn = previousStageId
        ? readiness.filter((row) =>
            row.program_id === group.program_id &&
            row.stage_id === previousStageId &&
            ["ready", "invited"].includes(row.status)
          ).length
        : 0;
      const matchingWaitlist = waitlist.filter((entry) => {
        if (entry.program_id !== group.program_id) return false;
        if (entry.recommended_stage_id && group.stage_id && entry.recommended_stage_id !== group.stage_id) {
          return false;
        }
        const entryPreferences = preferencesByWaitlistId.get(entry.id) ?? [];
        if (!entryPreferences.length || !group.default_weekday) return true;
        return entryPreferences.some((preference) =>
          preference.weekday === group.default_weekday &&
          timeMatches(group.default_start_time, preference.starts_after, preference.ends_before)
        );
      });
      const groupAssignments = assignments.filter((row) =>
        row.group_id === group.id &&
        (!row.starts_on || row.starts_on <= horizon.toISOString().slice(0, 10)) &&
        (!row.ends_on || row.ends_on >= today)
      );
      const hasInstructor = groupAssignments.length > 0;
      const instructorAvailable = groupAssignments.some((assignment) =>
        isInstructorAvailable({
          assignment,
          availability,
          groupWeekday: group.default_weekday,
          groupStart: group.default_start_time,
          today,
          horizonEnd: horizon.toISOString().slice(0, 10)
        })
      );
      const resourceAvailable = isResourceAvailable({
        group,
        resources,
        sessions
      });
      const isTest = currentMemberships.length > 0 && currentMemberships.every((row) => row.is_test);
      const resource = group.default_resource_id
        ? resourceById.get(group.default_resource_id) ?? null
        : null;

      return {
        id: group.id,
        name: group.name,
        programId: group.program_id,
        stageId: group.stage_id,
        weekday: group.default_weekday,
        startsAt: group.default_start_time,
        resourceId: group.default_resource_id,
        locationId: resolveLocationId(group.default_resource_id, resourceById),
        fixedCapacity: resource?.capacity === null || resource?.capacity === undefined
          ? Number(group.capacity)
          : Math.min(Number(group.capacity), Number(resource.capacity)),
        occupiedCapacity: currentMemberships.reduce(
          (total, row) => total + Number(row.capacity_weight),
          0
        ),
        datedOpenings,
        historicalExitsPerWeek,
        graduationOpenings: targetStageReadiness.reduce(
          (total, row) => total + (row.status === "nearly_ready" ? 0.4 : 1),
          0
        ),
        waitlistDemand: matchingWaitlist.length,
        expectedTransfersIn,
        hasInstructor,
        instructorAvailable: hasInstructor && instructorAvailable,
        resourceAvailable,
        isTest
      };
    });

  return computeCapacityForecast({ groups: model, horizonWeeks: input.horizonWeeks });
}

type GroupRow = {
  id: string;
  name: string;
  program_id: string;
  stage_id: string | null;
  default_resource_id: string | null;
  default_weekday: number | null;
  default_start_time: string | null;
  capacity: number;
  status: string;
};
type MembershipRow = {
  id: string;
  group_id: string;
  participant_id: string;
  status: string;
  capacity_weight: number;
  starts_on: string;
  ends_on: string | null;
  is_test: boolean;
  journey_run_id: string | null;
};
type WaitlistRow = {
  id: string;
  program_id: string;
  recommended_stage_id: string | null;
  status: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type PreferenceRow = {
  waitlist_entry_id: string;
  weekday: number;
  starts_after: string | null;
  ends_before: string | null;
  preference_weight: number;
};
type ReadinessRow = {
  participant_id: string;
  program_id: string;
  stage_id: string;
  status: string;
  next_review_on: string | null;
  is_test: boolean;
  journey_run_id: string | null;
};
type StageRow = { id: string; program_id: string; sort_order: number };
type AssignmentRow = {
  group_id: string;
  instructor_user_id: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
};
type AvailabilityRow = {
  instructor_user_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  availability_type: "available" | "unavailable";
  starts_on: string | null;
  ends_on: string | null;
  status: string;
};
type ResourceRow = {
  id: string;
  parent_resource_id: string | null;
  kind: string;
  capacity: number | null;
  status: string;
};
type SessionRow = {
  id: string;
  group_id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  is_test: boolean;
};

function matchesFilters(
  group: GroupRow,
  filters: CapacityForecastFilters | undefined,
  assignments: AssignmentRow[],
  resources: Map<string, ResourceRow>
) {
  if (!filters) return true;
  if (filters.programId && group.program_id !== filters.programId) return false;
  if (filters.stageId && group.stage_id !== filters.stageId) return false;
  if (filters.weekday && group.default_weekday !== filters.weekday) return false;
  if (
    filters.locationId &&
    resolveLocationId(group.default_resource_id, resources) !== filters.locationId
  ) return false;
  if (
    filters.instructorId &&
    !assignments.some((row) =>
      row.group_id === group.id &&
      row.instructor_user_id === filters.instructorId &&
      row.status === "active"
    )
  ) return false;
  return true;
}

function isInstructorAvailable(input: {
  assignment: AssignmentRow;
  availability: AvailabilityRow[];
  groupWeekday: number | null;
  groupStart: string | null;
  today: string;
  horizonEnd: string;
}) {
  if (!input.groupWeekday || !input.groupStart) return true;
  const availabilityWeekday = input.groupWeekday === 7 ? 0 : input.groupWeekday;
  const matching = input.availability.filter((row) =>
    row.instructor_user_id === input.assignment.instructor_user_id &&
    row.weekday === availabilityWeekday &&
    (!row.starts_on || row.starts_on <= input.horizonEnd) &&
    (!row.ends_on || row.ends_on >= input.today)
  );
  if (!matching.length) return true;
  if (matching.some((row) =>
    row.availability_type === "unavailable" &&
    input.groupStart! >= row.starts_at &&
    input.groupStart! < row.ends_at
  )) return false;
  return matching.some((row) =>
    row.availability_type === "available" &&
    input.groupStart! >= row.starts_at &&
    input.groupStart! < row.ends_at
  );
}

function isResourceAvailable(input: {
  group: GroupRow;
  resources: ResourceRow[];
  sessions: SessionRow[];
}) {
  if (!input.group.default_resource_id) return false;
  const resource = input.resources.find((row) => row.id === input.group.default_resource_id);
  if (!resource || resource.status !== "active") return false;
  if (!input.group.default_weekday || !input.group.default_start_time) return true;
  const groupStart = input.group.default_start_time.slice(0, 5);

  const ownSessions = input.sessions.filter((session) => session.group_id === input.group.id);
  const conflicts = input.sessions.filter((session) =>
    session.group_id !== input.group.id &&
    session.resource_id === input.group.default_resource_id &&
    isoWeekday(session.starts_at) === input.group.default_weekday &&
    localTime(session.starts_at) === groupStart
  );
  return ownSessions.length > 0 || conflicts.length === 0;
}

function resolveLocationId(
  resourceId: string | null,
  resourceById: Map<string, ResourceRow>
) {
  let current = resourceId ? resourceById.get(resourceId) : null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.kind === "location") return current.id;
    seen.add(current.id);
    current = current.parent_resource_id
      ? resourceById.get(current.parent_resource_id)
      : undefined;
  }
  return null;
}

function timeMatches(
  groupStart: string | null,
  startsAfter: string | null,
  endsBefore: string | null
) {
  if (!groupStart) return true;
  if (startsAfter && groupStart < startsAfter) return false;
  if (endsBefore && groupStart >= endsBefore) return false;
  return true;
}

function isoWeekday(value: string) {
  const day = new Date(value).getDay();
  return day === 0 ? 7 : day;
}

function localTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Amsterdam"
  }).format(new Date(value));
}

function groupBy<T, K>(rows: T[], getKey: (row: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const row of rows) grouped.set(getKey(row), [...(grouped.get(getKey(row)) ?? []), row]);
  return grouped;
}

function allowTestData(requested: boolean) {
  if (!requested) return false;
  return ["development", "staging"].includes(
    String(process.env.APP_ENV ?? process.env.NODE_ENV).toLowerCase()
  );
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not forecast ${label}: ${error.message}`);
}

const dayMs = 86_400_000;
