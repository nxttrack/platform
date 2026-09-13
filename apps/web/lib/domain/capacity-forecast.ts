import { addAmsterdamCalendarDays, toAmsterdamDate } from "../date/business-date";
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

export type CapacityForecastOperations = {
  waitlistCandidates: Array<{
    id: string;
    label: string;
    programId: string;
    stageId: string | null;
  }>;
  reservations: Array<{
    id: string;
    groupId: string;
    waitlistEntryId: string;
    capacityBucket: string;
    capacityWeight: number;
    status: string;
    reason: string;
    expiresAt: string;
    requestedAt: string;
    reviewReason: string | null;
  }>;
  accuracy: {
    evaluated: number;
    meanAbsoluteErrorDays: number | null;
    withinRangePercentage: number | null;
    noOpening: number;
    insufficientEvidence: number;
    modelVersions: string[];
  };
};

export async function getCapacityForecastOperations(
  tenantId: string
): Promise<CapacityForecastOperations> {
  const admin = createAdminClient();
  const [waitlist, reservations, accuracy] = await Promise.all([
    admin
      .from("waitlist_entries")
      .select("id, participant_name, program_id, recommended_stage_id, status")
      .eq("tenant_id", tenantId)
      .in("status", ["waiting", "reviewing", "offered"])
      .eq("is_test", false)
      .order("priority_date")
      .limit(250),
    admin
      .from("capacity_soft_reservations")
      .select("id, group_id, waitlist_entry_id, capacity_bucket, capacity_weight, status, reason, expires_at, requested_at, review_reason")
      .eq("tenant_id", tenantId)
      .in("status", ["pending_approval", "approved", "released", "expired", "rejected"])
      .order("requested_at", { ascending: false })
      .limit(100),
    admin
      .from("capacity_forecast_accuracy")
      .select("absolute_error_days, within_predicted_range, evaluation_status, model_version")
      .eq("tenant_id", tenantId)
      .order("evaluated_at", { ascending: false })
      .limit(500)
  ]);
  for (const [label, result] of [
    ["waitlist candidates", waitlist],
    ["soft reservations", reservations],
    ["forecast accuracy", accuracy]
  ] as const) assertResult(result.error, label);

  const accuracyRows = (accuracy.data ?? []) as AccuracyRow[];
  const measured = accuracyRows.filter((row) =>
    row.evaluation_status === "observed" && row.absolute_error_days !== null
  );
  return {
    waitlistCandidates: ((waitlist.data ?? []) as WaitlistCandidateRow[]).map((row) => ({
      id: row.id,
      label: row.participant_name,
      programId: row.program_id,
      stageId: row.recommended_stage_id
    })),
    reservations: ((reservations.data ?? []) as ReservationRow[]).map((row) => ({
      id: row.id,
      groupId: row.group_id,
      waitlistEntryId: row.waitlist_entry_id,
      capacityBucket: row.capacity_bucket,
      capacityWeight: Number(row.capacity_weight),
      status: row.status,
      reason: row.reason,
      expiresAt: row.expires_at,
      requestedAt: row.requested_at,
      reviewReason: row.review_reason
    })),
    accuracy: {
      evaluated: measured.length,
      meanAbsoluteErrorDays: measured.length
        ? roundOne(measured.reduce((total, row) => total + Number(row.absolute_error_days), 0) / measured.length)
        : null,
      withinRangePercentage: measured.length
        ? Math.round((measured.filter((row) => row.within_predicted_range).length / measured.length) * 100)
        : null,
      noOpening: accuracyRows.filter((row) => row.evaluation_status === "no_opening").length,
      insufficientEvidence: accuracyRows.filter((row) => row.evaluation_status === "insufficient_evidence").length,
      modelVersions: [...new Set(accuracyRows.map((row) => row.model_version))].sort()
    }
  };
}

