import assert from "node:assert/strict";
import test from "node:test";

import { buildCampaignRevenueReport } from "../../apps/web/lib/analytics/campaign-revenue-contract";
import { detectCrmFollowUpCandidates } from "../../apps/web/lib/domain/crm-follow-up-contract";
import {
  computeFamilyPlacementOptions,
  type FamilyChildPlacementCandidate
} from "../../apps/web/lib/domain/family-placement-contract";
import { computeLeadScore } from "../../apps/web/lib/domain/lead-scoring-contract";
import { computeMakeupMarketplaceMatches } from "../../apps/web/lib/domain/makeup-marketplace-contract";

test("family planner prefers same-day, same-location combinations and exposes waiting time", () => {
  const options = computeFamilyPlacementOptions({
    guardianId: "guardian-1",
    candidatesByChild: [
      {
        childKey: "child-a",
        candidates: [
          familyCandidate({ participantId: "child-a", groupId: "group-a", weekday: 3, startsAt: "16:00", endsAt: "16:45", locationId: "pool-1" }),
          familyCandidate({ participantId: "child-a", groupId: "group-a-alt", weekday: 2, startsAt: "17:00", endsAt: "17:45", locationId: "pool-2", score: 92 })
        ]
      },
      {
        childKey: "child-b",
        candidates: [
          familyCandidate({ participantId: "child-b", groupId: "group-b", weekday: 3, startsAt: "17:00", endsAt: "17:45", locationId: "pool-1" })
        ]
      }
    ]
  });

  assert.equal(options[0]?.same_day, true);
  assert.equal(options[0]?.same_location, true);
  assert.equal(options[0]?.waiting_time_between_lessons, 15);
  assert.match(options[0]?.reasons.map((reason) => reason.label).join("|") ?? "", /Dezelfde dag/);
});

test("family planner never hides a FIFO override", () => {
  const candidate = familyCandidate({
    participantId: "child-a",
    groupId: "group-a",
    fifoRank: 3,
    fifoCohortSize: 7,
    fifoOverrideRequired: true
  });
  const options = computeFamilyPlacementOptions({
    guardianId: "guardian-1",
    candidatesByChild: [
      { childKey: "child-a", candidates: [candidate] },
      { childKey: "child-b", candidates: [familyCandidate({ participantId: "child-b", groupId: "group-b" })] }
    ]
  });

  assert.ok(options[0]?.blockers.some((blocker) => blocker.code === "fifo_override_required"));
});

test("make-up matching subtracts cancellations and requires exact program and stage", () => {
  const result = computeMakeupMarketplaceMatches({
    session: {
      id: "session-1",
      startsAt: "2026-08-05T16:00:00.000Z",
      programId: "swim-a",
      stageId: "badje-2",
      capacity: 8,
      regularParticipants: 8,
      cancelledParticipants: 2,
      activeHolds: 1
    },
    candidates: [
      {
        participantId: "match",
        participantName: "Mila",
        guardianUserId: "guardian-1",
        creditId: "credit-1",
        programId: "swim-a",
        stageId: "badje-2",
        expiresOn: "2026-08-10",
        preferredWeekdays: [3],
        preferredStartsAfter: "15:00",
        preferredEndsBefore: "18:00",
        alreadyBooked: false,
        notificationAllowed: true,
        isTest: false,
        journeyRunId: null
      },
      {
        participantId: "wrong-stage",
        participantName: "Noa",
        guardianUserId: "guardian-2",
        creditId: "credit-2",
        programId: "swim-a",
        stageId: "badje-1",
        expiresOn: null,
        preferredWeekdays: [],
        preferredStartsAfter: null,
        preferredEndsBefore: null,
        alreadyBooked: false,
        notificationAllowed: true,
        isTest: false,
        journeyRunId: null
      }
    ],
    now: "2026-07-26T10:00:00.000Z"
  });

  assert.equal(result.available, 1);
  assert.deepEqual(result.matches.map((match) => match.participant_id), ["match"]);
  assert.ok(result.matches[0]?.reasons.some((reason) => reason.label === "Programma en niveau passen"));
});

