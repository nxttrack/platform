import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  calculateEmptySeatRecovery,
  type EmptySeatCandidateInput,
  type EmptySeatOpening
} from "./empty-seat-recovery-contract";

export type EmptySeatRecoveryView = {
  id: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  startsAt: string;
  endsAt: string;
  locationName: string;
  availableSeats: number;
  cancellationSeats: number;
  candidateCount: number;
  actionableCandidateCount: number;
  recoveryBand: string;
  confidence: number;
  summary: string;
  reasons: string[];
  status: string;
  generatedAt: string;
  candidates: Array<{
    id: string;
    type: "waitlist" | "makeup";
    displayName: string;
    score: number;
    confidence: number;
    fifoRank: number | null;
    reasons: string[];
    blockers: string[];
    familyContext: { sameDay?: boolean; sameLocation?: boolean };
    suggestedAction: string;
    status: string;
    actionable: boolean;
    sourceHref: string;
  }>;
};

export async function getEmptySeatRecoveryData(tenantId: string): Promise<{
  snapshots: EmptySeatRecoveryView[];
  metrics: { openSeats: number; actionable: number; urgent: number; recoveryRate: number };
}> {
  const admin = createAdminClient();
  const snapshotsResult = await admin
    .from("empty_seat_recovery_snapshots")
    .select("id, session_id, group_id, available_seats, cancellation_seats, candidate_count, actionable_candidate_count, recovery_band, confidence, summary, reasons_json, status, generated_at")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "reviewed", "resolved"])
    .order("generated_at", { ascending: false })
    .limit(50);
  assertResult(snapshotsResult.error, "recovery snapshots");
  const snapshots = snapshotsResult.data ?? [];
  const snapshotIds = snapshots.map((row) => row.id);
  const sessionIds = [...new Set(snapshots.map((row) => row.session_id))];
  const groupIds = [...new Set(snapshots.map((row) => row.group_id))];
  const [candidatesResult, sessionsResult, groupsResult] = await Promise.all([
    snapshotIds.length
      ? admin.from("empty_seat_recovery_candidates").select("id, snapshot_id, candidate_type, display_name, score, confidence, fifo_rank, reasons_json, blockers_json, family_context_json, suggested_action, status, waitlist_entry_id, catch_up_credit_id").eq("tenant_id", tenantId).in("snapshot_id", snapshotIds).order("score", { ascending: false })
      : Promise.resolve(emptyResult()),
    sessionIds.length
      ? admin.from("sessions").select("id, starts_at, ends_at, resource_id").eq("tenant_id", tenantId).in("id", sessionIds)
      : Promise.resolve(emptyResult()),
    groupIds.length
      ? admin.from("groups").select("id, name, default_resource_id").eq("tenant_id", tenantId).in("id", groupIds)
      : Promise.resolve(emptyResult())
  ]);
  assertResult(candidatesResult.error, "recovery candidates");
  assertResult(sessionsResult.error, "recovery sessions");
  assertResult(groupsResult.error, "recovery groups");
  const resourceIds = [...new Set([
    ...(sessionsResult.data ?? []).map((row) => row.resource_id),
    ...(groupsResult.data ?? []).map((row) => row.default_resource_id)
  ].filter(Boolean))] as string[];
  const resourcesResult = resourceIds.length
    ? await admin.from("resources").select("id, name").eq("tenant_id", tenantId).in("id", resourceIds)
    : emptyResult();
  assertResult(resourcesResult.error, "recovery resources");

  const candidatesBySnapshot = groupBy(candidatesResult.data ?? [], (row) => row.snapshot_id);
  const sessionById = new Map((sessionsResult.data ?? []).map((row) => [row.id, row]));
  const groupById = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
  const resourceById = new Map((resourcesResult.data ?? []).map((row) => [row.id, row.name]));
  const views = snapshots.flatMap((snapshot): EmptySeatRecoveryView[] => {
    const session = sessionById.get(snapshot.session_id);
    const group = groupById.get(snapshot.group_id);
    if (!session || !group) return [];
    return [{
      id: snapshot.id,
      sessionId: snapshot.session_id,
      groupId: snapshot.group_id,
      groupName: group.name,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      locationName: resourceById.get(session.resource_id ?? group.default_resource_id) ?? "Locatie niet ingesteld",
      availableSeats: snapshot.available_seats,
      cancellationSeats: snapshot.cancellation_seats,
      candidateCount: snapshot.candidate_count,
      actionableCandidateCount: snapshot.actionable_candidate_count,
      recoveryBand: snapshot.recovery_band,
      confidence: Number(snapshot.confidence),
      summary: snapshot.summary,
      reasons: toStringArray(snapshot.reasons_json),
      status: snapshot.status,
      generatedAt: snapshot.generated_at,
      candidates: (candidatesBySnapshot.get(snapshot.id) ?? []).map((candidate) => ({
        id: candidate.id,
        type: candidate.candidate_type as "waitlist" | "makeup",
        displayName: candidate.display_name,
        score: candidate.score,
        confidence: Number(candidate.confidence),
        fifoRank: candidate.fifo_rank,
        reasons: toStringArray(candidate.reasons_json),
        blockers: toStringArray(candidate.blockers_json),
        familyContext: toObject(candidate.family_context_json),
        suggestedAction: candidate.suggested_action,
        status: candidate.status,
        actionable: toStringArray(candidate.blockers_json).length === 0,
        sourceHref: candidate.candidate_type === "makeup"
          ? `/admin/inhaalmarkt?sessie=${encodeURIComponent(snapshot.session_id)}`
          : `/admin/wachtlijst?entry=${encodeURIComponent(candidate.waitlist_entry_id ?? "")}`
      }))
    }];
  });
  const open = views.filter((row) => row.status !== "resolved");
  const openSeats = open.reduce((sum, row) => sum + row.availableSeats, 0);
  const resolved = views.filter((row) => row.status === "resolved").length;
  return {
    snapshots: views,
    metrics: {
      openSeats,
      actionable: open.reduce((sum, row) => sum + row.actionableCandidateCount, 0),
      urgent: open.filter((row) => row.recoveryBand === "within_24h").length,
      recoveryRate: views.length ? Math.round((resolved / views.length) * 100) : 0
    }
  };
}

