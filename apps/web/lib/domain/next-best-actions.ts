import { addAmsterdamCalendarDays, toAmsterdamDate } from "../date/business-date";
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { forecastCapacity } from "./capacity-forecast";
import { deriveDaypart, type IntakeDaypart } from "./intake-recommendation-contract";
import {
  detectNextBestActions,
  type NextBestActionCandidate,
  type NextBestActionInput,
  type NextBestActionReason,
  type NextBestActionType
} from "./next-best-actions-contract";
import { calculateWaitTimeBands } from "./wait-time";
import { detectAttendanceRisks, detectProgressBottlenecks } from "./learning-intelligence";
import type { WaitTimeQuery } from "./wait-time-contract";

export type NextBestActionRow = {
  id: string;
  action_type: NextBestActionType;
  fingerprint: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  status: "open" | "dismissed" | "completed" | "auto_resolved";
  entity_type: string | null;
  entity_id: string | null;
  participant_id: string | null;
  guardian_id: string | null;
  group_id: string | null;
  program_id: string | null;
  due_at: string | null;
  reasons_json: NextBestActionReason[];
  suggested_actions_json: Array<{ label: string; href: string }>;
  source_href: string;
  confidence: number;
  is_test: boolean;
  journey_run_id: string | null;
  last_generated_at: string;
  dismissed_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export async function generateNextBestActions(
  tenantId: string,
  options: { includeTestData?: boolean } = {}
) {
  const includeTestData = allowTestData(options.includeTestData ?? false);
  const model = await loadNextBestActionModel(tenantId, includeTestData);
  const candidates = detectNextBestActions(model);
  const admin = createAdminClient();
  const existingResult = await admin
    .from("next_best_actions")
    .select("id, fingerprint, status")
    .eq("tenant_id", tenantId);
  assertNextBestActionResult(existingResult.error, "existing actions");
  const existing = (existingResult.data ?? []) as Array<{ id: string; fingerprint: string; status: string }>;
  const existingByFingerprint = new Map(existing.map((row) => [row.fingerprint, row]));
  const generatedAt = model.now;
  let opened = 0;
  let preserved = 0;

  for (const candidate of candidates) {
    const previous = existingByFingerprint.get(candidate.fingerprint);
    if (previous && ["dismissed", "completed"].includes(previous.status)) {
      const touchResult = await admin
        .from("next_best_actions")
        .update({ last_generated_at: generatedAt })
        .eq("tenant_id", tenantId)
        .eq("id", previous.id);
      assertNextBestActionResult(touchResult.error, "preserved action");
      preserved += 1;
      continue;
    }
    const upsertResult = await admin
      .from("next_best_actions")
      .upsert(toDatabaseRow(tenantId, candidate, generatedAt), {
        onConflict: "tenant_id,fingerprint"
      });
    assertNextBestActionResult(upsertResult.error, "generated action");
    opened += 1;
  }

  const activeFingerprints = new Set(candidates.map((candidate) => candidate.fingerprint));
  const staleOpenIds = existing
    .filter((row) => row.status === "open" && !activeFingerprints.has(row.fingerprint))
    .map((row) => row.id);
  if (staleOpenIds.length > 0) {
    const resolveResult = await admin
      .from("next_best_actions")
      .update({
        status: "auto_resolved",
        completed_at: generatedAt,
        completed_by_user_id: null
      })
      .eq("tenant_id", tenantId)
      .in("id", staleOpenIds);
    assertNextBestActionResult(resolveResult.error, "resolved stale actions");
  }

  return {
    detected: candidates.length,
    opened,
    preserved,
    autoResolved: staleOpenIds.length
  };
}

export async function getTenantNextBestActions(input: {
  tenantId: string;
  statuses?: NextBestActionRow["status"][];
  limit?: number;
}) {
  const admin = createAdminClient();
  let query = admin
    .from("next_best_actions")
    .select("id, action_type, fingerprint, title, description, priority, status, entity_type, entity_id, participant_id, guardian_id, group_id, program_id, due_at, reasons_json, suggested_actions_json, source_href, confidence, is_test, journey_run_id, last_generated_at, dismissed_at, completed_at, created_at")
    .eq("tenant_id", input.tenantId)
    .order("priority")
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("last_generated_at", { ascending: false })
    .limit(input.limit ?? 100);
  if (input.statuses?.length) query = query.in("status", input.statuses);
  const result = await query;
  assertNextBestActionResult(result.error, "next best actions");
  return ((result.data ?? []) as NextBestActionRow[]).sort((left, right) =>
    actionPriorityRank(left.priority) - actionPriorityRank(right.priority) ||
    (left.due_at ?? "9999").localeCompare(right.due_at ?? "9999") ||
    right.last_generated_at.localeCompare(left.last_generated_at)
  );
}

async function loadNextBestActionModel(tenantId: string, includeTestData: boolean): Promise<NextBestActionInput> {
  const admin = createAdminClient();
  const now = new Date();
  const today = toAmsterdamDate(now);
  const futureBoundary = new Date(now.getTime() + 21 * dayMs).toISOString();
  let intakesQuery = admin
    .from("intake_submissions")
    .select("id, program_id, status, received_at, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("status", ["received", "reviewing"]);
  let waitlistQuery = admin
    .from("waitlist_entries")
    .select("id, intake_submission_id, program_id, recommended_stage_id, status, priority_date, eligible_from, minimum_age_blocked, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("status", ["waiting", "reviewing", "offered"]);
  let membershipQuery = admin
    .from("group_memberships")
    .select("group_id, participant_id, status, capacity_weight, is_test")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trial"]);
  let qualityQuery = admin
    .from("data_quality_issues")
    .select("id, entity_type, entity_id, severity, title, description, suggested_action, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("status", "open");
  let readinessQuery = admin
    .from("graduation_readiness")
    .select("id, participant_id, program_id, stage_id, readiness_score, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("status", "ready");
  if (!includeTestData) {
    intakesQuery = intakesQuery.eq("is_test", false);
    waitlistQuery = waitlistQuery.eq("is_test", false);
    membershipQuery = membershipQuery.eq("is_test", false);
    qualityQuery = qualityQuery.eq("is_test", false);
    readinessQuery = readinessQuery.eq("is_test", false);
  }

  const [
    intakesResult,
    waitlistResult,
    preferencesResult,
    offersResult,
    groupsResult,
    membershipsResult,
    assignmentsResult,
    resourcesResult,
    sessionsResult,
    invoicesResult,
    participantsResult,
    qualityResult,
    readinessResult,
    creditsResult,
    leadScoresResult
  ] = await Promise.all([
    intakesQuery,
    waitlistQuery,
    admin
      .from("waitlist_preferences")
      .select("waitlist_entry_id, weekday, starts_after, ends_before")
      .eq("tenant_id", tenantId),
    admin
      .from("slot_offers")
      .select("id, waitlist_entry_id, group_id, status, offered_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("status", "sent"),
    admin
      .from("groups")
      .select("id, name, program_id, stage_id, default_resource_id, default_weekday, default_start_time, default_end_time, capacity, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    membershipQuery,
    admin
      .from("group_instructor_assignments")
      .select("group_id, status, starts_on, ends_on")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    admin
      .from("resources")
      .select("id, kind, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status, is_test")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", now.toISOString())
      .lte("starts_at", futureBoundary),
    admin
      .from("billing_invoices")
      .select("id, participant_id, guardian_user_id, due_on, total_cents, status")
      .eq("tenant_id", tenantId)
      .in("status", ["issued", "sent"]),
    admin
      .from("participants")
      .select("id, is_test, journey_run_id")
      .eq("tenant_id", tenantId),
    qualityQuery,
    readinessQuery,
    admin
      .from("catch_up_credits")
      .select("id, participant_id, expires_on, status")
      .eq("tenant_id", tenantId)
      .eq("status", "available")
      .not("expires_on", "is", null)
      .gte("expires_on", today)
      .lte("expires_on", addAmsterdamCalendarDays(now, 14)),
    admin
      .from("lead_score_snapshots")
      .select("intake_submission_id, score, confidence, reasons_json, suggested_next_action, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
      .eq("model_version", "lead-score-v1")
      .gte("score", 75)
  ]);

  for (const [label, result] of [
    ["intakes", intakesResult],
    ["waitlist", waitlistResult],
    ["waitlist preferences", preferencesResult],
    ["slot offers", offersResult],
    ["groups", groupsResult],
    ["group memberships", membershipsResult],
    ["instructor assignments", assignmentsResult],
    ["resources", resourcesResult],
    ["sessions", sessionsResult],
    ["invoices", invoicesResult],
    ["participants", participantsResult],
    ["data quality", qualityResult],
    ["graduation readiness", readinessResult],
    ["catch-up credits", creditsResult],
    ["lead scores", leadScoresResult]
  ] as const) {
    assertNextBestActionResult(result.error, label);
  }

  const waitlistRows = (waitlistResult.data ?? []) as Array<{
    id: string;
    intake_submission_id: string | null;
    program_id: string;
    recommended_stage_id: string | null;
    status: string;
    priority_date: string;
    eligible_from: string | null;
    minimum_age_blocked: boolean;
    is_test: boolean;
    journey_run_id: string | null;
  }>;
  const waitlistById = new Map(waitlistRows.map((row) => [row.id, row]));
  const waitlistedIntakeIds = new Set(waitlistRows.flatMap((row) => row.intake_submission_id ? [row.intake_submission_id] : []));
  const intakeProgramById = new Map(
    ((intakesResult.data ?? []) as Array<{ id: string; program_id: string | null }>).map((row) => [row.id, row.program_id])
  );
  const preferencesByEntry = groupBy(
    (preferencesResult.data ?? []) as Array<{
      waitlist_entry_id: string;
      weekday: number;
      starts_after: string | null;
      ends_before: string | null;
    }>,
    (row) => row.waitlist_entry_id
  );
  const participantById = new Map(
    ((participantsResult.data ?? []) as Array<{ id: string; is_test: boolean; journey_run_id: string | null }>)
      .map((participant) => [participant.id, participant])
  );
  const memberships = (membershipsResult.data ?? []) as Array<{
    group_id: string;
    participant_id: string;
    capacity_weight: number;
    is_test: boolean;
  }>;
  const usedByGroup = new Map<string, number>();
  const testUsedByGroup = new Map<string, number>();
  for (const membership of memberships) {
    const target = membership.is_test ? testUsedByGroup : usedByGroup;
    target.set(membership.group_id, (target.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }
  const assignmentsByGroup = groupBy(
    (assignmentsResult.data ?? []) as Array<{
      group_id: string;
      starts_on: string | null;
      ends_on: string | null;
    }>,
    (row) => row.group_id
  );
  const groups = (groupsResult.data ?? []) as Array<{
    id: string;
    name: string;
    program_id: string;
    stage_id: string | null;
    default_resource_id: string | null;
    default_weekday: number | null;
    default_start_time: string | null;
    default_end_time: string | null;
    capacity: number;
  }>;
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const sessions = (sessionsResult.data ?? []) as Array<{
    id: string;
    group_id: string;
    resource_id: string | null;
    starts_at: string;
    ends_at: string;
    is_test: boolean;
  }>;
  const schedulableResources = ((resourcesResult.data ?? []) as Array<{ id: string; kind: string; status: string }>)
    .filter((resource) => ["pool", "lane", "room", "other"].includes(resource.kind));

  const waitlist = waitlistRows.map((entry) => {
    const preferences = preferencesByEntry.get(entry.id) ?? [];
    return {
      id: entry.id,
      programId: entry.program_id,
      stageId: entry.recommended_stage_id,
      eligibleFrom: entry.eligible_from,
      minimumAgeBlocked: entry.minimum_age_blocked,
      preferredDays: [...new Set(preferences.map((preference) => preference.weekday))],
      preferredTimeBlocks: [...new Set(preferences.flatMap((preference) => preferenceTimeBlocks(preference)))],
      priorityDate: entry.priority_date,
      isTest: entry.is_test,
      journeyRunId: entry.journey_run_id
    };
  });
  const demandScopes = uniqueDemandScopes(waitlist);
  const waitRequests: WaitTimeQuery[] = demandScopes.map((scope) => ({
    programId: scope.programId,
    stageId: scope.stageId,
    preferredDay: scope.weekday,
    preferredTimeBlock: asDaypart(scope.timeBlock)
  }));
  const waitPredictions = await calculateWaitTimeBands({
    tenantId,
    includeTestData,
    persist: true,
    requests: waitRequests
  });
  const predictionByScope = new Map(waitPredictions.map((row) => [waitScopeKey(row.query), row.prediction]));

  const demandWindows: NextBestActionInput["demandWindows"] = demandScopes.map((scope) => {
    const scopeEntries = waitlist.filter((entry) =>
      entry.isTest === scope.isTest &&
      entry.programId === scope.programId &&
      (!scope.stageId || entry.stageId === scope.stageId) &&
      entry.preferredDays.includes(scope.weekday) &&
      (!scope.timeBlock || entry.preferredTimeBlocks.length === 0 || entry.preferredTimeBlocks.includes(scope.timeBlock))
    );
    const matchingGroups = groups.filter((group) =>
      group.program_id === scope.programId &&
      (!scope.stageId || group.stage_id === scope.stageId) &&
      group.default_weekday === scope.weekday &&
      (!scope.timeBlock || (group.default_start_time && deriveDaypart(group.default_start_time) === scope.timeBlock))
    );
    const candidateCount = scopeEntries.filter((entry) =>
      !entry.minimumAgeBlocked || (!!entry.eligibleFrom && entry.eligibleFrom <= today)
    ).length;
    const prediction = predictionByScope.get(waitScopeKey({
      programId: scope.programId,
      stageId: scope.stageId,
      preferredDay: scope.weekday,
      preferredTimeBlock: asDaypart(scope.timeBlock)
    }));
    return {
      ...scope,
      candidateCount,
      matchingGroupCount: matchingGroups.length,
      fullGroupCount: matchingGroups.filter((group) =>
        ((scope.isTest ? testUsedByGroup : usedByGroup).get(group.id) ?? 0) >= group.capacity
      ).length,
      waitBand: prediction?.band ?? "insufficient_data",
      inflowPerWeek: prediction?.statistics.inflowPerWeek ?? 0,
      outflowPerWeek: prediction?.statistics.outflowPerWeek ?? 0,
      resourceWindowAvailable: hasFreeResourceWindow({
        weekday: scope.weekday,
        timeBlock: scope.timeBlock,
        resources: schedulableResources,
        sessions: includeTestData ? sessions : sessions.filter((session) => !session.is_test),
        now
      }),
      journeyRunId: singleJourneyRun(scopeEntries)
    };
  });
  const intelligencePeriodStart = new Date(now.getTime() - 84 * dayMs).toISOString();
  const [capacityForecastRows, attendanceRiskRows, progressBottleneckRows] = await Promise.all([
    forecastCapacity({
      tenantId,
      horizonWeeks: 8,
      includeTestData
    }),
    detectAttendanceRisks(tenantId, { includeTestData }),
    detectProgressBottlenecks({
      tenantId,
      includeTestData,
      period: { from: intelligencePeriodStart, to: now.toISOString() }
    })
  ]);

  return {
    now: now.toISOString(),
    intakes: ((intakesResult.data ?? []) as Array<{ id: string; program_id: string | null; received_at: string; is_test: boolean; journey_run_id: string | null }>)
      .filter((row) => !waitlistedIntakeIds.has(row.id))
      .map((row) => ({
        id: row.id,
        programId: row.program_id,
        receivedAt: row.received_at,
        isTest: row.is_test,
        journeyRunId: row.journey_run_id
      })),
    offers: ((offersResult.data ?? []) as Array<{ id: string; waitlist_entry_id: string; group_id: string; offered_at: string | null; expires_at: string }>).flatMap((offer) => {
      const entry = waitlistById.get(offer.waitlist_entry_id);
      if (!entry) return [];
      return [{
        id: offer.id,
        waitlistEntryId: offer.waitlist_entry_id,
        groupId: offer.group_id,
        offeredAt: offer.offered_at,
        expiresAt: offer.expires_at,
        isTest: entry.is_test,
        journeyRunId: entry.journey_run_id
      }];
    }),
    payments: ((invoicesResult.data ?? []) as Array<{ id: string; participant_id: string | null; guardian_user_id: string | null; due_on: string | null; total_cents: number; status: string }>).flatMap((invoice) => {
      const participant = invoice.participant_id ? participantById.get(invoice.participant_id) : null;
      if (!includeTestData && participant?.is_test) return [];
      return [{
        id: invoice.id,
        participantId: invoice.participant_id,
        guardianId: invoice.guardian_user_id,
        dueOn: invoice.due_on,
        amountCents: invoice.total_cents,
        status: invoice.status,
        isTest: participant?.is_test ?? false,
        journeyRunId: participant?.journey_run_id ?? null
      }];
    }),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      programId: group.program_id,
      stageId: group.stage_id,
      weekday: group.default_weekday,
      startsAt: group.default_start_time,
      fixedCapacity: group.capacity,
      usedCapacity: usedByGroup.get(group.id) ?? 0,
      hasInstructor: (assignmentsByGroup.get(group.id) ?? []).some((assignment) =>
        (!assignment.starts_on || assignment.starts_on <= today) &&
        (!assignment.ends_on || assignment.ends_on >= today)
      ),
      isTest: false
    })),
    waitlist,
    demandWindows,
    qualityIssues: ((qualityResult.data ?? []) as Array<{ id: string; entity_type: string; entity_id: string; severity: string; title: string; description: string; suggested_action: string; is_test: boolean; journey_run_id: string | null }>).map((issue) => ({
      id: issue.id,
      entityType: issue.entity_type,
      entityId: issue.entity_id,
      severity: issue.severity,
      title: issue.title,
      description: issue.description,
      suggestedAction: issue.suggested_action,
      isTest: issue.is_test,
      journeyRunId: issue.journey_run_id
    })),
    readiness: ((readinessResult.data ?? []) as Array<{ id: string; participant_id: string; program_id: string; stage_id: string; readiness_score: number | null; is_test: boolean; journey_run_id: string | null }>).map((row) => ({
      id: row.id,
      participantId: row.participant_id,
      programId: row.program_id,
      stageId: row.stage_id,
      readinessScore: row.readiness_score === null ? null : Number(row.readiness_score),
      isTest: row.is_test,
      journeyRunId: row.journey_run_id
    })),
    credits: ((creditsResult.data ?? []) as Array<{ id: string; participant_id: string; expires_on: string }>).flatMap((credit) => {
      const participant = participantById.get(credit.participant_id);
      if (!includeTestData && participant?.is_test) return [];
      return [{
        id: credit.id,
        participantId: credit.participant_id,
        expiresOn: credit.expires_on,
        isTest: participant?.is_test ?? false,
        journeyRunId: participant?.journey_run_id ?? null
      }];
    }),
    capacityForecasts: capacityForecastRows.map((forecast) => ({
      groupId: forecast.group_id,
      groupName: forecast.group_name,
      programId: forecast.program_id,
      riskLevel: forecast.risk_level,
      expectedBottlenecks: forecast.expected_bottlenecks,
      confidence: forecast.confidence,
      evidence: forecast.reasons.map((reason) => reason.evidence),
      isTest: forecast.is_test
    })),
    attendanceRisks: attendanceRiskRows.map((risk) => ({
      participantId: risk.participant_id,
      groupId: risk.group_id,
      signalType: risk.signal_type,
      riskLevel: risk.risk_level,
      reason: risk.reason,
      evidence: risk.evidence,
      confidence: risk.confidence,
      isTest: risk.is_test,
      journeyRunId: risk.journey_run_id
    })),
    progressBottlenecks: progressBottleneckRows.map((bottleneck) => ({
      groupId: bottleneck.group_id,
      programId: bottleneck.program_id,
      skillId: bottleneck.skill_id,
      skillLabel: bottleneck.skill_label,
      affectedCount: bottleneck.affected_count,
      totalCount: bottleneck.total_count,
      stagnationRate: bottleneck.stagnation_rate,
      confidence: bottleneck.confidence,
      suggestedFocus: bottleneck.suggested_lesson_focus,
      isTest: bottleneck.is_test,
      journeyRunId: bottleneck.journey_run_id
    })),
    leadScores: ((leadScoresResult.data ?? []) as Array<{
      intake_submission_id: string;
      score: number;
      confidence: number;
      reasons_json: Array<{ label: string; explanation: string; evidence: string }>;
      suggested_next_action: string;
      is_test: boolean;
      journey_run_id: string | null;
    }>)
      .filter((row) => includeTestData || (!row.is_test && row.journey_run_id === null))
      .map((row) => ({
        intakeId: row.intake_submission_id,
        programId: intakeProgramById.get(row.intake_submission_id) ?? null,
        score: Number(row.score),
        confidence: Number(row.confidence),
        suggestedAction: row.suggested_next_action,
        reasons: row.reasons_json,
        isTest: row.is_test,
        journeyRunId: row.journey_run_id
      }))
  };
}

function toDatabaseRow(tenantId: string, candidate: NextBestActionCandidate, generatedAt: string) {
  return {
    tenant_id: tenantId,
    action_type: candidate.actionType,
    fingerprint: candidate.fingerprint,
    title: candidate.title,
    description: candidate.description,
    priority: candidate.priority,
    status: "open",
    entity_type: candidate.entityType,
    entity_id: candidate.entityId,
    participant_id: candidate.participantId,
    guardian_id: candidate.guardianId,
    group_id: candidate.groupId,
    program_id: candidate.programId,
    due_at: candidate.dueAt,
    reasons_json: candidate.reasons,
    suggested_actions_json: candidate.suggestedActions,
    source_href: candidate.sourceHref,
    confidence: candidate.confidence,
    source: candidate.isTest && candidate.journeyRunId ? "journey_simulation_bot" : "next_best_action_engine",
    is_test: candidate.isTest,
    journey_run_id: candidate.journeyRunId,
    last_generated_at: generatedAt,
    dismissed_at: null,
    dismissed_by_user_id: null,
    completed_at: null,
    completed_by_user_id: null
  };
}

function uniqueDemandScopes(waitlist: NextBestActionInput["waitlist"]) {
  return [...new Map(waitlist.flatMap((entry) =>
    entry.preferredDays.flatMap((weekday) => {
      const blocks = entry.preferredTimeBlocks.length > 0 ? entry.preferredTimeBlocks : [null];
      return blocks.map((timeBlock) => {
        const value = {
          programId: entry.programId,
          stageId: entry.stageId,
          weekday,
          timeBlock,
          isTest: entry.isTest
        };
        return [scopeKey(value), value] as const;
      });
    })
  )).values()];
}

function singleJourneyRun(rows: Array<{ journeyRunId: string | null }>) {
  const ids = [...new Set(rows.flatMap((row) => row.journeyRunId ? [row.journeyRunId] : []))];
  return ids.length === 1 ? ids[0]! : null;
}

function preferenceTimeBlocks(preference: { starts_after: string | null; ends_before: string | null }) {
  if (!preference.starts_after && !preference.ends_before) return [];
  const startsAt = preference.starts_after ?? "06:00";
  const endsAt = preference.ends_before ?? "23:59";
  return (["morning", "afternoon", "evening"] as const).filter((block) => {
    const range = timeRange(block);
    return startsAt < range.end && endsAt > range.start;
  });
}

function hasFreeResourceWindow(input: {
  weekday: number;
  timeBlock: IntakeDaypart | null;
  resources: Array<{ id: string }>;
  sessions: Array<{ resource_id: string | null; starts_at: string; ends_at: string }>;
  now: Date;
}) {
  if (input.resources.length === 0) return false;
  const date = nextWeekday(input.now, input.weekday);
  const range = timeRange(input.timeBlock);
  const startsAt = new Date(`${date}T${range.start}:00.000Z`).toISOString();
  const endsAt = new Date(`${date}T${range.end}:00.000Z`).toISOString();
  const occupied = new Set(input.sessions.flatMap((session) =>
    session.resource_id && session.starts_at < endsAt && session.ends_at > startsAt
      ? [session.resource_id]
      : []
  ));
  return input.resources.some((resource) => !occupied.has(resource.id));
}

function timeRange(block: IntakeDaypart | null) {
  if (block === "morning") return { start: "09:00", end: "12:00" };
  if (block === "evening") return { start: "17:00", end: "20:00" };
  return { start: "15:00", end: "17:00" };
}

function nextWeekday(now: Date, weekday: number) {
  const current = now.getUTCDay() || 7;
  const delta = (weekday - current + 7) % 7 || 7;
  return toAmsterdamDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + delta)));
}

function asDaypart(value: string | null): IntakeDaypart | null {
  return value === "morning" || value === "afternoon" || value === "evening" ? value : null;
}

function waitScopeKey(query: WaitTimeQuery) {
  return scopeKey({
    programId: query.programId,
    stageId: query.stageId ?? null,
    weekday: query.preferredDay ?? null,
    timeBlock: query.preferredTimeBlock ?? null,
    isTest: false
  });
}

function scopeKey(value: {
  programId: string;
  stageId: string | null;
  weekday: number | null;
  timeBlock: IntakeDaypart | null;
  isTest?: boolean;
}) {
  return [value.programId, value.stageId ?? "all", value.weekday ?? "any", value.timeBlock ?? "any", value.isTest ? "test" : "live"].join(":");
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) {
    const value = key(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }
  return grouped;
}

function allowTestData(requested: boolean) {
  if (!requested) return false;
  const environment = (process.env.APP_ENV ?? process.env.NODE_ENV ?? "").toLowerCase();
  return environment === "development" || environment === "staging";
}

function assertNextBestActionResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}

function actionPriorityRank(priority: NextBestActionRow["priority"]) {
  return ({ high: 0, medium: 1, low: 2 } as const)[priority];
}

const dayMs = 24 * 60 * 60 * 1000;
