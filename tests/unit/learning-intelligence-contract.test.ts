import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLessonFocusCards,
  CAPACITY_FORECAST_MODEL_VERSION,
  computeCapacityForecast,
  computeDiplomaReadiness,
  detectAttendanceRiskSignals,
  detectProgressBottleneckSignals,
  type AttendanceObservation,
  type ProgressAssessment
} from "../../apps/web/lib/domain/learning-intelligence-contract";

test("capacity forecast keeps no-shows outside expected openings and explains every component", () => {
  const [forecast] = computeCapacityForecast({
    horizonWeeks: 8,
    groups: [{
      id: "group-1",
      name: "Badje 2 woensdag",
      programId: "program-1",
      stageId: "stage-2",
      weekday: 3,
      startsAt: "16:00",
      resourceId: "lane-1",
      locationId: "location-1",
      fixedCapacity: 8,
      occupiedCapacity: 8,
      datedOpenings: 1,
      historicalExitsPerWeek: 0.25,
      graduationOpenings: 2,
      waitlistDemand: 5,
      expectedTransfersIn: 2,
      hasInstructor: true,
      instructorAvailable: true,
      resourceAvailable: true,
      isTest: false
    }]
  });

  assert.ok(forecast);
  assert.equal(forecast.current_occupied, 8);
  assert.equal(forecast.expected_openings, 3.3);
  assert.equal(forecast.expected_bottlenecks, 4);
  assert.equal(forecast.risk_level, "critical");
  assert.ok(forecast.reasons.some((reason) => /No-shows tellen nooit/i.test(reason.explanation)));
  assert.ok(forecast.recommended_actions.some((action) =>
    /capaciteitsforecast/i.test(action.label) && action.href.startsWith("/admin/rapportages/capaciteit")
  ));
});

test("capacity forecast distinguishes healthy availability from an operational blocker", () => {
  const rows = computeCapacityForecast({
    horizonWeeks: 4,
    groups: [
      {
        id: "healthy",
        name: "Ruimte",
        programId: "program",
        stageId: "stage",
        weekday: 2,
        startsAt: "10:00",
        resourceId: "lane",
        locationId: "pool",
        fixedCapacity: 8,
        occupiedCapacity: 4,
        datedOpenings: 0,
        historicalExitsPerWeek: 0,
        graduationOpenings: 0,
        waitlistDemand: 0,
        expectedTransfersIn: 0,
        hasInstructor: true,
        instructorAvailable: true,
        resourceAvailable: true,
        isTest: false
      },
      {
        id: "blocked",
        name: "Geen dekking",
        programId: "program",
        stageId: "stage",
        weekday: 2,
        startsAt: "10:00",
        resourceId: null,
        locationId: null,
        fixedCapacity: 8,
        occupiedCapacity: 4,
        datedOpenings: 0,
        historicalExitsPerWeek: 0,
        graduationOpenings: 0,
        waitlistDemand: 0,
        expectedTransfersIn: 0,
        hasInstructor: false,
        instructorAvailable: false,
        resourceAvailable: false,
        isTest: false
      }
    ]
  });

  assert.equal(rows.find((row) => row.group_id === "healthy")?.risk_level, "healthy");
  assert.equal(rows.find((row) => row.group_id === "blocked")?.risk_level, "critical");
});

test("capacity forecast publishes deterministic date bands, scenarios and soft holds", () => {
  const [forecast] = computeCapacityForecast({
    asOfDate: "2026-08-02",
    horizonWeeks: 8,
    groups: [{
      id: "forecast",
      name: "Badje 3",
      programId: "program",
      stageId: "stage",
      weekday: 2,
      startsAt: "16:00",
      resourceId: "lane",
      locationId: "pool",
      fixedCapacity: 8,
      occupiedCapacity: 7,
      activeSoftReservations: 1,
      datedOpenings: 0,
      knownOpeningDates: [],
      readinessReviewDates: [],
      historicalExitsPerWeek: 0.5,
      historySampleSize: 8,
      graduationOpenings: 1,
      waitlistDemand: 2,
      expectedTransfersIn: 1,
      hasInstructor: true,
      instructorAvailable: true,
      resourceAvailable: true,
      isTest: false
    }]
  });

  assert.ok(forecast);
  assert.equal(forecast.model_version, CAPACITY_FORECAST_MODEL_VERSION);
  assert.equal(forecast.active_soft_reservations, 1);
  assert.deepEqual(forecast.availability_range, {
    earliest: "2026-08-09",
    likely: "2026-08-16",
    latest: "2026-08-30"
  });
  assert.ok(forecast.opening_scenarios.conservative <= forecast.opening_scenarios.likely);
  assert.ok(forecast.opening_scenarios.likely <= forecast.opening_scenarios.optimistic);
  assert.equal(forecast.data_quality.hasHistory, true);
  assert.ok(forecast.reasons.some((reason) => reason.code === "soft_reservations"));
});

