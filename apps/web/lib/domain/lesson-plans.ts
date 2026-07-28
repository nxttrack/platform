import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { buildLessonPlanProposal, type LessonPlanFocusCard, type LessonPlanProposal } from "./lesson-plan-contract";
import { generateLessonFocusCards } from "./learning-intelligence";

type LessonPlanSession = {
  id: string;
  groupId: string;
  groupName: string;
  stageName: string | null;
  resourceName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  isTest: boolean;
  journeyRunId: string | null;
};

export type LessonPlanView = {
  id: string;
  sessionId: string;
  status: "draft" | "approved" | "completed" | "archived";
  currentVersionId: string;
  versionNumber: number;
  proposal: LessonPlanProposal;
  approvedAt: string | null;
  evaluatedAt: string | null;
  evaluation: { outcome: string; workedWell: string; nextAdjustment: string; observationNote: string } | null;
  versions: Array<{ id: string; number: number; confidence: string; createdAt: string }>;
};

export async function getLessonPlanWorkspace(input: {
  tenantId: string;
  userId: string;
  canManageTenant: boolean;
  selectedSessionId?: string | null;
}) {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const until = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const [sessionsResult, groupsResult, stagesResult, resourcesResult, groupAssignmentsResult, sessionAssignmentsResult] = await Promise.all([
    admin.from("sessions").select("id, group_id, resource_id, starts_at, ends_at, status, is_test, journey_run_id").eq("tenant_id", input.tenantId).gte("starts_at", since).lte("starts_at", until).order("starts_at"),
    admin.from("groups").select("id, name, stage_id").eq("tenant_id", input.tenantId),
    admin.from("program_stages").select("id, name, badge_label").eq("tenant_id", input.tenantId),
    admin.from("resources").select("id, name").eq("tenant_id", input.tenantId),
    input.canManageTenant
      ? Promise.resolve({ data: [], error: null })
      : admin.from("group_instructor_assignments").select("group_id").eq("tenant_id", input.tenantId).eq("instructor_user_id", input.userId).eq("status", "active"),
    input.canManageTenant
      ? Promise.resolve({ data: [], error: null })
      : admin.from("session_instructor_assignments").select("session_id").eq("tenant_id", input.tenantId).eq("instructor_user_id", input.userId).eq("status", "active")
  ]);
  for (const [label, result] of [
    ["sessions", sessionsResult],
    ["groups", groupsResult],
    ["stages", stagesResult],
    ["resources", resourcesResult],
    ["group assignments", groupAssignmentsResult],
    ["session assignments", sessionAssignmentsResult]
  ] as const) assertResult(result.error, `lesson plan ${label}`);
  const assignedGroups = new Set((groupAssignmentsResult.data ?? []).map((row) => row.group_id));
  const assignedSessions = new Set((sessionAssignmentsResult.data ?? []).map((row) => row.session_id));
  const groupById = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
  const stageById = new Map((stagesResult.data ?? []).map((row) => [row.id, row]));
  const resourceById = new Map((resourcesResult.data ?? []).map((row) => [row.id, row]));
  const sessions: LessonPlanSession[] = (sessionsResult.data ?? []).flatMap((session) => {
    if (!input.canManageTenant && !assignedGroups.has(session.group_id) && !assignedSessions.has(session.id)) return [];
    const group = groupById.get(session.group_id);
    if (!group) return [];
    const stage = group.stage_id ? stageById.get(group.stage_id) : null;
    return [{
      id: session.id,
      groupId: session.group_id,
      groupName: group.name,
      stageName: stage?.badge_label ?? stage?.name ?? null,
      resourceName: session.resource_id ? resourceById.get(session.resource_id)?.name ?? null : null,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
      status: session.status,
      isTest: session.is_test,
      journeyRunId: session.journey_run_id
    }];
  });
  const selected = sessions.find((session) => session.id === input.selectedSessionId)
    ?? sessions.find((session) => session.status === "scheduled" && new Date(session.startsAt) >= new Date())
    ?? sessions[0]
    ?? null;
  const plansResult = sessions.length
    ? await admin.from("lesson_plans").select("id, session_id, current_version_id, status, approved_at, evaluated_at, evaluation_json").eq("tenant_id", input.tenantId).in("session_id", sessions.map((session) => session.id))
    : { data: [], error: null };
  assertResult(plansResult.error, "lesson plans");
  const planIds = (plansResult.data ?? []).map((plan) => plan.id);
  const versionsResult = planIds.length
    ? await admin.from("lesson_plan_versions").select("id, lesson_plan_id, version_number, proposal_json, confidence, created_at").eq("tenant_id", input.tenantId).in("lesson_plan_id", planIds).order("version_number", { ascending: false })
    : { data: [], error: null };
  assertResult(versionsResult.error, "lesson plan versions");
  const versions = versionsResult.data ?? [];
  const plansBySession = new Map<string, LessonPlanView>((plansResult.data ?? []).flatMap((plan): Array<[string, LessonPlanView]> => {
    const current = versions.find((version) => version.id === plan.current_version_id);
    if (!current || !isLessonPlanProposal(current.proposal_json)) return [];
    return [[plan.session_id, {
      id: plan.id,
      sessionId: plan.session_id,
      status: plan.status as LessonPlanView["status"],
      currentVersionId: current.id,
      versionNumber: current.version_number,
      proposal: current.proposal_json,
      approvedAt: plan.approved_at,
      evaluatedAt: plan.evaluated_at,
      evaluation: normalizeEvaluation(plan.evaluation_json),
      versions: versions.filter((version) => version.lesson_plan_id === plan.id).map((version) => ({
        id: version.id,
        number: version.version_number,
        confidence: version.confidence,
        createdAt: version.created_at
      }))
    }]];
  }));
  const existingFocus = selected ? await loadExistingFocusCards(input.tenantId, selected.id) : [];
  const preview = selected ? buildLessonPlanProposal({
    sessionId: selected.id,
    groupName: selected.groupName,
    stageName: selected.stageName,
    durationMinutes: durationMinutes(selected.startsAt, selected.endsAt),
    focusCards: existingFocus
  }) : null;
  return {
    sessions,
    selected,
    selectedPlan: selected ? plansBySession.get(selected.id) ?? null : null,
    plansBySession,
    preview,
    metrics: {
      scheduled: sessions.filter((session) => session.status === "scheduled").length,
      drafts: [...plansBySession.values()].filter((plan) => plan.status === "draft").length,
      approved: [...plansBySession.values()].filter((plan) => plan.status === "approved").length,
      completed: [...plansBySession.values()].filter((plan) => plan.status === "completed").length
    }
  };
}

