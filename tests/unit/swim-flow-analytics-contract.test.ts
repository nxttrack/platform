import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSwimFlowAnalytics,
  SWIM_FLOW_FORMULA_VERSION
} from "../../apps/web/lib/domain/swim-flow-analytics-contract";

test("rolling flow metrics use tenant calendar dates, exact percentiles and formula version", () => {
  const report = calculateSwimFlowAnalytics({
    asOfDate: "2026-08-02",
    generatedAt: "2026-08-02T08:00:00.000Z",
    timeZone: "Europe/Amsterdam",
    waitTimes: [10, 20, 30, 40, 50].map((days, index) => ({
      id: `wait-${index}`,
      enteredAt: `2026-0${index + 1}-01T23:30:00.000Z`,
      eligibleFrom: null,
      placedAt: addDays(`2026-0${index + 1}-02`, days) + "T08:00:00.000Z",
      source: "intake" as const,
      isTest: false
    })),
    stageJourneys: [],
    diplomaJourneys: []
  });

  assert.equal(report.formulaVersion, SWIM_FLOW_FORMULA_VERSION);
  assert.equal(report.windowStart, "2025-08-02");
  assert.equal(report.windowEnd, "2026-08-03");
  assert.deepEqual(report.metrics.wait_time.statistics, {
    sampleSize: 5,
    meanDays: 30,
    medianDays: 30,
    p75Days: 40,
    p90Days: 46,
    minimumDays: 10,
    maximumDays: 50
  });
  assert.equal(report.metrics.wait_time.quality.cohortSize, "sufficient");
});

test("eligibility starts the waiting clock and test/import rows cannot pollute cohorts", () => {
  const report = calculateSwimFlowAnalytics({
    asOfDate: "2026-08-02",
    generatedAt: "2026-08-02T08:00:00.000Z",
    timeZone: "Europe/Amsterdam",
    waitTimes: [
      {
        id: "eligible",
        enteredAt: "2026-01-01T10:00:00.000Z",
        eligibleFrom: "2026-02-01",
        placedAt: "2026-02-11T10:00:00.000Z",
        source: "intake",
        isTest: false
      },
      {
        id: "test",
        enteredAt: "2026-01-01T10:00:00.000Z",
        eligibleFrom: null,
        placedAt: "2026-06-01T10:00:00.000Z",
        source: "journey_simulation_bot",
        isTest: true
      },
      {
        id: "unverified-import",
        enteredAt: "2026-01-01T10:00:00.000Z",
        eligibleFrom: null,
        placedAt: "2026-05-01T10:00:00.000Z",
        source: "import",
        isTest: false
      },
      {
        id: "open",
        enteredAt: "2026-07-01T10:00:00.000Z",
        eligibleFrom: null,
        placedAt: null,
        source: "manual",
        isTest: false
      }
    ],
    stageJourneys: [],
    diplomaJourneys: []
  });

  const metric = report.metrics.wait_time;
  assert.equal(metric.statistics.medianDays, 10);
  assert.equal(metric.quality.excludedTest, 1);
  assert.equal(metric.quality.excludedImportedWithoutHistory, 1);
  assert.equal(metric.quality.missingCompletion, 1);
});

test("pauses are de-duplicated and transfers do not reset stage or diploma duration", () => {
  const overlappingPauses = [
    {
      startsOn: "2026-02-01",
      returnedOn: "2026-02-11",
      status: "returned" as const
    },
    {
      startsOn: "2026-02-05",
      returnedOn: "2026-02-16",
      status: "returned" as const
    }
  ];
  const report = calculateSwimFlowAnalytics({
    asOfDate: "2026-08-02",
    generatedAt: "2026-08-02T08:00:00.000Z",
    timeZone: "Europe/Amsterdam",
    waitTimes: [],
    stageJourneys: [{
      id: "one-stage-across-group-transfer",
      stageStartedAt: "2026-01-01T12:00:00.000Z",
      transitionExecutedAt: "2026-03-02T12:00:00.000Z",
      source: "manual",
      isTest: false,
      pauses: overlappingPauses
    }],
    diplomaJourneys: [{
      id: "one-enrollment-across-stages",
      enrollmentStartedOn: "2026-01-01",
      diplomaIssuedOn: "2026-03-02",
      source: "manual",
      isTest: false,
      pauses: overlappingPauses
    }]
  });

  assert.equal(report.metrics.stage_duration.statistics.medianDays, 45);
  assert.equal(report.metrics.diploma_duration.statistics.medianDays, 45);
  assert.equal(report.metrics.stage_duration.quality.pauseDaysExcluded, 15);
});

test("rolling boundary uses local completion date across DST and excludes invalid ordering", () => {
  const report = calculateSwimFlowAnalytics({
    asOfDate: "2026-03-30",
    generatedAt: "2026-03-30T12:00:00.000Z",
    timeZone: "Europe/Amsterdam",
    waitTimes: [
      {
        id: "dst",
        enteredAt: "2026-03-28T23:30:00.000Z",
        eligibleFrom: null,
        placedAt: "2026-03-29T22:30:00.000Z",
        source: "manual",
        isTest: false
      },
      {
        id: "invalid",
        enteredAt: "2026-04-02T10:00:00.000Z",
        eligibleFrom: null,
        placedAt: "2026-04-01T10:00:00.000Z",
        source: "manual",
        isTest: false
      }
    ],
    stageJourneys: [],
    diplomaJourneys: []
  });

  assert.equal(report.metrics.wait_time.statistics.medianDays, 1);
  assert.equal(report.metrics.wait_time.quality.invalidOrder, 0);
});

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
