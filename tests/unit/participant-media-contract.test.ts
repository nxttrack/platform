import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateParticipantMediaAccess,
  evaluateParticipantMediaConsent,
  normalizeRetentionDays
} from "../../apps/web/lib/domain/participant-media-contract";

const now = new Date("2026-07-27T12:00:00.000Z");

test("consent requires an active grant and conservatively honors an objection", () => {
  assert.equal(
    evaluateParticipantMediaConsent(
      [{ expiresAt: null, guardianUserId: "guardian-a", status: "granted" }],
      ["guardian-a", "guardian-b"],
      now
    ).valid,
    true
  );

  const blocked = evaluateParticipantMediaConsent(
    [
      { expiresAt: null, guardianUserId: "guardian-a", status: "granted" },
      { expiresAt: null, guardianUserId: "guardian-b", status: "withdrawn" }
    ],
    ["guardian-a", "guardian-b"],
    now
  );
  assert.equal(blocked.valid, false);
  assert.equal(blocked.reason, "explicitly_blocked");
});

test("expired and unrelated guardian decisions cannot grant access", () => {
  assert.equal(
    evaluateParticipantMediaConsent(
      [{ expiresAt: "2026-07-27T11:59:59.000Z", guardianUserId: "guardian-a", status: "granted" }],
      ["guardian-a"],
      now
    ).valid,
    false
  );
  assert.equal(
    evaluateParticipantMediaConsent(
      [{ expiresAt: null, guardianUserId: "unrelated", status: "granted" }],
      ["guardian-a"],
      now
    ).valid,
    false
  );
});

test("media access explains every denial and only allows clean published media", () => {
  const base = {
    consentValid: true,
    downloadAllowed: false,
    expiresAt: "2026-08-27T12:00:00.000Z",
    malwareScanStatus: "clean",
    now,
    status: "published"
  };

  assert.equal(evaluateParticipantMediaAccess(base).allowed, true);
  assert.equal(evaluateParticipantMediaAccess({ ...base, consentValid: false }).reason, "consent_missing");
  assert.equal(evaluateParticipantMediaAccess({ ...base, status: "draft" }).reason, "not_published");
  assert.equal(evaluateParticipantMediaAccess({ ...base, expiresAt: now.toISOString() }).reason, "expired");
  assert.equal(evaluateParticipantMediaAccess({ ...base, malwareScanStatus: "failed" }).reason, "scan_required");
  assert.equal(evaluateParticipantMediaAccess({ ...base, malwareScanStatus: "not_required" }).reason, "scan_required");
  assert.equal(evaluateParticipantMediaAccess({ ...base, requestedDownload: true }).reason, "download_disabled");
});

test("tenant staff can review a draft without making it parent-visible", () => {
  const decision = evaluateParticipantMediaAccess({
    allowDraftReview: true,
    consentValid: true,
    downloadAllowed: false,
    expiresAt: "2026-08-27T12:00:00.000Z",
    malwareScanStatus: "clean",
    now,
    status: "draft"
  });

  assert.equal(decision.allowed, true);
  assert.equal(
    evaluateParticipantMediaAccess({ ...decisionInput(), allowDraftReview: false, status: "draft" }).allowed,
    false
  );
});

test("retention is clamped to the documented privacy boundary", () => {
  assert.equal(normalizeRetentionDays("10"), 30);
  assert.equal(normalizeRetentionDays("365"), 365);
  assert.equal(normalizeRetentionDays("900"), 730);
  assert.equal(normalizeRetentionDays("invalid"), 365);
});

function decisionInput() {
  return {
    consentValid: true,
    downloadAllowed: false,
    expiresAt: "2026-08-27T12:00:00.000Z",
    malwareScanStatus: "clean",
    now,
    status: "published"
  };
}
