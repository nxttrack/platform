export function healthExpectations(environment = {}) {
  const explicit = environment.EXPECTED_RELEASE_SHA !== undefined || environment.EXPECTED_APP_ENV !== undefined;
  if (!explicit) return {
    requireCommit: environment.REQUIRE_HEALTH_COMMIT === "true",
    requireDatabase: environment.REQUIRE_HEALTH_DATABASE === "true",
    requireSchema: false
  };
  const expectedSha = String(environment.EXPECTED_RELEASE_SHA ?? "").trim().toLowerCase();
  const expectedAppEnv = environment.EXPECTED_APP_ENV;
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || !["staging", "production"].includes(expectedAppEnv)) {
    throw new Error("Exact deployment health requires EXPECTED_RELEASE_SHA as a full commit SHA and EXPECTED_APP_ENV as staging or production.");
  }
  return { expectedSha, expectedAppEnv, requireCommit: true, requireDatabase: true, requireSchema: true };
}

export function validateHealthPayload(body, expectations = healthExpectations()) {
  if (!body || body.ok !== true || body.app !== "nxttrack-platform") throw new Error("Unexpected or unhealthy NXTTRACK health payload.");
  if (expectations.requireCommit && !body.commitSha) throw new Error("Health payload is missing the required commitSha.");
  if (expectations.expectedSha && (typeof body.commitSha !== "string" || body.commitSha.toLowerCase() !== expectations.expectedSha)) {
    throw new Error(`Health commit does not match expected release ${expectations.expectedSha}.`);
  }
  if (expectations.expectedAppEnv && body.env !== expectations.expectedAppEnv) {
    throw new Error(`Health environment does not match expected ${expectations.expectedAppEnv}.`);
  }
  if (expectations.requireDatabase && body.checks?.database?.status !== "pass") throw new Error("Required database health check did not pass.");
  if (expectations.requireSchema && body.checks?.schemaCompatibility?.status !== "pass") throw new Error("Required runtime schema compatibility health check did not pass.");
}