test("forecast never invents a date when history and dated openings are absent", () => {
  const [forecast] = computeCapacityForecast({
    asOfDate: "2026-08-02",
    horizonWeeks: 4,
    groups: [{
      id: "no-history",
      name: "Nieuwe groep",
      programId: "program",
      stageId: "stage",
      weekday: 2,
      startsAt: "16:00",
      resourceId: "lane",
      locationId: "pool",
      fixedCapacity: 8,
      occupiedCapacity: 8,
      datedOpenings: 0,
      historicalExitsPerWeek: 0,
      historySampleSize: 0,
      graduationOpenings: 0,
      waitlistDemand: 1,
      expectedTransfersIn: 0,
      hasInstructor: true,
      instructorAvailable: true,
      resourceAvailable: true,
      isTest: false
    }]
  });

  assert.deepEqual(forecast?.availability_range, {
    earliest: null,
    likely: null,
    latest: null
  });
  assert.equal(forecast?.confidence, "laag");
});

test("attendance detection is neutral, explainable and never auto-decides", () => {
  const now = "2026-07-26T12:00:00.000Z";
  const observations: AttendanceObservation[] = [
    observation("2026-07-20T16:00:00.000Z", "absent"),
    observation("2026-07-13T16:00:00.000Z", "absent"),
    observation("2026-07-06T16:00:00.000Z", "present"),
    observation("2026-06-29T16:00:00.000Z", "excused"),
    observation("2026-06-22T16:00:00.000Z", "present")
  ];
  const signals = detectAttendanceRiskSignals({
    now,
    observations,
    cancellations: [],
    contacts: []
  });
  const repeated = signals.find((signal) => signal.signal_type === "repeated_no_show");

  assert.ok(repeated);
  assert.equal(repeated.do_not_auto_decide, true);
  assert.match(repeated.reason, /vriendelijke check-in/i);
  assert.doesNotMatch(repeated.reason, /probleem|uitschrijven|plek afpakken/i);
  assert.ok(repeated.evidence.length > 0);
});

test("a future or still-running session never becomes a missing check-in signal", () => {
  const signals = detectAttendanceRiskSignals({
    now: "2026-07-26T12:00:00.000Z",
    observations: [{
      ...observation("2026-07-26T11:45:00.000Z", null),
      sessionEndsAt: "2026-07-26T12:30:00.000Z",
      sessionStatus: "scheduled"
    }],
    cancellations: [],
    contacts: []
  });

  assert.equal(signals.some((signal) => signal.signal_type === "missing_check_in"), false);
});

test("progress bottlenecks require a sufficient participant sample", () => {
  const insufficient = detectProgressBottleneckSignals({
    assessments: progressAssessments(4),
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z"
  });
  const sufficient = detectProgressBottleneckSignals({
    assessments: progressAssessments(6),
    periodStart: "2026-05-01T00:00:00.000Z",
    periodEnd: "2026-08-01T00:00:00.000Z"
  });

  assert.equal(insufficient.length, 0);
  assert.equal(sufficient.length, 1);
  assert.equal(sufficient[0]?.total_count, 6);
  assert.equal(sufficient[0]?.affected_count, 6);
  assert.match(sufficient[0]?.suggested_lesson_focus ?? "", /rustig|oefen/i);
});

