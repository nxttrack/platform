import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  badgeAwardKey,
  badgeMatchesAudience,
  firstNameOnly,
  normalizeBadgeGender,
  resolveBadgeShortcodes,
  resolveGenderedCopy,
  selectTriggerCandidates,
  validateBadgeLayers
} from "../../apps/web/lib/domain/badge-system-contract";

test("gendergerichte badgecopy heeft altijd een neutrale fallback", () => {
  const copy = { default: "Zwemheld", boy: "Zwemheld jongen", girl: "Zwemheld meisje" };

  assert.equal(resolveGenderedCopy(copy, "boy"), "Zwemheld jongen");
  assert.equal(resolveGenderedCopy(copy, "girl"), "Zwemheld meisje");
  assert.equal(resolveGenderedCopy(copy, "unknown"), "Zwemheld");
  assert.equal(resolveGenderedCopy({ default: "Neutraal", boy: "" }, "boy"), "Neutraal");
  assert.equal(normalizeBadgeGender("anders"), "unknown");
});

test("audiencefilter sluit onbekend geslacht uit van gendergebonden varianten", () => {
  assert.equal(badgeMatchesAudience("unknown", "all"), true);
  assert.equal(badgeMatchesAudience("unknown", "boys"), false);
  assert.equal(badgeMatchesAudience("boy", "boys"), true);
  assert.equal(badgeMatchesAudience("girl", "girls"), true);
  assert.equal(badgeMatchesAudience("girl", "boys"), false);
});

test("shortcodes gebruiken uitsluitend de voornaam en gendergerichte badgecopy", () => {
  const rendered = resolveBadgeShortcodes(
    "{child_first_name} is {child_gender_label} en behaalde {badge_name_gendered} bij {organization_name}.",
    {
      badgeDescription: "Mooi gezwommen.",
      badgeName: "Eerste Plons",
      childFirstName: "Sam de Jong",
      gender: "unknown",
      organizationName: "De Waterlijn"
    }
  );

  assert.equal(rendered, "Sam is kind en behaalde Eerste Plons bij De Waterlijn.");
  assert.equal(firstNameOnly("  Noor van Dijk "), "Noor");
});

test("triggerselectie is uitlegbaar op type, drempel, skill, stage en diploma", () => {
  const definitions = [
    { badgeKey: "five", triggerType: "attendance_count", triggerConfig: { count: 5 } },
    { badgeKey: "ten", triggerType: "attendance_count", triggerConfig: { count: 10 } },
    { badgeKey: "float", triggerType: "skill_completed", triggerConfig: { skill: "float_back" } },
    { badgeKey: "stage", triggerType: "stage_completed", triggerConfig: { stage: 2 } },
    { badgeKey: "a", triggerType: "certificate_issued", triggerConfig: { certificate: "A" } }
  ];

  assert.deepEqual(selectTriggerCandidates(definitions, "attendance_count", { count: 7 }).map((item) => item.badgeKey), ["five"]);
  assert.deepEqual(selectTriggerCandidates(definitions, "skill_completed", { skill: "float_back" }).map((item) => item.badgeKey), ["float"]);
  assert.deepEqual(selectTriggerCandidates(definitions, "stage_completed", { stage: 2 }).map((item) => item.badgeKey), ["stage"]);
  assert.deepEqual(selectTriggerCandidates(definitions, "certificate_issued", { certificate: "A" }).map((item) => item.badgeKey), ["a"]);
});

test("awardkeys zijn stabiel en begrensd voor idempotente toekenning", () => {
  assert.equal(
    badgeAwardKey({ badgeKey: "first_lesson_attended", participantId: "participant-1" }),
    "participant-1:first_lesson_attended:lifetime"
  );
  assert.equal(
    badgeAwardKey({ badgeKey: "manual_compliment", participantId: "participant-1", eventEntityId: "review-1" }),
    "participant-1:manual_compliment:review-1"
  );
});

test("template-editor accepteert alleen bekende, begrensde lagen", () => {
  const layers = validateBadgeLayers([
    { id: "title", type: "text", x: -10, y: 20, width: 9000, height: 80, text: "Hallo", opacity: 3 },
    { id: "photo", type: "image", assetId: "5a9403a7-44d5-4d7a-a593-b341f2046b49", x: 10, y: 10, width: 500, height: 500, objectFit: "cover", alt: "Zwemillustratie" },
    { id: "unsafe-image", type: "image", assetId: "../../object", x: 10, y: 10, width: 500, height: 500 },
    { id: "script", type: "iframe", x: 0, y: 0, width: 10, height: 10 }
  ]);

  assert.equal(layers.length, 2);
  assert.equal(layers[0]?.x, 0);
  assert.equal(layers[0]?.width, 2400);
  assert.equal(layers[0]?.opacity, 1);
  assert.equal(layers[1]?.type, "image");
  assert.equal(layers[1]?.objectFit, "cover");
});

test("engine verstuurt niets extern buiten de bestaande notificatielaag", () => {
  const source = readFileSync(new URL("../../apps/web/lib/domain/badge-engine.ts", import.meta.url), "utf8");

  assert.match(source, /createTenantNotifications/);
  assert.doesNotMatch(source, /sendTransactionalEmail|api\.sendgrid\.com|fetch\(|twilio/i);
  assert.match(source, /badgeEmailsEnabled|badge_emails_enabled/);
  assert.match(source, /participant\.is_test/);
});

test("gender wordt nergens als plaatsings- of betaalcriterium gebruikt", () => {
  for (const file of [
    "../../apps/web/lib/domain/placement-contract.ts",
    "../../apps/web/lib/domain/smart-placement.ts",
    "../../apps/web/lib/domain/wait-time-contract.ts",
    "../../apps/web/lib/domain/mollie-contract.ts"
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /participantGender|participant_gender|\bgender\b/);
  }
});
