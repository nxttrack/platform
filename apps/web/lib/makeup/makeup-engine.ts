import type { SupabaseClient } from "@supabase/supabase-js";

type MakeupClient = Pick<SupabaseClient, "from">;

type CreditRow = {
  id: string;
  tenant_id: string;
  participant_id: string;
  enrollment_id: string;
  source_session_id: string | null;
  status: string;
};

type EnrollmentRow = {
  id: string;
  program_id: string;
  current_stage_id: string | null;
};

type GroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  name: string;
  capacity: number;
  makeup_spots: number;
  status: string;
};

type StageRow = {
  id: string;
  sort_order: number;
};

type SessionRow = {
  id: string;
  group_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type MembershipRow = {
  id: string;
  group_id: string;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
};

type CandidateRow = {
  id: string;
  session_id: string;
  status: string;
};

type CatchUpRequestRow = {
  id: string;
  preferred_time_windows: string[] | null;
};

export async function refreshMakeupCandidates(client: MakeupClient, tenantId: string, makeupCreditId: string) {
  const credit = await singleRow<CreditRow>(
    client
      .from("makeup_credits")
      .select("id, tenant_id, participant_id, enrollment_id, source_session_id, status")
      .eq("tenant_id", tenantId)
      .eq("id", makeupCreditId)
      .in("status", ["available", "reserved"])
      .maybeSingle()
  );

  if (!credit) {
    return 0;
  }

  const enrollment = await singleRow<EnrollmentRow>(
    client
      .from("enrollments")
      .select("id, program_id, current_stage_id")
      .eq("tenant_id", tenantId)
      .eq("id", credit.enrollment_id)
      .maybeSingle()
  );

  if (!enrollment) {
    return 0;
  }

  const [requestResult, stagesResult, groupsResult] = await Promise.all([
    rows<CatchUpRequestRow>(
      client
        .from("lesson_catch_up_requests")
        .select("id, preferred_time_windows")
        .eq("tenant_id", tenantId)
        .eq("makeup_credit_id", makeupCreditId)
        .in("status", ["requested", "approved"])
        .order("requested_at", { ascending: false })
        .limit(1)
    ),
    rows<StageRow>(client.from("stages").select("id, sort_order").eq("tenant_id", tenantId).eq("program_id", enrollment.program_id)),
    rows<GroupRow>(
      client
        .from("groups")
        .select("id, program_id, stage_id, resource_id, instructor_id, name, capacity, makeup_spots, status")
        .eq("tenant_id", tenantId)
        .eq("program_id", enrollment.program_id)
        .eq("status", "active")
    )
  ]);

  const preferredWindows = requestResult[0]?.preferred_time_windows ?? [];
  const stagesById = new Map(stagesResult.map((stage) => [stage.id, stage]));
  const currentStageSort = enrollment.current_stage_id ? stagesById.get(enrollment.current_stage_id)?.sort_order : null;
  const compatibleGroups = groupsResult.filter((group) => {
    if (!enrollment.current_stage_id || group.stage_id === enrollment.current_stage_id) {
      return true;
    }

    const sortOrder = stagesById.get(group.stage_id)?.sort_order;
    return typeof sortOrder === "number" && typeof currentStageSort === "number" && Math.abs(sortOrder - currentStageSort) <= 1;
  });
  const groupIds = compatibleGroups.map((group) => group.id);

  if (groupIds.length === 0) {
    return 0;
  }

  const [sessionsResult, membershipsResult, selectedCandidatesResult] = await Promise.all([
    rows<SessionRow>(
      client
        .from("sessions")
        .select("id, group_id, starts_at, ends_at, status")
        .eq("tenant_id", tenantId)
        .in("group_id", groupIds)
        .eq("status", "scheduled")
        .gt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(120)
    ),
    rows<MembershipRow>(
      client
        .from("group_memberships")
        .select("id, group_id, status, starts_on, ends_on")
        .eq("tenant_id", tenantId)
        .in("group_id", groupIds)
        .in("status", ["planned", "active"])
        .limit(1000)
    ),
    rows<CandidateRow>(
      client
        .from("makeup_candidate_sessions")
        .select("id, session_id, status")
        .eq("tenant_id", tenantId)
        .in("status", ["selected", "approved"])
        .limit(1000)
    )
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const groupsById = new Map(compatibleGroups.map((group) => [group.id, group]));
  const activeMembershipsByGroup = countBy(
    membershipsResult.filter((membership) => membership.status === "active" && (!membership.starts_on || membership.starts_on <= today) && (!membership.ends_on || membership.ends_on >= today)),
    "group_id"
  );
  const selectedMakeupsBySession = countBy(selectedCandidatesResult, "session_id");
  const upserts = sessionsResult
    .filter((session) => session.id !== credit.source_session_id)
    .map((session) => {
      const group = groupsById.get(session.group_id);
      if (!group) {
        return null;
      }

      const activeMemberships = activeMembershipsByGroup.get(group.id) ?? 0;
      const usedMakeupSpots = selectedMakeupsBySession.get(session.id) ?? 0;
      const timeWindow = timeWindowFor(session.starts_at);
      const stageScore = group.stage_id === enrollment.current_stage_id ? 25 : 15;
      const capacityScore = group.makeup_spots > usedMakeupSpots ? 20 : group.capacity > activeMemberships ? 10 : 0;
      const preferenceScore = preferredWindows.length === 0 ? 5 : preferredWindows.includes(timeWindow) ? 15 : 0;
      const score = Math.min(100, 30 + stageScore + capacityScore + preferenceScore + 10);
      const blockers =
        group.makeup_spots <= usedMakeupSpots && group.capacity <= activeMemberships
          ? [{ code: "no_makeup_capacity", label: "Geen inhaalcapaciteit", detail: "Deze les heeft geen vrije inhaalplek meer." }]
          : [];

      return {
        tenant_id: tenantId,
        makeup_credit_id: makeupCreditId,
        session_id: session.id,
        group_id: group.id,
        score,
        status: "suggested",
        reasons: [
          { code: "program_match", label: "Programma match", detail: "De les hoort bij hetzelfde programma." },
          { code: "stage_fit", label: "Niveau match", detail: group.stage_id === enrollment.current_stage_id ? "Exact hetzelfde niveau." : "Compatibel aangrenzend niveau." },
          { code: "time_window", label: "Tijdvak", detail: preferredWindows.includes(timeWindow) ? "Past bij de opgegeven voorkeur." : "Beschikbaar alternatief moment." }
        ],
        blockers,
        capacity_snapshot: {
          group_id: group.id,
          group: group.name,
          capacity: group.capacity,
          active_memberships: activeMemberships,
          makeup_spots: group.makeup_spots,
          used_makeup_spots: usedMakeupSpots,
          available_makeup_spots: Math.max(0, group.makeup_spots - usedMakeupSpots),
          time_window: timeWindow,
          rule_version: "makeup-candidate-v1"
        },
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  if (upserts.length === 0) {
    return 0;
  }

  const { error } = await client.from("makeup_candidate_sessions").upsert(upserts, { onConflict: "tenant_id,makeup_credit_id,session_id" });
  if (error) {
    throw new Error(error.message);
  }

  return upserts.length;
}

export async function createMakeupCapacityHold(
  client: MakeupClient,
  input: {
    tenantId: string;
    groupId: string;
    enrollmentId: string;
    expiresAt: string;
    makeupCreditId: string | null;
    catchUpRequestId: string | null;
    targetSessionId: string | null;
    createdByProfileId?: string | null;
  }
) {
  if (input.catchUpRequestId) {
    const existing = await singleRow<{ id: string }>(
      client
        .from("capacity_holds")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("hold_type", "makeup")
        .eq("status", "active")
        .contains("metadata", { catch_up_request_id: input.catchUpRequestId })
        .maybeSingle()
    );

    if (existing) {
      return;
    }
  }

  const { error } = await client.from("capacity_holds").insert({
    tenant_id: input.tenantId,
    group_id: input.groupId,
    enrollment_id: input.enrollmentId,
    hold_type: "makeup",
    status: "active",
    quantity: 1,
    starts_on: new Date().toISOString().slice(0, 10),
    expires_at: input.expiresAt,
    created_by_profile_id: input.createdByProfileId ?? null,
    metadata: {
      source: "lesson_makeup_engine",
      makeup_credit_id: input.makeupCreditId,
      catch_up_request_id: input.catchUpRequestId,
      target_session_id: input.targetSessionId
    }
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function rows<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Row[]) : [];
}

async function singleRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const { data, error } = await builder;
  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as Row) : null;
}

function countBy<Row extends Record<string, unknown>>(rows: Row[], key: keyof Row) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value === "string") {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

function timeWindowFor(startsAt: string) {
  const hour = new Date(startsAt).getHours();
  if (hour < 12) {
    return "morning";
  }
  if (hour < 17) {
    return "afternoon";
  }
  return "evening";
}
