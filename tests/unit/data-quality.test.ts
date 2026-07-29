import assert from "node:assert/strict";
import test from "node:test";

import {
  detectDataQualityIssues,
  type DataQualityInput
} from "../../apps/web/lib/domain/data-quality-contract";

test("signaleert de afgesproken datakwaliteitsrisico's uitlegbaar en zonder bronmutaties", () => {
  const input = emptyInput();
  input.guardians = [
    {
      id: "guardian-a",
      name: "Sam de Vries",
      email: "SAM@example.test",
      phone: "+31 6 12345678",
      profileExists: true
    },
    {
      id: "guardian-b",
      name: "Sám de Vries",
      email: " sam@example.test ",
      phone: "06-12345678",
      profileExists: true
    },
    {
      id: "guardian-c",
      name: "Ouder zonder mail",
      email: null,
      phone: "0612345679",
      profileExists: true
    },
    {
      id: "guardian-missing",
      name: null,
      email: null,
      phone: null,
      profileExists: false
    }
  ];
  input.participants = [
    {
      id: "participant-young",
      name: "Jonge Zwemmer",
      birthDate: "2024-01-01",
      guardianUserId: null,
      source: "manual",
      isTest: false,
      journeyRunId: null
    },
    {
      id: "participant-future",
      name: "Toekomstige Zwemmer",
      birthDate: "2027-01-01",
      guardianUserId: "guardian-a",
      source: "manual",
      isTest: false,
      journeyRunId: null
    }
  ];
  input.participantGuardians = [{
    participantId: "participant-future",
    guardianId: "guardian-a",
    status: "active"
  }];
  input.intakes = [{
    id: "intake-converted",
    participantName: "Niet gekoppeld",
    status: "converted",
    hasConvertedParticipant: false,
    source: "public_intake",
    isTest: false,
    journeyRunId: null
  }];
  input.waitlistEntries = [
    {
      id: "waitlist-program",
      participantName: "Programma mist",
      programId: null,
      stageId: null,
      status: "waiting",
      minimumAgeBlocked: false,
      source: "manual",
      isTest: false,
      journeyRunId: null
    },
    {
      id: "waitlist-stage",
      participantName: "Niveau mist",
      programId: "program-inactive",
      stageId: null,
      status: "waiting",
      minimumAgeBlocked: false,
      source: "manual",
      isTest: false,
      journeyRunId: null
    }
  ];
  input.programs = [{ id: "program-inactive", name: "Diploma A", status: "inactive" }];
  input.groups = [{
    id: "group-a",
    name: "Badje 1 woensdag",
    status: "active",
    resourceId: null,
    hasEffectiveResource: false,
    hasEffectiveInstructor: false
  }];
  input.sessions = [{
    id: "session-orphan",
    label: "Verweesde sessie",
    groupId: "missing-group",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];
  input.enrollments = [{
    id: "enrollment-a",
    participantId: "participant-future",
    participantName: "Toekomstige Zwemmer",
    programId: "program-inactive",
    status: "active",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];
  input.memberships = [
    membership("membership-a", "participant-young", "group-a", null),
    membership("membership-b", "participant-young", "group-b", "2026-07-01")
  ];
  input.financialRecords = [{
    id: "payment-a",
    kind: "payment",
    participantId: "participant-young",
    participantName: "Jonge Zwemmer",
    guardianId: "guardian-missing",
    status: "overdue"
  }];
  input.journeyRecords = [{
    id: "journey-record",
    entityType: "participant",
    entityLabel: "Markerdrift",
    source: "journey_simulation_bot",
    isTest: false,
    journeyRunId: null
  }];

  const findings = detectDataQualityIssues(input);
  const issueTypes = new Set(findings.map((finding) => finding.issueType));

  for (const issueType of [
    "duplicate_guardian_email",
    "duplicate_guardian_phone",
    "duplicate_guardian_name",
    "guardian_missing_email",
    "guardian_profile_missing",
    "participant_without_guardian",
    "participant_impossible_birth_date",
    "converted_intake_without_participant",
    "waitlist_without_program",
    "waitlist_without_stage",
    "group_without_instructor",
    "group_without_resource",
    "session_without_group",
    "participant_in_multiple_active_groups",
    "active_enrollment_without_active_program",
    "payment_without_guardian",
    "group_membership_without_start_date",
    "under_four_participant_is_placeable",
    "journey_bot_marker_drift"
  ]) {
    assert.equal(issueTypes.has(issueType), true, `${issueType} ontbreekt`);
  }

  assert.equal(findings.every((finding) => typeof finding.metadata.confidence === "number"), true);
  assert.equal(findings.every((finding) => Array.isArray(finding.metadata.evidence)), true);
  assert.equal(new Set(findings.map((finding) => finding.fingerprint)).size, findings.length);
});

test("laat complete, geldige tenantdata ongemoeid", () => {
  const input = emptyInput();
  input.guardians = [{
    id: "guardian-a",
    name: "Robin Jansen",
    email: "robin@example.test",
    phone: "0612345678",
    profileExists: true
  }];
  input.participantGuardians = [{
    participantId: "participant-a",
    guardianId: "guardian-a",
    status: "active"
  }];
  input.participants = [{
    id: "participant-a",
    name: "Noa Jansen",
    birthDate: "2019-04-12",
    guardianUserId: "guardian-a",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];
  input.programs = [{ id: "program-a", name: "Diploma A", status: "active" }];
  input.groups = [{
    id: "group-a",
    name: "Badje 1 maandag",
    status: "active",
    resourceId: "resource-a",
    hasEffectiveResource: true,
    hasEffectiveInstructor: true
  }];
  input.sessions = [{
    id: "session-a",
    label: "Badje 1 maandag",
    groupId: "group-a",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];
  input.enrollments = [{
    id: "enrollment-a",
    participantId: "participant-a",
    participantName: "Noa Jansen",
    programId: "program-a",
    status: "active",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];
  input.memberships = [membership("membership-a", "participant-a", "group-a", "2026-07-01")];
  input.financialRecords = [{
    id: "subscription-a",
    kind: "subscription",
    participantId: "participant-a",
    participantName: "Noa Jansen",
    guardianId: "guardian-a",
    status: "active"
  }];
  input.journeyRecords = [{
    id: "participant-a",
    entityType: "participant",
    entityLabel: "Noa Jansen",
    source: "manual",
    isTest: false,
    journeyRunId: null
  }];

  assert.deepEqual(detectDataQualityIssues(input), []);
});

function emptyInput(): DataQualityInput {
  return {
    now: "2026-07-26T12:00:00.000Z",
    guardians: [],
    participantGuardians: [],
    participants: [],
    intakes: [],
    waitlistEntries: [],
    programs: [],
    groups: [],
    sessions: [],
    enrollments: [],
    memberships: [],
    financialRecords: [],
    journeyRecords: []
  };
}

function membership(id: string, participantId: string, groupId: string, startsOn: string | null) {
  return {
    id,
    participantId,
    participantName: participantId,
    groupId,
    groupName: groupId,
    status: "active",
    startsOn,
    endsOn: null,
    source: "manual",
    isTest: false,
    journeyRunId: null
  };
}
