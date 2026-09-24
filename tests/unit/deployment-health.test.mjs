import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { healthExpectations, validateHealthPayload } from "../../scripts/release/health-payload.mjs";

const sha = "1234567890abcdef1234567890abcdef12345678";
const oldSha = "a".repeat(40);
const livePayload = (environment = "staging") => ({
  ok: true, app: "nxttrack-platform", env: environment, commitSha: sha,
  buildTimestamp: "2026-09-20T12:00:00.000Z", checkedAt: "2026-09-20T12:02:00.000Z",
  checks: { database: { configured: true, latencyMs: 25, message: "Supabase tenants probe succeeded.", status: "pass" },
    schemaCompatibility: { message: "Runtime and database schema compatibility contract matches.", status: "pass" } }
});

test("explicit deployment health accepts only the requested environment and release with passing DB and schema checks", () => {
  for (const expectedAppEnv of ["staging", "production"]) {
    const policy = healthExpectations({ EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: expectedAppEnv });
    assert.doesNotThrow(() => validateHealthPayload(livePayload(expectedAppEnv), policy));
    const wrongRelease = { ...livePayload(expectedAppEnv), commitSha: oldSha };
    assert.throws(() => validateHealthPayload(wrongRelease, policy), /expected release/);
    assert.throws(() => validateHealthPayload(livePayload(expectedAppEnv === "staging" ? "production" : "staging"), policy), /expected (staging|production)/);
  }
});

test("an HTTP-200 ok response cannot hide skipped, failed or absent dependency probes during deployment", () => {
  const policy = healthExpectations({ EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: "staging", REQUIRE_HEALTH_DATABASE: "false" });
  for (const dependency of ["database", "schemaCompatibility"]) {
    for (const status of ["skipped", "fail", undefined]) {
      const body = livePayload();
      if (status === undefined) delete body.checks[dependency];
      else body.checks[dependency].status = status;
      assert.throws(() => validateHealthPayload(body, policy), /Required .*health check did not pass/);
    }
  }
});

test("missing or malformed explicit expectations fail closed instead of falling back to loose health checks", () => {
  for (const environment of [
    { EXPECTED_RELEASE_SHA: sha },
    { EXPECTED_APP_ENV: "staging" },
    { EXPECTED_RELEASE_SHA: "", EXPECTED_APP_ENV: "staging" },
    { EXPECTED_RELEASE_SHA: sha.slice(0, 7), EXPECTED_APP_ENV: "staging" },
    { EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: "" },
    { EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: "development" }
  ]) assert.throws(() => healthExpectations(environment), /Exact deployment health requires/);
});

test("read-only audits retain the existing optional policy and do not infer a release from their checkout", () => {
  const policy = healthExpectations({ GITHUB_SHA: oldSha, DEPLOYED_SOURCE_SHA: oldSha, APP_ENV: "production" });
  assert.doesNotThrow(() => validateHealthPayload(livePayload("staging"), policy));
  assert.doesNotThrow(() => validateHealthPayload({ ok: true, app: "nxttrack-platform" }, policy));
  assert.throws(() => validateHealthPayload({ ok: true, app: "nxttrack-platform" }, healthExpectations({ REQUIRE_HEALTH_COMMIT: "true" })), /required commitSha/);
  const skipped = livePayload();
  skipped.checks.database.status = "skipped";
  assert.throws(() => validateHealthPayload(skipped, healthExpectations({ REQUIRE_HEALTH_DATABASE: "true" })), /database/);
  const optionalSchema = livePayload();
  optionalSchema.checks.schemaCompatibility.status = "skipped";
  assert.doesNotThrow(() => validateHealthPayload(optionalSchema, healthExpectations({ REQUIRE_HEALTH_DATABASE: "true" })));
});

test("malformed identity or payload and explicit health failures cannot pass the release gate", () => {
  const policy = healthExpectations({ EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: "staging" });
  for (const payload of [null, {}, { ...livePayload(), ok: false }, { ...livePayload(), app: "different-application" },
    { ...livePayload(), commitSha: null }, { ...livePayload(), commitSha: 42 }, { ...livePayload(), env: undefined }]) {
    assert.throws(() => validateHealthPayload(payload, policy));
  }
});

test("the real health-smoke CLI rejects a healthy old release and accepts only the configured deployment identity", async (t) => {
  let payload = { ...livePayload(), commitSha: oldSha };
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const environment = {
    ...process.env, HEALTH_URL: `http://127.0.0.1:${server.address().port}/api/health`,
    HEALTH_RETRY_TIMEOUT_MS: "1000", HEALTH_RETRY_INTERVAL_MS: "2000", HEALTH_TIMEOUT_MS: "500",
    EXPECTED_RELEASE_SHA: sha, EXPECTED_APP_ENV: "staging"
  };
  const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../scripts/staging/health-smoke.mjs", import.meta.url))], { env: environment, timeout: 3000 });
  await assert.rejects(run, (error) => error.code === 1 && /does not match expected release/.test(error.stderr));
  payload = livePayload();
  assert.match((await run()).stdout, /\[staging:health\] PASS/);
  payload.checks.schemaCompatibility.status = "skipped";
  await assert.rejects(run, (error) => error.code === 1 && /schema compatibility/.test(error.stderr));
});
