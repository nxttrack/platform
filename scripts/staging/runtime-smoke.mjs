#!/usr/bin/env node

const baseUrl = normalizeBaseUrl(process.env.RUNTIME_SMOKE_URL ?? process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://staging.nxttrack.nl");
const timeoutMs = Number.parseInt(process.env.RUNTIME_SMOKE_TIMEOUT_MS ?? "15000", 10);
const routes = csv(process.env.RUNTIME_SMOKE_ROUTES, ["/", "/login", "/wachtwoord-vergeten", "/nxttrack"]);
const tenantBaseUrl = process.env.TENANT_SMOKE_URL ? normalizeBaseUrl(process.env.TENANT_SMOKE_URL) : null;
const tenantRoutes = csv(process.env.TENANT_SMOKE_ROUTES, ["/programmas", "/intake"]);
const failures = [];

console.log(`[staging:runtime-smoke] Target: ${baseUrl}`);

await checkHealth();
await checkRoutes(baseUrl, routes, "public route");
await checkStaticAssets();

if (tenantBaseUrl) {
  await checkRoutes(tenantBaseUrl, tenantRoutes, "tenant route");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[staging:runtime-smoke] FAIL ${failure}`);
  }

  process.exit(1);
}

console.log("[staging:runtime-smoke] PASS runtime health, route status and static asset MIME checks passed.");

async function checkHealth() {
  const url = absoluteUrl(baseUrl, "/api/health");
  const response = await request(url, { headers: { accept: "application/json" } });

  if (!response.ok) {
    failures.push(`health endpoint returned HTTP ${response.status} at ${url}`);
    return;
  }

  let body;

  try {
    body = await response.json();
  } catch (error) {
    failures.push(`health endpoint did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  if (body.ok !== true || body.app !== "nxttrack-platform") {
    failures.push(`health endpoint payload is unexpected: ${JSON.stringify(body)}`);
  }

  if (process.env.REQUIRE_HEALTH_COMMIT === "true" && !body.commitSha) {
    failures.push("health endpoint is missing commitSha while REQUIRE_HEALTH_COMMIT=true");
  }

  const database = body.checks?.database;

  if (database?.status === "fail") {
    failures.push(`health database check failed: ${database.message ?? "no detail"}`);
  }

  if (process.env.REQUIRE_HEALTH_DATABASE === "true" && database?.status !== "pass") {
    failures.push(`health database check must pass but returned ${database?.status ?? "missing"}`);
  }

  console.log(`[staging:runtime-smoke] health env=${body.env ?? "unknown"} commit=${body.commitSha ?? "unknown"} database=${database?.status ?? "missing"}`);
}

async function checkRoutes(targetBaseUrl, targetRoutes, label) {
  for (const route of targetRoutes) {
    const url = absoluteUrl(targetBaseUrl, route);
    const response = await request(url, { headers: { accept: "text/html,*/*" } });

    if (response.status >= 500) {
      failures.push(`${label} ${route} returned HTTP ${response.status}`);
      continue;
    }

    console.log(`[staging:runtime-smoke] ${label} ${route} -> HTTP ${response.status}`);
  }
}

async function checkStaticAssets() {
  const rootUrl = absoluteUrl(baseUrl, "/");
  const response = await request(rootUrl, { headers: { accept: "text/html" } });

  if (!response.ok) {
    failures.push(`root HTML could not be fetched for static asset discovery: HTTP ${response.status}`);
    return;
  }

  const html = await response.text();
  const assets = discoverNextStaticAssets(html).slice(0, Number.parseInt(process.env.RUNTIME_SMOKE_ASSET_LIMIT ?? "12", 10));

  if (assets.length === 0) {
    failures.push("no /_next/static CSS or JS assets were discovered on the root page");
    return;
  }

  for (const assetPath of assets) {
    const assetUrl = absoluteUrl(baseUrl, assetPath);
    const assetResponse = await request(assetUrl, { headers: { accept: "*/*" } });
    const contentType = assetResponse.headers.get("content-type") ?? "";

    if (!assetResponse.ok) {
      failures.push(`static asset ${assetPath} returned HTTP ${assetResponse.status}`);
      continue;
    }

    if (assetPath.includes(".css") && !contentType.includes("text/css")) {
      failures.push(`CSS asset ${assetPath} returned unexpected content-type ${contentType || "missing"}`);
      continue;
    }

    if (assetPath.includes(".js") && !/javascript|ecmascript/.test(contentType)) {
      failures.push(`JS asset ${assetPath} returned unexpected content-type ${contentType || "missing"}`);
      continue;
    }

    console.log(`[staging:runtime-smoke] asset ${assetPath} -> ${contentType}`);
  }
}

function discoverNextStaticAssets(html) {
  const assets = new Set();
  const pattern = /(?:href|src)=["']([^"']*\/_next\/static\/[^"']+\.(?:css|js)(?:\?[^"']*)?)["']/gi;
  let match;

  while ((match = pattern.exec(html))) {
    assets.add(match[1].replace(/&amp;/g, "&"));
  }

  return [...assets];
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    failures.push(`${url} request failed: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(null, { status: 599 });
  } finally {
    clearTimeout(timer);
  }
}

function absoluteUrl(targetBaseUrl, path) {
  return new URL(path, `${targetBaseUrl}/`).toString();
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function csv(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : fallback;
}
