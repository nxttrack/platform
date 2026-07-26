import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant, summarizeGroupCapacity, type GroupMembershipRow, type GroupRow, type SessionRow } from "./core";
import { loadParentParticipantAccess } from "./parent-portal";

export type ParentCatchUpCreditRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  status: string;
  expires_on: string | null;
  used_session_id: string | null;
};

export type ParentCatchUpRequestRow = {
  id: string;
  credit_id: string;
  participant_id: string;
  enrollment_id: string;
  preferred_session_id: string;
  assigned_session_id: string | null;
  status: string;
  requested_at: string;
  admin_notes: string | null;
};

export type ParentCatchUpOption = {
  creditId: string;
  sessionId: string;
  startsAt: string;
  endsAt: string;
  groupName: string;
  available: number;
  score: number;
  reasons: string[];
};

export type ParentCatchUpData = {
  credits: ParentCatchUpCreditRow[];
  requests: ParentCatchUpRequestRow[];
  options: ParentCatchUpOption[];
};

export async function getParentCatchUpData(): Promise<ParentCatchUpData> {
  const context = await requirePrivateShellContext("/portaal/lessen");
  const tenant = getActiveTenant(context);
  const access = await loadParentParticipantAccess(tenant.id, context.user.id);
  const participantIds = access.participantIds;

  if (participantIds.length === 0) {
    return { credits: [], requests: [], options: [] };
  }

  const admin = createAdminClient();
  const [creditsResult, requestsResult, settingsResult] = await Promise.all([
    admin
      .from("catch_up_credits")
      .select("id, participant_id, enrollment_id, status, expires_on, used_session_id")
      .eq("tenant_id", tenant.id)
      .in("participant_id", participantIds)
      .in("status", ["available", "reserved"])
      .order("expires_on", { ascending: true, nullsFirst: false }),
    admin
      .from("catch_up_requests")
      .select("id, credit_id, participant_id, enrollment_id, preferred_session_id, assigned_session_id, status, requested_at, admin_notes")
      .eq("tenant_id", tenant.id)
      .in("participant_id", participantIds)
      .order("requested_at", { ascending: false }),
    admin.from("tenant_settings").select("catch_up_booking_window_days").eq("tenant_id", tenant.id).maybeSingle()
  ]);

  assertCatchUpResult(creditsResult.error, "catch-up credits");
  assertCatchUpResult(requestsResult.error, "catch-up requests");
  assertCatchUpResult(settingsResult.error, "tenant settings");

  const credits = (creditsResult.data ?? []) as ParentCatchUpCreditRow[];
  const requests = (requestsResult.data ?? []) as ParentCatchUpRequestRow[];
  const availableCredits = credits.filter((credit) => credit.status === "available" && (!credit.expires_on || new Date(`${credit.expires_on}T23:59:59`).getTime() >= Date.now()));

  if (availableCredits.length === 0) {
    return { credits, requests, options: [] };
  }

  const enrollmentIds = [...new Set(availableCredits.map((credit) => credit.enrollment_id))];
  const enrollmentsResult = await admin
    .from("enrollments")
    .select("id, participant_id, program_id, current_stage_id, status")
    .eq("tenant_id", tenant.id)
    .in("id", enrollmentIds);

  assertCatchUpResult(enrollmentsResult.error, "enrollments");

  const enrollments = (enrollmentsResult.data ?? []) as { current_stage_id: string | null; id: string; participant_id: string; program_id: string; status: string }[];
  const programIds = [...new Set(enrollments.map((enrollment) => enrollment.program_id))];
  let groupsQuery = admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenant.id).eq("status", "active").in("program_id", programIds);

  const groupsResult = await groupsQuery;

  assertCatchUpResult(groupsResult.error, "groups");

  const groups = (groupsResult.data ?? []) as GroupRow[];
  const groupIds = groups.map((group) => group.id);

  if (groupIds.length === 0) {
    return { credits, requests, options: [] };
  }

  const now = new Date();
  const until = new Date(now);
  const bookingWindowDays = Number((settingsResult.data as { catch_up_booking_window_days?: number } | null)?.catch_up_booking_window_days ?? 30);

  until.setDate(until.getDate() + bookingWindowDays);

  const [sessionsResult, membershipsResult, holdsResult] = await Promise.all([
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, capacity_override, notes")
      .eq("tenant_id", tenant.id)
      .in("group_id", groupIds)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", until.toISOString())
      .order("starts_at"),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight, starts_on, ends_on").eq("tenant_id", tenant.id).in("group_id", groupIds),
    admin.from("catch_up_requests").select("id, preferred_session_id, assigned_session_id, status").eq("tenant_id", tenant.id).in("status", ["requested", "approved"])
  ]);

  assertCatchUpResult(sessionsResult.error, "sessions");
  assertCatchUpResult(membershipsResult.error, "group memberships");
  assertCatchUpResult(holdsResult.error, "catch-up holds");

  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const memberships = (membershipsResult.data ?? []) as Array<GroupMembershipRow & { starts_on: string; ends_on: string | null }>;
  const sessionIds = sessions.map((session) => session.id);
  const [cancellationsResult, preferencesResult] = await Promise.all([
    sessionIds.length
      ? admin
          .from("lesson_cancellations")
          .select("session_id, participant_id, status")
          .eq("tenant_id", tenant.id)
          .in("session_id", sessionIds)
          .in("status", ["accepted", "late_cancelled"])
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("participant_schedule_preferences")
      .select("participant_id, weekday, starts_after, ends_before, preference_weight")
      .eq("tenant_id", tenant.id)
      .in("participant_id", participantIds)
  ]);
  assertCatchUpResult(cancellationsResult.error, "session cancellations");
  assertCatchUpResult(preferencesResult.error, "participant schedule preferences");
  const cancellationsBySession = new Map<string, Set<string>>();
  for (const cancellation of cancellationsResult.data ?? []) {
    const participantSet = cancellationsBySession.get(cancellation.session_id) ?? new Set<string>();
    participantSet.add(cancellation.participant_id);
    cancellationsBySession.set(cancellation.session_id, participantSet);
  }
  const preferencesByParticipant = groupBy(preferencesResult.data ?? [], (preference) => preference.participant_id);
  const holdsBySession = new Map<string, number>();

  for (const hold of (holdsResult.data ?? []) as { assigned_session_id: string | null; preferred_session_id: string; status: string }[]) {
    const sessionId = hold.assigned_session_id ?? hold.preferred_session_id;
    holdsBySession.set(sessionId, (holdsBySession.get(sessionId) ?? 0) + 1);
  }

  const groupById = new Map(groups.map((group) => [group.id, group]));
  const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const options: ParentCatchUpOption[] = [];

  for (const credit of availableCredits) {
    const enrollment = enrollmentById.get(credit.enrollment_id);

    if (!enrollment || enrollment.status !== "active") {
      continue;
    }

    for (const session of sessions) {
      const group = groupById.get(session.group_id);

      if (!group || group.program_id !== enrollment.program_id) {
        continue;
      }

      if (group.stage_id !== enrollment.current_stage_id) {
        continue;
      }
      const sessionDay = session.starts_at.slice(0, 10);
      if (credit.expires_on && credit.expires_on < sessionDay) {
        continue;
      }
      const regularMemberships = memberships.filter((membership) =>
        membership.group_id === group.id &&
        ["active", "trial"].includes(membership.status) &&
        membership.starts_on <= sessionDay &&
        (!membership.ends_on || membership.ends_on >= sessionDay)
      );
      if (regularMemberships.some((membership) => membership.participant_id === credit.participant_id)) {
        continue;
      }
      const cancelledParticipantIds = cancellationsBySession.get(session.id) ?? new Set<string>();
      const cancelledRegularWeight = regularMemberships
        .filter((membership) => cancelledParticipantIds.has(membership.participant_id))
        .reduce((sum, membership) => sum + Number(membership.capacity_weight), 0);
      const sessionCapacity = session.capacity_override ?? group.capacity;
      const used = Math.max(
        0,
        regularMemberships.reduce((sum, membership) => sum + Number(membership.capacity_weight), 0) - cancelledRegularWeight
      ) + (holdsBySession.get(session.id) ?? 0);
      const available = sessionCapacity - used;

      if (available <= 0) {
        continue;
      }

      const sessionWeekday = new Date(session.starts_at).getDay() || 7;
      const sessionTime = session.starts_at.slice(11, 16);
      const matchingPreferences = (preferencesByParticipant.get(credit.participant_id) ?? []).filter((preference) =>
        preference.weekday === sessionWeekday &&
        (!preference.starts_after || sessionTime >= preference.starts_after.slice(0, 5)) &&
        (!preference.ends_before || sessionTime <= preference.ends_before.slice(0, 5))
      );
      const expiryDays = credit.expires_on ? Math.floor((new Date(`${credit.expires_on}T00:00:00Z`).getTime() - new Date(`${sessionDay}T00:00:00Z`).getTime()) / dayMs) : null;
      options.push({
        creditId: credit.id,
        sessionId: session.id,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        groupName: group.name,
        available,
        score: 60 + (matchingPreferences.length ? 25 : 0) + (expiryDays !== null && expiryDays <= 14 ? 15 : 0),
        reasons: [
          "Programma en niveau passen exact.",
          ...(matchingPreferences.length ? ["Les valt binnen de vastgelegde voorkeursdag en -tijd."] : []),
          ...(expiryDays !== null && expiryDays <= 14 ? ["Credit verloopt binnen veertien dagen na dit lesmoment."] : [])
        ]
      });
    }
  }

  return { credits, requests, options: options.sort((left, right) => right.score - left.score || left.startsAt.localeCompare(right.startsAt)) };
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function assertCatchUpResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}

const dayMs = 24 * 60 * 60 * 1000;
