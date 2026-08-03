import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  getLearnerAssessmentAccessibleLabel,
  learnerAssessmentLevels,
  migrateLegacyThreePointValue,
  legacyNormalizedAssessmentScore,
  parseLearnerAssessmentValue
} from "../../apps/web/lib/domain/learner-assessment";

const root = path.resolve(import.meta.dirname, "../..");

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

test("legacyconversie bewaart bronwaarde en de genormaliseerde ankers 0/0,5/1", () => {
  const migrated = ([1, 2, 3] as const).map(migrateLegacyThreePointValue);
  assert.deepEqual(migrated.map((row) => row.ratingValue), [1, 3, 5]);
  assert.deepEqual(migrated.map((row) => row.sourceValue), [1, 2, 3]);
  assert.ok(migrated.every((row) => row.sourceScaleVersion === "three_point_legacy"));
  assert.deepEqual(migrated.map((row) => legacyNormalizedAssessmentScore(row.ratingValue)), [0, 0.5, 1]);
});

test("alle bekende assessmentwriters leggen de vijfpuntsschaal expliciet vast", async () => {
  for (const relativePath of [
    "apps/web/lib/domain/instructor-actions.ts",
    "apps/web/lib/domain/journey-bot.ts",
    "scripts/staging/phase-16-operational-flow.mjs",
    "scripts/staging/seed-sprint31-demo.mjs"
  ]) {
    const source = await readFile(path.join(root, relativePath), "utf8");
    assert.match(source, /scale_version:\s*"five_point_v1"/, relativePath);
    assert.match(source, /source_scale_version:\s*"five_point_v1"/, relativePath);
    assert.match(source, /source_value:\s*null/, relativePath);
  }
});
