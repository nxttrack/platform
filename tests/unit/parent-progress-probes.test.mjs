import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { prepareParentProgressFixture } from "../../scripts/staging/parent-progress-fixture.mjs";

const id = (number) => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const fixture = {
  parentUserId: id(1), ownTenantId: id(2), ownParticipantId: id(3), ownScoreId: id(4),
  protectedParticipantId: id(5), protectedScoreId: id(6), foreignTenantId: id(7),
  foreignParticipantId: id(8), foreignScoreId: id(9), internalScoreId: id(10)
};
const phase = { tenant: { id: fixture.ownTenantId }, users: { parent: { id: fixture.parentUserId } }, expected: { participantId: fixture.ownParticipantId, progressScoreId: fixture.ownScoreId } };
const token = `header.${Buffer.from(JSON.stringify({ sub: fixture.parentUserId, session_id: id(11) })).toString("base64url")}.signature`;
function scores() {
  return [
    [fixture.ownScoreId, fixture.ownTenantId, fixture.ownParticipantId, "parent_visible"],
    [fixture.protectedScoreId, fixture.ownTenantId, fixture.protectedParticipantId, "parent_visible"],
    [fixture.foreignScoreId, fixture.foreignTenantId, fixture.foreignParticipantId, "parent_visible"],
    [fixture.internalScoreId, fixture.ownTenantId, fixture.ownParticipantId, "internal"]
  ].map(([id, tenant_id, participant_id, visibility]) => ({ id, tenant_id, participant_id, visibility, status: "active" }));
}

test("bounded fictional fixture preparation is idempotent and preserves the existing positive score and guardian relationships", async () => {
  const original = { ...scores()[0], positive_label: "Original real fixture" };
  const rows = { participant_progress_scores: [structuredClone(original)] };
  let nextId = 100;
  const admin = {
    from(table) {
      return { upsert(values, { onConflict }) {
        assert.ok(["participants", "progress_modules", "progress_items", "participant_progress_scores"].includes(table));
        assert.ok([fixture.ownTenantId, fixture.foreignTenantId].includes(values.tenant_id));
        assert.equal(Object.hasOwn(values, "guardian_user_id"), false, "Preparation must not rewrite any guardian");
        rows[table] ??= [];
        let row = rows[table].find((candidate) => onConflict.split(",").every((key) => candidate[key] === values[key]));
        if (row) Object.assign(row, values);
        else { row = { ...values, id: id(nextId++) }; rows[table].push(row); }
        return { select() { return { single: async () => ({ data: { id: row.id }, error: null }) }; } };
      } };
    }
  };
  const first = await prepareParentProgressFixture(admin, phase, fixture.foreignTenantId);
  const before = structuredClone(rows);
  assert.deepEqual(await prepareParentProgressFixture(admin, phase, fixture.foreignTenantId), first);
  assert.deepEqual(rows, before);
  assert.deepEqual(rows.participant_progress_scores.find((row) => row.id === original.id), original);
  assert.equal(rows.participant_progress_scores.length, 4);
  assert.equal(rows.participants.length, 2);
  await assert.rejects(() => prepareParentProgressFixture(admin, phase, fixture.ownTenantId), /different isolation tenant/);
  await assert.rejects(() => prepareParentProgressFixture(admin, { ...phase, expected: {} }, fixture.foreignTenantId), /current Phase 16/);
  assert.deepEqual(rows, before);
});

