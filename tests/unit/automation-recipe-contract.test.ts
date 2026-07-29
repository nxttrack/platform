import assert from "node:assert/strict";
import test from "node:test";

import {
  automationRecipeCatalog,
  automationRecipeKeys,
  buildReviewTask,
  decideAutomationRecipeCandidate,
  getAutomationRecipeDefinition,
  normalizeAutomationRecipeSettings,
  parseAutomationRecipeKey,
  type AutomationRecipeCandidate
} from "../../apps/web/lib/domain/automation-recipe-contract";

test("catalog contains exactly the ten approved, explainable recipes", () => {
  assert.equal(automationRecipeCatalog.length, 10);
  assert.deepEqual(
    automationRecipeCatalog.map((recipe) => recipe.key),
    automationRecipeKeys
  );
  for (const recipe of automationRecipeCatalog) {
    assert.ok(recipe.name);
    assert.ok(recipe.summary);
    assert.ok(recipe.triggerLabel);
    assert.ok(recipe.sourceLabel);
    assert.ok(recipe.safeguards.length >= 2);
    assert.ok(recipe.consentNotice);
  }
});

test("settings are bounded and invalid values fall back to recipe defaults", () => {
  const definition = getAutomationRecipeDefinition("waitlist_capacity_available");
  const settings = normalizeAutomationRecipeSettings({
    cooldownDays: "0",
    daysAhead: "31",
    lookbackDays: "30",
    minimumOccurrences: "2",
    minimumConfidence: "0.8"
  }, definition);

  assert.equal(settings.cooldownDays, definition.defaultSettings.cooldownDays);
  assert.equal(settings.daysAhead, definition.defaultSettings.daysAhead);
  assert.equal(settings.lookbackDays, 30);
  assert.equal(settings.minimumOccurrences, 2);
  assert.equal(settings.minimumConfidence, 0.8);
});

test("recipe decision blocks Journey Bot and test data even when the signal is strong", () => {
  for (const unsafeCandidate of [
    candidate({ confidence: 0.96, isTest: true }),
    candidate({
      confidence: 0.96,
      journeyRunId: "00000000-0000-4000-8000-000000000001"
    })
  ]) {
    const decision = decideAutomationRecipeCandidate(unsafeCandidate);
    assert.equal(decision.eligible, false);
    assert.equal(decision.skippedReason, "test_data_blocked");
    assert.match(decision.reasons.join(" "), /Journey Bot/);
  }
});

test("recipe decision remains explainable and clamps confidence", () => {
  const decision = decideAutomationRecipeCandidate(candidate({ confidence: 1.2 }));

  assert.equal(decision.eligible, true);
  assert.equal(decision.confidence, 1);
  assert.deepEqual(decision.reasons, ["Afwezig gemarkeerd op 27 juli."]);
});

test("empty evaluation is skipped with a stable, explainable reason", () => {
  const decision = decideAutomationRecipeCandidate(null);

  assert.equal(decision.eligible, false);
  assert.equal(decision.candidate, null);
  assert.equal(decision.skippedReason, "no_matching_candidate");
  assert.match(decision.reasons[0]!, /geen record/i);
});

test("safe recipe execution only prepares a human review task", () => {
  const task = buildReviewTask({
    candidate: candidate({}),
    recipeName: "No-show opvolging"
  });

  assert.match(task.title, /controle nodig/);
  assert.match(task.description, /bepaal zelf/);
  assert.match(task.description, /niets automatisch verzonden/);
  assert.match(task.description, /geplaatst, geïncasseerd of gewijzigd/);
});

test("only catalog keys can be parsed from form input", () => {
  assert.equal(parseAutomationRecipeKey("payment_failed"), "payment_failed");
  assert.equal(parseAutomationRecipeKey("send_email"), null);
  assert.equal(parseAutomationRecipeKey(null), null);
});

function candidate(overrides: Partial<AutomationRecipeCandidate>): AutomationRecipeCandidate {
  return {
    confidence: 0.88,
    dedupeKey: "absence:00000000-0000-4000-8000-000000000010",
    entityId: "00000000-0000-4000-8000-000000000010",
    entityType: "session_attendance",
    isTest: false,
    journeyRunId: null,
    label: "Afwezigheid vraagt om controle",
    participantId: "00000000-0000-4000-8000-000000000011",
    reasons: ["Afwezig gemarkeerd op 27 juli."],
    sourceData: { status: "absent" },
    ...overrides
  };
}
