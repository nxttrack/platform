export type IntelligenceConfidence = "laag" | "middel" | "hoog";
export type CapacityRiskLevel = "healthy" | "watch" | "bottleneck" | "critical";
export type AttendanceRiskLevel = "watch" | "elevated" | "high";
export type ReadinessBand =
  | "laag"
  | "in_ontwikkeling"
  | "bijna_klaar"
  | "hoog_vertrouwen"
  | "klaar_voor_admin_review";

export type IntelligenceReason = {
  code: string;
  label: string;
  explanation: string;
  evidence: string;
};

export type CapacityForecastGroup = {
  id: string;
  name: string;
  programId: string;
  stageId: string | null;
  weekday: number | null;
  startsAt: string | null;
  resourceId: string | null;
  locationId: string | null;
  fixedCapacity: number;
  occupiedCapacity: number;
  datedOpenings: number;
  historicalExitsPerWeek: number;
  graduationOpenings: number;
  waitlistDemand: number;
  expectedTransfersIn: number;
  hasInstructor: boolean;
  instructorAvailable: boolean;
  resourceAvailable: boolean;
  isTest: boolean;
};

export type CapacityForecast = {
  group_id: string;
  group_name: string;
  program_id: string;
  stage_id: string | null;
  day: number | null;
  time_block: "morning" | "afternoon" | "evening" | null;
  location_id: string | null;
  resource_id: string | null;
  current_capacity: number;
  current_occupied: number;
  expected_openings: number;
  expected_bottlenecks: number;
  waitlist_demand: number;
  risk_level: CapacityRiskLevel;
  confidence: IntelligenceConfidence;
  reasons: IntelligenceReason[];
  recommended_actions: Array<{ label: string; href: string }>;
  is_test: boolean;
};

export function computeCapacityForecast(input: {
  groups: CapacityForecastGroup[];
  horizonWeeks: 4 | 8 | 12;
}): CapacityForecast[] {
  return input.groups
    .map((group) => {
      const currentOpen = Math.max(0, group.fixedCapacity - group.occupiedCapacity);
      const historicalOpenings = Math.min(
        group.occupiedCapacity,
        group.historicalExitsPerWeek * input.horizonWeeks * 0.5
      );
      const expectedOpenings = roundOne(
        Math.min(
          group.occupiedCapacity,
          group.datedOpenings + group.graduationOpenings * 0.65 + historicalOpenings
        )
      );
      const demand = group.waitlistDemand + group.expectedTransfersIn;
      const expectedBottlenecks = Math.max(0, Math.ceil(demand - currentOpen - expectedOpenings));
      const operatingBlockers = Number(!group.hasInstructor || !group.instructorAvailable) +
        Number(!group.resourceAvailable);
      const pressure = group.fixedCapacity > 0
        ? (group.occupiedCapacity + demand - expectedOpenings) / group.fixedCapacity
        : 2;
      const riskLevel = capacityRisk({
        expectedBottlenecks,
        operatingBlockers,
        pressure,
        waitlistDemand: group.waitlistDemand
      });
      const sampleSignals = [
        group.fixedCapacity > 0,
        group.occupiedCapacity >= 0,
        group.historicalExitsPerWeek > 0,
        group.waitlistDemand > 0 || group.expectedTransfersIn > 0,
        group.hasInstructor,
        group.resourceAvailable
      ].filter(Boolean).length;
      const confidence: IntelligenceConfidence = sampleSignals >= 5
        ? "hoog"
        : sampleSignals >= 3
          ? "middel"
          : "laag";
      const reasons: IntelligenceReason[] = [
        reason(
          "occupancy",
          "Huidige bezetting",
          "De huidige bezetting en vaste groepscapaciteit vormen het startpunt.",
          `${roundOne(group.occupiedCapacity)} van ${group.fixedCapacity} capaciteitsplaatsen gebruikt`
        ),
        reason(
          "demand",
          "Verwachte vraag",
          "Wachtlijstdruk en verwachte doorstroom naar dit niveau worden kansgewogen verdeeld over passende lesgroepen.",
          `${roundOne(group.waitlistDemand)} gewogen wachtlijstvraag · ${roundOne(group.expectedTransfersIn)} mogelijke doorstromers`
        ),
        reason(
          "openings",
          "Voorzichtige uitstroom",
          "Geplande einddata, beoordeelde afzwemgereedheid en historische uitstroom tellen gewogen mee. No-shows tellen nooit als vrijgekomen plek.",
          `${expectedOpenings} verwachte opening(en) in ${input.horizonWeeks} weken`
        )
      ];

      if (!group.hasInstructor || !group.instructorAvailable) {
        reasons.push(reason(
          "instructor",
          "Instructeurbezetting",
          "Capaciteit is pas inzetbaar wanneer een bevoegde instructeur is toegewezen en beschikbaar is.",
          group.hasInstructor ? "Toewijzing valt buiten de vastgelegde beschikbaarheid" : "Geen actieve instructeur toegewezen"
        ));
      }
      if (!group.resourceAvailable) {
        reasons.push(reason(
          "resource",
          "Resourceconflict",
          "Het huidige bad, de baan of locatie is niet aantoonbaar beschikbaar in dit tijdvak.",
          "Resource vraagt planningscontrole"
        ));
      }

      return {
        group_id: group.id,
        group_name: group.name,
        program_id: group.programId,
        stage_id: group.stageId,
        day: group.weekday,
        time_block: deriveTimeBlock(group.startsAt),
        location_id: group.locationId,
        resource_id: group.resourceId,
        current_capacity: group.fixedCapacity,
        current_occupied: roundOne(group.occupiedCapacity),
        expected_openings: expectedOpenings,
        expected_bottlenecks: expectedBottlenecks,
        waitlist_demand: group.waitlistDemand,
        risk_level: riskLevel,
        confidence,
        reasons,
        recommended_actions: capacityActions(riskLevel, group.id),
        is_test: group.isTest
      };
    })
    .sort((left, right) =>
      capacityRiskRank(right.risk_level) - capacityRiskRank(left.risk_level) ||
      right.expected_bottlenecks - left.expected_bottlenecks ||
      left.group_name.localeCompare(right.group_name, "nl")
    );
}

