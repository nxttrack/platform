import assert from "node:assert/strict";
import test from "node:test";

import { addDays, addYears, localDateInTimeZone, localNoonIso, occurrenceForWeekday, zonedDateTimeToUtc } from "../../scripts/staging/demo-time.mjs";

const zone = "Europe/Amsterdam";

test("resolves the Amsterdam calendar date around UTC midnight", () => {
  assert.equal(localDateInTimeZone(new Date("2026-07-25T22:30:00Z"), zone), "2026-07-26");
  assert.equal(localDateInTimeZone(new Date("2026-01-25T22:30:00Z"), zone), "2026-01-25");
});

test("keeps date-only arithmetic deterministic", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addYears("2020-02-29", 6), "2026-03-01");
});

test("converts local lesson times with summer and winter offsets", () => {
  assert.equal(zonedDateTimeToUtc("2026-07-27", "16:00", zone).toISOString(), "2026-07-27T14:00:00.000Z");
  assert.equal(zonedDateTimeToUtc("2026-01-26", "16:00", zone).toISOString(), "2026-01-26T15:00:00.000Z");
  assert.equal(localNoonIso("2026-07-27", zone), "2026-07-27T10:00:00.000Z");
});

test("builds the requested weekday in the current and next week", () => {
  assert.equal(occurrenceForWeekday("2026-07-26", 1, "16:00", 0, zone).toISOString(), "2026-07-20T14:00:00.000Z");
  assert.equal(occurrenceForWeekday("2026-07-26", 1, "16:00", 1, zone).toISOString(), "2026-07-27T14:00:00.000Z");
});
