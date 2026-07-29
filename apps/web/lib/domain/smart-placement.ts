import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeSmartPlacementSuggestions,
  type SmartPlacementEntry,
  type SmartPlacementGroup,
  type SmartPlacementSuggestion
} from "./placement-contract";
import type { WaitlistEntryRow, WaitlistPreferenceRow } from "./placement";
import type { GroupRow } from "./core";

export async function calculateSmartPlacementSuggestionsForEntries(input: {
  tenantId: string;
  entries: WaitlistEntryRow[];
  preferences: WaitlistPreferenceRow[];
  groups: GroupRow[];
  persist?: boolean;
}) {
  const model = await loadSmartPlacementModel(input.tenantId, input.entries, input.groups);
  const preferencesByEntry = groupBy(input.preferences, (preference) => preference.waitlist_entry_id);
  const results = new Map<string, SmartPlacementSuggestion[]>();

  for (const entry of input.entries) {
    const cohort = input.entries
      .filter((candidate) =>
        candidate.program_id === entry.program_id &&
        candidate.recommended_stage_id === entry.recommended_stage_id &&
        candidate.is_test === entry.is_test &&
        ["waiting", "reviewing"].includes(candidate.status) &&
        !candidate.minimum_age_blocked
      )
      .sort((left, right) =>
        left.priority_date.localeCompare(right.priority_date) ||
        left.created_at.localeCompare(right.created_at)
      );
    const preferenceRows = preferencesByEntry.get(entry.id) ?? [];
    const selectedGroupId = entry.intake_submission_id
      ? model.selectedGroupByIntake.get(entry.intake_submission_id) ?? null
      : null;
    const preferredLocationId = selectedGroupId
      ? model.locationByGroup.get(selectedGroupId) ?? null
      : null;
    const smartEntry: SmartPlacementEntry = {
      id: entry.id,
      programId: entry.program_id,
      stageId: entry.recommended_stage_id,
      status: entry.status,
      birthDate: entry.participant_birth_date,
      eligibleFrom: entry.eligible_from,
      minimumAgeBlocked: entry.minimum_age_blocked,
      preferredDays: [...new Set(preferenceRows.map((preference) => preference.weekday))],
      preferredTimeWindows: preferenceRows.map((preference) => ({
        weekday: preference.weekday,
        startsAfter: preference.starts_after,
        endsBefore: preference.ends_before
      })),
      preferredLocationId,
      fifoRank: Math.max(1, cohort.findIndex((candidate) => candidate.id === entry.id) + 1),
      fifoCohortSize: Math.max(1, cohort.length),
      paymentBlocked: false,
      siblingGroupIds: model.siblingGroupsByEmail.get(entry.parent_email.trim().toLowerCase()) ?? []
    };
    const suggestions = computeSmartPlacementSuggestions({
      entry: smartEntry,
      groups: (entry.is_test ? model.testGroups : model.groups).filter((group) => group.programId === entry.program_id),
      now: model.now
    });
    results.set(entry.id, suggestions);
  }

  if (input.persist) {
    await persistSuggestions(input.tenantId, input.entries, results, model.now);
  }

  return results;
}

export async function validateSmartPlacementOffer(input: {
  tenantId: string;
  entry: WaitlistEntryRow;
  groupId: string;
  allowOfferedStatus?: boolean;
}) {
  const groupsResult = await createAdminClient()
    .from("groups")
    .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.groupId)
    .eq("status", "active")
    .maybeSingle();
  if (groupsResult.error || !groupsResult.data) return null;

  const preferencesResult = await createAdminClient()
    .from("waitlist_preferences")
    .select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight")
    .eq("tenant_id", input.tenantId)
    .eq("waitlist_entry_id", input.entry.id);
  if (preferencesResult.error) return null;

  const suggestions = await calculateSmartPlacementSuggestionsForEntries({
    tenantId: input.tenantId,
    entries: [input.allowOfferedStatus ? { ...input.entry, status: "waiting" } : input.entry],
    preferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[],
    groups: [groupsResult.data as GroupRow]
  });
  return suggestions.get(input.entry.id)?.find((suggestion) => suggestion.groupId === input.groupId) ?? null;
}

