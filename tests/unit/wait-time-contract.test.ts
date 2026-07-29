import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateWaitTimePrediction,
  withWaitTimeAlternatives,
  type CurrentCapacity,
  type HistoricalPlacement
} from "../../apps/web/lib/domain/wait-time-contract";

const now = "2026-07-26T10:00:00.000Z";
const query = {
  programId: "program-a",
  stageId: "stage-1",
  preferredDay: 3,
  preferredTimeBlock: "afternoon" as const,
  locationId: "location-a"
};
const exactCapacity: CurrentCapacity[] = [{
  programId: "program-a",
  stageId: "stage-1",
  weekday: 3,
  timeBlock: "afternoon",
  locationId: "location-a",
  capacity: 8,
  available: 0
}];

test("uses the newest 100 exact placements and robust percentiles instead of an average", () => {
  const history = Array.from({ length: 120 }, (_, index): HistoricalPlacement => ({
    programId: "program-a",
    stageId: "stage-1",
    weekday: 3,
    timeBlock: "afternoon",
    locationId: "location-a",
    waitDays: index === 119 ? 700 : 56,
    placedAt: new Date(Date.parse(now) - index * 86_400_000).toISOString()
  }));
  const prediction = calculateWaitTimePrediction({
    query,
    history,
    demand: [],
    capacity: exactCapacity,
    now
  });

  assert.equal(prediction.basis, "last_100_exact");
  assert.equal(prediction.sample_size, 100);
  assert.equal(prediction.statistics.medianWeeks, 8);
  assert.equal(prediction.statistics.p75Weeks, 8);
  assert.equal(prediction.band, "medium");
  assert.match(prediction.admin_explanation, /P75 8 weken/);
  assert.doesNotMatch(prediction.parent_explanation, /\d+ weken/);
});

test("falls back from an undersized exact cohort to recent program and stage history", () => {
  const exact = historyRows(4, { ...query, waitDays: 35 });
  const fallback = historyRows(12, {
    programId: "program-a",
    stageId: "stage-1",
    weekday: 5,
    timeBlock: "evening",
    locationId: "location-b",
    waitDays: 84
  });
  const prediction = calculateWaitTimePrediction({
    query,
    history: [...exact, ...fallback],
    demand: [],
    capacity: exactCapacity,
    now
  });

  assert.equal(prediction.basis, "last_180_days_program_stage");
  assert.equal(prediction.sample_size, 16);
  assert.equal(prediction.band, "long");
});

test("uses current pressure without inventing historical precision", () => {
  const prediction = calculateWaitTimePrediction({
    query,
    history: [],
    demand: Array.from({ length: 18 }, (_, index) => ({
      programId: "program-a",
      stageId: "stage-1",
      preferredDays: [3],
      preferredTimeBlocks: ["afternoon" as const],
      priorityDate: `2026-07-${String(index + 1).padStart(2, "0")}`
    })),
    capacity: exactCapacity,
    now
  });

  assert.equal(prediction.basis, "current_pressure");
  assert.equal(prediction.band, "very_long");
  assert.equal(prediction.sample_size, 0);
  assert.equal(prediction.statistics.medianWeeks, null);
  assert.match(prediction.parent_explanation, /indicatie/i);
});

test("suggests only a demonstrably better alternative and keeps parent wording banded", () => {
  const current = calculateWaitTimePrediction({
    query,
    history: historyRows(12, { ...query, waitDays: 112 }),
    demand: [],
    capacity: exactCapacity,
    now
  });
  const alternativeQuery = { ...query, preferredDay: 6, preferredTimeBlock: "morning" as const };
  const alternative = calculateWaitTimePrediction({
    query: alternativeQuery,
    history: historyRows(12, { ...alternativeQuery, waitDays: 14 }),
    demand: [],
    capacity: [{ ...exactCapacity[0]!, weekday: 6, timeBlock: "morning", available: 2 }],
    now
  });
  const enriched = withWaitTimeAlternatives(current, query, [
    { query, prediction: current },
    { query: alternativeQuery, prediction: alternative }
  ]);

  assert.equal(enriched.suggested_alternatives.length, 1);
  assert.equal(enriched.suggested_alternatives[0]?.preferredDay, 6);
  assert.match(enriched.parent_explanation, /mogelijk sneller plek/i);
  assert.doesNotMatch(enriched.parent_explanation, /\d+ weken/);
});

function historyRows(
  count: number,
  row: Omit<HistoricalPlacement, "placedAt"> & { placedAt?: string }
): HistoricalPlacement[] {
  return Array.from({ length: count }, (_, index) => ({
    ...row,
    placedAt: row.placedAt ?? new Date(Date.parse(now) - index * 86_400_000).toISOString()
  }));
}
