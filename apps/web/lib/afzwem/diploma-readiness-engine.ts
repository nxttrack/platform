import { confidenceFromScore, smartBlocker, smartReason, upsertSmartDecision, type SmartDecisionBlocker, type SmartDecisionConfidence, type SmartDecisionReason } from "@/lib/smart-flow/decision";
import { createClient } from "@/lib/supabase/server";

type DiplomaReadinessClient = Awaited<ReturnType<typeof createClient>>;

type EnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  status: string;
  started_on: string;
};

type ReadinessCriteriaRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  name: string;
  min_completed_modules: number;
  min_score: number | null;
  status: string;
  metadata?: Record<string, unknown> | null;
};

type ModuleProgressRow = {
  id: string;
  stage_id: string;
  stage_module_id: string;
  status: string;
  score: number | null;
  assessed_at: string;
};

type AttendanceRow = {
  id: string;
  status: string;
  recorded_at: string;
};

type BadgeAwardRow = {
  id: string;
  badge_id: string;
  status: string;
  awarded_at: string;
};

type TransitionProposalRow = {
  id: string;
  to_stage_id: string;
  status: string;
  proposed_at: string;
};

type EventParticipantRow = {
  id: string;
  milestone_event_id: string;
  status: string;
};

type MilestoneResultRow = {
  id: string;
  result_status: string;
  certificate_id: string | null;
};

type CertificateRow = {
  id: string;
  status: string;
};

type MilestoneEventRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  title: string;
  starts_at: string;
  capacity: number;
  status: string;
};

type CriteriaResult = {
  code: string;
  label: string;
  passed: boolean;
  value?: unknown;
  required?: unknown;
  blocking?: boolean;
  detail?: string;
};

export type DiplomaReadinessDraft = {
  enrollment: EnrollmentRow;
  criteria: ReadinessCriteriaRow | null;
  score: number;
  confidence: SmartDecisionConfidence;
  readinessStatus: "not_ready" | "almost_ready" | "ready_for_review" | "invited" | "completed";
  progressSnapshot: Record<string, unknown>;
  attendanceSnapshot: Record<string, unknown>;
  badgeSnapshot: Record<string, unknown>;
  periodSnapshot: Record<string, unknown>;
  criteriaResults: CriteriaResult[];
  missingCriteria: CriteriaResult[];
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  smartDecisionId: string;
  recommendedEventId: string | null;
  milestoneEventParticipantId: string | null;
  certificateId: string | null;
  candidateSuggestions: AfzwemEventCandidateDraft[];
};

export type AfzwemEventCandidateDraft = {
  milestoneEventId: string;
  score: number;
  confidence: SmartDecisionConfidence;
  capacitySnapshot: Record<string, unknown>;
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  suggestedStatus: "candidate" | "expired";
};

