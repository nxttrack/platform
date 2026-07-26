import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeMakeupMarketplaceMatches,
  type MakeupMarketplaceMatch
} from "./makeup-marketplace-contract";

export type MakeupMarketplaceData = {
  session: {
    id: string;
    startsAt: string;
    endsAt: string;
    groupId: string;
    groupName: string;
    programId: string;
    stageId: string | null;
    capacity: number;
    effectiveUsed: number;
    available: number;
  };
  matches: MakeupMarketplaceMatch[];
  decisions: Array<{
    creditId: string;
    status: string;
    invitedAt: string | null;
  }>;
};

export async function findMakeupMarketplaceMatches(input: {
  tenantId: string;
  sessionId: string;
}): Promise<MakeupMarketplaceData | null> {
  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("id, group_id, starts_at, ends_at, status, capacity_override")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sessionId)
    .maybeSingle();
  assertMarketplaceResult(sessionResult.error, "marketplace session");
  if (!sessionResult.data || sessionResult.data.status !== "scheduled") return null;

  const groupResult = await admin
    .from("groups")
    .select("id, name, program_id, stage_id, capacity, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", sessionResult.data.group_id)
    .maybeSingle();
  assertMarketplaceResult(groupResult.error, "marketplace group");
  if (!groupResult.data || groupResult.data.status !== "active") return null;

  const sessionDay = sessionResult.data.starts_at.slice(0, 10);
  const [
    membershipsResult,
    cancellationsResult,
    holdsResult,
    creditsResult,
    decisionsResult
  ] = await Promise.all([
    admin
      .from("group_memberships")
      .select("participant_id, capacity_weight, status, starts_on, ends_on")
      .eq("tenant_id", input.tenantId)
      .eq("group_id", groupResult.data.id)
      .in("status", ["active", "trial"]),
    admin
      .from("lesson_cancellations")
      .select("participant_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("session_id", input.sessionId)
      .in("status", ["accepted", "late_cancelled"]),
    admin
      .from("catch_up_requests")
      .select("participant_id, credit_id, preferred_session_id, assigned_session_id, status")
      .eq("tenant_id", input.tenantId)
      .in("status", ["requested", "approved"]),
    admin
      .from("catch_up_credits")
      .select("id, participant_id, enrollment_id, status, expires_on")
      .eq("tenant_id", input.tenantId)
      .eq("status", "available"),
    admin
      .from("makeup_marketplace_decisions")
      .select("credit_id, status, invited_at")
      .eq("tenant_id", input.tenantId)
      .eq("session_id", input.sessionId)
  ]);
  for (const [label, result] of [
    ["marketplace memberships", membershipsResult],
    ["marketplace cancellations", cancellationsResult],
    ["marketplace holds", holdsResult],
    ["marketplace credits", creditsResult],
    ["marketplace decisions", decisionsResult]
  ] as const) assertMarketplaceResult(result.error, label);

  const credits = creditsResult.data ?? [];
  const enrollmentIds = credits.map((credit) => credit.enrollment_id);
  const participantIds = credits.map((credit) => credit.participant_id);
  const [enrollmentsResult, participantsResult, guardiansResult, preferencesResult] = await Promise.all([
    enrollmentIds.length
      ? admin
          .from("enrollments")
          .select("id, participant_id, guardian_user_id, program_id, current_stage_id, status")
          .eq("tenant_id", input.tenantId)
          .in("id", enrollmentIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("participants")
          .select("id, display_name, guardian_user_id, is_test, journey_run_id")
          .eq("tenant_id", input.tenantId)
          .in("id", participantIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("participant_guardians")
          .select("participant_id, guardian_user_id, access_level, status")
          .eq("tenant_id", input.tenantId)
          .in("participant_id", participantIds)
          .eq("status", "active")
          .in("access_level", ["primary", "secondary"])
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("participant_schedule_preferences")
          .select("participant_id, weekday, starts_after, ends_before, preference_weight")
          .eq("tenant_id", input.tenantId)
          .in("participant_id", participantIds)
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const [label, result] of [
    ["marketplace enrollments", enrollmentsResult],
    ["marketplace participants", participantsResult],
    ["marketplace guardians", guardiansResult],
    ["marketplace preferences", preferencesResult]
  ] as const) assertMarketplaceResult(result.error, label);

  const guardianIds = [...new Set([
    ...(enrollmentsResult.data ?? []).flatMap((row) => row.guardian_user_id ? [row.guardian_user_id] : []),
    ...(guardiansResult.data ?? []).map((row) => row.guardian_user_id)
  ])];
  const communicationResult = guardianIds.length
    ? await admin
        .from("guardian_communication_preferences")
        .select("guardian_user_id, make_up_in_app_enabled, make_up_email_enabled, automatic_make_up_invites_enabled")
        .eq("tenant_id", input.tenantId)
        .in("guardian_user_id", guardianIds)
    : { data: [], error: null };
  assertMarketplaceResult(communicationResult.error, "marketplace communication preferences");

  const enrollmentById = new Map((enrollmentsResult.data ?? []).map((row) => [row.id, row]));
  const participantById = new Map((participantsResult.data ?? []).map((row) => [row.id, row]));
  const guardiansByParticipant = groupBy(guardiansResult.data ?? [], (row) => row.participant_id);
  const preferencesByParticipant = groupBy(preferencesResult.data ?? [], (row) => row.participant_id);
  const communicationByGuardian = new Map((communicationResult.data ?? []).map((row) => [row.guardian_user_id, row]));
  const regularParticipantIds = new Set(
    (membershipsResult.data ?? [])
      .filter((membership) =>
        membership.starts_on <= sessionDay &&
        (!membership.ends_on || membership.ends_on >= sessionDay)
      )
      .map((membership) => membership.participant_id)
  );
  const cancelledParticipantIds = new Set(
    (cancellationsResult.data ?? [])
      .map((row) => row.participant_id)
      .filter((participantId) => regularParticipantIds.has(participantId))
  );
  const activeSessionHolds = (holdsResult.data ?? []).filter((request) =>
    (request.assigned_session_id ?? request.preferred_session_id) === input.sessionId
  );
  const activeCreditIds = new Set(activeSessionHolds.map((request) => request.credit_id));
  const activeParticipantIds = new Set(activeSessionHolds.map((request) => request.participant_id));
  const regularParticipants = (membershipsResult.data ?? [])
    .filter((membership) =>
      membership.starts_on <= sessionDay &&
      (!membership.ends_on || membership.ends_on >= sessionDay)
    )
    .reduce((sum, membership) => sum + Number(membership.capacity_weight), 0);

  const computed = computeMakeupMarketplaceMatches({
    session: {
      id: input.sessionId,
      startsAt: sessionResult.data.starts_at,
      programId: groupResult.data.program_id,
      stageId: groupResult.data.stage_id,
      capacity: Number(sessionResult.data.capacity_override ?? groupResult.data.capacity),
      regularParticipants,
      cancelledParticipants: cancelledParticipantIds.size,
      activeHolds: activeSessionHolds.length
    },
    candidates: credits.flatMap((credit) => {
      const enrollment = enrollmentById.get(credit.enrollment_id);
      const participant = participantById.get(credit.participant_id);
      if (!enrollment || !participant || enrollment.status !== "active") return [];
      const guardian = enrollment.guardian_user_id ?? guardiansByParticipant.get(participant.id)?.[0]?.guardian_user_id ?? participant.guardian_user_id;
      const communication = guardian ? communicationByGuardian.get(guardian) : null;
      const preferences = preferencesByParticipant.get(participant.id) ?? [];
      return [{
        participantId: participant.id,
        participantName: participant.display_name,
        guardianUserId: guardian ?? null,
        creditId: credit.id,
        programId: enrollment.program_id,
        stageId: enrollment.current_stage_id,
        expiresOn: credit.expires_on,
        preferredWeekdays: [...new Set(preferences.map((preference) => preference.weekday))],
        preferredStartsAfter: preferences[0]?.starts_after ?? null,
        preferredEndsBefore: preferences[0]?.ends_before ?? null,
        alreadyBooked:
          activeCreditIds.has(credit.id) ||
          activeParticipantIds.has(participant.id) ||
          (regularParticipantIds.has(participant.id) && !cancelledParticipantIds.has(participant.id)),
        notificationAllowed:
          !!guardian &&
          (communication?.make_up_in_app_enabled ?? true),
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      }];
    }),
    now: new Date().toISOString()
  });

  return {
    session: {
      id: input.sessionId,
      startsAt: sessionResult.data.starts_at,
      endsAt: sessionResult.data.ends_at,
      groupId: groupResult.data.id,
      groupName: groupResult.data.name,
      programId: groupResult.data.program_id,
      stageId: groupResult.data.stage_id,
      capacity: Number(sessionResult.data.capacity_override ?? groupResult.data.capacity),
      effectiveUsed: computed.effectiveUsed,
      available: computed.available
    },
    matches: computed.matches,
    decisions: (decisionsResult.data ?? []).map((row) => ({
      creditId: row.credit_id,
      status: row.status,
      invitedAt: row.invited_at
    }))
  };
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function assertMarketplaceResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
