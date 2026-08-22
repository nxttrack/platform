import assert from "node:assert/strict";
import test from "node:test";

import {
  addAmsterdamCalendarDays,
  businessTimeZone,
  toAmsterdamDate
} from "../../apps/web/lib/date/business-date";

test("Amsterdam business date crosses UTC midnight correctly in CET and CEST", () => {
  assert.equal(businessTimeZone, "Europe/Amsterdam");
  assert.equal(toAmsterdamDate("2026-01-15T22:59:59Z"), "2026-01-15");
  assert.equal(toAmsterdamDate("2026-01-15T23:00:00Z"), "2026-01-16");
  assert.equal(toAmsterdamDate("2026-07-15T21:59:59Z"), "2026-07-15");
  assert.equal(toAmsterdamDate("2026-07-15T22:00:00Z"), "2026-07-16");
});

test("Amsterdam business date is stable on the 2026 DST transition days", () => {
  assert.equal(toAmsterdamDate("2026-03-29T00:30:00Z"), "2026-03-29");
  assert.equal(toAmsterdamDate("2026-03-29T22:30:00Z"), "2026-03-30");
  assert.equal(toAmsterdamDate("2026-10-25T00:30:00Z"), "2026-10-25");
  assert.equal(toAmsterdamDate("2026-10-25T23:30:00Z"), "2026-10-26");
});

test("calendar-day offsets do not inherit 23-hour or 25-hour DST arithmetic", () => {
  assert.equal(addAmsterdamCalendarDays("2026-03-28T23:30:00Z", 1), "2026-03-30");
  assert.equal(addAmsterdamCalendarDays("2026-10-24T22:30:00Z", 1), "2026-10-26");
  assert.throws(() => toAmsterdamDate("not-a-date"), /Invalid business date input/);
  assert.throws(() => addAmsterdamCalendarDays(new Date(), 0.5), /offset must be an integer/);
});
