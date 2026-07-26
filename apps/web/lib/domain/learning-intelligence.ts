import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildLessonFocusCards,
  computeDiplomaReadiness,
  detectAttendanceRiskSignals,
  detectProgressBottleneckSignals,
  type AttendanceObservation,
  type AttendanceRiskSignal,
  type DiplomaReadiness,
  type LessonFocusCandidate,
  type LessonFocusCard,
  type ProgressAssessment,
  type ProgressBottleneck
} from "./learning-intelligence-contract";

export async function detectAttendanceRisks(
  tenantId: string,
  options: { includeTestData?: boolean } = {}
): Promise<AttendanceRiskSignal[]> {
  const includeTestData = allowTestData(options.includeTestData ?? false);
  const admin = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 90 * dayMs).toISOString();

  const [
    sessionsResult,
    membershipsResult,
    attendanceResult,
    cancellationsResult,
    contactsResult,
    participantsResult
  ] = await Promise.all([
    admin
      .from("sessions")
      .select("id, group_id, starts_at, ends_at, status, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
      .in("status", ["scheduled", "completed"])
      .gte("starts_at", since)
      .lte("starts_at", now.toISOString()),
    admin
      .from("group_memberships")
      .select("group_id, participant_id, starts_on, ends_on, status, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "trial", "completed"]),
    admin
      .from("session_attendance")
      .select("session_id, participant_id, status, marked_at, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
      .gte("marked_at", since),
    admin
      .from("lesson_cancellations")
      .select("participant_id, session_id, status, policy_status, requested_at")
      .eq("tenant_id", tenantId)
      .gte("requested_at", since),
    admin
      .from("tenant_notifications")
      .select("participant_id, created_at")
      .eq("tenant_id", tenantId)
      .not("participant_id", "is", null)
      .gte("created_at", since),
    admin
      .from("participants")
      .select("id, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
  ]);

  for (const [label, result] of [
    ["sessions", sessionsResult],
    ["memberships", membershipsResult],
    ["attendance", attendanceResult],
    ["lesson cancellations", cancellationsResult],
    ["participant contacts", contactsResult],
    ["participants", participantsResult]
  ] as const) {
    assertResult(result.error, label);
  }

  const participants = (participantsResult.data ?? []) as TestParticipantRow[];
  const participantById = new Map(participants.map((row) => [row.id, row]));
  const sessions = ((sessionsResult.data ?? []) as SessionRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const memberships = ((membershipsResult.data ?? []) as MembershipRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const attendance = ((attendanceResult.data ?? []) as AttendanceRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const attendanceBySessionParticipant = new Map(
    attendance.map((row) => [`${row.session_id}:${row.participant_id}`, row])
  );
  const observations: AttendanceObservation[] = [];

  for (const session of sessions) {
    const sessionDate = session.starts_at.slice(0, 10);
    for (const membership of memberships) {
      if (
        membership.group_id !== session.group_id ||
        membership.starts_on > sessionDate ||
        (membership.ends_on && membership.ends_on < sessionDate)
      ) continue;
      const participant = participantById.get(membership.participant_id);
      if (!participant || (!includeTestData && participant.is_test)) continue;
      const marked = attendanceBySessionParticipant.get(
        `${session.id}:${membership.participant_id}`
      );
      observations.push({
        participantId: membership.participant_id,
        groupId: session.group_id,
        sessionId: session.id,
        sessionStartsAt: session.starts_at,
        sessionEndsAt: session.ends_at,
        sessionStatus: session.status,
        attendanceStatus: marked?.status ?? null,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      });
    }
  }

  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const cancellations = ((cancellationsResult.data ?? []) as CancellationRow[])
    .flatMap((row) => {
      const session = sessionById.get(row.session_id);
      const participant = participantById.get(row.participant_id);
      if (!session || !participant || (!includeTestData && participant.is_test)) return [];
      return [{
        participantId: row.participant_id,
        groupId: session.group_id,
        requestedAt: row.requested_at,
        status: row.status === "late_cancelled" || row.policy_status === "late"
          ? "late_cancelled"
          : row.status,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      }];
    });
  const contacts = ((contactsResult.data ?? []) as ContactRow[]).flatMap((row) =>
    row.participant_id
      ? [{ participantId: row.participant_id, contactedAt: row.created_at }]
      : []
  );

  return detectAttendanceRiskSignals({
    now: now.toISOString(),
    observations,
    cancellations,
    contacts
  });
}

export async function detectProgressBottlenecks(input: {
  tenantId: string;
  period: { from: string; to: string };
  programId?: string;
  stageId?: string;
  groupId?: string;
  includeTestData?: boolean;
}): Promise<ProgressBottleneck[]> {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const admin = createAdminClient();
  let query = admin
    .from("participant_progress_assessments")
    .select("participant_id, program_id, stage_id, group_id, item_id, score, assessed_by_user_id, assessed_at, is_test, journey_run_id")
    .eq("tenant_id", input.tenantId)
    .gte("assessed_at", input.period.from)
    .lte("assessed_at", input.period.to);
  if (input.programId) query = query.eq("program_id", input.programId);
  if (input.stageId) query = query.eq("stage_id", input.stageId);
  if (input.groupId) query = query.eq("group_id", input.groupId);
  if (!includeTestData) query = query.eq("is_test", false);

  const [assessmentsResult, itemsResult] = await Promise.all([
    query,
    admin
      .from("progress_items")
      .select("id, name, positive_goal, status")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
  ]);
  assertResult(assessmentsResult.error, "progress assessments");
  assertResult(itemsResult.error, "progress items");

  const itemById = new Map(
    ((itemsResult.data ?? []) as ProgressItemRow[]).map((row) => [row.id, row])
  );
  const assessments: ProgressAssessment[] = (
    (assessmentsResult.data ?? []) as AssessmentRow[]
  ).flatMap((row) => {
    const item = itemById.get(row.item_id);
    if (!item) return [];
    return [{
      participantId: row.participant_id,
      groupId: row.group_id,
      programId: row.program_id,
      stageId: row.stage_id,
      instructorId: row.assessed_by_user_id,
      skillId: row.item_id,
      skillLabel: item.positive_goal ?? item.name,
      score: Number(row.score),
      assessedAt: row.assessed_at,
      isTest: row.is_test,
      journeyRunId: row.journey_run_id
    }];
  });

  return detectProgressBottleneckSignals({
    assessments,
    periodStart: input.period.from,
    periodEnd: input.period.to,
    minimumSampleSize: 5
  });
}

export async function calculateDiplomaReadiness(input: {
  tenantId: string;
  participantId: string;
  programId: string;
  includeTestData?: boolean;
}): Promise<DiplomaReadiness> {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const admin = createAdminClient();
  const enrollmentResult = await admin
    .from("enrollments")
    .select("id, current_stage_id, is_test")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .eq("program_id", input.programId)
    .in("status", ["active", "paused"])
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertResult(enrollmentResult.error, "participant enrollment");
  if (!enrollmentResult.data || (!includeTestData && enrollmentResult.data.is_test)) {
    throw new Error("Could not calculate diploma readiness: enrollment is unavailable.");
  }

  const stageId = enrollmentResult.data.current_stage_id as string | null;
  let modulesQuery = admin
    .from("progress_modules")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("program_id", input.programId)
    .eq("status", "active");
  if (stageId) modulesQuery = modulesQuery.eq("stage_id", stageId);
  const modulesResult = await modulesQuery;
  assertResult(modulesResult.error, "readiness modules");
  const moduleIds = ((modulesResult.data ?? []) as Array<{ id: string }>).map((row) => row.id);

  const [itemsResult, assessmentsResult, attendanceResult, readinessResult] =
    await Promise.all([
      moduleIds.length
        ? admin
            .from("progress_items")
            .select("id, name, positive_goal, completion_threshold")
            .eq("tenant_id", input.tenantId)
            .in("module_id", moduleIds)
            .eq("status", "active")
            .eq("required_for_completion", true)
        : Promise.resolve({ data: [], error: null }),
      moduleIds.length
        ? admin
            .from("participant_progress_assessments")
            .select("item_id, score, assessed_at, is_test")
            .eq("tenant_id", input.tenantId)
            .eq("participant_id", input.participantId)
            .in("module_id", moduleIds)
            .order("assessed_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("session_attendance")
        .select("status, marked_at, is_test")
        .eq("tenant_id", input.tenantId)
        .eq("participant_id", input.participantId)
        .order("marked_at", { ascending: false })
        .limit(10),
      stageId
        ? admin
            .from("graduation_readiness")
            .select("status, source, is_test")
            .eq("tenant_id", input.tenantId)
            .eq("participant_id", input.participantId)
            .eq("program_id", input.programId)
            .eq("stage_id", stageId)
            .order("reviewed_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

  for (const [label, result] of [
    ["readiness items", itemsResult],
    ["readiness assessments", assessmentsResult],
    ["readiness attendance", attendanceResult],
    ["human readiness recommendation", readinessResult]
  ] as const) {
    assertResult(result.error, label);
  }

  const items = (itemsResult.data ?? []) as ReadinessItemRow[];
  const itemById = new Map(items.map((row) => [row.id, row]));
  const assessments = ((assessmentsResult.data ?? []) as ReadinessAssessmentRow[])
    .filter((row) => includeTestData || !row.is_test)
    .map((row) => {
      const threshold = Number(itemById.get(row.item_id)?.completion_threshold ?? 4);
      return {
        skillId: row.item_id,
        score: normalizeToSharedThreshold(Number(row.score), threshold),
        assessedAt: row.assessed_at
      };
    });
  const attendance = ((attendanceResult.data ?? []) as ReadinessAttendanceRow[])
    .filter((row) => includeTestData || !row.is_test)
    .map((row) => ({ status: row.status, sessionStartsAt: row.marked_at }));
  const recommendationRow = readinessResult.data as {
    status: "not_ready" | "nearly_ready" | "ready" | "invited" | "completed" | "blocked";
    source: string;
    is_test: boolean;
  } | null;
  const recommendation = normalizeHumanRecommendation(
    recommendationRow &&
      (!recommendationRow.is_test || includeTestData) &&
      recommendationRow.source !== "journey_simulation_bot"
      ? recommendationRow.status
      : null
  );

  return computeDiplomaReadiness({
    participantId: input.participantId,
    programId: input.programId,
    requiredSkills: items.map((row) => ({
      id: row.id,
      label: row.positive_goal ?? row.name
    })),
    assessments,
    attendance,
    instructorRecommendation: recommendation
  });
}

export async function generateLessonFocusCards(input: {
  tenantId: string;
  sessionId: string;
  includeTestData?: boolean;
}): Promise<Array<LessonFocusCard & { id: string; status: "active" | "treated" | "dismissed" }>> {
  const includeTestData = allowTestData(input.includeTestData ?? false);
  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("id, group_id, is_test, journey_run_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sessionId)
    .maybeSingle();
  assertResult(sessionResult.error, "lesson-focus session");
  if (!sessionResult.data || (!includeTestData && sessionResult.data.is_test)) return [];

  const groupId = sessionResult.data.group_id as string;
  const [membershipsResult, catchUpResult, participantsResult, assessmentsResult, itemsResult, existingResult] =
    await Promise.all([
      admin
        .from("group_memberships")
        .select("participant_id, is_test, journey_run_id")
        .eq("tenant_id", input.tenantId)
        .eq("group_id", groupId)
        .in("status", ["active", "trial"]),
      admin
        .from("catch_up_requests")
        .select("participant_id")
        .eq("tenant_id", input.tenantId)
        .eq("assigned_session_id", input.sessionId)
        .eq("status", "approved"),
      admin
        .from("participants")
        .select("id, display_name, is_test, journey_run_id")
        .eq("tenant_id", input.tenantId),
      admin
        .from("participant_progress_assessments")
        .select("participant_id, item_id, score, assessed_at, is_test, journey_run_id")
        .eq("tenant_id", input.tenantId)
        .eq("group_id", groupId)
        .order("assessed_at", { ascending: false }),
      admin
        .from("progress_items")
        .select("id, name, positive_goal")
        .eq("tenant_id", input.tenantId)
        .eq("status", "active"),
      admin
        .from("lesson_focus_cards")
        .select("id, participant_id, focus_points_json, status, is_test, journey_run_id, treated_at, treated_by_user_id")
        .eq("tenant_id", input.tenantId)
        .eq("session_id", input.sessionId)
    ]);

  for (const [label, result] of [
    ["lesson-focus memberships", membershipsResult],
    ["lesson-focus catch-up roster", catchUpResult],
    ["lesson-focus participants", participantsResult],
    ["lesson-focus assessments", assessmentsResult],
    ["lesson-focus items", itemsResult],
    ["existing lesson-focus cards", existingResult]
  ] as const) {
    assertResult(result.error, label);
  }

  const regularMemberships = ((membershipsResult.data ?? []) as FocusMembershipRow[]).filter(
    (row) => includeTestData || !row.is_test
  );
  const participantRows = (participantsResult.data ?? []) as FocusParticipantRow[];
  const participantSourceById = new Map(participantRows.map((row) => [row.id, row]));
  const catchUpMemberships = ((catchUpResult.data ?? []) as Array<{ participant_id: string }>)
    .flatMap((row) => {
      const participant = participantSourceById.get(row.participant_id);
      if (!participant || (!includeTestData && participant.is_test)) return [];
      return [{
        participant_id: participant.id,
        is_test: participant.is_test,
        journey_run_id: participant.journey_run_id
      }];
    });
  const memberships = [
    ...regularMemberships,
    ...catchUpMemberships.filter((row) =>
      !regularMemberships.some((membership) => membership.participant_id === row.participant_id)
    )
  ];
  const participantIds = new Set(memberships.map((row) => row.participant_id));
  const participantById = new Map(
    participantRows
      .filter((row) => participantIds.has(row.id))
      .map((row) => [row.id, row])
  );
  const assessments = ((assessmentsResult.data ?? []) as FocusAssessmentRow[]).filter(
    (row) => participantIds.has(row.participant_id) && (includeTestData || !row.is_test)
  );
  const itemById = new Map(
    ((itemsResult.data ?? []) as ProgressItemRow[]).map((row) => [row.id, row])
  );
  const existingByParticipant = new Map(
    ((existingResult.data ?? []) as ExistingFocusRow[]).map((row) => [row.participant_id, row])
  );
  const [attendanceRisks, bottlenecks] = await Promise.all([
    detectAttendanceRisks(input.tenantId, { includeTestData }),
    detectProgressBottlenecks({
      tenantId: input.tenantId,
      groupId,
      includeTestData,
      period: {
        from: new Date(Date.now() - 84 * dayMs).toISOString(),
        to: new Date().toISOString()
      }
    })
  ]);
  const candidates: LessonFocusCandidate[] = [];

  for (const membership of memberships) {
    const participant = participantById.get(membership.participant_id);
    if (!participant) continue;
    const participantAssessments = assessments.filter(
      (row) => row.participant_id === participant.id
    );
    const latestByItem = new Map<string, FocusAssessmentRow>();
    for (const assessment of participantAssessments) {
      if (!latestByItem.has(assessment.item_id)) latestByItem.set(assessment.item_id, assessment);
    }
    const lowest = [...latestByItem.values()].sort(
      (left, right) => left.score - right.score || right.assessed_at.localeCompare(left.assessed_at)
    )[0];
    if (lowest && lowest.score <= 3) {
      const item = itemById.get(lowest.item_id);
      if (item) candidates.push({
        participantId: participant.id,
        participantName: participant.display_name,
        sourceType: "low_skill",
        sourceId: lowest.item_id,
        label: item.positive_goal ?? item.name,
        explanation: "Gebaseerd op de meest recente actieve vaardigheidsobservatie.",
        priority: lowest.score <= 2 ? 90 : 70,
        sensitive: false,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      });
    }

    for (const [itemId, itemAssessments] of groupBy(
      participantAssessments,
      (row) => row.item_id
    )) {
      const recent = itemAssessments.slice(0, 3);
      if (
        recent.length >= 2 &&
        Math.max(...recent.map((row) => row.score)) -
          Math.min(...recent.map((row) => row.score)) >= 2
      ) {
        const item = itemById.get(itemId);
        if (item) candidates.push({
          participantId: participant.id,
          participantName: participant.display_name,
          sourceType: "unstable_skill",
          sourceId: itemId,
          label: item.positive_goal ?? item.name,
          explanation: "Herhaal dit rustig zodat de instructeur de stabiliteit kan observeren.",
          priority: 80,
          sensitive: false,
          isTest: participant.is_test,
          journeyRunId: participant.journey_run_id
        });
      }
    }

    const risk = attendanceRisks.find((row) => row.participant_id === participant.id);
    if (risk) candidates.push({
      participantId: participant.id,
      participantName: participant.display_name,
      sourceType: "attendance",
      sourceId: null,
      label: "Start met een warme check-in en een haalbaar succesmoment",
      explanation: "Ondersteunend aanwezigheidssignaal; er wordt geen oorzaak verondersteld.",
      priority: risk.risk_level === "high" ? 85 : 65,
      sensitive: false,
      isTest: participant.is_test,
      journeyRunId: participant.journey_run_id
    });

    for (const bottleneck of bottlenecks.filter((row) =>
      row.participant_ids.includes(participant.id)
    ).slice(0, 1)) {
      candidates.push({
        participantId: participant.id,
        participantName: participant.display_name,
        sourceType: "group_bottleneck",
        sourceId: bottleneck.skill_id,
        label: bottleneck.suggested_lesson_focus,
        explanation: `Positieve groepsfocus op basis van ${bottleneck.total_count} observaties.`,
        priority: 60,
        sensitive: false,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      });
    }

    const existing = existingByParticipant.get(participant.id);
    for (const point of parseFocusPoints(existing?.focus_points_json).filter(
      (point) => point.source_type === "manual"
    )) {
      candidates.push({
        participantId: participant.id,
        participantName: participant.display_name,
        sourceType: "manual",
        sourceId: point.source_id,
        label: point.label,
        explanation: point.explanation,
        priority: 100,
        sensitive: false,
        isTest: participant.is_test,
        journeyRunId: participant.journey_run_id
      });
    }
  }

  const cards = buildLessonFocusCards(candidates);
  for (const card of cards) {
    const existing = existingByParticipant.get(card.participant_id);
    const result = await admin
      .from("lesson_focus_cards")
      .upsert({
        tenant_id: input.tenantId,
        session_id: input.sessionId,
        participant_id: card.participant_id,
        focus_points_json: card.points,
        status: existing?.status ?? "active",
        generated_at: new Date().toISOString(),
        treated_at: existing?.status === "treated" ? existing.treated_at : null,
        treated_by_user_id: existing?.status === "treated" ? existing.treated_by_user_id : null,
        source: card.is_test ? "journey_simulation_bot" : "lesson_focus_engine",
        is_test: card.is_test,
        journey_run_id: card.journey_run_id
      }, { onConflict: "tenant_id,session_id,participant_id" })
      .select("id, status")
      .single();
    assertResult(result.error, "generated lesson-focus card");
    if (!result.data) throw new Error("Could not calculate generated lesson-focus card: missing result.");
    existingByParticipant.set(card.participant_id, {
      ...(existing ?? {
        participant_id: card.participant_id,
        focus_points_json: card.points,
        is_test: card.is_test,
        journey_run_id: card.journey_run_id,
        treated_at: null,
        treated_by_user_id: null
      }),
      id: result.data.id,
      status: result.data.status
    });
  }

  return cards.map((card) => {
    const persisted = existingByParticipant.get(card.participant_id)!;
    return {
      ...card,
      id: persisted.id,
      status: persisted.status
    };
  });
}

type SessionRow = {
  id: string;
  group_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type MembershipRow = {
  group_id: string;
  participant_id: string;
  starts_on: string;
  ends_on: string | null;
  status: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type AttendanceRow = {
  session_id: string;
  participant_id: string;
  status: string;
  marked_at: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type CancellationRow = {
  participant_id: string;
  session_id: string;
  status: string;
  policy_status: string;
  requested_at: string;
};
type ContactRow = { participant_id: string | null; created_at: string };
type TestParticipantRow = { id: string; is_test: boolean; journey_run_id: string | null };
type AssessmentRow = {
  participant_id: string;
  program_id: string | null;
  stage_id: string | null;
  group_id: string | null;
  item_id: string;
  score: number;
  assessed_by_user_id: string | null;
  assessed_at: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type ProgressItemRow = {
  id: string;
  name: string;
  positive_goal: string | null;
  status?: string;
};
type ReadinessItemRow = ProgressItemRow & { completion_threshold: number };
type ReadinessAssessmentRow = {
  item_id: string;
  score: number;
  assessed_at: string;
  is_test: boolean;
};
type ReadinessAttendanceRow = { status: string; marked_at: string; is_test: boolean };
type FocusMembershipRow = {
  participant_id: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type FocusParticipantRow = {
  id: string;
  display_name: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type FocusAssessmentRow = {
  participant_id: string;
  item_id: string;
  score: number;
  assessed_at: string;
  is_test: boolean;
  journey_run_id: string | null;
};
type FocusPoint = {
  fingerprint: string;
  source_type: LessonFocusCandidate["sourceType"];
  source_id: string | null;
  label: string;
  explanation: string;
};
type ExistingFocusRow = {
  id: string;
  participant_id: string;
  focus_points_json: unknown;
  status: "active" | "treated" | "dismissed";
  is_test: boolean;
  journey_run_id: string | null;
  treated_at: string | null;
  treated_by_user_id: string | null;
};

function parseFocusPoints(value: unknown): FocusPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const row = point as Record<string, unknown>;
    if (
      typeof row.label !== "string" ||
      typeof row.explanation !== "string" ||
      typeof row.source_type !== "string"
    ) return [];
    return [{
      fingerprint: typeof row.fingerprint === "string" ? row.fingerprint : "",
      source_type: row.source_type as FocusPoint["source_type"],
      source_id: typeof row.source_id === "string" ? row.source_id : null,
      label: row.label,
      explanation: row.explanation
    }];
  });
}

function normalizeToSharedThreshold(score: number, threshold: number) {
  if (threshold === 4) return score;
  if (score >= threshold) return 4;
  return Math.min(3, score);
}

function normalizeHumanRecommendation(
  status: "not_ready" | "nearly_ready" | "ready" | "invited" | "completed" | "blocked" | null
) {
  if (status === "invited" || status === "completed") return "ready" as const;
  return status;
}

function groupBy<T, K>(rows: T[], getKey: (row: T) => K) {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  return grouped;
}

function allowTestData(requested: boolean) {
  if (!requested) return false;
  return ["development", "staging"].includes(
    String(process.env.APP_ENV ?? process.env.NODE_ENV).toLowerCase()
  );
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not calculate ${label}: ${error.message}`);
}

const dayMs = 86_400_000;
