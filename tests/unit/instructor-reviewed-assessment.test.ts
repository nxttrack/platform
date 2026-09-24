import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { parseInstructorAssessmentContext, parseInstructorAssessmentInput } from "../../apps/web/lib/domain/instructor-assessment-contract";
import { childAssessmentCompliment } from "../../apps/web/lib/domain/child-assessment-compliment";

test("a public score is not an implicit child compliment; only curated text or explicitly shared history is child copy", () => {
  const row = { visibility: "parent_visible", context_json: { childVisible: false, note: "PRIVATE" }, positive_label: "Historical positive label" };
  assert.equal(childAssessmentCompliment(row), null);
  assert.equal(childAssessmentCompliment({ ...row, child_compliment: "Je oefende rustig!" }), "Je oefende rustig!");
  assert.equal(childAssessmentCompliment({ ...row, context_json: { childVisible: true } }), row.positive_label);
  assert.equal(childAssessmentCompliment({ ...row, context_json: { childVisible: true }, child_compliment: "Explicit text" }), "Explicit text");
  assert.equal(childAssessmentCompliment({ ...row, visibility: "internal", context_json: { childVisible: true }, child_compliment: "Must remain private" }), null);
});

test("review commands bind actual tenant, actor, participant, enrollment and item IDs and reject invalid scores", () => {
  const context = { actorId: randomUUID(), tenantId: randomUUID(), participantId: randomUUID(), enrollmentId: randomUUID(), itemId: randomUUID(), sessionId: null };
  assert.deepEqual(parseInstructorAssessmentContext(context), context);
  assert.throws(() => parseInstructorAssessmentContext({ ...context, itemId: "logical-skill-key" }));
  const input = { rating: 3, visibility: "parent_visible" as const, baseObservationId: randomUUID(), correctionReason: "Explicit correction" };
  assert.deepEqual(parseInstructorAssessmentInput(input), input);
  for (const rating of [0, 6, 1.5, NaN, Infinity]) assert.throws(() => parseInstructorAssessmentInput({ ...input, rating }));
  assert.throws(() => parseInstructorAssessmentInput({ ...input, correctionReason: "x".repeat(2001) }));
});