export type AttendanceObservation = {
  participantId: string;
  groupId: string;
  sessionId: string;
  sessionStartsAt: string;
  sessionEndsAt: string;
  sessionStatus: string;
  attendanceStatus: string | null;
  isTest: boolean;
  journeyRunId: string | null;
};

export type AttendanceCancellation = {
  participantId: string;
  groupId: string;
  requestedAt: string;
  status: string;
  isTest: boolean;
  journeyRunId: string | null;
};

export type AttendanceContact = {
  participantId: string;
  contactedAt: string;
};

export type AttendanceRiskSignal = {
  participant_id: string;
  group_id: string;
  risk_level: AttendanceRiskLevel;
  signal_type:
    | "repeated_no_show"
    | "frequent_absence"
    | "rising_group_absence"
    | "late_cancellation"
    | "missing_check_in"
    | "long_absence_without_contact";
  reason: string;
  evidence: string[];
  suggested_action: string;
  confidence: IntelligenceConfidence;
  do_not_auto_decide: true;
  is_test: boolean;
  journey_run_id: string | null;
};

export function detectAttendanceRiskSignals(input: {
  now: string;
  observations: AttendanceObservation[];
  cancellations: AttendanceCancellation[];
  contacts: AttendanceContact[];
}): AttendanceRiskSignal[] {
  const now = new Date(input.now);
  const participantKeys = new Set([
    ...input.observations.map((row) => `${row.participantId}:${row.groupId}`),
    ...input.cancellations.map((row) => `${row.participantId}:${row.groupId}`)
  ]);
  const signals: AttendanceRiskSignal[] = [];

  for (const key of participantKeys) {
    const [participantId, groupId] = key.split(":") as [string, string];
    const observations = input.observations
      .filter((row) => row.participantId === participantId && row.groupId === groupId)
      .sort((left, right) => right.sessionStartsAt.localeCompare(left.sessionStartsAt));
    const cancellations = input.cancellations.filter(
      (row) => row.participantId === participantId && row.groupId === groupId
    );
    const newest = observations[0];
    const isTest = newest?.isTest ?? cancellations[0]?.isTest ?? false;
    const journeyRunId = newest?.journeyRunId ?? cancellations[0]?.journeyRunId ?? null;
    const noShows30 = observations.filter((row) =>
      row.attendanceStatus === "absent" && daysBetween(row.sessionStartsAt, input.now) <= 30
    );
    if (noShows30.length >= 2) {
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "repeated_no_show",
        level: noShows30.length >= 3 ? "high" : "elevated",
        reasonText: "Meerdere afwezigheden in de afgelopen 30 dagen vragen om een vriendelijke check-in.",
        evidence: [`${noShows30.length} keer afwezig in 30 dagen`],
        suggestedAction: "Neem persoonlijk contact op om te vragen welke ondersteuning helpt.",
        confidence: "hoog",
        isTest,
        journeyRunId
      }));
    }

    const lastFive = observations
      .filter((row) => new Date(row.sessionStartsAt).getTime() <= now.getTime())
      .slice(0, 5);
    const absentLastFive = lastFive.filter((row) =>
      ["absent", "excused"].includes(row.attendanceStatus ?? "")
    );
    if (lastFive.length === 5 && absentLastFive.length >= 3) {
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "frequent_absence",
        level: "high",
        reasonText: "In de laatste vijf lessen was de leerling relatief vaak afwezig of afgemeld.",
        evidence: [`${absentLastFive.length} van de laatste 5 lessen gemist`],
        suggestedAction: "Bespreek samen of planning, inhalen of extra begeleiding passend is.",
        confidence: "hoog",
        isTest,
        journeyRunId
      }));
    }

    const lateCancellations = cancellations.filter((row) =>
      row.status === "late_cancelled" && daysBetween(row.requestedAt, input.now) <= 90
    );
    if (lateCancellations.length >= 2) {
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "late_cancellation",
        level: lateCancellations.length >= 3 ? "elevated" : "watch",
        reasonText: "Er zijn meerdere late afmeldingen geregistreerd; een korte afstemming kan helpen.",
        evidence: [`${lateCancellations.length} late afmeldingen in 90 dagen`],
        suggestedAction: "Vraag of het huidige lesmoment nog goed aansluit.",
        confidence: "hoog",
        isTest,
        journeyRunId
      }));
    }

    const missingCheckIns = observations.filter((row) =>
      row.sessionStatus === "completed" &&
      !row.attendanceStatus &&
      new Date(row.sessionEndsAt).getTime() < now.getTime()
    );
    if (missingCheckIns.length > 0) {
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "missing_check_in",
        level: "watch",
        reasonText: "Bij een afgeronde les ontbreekt nog een aanwezigheidsregistratie.",
        evidence: [`${missingCheckIns.length} afgeronde les(sen) zonder check-in`],
        suggestedAction: "Controleer eerst de registratie met de instructeur.",
        confidence: "middel",
        isTest,
        journeyRunId
      }));
    }

    const lastPresent = observations.find((row) =>
      ["present", "late", "trial"].includes(row.attendanceStatus ?? "")
    );
    const lastContact = input.contacts
      .filter((row) => row.participantId === participantId)
      .sort((left, right) => right.contactedAt.localeCompare(left.contactedAt))[0];
    const referenceDate = lastPresent?.sessionStartsAt ?? observations.at(-1)?.sessionStartsAt;
    if (
      referenceDate &&
      daysBetween(referenceDate, input.now) >= 42 &&
      (!lastContact || daysBetween(lastContact.contactedAt, input.now) >= 30)
    ) {
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "long_absence_without_contact",
        level: "elevated",
        reasonText: "Er is langere tijd geen bevestigde aanwezigheid of recent contact zichtbaar.",
        evidence: [
          `${daysBetween(referenceDate, input.now)} dagen sinds de laatste bevestigde aanwezigheid`,
          lastContact ? `${daysBetween(lastContact.contactedAt, input.now)} dagen sinds zichtbaar contact` : "Geen recent contact in de beschikbare brondata"
        ],
        suggestedAction: "Doe een warme check-in zonder aannames over de oorzaak.",
        confidence: observations.length >= 3 ? "middel" : "laag",
        isTest,
        journeyRunId
      }));
    }
  }

  const groupIds = new Set(input.observations.map((row) => row.groupId));
  for (const groupId of groupIds) {
    const recentRows = input.observations.filter((row) =>
      row.groupId === groupId && daysBetween(row.sessionStartsAt, input.now) <= 28
    );
    const previousRows = input.observations.filter((row) => {
      const days = daysBetween(row.sessionStartsAt, input.now);
      return days > 28 && days <= 56;
    }).filter((row) => row.groupId === groupId);
    if (recentRows.length < 8 || previousRows.length < 8) continue;
    const recentRate = absenceRate(recentRows);
    const previousRate = absenceRate(previousRows);
    if (recentRate < 0.25 || recentRate - previousRate < 0.12) continue;

    for (const participantId of new Set(
      recentRows.filter((row) => ["absent", "excused"].includes(row.attendanceStatus ?? "")).map((row) => row.participantId)
    )) {
      const row = recentRows.find((item) => item.participantId === participantId)!;
      signals.push(attendanceSignal({
        participantId,
        groupId,
        type: "rising_group_absence",
        level: "watch",
        reasonText: "De afwezigheid in deze lesgroep loopt op; kijk eerst naar planning en groepscontext.",
        evidence: [
          `${Math.round(recentRate * 100)}% afwezig in 4 weken`,
          `${Math.round(previousRate * 100)}% in de 4 weken ervoor`
        ],
        suggestedAction: "Bespreek het groepssignaal in de teamstart en controleer mogelijke roosterfactoren.",
        confidence: recentRows.length >= 16 && previousRows.length >= 16 ? "hoog" : "middel",
        isTest: row.isTest,
        journeyRunId: row.journeyRunId
      }));
    }
  }

  return deduplicateAttendanceSignals(signals).sort((left, right) =>
    attendanceRiskRank(right.risk_level) - attendanceRiskRank(left.risk_level) ||
    left.participant_id.localeCompare(right.participant_id)
  );
}