async function loadSmartPlacementModel(tenantId: string, entries: WaitlistEntryRow[], groups: GroupRow[]) {
  const admin = createAdminClient();
  const now = new Date();
  const eightWeeks = new Date(now.getTime() + 56 * dayMs);
  const intakeIds = entries.flatMap((entry) => entry.intake_submission_id ? [entry.intake_submission_id] : []);
  const emails = [...new Set(entries.map((entry) => entry.parent_email.trim().toLowerCase()))];
  const [
    membershipsResult,
    participantsResult,
    assignmentsResult,
    sessionsResult,
    sessionAssignmentsResult,
    resourcesResult,
    readinessResult,
    intakesResult,
    profilesResult
  ] = await Promise.all([
    admin
      .from("group_memberships")
      .select("id, group_id, participant_id, status, capacity_weight, ends_on, is_test")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "trial"]),
    admin
      .from("participants")
      .select("id, guardian_user_id, birth_date, is_test")
      .eq("tenant_id", tenantId),
    admin
      .from("group_instructor_assignments")
      .select("group_id, instructor_user_id, status, starts_on, ends_on")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, is_test")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", eightWeeks.toISOString()),
    admin
      .from("session_instructor_assignments")
      .select("session_id, instructor_user_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    admin
      .from("resources")
      .select("id, parent_resource_id, kind, status")
      .eq("tenant_id", tenantId),
    admin
      .from("graduation_readiness")
      .select("participant_id, status, next_review_on, is_test")
      .eq("tenant_id", tenantId)
      .in("status", ["nearly_ready", "ready", "invited"]),
    intakeIds.length
      ? admin
          .from("intake_submissions")
          .select("id, selected_group_id")
          .eq("tenant_id", tenantId)
          .in("id", intakeIds)
      : Promise.resolve({ data: [], error: null }),
    emails.length
      ? admin
          .from("profiles")
          .select("id, email")
          .in("email", emails)
      : Promise.resolve({ data: [], error: null })
  ]);

  for (const [label, result] of [
    ["memberships", membershipsResult],
    ["participants", participantsResult],
    ["group instructor assignments", assignmentsResult],
    ["sessions", sessionsResult],
    ["session instructor assignments", sessionAssignmentsResult],
    ["resources", resourcesResult],
    ["graduation readiness", readinessResult],
    ["intake selections", intakesResult],
    ["guardian profiles", profilesResult]
  ] as const) {
    assertSmartPlacementResult(result.error, label);
  }

  const memberships = (membershipsResult.data ?? []) as Array<{
    group_id: string;
    participant_id: string;
    status: string;
    capacity_weight: number;
    ends_on: string | null;
    is_test: boolean;
  }>;
  const participants = (participantsResult.data ?? []) as Array<{
    id: string;
    guardian_user_id: string | null;
    birth_date: string | null;
    is_test: boolean;
  }>;
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const sessions = (sessionsResult.data ?? []) as Array<{
    id: string;
    group_id: string;
    resource_id: string | null;
    starts_at: string;
    ends_at: string;
    status: string;
    is_test: boolean;
  }>;
  const assignments = (assignmentsResult.data ?? []) as Array<{
    group_id: string;
    instructor_user_id: string;
    status: string;
    starts_on: string | null;
    ends_on: string | null;
  }>;
  const sessionAssignments = (sessionAssignmentsResult.data ?? []) as Array<{
    session_id: string;
    instructor_user_id: string;
    status: string;
  }>;
  const assignmentsBySession = groupBy(sessionAssignments, (assignment) => assignment.session_id);
  const resources = (resourcesResult.data ?? []) as Array<{
    id: string;
    parent_resource_id: string | null;
    kind: string;
    status: string;
  }>;
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  const readinessByParticipant = new Map(
    ((readinessResult.data ?? []) as Array<{ participant_id: string; status: string; next_review_on: string | null; is_test: boolean }>)
      .filter((readiness) => !readiness.is_test)
      .map((readiness) => [readiness.participant_id, readiness])
  );
  const usedByGroup = new Map<string, number>();
  const usedByGroupIncludingTest = new Map<string, number>();
  const agesByGroup = new Map<string, number[]>();
  const exits4ByGroup = new Map<string, number>();
  const exits8ByGroup = new Map<string, number>();
  for (const membership of memberships) {
    usedByGroupIncludingTest.set(
      membership.group_id,
      (usedByGroupIncludingTest.get(membership.group_id) ?? 0) + Number(membership.capacity_weight)
    );
    if (membership.is_test) continue;
    usedByGroup.set(membership.group_id, (usedByGroup.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
    const participant = participantById.get(membership.participant_id);
    const age = ageYears(participant?.birth_date ?? null, now);
    if (age !== null) agesByGroup.set(membership.group_id, [...(agesByGroup.get(membership.group_id) ?? []), age]);
    const readiness = readinessByParticipant.get(membership.participant_id);
    const exitDate = membership.ends_on ?? readiness?.next_review_on ?? null;
    if (exitDate && exitDate <= eightWeeks.toISOString().slice(0, 10)) {
      exits8ByGroup.set(membership.group_id, (exits8ByGroup.get(membership.group_id) ?? 0) + 1);
      if (exitDate <= new Date(now.getTime() + 28 * dayMs).toISOString().slice(0, 10)) {
        exits4ByGroup.set(membership.group_id, (exits4ByGroup.get(membership.group_id) ?? 0) + 1);
      }
    }
  }

  const groupSessions = groupBy(sessions.filter((session) => !session.is_test), (session) => session.group_id);
  const locationByGroup = new Map(groups.map((group) => [
    group.id,
    group.default_resource_id ? resolveLocation(group.default_resource_id, resourceById) : null
  ]));
  const smartGroups: SmartPlacementGroup[] = groups
    .filter((group) => group.status === "active")
    .map((group) => {
      const futureSessions = groupSessions.get(group.id) ?? [];
      const effectiveResourceIds = futureSessions.length
        ? futureSessions.map((session) => session.resource_id ?? group.default_resource_id)
        : [group.default_resource_id];
      const hasResource = effectiveResourceIds.every((resourceId) =>
        !!resourceId &&
        resourceById.get(resourceId)?.status === "active" &&
        resourceById.get(resourceId)?.kind !== "location"
      );
      const resourceConflict = futureSessions.some((session) =>
        !!(session.resource_id ?? group.default_resource_id) &&
        sessions.some((other) =>
          other.id !== session.id &&
          !other.is_test &&
          (other.resource_id ?? groups.find((candidate) => candidate.id === other.group_id)?.default_resource_id) ===
            (session.resource_id ?? group.default_resource_id) &&
          other.starts_at < session.ends_at &&
          other.ends_at > session.starts_at
        )
      );
      const activeGroupAssignments = assignments.filter((assignment) =>
        assignment.group_id === group.id &&
        (!assignment.starts_on || assignment.starts_on <= now.toISOString().slice(0, 10)) &&
        (!assignment.ends_on || assignment.ends_on >= now.toISOString().slice(0, 10))
      );
      const hasSessionInstructor = futureSessions.some((session) => (assignmentsBySession.get(session.id)?.length ?? 0) > 0);
      const instructorIds = new Set([
        ...activeGroupAssignments.map((assignment) => assignment.instructor_user_id),
        ...futureSessions.flatMap((session) => (assignmentsBySession.get(session.id) ?? []).map((assignment) => assignment.instructor_user_id))
      ]);
      const instructorOverloaded = futureSessions.some((session) =>
        [...instructorIds].some((instructorId) =>
          sessions.some((other) =>
            other.id !== session.id &&
            !other.is_test &&
            (
              (assignmentsBySession.get(other.id) ?? []).some((assignment) => assignment.instructor_user_id === instructorId) ||
              assignments.some((assignment) =>
                assignment.group_id === other.group_id &&
                assignment.instructor_user_id === instructorId &&
                (!assignment.starts_on || assignment.starts_on <= other.starts_at.slice(0, 10)) &&
                (!assignment.ends_on || assignment.ends_on >= other.starts_at.slice(0, 10))
              )
            ) &&
            other.starts_at < session.ends_at &&
            other.ends_at > session.starts_at
          )
        )
      );
      const ages = agesByGroup.get(group.id) ?? [];
      return {
        id: group.id,
        name: group.name,
        programId: group.program_id,
        stageId: group.stage_id,
        weekday: group.default_weekday,
        startsAt: group.default_start_time,
        locationId: locationByGroup.get(group.id) ?? null,
        fixedCapacity: group.capacity,
        usedCapacity: usedByGroup.get(group.id) ?? 0,
        projectedExits4Weeks: exits4ByGroup.get(group.id) ?? 0,
        projectedExits8Weeks: exits8ByGroup.get(group.id) ?? 0,
        hasInstructor: activeGroupAssignments.length > 0 || hasSessionInstructor,
        instructorOverloaded,
        hasResource,
        resourceConflict,
        averageAgeYears: ages.length ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null,
        ageSampleSize: ages.length
      };
    });
  const testGroups = smartGroups.map((group) => ({
    ...group,
    usedCapacity: usedByGroupIncludingTest.get(group.id) ?? 0
  }));

  const selectedGroupByIntake = new Map(
    ((intakesResult.data ?? []) as Array<{ id: string; selected_group_id: string | null }>).map((intake) => [
      intake.id,
      intake.selected_group_id
    ])
  );
  const profileIdsByEmail = new Map(
    ((profilesResult.data ?? []) as Array<{ id: string; email: string | null }>).flatMap((profile) =>
      profile.email ? [[profile.email.trim().toLowerCase(), profile.id] as const] : []
    )
  );
  const membershipGroupsByParticipant = groupBy(
    memberships.filter((membership) => !membership.is_test),
    (membership) => membership.participant_id
  );
  const siblingGroupsByEmail = new Map<string, string[]>();
  for (const email of emails) {
    const guardianId = profileIdsByEmail.get(email);
    if (!guardianId) continue;
    const participantIds = participants
      .filter((participant) => participant.guardian_user_id === guardianId && !participant.is_test)
      .map((participant) => participant.id);
    siblingGroupsByEmail.set(email, [
      ...new Set(participantIds.flatMap((participantId) =>
        (membershipGroupsByParticipant.get(participantId) ?? []).map((membership) => membership.group_id)
      ))
    ]);
  }

  return {
    groups: smartGroups,
    testGroups,
    locationByGroup,
    now: now.toISOString(),
    selectedGroupByIntake,
    siblingGroupsByEmail
  };
}

async function persistSuggestions(
  tenantId: string,
  entries: WaitlistEntryRow[],
  results: Map<string, SmartPlacementSuggestion[]>,
  computedAt: string
) {
  const admin = createAdminClient();
  const entryIds = entries.map((entry) => entry.id);
  if (entryIds.length > 0) {
    const expireResult = await admin
      .from("placement_suggestions")
      .update({ status: "expired" })
      .eq("tenant_id", tenantId)
      .eq("status", "suggested")
      .in("waitlist_entry_id", entryIds);
    assertSmartPlacementResult(expireResult.error, "expired placement suggestions");
  }
  const rows = entries.flatMap((entry) =>
    (results.get(entry.id) ?? []).map((suggestion) => ({
      tenant_id: tenantId,
      waitlist_entry_id: entry.id,
      intake_submission_id: entry.intake_submission_id,
      target_program_id: entry.program_id,
      target_stage_id: entry.recommended_stage_id,
      group_id: suggestion.groupId,
      score: suggestion.score,
      confidence: suggestion.confidence,
      status: "suggested",
      reasons_json: suggestion.reasons,
      blockers_json: suggestion.blockers,
      capacity_snapshot_json: suggestion.capacitySnapshot,
      source: entry.is_test ? "journey_simulation_bot" : "smart_placement_2",
      is_test: entry.is_test,
      journey_run_id: entry.journey_run_id,
      computed_at: computedAt,
      expires_at: new Date(new Date(computedAt).getTime() + dayMs).toISOString()
    }))
  );
  if (rows.length > 0) {
    const insertResult = await admin.from("placement_suggestions").insert(rows);
    assertSmartPlacementResult(insertResult.error, "placement suggestions");
  }
}

function resolveLocation(
  resourceId: string,
  resourceById: Map<string, { id: string; parent_resource_id: string | null; kind: string; status: string }>
) {
  let current = resourceById.get(resourceId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "location") return current.id;
    current = current.parent_resource_id ? resourceById.get(current.parent_resource_id) : undefined;
  }
  return resourceId;
}

function ageYears(birthDate: string | null, now: Date) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) return null;
  return (now.getTime() - birth.getTime()) / (365.2425 * dayMs);
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function assertSmartPlacementResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not calculate ${label}: ${error.message}`);
}

const dayMs = 24 * 60 * 60 * 1000;