export async function calculateLessonPlanForSession(tenantId: string, sessionId: string) {
  const admin = createAdminClient();
  const sessionResult = await admin.from("sessions").select("id, group_id, starts_at, ends_at, is_test, journey_run_id").eq("tenant_id", tenantId).eq("id", sessionId).maybeSingle();
  assertResult(sessionResult.error, "lesson plan session");
  if (!sessionResult.data) throw new Error("lesson_plan_session_not_found");
  const groupResult = await admin.from("groups").select("id, name, stage_id").eq("tenant_id", tenantId).eq("id", sessionResult.data.group_id).maybeSingle();
  assertResult(groupResult.error, "lesson plan group");
  if (!groupResult.data) throw new Error("lesson_plan_group_not_found");
  const stageResult = groupResult.data.stage_id
    ? await admin.from("program_stages").select("name, badge_label").eq("tenant_id", tenantId).eq("id", groupResult.data.stage_id).maybeSingle()
    : { data: null, error: null };
  assertResult(stageResult.error, "lesson plan stage");
  const generated = await generateLessonFocusCards({
    tenantId,
    sessionId,
    includeTestData: sessionResult.data.is_test
  });
  const focusCards: LessonPlanFocusCard[] = generated.map((card) => ({
    participantId: card.participant_id,
    participantName: card.participant_name,
    points: card.points.map((point) => ({
      label: point.label,
      explanation: point.explanation,
      sourceType: point.source_type
    }))
  }));
  const proposal = buildLessonPlanProposal({
    sessionId,
    groupName: groupResult.data.name,
    stageName: stageResult.data?.badge_label ?? stageResult.data?.name ?? null,
    durationMinutes: durationMinutes(sessionResult.data.starts_at, sessionResult.data.ends_at),
    focusCards
  });
  return {
    proposal,
    groupId: sessionResult.data.group_id,
    isTest: sessionResult.data.is_test,
    journeyRunId: sessionResult.data.journey_run_id
  };
}

async function loadExistingFocusCards(tenantId: string, sessionId: string): Promise<LessonPlanFocusCard[]> {
  const admin = createAdminClient();
  const cardsResult = await admin.from("lesson_focus_cards").select("participant_id, focus_points_json").eq("tenant_id", tenantId).eq("session_id", sessionId).neq("status", "dismissed");
  assertResult(cardsResult.error, "lesson focus cards");
  const participantIds = [...new Set((cardsResult.data ?? []).map((card) => card.participant_id))];
  const participantsResult = participantIds.length
    ? await admin.from("participants").select("id, display_name").eq("tenant_id", tenantId).in("id", participantIds)
    : { data: [], error: null };
  assertResult(participantsResult.error, "lesson focus participants");
  const participantNames = new Map((participantsResult.data ?? []).map((participant) => [participant.id, participant.display_name]));
  return (cardsResult.data ?? []).map((card) => ({
    participantId: card.participant_id,
    participantName: participantNames.get(card.participant_id) ?? "Leerling",
    points: normalizeFocusPoints(card.focus_points_json)
  }));
}

function normalizeFocusPoints(value: unknown): LessonPlanFocusCard["points"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 3).flatMap((point) => {
    if (!point || typeof point !== "object" || Array.isArray(point)) return [];
    const row = point as Record<string, unknown>;
    return typeof row.label === "string" && typeof row.explanation === "string"
      ? [{ label: row.label, explanation: row.explanation, sourceType: typeof row.source_type === "string" ? row.source_type : "derived" }]
      : [];
  });
}

function isLessonPlanProposal(value: unknown): value is LessonPlanProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proposal = value as Partial<LessonPlanProposal>;
  return Array.isArray(proposal.groupGoals)
    && proposal.groupGoals.length >= 1
    && proposal.groupGoals.length <= 3
    && Array.isArray(proposal.personalAttention)
    && proposal.personalAttention.length <= 3
    && Array.isArray(proposal.exercises)
    && proposal.exercises.length >= 2
    && Array.isArray(proposal.equipment)
    && Array.isArray(proposal.evaluationPrompts)
    && proposal.humanApprovalRequired === true;
}

function normalizeEvaluation(value: unknown): LessonPlanView["evaluation"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    outcome: String(row.outcome ?? ""),
    workedWell: String(row.workedWell ?? ""),
    nextAdjustment: String(row.nextAdjustment ?? ""),
    observationNote: String(row.observationNote ?? "")
  };
}

function durationMinutes(startsAt: string, endsAt: string) {
  return Math.max(20, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000));
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