export type ProgressAssessment = {
  participantId: string;
  groupId: string | null;
  programId: string | null;
  stageId: string | null;
  instructorId: string | null;
  skillId: string;
  skillLabel: string;
  score: number;
  assessedAt: string;
  isTest: boolean;
  journeyRunId: string | null;
};

export type ProgressBottleneck = {
  program_id: string | null;
  stage_id: string | null;
  group_id: string | null;
  instructor_id: string | null;
  skill_id: string;
  skill_label: string;
  affected_count: number;
  total_count: number;
  stagnation_rate: number;
  trend: "verbeterend" | "stabiel" | "oplopend" | "onvoldoende_historie";
  confidence: IntelligenceConfidence;
  reasons: IntelligenceReason[];
  suggested_lesson_focus: string;
  participant_ids: string[];
  is_test: boolean;
  journey_run_id: string | null;
};

export function detectProgressBottleneckSignals(input: {
  assessments: ProgressAssessment[];
  periodStart: string;
  periodEnd: string;
  minimumSampleSize?: number;
}): ProgressBottleneck[] {
  const minimumSampleSize = input.minimumSampleSize ?? 5;
  const inPeriod = input.assessments.filter((row) =>
    row.assessedAt >= input.periodStart && row.assessedAt <= input.periodEnd
  );
  const groups = new Map<string, ProgressAssessment[]>();

  for (const row of inPeriod) {
    const key = [
      row.programId ?? "",
      row.stageId ?? "",
      row.groupId ?? "",
      row.instructorId ?? "",
      row.skillId,
      row.isTest ? row.journeyRunId ?? "test" : "live"
    ].join(":");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const bottlenecks: ProgressBottleneck[] = [];
  for (const rows of groups.values()) {
    const latestByParticipant = latestAssessmentByParticipant(rows);
    if (latestByParticipant.length < minimumSampleSize) continue;
    const affected = latestByParticipant.filter((row) => row.score <= 2);
    const rate = affected.length / latestByParticipant.length;
    if (rate < 0.35) continue;
    const first = rows[0]!;
    const trend = deriveProgressTrend(rows);
    const confidence: IntelligenceConfidence = latestByParticipant.length >= 10
      ? "hoog"
      : latestByParticipant.length >= 6
        ? "middel"
        : "laag";
    bottlenecks.push({
      program_id: first.programId,
      stage_id: first.stageId,
      group_id: first.groupId,
      instructor_id: first.instructorId,
      skill_id: first.skillId,
      skill_label: first.skillLabel,
      affected_count: affected.length,
      total_count: latestByParticipant.length,
      stagnation_rate: roundTwo(rate),
      trend,
      confidence,
      reasons: [
        reason(
          "sample",
          "Voldoende groepssignaal",
          "Alleen signalen met voldoende verschillende leerlingen worden getoond.",
          `${latestByParticipant.length} leerlingen in de gekozen periode`
        ),
        reason(
          "stagnation",
          "Extra lesfocus kan helpen",
          "Het signaal beschrijft leskwaliteit en leerbehoefte; het labelt geen individuele leerling.",
          `${affected.length} leerlingen hebben een recente score in de oefenfase`
        ),
        reason(
          "trend",
          "Trend",
          "De trend vergelijkt de eerste en laatste helft van beschikbare assessments.",
          trend.replaceAll("_", " ")
        )
      ],
      suggested_lesson_focus: positiveLessonFocus(first.skillLabel),
      participant_ids: affected.map((row) => row.participantId),
      is_test: first.isTest,
      journey_run_id: first.journeyRunId
    });
  }

  return bottlenecks.sort((left, right) =>
    right.stagnation_rate - left.stagnation_rate ||
    right.total_count - left.total_count ||
    left.skill_label.localeCompare(right.skill_label, "nl")
  );
}

export type DiplomaReadinessInput = {
  participantId: string;
  programId: string;
  requiredSkills: Array<{ id: string; label: string }>;
  assessments: Array<{
    skillId: string;
    score: number;
    assessedAt: string;
  }>;
  attendance: Array<{
    status: string;
    sessionStartsAt: string;
  }>;
  instructorRecommendation: "not_ready" | "nearly_ready" | "ready" | "blocked" | null;
};

export type DiplomaReadiness = {
  participant_id: string;
  program_id: string;
  readiness_band: ReadinessBand;
  confidence: IntelligenceConfidence;
  required_skills_completed: Array<{ skill_id: string; skill_label: string }>;
  unstable_skills: Array<{ skill_id: string; skill_label: string; reason: string }>;
  attendance_summary: string;
  recent_score_stability: string;
  instructor_recommendation: DiplomaReadinessInput["instructorRecommendation"];
  reasons: IntelligenceReason[];
  blockers: string[];
  suggested_next_step: string;
  human_confirmation_required: true;
};

export function computeDiplomaReadiness(input: DiplomaReadinessInput): DiplomaReadiness {
  const assessmentsBySkill = new Map<string, DiplomaReadinessInput["assessments"]>();
  for (const assessment of input.assessments) {
    assessmentsBySkill.set(assessment.skillId, [
      ...(assessmentsBySkill.get(assessment.skillId) ?? []),
      assessment
    ]);
  }
  const completed: DiplomaReadiness["required_skills_completed"] = [];
  const unstable: DiplomaReadiness["unstable_skills"] = [];
  const blockers: string[] = [];

  for (const skill of input.requiredSkills) {
    const assessments = [...(assessmentsBySkill.get(skill.id) ?? [])].sort(
      (left, right) => right.assessedAt.localeCompare(left.assessedAt)
    );
    const latest = assessments[0];
    if (!latest) {
      blockers.push(`${skill.label}: nog geen recente beoordeling`);
      continue;
    }
    if (latest.score >= 4) completed.push({ skill_id: skill.id, skill_label: skill.label });
    if (
      assessments.length < 2 ||
      latest.score <= 3 ||
      Math.max(...assessments.slice(0, 3).map((row) => row.score)) -
        Math.min(...assessments.slice(0, 3).map((row) => row.score)) >= 2
    ) {
      unstable.push({
        skill_id: skill.id,
        skill_label: skill.label,
        reason: assessments.length < 2
          ? "Nog te weinig herhaalde observaties"
          : latest.score <= 3
            ? "Nog in de oefenfase"
            : "Recente observaties wisselen"
      });
    }
  }

  const attended = input.attendance.filter((row) =>
    ["present", "late", "trial"].includes(row.status)
  ).length;
  const attendanceRate = input.attendance.length ? attended / input.attendance.length : null;
  const completionRate = input.requiredSkills.length
    ? completed.length / input.requiredSkills.length
    : 0;
  const confidence: IntelligenceConfidence =
    input.requiredSkills.length >= 4 &&
    input.assessments.length >= input.requiredSkills.length * 2 &&
    input.attendance.length >= 5
      ? "hoog"
      : input.assessments.length >= input.requiredSkills.length && input.attendance.length >= 3
        ? "middel"
        : "laag";
  const readinessBand = readinessBandFor({
    attendanceRate,
    completionRate,
    confidence,
    recommendation: input.instructorRecommendation,
    unstableCount: unstable.length
  });
  const reasons: IntelligenceReason[] = [
    reason(
      "skills",
      "Vereiste vaardigheden",
      "De assistent kijkt naar de laatste én herhaalde observaties van actieve vaardigheden.",
      `${completed.length} van ${input.requiredSkills.length} vaardigheden stabiel op niveau`
    ),
    reason(
      "stability",
      "Stabiliteit",
      "Wisselende of eenmalige scores worden bewust als onzeker getoond.",
      unstable.length ? `${unstable.length} aandachtspunt(en)` : "Recente observaties zijn stabiel"
    ),
    reason(
      "attendance",
      "Aanwezigheid",
      "Aanwezigheid geeft context, maar beslist nooit zelfstandig over afzwemmen.",
      attendanceRate === null
        ? "Onvoldoende aanwezigheidsdata"
        : `${Math.round(attendanceRate * 100)}% van ${input.attendance.length} recente lessen aanwezig`
    ),
    reason(
      "human_review",
      "Menselijke beoordeling",
      "Een instructeur of admin bevestigt altijd de afzwemgereedheid.",
      input.instructorRecommendation
        ? `Huidige aanbeveling: ${input.instructorRecommendation.replaceAll("_", " ")}`
        : "Nog geen menselijke aanbeveling vastgelegd"
    )
  ];

  if (attendanceRate !== null && attendanceRate < 0.6) {
    blockers.push("Beperkte recente lesobservaties door afwezigheid; plan eerst een nieuwe beoordeling.");
  }
  if (!input.instructorRecommendation) {
    blockers.push("Menselijke aanbeveling ontbreekt.");
  }

  return {
    participant_id: input.participantId,
    program_id: input.programId,
    readiness_band: readinessBand,
    confidence,
    required_skills_completed: completed,
    unstable_skills: unstable,
    attendance_summary: attendanceRate === null
      ? "Nog onvoldoende aanwezigheidsdata"
      : `${attended} van ${input.attendance.length} recente lessen aanwezig`,
    recent_score_stability: unstable.length
      ? `${unstable.length} vaardigheid${unstable.length === 1 ? "" : "en"} vraagt herhaalde observatie`
      : "Recente observaties zijn stabiel",
    instructor_recommendation: input.instructorRecommendation,
    reasons,
    blockers: unique(blockers),
    suggested_next_step: readinessNextStep(readinessBand),
    human_confirmation_required: true
  };
}

export type LessonFocusCandidate = {
  participantId: string;
  participantName: string;
  sourceType:
    | "low_skill"
    | "unstable_skill"
    | "attendance"
    | "instructor_note"
    | "next_stage"
    | "group_bottleneck"
    | "manual";
  sourceId: string | null;
  label: string;
  explanation: string;
  priority: number;
  sensitive: boolean;
  isTest: boolean;
  journeyRunId: string | null;
};

export type LessonFocusCard = {
  participant_id: string;
  participant_name: string;
  points: Array<{
    fingerprint: string;
    source_type: LessonFocusCandidate["sourceType"];
    source_id: string | null;
    label: string;
    explanation: string;
  }>;
  is_test: boolean;
  journey_run_id: string | null;
};

export function buildLessonFocusCards(
  candidates: LessonFocusCandidate[]
): LessonFocusCard[] {
  const byParticipant = new Map<string, LessonFocusCandidate[]>();
  for (const candidate of candidates) {
    if (candidate.sensitive) continue;
    byParticipant.set(candidate.participantId, [
      ...(byParticipant.get(candidate.participantId) ?? []),
      candidate
    ]);
  }

  return [...byParticipant.values()]
    .map((rows) => {
      const sorted = [...rows].sort((left, right) =>
        right.priority - left.priority ||
        left.sourceType.localeCompare(right.sourceType) ||
        left.label.localeCompare(right.label, "nl")
      );
      const deduped = sorted.filter((row, index, all) =>
        all.findIndex((candidate) => normalizeFocus(candidate.label) === normalizeFocus(row.label)) === index
      );
      const first = rows[0]!;
      return {
        participant_id: first.participantId,
        participant_name: first.participantName,
        points: deduped.slice(0, 3).map((row) => ({
          fingerprint: focusFingerprint(row),
          source_type: row.sourceType,
          source_id: row.sourceId,
          label: positiveLessonFocus(row.label),
          explanation: row.explanation
        })),
        is_test: first.isTest,
        journey_run_id: first.journeyRunId
      };
    })
    .filter((card) => card.points.length > 0)
    .sort((left, right) => left.participant_name.localeCompare(right.participant_name, "nl"));
}

function capacityRisk(input: {
  expectedBottlenecks: number;
  operatingBlockers: number;
  pressure: number;
  waitlistDemand: number;
}): CapacityRiskLevel {
  if (
    input.operatingBlockers >= 2 ||
    input.expectedBottlenecks >= 4 ||
    input.pressure >= 1.4
  ) return "critical";
  if (
    input.operatingBlockers === 1 ||
    input.expectedBottlenecks >= 2 ||
    input.pressure >= 1.15
  ) return "bottleneck";
  if (
    input.expectedBottlenecks > 0 ||
    input.pressure >= 0.9 ||
    input.waitlistDemand > 0
  ) return "watch";
  return "healthy";
}

function capacityActions(
  riskLevel: CapacityRiskLevel,
  groupId: string
): Array<{ label: string; href: string }> {
  const actions = [
    { label: "Open What-if planbord", href: `/admin/agenda?group=${groupId}` },
    { label: "Bekijk Next Best Actions", href: "/admin/automatisering/acties" }
  ];
  if (riskLevel === "healthy") {
    return [{ label: "Bekijk plaatsingskansen", href: "/admin/wachtlijst" }];
  }
  return actions;
}

function attendanceSignal(input: {
  participantId: string;
  groupId: string;
  type: AttendanceRiskSignal["signal_type"];
  level: AttendanceRiskLevel;
  reasonText: string;
  evidence: string[];
  suggestedAction: string;
  confidence: IntelligenceConfidence;
  isTest: boolean;
  journeyRunId: string | null;
}): AttendanceRiskSignal {
  return {
    participant_id: input.participantId,
    group_id: input.groupId,
    risk_level: input.level,
    signal_type: input.type,
    reason: input.reasonText,
    evidence: input.evidence,
    suggested_action: input.suggestedAction,
    confidence: input.confidence,
    do_not_auto_decide: true,
    is_test: input.isTest,
    journey_run_id: input.journeyRunId
  };
}

function deduplicateAttendanceSignals(signals: AttendanceRiskSignal[]) {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.participant_id}:${signal.group_id}:${signal.signal_type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestAssessmentByParticipant(rows: ProgressAssessment[]) {
  const latest = new Map<string, ProgressAssessment>();
  for (const row of rows) {
    const current = latest.get(row.participantId);
    if (!current || row.assessedAt > current.assessedAt) latest.set(row.participantId, row);
  }
  return [...latest.values()];
}

function deriveProgressTrend(
  assessments: ProgressAssessment[]
): ProgressBottleneck["trend"] {
  if (assessments.length < 8) return "onvoldoende_historie";
  const sorted = [...assessments].sort((left, right) =>
    left.assessedAt.localeCompare(right.assessedAt)
  );
  const midpoint = Math.floor(sorted.length / 2);
  const firstRate = sorted.slice(0, midpoint).filter((row) => row.score <= 2).length / midpoint;
  const last = sorted.slice(midpoint);
  const lastRate = last.filter((row) => row.score <= 2).length / last.length;
  if (lastRate - firstRate >= 0.12) return "oplopend";
  if (firstRate - lastRate >= 0.12) return "verbeterend";
  return "stabiel";
}

function readinessBandFor(input: {
  completionRate: number;
  unstableCount: number;
  attendanceRate: number | null;
  confidence: IntelligenceConfidence;
  recommendation: DiplomaReadinessInput["instructorRecommendation"];
}): ReadinessBand {
  if (input.recommendation === "blocked" || input.completionRate < 0.35) return "laag";
  if (input.completionRate < 0.7) return "in_ontwikkeling";
  if (input.completionRate < 0.9 || input.unstableCount > 1) return "bijna_klaar";
  if (
    input.recommendation === "ready" &&
    input.confidence !== "laag" &&
    (input.attendanceRate === null || input.attendanceRate >= 0.6)
  ) return "klaar_voor_admin_review";
  return "hoog_vertrouwen";
}

function readinessNextStep(band: ReadinessBand) {
  return {
    laag: "Plan positieve oefendoelen en een nieuw observatiemoment.",
    in_ontwikkeling: "Blijf gericht oefenen en herhaal de beoordeling.",
    bijna_klaar: "Plan een gerichte proefbeoordeling met de instructeur.",
    hoog_vertrouwen: "Vraag de instructeur om de menselijke readiness-review af te ronden.",
    klaar_voor_admin_review: "Admin kan na controle markeren als afzwem-ready of toevoegen aan een afzwemlijst."
  }[band];
}

function positiveLessonFocus(label: string) {
  const clean = label.trim().replace(/[.!]+$/, "");
  if (!clean) return "Geef ruimte voor een positief oefenmoment.";
  if (/^(rustig|samen|kort|geef|oefen|herhaal|bouw|laat)/i.test(clean)) {
    return `${clean}.`;
  }
  return `Oefen ${clean.charAt(0).toLowerCase()}${clean.slice(1)} rustig en positief.`;
}

function focusFingerprint(candidate: LessonFocusCandidate) {
  return [
    candidate.sourceType,
    candidate.sourceId ?? "derived",
    normalizeFocus(candidate.label)
  ].join(":").slice(0, 240);
}

function normalizeFocus(value: string) {
  return value.toLocaleLowerCase("nl").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function deriveTimeBlock(value: string | null): CapacityForecast["time_block"] {
  if (!value) return null;
  const hour = Number(value.slice(0, 2));
  if (!Number.isFinite(hour)) return null;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function absenceRate(rows: AttendanceObservation[]) {
  if (!rows.length) return 0;
  return rows.filter((row) =>
    ["absent", "excused"].includes(row.attendanceStatus ?? "")
  ).length / rows.length;
}

function daysBetween(older: string, newer: string) {
  return Math.max(
    0,
    Math.floor((new Date(newer).getTime() - new Date(older).getTime()) / 86_400_000)
  );
}

function capacityRiskRank(value: CapacityRiskLevel) {
  return { healthy: 0, watch: 1, bottleneck: 2, critical: 3 }[value];
}

function attendanceRiskRank(value: AttendanceRiskLevel) {
  return { watch: 0, elevated: 1, high: 2 }[value];
}

function reason(
  code: string,
  label: string,
  explanation: string,
  evidence: string
): IntelligenceReason {
  return { code, label, explanation, evidence };
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
