#!/usr/bin/env node

const baseUrl = process.env.HEALTH_URL ?? healthUrlFromAppUrl(process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL) ?? "http://127.0.0.1:3000/api/health";
const attemptTimeoutMs = Number.parseInt(process.env.HEALTH_TIMEOUT_MS ?? "10000", 10);
const retryTimeoutMs = Number.parseInt(process.env.HEALTH_RETRY_TIMEOUT_MS ?? "60000", 10);
const retryIntervalMs = Number.parseInt(process.env.HEALTH_RETRY_INTERVAL_MS ?? "3000", 10);
const startedAt = Date.now();
let attempt = 0;
let lastError = null;

while (Date.now() - startedAt <= retryTimeoutMs) {
  attempt += 1;

  try {
    const body = await fetchHealthPayload();
    validateHealthPayload(body);

    const database = body.checks?.database;

    console.log(
      `[staging:health] PASS ${baseUrl} -> env=${body.env ?? body.environment ?? "unknown"} commit=${body.commitSha ?? "unknown"} build=${body.buildTimestamp ?? "unknown"} database=${database?.status ?? "missing"} attempts=${attempt}`
    );
    process.exit(0);
  } catch (error) {
    lastError = error;

    if (Date.now() - startedAt + retryIntervalMs > retryTimeoutMs) {
      break;
    }

    console.warn(`[staging:health] WAIT ${baseUrl}: ${formatError(error)} Retrying in ${retryIntervalMs}ms.`);
    await sleep(retryIntervalMs);
  }
}

console.error(`[staging:health] FAIL ${baseUrl}: ${formatError(lastError)} after ${attempt} attempt(s).`);
process.exit(1);

async function fetchHealthPayload() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);

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

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validateHealthPayload(body) {
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
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
