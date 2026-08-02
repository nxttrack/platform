import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJourneyRings,
  calculateProgress,
  itemProgressPercent,
  journeyProgressPoints,
  legacyNormalizedAssessmentScore,
  parseAssessmentValue
} from "../../packages/swim-domain/src/progress";
import {
  latestFinalObservations,
  validateCorrectionChain
} from "../../packages/swim-domain/src/assessment";

test("beoordelingen zijn uitsluitend integer 1–5 of null", () => {
  for (const value of [1, 2, 3, 4, 5, null] as const) assert.equal(parseAssessmentValue(value), value);
  for (const value of [undefined, 0, 6, 1.5, "5", Number.NaN]) assert.throws(() => parseAssessmentValue(value));
});

test("productprogressie is rating/5 en de historische metric blijft afzonderlijk", () => {
  assert.equal(journeyProgressPoints(1), 0.2);
  assert.equal(itemProgressPercent(1), 20);
  assert.equal(journeyProgressPoints(5), 1);
  assert.equal(itemProgressPercent(null), null);
  assert.equal(legacyNormalizedAssessmentScore(1), 0);
  assert.equal(legacyNormalizedAssessmentScore(5), 1);
});

test("één vijfscore op zes verplichte onderdelen is ongerond 16,7 procent", () => {
  const progress = calculateProgress([
    { itemKey: "a", rating: 5 },
    { itemKey: "b", rating: null },
    { itemKey: "c", rating: null },
    { itemKey: "d", rating: null },
    { itemKey: "e", rating: null },
    { itemKey: "f", rating: null }
  ]);
  assert.equal(progress.progressFraction, 1 / 6);
  assert.ok(Math.abs((progress.progressPercent ?? 0) - 100 / 6) < Number.EPSILON * 100);
  assert.equal(Number(progress.progressPercent?.toFixed(1)), 16.7);
  assert.ok(Math.abs((progress.coveragePercent ?? 0) - 100 / 6) < Number.EPSILON * 100);
});

test("null blijft in de noemer en dubbele carryover-items tellen maar eenmaal", () => {
  const progress = calculateProgress([
    { itemKey: "original", rating: 3 },
    { itemKey: "original", rating: 5 },
    { itemKey: "open", rating: null }
  ]);
  assert.equal(progress.contributingCount, 2);
  assert.equal(progress.progressPercent, 30);
  assert.equal(progress.coveragePercent, 50);
});

test("weging is expliciet en houdt onbeoordeelde onderdelen in de noemer", () => {
  const progress = calculateProgress(
    [
      { itemKey: "heavy", rating: 5, weight: 3 },
      { itemKey: "open", rating: null, weight: 1 }
    ],
    { weighted: true }
  );
  assert.equal(progress.progressPercent, 75);
  assert.equal(progress.coveragePercent, 50);
});

test("een curriculum met één badje toont alleen diploma; meerdere tonen exact twee ringen", () => {
  const shared = {
    currentStage: { key: "badje-a", label: "Badje A", items: [{ itemKey: "a", rating: 4 as const }] },
    diplomaItems: [{ itemKey: "a", rating: 4 as const }]
  };
  assert.deepEqual(buildJourneyRings({ ...shared, stageCount: 1 }).map((ring) => ring.kind), ["diploma"]);
  assert.deepEqual(buildJourneyRings({ ...shared, stageCount: 3 }).map((ring) => ring.kind), ["stage", "diploma"]);
});

test("de laatste definitieve niet-ingetrokken observatie bepaalt progressie, ook bij scoreverlaging", () => {
  const observations = [
    {
      id: "first",
      itemKey: "float",
      rating: 5 as const,
      observedAt: "2026-08-01T10:00:00.000Z",
      createdAt: "2026-08-01T10:00:01.000Z"
    },
    {
      id: "correction",
      itemKey: "float",
      rating: 3 as const,
      observedAt: "2026-08-01T10:00:00.000Z",
      createdAt: "2026-08-01T10:02:00.000Z",
      correctsObservationId: "first"
    }
  ];
  assert.equal(validateCorrectionChain(observations).valid, true);
  assert.equal(latestFinalObservations(observations).get("float")?.rating, 3);
});

test("correctieketens weigeren cycli, ontbrekende voorgangers en cross-itemcorrecties", () => {
  const base = {
    rating: 4 as const,
    observedAt: "2026-08-01T10:00:00.000Z",
    createdAt: "2026-08-01T10:00:00.000Z"
  };
  assert.deepEqual(
    validateCorrectionChain([{ ...base, id: "a", itemKey: "a", correctsObservationId: "missing" }]),
    { valid: false, reason: "missing_predecessor" }
  );
  assert.deepEqual(
    validateCorrectionChain([
      { ...base, id: "a", itemKey: "a", correctsObservationId: "b" },
      { ...base, id: "b", itemKey: "a", correctsObservationId: "a" }
    ]),
    { valid: false, reason: "cycle" }
  );
  assert.deepEqual(
    validateCorrectionChain([
      { ...base, id: "a", itemKey: "a" },
      { ...base, id: "b", itemKey: "b", correctsObservationId: "a" }
    ]),
    { valid: false, reason: "cross_item_correction" }
  );
});
