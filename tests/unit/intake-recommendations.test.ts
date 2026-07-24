import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDaypart,
  rankIntakeSlots,
  type PublicIntakeSlot
} from "../../apps/web/lib/domain/intake-recommendation-contract";

const slots: PublicIntakeSlot[] = [
  slot({ groupId: "monday-afternoon", weekday: 1, weekdayLabel: "Maandag", daypart: "afternoon", startsAt: "15:00", waitBand: "medium", stageSortOrder: 0 }),
  slot({ groupId: "monday-evening", weekday: 1, weekdayLabel: "Maandag", daypart: "evening", startsAt: "18:00", waitBand: "short", stageSortOrder: 1 }),
  slot({ groupId: "wednesday-afternoon", weekday: 3, weekdayLabel: "Woensdag", daypart: "afternoon", startsAt: "15:30", waitBand: "short", stageSortOrder: 0 }),
  slot({ groupId: "saturday-morning", weekday: 6, weekdayLabel: "Zaterdag", daypart: "morning", startsAt: "09:00", waitBand: "long", stageSortOrder: 0 })
];

test("rankt een exact voorkeursmoment boven een alternatief met kortere wachttijd", () => {
  const recommendations = rankIntakeSlots({
    slots,
    experience: "none",
    preferredDays: [1],
    preferredDayparts: { 1: ["afternoon"] }
  });

  assert.equal(recommendations[0]?.groupId, "monday-afternoon");
  assert.equal(recommendations[0]?.rank, 1);
  assert.match(recommendations[0]?.reasons[0] ?? "", /past bij jullie voorkeur/);
});

test("geeft drie keuzes en markeert zinvolle alternatieven wanneer de exacte selectie beperkt is", () => {
  const recommendations = rankIntakeSlots({
    slots,
    experience: "water_familiar",
    preferredDays: [6],
    preferredDayparts: { 6: ["morning"] }
  });

  assert.equal(recommendations.length, 3);
  assert.equal(recommendations[0]?.groupId, "saturday-morning");
  assert.match(recommendations[1]?.reasons[0] ?? "", /alternatieve moment/);
});

test("leidt dagdelen stabiel af uit de starttijd", () => {
  assert.equal(deriveDaypart("09:30:00"), "morning");
  assert.equal(deriveDaypart("15:00:00"), "afternoon");
  assert.equal(deriveDaypart("18:15:00"), "evening");
});

function slot(overrides: Partial<PublicIntakeSlot> & Pick<PublicIntakeSlot, "groupId">): PublicIntakeSlot {
  return {
    groupId: overrides.groupId,
    programId: "program",
    groupName: overrides.groupId,
    stageId: "stage",
    stageName: "Badje 1",
    stageSortOrder: 0,
    weekday: 1,
    weekdayLabel: "Maandag",
    daypart: "afternoon",
    startsAt: "15:00",
    endsAt: "15:45",
    waitBand: "short",
    ...overrides
  };
}