test("diploma readiness exposes uncertainty and requires a human recommendation", () => {
  const readiness = computeDiplomaReadiness({
    participantId: "participant",
    programId: "program",
    requiredSkills: [
      { id: "skill-1", label: "Zelfstandig drijven" },
      { id: "skill-2", label: "Door het gat zwemmen" }
    ],
    assessments: [
      { skillId: "skill-1", score: 5, assessedAt: "2026-07-20T10:00:00.000Z" },
      { skillId: "skill-2", score: 4, assessedAt: "2026-07-20T10:00:00.000Z" }
    ],
    attendance: [{ status: "present", sessionStartsAt: "2026-07-20T10:00:00.000Z" }],
    instructorRecommendation: null
  });

  assert.equal(readiness.confidence, "laag");
  assert.notEqual(readiness.readiness_band, "klaar_voor_admin_review");
  assert.ok(readiness.blockers.some((blocker) => /aanbeveling ontbreekt/i.test(blocker)));
  assert.equal(readiness.human_confirmation_required, true);
});

test("diploma readiness only reaches admin review with stable evidence and human confirmation", () => {
  const readiness = computeDiplomaReadiness({
    participantId: "participant",
    programId: "program",
    requiredSkills: Array.from({ length: 4 }, (_, index) => ({
      id: `skill-${index}`,
      label: `Vaardigheid ${index}`
    })),
    assessments: Array.from({ length: 4 }, (_, index) => [
      { skillId: `skill-${index}`, score: 4, assessedAt: "2026-07-10T10:00:00.000Z" },
      { skillId: `skill-${index}`, score: 5, assessedAt: "2026-07-20T10:00:00.000Z" }
    ]).flat(),
    attendance: Array.from({ length: 6 }, (_, index) => ({
      status: "present",
      sessionStartsAt: `2026-07-${10 + index}T10:00:00.000Z`
    })),
    instructorRecommendation: "ready"
  });

  assert.equal(readiness.readiness_band, "klaar_voor_admin_review");
  assert.equal(readiness.confidence, "hoog");
  assert.equal(readiness.unstable_skills.length, 0);
});

test("lesson focus is deterministic, positive, privacy-safe and capped at three", () => {
  const cards = buildLessonFocusCards([
    focus("low_skill", "Rugdrijven", 90),
    focus("attendance", "Start met een warme check-in", 80),
    focus("unstable_skill", "Onderwater kijken", 70),
    focus("group_bottleneck", "Springen", 60),
    { ...focus("instructor_note", "Medische diagnose", 100), sensitive: true }
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.points.length, 3);
  assert.ok(cards[0]?.points.every((point) => /\.$/.test(point.label)));
  assert.equal(cards[0]?.points.some((point) => /diagnose/i.test(point.label)), false);
  assert.deepEqual(
    cards[0]?.points.map((point) => point.source_type),
    ["low_skill", "attendance", "unstable_skill"]
  );
});

function observation(
  startsAt: string,
  attendanceStatus: AttendanceObservation["attendanceStatus"]
): AttendanceObservation {
  return {
    participantId: "participant-1",
    groupId: "group-1",
    sessionId: startsAt,
    sessionStartsAt: startsAt,
    sessionEndsAt: new Date(new Date(startsAt).getTime() + 45 * 60_000).toISOString(),
    sessionStatus: "completed",
    attendanceStatus,
    isTest: false,
    journeyRunId: null
  };
}

function progressAssessments(participantCount: number): ProgressAssessment[] {
  return Array.from({ length: participantCount }, (_, index) => ({
    participantId: `participant-${index}`,
    groupId: "group",
    programId: "program",
    stageId: "stage",
    instructorId: "instructor",
    skillId: "rugdrijven",
    skillLabel: "Rustig rugdrijven",
    score: 2,
    assessedAt: `2026-07-${String(10 + index).padStart(2, "0")}T10:00:00.000Z`,
    isTest: false,
    journeyRunId: null
  }));
}

function focus(
  sourceType: "low_skill" | "attendance" | "unstable_skill" | "group_bottleneck" | "instructor_note",
  label: string,
  priority: number
) {
  return {
    participantId: "participant",
    participantName: "Emma",
    sourceType,
    sourceId: sourceType,
    label,
    explanation: "Veilige bronuitleg.",
    priority,
    sensitive: false,
    isTest: false,
    journeyRunId: null
  } as const;
}