export async function refreshEmptySeatRecovery(tenantId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);
  const [sessionsResult, groupsResult, membershipsResult, cancellationsResult, holdsResult, waitlistResult, preferencesResult, creditsResult, enrollmentsResult, participantsResult, participantPreferencesResult] = await Promise.all([
    admin.from("sessions").select("id, group_id, resource_id, starts_at, ends_at, capacity_override, status, is_test").eq("tenant_id", tenantId).eq("status", "scheduled").eq("is_test", false).gte("starts_at", now.toISOString()).lte("starts_at", horizon.toISOString()).order("starts_at"),
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, default_weekday, capacity, status").eq("tenant_id", tenantId).eq("status", "active"),
    admin.from("group_memberships").select("group_id, participant_id, capacity_weight, starts_on, ends_on, status, is_test").eq("tenant_id", tenantId).in("status", ["active", "trial"]).eq("is_test", false),
    admin.from("lesson_cancellations").select("session_id, participant_id, status").eq("tenant_id", tenantId).in("status", ["accepted", "late_cancelled"]),
    admin.from("catch_up_requests").select("preferred_session_id, assigned_session_id, participant_id, credit_id, status").eq("tenant_id", tenantId).in("status", ["requested", "approved"]),
    admin.from("waitlist_entries").select("id, program_id, recommended_stage_id, participant_name, priority_date, created_at, status, guardian_user_id, is_test, minimum_age_blocked").eq("tenant_id", tenantId).eq("is_test", false).eq("minimum_age_blocked", false).in("status", ["waiting", "reviewing"]),
    admin.from("waitlist_preferences").select("waitlist_entry_id, weekday, starts_after, ends_before").eq("tenant_id", tenantId),
    admin.from("catch_up_credits").select("id, participant_id, enrollment_id, status, expires_on").eq("tenant_id", tenantId).eq("status", "available"),
    admin.from("enrollments").select("id, participant_id, guardian_user_id, program_id, current_stage_id, status, is_test").eq("tenant_id", tenantId).eq("is_test", false).in("status", ["active", "paused"]),
    admin.from("participants").select("id, display_name, guardian_user_id, is_test").eq("tenant_id", tenantId).eq("is_test", false),
    admin.from("participant_schedule_preferences").select("participant_id, weekday, starts_after, ends_before").eq("tenant_id", tenantId).eq("is_test", false)
  ]);
  for (const [label, result] of [
    ["sessions", sessionsResult], ["groups", groupsResult], ["memberships", membershipsResult],
    ["cancellations", cancellationsResult], ["holds", holdsResult], ["waitlist", waitlistResult],
    ["waitlist preferences", preferencesResult], ["credits", creditsResult], ["enrollments", enrollmentsResult],
    ["participants", participantsResult], ["participant preferences", participantPreferencesResult]
  ] as const) assertResult(result.error, `empty-seat ${label}`);

  const groups = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
  const membershipsByGroup = groupBy(membershipsResult.data ?? [], (row) => row.group_id);
  const cancellationsBySession = groupBy(cancellationsResult.data ?? [], (row) => row.session_id);
  const holdsBySession = groupBy(holdsResult.data ?? [], (row) => row.assigned_session_id ?? row.preferred_session_id);
  const waitPreferences = groupBy(preferencesResult.data ?? [], (row) => row.waitlist_entry_id);
  const participantPreferences = groupBy(participantPreferencesResult.data ?? [], (row) => row.participant_id);
  const enrollmentById = new Map((enrollmentsResult.data ?? []).map((row) => [row.id, row]));
  const participantById = new Map((participantsResult.data ?? []).map((row) => [row.id, row]));

  const familyContext = buildFamilyContext({
    participants: participantsResult.data ?? [],
    enrollments: enrollmentsResult.data ?? [],
    memberships: membershipsResult.data ?? [],
    groups
  });
  const fifoRanks = calculateFifoRanks(waitlistResult.data ?? []);
  const waitlistCandidates: Array<EmptySeatCandidateInput & { waitlistEntryId: string; creditId: null; participantId: null }> = (waitlistResult.data ?? []).map((row) => ({
    id: `waitlist:${row.id}`,
    type: "waitlist",
    displayName: row.participant_name,
    programId: row.program_id,
    stageId: row.recommended_stage_id,
    preferredWeekdays: (waitPreferences.get(row.id) ?? []).map((item) => item.weekday),
    preferredWindows: (waitPreferences.get(row.id) ?? []).map((item) => ({ weekday: item.weekday, startsAfter: item.starts_after, endsBefore: item.ends_before })),
    fifoRank: fifoRanks.get(row.id) ?? null,
    creditExpiresOn: null,
    familyGroupDays: familyContext.get(row.guardian_user_id)?.days ?? [],
    familyLocationIds: familyContext.get(row.guardian_user_id)?.locations ?? [],
    isTest: row.is_test,
    waitlistEntryId: row.id,
    creditId: null,
    participantId: null
  }));
  const makeupCandidates: Array<EmptySeatCandidateInput & { waitlistEntryId: null; creditId: string; participantId: string }> = (creditsResult.data ?? []).flatMap((credit) => {
    const enrollment = enrollmentById.get(credit.enrollment_id);
    const participant = participantById.get(credit.participant_id);
    if (!enrollment || !participant) return [];
    return [{
      id: `makeup:${credit.id}`,
      type: "makeup" as const,
      displayName: participant.display_name,
      programId: enrollment.program_id,
      stageId: enrollment.current_stage_id,
      preferredWeekdays: (participantPreferences.get(participant.id) ?? []).map((item) => item.weekday),
      preferredWindows: (participantPreferences.get(participant.id) ?? []).map((item) => ({ weekday: item.weekday, startsAfter: item.starts_after, endsBefore: item.ends_before })),
      fifoRank: null,
      creditExpiresOn: credit.expires_on,
      familyGroupDays: familyContext.get(enrollment.guardian_user_id ?? participant.guardian_user_id)?.days ?? [],
      familyLocationIds: familyContext.get(enrollment.guardian_user_id ?? participant.guardian_user_id)?.locations ?? [],
      isTest: false,
      waitlistEntryId: null,
      creditId: credit.id,
      participantId: participant.id
    }];
  });
  const candidateSourceById = new Map([...waitlistCandidates, ...makeupCandidates].map((candidate) => [candidate.id, candidate]));
  const results: Array<{ opening: EmptySeatOpening; result: NonNullable<ReturnType<typeof calculateEmptySeatRecovery>> }> = [];

  for (const session of sessionsResult.data ?? []) {
    const group = groups.get(session.group_id);
    if (!group) continue;
    const sessionDay = session.starts_at.slice(0, 10);
    const activeMembers = (membershipsByGroup.get(group.id) ?? []).filter((row) => row.starts_on <= sessionDay && (!row.ends_on || row.ends_on >= sessionDay));
    const activeParticipantIds = new Set(activeMembers.map((row) => row.participant_id));
    const cancelled = new Set((cancellationsBySession.get(session.id) ?? []).filter((row) => activeParticipantIds.has(row.participant_id)).map((row) => row.participant_id));
    const occupied = activeMembers.reduce((sum, row) => sum + Number(row.capacity_weight), 0);
    const opening: EmptySeatOpening = {
      id: session.id,
      sessionId: session.id,
      groupId: group.id,
      programId: group.program_id,
      stageId: group.stage_id,
      locationId: session.resource_id ?? group.default_resource_id,
      startsAt: session.starts_at,
      capacity: session.capacity_override ?? group.capacity,
      occupied,
      cancellationSeats: cancelled.size,
      activeHolds: (holdsBySession.get(session.id) ?? []).length
    };
    const result = calculateEmptySeatRecovery({ opening, candidates: [...waitlistCandidates, ...makeupCandidates], now });
    if (result) results.push({ opening, result });
  }

  await admin.from("empty_seat_recovery_snapshots").update({ status: "expired" }).eq("tenant_id", tenantId).eq("status", "open");
  let created = 0;
  for (const item of results) {
    const fingerprint = createHash("sha256").update(JSON.stringify({
      session: item.opening.sessionId,
      available: item.result.availableSeats,
      candidates: item.result.candidates.map((candidate) => [candidate.id, candidate.score, candidate.blockers])
    })).digest("hex");
    const expiresAt = new Date(Math.min(new Date(item.opening.startsAt).getTime(), now.getTime() + 6 * 3_600_000)).toISOString();
    const snapshotResult = await admin.from("empty_seat_recovery_snapshots").upsert({
      tenant_id: tenantId,
      session_id: item.opening.sessionId,
      group_id: item.opening.groupId,
      available_seats: item.result.availableSeats,
      cancellation_seats: item.opening.cancellationSeats,
      candidate_count: item.result.candidates.length,
      actionable_candidate_count: item.result.actionableCount,
      recovery_band: item.result.recoveryBand,
      confidence: item.result.confidence,
      summary: item.result.summary,
      reasons_json: item.result.reasons,
      source_fingerprint: fingerprint,
      status: "open",
      generated_at: now.toISOString(),
      expires_at: expiresAt,
      is_test: false,
      journey_run_id: null
    }, { onConflict: "tenant_id,source_fingerprint" }).select("id").single();
    assertResult(snapshotResult.error, "recovery snapshot write");
    const snapshotId = snapshotResult.data.id;
    await admin.from("empty_seat_recovery_candidates").delete().eq("tenant_id", tenantId).eq("snapshot_id", snapshotId);
    if (item.result.candidates.length) {
      const candidateWrite = await admin.from("empty_seat_recovery_candidates").insert(item.result.candidates.map((candidate) => {
        const source = candidateSourceById.get(candidate.id);
        if (!source) throw new Error("Empty-seat candidate source disappeared.");
        return {
          tenant_id: tenantId,
          snapshot_id: snapshotId,
          candidate_type: candidate.type,
          waitlist_entry_id: source.waitlistEntryId,
          catch_up_credit_id: source.creditId,
          participant_id: source.participantId,
          display_name: candidate.displayName,
          score: candidate.score,
          confidence: candidate.confidence,
          fifo_rank: candidate.fifoRank,
          reasons_json: candidate.reasons,
          blockers_json: candidate.blockers,
          family_context_json: candidate.familyContext,
          suggested_action: candidate.suggestedAction,
          status: "suggested",
          is_test: false,
          journey_run_id: null
        };
      }));
      assertResult(candidateWrite.error, "recovery candidate write");
    }
    await admin.from("empty_seat_recovery_events").insert({
      tenant_id: tenantId,
      snapshot_id: snapshotId,
      event_type: "generated",
      message: item.result.summary,
      metadata_json: { fingerprint, candidates: item.result.candidates.length }
    });
    created += 1;
  }
  return created;
}