export async function forecastCapacity(input: {
  tenantId: string;
  horizonWeeks: 4 | 8 | 12;
  filters?: CapacityForecastFilters;
  includeTestData?: boolean;
}): Promise<CapacityForecast[]> {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const admin = createAdminClient();
  const now = new Date();
  const today = toAmsterdamDate(now);
  const horizon = new Date(now.getTime() + input.horizonWeeks * 7 * dayMs);
  const historyStart = addAmsterdamCalendarDays(now, -12 * 7);

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
    sessionsResult,
    softReservationsResult,
    dataQualityResult
  ] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, program_id, stage_id, default_resource_id, default_weekday, default_start_time, default_end_time, capacity, hard_capacity, status")
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
      .lte("starts_at", horizon.toISOString()),
    admin
      .from("capacity_soft_reservations")
      .select("group_id, capacity_weight, status, expires_at")
      .eq("tenant_id", input.tenantId)
      .eq("status", "approved")
      .gt("expires_at", now.toISOString()),
    admin
      .from("data_quality_issues")
      .select("entity_id, severity, status")
      .eq("tenant_id", input.tenantId)
      .eq("entity_type", "group")
      .in("status", ["open", "ignored"])
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
    ["sessions", sessionsResult],
    ["soft reservations", softReservationsResult],
    ["data quality", dataQualityResult]
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
  const softReservations = (softReservationsResult.data ?? []) as SoftReservationRow[];
  const dataQualityIssues = (dataQualityResult.data ?? []) as DataQualityRow[];
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
        row.starts_on <= toAmsterdamDate(horizon) &&
        (!row.ends_on || row.ends_on >= today)
      );
      const currentMemberships = activeMemberships.filter((row) =>
        row.starts_on <= today && (!row.ends_on || row.ends_on >= today)
      );
      const datedOpenings = currentMemberships.filter((row) =>
        !!row.ends_on && row.ends_on > today && row.ends_on <= toAmsterdamDate(horizon)
      ).reduce((total, row) => total + Number(row.capacity_weight), 0);
      const historicalExits = groupMemberships.filter((row) =>
        ["completed", "cancelled"].includes(row.status) &&
        !!row.ends_on &&
        row.ends_on >= historyStart &&
        row.ends_on < today
      ).length;
      const historicalExitsPerWeek = historicalExits / 12;
      const currentParticipantIds = new Set(
        currentMemberships.map((membership) => membership.participant_id)
      );
      const targetStageReadiness = readiness.filter((row) =>
        row.program_id === group.program_id &&
        row.stage_id === group.stage_id &&
        currentParticipantIds.has(row.participant_id) &&
        (!row.next_review_on || row.next_review_on <= toAmsterdamDate(horizon))
      );
      const previousStageId = group.stage_id ? previousStageById.get(group.stage_id) : null;
      const eligibleTargetGroupCount = Math.max(
        1,
        groups.filter((candidate) =>
          candidate.program_id === group.program_id &&
          candidate.stage_id === group.stage_id
        ).length
      );
      const expectedTransfersIn = previousStageId
        ? roundOne(readiness.filter((row) =>
            row.program_id === group.program_id &&
            row.stage_id === previousStageId &&
            ["ready", "invited"].includes(row.status)
          ).length / eligibleTargetGroupCount)
        : 0;
      const waitlistDemand = roundOne(waitlist.reduce((total, entry) => {
        if (!waitlistEntryMatchesGroup(entry, group, preferencesByWaitlistId)) return total;
        const matchingGroupCount = Math.max(
          1,
          groups.filter((candidate) =>
            waitlistEntryMatchesGroup(entry, candidate, preferencesByWaitlistId)
          ).length
        );
        return total + 1 / matchingGroupCount;
      }, 0));
      const groupAssignments = assignments.filter((row) =>
        row.group_id === group.id &&
        (!row.starts_on || row.starts_on <= toAmsterdamDate(horizon)) &&
        (!row.ends_on || row.ends_on >= today)
      );
      const hasInstructor = groupAssignments.length > 0;
      const instructorAvailable = groupAssignments.some((assignment) =>
        isInstructorAvailable({
          assignment,
          availability,
          groupWeekday: group.default_weekday,
          groupStart: group.default_start_time,
          groupEnd: group.default_end_time,
          today,
          horizonEnd: toAmsterdamDate(horizon)
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
          ? Number(group.hard_capacity)
          : Math.min(Number(group.hard_capacity), Number(resource.capacity)),
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
        waitlistDemand,
        expectedTransfersIn,
        hasInstructor,
        instructorAvailable: hasInstructor && instructorAvailable,
        resourceAvailable,
        isTest,
        knownOpeningDates: currentMemberships.flatMap((row) =>
          row.ends_on && row.ends_on > today && row.ends_on <= toAmsterdamDate(horizon)
            ? [row.ends_on]
            : []
        ),
        readinessReviewDates: targetStageReadiness.flatMap((row) =>
          row.next_review_on &&
          row.next_review_on >= today &&
          row.next_review_on <= toAmsterdamDate(horizon)
            ? [row.next_review_on]
            : []
        ),
        activeSoftReservations: softReservations
          .filter((row) => row.group_id === group.id)
          .reduce((total, row) => total + Number(row.capacity_weight), 0),
        historySampleSize: historicalExits,
        dataQualityIssueCount: dataQualityIssues.filter((row) => row.entity_id === group.id).length
      };
    });

  return computeCapacityForecast({
    asOfDate: today,
    groups: model,
    horizonWeeks: input.horizonWeeks
  });
}