async function runSmoke(t, fault) {
  const directory = mkdtempSync(path.join(tmpdir(), "parent-progress-probes-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const phasePath = path.join(directory, "phase.json"), isolationPath = path.join(directory, "isolation.json");
  writeFileSync(phasePath, JSON.stringify(phase));
  writeFileSync(isolationPath, JSON.stringify({ progressScoreIsolation: fault === "missing-state" ? undefined : fixture }));
  const calls = [], violations = [];
  const server = createServer(async (request, response) => {
    for await (const _ of request) { /* drain the Auth/RPC body */ }
    const url = new URL(request.url, "http://fixture.local");
    const service = request.headers.apikey === "service-key";
    calls.push({ path: url.pathname, query: url.searchParams, service, method: request.method });
    const send = (data, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(data)); };
    if (url.pathname === "/auth/v1/token") return send({ access_token: token, user: { id: fixture.parentUserId } });
    if (url.pathname === "/auth/v1/user") return send({ id: fixture.parentUserId });
    if (url.pathname === "/rest/v1/rpc/initialize_parent_portal_session_for_service") {
      if (!service) violations.push("Initialization lost its service boundary");
      return send(true);
    }
    if (service) {
      if (request.method !== "GET" || request.headers.authorization !== "Bearer service-key") violations.push("Fixture verification must be a service read");
      if (url.pathname === "/rest/v1/participant_progress_scores") return send(fault === "missing-record" ? scores().slice(0, 3) : scores());
      if (url.pathname === "/rest/v1/participants") return send([
        { id: fixture.ownParticipantId, tenant_id: fixture.ownTenantId, guardian_user_id: fixture.parentUserId },
        { id: fixture.protectedParticipantId, tenant_id: fixture.ownTenantId, guardian_user_id: fault === "wrong-guardian" ? fixture.parentUserId : null },
        { id: fixture.foreignParticipantId, tenant_id: fixture.foreignTenantId, guardian_user_id: null }
      ]);
      if (url.pathname === "/rest/v1/participant_guardians") return send([]);
      violations.push("Unexpected service read");
      return send([], 400);
    }
    if (request.headers.apikey !== "public-key" || request.headers.authorization !== `Bearer ${token}`) violations.push("Isolation query lost the parent token");
    if (url.pathname === "/rest/v1/tenant_memberships") return send([{ tenant_id: fixture.ownTenantId, user_id: fixture.parentUserId, role: "parent", status: "active" }]);
    if (url.pathname === "/rest/v1/platform_memberships") return send([]);
    if (url.pathname === "/rest/v1/tenants") return send([{ id: fixture.ownTenantId }]);
    if (["/rest/v1/participants", "/rest/v1/programs"].includes(url.pathname)) return send([{ tenant_id: fixture.ownTenantId }]);
    if (url.pathname === "/rest/v1/participant_progress_scores") {
      const row = scores().find((item) => `eq.${item.id}` === url.searchParams.get("id"));
      if (!row || url.searchParams.get("tenant_id") !== `eq.${row.tenant_id}` || url.searchParams.get("participant_id") !== `eq.${row.participant_id}`) violations.push("Parent score probe is not bounded to an existing fixture record");
      if (fault === "timeout") return send({ code: "57014", message: "canceling statement due to statement timeout" }, 500);
      if (fault === "denied") return send({ message: "child_session_data_api_blocked" }, 403);
      const leakId = { "leak-same": fixture.protectedScoreId, "leak-foreign": fixture.foreignScoreId, "leak-internal": fixture.internalScoreId }[fault];
      if (row?.id === fixture.ownScoreId) return send(fault === "empty-positive" ? [] : [row]);
      return send(row?.id === leakId ? [row] : []);
    }
    violations.push("Unexpected request");
    return send([], 400);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../../scripts/db/rls-role-smoke.mjs", import.meta.url).pathname], {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key", SUPABASE_SECRET_KEY: "service-key",
        E2E_PARENT_EMAIL: "fictional@example.invalid", E2E_PARENT_PASSWORD: "fictional-password", PHASE16_STATE_PATH: phasePath,
        SPRINT4_ISOLATION_STATE_PATH: isolationPath, RLS_TENANT_SCOPED_TABLES: "participants,participant_progress_scores,programs"
      }, stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject); child.once("close", (code) => resolve({ code, output }));
  });
  assert.deepEqual(violations, []);
  const parentScores = calls.filter((call) => !call.service && call.path === "/rest/v1/participant_progress_scores");
  assert.ok(calls.some((call) => !call.service && call.path === "/rest/v1/participants"));
  assert.ok(calls.some((call) => !call.service && call.path === "/rest/v1/programs"), "Other table checks after the score probes must still run");
  return { ...result, calls, parentScores };
}

test("CLI verifies four real fixture records before testing visibility with the same parent token, retaining other tables", async (t) => {
  const result = await runSmoke(t);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /4 existing-row visibility\/isolation probes passed/);
  assert.equal(result.parentScores.length, 4);
  const firstProbe = result.calls.findIndex((call) => result.parentScores.includes(call));
  assert.equal(result.calls.slice(0, firstProbe).filter((call) => call.service && call.method === "GET").length, 3);
});

test("CLI fails for same-tenant, foreign-tenant and internal-score leaks", async (t) => {
  for (const fault of ["leak-same", "leak-foreign", "leak-internal"]) {
    const result = await runSmoke(t, fault);
    assert.equal(result.code, 1);
    assert.match(result.output, /Parent progress isolation leaked/);
  }
});

test("CLI refuses missing records, missing fixture state and protected children actually linked to the parent", async (t) => {
  for (const fault of ["missing-record", "missing-state", "wrong-guardian"]) {
    const result = await runSmoke(t, fault);
    assert.equal(result.code, 1);
    assert.match(result.output, /Parent progress isolation fixture/);
    assert.equal(result.parentScores.length, 0, "Unproven negative fixtures cannot produce passing isolation evidence");
  }
});

test("CLI fails for missing positive visibility, statement timeouts and denied queries without skipping or retrying", async (t) => {
  for (const fault of ["empty-positive", "timeout", "denied"]) {
    const result = await runSmoke(t, fault);
    assert.equal(result.code, 1);
    assert.match(result.output, fault === "empty-positive" ? /own visible score was not returned/ : /query failed: HTTP (500|403)/);
    assert.equal(result.parentScores.length, 1);
  }
});