export async function buildDiplomaReadinessDraft(
  supabase: DiplomaReadinessClient,
  input: {
    tenantId: string;
    enrollmentId: string;
  }
): Promise<DiplomaReadinessDraft> {
  const enrollment = await singleRow<EnrollmentRow>(
    supabase
      .from("enrollments")
      .select("id, participant_id, program_id, current_stage_id, status, started_on")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.enrollmentId)
      .single()
  );
  const [criteriaRows, moduleProgress, attendance, badgeAwards, transitionProposals, eventParticipants, results, certificates] = await Promise.all([
    rows<ReadinessCriteriaRow>(
      supabase
        .from("milestone_readiness_criteria")
        .select("id, program_id, stage_id, name, min_completed_modules, min_score, status, metadata")
        .eq("tenant_id", input.tenantId)
        .eq("program_id", enrollment.program_id)
        .eq("status", "active")
    ),
    rows<ModuleProgressRow>(
      supabase
        .from("stage_module_progress")
        .select("id, stage_id, stage_module_id, status, score, assessed_at")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
    ),
    rows<AttendanceRow>(
      supabase
        .from("session_attendance")
        .select("id, status, recorded_at")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
        .order("recorded_at", { ascending: false })
        .limit(80)
    ),
    rows<BadgeAwardRow>(
      supabase
        .from("badge_awards")
        .select("id, badge_id, status, awarded_at")
        .eq("tenant_id", input.tenantId)
        .eq("participant_id", enrollment.participant_id)
        .eq("status", "awarded")
    ),
    rows<TransitionProposalRow>(
      supabase
        .from("stage_transition_proposals")
        .select("id, to_stage_id, status, proposed_at")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
        .order("proposed_at", { ascending: false })
    ),
    rows<EventParticipantRow>(
      supabase
        .from("milestone_event_participants")
        .select("id, milestone_event_id, status")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
        .order("invited_at", { ascending: false })
    ),
    rows<MilestoneResultRow>(
      supabase
        .from("milestone_results")
        .select("id, result_status, certificate_id")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
        .order("registered_at", { ascending: false })
    ),
    rows<CertificateRow>(
      supabase
        .from("certificates")
        .select("id, status")
        .eq("tenant_id", input.tenantId)
        .eq("enrollment_id", enrollment.id)
        .order("created_at", { ascending: false })
    )
  ]);
  const criteria = selectCriteria(criteriaRows, enrollment.current_stage_id);
  const progressSnapshot = buildProgressSnapshot(moduleProgress, criteria);
  const attendanceSnapshot = buildAttendanceSnapshot(attendance, criteria);
  const badgeSnapshot = {
    awarded_badges: badgeAwards.length,
    latest_award_at: badgeAwards[0]?.awarded_at ?? null,
    has_milestone_badge: badgeAwards.length > 0
  };
  const periodSnapshot = buildPeriodSnapshot(enrollment.started_on, attendance.length, criteria);
  const instructorApproval = buildInstructorApproval(transitionProposals, criteria);
  const completedResult = results.find((result) => result.result_status === "passed") ?? null;
  const certificate = certificates.find((candidate) => candidate.status === "issued") ?? (completedResult?.certificate_id ? certificates.find((candidate) => candidate.id === completedResult.certificate_id) : null) ?? null;
  const openInvitation = eventParticipants.find((eventParticipant) => ["invited", "confirmed", "attended"].includes(eventParticipant.status)) ?? null;
  const criteriaResults: CriteriaResult[] = [
    progressSnapshot.criteria_result,
    attendanceSnapshot.criteria_result,
    instructorApproval.criteria_result,
    { code: "badge_or_milestone", label: "Badge/milestone", passed: badgeAwards.length > 0, value: badgeAwards.length, required: ">= 1 of admin review" },
    periodSnapshot.criteria_result
  ];
  const missingCriteria = criteriaResults.filter((result) => result.passed !== true);
  const reasons: SmartDecisionReason[] = [
    smartReason({
      code: "progress",
      label: `${progressSnapshot.completed_modules}/${progressSnapshot.required_modules} modules klaar`,
      detail: "Afgeleid van stage module progress.",
      weight: 35,
      evidence: progressSnapshot
    }),
    smartReason({
      code: "attendance",
      label: `${attendanceSnapshot.attendance_percentage}% aanwezigheid`,
      detail: "Present en te laat tellen als aanwezig.",
      weight: 20,
      evidence: attendanceSnapshot
    }),
    smartReason({
      code: "instructor_approval",
      label: instructorApproval.approved ? "Instructeur/admin akkoord zichtbaar" : "Nog geen akkoord zichtbaar",
      weight: 20,
      evidence: instructorApproval
    }),
    smartReason({
      code: "period",
      label: `${periodSnapshot.session_count} lessen / ${periodSnapshot.days_since_start} dagen`,
      weight: 10,
      evidence: periodSnapshot
    })
  ];
  const blockers = missingCriteria
    .filter((result) => result.blocking !== false)
    .map((result) =>
      smartBlocker({
        code: String(result.code ?? "missing_criteria"),
        label: String(result.label ?? "Criterium mist"),
        detail: String(result.detail ?? "Nog niet klaar voor uitnodiging."),
        severity: scoreFromCriteria(criteriaResults) >= 65 ? "warning" : "blocking",
        evidence: result
      })
    );
  const score = scoreFromCriteria(criteriaResults);
  const readinessStatus = statusFromSignals({
    score,
    blockers,
    openInvitation,
    completedResult,
    certificate
  });
  const confidence = confidenceFromScore(score, blockers);
  const events = await rows<MilestoneEventRow>(
    supabase
      .from("milestone_events")
      .select("id, program_id, stage_id, title, starts_at, capacity, status")
      .eq("tenant_id", input.tenantId)
      .eq("program_id", enrollment.program_id)
      .eq("status", "scheduled")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(20)
  );
  const eventIds = events.map((event) => event.id);
  const eventCounts =
    eventIds.length === 0
      ? []
      : await rows<{ milestone_event_id: string }>(
          supabase
            .from("milestone_event_participants")
            .select("milestone_event_id")
            .eq("tenant_id", input.tenantId)
            .in("milestone_event_id", eventIds)
            .in("status", ["invited", "confirmed", "attended"])
        );
  const candidateSuggestions = buildEventSuggestions({
    events,
    eventCounts,
    criteria,
    readinessStatus,
    score
  });
  const recommendedEventId = candidateSuggestions.find((suggestion) => suggestion.suggestedStatus === "candidate")?.milestoneEventId ?? null;
  const smartDecisionId = await upsertSmartDecision(supabase, {
    tenantId: input.tenantId,
    engineKey: "diploma_readiness",
    subjectType: "enrollment",
    subjectId: enrollment.id,
    inputSnapshot: {
      enrollment,
      criteria,
      module_progress_count: moduleProgress.length,
      attendance_count: attendance.length,
      badge_awards_count: badgeAwards.length,
      invitation_count: eventParticipants.length
    },
    ruleVersion: "diploma-readiness-v1",
    score,
    confidence,
    reasons,
    blockers,
    recommendation: {
      readiness_status: readinessStatus,
      recommended_event_id: recommendedEventId,
      missing_criteria: missingCriteria,
      parent_copy: parentCopyForStatus(readinessStatus)
    },
    decisionStatus: readinessStatus === "ready_for_review" ? "recommended" : readinessStatus === "completed" ? "applied" : "recommended",
    result: {
      certificate_id: certificate?.id ?? completedResult?.certificate_id ?? null,
      milestone_event_participant_id: openInvitation?.id ?? null
    },
    metadata: {
      phase: "S9"
    }
  });

  return {
    enrollment,
    criteria,
    score,
    confidence,
    readinessStatus,
    progressSnapshot,
    attendanceSnapshot,
    badgeSnapshot,
    periodSnapshot,
    criteriaResults,
    missingCriteria,
    reasons,
    blockers,
    smartDecisionId,
    recommendedEventId,
    milestoneEventParticipantId: openInvitation?.id ?? null,
    certificateId: certificate?.id ?? completedResult?.certificate_id ?? null,
    candidateSuggestions
  };
}

