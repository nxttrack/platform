#!/usr/bin/env node

const baseUrl = process.env.HEALTH_URL ?? healthUrlFromAppUrl(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL) ?? "http://127.0.0.1:3000/api/health";
const controller = new AbortController();
const timeout = Number.parseInt(process.env.HEALTH_TIMEOUT_MS ?? "10000", 10);
const timer = setTimeout(() => controller.abort(), timeout);

try {
  const response = await fetch(baseUrl, {
    headers: {
      accept: "application/json"
    },
    signal: controller.signal
  });

  if (!response.ok) {
    throw new Error(`Expected HTTP 2xx from ${baseUrl}, got ${response.status}.`);
  }

  const body = await response.json();

  if (body.ok !== true || body.app !== "nxttrack-platform") {
    throw new Error(`Unexpected health payload from ${baseUrl}: ${JSON.stringify(body)}`);
  }

  if (process.env.REQUIRE_HEALTH_COMMIT === "true" && !body.commitSha) {
    throw new Error("Health payload is missing commitSha while REQUIRE_HEALTH_COMMIT=true.");
  }

  const database = body.checks?.database;

  if (process.env.REQUIRE_HEALTH_DATABASE === "true" && database?.status !== "pass") {
    throw new Error(`Database health check is required but returned ${database?.status ?? "missing"}.`);
  }

  console.log(
    `[staging:health] PASS ${baseUrl} -> env=${body.env ?? body.environment ?? "unknown"} commit=${body.commitSha ?? "unknown"} build=${body.buildTimestamp ?? "unknown"} database=${database?.status ?? "missing"}`
  );
} catch (error) {
  console.error(`[staging:health] FAIL ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  clearTimeout(timer);
}

function healthUrlFromAppUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL("/api/health", value).toString();
  } catch {
    return null;
  }
}
