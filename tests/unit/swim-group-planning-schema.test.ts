import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizePlanningConflictResult,
  parseGroupScheduleDraft
} from "../../apps/web/lib/domain/group-planning-contract";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260802190000_structured_group_planning.sql", import.meta.url),
  "utf8"
);
const phase16Fixture = readFileSync(
  new URL("../../scripts/staging/phase-16-operational-flow.mjs", import.meta.url),
  "utf8"
);

test("capaciteitsbuckets blijven afzonderlijk binnen één fysieke limiet", () => {
  assert.match(migration, /regular_capacity integer/i);
  assert.match(migration, /flex_capacity integer/i);
  assert.match(migration, /trial_capacity integer/i);
  assert.match(migration, /regular_capacity \+ flex_capacity \+ trial_capacity <= hard_capacity/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /Physical group capacity exceeded/i);

  assert.throws(() => parseGroupScheduleDraft(validDraft({
    regularCapacity: 8,
    flexCapacity: 2,
    trialCapacity: 1,
    hardCapacity: 10
  })), /passen niet/);
});

test("publicatie herhaalt conflictcontrole onder resource- en instructeurlocks", () => {
  assert.match(migration, /create or replace function app_private\.evaluate_group_schedule/i);
  assert.match(migration, /create or replace function app_private\.preview_group_schedule/i);
  assert.match(migration, /create or replace function app_private\.publish_group_schedule/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /result_json := app_private\.evaluate_group_schedule/i);
  assert.match(migration, /Transactional planning conflict/i);
  assert.match(migration, /domain_command_receipts/i);
});

test("occurrences gebruiken lokale wall-clock tijd en immutable versiegebonden regels", () => {
  assert.match(migration, /\(occurrence_date \+ target_start_time\) at time zone tenant_timezone/i);
  assert.match(migration, /local_occurrence_date/i);
  assert.match(migration, /schedule_revision/i);
  assert.match(migration, /Published schedule rules are immutable/i);
  assert.match(migration, /session_resource_reservations/i);
  assert.match(migration, /session_instructor_reservations/i);
});

test("conflictviewmodel maakt hard en adviserend expliciet", () => {
  const result = normalizePlanningConflictResult({
    canPublish: false,
    hardConflictCount: 1,
    warningCount: 1,
    occurrenceCount: 4,
    timezone: "Europe/Amsterdam",
    conflicts: [
      { code: "resource_overlap", severity: "hard", blocking: true, title: "Conflict", detail: "Bezet" },
      { code: "availability_missing", severity: "warning", blocking: false, title: "Advies", detail: "Controleer" }
    ]
  });
  assert.equal(result.conflictContractVersion, "planning_conflicts_v3");
  assert.equal(result.conflicts[0]?.blocking, true);
  assert.equal(result.conflicts[1]?.severity, "warning");
  assert.equal(result.canPublish, false);
});

test("stagingfixture legt geverifieerde kwalificatiemasterdata vast vóór actieve inzet", () => {
  const qualification = phase16Fixture.indexOf('"instructor_qualifications"');
  const groupAssignment = phase16Fixture.indexOf('"group_instructor_assignments"');
  const sessionAssignment = phase16Fixture.indexOf('"session_instructor_assignments"');

  assert.ok(qualification >= 0);
  assert.ok(qualification < groupAssignment);
  assert.ok(qualification < sessionAssignment);
  assert.match(phase16Fixture, /verified_by_user_id:\s*users\.tenantAdmin\.id/);
  assert.match(phase16Fixture, /status:\s*"active"/);
});

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    capacityBorrowing: "none",
    code: "ma-b1",
    endTime: "16:45",
    endsOn: "2026-12-31",
    flexCapacity: 1,
    hardCapacity: 10,
    instructorUserIds: ["13000000-0000-4000-8000-000000000001"],
    lessonTimeTemplateId: "",
    name: "Maandag Badje één",
    offeringType: "regular",
    programId: "33000000-0000-4000-8000-000000000001",
    reason: "Nieuwe groep",
    recurrenceIntervalWeeks: 1,
    regularCapacity: 8,
    resourceId: "53000000-0000-4000-8000-000000000001",
    stageId: "43000000-0000-4000-8000-000000000001",
    startTime: "16:00",
    startsOn: "2026-09-01",
    trialCapacity: 1,
    weekday: 1,
    ...overrides
  };
}
