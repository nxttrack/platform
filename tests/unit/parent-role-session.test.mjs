import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { initializeParentRoleSession } from "../../scripts/auth/parent-role-session.mjs";

const userId = "10000000-0000-4000-8000-000000000001";
const tenantId = "20000000-0000-4000-8000-000000000002";
const sessionId = "30000000-0000-4000-8000-000000000003";
const otherUserId = "40000000-0000-4000-8000-000000000004";
const token = (claims = {}) => ["header", Buffer.from(JSON.stringify({ sub: userId, session_id: sessionId, ...claims })).toString("base64url"), "signature"].join(".");
const binding = { accessToken: token(), tenantId, expectedUserId: userId };

test("fresh parent initialization authenticates the exact token and binds only its session, user and tenant", async () => {
  const calls = [];
  const initialized = await initializeParentRoleSession({
    ...binding,
    verifyUser: async (accessToken) => { calls.push(["verify", accessToken]); return { data: { user: { id: userId } } }; },
    initialize: async (...args) => { calls.push(args); return { data: true }; }
  });
  assert.equal(initialized, true);
  assert.deepEqual(calls, [
    ["verify", binding.accessToken],
    ["initialize_parent_portal_session_for_service", { p_session_id: sessionId, p_user_id: userId, p_tenant_id: tenantId }]
  ]);
});

test("a disabled rollout is retained and initialization failures cannot silently pass", async () => {
  for (const result of [{ data: false }, { data: null }, { data: true, error: { code: "42501" } }]) {
    const run = () => initializeParentRoleSession({
      ...binding,
      verifyUser: async () => ({ data: { user: { id: userId } } }),
      initialize: async () => result
    });
    if (result.data === false) assert.equal(await run(), false);
    else await assert.rejects(run, /could not initialize/);
  }
});

test("invalid or unauthenticated user/session bindings never reach the privileged initializer", async () => {
  const cases = [
    { accessToken: undefined }, { accessToken: "bad.token" }, { accessToken: token({ session_id: null }) },
    { accessToken: token({ sub: otherUserId }) }, { tenantId: "missing" }, { expectedUserId: undefined },
    { verifyUser: async () => ({ error: { message: "invalid JWT" } }) },
    { verifyUser: async () => ({ data: { user: { id: otherUserId } } }) }
  ];
  for (const override of cases) {
    let initialized = false;
    await assert.rejects(() => initializeParentRoleSession({
      ...binding,
      verifyUser: async () => ({ data: { user: { id: userId } } }),
      ...override,
      initialize: async () => { initialized = true; return { data: true }; }
    }), /Parent role setup/);
    assert.equal(initialized, false);
  }
});

async function smokeFixture(t, { splitEnabled = true, childSession = false, expectedUserId = userId } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "parent-role-session-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const statePath = path.join(directory, "phase16-state.json");
  writeFileSync(statePath, JSON.stringify({ tenant: { id: tenantId }, users: { parent: { id: expectedUserId } } }));
  const calls = [], violations = [];
  let parentInitialized = false;
  const server = createServer(async (request, response) => {
    let rawBody = "";
    for await (const chunk of request) rawBody += chunk;
    const pathname = new URL(request.url, "http://fixture.local").pathname;
    const body = rawBody ? JSON.parse(rawBody) : null;
    calls.push({ pathname, method: request.method, body, apikey: request.headers.apikey, authorization: request.headers.authorization });
    const respond = (data, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(data)); };
    if (pathname === "/auth/v1/token") return respond({ access_token: binding.accessToken, user: { id: userId } });
    if (pathname === "/auth/v1/user") {
      if (request.headers.apikey !== "public-test-key" || request.headers.authorization !== `Bearer ${binding.accessToken}`) violations.push("Auth verification changed the user token");
      return respond({ id: userId });
    }
    if (pathname === "/rest/v1/rpc/initialize_parent_portal_session_for_service") {
      if (request.headers.apikey !== "service-test-key" || request.headers.authorization !== "Bearer service-test-key") violations.push("Initializer lacks separate service credentials");
      if (JSON.stringify(body) !== JSON.stringify({ p_session_id: sessionId, p_user_id: userId, p_tenant_id: tenantId })) violations.push("Initializer is not bound to the fixture session");
      parentInitialized = splitEnabled && !childSession;
      return respond(parentInitialized);
    }
    if (request.headers.apikey !== "public-test-key" || request.headers.authorization !== `Bearer ${binding.accessToken}`) violations.push("RLS data query bypassed the parent token");
    if (childSession || (splitEnabled && !parentInitialized)) return respond({ message: "child_session_data_api_blocked" }, 403);
    if (pathname === "/rest/v1/tenant_memberships") return respond([{ user_id: userId, tenant_id: tenantId, role: "parent", status: "active" }]);
    if (pathname === "/rest/v1/platform_memberships") return respond([]);
    if (pathname === "/rest/v1/tenants") return respond([{ id: tenantId, slug: "fixture", status: "active" }]);
    if (pathname === "/rest/v1/participants") return respond([{ tenant_id: tenantId }]);
    violations.push(`Unexpected mutation or query: ${request.method} ${pathname}`);
    return respond({ message: "unexpected request" }, 400);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../../scripts/db/rls-role-smoke.mjs", import.meta.url).pathname], {
      env: {
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
        SUPABASE_SECRET_KEY: "service-test-key",
        E2E_PARENT_EMAIL: "fixture@example.invalid", E2E_PARENT_PASSWORD: "fixture-password",
        PHASE16_STATE_PATH: statePath, RLS_TENANT_SCOPED_TABLES: "participants"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
  assert.deepEqual(violations, []);
  return { ...result, calls };
}

test("RLS smoke initializes an enabled parent rollout before querying with the same parent token", async (t) => {
  const result = await smokeFixture(t);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /PASS 1 role RLS smoke/);
  assert.deepEqual(result.calls.slice(0, 3).map((call) => call.pathname), ["/auth/v1/token", "/auth/v1/user", "/rest/v1/rpc/initialize_parent_portal_session_for_service"]);
  assert.equal(result.calls.filter((call) => call.method !== "GET").length, 2, "Only sign-in and exact-session initialization may write");
});

test("RLS smoke retains disabled rollouts and still exercises the parent's RLS queries", async (t) => {
  const result = await smokeFixture(t, { splitEnabled: false });
  assert.equal(result.code, 0, result.output);
  assert.ok(result.calls.some((call) => call.pathname === "/rest/v1/participants"));
});

test("RLS smoke never bypasses a child-session restriction or initializes a different fixture user", async (t) => {
  const child = await smokeFixture(t, { childSession: true });
  assert.equal(child.code, 1);
  assert.match(child.output, /child_session_data_api_blocked/);
  const mismatch = await smokeFixture(t, { expectedUserId: otherUserId });
  assert.equal(mismatch.code, 1);
  assert.match(mismatch.output, /invalid tenant\/user\/session binding/);
  assert.deepEqual(mismatch.calls.map((call) => call.pathname), ["/auth/v1/token"]);
});