function buildFamilyContext(input: {
  participants: Array<{ id: string; guardian_user_id: string | null }>;
  enrollments: Array<{ participant_id: string; guardian_user_id: string | null }>;
  memberships: Array<{ participant_id: string; group_id: string }>;
  groups: Map<string, { default_weekday: number | null; default_resource_id: string | null }>;
}) {
  const guardians = new Map<string, string>();
  for (const participant of input.participants) if (participant.guardian_user_id) guardians.set(participant.id, participant.guardian_user_id);
  for (const enrollment of input.enrollments) if (enrollment.guardian_user_id) guardians.set(enrollment.participant_id, enrollment.guardian_user_id);
  const result = new Map<string | null, { days: number[]; locations: string[] }>();
  for (const membership of input.memberships) {
    const guardian = guardians.get(membership.participant_id);
    const group = input.groups.get(membership.group_id);
    if (!guardian || !group) continue;
    const current = result.get(guardian) ?? { days: [], locations: [] };
    if (group.default_weekday) current.days.push(group.default_weekday);
    if (group.default_resource_id) current.locations.push(group.default_resource_id);
    result.set(guardian, { days: [...new Set(current.days)], locations: [...new Set(current.locations)] });
  }
  return result;
}

function calculateFifoRanks(rows: Array<{ id: string; program_id: string; recommended_stage_id: string | null; priority_date: string; created_at: string }>) {
  const ranks = new Map<string, number>();
  for (const cohort of groupBy(rows, (row) => `${row.program_id}:${row.recommended_stage_id ?? "none"}`).values()) {
    cohort.sort((left, right) => left.priority_date.localeCompare(right.priority_date) || left.created_at.localeCompare(right.created_at));
    cohort.forEach((row, index) => ranks.set(row.id, index + 1));
  }
  return ranks;
}

function groupBy<T>(rows: T[], key: (row: T) => string | null) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const value = key(row);
    if (!value) continue;
    result.set(value, [...(result.get(value) ?? []), row]);
  }
  return result;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function toObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as { sameDay?: boolean; sameLocation?: boolean } : {};
}

function emptyResult() {
  return { data: [], error: null };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