function selectCriteria(criteriaRows: ReadinessCriteriaRow[], currentStageId: string | null) {
  return criteriaRows.find((criteria) => criteria.stage_id === currentStageId) ?? criteriaRows.find((criteria) => criteria.stage_id !== null) ?? criteriaRows[0] ?? null;
}

function buildProgressSnapshot(moduleProgress: ModuleProgressRow[], criteria: ReadinessCriteriaRow | null): Record<string, unknown> & { criteria_result: CriteriaResult; completed_modules: number; required_modules: number } {
  const completed = moduleProgress.filter((progress) => progress.status === "passed");
  const averageScore = average(moduleProgress.map((progress) => progress.score).filter((score): score is number => typeof score === "number"));
  const requiredModules = criteria?.min_completed_modules ?? 0;
  const minScore = criteria?.min_score ?? null;
  const modulesPassed = completed.length >= requiredModules;
  const scorePassed = minScore === null || (averageScore !== null && averageScore >= minScore);

  return {
    completed_modules: completed.length,
    assessed_modules: moduleProgress.length,
    required_modules: requiredModules,
    average_score: averageScore,
    min_score: minScore,
    criteria_result: {
      code: "progress_criteria",
      label: "Voortgangscriteria",
      passed: modulesPassed && scorePassed,
      value: { completed_modules: completed.length, average_score: averageScore },
      required: { min_completed_modules: requiredModules, min_score: minScore },
      detail: modulesPassed && scorePassed ? "Voortgang voldoet." : "Nog niet alle voortgangscriteria zijn gehaald."
    }
  };
}

