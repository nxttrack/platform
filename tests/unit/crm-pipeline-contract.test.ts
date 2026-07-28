import assert from "node:assert/strict";
import test from "node:test";

import { crmStageProgress, findDuplicateLeads, getCrmSlaState } from "../../apps/web/lib/domain/crm-pipeline-contract";

test("CRM duplicate detection is explainable and keeps the oldest lead canonical", () => {
  const candidates = findDuplicateLeads([
    {
      id: "newer",
      parentEmail: " OUDER@EXAMPLE.NL ",
      parentPhone: "06 12345678",
      parentName: "Sam de Vries",
      participantName: "Noor",
      participantBirthDate: "2020-02-03",
      receivedAt: "2026-07-10T10:00:00Z"
    },
    {
      id: "older",
      parentEmail: "ouder@example.nl",
      parentPhone: "0612345678",
      parentName: "Sam de Vries",
      participantName: "Noor",
      participantBirthDate: "2020-02-03",
      receivedAt: "2026-07-01T10:00:00Z"
    }
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceId, "newer");
  assert.equal(candidates[0].candidateId, "older");
  assert.equal(candidates[0].score, 100);
  assert.match(candidates[0].reasons.join(" "), /e-mailadres/);
});

test("CRM duplicate detection never combines live and Journey Bot identities", () => {
  const base = {
    parentEmail: "ouder@example.nl",
    parentPhone: null,
    parentName: "Ouder",
    participantName: "Kind",
    participantBirthDate: "2020-01-01",
    receivedAt: "2026-07-01T10:00:00Z"
  };
  assert.deepEqual(findDuplicateLeads([
    { ...base, id: "live", isTest: false },
    { ...base, id: "test", isTest: true }
  ]), []);
});

test("CRM SLA distinguishes on-track, due-soon, overdue and closed stages", () => {
  const now = new Date("2026-07-29T10:00:00Z");
  assert.equal(getCrmSlaState({ dueAt: "2026-07-30T10:00:00Z", stage: "new", now }).status, "on_track");
  assert.equal(getCrmSlaState({ dueAt: "2026-07-29T11:00:00Z", stage: "new", now }).status, "due_soon");
  assert.equal(getCrmSlaState({ dueAt: "2026-07-29T09:00:00Z", stage: "contacted", now }).status, "overdue");
  assert.equal(getCrmSlaState({ dueAt: "2026-07-29T09:00:00Z", stage: "placed", now }).status, "closed");
});

test("CRM stage progress never rewards a lost outcome", () => {
  assert.equal(crmStageProgress("new"), 0);
  assert.equal(crmStageProgress("placed"), 100);
  assert.equal(crmStageProgress("lost"), 0);
});