type GroupRow = {
  id: string;
  name: string;
  program_id: string;
  stage_id: string | null;
  default_resource_id: string | null;
  default_weekday: number | null;
  default_start_time: string | null;
  default_end_time: string | null;
  capacity: number;
  hard_capacity: number;
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
type SoftReservationRow = {
  group_id: string;
  capacity_weight: number;
  status: string;
  expires_at: string;
};
type DataQualityRow = {
  entity_id: string;
  severity: string;
  status: string;
};
type WaitlistCandidateRow = {
  id: string;
  participant_name: string;
  program_id: string;
  recommended_stage_id: string | null;
  status: string;
};
type ReservationRow = {
  id: string;
  group_id: string;
  waitlist_entry_id: string;
  capacity_bucket: string;
  capacity_weight: number;
  status: string;
  reason: string;
  expires_at: string;
  requested_at: string;
  review_reason: string | null;
};
type AccuracyRow = {
  absolute_error_days: number | null;
  within_predicted_range: boolean | null;
  evaluation_status: string;
  model_version: string;
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
  groupEnd: string | null;
  today: string;
  horizonEnd: string;
}) {
  if (!input.groupWeekday || !input.groupStart || !input.groupEnd) return true;
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
    timeRangesOverlap(input.groupStart!, input.groupEnd!, row.starts_at, row.ends_at)
  )) return false;
  const explicitlyAvailable = matching.filter((row) => row.availability_type === "available");
  if (!explicitlyAvailable.length) return true;
  return explicitlyAvailable.some((row) =>
    row.availability_type === "available" &&
    input.groupStart! >= row.starts_at &&
    input.groupEnd! <= row.ends_at
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
  if (
    !input.group.default_weekday ||
    !input.group.default_start_time ||
    !input.group.default_end_time
  ) return true;
  const groupStart = input.group.default_start_time.slice(0, 5);
  const groupEnd = input.group.default_end_time.slice(0, 5);

  const conflicts = input.sessions.filter((session) =>
    session.group_id !== input.group.id &&
    session.resource_id === input.group.default_resource_id &&
    isoWeekday(session.starts_at) === input.group.default_weekday &&
    timeRangesOverlap(
      groupStart,
      groupEnd,
      localTime(session.starts_at),
      localTime(session.ends_at)
    )
  );
  return conflicts.length === 0;
}

function waitlistEntryMatchesGroup(
  entry: WaitlistRow,
  group: GroupRow,
  preferencesByWaitlistId: Map<string, PreferenceRow[]>
) {
  if (entry.program_id !== group.program_id) return false;
  if (entry.recommended_stage_id && entry.recommended_stage_id !== group.stage_id) {
    return false;
  }
  const entryPreferences = preferencesByWaitlistId.get(entry.id) ?? [];
  if (!entryPreferences.length || !group.default_weekday) return true;
  return entryPreferences.some((preference) =>
    preference.weekday === group.default_weekday &&
    timeMatches(group.default_start_time, preference.starts_after, preference.ends_before)
  );
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

function timeRangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function isoWeekday(value: string) {
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(value));
  return weekdayByLabel[label] ?? 0;
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
const weekdayByLabel: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7
};

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
