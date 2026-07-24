import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseNextRunAt,
  getMinimumAgeDecision,
  isJourneyBotEnvironmentAllowed,
  resolveScenarioMode,
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

test("stress mix kiest alleen uitvoerbare scenario's", () => {
  assert.equal(resolveScenarioMode("stress_mix", 0.1), "intake_only");
  assert.equal(resolveScenarioMode("stress_mix", 0.4), "intake_to_placement");
  assert.equal(resolveScenarioMode("stress_mix", 0.7), "placement_to_next_stage");
  assert.equal(resolveScenarioMode("stress_mix", 0.9), "full_journey_to_diploma");
});
