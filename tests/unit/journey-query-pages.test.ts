import assert from "node:assert/strict";
import { test } from "node:test";
import { readJourneyPages } from "../../apps/web/lib/domain/journey-query-pages";

test("complete Journey history crosses the PostgREST response cap, including a correction at the old page boundary", async () => {
  const data = Array.from({ length: 1_213 }, (_, index) => ({ id: `observation-${index}`, corrects: index === 1_010 ? "observation-1210" : null }));
  const result = await readJourneyPages({ range: async (from, to) => ({ data: data.slice(from, to + 1), error: null }) });
  assert.equal(result.data?.length, 1_213);
  assert.ok(result.data?.some((row) => row.corrects === "observation-1210"));
  assert.ok(result.data?.some((row) => row.id === "observation-1210"));
  assert.deepEqual(result.data, data);
});

test("a failed later Journey page returns no partial history or resurrected score", async () => {
  const error = { message: "Read failed" };
  const result = await readJourneyPages({ range: async (from) => from ? { data: null, error } : { data: Array.from({ length: 500 }, (_, id) => ({ id })), error: null } });
  assert.equal(result.data, null); assert.equal(result.error, error);
});
