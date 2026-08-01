import assert from "node:assert/strict";
import test from "node:test";

import {
  getLearnerAssessmentAccessibleLabel,
  learnerAssessmentLevels,
  migrateLegacyThreePointValue,
  normalizeLearnerAssessment,
  parseLearnerAssessmentValue
} from "../../apps/web/lib/domain/learner-assessment";

test("vijfpuntscontract accepteert uitsluitend gehele waarden 1–5", () => {
  assert.deepEqual(learnerAssessmentLevels.map((level) => level.value), [1, 2, 3, 4, 5]);
  for (const value of [1, 2, 3, 4, 5] as const) {
    assert.equal(parseLearnerAssessmentValue(value), value);
    assert.match(getLearnerAssessmentAccessibleLabel(value), new RegExp(`${value} van 5`));
  }
  for (const value of [null, 0, 6, 2.5, "2.5", "3 van 5", {}, []]) {
    assert.throws(() => parseLearnerAssessmentValue(value));
  }
});

test("legacyconversie bewaart bronwaarde en de ankers 0/50/100", () => {
  const migrated = ([1, 2, 3] as const).map(migrateLegacyThreePointValue);
  assert.deepEqual(migrated.map((row) => row.ratingValue), [1, 3, 5]);
  assert.deepEqual(migrated.map((row) => row.sourceValue), [1, 2, 3]);
  assert.ok(migrated.every((row) => row.sourceScaleVersion === "three_point_legacy"));
  assert.deepEqual(migrated.map((row) => normalizeLearnerAssessment(row.ratingValue)), [0, 50, 100]);
});
