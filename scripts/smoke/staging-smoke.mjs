#!/usr/bin/env node

const expectedCommit = process.env.EXPECTED_COMMIT ?? process.env.GITHUB_SHA ?? "";
const baseUrl = normalizeBaseUrl(process.env.STAGING_SMOKE_BASE_URL ?? "https://staging.nxttrack.nl");
const tenantUrl = normalizeBaseUrl(process.env.STAGING_SMOKE_TENANT_URL ?? "https://aquaswim-demo.staging.nxttrack.nl");
const failures = [];

await checkHealth(`${baseUrl}/api/health`, "platform");
await checkHealth(`${tenantUrl}/api/health`, "tenant");
await checkPage(`${baseUrl}/nxttrack`, "NXTTRACK marketing");
await checkPage(`${tenantUrl}/`, "tenant homepage");
await checkPage(`${tenantUrl}/programmas`, "tenant programs");
await checkPage(`${tenantUrl}/login`, "tenant login");

if (failures.length > 0) {
  console.error("[smoke:staging] Smoke test failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[smoke:staging] Smoke test passed.");

async function checkHealth(url, label) {
  try {
    const response = await fetch(url, { redirect: "manual" });

    if (!response.ok) {
      failures.push(`${label} health returned HTTP ${response.status} for ${url}.`);
      return;
    }

    const payload = await response.json();

    if (payload.ok !== true) {
      failures.push(`${label} health did not return ok=true.`);
    }

    if (expectedCommit && payload.commit && !String(payload.commit).startsWith(expectedCommit.slice(0, 7))) {
      failures.push(`${label} health commit ${payload.commit} does not match expected ${expectedCommit.slice(0, 7)}.`);
    }

    console.log(`[smoke:staging] ${label} health ok commit=${payload.commit ?? "unknown"}`);
  } catch (error) {
    failures.push(`${label} health request failed for ${url}: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

async function checkPage(url, label) {
  try {
    const response = await fetch(url, { redirect: "manual" });

    if (response.status >= 500) {
      failures.push(`${label} returned HTTP ${response.status} for ${url}.`);
      return;
    }

    const location = response.headers.get("location");
    console.log(`[smoke:staging] ${label} http=${response.status}${location ? ` location=${location}` : ""}`);
  } catch (error) {
    failures.push(`${label} request failed for ${url}: ${error instanceof Error ? error.message : String(error)}.`);
  }
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}