function buildAttendanceSnapshot(attendance: AttendanceRow[], criteria: ReadinessCriteriaRow | null): Record<string, unknown> & { criteria_result: CriteriaResult; attendance_percentage: number } {
  const threshold = numberMeta(criteria, "attendance_threshold", 75);
  const attended = attendance.filter((row) => row.status === "present" || row.status === "late").length;
  const percentage = attendance.length === 0 ? 0 : Math.round((attended / attendance.length) * 100);

  return {
    attended_sessions: attended,
    total_sessions: attendance.length,
    attendance_percentage: percentage,
    threshold,
    criteria_result: {
      code: "attendance_threshold",
      label: "Aanwezigheidsdrempel",
      passed: percentage >= threshold,
      value: percentage,
      required: threshold,
      blocking: attendance.length >= 4,
      detail: percentage >= threshold ? "Aanwezigheid is voldoende." : "Aanwezigheid is nog onder de drempel."
    }
  };
}

function buildPeriodSnapshot(startedOn: string, sessionCount: number, criteria: ReadinessCriteriaRow | null): Record<string, unknown> & { criteria_result: CriteriaResult; session_count: number; days_since_start: number } {
  const minSessions = numberMeta(criteria, "min_session_count", 8);
  const minDays = numberMeta(criteria, "min_period_days", 30);
  const daysSinceStart = Math.max(0, Math.floor((Date.now() - new Date(`${startedOn}T12:00:00`).getTime()) / 86400000));

  return {
    session_count: sessionCount,
    min_session_count: minSessions,
    days_since_start: daysSinceStart,
    min_period_days: minDays,
    criteria_result: {
      code: "minimum_period_or_sessions",
      label: "Minimum periode of lescount",
      passed: sessionCount >= minSessions || daysSinceStart >= minDays,
      value: { session_count: sessionCount, days_since_start: daysSinceStart },
      required: { min_session_count: minSessions, min_period_days: minDays },
      blocking: false,
      detail: "Minimale opbouwperiode helpt te vroege afzwemuitnodigingen voorkomen."
    }
  };
}

function buildInstructorApproval(transitionProposals: TransitionProposalRow[], criteria: ReadinessCriteriaRow | null): Record<string, unknown> & { criteria_result: CriteriaResult; approved: boolean } {
  const relevantProposal = transitionProposals.find((proposal) => {
    return ["approved", "applied"].includes(proposal.status) && (!criteria?.stage_id || proposal.to_stage_id === criteria.stage_id);
  });

  return {
    approved: Boolean(relevantProposal),
    proposal_id: relevantProposal?.id ?? null,
    criteria_result: {
      code: "instructor_approval",
      label: "Instructeur/admin akkoord",
      passed: Boolean(relevantProposal),
      value: relevantProposal?.status ?? "missing",
      required: "approved/applied stage transition",
      blocking: false,
      detail: relevantProposal ? "Akkoord is zichtbaar in doorstroomvoorstellen." : "Nog geen akkoord gevonden."
    }
  };
}

function scoreFromCriteria(criteriaResults: CriteriaResult[]) {
  const weights = new Map([
    ["progress_criteria", 35],
    ["attendance_threshold", 20],
    ["instructor_approval", 20],
    ["badge_or_milestone", 10],
    ["minimum_period_or_sessions", 15]
  ]);

  return Math.min(
    100,
    criteriaResults.reduce((sum, result) => sum + (result.passed === true ? (weights.get(String(result.code)) ?? 10) : 0), 0)
  );
}

