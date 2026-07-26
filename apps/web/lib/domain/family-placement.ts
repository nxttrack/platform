import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeFamilyPlacementOptions,
  type FamilyChildPlacementCandidate,
  type FamilyPlacementOption
} from "./family-placement-contract";
import type { GroupRow } from "./core";
import type { WaitlistEntryRow, WaitlistPreferenceRow } from "./placement";
import { calculateSmartPlacementSuggestionsForEntries } from "./smart-placement";
import type { SmartPlacementSuggestion } from "./placement-contract";

export type FamilyPlacementData = {
  guardian: {
    id: string;
    name: string;
    email: string;
  };
  children: Array<{
    key: string;
    participantId: string | null;
    waitlistEntryId: string | null;
    name: string;
    state: "placed" | "waiting";
  }>;
  options: FamilyPlacementOption[];
};

export async function findFamilyPlacementOptions(input: {
  tenantId: string;
  guardianId: string;
  participantIds: string[];
}): Promise<FamilyPlacementData> {
  const admin = createAdminClient();
  const [profileResult, relationResult, legacyParticipantsResult] = await Promise.all([
    admin.from("profiles").select("id, full_name, email").eq("id", input.guardianId).maybeSingle(),
    admin
      .from("participant_guardians")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .eq("guardian_user_id", input.guardianId)
      .eq("status", "active"),
    admin
      .from("participants")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("guardian_user_id", input.guardianId)
      .neq("status", "archived")
  ]);
  assertFamilyResult(profileResult.error, "guardian profile");
  assertFamilyResult(relationResult.error, "guardian relations");
  assertFamilyResult(legacyParticipantsResult.error, "legacy guardian relations");
  if (!profileResult.data) throw new Error("Guardian not found.");

  const relatedIds = new Set([
    ...(relationResult.data ?? []).map((row) => row.participant_id),
    ...(legacyParticipantsResult.data ?? []).map((row) => row.id)
  ]);
  const requestedIds = input.participantIds.length
    ? input.participantIds.filter((participantId) => relatedIds.has(participantId))
    : [...relatedIds];
  const participantsResult = requestedIds.length
    ? await admin
        .from("participants")
        .select("id, display_name, birth_date, status, is_test, journey_run_id")
        .eq("tenant_id", input.tenantId)
        .in("id", requestedIds)
        .neq("status", "archived")
    : { data: [], error: null };
  assertFamilyResult(participantsResult.error, "family participants");

  const email = (profileResult.data.email ?? "").trim().toLowerCase();
  const [linkedWaitlistResult, emailWaitlistResult] = await Promise.all([
    admin
      .from("waitlist_entries")
      .select(waitlistSelect)
      .eq("tenant_id", input.tenantId)
      .eq("guardian_user_id", input.guardianId)
      .in("status", ["waiting", "reviewing"]),
    email
      ? admin
          .from("waitlist_entries")
          .select(waitlistSelect)
          .eq("tenant_id", input.tenantId)
          .ilike("parent_email", email)
          .in("status", ["waiting", "reviewing"])
      : Promise.resolve({ data: [], error: null })
  ]);
  assertFamilyResult(linkedWaitlistResult.error, "linked family waitlist");
  assertFamilyResult(emailWaitlistResult.error, "family waitlist by verified profile email");
  const waitlist = uniqueById([
    ...((linkedWaitlistResult.data ?? []) as WaitlistEntryRow[]),
    ...((emailWaitlistResult.data ?? []) as WaitlistEntryRow[])
  ]).filter((entry) => !entry.participant_id || requestedIds.length === 0 || requestedIds.includes(entry.participant_id));

  const waitlistIds = waitlist.map((entry) => entry.id);
  const [preferencesResult, groupsResult, membershipsResult, enrollmentsResult, resourcesResult] = await Promise.all([
    waitlistIds.length
      ? admin
          .from("waitlist_preferences")
          .select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight")
          .eq("tenant_id", input.tenantId)
          .in("waitlist_entry_id", waitlistIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active"),
    admin
      .from("group_memberships")
      .select("id, group_id, enrollment_id, participant_id, status, capacity_weight")
      .eq("tenant_id", input.tenantId)
      .in("status", ["active", "trial"]),
    requestedIds.length
      ? admin
          .from("enrollments")
          .select("id, participant_id, program_id, current_stage_id, status")
          .eq("tenant_id", input.tenantId)
          .in("participant_id", requestedIds)
          .in("status", ["active", "paused"])
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("resources")
      .select("id, parent_resource_id, name, kind, status")
      .eq("tenant_id", input.tenantId)
  ]);
  for (const [label, result] of [
    ["family preferences", preferencesResult],
    ["family groups", groupsResult],
    ["family memberships", membershipsResult],
    ["family enrollments", enrollmentsResult],
    ["family resources", resourcesResult]
  ] as const) assertFamilyResult(result.error, label);

  const groups = (groupsResult.data ?? []) as GroupRow[];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const resourceById = new Map(((resourcesResult.data ?? []) as ResourceRow[]).map((resource) => [resource.id, resource]));
  const capacityUsed = new Map<string, number>();
  for (const membership of membershipsResult.data ?? []) {
    capacityUsed.set(membership.group_id, (capacityUsed.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }

  const smart: Map<string, SmartPlacementSuggestion[]> = waitlist.length
    ? await calculateSmartPlacementSuggestionsForEntries({
        tenantId: input.tenantId,
        entries: waitlist,
        preferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[],
        groups
      })
    : new Map<string, SmartPlacementSuggestion[]>();
  const candidatesByChild = new Map<string, FamilyChildPlacementCandidate[]>();
  const children: FamilyPlacementData["children"] = [];

  for (const participant of participantsResult.data ?? []) {
    const childKey = `participant:${participant.id}`;
    const enrollmentIds = (enrollmentsResult.data ?? [])
      .filter((enrollment) => enrollment.participant_id === participant.id)
      .map((enrollment) => enrollment.id);
    const currentGroups = (membershipsResult.data ?? [])
      .filter((membership) => membership.participant_id === participant.id && enrollmentIds.includes(membership.enrollment_id))
      .flatMap((membership) => groupById.get(membership.group_id) ?? []);
    const candidates = currentGroups.flatMap((group): FamilyChildPlacementCandidate[] => {
      if (!group.default_weekday || !group.default_start_time || !group.default_end_time) return [];
      const location = resolveLocation(group.default_resource_id, resourceById);
      return [{
        participantId: participant.id,
        waitlistEntryId: null,
        participantName: participant.display_name,
        groupId: group.id,
        groupName: group.name,
        programId: group.program_id,
        stageId: group.stage_id,
        weekday: group.default_weekday,
        startsAt: group.default_start_time,
        endsAt: group.default_end_time,
        locationId: location?.id ?? null,
        locationName: location?.name ?? "Locatie niet bevestigd",
        score: 82,
        confidence: 0.98,
        capacityAvailable: Math.max(0, group.capacity - (capacityUsed.get(group.id) ?? 0)),
        fifoRank: null,
        fifoCohortSize: null,
        fifoOverrideRequired: false,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id,
        reasons: [{
          label: "Bestaand lesmoment",
          explanation: "Dit kind is al relationeel gekoppeld aan deze actieve lesgroep.",
          evidence: group.name,
          weight: 82
        }],
        blockers: []
      }];
    });
    if (candidates.length > 0) {
      candidatesByChild.set(childKey, candidates);
      children.push({ key: childKey, participantId: participant.id, waitlistEntryId: null, name: participant.display_name, state: "placed" });
    }
  }

  for (const entry of waitlist) {
    const childKey = entry.participant_id ? `participant:${entry.participant_id}` : `waitlist:${entry.id}`;
    const cohort = waitlist
      .filter((candidate) =>
        candidate.program_id === entry.program_id &&
        candidate.recommended_stage_id === entry.recommended_stage_id &&
        candidate.is_test === entry.is_test
      )
      .sort((left, right) => left.priority_date.localeCompare(right.priority_date) || left.created_at.localeCompare(right.created_at));
    const fifoRank = Math.max(1, cohort.findIndex((candidate) => candidate.id === entry.id) + 1);
    const candidates = (smart.get(entry.id) ?? []).slice(0, 5).flatMap((suggestion): FamilyChildPlacementCandidate[] => {
      const group = groupById.get(suggestion.groupId);
      if (!group?.default_weekday || !group.default_start_time || !group.default_end_time) return [];
      const location = resolveLocation(group.default_resource_id, resourceById);
      return [{
        participantId: entry.participant_id,
        waitlistEntryId: entry.id,
        participantName: entry.participant_name,
        groupId: group.id,
        groupName: group.name,
        programId: entry.program_id,
        stageId: entry.recommended_stage_id,
        weekday: group.default_weekday,
        startsAt: group.default_start_time,
        endsAt: group.default_end_time,
        locationId: location?.id ?? null,
        locationName: location?.name ?? "Locatie niet bevestigd",
        score: suggestion.score,
        confidence: suggestion.confidence,
        capacityAvailable: suggestion.capacitySnapshot.available,
        fifoRank,
        fifoCohortSize: cohort.length,
        fifoOverrideRequired: fifoRank > 1,
        isTest: entry.is_test,
        journeyRunId: entry.journey_run_id,
        reasons: suggestion.reasons.map((reason) => ({
          label: reason.label,
          explanation: reason.explanation,
          evidence: reason.evidence,
          weight: reason.weight
        })),
        blockers: suggestion.blockers.map((blocker) => ({
          code: blocker.code,
          label: blocker.label,
          explanation: blocker.explanation,
          evidence: blocker.evidence
        }))
      }];
    });
    candidatesByChild.set(childKey, candidates);
    if (!children.some((child) => child.key === childKey)) {
      children.push({ key: childKey, participantId: entry.participant_id, waitlistEntryId: entry.id, name: entry.participant_name, state: "waiting" });
    }
  }

  return {
    guardian: {
      id: input.guardianId,
      name: profileResult.data.full_name || profileResult.data.email || "Ouder/verzorger",
      email: profileResult.data.email ?? ""
    },
    children,
    options: computeFamilyPlacementOptions({
      guardianId: input.guardianId,
      candidatesByChild: children
        .flatMap((child) => candidatesByChild.has(child.key) ? [{ childKey: child.key, candidates: candidatesByChild.get(child.key)! }] : []),
      limit: 6
    })
  };
}

type ResourceRow = {
  id: string;
  parent_resource_id: string | null;
  name: string;
  kind: string;
  status: string;
};

const waitlistSelect =
  "id, intake_submission_id, participant_id, guardian_user_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, created_at, admin_notes, source, is_test, journey_run_id, test_metadata_json, eligible_from, minimum_age_blocked, waitlist_reason";

function resolveLocation(resourceId: string | null, resources: Map<string, ResourceRow>) {
  let current = resourceId ? resources.get(resourceId) : undefined;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.kind === "location") return current;
    current = current.parent_resource_id ? resources.get(current.parent_resource_id) : undefined;
  }
  return resourceId ? resources.get(resourceId) ?? null : null;
}

function uniqueById<Row extends { id: string }>(rows: Row[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function assertFamilyResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
