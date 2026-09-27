import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const phase15 = readFileSync(new URL("../../scripts/staging/phase-15-validate.mjs", import.meta.url), "utf8");

test("Phase15 deelt stagingidentiteiten niet tussen gelijktijdige browserworkers", () => {
  assert.match(
    phase15,
    /\["--filter", "@nxttrack\/web", "exec", "playwright", "test", "--workers=1"\]/
  );
});
