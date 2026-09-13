import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { loadChildAgendaSessions } from "../../apps/web/lib/domain/child-agenda";

const { createClient } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("@supabase/supabase-js");

test("child agenda requests only scheduled sessions within tenant, group and upcoming boundaries", async () => {
  let requests = 0;
  const admin = createClient("http://127.0.0.1:1", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      requests += 1;
      const url = new URL(String(input));
      assert.equal(url.pathname, "/rest/v1/sessions");
      assert.equal(url.searchParams.get("tenant_id"), "eq.tenant-a");
      assert.equal(url.searchParams.get("group_id"), "in.(group-a)");
      assert.equal(url.searchParams.get("status"), "eq.scheduled");
      assert.equal(url.searchParams.get("ends_at"), "gte.2026-09-13T08:00:00.000Z");
      assert.equal(url.searchParams.get("order"), "starts_at.asc");
      assert.equal(url.searchParams.get("limit"), "24");
      // Model PostgREST's requested equality filter across every schema status.
      const rows = ["draft", "scheduled", "completed", "cancelled"].map((status) => ({ id: status, status }));
      return new Response(JSON.stringify(rows.filter((row) => `eq.${row.status}` === url.searchParams.get("status"))), {
        headers: { "Content-Type": "application/json" }
      });
    } }
  });
  const result = await loadChildAgendaSessions(admin, "tenant-a", ["group-a"], new Date("2026-09-13T08:00:00Z"));
  assert.equal(result.error, null);
  assert.deepEqual(result.data, [{ id: "scheduled", status: "scheduled" }]);
  assert.equal(requests, 1);
  assert.deepEqual(await loadChildAgendaSessions(admin, "tenant-a", []), { data: [], error: null });
  assert.equal(requests, 1, "a child without group membership cannot query all sessions");
});