test("lead score is explainable and contains no acquisition or free-text source", () => {
  const score = computeLeadScore({
    requiredFieldsComplete: true,
    requiredAnswersComplete: true,
    birthDate: "2018-05-04",
    preferredDayCount: 3,
    selectedGroupId: "group-1",
    placementAvailable: true,
    placementConfidence: 0.92,
    placementBlockers: [],
    waitBand: "short",
    offerResponseHours: 20,
    trialCompleted: true,
    paymentPaid: true,
    locationMatchInferred: true,
    now: "2026-07-26T10:00:00.000Z"
  });

  assert.equal(score.score_band, "high");
  assert.ok(score.reasons.length >= 5);
  assert.ok(score.reasons.every((reason) => !["utm", "campaign", "free_text", "gender", "nationality"].includes(reason.source)));
  assert.ok(score.confidence > 0.8);
});

test("CRM produces reviewable drafts and preserves Journey markers without sending", () => {
  const candidates = detectCrmFollowUpCandidates({
    now: "2026-07-26T12:00:00.000Z",
    leads: [{
      intakeId: "intake-1",
      participantId: "participant-1",
      guardianUserId: "guardian-1",
      participantName: "Mila",
      parentName: "Sam",
      status: "received",
      selectedOption: "enrollment",
      receivedAt: "2026-07-24T08:00:00.000Z",
      leadScoreBand: "high",
      placementAvailable: true,
      latestContactAt: null,
      openOffer: null,
      trialCompletedAt: null,
      hasFollowUpAfterTrial: false,
      missingPayment: false,
      isTest: true,
      journeyRunId: "run-1"
    }]
  });

  assert.ok(candidates.some((candidate) => candidate.signalType === "intake_unfollowed"));
  assert.ok(candidates.some((candidate) => candidate.signalType === "placeable_uncontacted"));
  assert.ok(candidates.every((candidate) => candidate.draftBody.includes("Beste Sam")));
  assert.ok(candidates.every((candidate) => candidate.isTest && candidate.journeyRunId === "run-1"));
});

test("campaign revenue requires lineage, excludes test and duplicate rows, and nets refunds", () => {
  const report = buildCampaignRevenueReport({
    from: "2026-07-01",
    to: "2026-07-31",
    rows: [
      {
        intakeId: "live",
        receivedAt: "2026-07-10T10:00:00.000Z",
        duplicateState: "unique",
        attributionChannel: "paid_search",
        source: "google",
        medium: "cpc",
        campaign: "zomer",
        isTest: false,
        journeyRunId: null,
        recordSource: "public_intake",
        hasLineage: true,
        placementMethod: "slot_offer",
        placedAt: "2026-07-12T10:00:00.000Z",
        enrollmentStarted: true,
        trialCompleted: true,
        activeSubscription: true,
        payments: [{ currency: "EUR", amountCents: 10000, refundedCents: 2500, chargebackCents: 0, status: "refunded", paidOn: "2026-07-15" }]
      },
      {
        intakeId: "test",
        receivedAt: "2026-07-10T10:00:00.000Z",
        duplicateState: "unique",
        attributionChannel: "paid_search",
        source: "google",
        medium: "cpc",
        campaign: "zomer",
        isTest: true,
        journeyRunId: "run-1",
        recordSource: "journey_simulation_bot",
        hasLineage: true,
        placementMethod: "direct_placement",
        placedAt: "2026-07-12T10:00:00.000Z",
        enrollmentStarted: true,
        trialCompleted: false,
        activeSubscription: true,
        payments: []
      }
    ]
  });

  assert.equal(report.totalIntakes, 1);
  assert.equal(report.totalPlacements, 1);
  assert.equal(report.netReceivedByCurrency.EUR, 7500);
  assert.equal(report.visitors, null);
});

function familyCandidate(overrides: Partial<FamilyChildPlacementCandidate>): FamilyChildPlacementCandidate {
  return {
    participantId: "child",
    waitlistEntryId: "waitlist",
    participantName: "Kind",
    groupId: "group",
    groupName: "Badje 2 woensdag",
    programId: "swim-a",
    stageId: "badje-2",
    weekday: 3,
    startsAt: "16:00",
    endsAt: "16:45",
    locationId: "pool-1",
    locationName: "Hoofdbad",
    score: 75,
    confidence: 0.9,
    capacityAvailable: 2,
    fifoRank: 1,
    fifoCohortSize: 5,
    fifoOverrideRequired: false,
    isTest: false,
    journeyRunId: null,
    reasons: [],
    blockers: [],
    ...overrides
  };
}
