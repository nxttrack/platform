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
  const stageIds = [...new Set(enrollments.flatMap((enrollment) => (enrollment.current_stage_id ? [enrollment.current_stage_id] : [])))];
  let groupsQuery = admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenant.id).eq("status", "active").in("program_id", programIds);

  if (stageIds.length > 0) {
    groupsQuery = groupsQuery.or(`stage_id.in.(${stageIds.join(",")}),stage_id.is.null`);
  }

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
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id).in("group_id", groupIds),
    admin.from("catch_up_requests").select("id, preferred_session_id, assigned_session_id, status").eq("tenant_id", tenant.id).in("status", ["requested", "approved"])
  ]);

  assertCatchUpResult(sessionsResult.error, "sessions");
  assertCatchUpResult(membershipsResult.error, "group memberships");
  assertCatchUpResult(holdsResult.error, "catch-up holds");

  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const capacityByGroup = new Map(summarizeGroupCapacity(groups, memberships).map((capacity) => [capacity.groupId, capacity]));
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

      if (enrollment.current_stage_id && group.stage_id && group.stage_id !== enrollment.current_stage_id) {
        continue;
      }

      const groupCapacity = capacityByGroup.get(group.id);
      const sessionCapacity = session.capacity_override ?? group.capacity;
      const used = (groupCapacity?.used ?? 0) + (holdsBySession.get(session.id) ?? 0);
      const available = sessionCapacity - used;

      if (available <= 0) {
        continue;
      }

      options.push({
        creditId: credit.id,
        sessionId: session.id,
        startsAt: session.starts_at,
        endsAt: session.ends_at,
        groupName: group.name,
        available
      });
    }
  }

  return { credits, requests, options };
}

function assertCatchUpResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