function statusFromSignals(input: {
  score: number;
  blockers: SmartDecisionBlocker[];
  openInvitation: EventParticipantRow | null;
  completedResult: MilestoneResultRow | null;
  certificate: CertificateRow | null;
}): DiplomaReadinessDraft["readinessStatus"] {
  if (input.completedResult?.result_status === "passed" || input.certificate?.status === "issued") {
    return "completed";
  }

  if (input.openInvitation) {
    return "invited";
  }

  if (input.score >= 80 && input.blockers.every((blocker) => blocker.severity === "warning")) {
    return "ready_for_review";
  }

  if (input.score >= 65) {
    return "almost_ready";
  }

  return "not_ready";
}

function buildEventSuggestions(input: {
  events: MilestoneEventRow[];
  eventCounts: { milestone_event_id: string }[];
  criteria: ReadinessCriteriaRow | null;
  readinessStatus: DiplomaReadinessDraft["readinessStatus"];
  score: number;
}): AfzwemEventCandidateDraft[] {
  const counts = new Map<string, number>();

  for (const row of input.eventCounts) {
    counts.set(row.milestone_event_id, (counts.get(row.milestone_event_id) ?? 0) + 1);
  }

  return input.events.map((event) => {
    const used = counts.get(event.id) ?? 0;
    const open = Math.max(0, event.capacity - used);
    const blockers: SmartDecisionBlocker[] = [];
    const stageMatch = !event.stage_id || !input.criteria?.stage_id || event.stage_id === input.criteria.stage_id;

    if (open <= 0) {
      blockers.push(smartBlocker({ code: "event_full", label: "Afzwemmoment is vol.", severity: "blocking", evidence: { event_id: event.id } }));
    }

    if (!["almost_ready", "ready_for_review"].includes(input.readinessStatus)) {
      blockers.push(smartBlocker({ code: "not_ready_for_invitation", label: "Leerling is nog niet klaar voor uitnodiging.", severity: "warning" }));
    }

    const score = Math.min(100, input.score + (open > 0 ? 10 : 0) + (stageMatch ? 5 : 0));

    return {
      milestoneEventId: event.id,
      score,
      confidence: confidenceFromScore(score, blockers),
      capacitySnapshot: {
        event_id: event.id,
        title: event.title,
        starts_at: event.starts_at,
        capacity: event.capacity,
        invited_or_confirmed: used,
        open_spots: open,
        stage_match: stageMatch
      },
      reasons: [
        smartReason({ code: "event_capacity", label: `${open}/${event.capacity} plekken vrij`, weight: 5 }),
        smartReason({ code: "event_stage_match", label: stageMatch ? "Event past bij readiness stage" : "Event heeft andere stage", weight: 5 })
      ],
      blockers,
      suggestedStatus: blockers.some((blocker) => blocker.severity === "blocking") ? "expired" : "candidate"
    };
  });
}

function parentCopyForStatus(status: DiplomaReadinessDraft["readinessStatus"]) {
  if (status === "completed") {
    return "Het diplomaresultaat is verwerkt.";
  }

  if (status === "invited") {
    return "Er staat een afzwemuitnodiging klaar.";
  }

  if (status === "ready_for_review") {
    return "De zwemschool bekijkt of een afzwemuitnodiging passend is.";
  }

  if (status === "almost_ready") {
    return "De leerling is bijna klaar voor afzwemmen.";
  }

  return "De leerling bouwt nog verder aan de afzwemcriteria.";
}

function numberMeta(criteria: ReadinessCriteriaRow | null, key: string, fallback: number) {
  const value = criteria?.metadata?.[key];

  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function singleRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Record niet gevonden.");
  }

  return data as Row;
}

async function rows<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Row[]) : [];
}
