import assert from "node:assert/strict";
import test from "node:test";
import { requireAdminSessionWindows } from "../../scripts/staging/admin-session-windows.mjs";

const first = { startsAt: "2026-09-21T06:00", endsAt: "2026-09-21T06:45" };
const second = { startsAt: "2026-09-22T06:00", endsAt: "2026-09-22T06:45" };

test("admin fixture requires a complete distinct window for each full test attempt", () => {
  assert.deepEqual(requireAdminSessionWindows([first, second]), [first, second]);
  for (const rows of [[], [first], [first, first], [first, { ...second, endsAt: second.startsAt }], [first, { ...second, startsAt: "invalid" }]]) {
    assert.throws(() => requireAdminSessionWindows(rows), /Two distinct free admin lesson dates/);
  }
});
