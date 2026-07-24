import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateJourneyRunAllowance,
  chooseNextRunAt,
  getJourneyConfigStopReason,
  getMinimumAgeDecision,
  isActiveJourneyWindow,
  isJourneyBotEnvironmentAllowed,
  resolveScenarioMode,
  resolveStressVariant,
  summarizeJourneyRun,
  summarizeJourneyTick,
  sortEligibleFifo
} from "../../apps/web/lib/domain/journey-bot-contract";

test("blokkeert productie standaard en staat dev/staging toe", () => {
  assert.equal(isJourneyBotEnvironmentAllowed("staging"), true);
  assert.equal(isJourneyBotEnvironmentAllowed("development"), true);
  assert.equal(isJourneyBotEnvironmentAllowed("production"), false);
  assert.equal(isJourneyBotEnvironmentAllowed("production", true), true);
});

test("berekent de vierde verjaardag als eerste plaatsingsdag", () => {
  assert.deepEqual(getMinimumAgeDecision("2023-08-12", new Date("2026-07-24T12:00:00Z")), {
    blocked: true,
    eligibleFrom: "2027-08-12"
  });
  assert.equal(getMinimumAgeDecision("2020-07-24", new Date("2026-07-24T12:00:00Z")).blocked, false);
  assert.deepEqual(getMinimumAgeDecision("2024-02-29", new Date("2026-07-24T12:00:00Z")), {
    blocked: true,
    eligibleFrom: "2028-02-29"
  });
  assert.throws(() => getMinimumAgeDecision("2023-02-30"), /valid ISO birth date/);
});

test("houdt alleen plaatsbare kinderen over en sorteert FIFO", () => {
  const sorted = sortEligibleFifo(
    [
      { id: "later", eligibleFrom: null, priorityDate: "2026-02-01", createdAt: "2026-01-01T09:00:00Z" },
      { id: "blocked", eligibleFrom: "2027-01-01", priorityDate: "2025-01-01", createdAt: "2025-01-01T09:00:00Z" },
      { id: "first", eligibleFrom: "2026-01-01", priorityDate: "2026-01-01", createdAt: "2026-01-02T09:00:00Z" }
    ],
    new Date("2026-07-24T12:00:00Z")
  );

  assert.deepEqual(sorted.map((entry) => entry.id), ["first", "later"]);
});

test("plant binnen de ingestelde intervalgrenzen", () => {
  assert.equal(
    chooseNextRunAt({ minIntervalMinutes: 3, maxIntervalMinutes: 12, now: new Date("2026-07-24T12:00:00Z"), random: 0 }).intervalMinutes,
    3
  );
  assert.equal(
    chooseNextRunAt({ minIntervalMinutes: 3, maxIntervalMinutes: 12, now: new Date("2026-07-24T12:00:00Z"), random: 0.999 }).intervalMinutes,
    12
  );
});

test("actieve vensters gebruiken Amsterdam-tijd en ondersteunen een nachtvenster", () => {
  assert.equal(
    isActiveJourneyWindow({
      activeDays: [5],
      activeWindows: [{ end: "06:00", start: "22:00" }],
      now: new Date("2026-07-24T21:30:00Z")
    }),
    true
  );
  assert.equal(
    isActiveJourneyWindow({
      activeDays: [5],
      activeWindows: [{ end: "21:00", start: "08:00" }],
      now: new Date("2026-07-24T21:30:00Z")
    }),
    false
  );
});

test("stress mix kiest alleen uitvoerbare scenario's", () => {
  assert.equal(resolveScenarioMode("stress_mix", 0.1), "intake_only");
  assert.equal(resolveScenarioMode("stress_mix", 0.4), "intake_to_placement");
  assert.equal(resolveScenarioMode("stress_mix", 0.7), "placement_to_next_stage");
  assert.equal(resolveScenarioMode("stress_mix", 0.9), "full_journey_to_diploma");
});

test("stress mix volgt exact 70/10/10/5/5 over iedere cyclus van twintig", () => {
  const variants = Array.from({ length: 20 }, (_, sequence) => resolveStressVariant(sequence));

  assert.equal(variants.filter((variant) => variant === "normal").length, 14);
  assert.equal(variants.filter((variant) => variant === "under_4").length, 2);
  assert.equal(variants.filter((variant) => variant === "needs_review").length, 2);
  assert.equal(variants.filter((variant) => variant === "no_capacity").length, 1);
  assert.equal(variants.filter((variant) => variant === "recoverable_issue").length, 1);
  assert.equal(resolveStressVariant(20), "normal");
  assert.equal(resolveStressVariant(-19), "recoverable_issue");
});

test("run allowance respecteert per-run, dag-, actief- en totale stoplimieten", () => {
  assert.equal(
    calculateJourneyRunAllowance({
      activeJourneys: 1,
      journeysStartedToday: 7,
      journeysStartedTotal: 8,
      maxActiveJourneys: 5,
      maxJourneysPerDay: 10,
      maxJourneysPerRun: 8,
      stopAfterJourneys: 10
    }).allowance,
    2
  );
  assert.equal(
    calculateJourneyRunAllowance({
      activeJourneys: 5,
      journeysStartedToday: 0,
      journeysStartedTotal: 0,
      maxActiveJourneys: 5,
      maxJourneysPerDay: 10,
      maxJourneysPerRun: 8,
      stopAfterJourneys: null
    }).allowance,
    0
  );
});

test("config stopt exact op eindtijd of journeybudget", () => {
  const now = new Date("2026-07-24T12:00:00Z");
  assert.equal(getJourneyConfigStopReason({ journeysStartedTotal: 4, now, runUntil: "2026-07-24T11:59:59Z", stopAfterJourneys: 5 }), "run_window_ended");
  assert.equal(getJourneyConfigStopReason({ journeysStartedTotal: 5, now, runUntil: null, stopAfterJourneys: 5 }), "journey_limit_reached");
  assert.equal(getJourneyConfigStopReason({ journeysStartedTotal: 4, now, runUntil: null, stopAfterJourneys: 5 }), null);
});

test("verwachte blockers houden een run gezond, technische fouten niet", () => {
  const healthy = summarizeJourneyRun(
    [
      { classification: "passed", status: "completed_placement" },
      { classification: "expected_blocker", status: "blocked_until_eligible" }
    ],
    { expected: 1, warning: 1 }
  );
  assert.equal(healthy.healthStatus, "healthy");
  assert.equal(healthy.status, "completed");
  assert.equal(healthy.completed, 2);

  const failed = summarizeJourneyRun(
    [
      { classification: "passed", status: "completed_intake" },
      { classification: "technical_failure", status: "failed" }
    ],
    { error: 1, unexpected: 1 }
  );
  assert.equal(failed.healthStatus, "failed");
  assert.equal(failed.status, "partial");
  assert.equal(failed.technicalFailures, 1);
});

test("ticksummary maakt technische child-fouten releasezichtbaar", () => {
  const summary = summarizeJourneyTick([
    summarizeJourneyRun([{ classification: "expected_blocker", status: "blocked_no_capacity" }], { expected: 1, warning: 1 }),
    summarizeJourneyRun([{ classification: "technical_failure", status: "failed" }], { critical: 1, unexpected: 1 })
  ]);

  assert.deepEqual(summary, {
    criticalIssues: 1,
    degradedJourneys: 0,
    failedRuns: 1,
    healthyRuns: 1,
    technicalFailures: 1,
    unexpectedIssues: 1
  });
});
