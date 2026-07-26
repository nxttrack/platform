import assert from "node:assert/strict";
import test from "node:test";

import {
  detectNextBestActions,
  nextBestActionTypes,
  type NextBestActionInput
} from "../../apps/web/lib/domain/next-best-actions-contract";

const now = "2026-07-26T10:00:00.000Z";

test("detects every required action type with reasons and safe source links", () => {
  const input = populatedInput();
  const actions = detectNextBestActions(input);
  const detectedTypes = new Set(actions.map((action) => action.actionType));

  assert.deepEqual([...detectedTypes].sort(), [...nextBestActionTypes].sort());
  assert.ok(actions.every((action) => action.reasons.length > 0));
  assert.ok(actions.every((action) => action.reasons.every((reason) => reason.evidence.length > 0)));
  assert.ok(actions.every((action) => action.sourceHref.startsWith("/admin")));
  assert.ok(actions.every((action) => action.suggestedActions.every((suggestion) => suggestion.href.startsWith("/admin"))));
});

test("recommends an extra lesson only when all five safeguards agree", () => {
  const valid = detectNextBestActions(populatedInput()).filter((action) => action.actionType === "extra_moment_recommended");
  assert.equal(valid.length, 1);
  assert.equal(valid[0]?.confidence, 0.88);
  assert.match(valid[0]?.description ?? "", /voorstel, geen automatische roosterwijziging/i);

  const noResource = populatedInput();
  noResource.demandWindows[0]!.resourceWindowAvailable = false;
  assert.equal(
    detectNextBestActions(noResource).filter((action) => action.actionType === "extra_moment_recommended").length,
    0
  );

  const enoughOutflow = populatedInput();
  enoughOutflow.demandWindows[0]!.outflowPerWeek = 3;
  assert.equal(
    detectNextBestActions(enoughOutflow).filter((action) => action.actionType === "extra_moment_recommended").length,
    0
  );
});

test("keeps Journey Bot intake counts separate from live intake counts", () => {
  const input = emptyInput();
  input.intakes = [
    { id: "live-1", programId: "p1", receivedAt: "2026-07-25T10:00:00.000Z", isTest: false, journeyRunId: null },
    { id: "test-1", programId: "p1", receivedAt: "2026-07-25T11:00:00.000Z", isTest: true, journeyRunId: "run-1" },
    { id: "test-2", programId: "p1", receivedAt: "2026-07-25T12:00:00.000Z", isTest: true, journeyRunId: "run-1" }
  ];
  const reviews = detectNextBestActions(input).filter((action) => action.actionType === "review_new_intakes");

  assert.equal(reviews.length, 2);
  assert.match(reviews.find((action) => !action.isTest)?.title ?? "", /^1 nieuwe intake /);
  assert.match(reviews.find((action) => action.isTest)?.title ?? "", /^2 nieuwe intakes /);
  assert.equal(reviews.find((action) => action.isTest)?.journeyRunId, "run-1");
});

function populatedInput(): NextBestActionInput {
  const input = emptyInput();
  input.intakes = [{ id: "intake-1", programId: "program-1", receivedAt: "2026-07-23T09:00:00.000Z", isTest: false, journeyRunId: null }];
  input.offers = [
    { id: "offer-expiring", waitlistEntryId: "wait-1", groupId: "group-full", offeredAt: "2026-07-22T10:00:00.000Z", expiresAt: "2026-07-27T09:00:00.000Z", isTest: false, journeyRunId: null },
    { id: "offer-waiting", waitlistEntryId: "wait-2", groupId: "group-full", offeredAt: "2026-07-20T10:00:00.000Z", expiresAt: "2026-08-10T09:00:00.000Z", isTest: false, journeyRunId: null }
  ];
  input.payments = [{ id: "invoice-1", participantId: "participant-1", guardianId: "guardian-1", dueOn: "2026-07-01", amountCents: 4250, status: "sent", isTest: false, journeyRunId: null }];
  input.groups = [
    { id: "group-full", name: "Badje 1 woensdag", programId: "program-1", stageId: "stage-1", weekday: 3, startsAt: "16:00", fixedCapacity: 8, usedCapacity: 8, hasInstructor: true, isTest: false },
    { id: "group-empty", name: "Badje 1 vrijdag", programId: "program-1", stageId: "stage-1", weekday: 5, startsAt: "16:00", fixedCapacity: 8, usedCapacity: 1, hasInstructor: false, isTest: false }
  ];
  input.waitlist = [
    { id: "eligible", programId: "program-1", stageId: "stage-1", eligibleFrom: "2026-07-26", minimumAgeBlocked: true, preferredDays: [3], preferredTimeBlocks: ["afternoon"], priorityDate: "2026-01-01", isTest: false, journeyRunId: null }
  ];
  input.demandWindows = [{
    programId: "program-1",
    stageId: "stage-1",
    weekday: 3,
    timeBlock: "afternoon",
    candidateCount: 12,
    matchingGroupCount: 1,
    fullGroupCount: 1,
    waitBand: "long",
    inflowPerWeek: 2.5,
    outflowPerWeek: 0.4,
    resourceWindowAvailable: true,
    isTest: false,
    journeyRunId: null
  }];
  input.qualityIssues = [{ id: "quality-1", entityType: "participant", entityId: "participant-1", severity: "error", title: "Dossier mist gegeven", description: "Controleer het dossier.", suggestedAction: "Vul het gegeven aan", isTest: false, journeyRunId: null }];
  input.readiness = [{ id: "ready-1", participantId: "participant-1", programId: "program-1", stageId: "stage-1", readinessScore: 92, isTest: false, journeyRunId: null }];
  input.credits = [{ id: "credit-1", participantId: "participant-1", expiresOn: "2026-08-01", isTest: false, journeyRunId: null }];
  input.capacityForecasts = [{
    groupId: "group-full",
    groupName: "Badje 1 woensdag",
    programId: "program-1",
    riskLevel: "critical",
    expectedBottlenecks: 4,
    confidence: "hoog",
    evidence: ["8 van 8 bezet", "12 kandidaten in de voorkeursscope"],
    isTest: false
  }];
  input.attendanceRisks = [{
    participantId: "participant-1",
    groupId: "group-full",
    signalType: "repeated_no_show",
    riskLevel: "high",
    reason: "Een warme check-in kan helpen.",
    evidence: ["2 afwezigheden in 30 dagen"],
    confidence: "hoog",
    isTest: false,
    journeyRunId: null
  }];
  input.progressBottlenecks = [{
    groupId: "group-full",
    programId: "program-1",
    skillId: "skill-1",
    skillLabel: "Rugdrijven",
    affectedCount: 4,
    totalCount: 6,
    stagnationRate: 0.67,
    confidence: "middel",
    suggestedFocus: "Oefen rugdrijven rustig en positief.",
    isTest: false,
    journeyRunId: null
  }];
  input.leadScores = [{
    intakeId: "intake-1",
    programId: "program-1",
    score: 84,
    confidence: 0.9,
    suggestedAction: "Neem persoonlijk contact op en open de plaatsingsmogelijkheden.",
    reasons: [{
      label: "Plaatsingsoptie beschikbaar",
      explanation: "Er is een actuele blocker-vrije optie.",
      evidence: "84/100"
    }],
    isTest: false,
    journeyRunId: null
  }];
  return input;
}

function emptyInput(): NextBestActionInput {
  return {
    now,
    intakes: [],
    offers: [],
    payments: [],
    groups: [],
    waitlist: [],
    demandWindows: [],
    qualityIssues: [],
    readiness: [],
    credits: []
  };
}
