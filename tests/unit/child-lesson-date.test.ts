import assert from "node:assert/strict";
import test from "node:test";
import { childLessonCalendarDaysUntil, formatChildLessonDate, resolveChildTimeZone } from "../../apps/web/lib/date/child-lesson-date";

test("child lesson time and date chips use Amsterdam in winter and summer independently of server TZ", () => {
  const previous = process.env.TZ;
  try {
    for (const hostZone of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = hostZone;
      for (const start of ["2026-01-15T08:00:00Z", "2026-07-15T07:00:00Z"]) {
        assert.equal(formatChildLessonDate(start, { hour: "2-digit", minute: "2-digit" }, "Europe/Amsterdam"), "09:00");
        assert.match(formatChildLessonDate(start, { dateStyle: "full", timeStyle: "short" }, "Europe/Amsterdam"), /09:00/);
      }
      assert.equal(formatChildLessonDate("2026-07-31T22:30:00Z", { day: "numeric" }, "Europe/Amsterdam"), "1");
      assert.equal(formatChildLessonDate("2026-07-31T22:30:00Z", { month: "long" }, "Europe/Amsterdam"), "augustus");
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("configured tenant time zone takes precedence and invalid or absent settings use the business default", () => {
  assert.equal(resolveChildTimeZone("America/New_York"), "America/New_York");
  assert.equal(formatChildLessonDate("2026-07-15T22:30:00Z", { hour: "2-digit", minute: "2-digit" }, resolveChildTimeZone("America/New_York")), "18:30");
  for (const value of [undefined, null, "", "not-a-time-zone"]) assert.equal(resolveChildTimeZone(value), "Europe/Amsterdam");
});

test("today/tomorrow countdown uses local calendar days through midnight and both DST changes", () => {
  const days = (start: string, now: string) => childLessonCalendarDaysUntil(start, "Europe/Amsterdam", new Date(now));
  assert.equal(days("2026-07-15T16:00:00Z", "2026-07-15T07:00:00Z"), 0);
  assert.equal(days("2026-07-15T22:30:00Z", "2026-07-15T21:30:00Z"), 1);
  assert.equal(days("2026-03-29T22:30:00Z", "2026-03-28T23:30:00Z"), 1);
  assert.equal(days("2026-10-25T23:30:00Z", "2026-10-24T22:30:00Z"), 1);
  assert.equal(days("2026-07-14T16:00:00Z", "2026-07-15T07:00:00Z"), 0);
});
