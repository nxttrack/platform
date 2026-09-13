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
      assert.equal(url.searchParams.get("order"), "starts_at.asc,id.asc");
      assert.equal(url.searchParams.get("limit"), "100");
      // Model PostgREST's requested equality filter across every schema status.
      const rows = ["draft", "scheduled", "completed", "cancelled"].map((status) => ({ id: status, status, group_id: "group-a", starts_at: "2026-09-13T09:00:00Z" }));
      return new Response(JSON.stringify(rows.filter((row) => `eq.${row.status}` === url.searchParams.get("status"))), {
        headers: { "Content-Type": "application/json" }
      });
    } }
  });
  const result = await loadChildAgendaSessions(admin, "tenant-a", [{ group_id: "group-a", starts_on: "2026-09-10", ends_on: null }], "Europe/Amsterdam", new Date("2026-09-13T08:00:00Z"));
  assert.equal(result.error, null);
  assert.deepEqual(result.data.map((row) => row.id), ["scheduled"]);
  assert.equal(requests, 1);
  assert.deepEqual(await loadChildAgendaSessions(admin, "tenant-a", [], "Europe/Amsterdam"), { data: [], error: null });
  assert.equal(requests, 1, "a child without group membership cannot query all sessions");
});

const session = (id: string, starts_at: string, group_id = "group-a") => ({
  id, starts_at, group_id, status: "scheduled", resource_id: null, ends_at: starts_at
});
function pagedClient(rows: ReturnType<typeof session>[], requests: URL[]) {
  return createClient("http://127.0.0.1:1", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input)); requests.push(url);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "Content-Type": "application/json" } });
    } }
  });
}

test("membership dates are inclusive in tenant local time, respect gaps and allow overlapping placements once", async () => {
  const requests: URL[] = [];
  const rows = [
    session("before", "2026-07-15T21:59:59Z"),
    session("first-midnight", "2026-07-15T22:00:00Z"),
    session("last-minute", "2026-07-16T21:59:59Z"),
    session("after", "2026-07-16T22:00:00Z"),
    session("other-group", "2026-07-16T12:00:00Z", "group-b"),
    session("rejoined", "2026-07-17T22:00:00Z"),
    session("open-ended", "2027-01-15T12:00:00Z")
  ];
  const memberships = [
    { group_id: "group-a", starts_on: "2026-07-16", ends_on: "2026-07-16" },
    { group_id: "group-a", starts_on: "2026-07-16", ends_on: "2026-07-16" },
    { group_id: "group-a", starts_on: "2026-07-18", ends_on: null },
    { group_id: "group-b", starts_on: "2026-07-18", ends_on: null }
  ];
  const result = await loadChildAgendaSessions(pagedClient(rows, requests), "tenant-a", memberships, "Europe/Amsterdam", new Date("2026-07-01T00:00:00Z"));
  assert.deepEqual(result.data.map((row) => row.id), ["first-midnight", "last-minute", "rejoined", "open-ended"]);
  assert.match(requests[0].searchParams.get("or")!, /group_id.eq.group-a,starts_at.gte.2026-07-15T00:00:00.000Z,starts_at.lt.2026-07-18T00:00:00.000Z/);
});

test("membership inclusion follows winter and non-default tenant zones rather than UTC dates", async () => {
  for (const [timeZone, start, before, inside] of [
    ["Europe/Amsterdam", "2026-01-16", "2026-01-15T22:59:59Z", "2026-01-15T23:00:00Z"],
    ["America/New_York", "2026-07-16", "2026-07-16T03:59:59Z", "2026-07-16T04:00:00Z"],
    ["Pacific/Kiritimati", "2026-07-16", "2026-07-15T09:59:59Z", "2026-07-15T10:00:00Z"]
  ]) {
    const result = await loadChildAgendaSessions(pagedClient([session("before", before), session("inside", inside)], []),
      "tenant-a", [{ group_id: "group-a", starts_on: start, ends_on: start }], timeZone);
    assert.deepEqual(result.data.map((row) => row.id), ["inside"], timeZone);
  }
});

test("the 24-lesson limit applies after date filtering and pagination retains the earliest eligible lessons", async () => {
  const requests: URL[] = [];
  const before = Array.from({ length: 100 }, (_, i) => session(`before-${i}`, "2026-07-15T21:59:00Z"));
  const eligible = Array.from({ length: 40 }, (_, i) => session(`eligible-${i}`, new Date(Date.parse("2026-07-16T08:00:00Z") + i * 60_000).toISOString()));
  const result = await loadChildAgendaSessions(pagedClient([...before, ...eligible], requests), "tenant-a",
    [{ group_id: "group-a", starts_on: "2026-07-16", ends_on: null }], "Europe/Amsterdam");
  assert.deepEqual(result.data.map((row) => row.id), eligible.slice(0, 24).map((row) => row.id));
  assert.deepEqual(requests.map((url) => url.searchParams.get("offset")), ["0", "100"]);
});

test("an agenda query failure returns an error instead of presenting incomplete scheduling data", async () => {
  const admin = createClient("http://127.0.0.1:1", "synthetic-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => new Response(JSON.stringify({ message: "synthetic unavailable", code: "42501" }), {
      status: 403, headers: { "Content-Type": "application/json" }
    }) }
  });
  const result = await loadChildAgendaSessions(admin, "tenant-a", [{ group_id: "group-a", starts_on: "2026-07-16", ends_on: null }], "Europe/Amsterdam");
  assert.equal(result.error?.code, "42501");
  assert.deepEqual(result.data, []);
});
