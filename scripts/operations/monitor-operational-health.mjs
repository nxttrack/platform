#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;
const mode = process.env.MONITOR_MODE || "probe";
const appUrl = normalizeBaseUrl(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "");
const databaseUrl = process.env.DATABASE_URL;
const alertsEnabled = process.env.MONITOR_ALERTS_ENABLED === "true";
const timeoutMs = integer("MONITOR_TIMEOUT_MS", 15_000, 1_000);
const windowMinutes = integer("MONITOR_WINDOW_MINUTES", 15, 1);
const failedMailThreshold = integer("MAIL_FAILURE_THRESHOLD", 0, 0);
const skippedMailThreshold = integer("MAIL_SKIPPED_THRESHOLD", 0, 0);
const routes = csv(process.env.RUNTIME_SMOKE_ROUTES, ["/", "/login", "/wachtwoord-vergeten", "/nxttrack"]);
const results = [];

if (!new Set(["probe", "drill"]).has(mode)) {
  throw new Error(`Unsupported MONITOR_MODE: ${mode}`);
}

if (mode === "drill") {
  const delivered = await deliverAlert({
    details: ["This is an explicitly requested synthetic alert. No application failure occurred."],
    event: "synthetic_drill",
    severity: "warning",
    summary: "NXTTRACK synthetic operator-alert drill"
  });

  if (!delivered) {
    console.error("[operations:monitor] FAIL synthetic alert was not delivered.");
    process.exit(1);
  }

  console.log("[operations:monitor] PASS synthetic alert was accepted by the configured webhook.");
  process.exit(0);
}

const appUrlValid = validHttpUrl(appUrl);
check("app-url", appUrlValid, "Application URL is configured as an HTTP(S) URL.");
check("database-url", Boolean(databaseUrl), "Database URL is configured for read-only delivery diagnostics.");

if (appUrlValid) {
  await checkHealth();
  await checkRoutes();
  await checkStaticAssetMime();
}

if (databaseUrl) {
  await checkMailDelivery();
}

for (const result of results) {
  console.log(`[operations:monitor] ${result.status.toUpperCase()} ${result.id}: ${result.message}`);
}

const failures = results.filter((result) => result.status === "fail");

if (failures.length > 0) {
  let alertDelivered = false;

  if (alertsEnabled) {
    alertDelivered = await deliverAlert({
      details: failures.map((failure) => `${failure.id}: ${failure.message}`),
      event: "operational_check_failed",
      severity: "critical",
      summary: `NXTTRACK operational monitor found ${failures.length} failure(s)`
    });
  } else {
    console.log("[operations:monitor] INFO alert delivery is disabled for this probe.");
  }

  console.error(
    `[operations:monitor] FAIL ${failures.length} operational check(s) failed; alert=${alertsEnabled ? (alertDelivered ? "delivered" : "failed") : "disabled"}.`
  );
  process.exit(1);
}

console.log(`[operations:monitor] PASS ${results.length} operational checks passed.`);

async function checkHealth() {
  const url = absoluteUrl("/api/health");
  const response = await request(url, { headers: { accept: "application/json" } });

  if (!response) return;

  if (!response.ok) {
    fail("health-status", `Health endpoint returned HTTP ${response.status}.`);
    return;
  }

  try {
    const body = await response.json();
    check("health-payload", body.ok === true && body.app === "nxttrack-platform", "Health endpoint reports the expected application state.");
    check("health-database", body.checks?.database?.status === "pass", "Health endpoint reports a passing database probe.");
    check("health-commit", Boolean(body.commitSha), "Health endpoint exposes deployed commit metadata.");
  } catch {
    fail("health-json", "Health endpoint did not return valid JSON.");
  }
}

async function checkRoutes() {
  for (const route of routes) {
    const response = await request(absoluteUrl(route), { headers: { accept: "text/html,*/*" } });
    if (!response) continue;
    check(`route-${slug(route)}`, response.status < 500, `Public route ${route} returned HTTP ${response.status}.`);
  }
}

async function checkStaticAssetMime() {
  const response = await request(absoluteUrl("/"), { headers: { accept: "text/html" } });
  if (!response) return;

  if (!response.ok) {
    fail("asset-discovery", `Root page returned HTTP ${response.status}; static assets could not be discovered.`);
    return;
  }

  const html = await response.text();
  const assetPath = discoverStaticAsset(html);
  check("asset-discovery", Boolean(assetPath), "A Next.js CSS or JavaScript asset is discoverable.");
  if (!assetPath) return;

  const assetResponse = await request(absoluteUrl(assetPath), { headers: { accept: "*/*" } });
  if (!assetResponse) return;

  const contentType = assetResponse.headers.get("content-type") || "";
  const expectedMime = assetPath.includes(".css") ? contentType.includes("text/css") : /javascript|ecmascript/.test(contentType);
  check("asset-status", assetResponse.ok, `Static asset returned HTTP ${assetResponse.status}.`);
  check("asset-mime", expectedMime, `Static asset returned ${contentType || "no content type"}.`);
}

async function checkMailDelivery() {
  const client = new Client({
    application_name: "nxttrack-operational-monitor",
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs
  });

  try {
    await client.connect();
    await client.query("begin read only");
    const readOnly = await client.query("show transaction_read_only");
    check("mail-query-read-only", readOnly.rows[0]?.transaction_read_only === "on", "Mail diagnostics use a read-only transaction.");

    const result = await client.query(
      `select
         count(*) filter (where status = 'failed' and created_at >= now() - ($1::int * interval '1 minute'))::int as failed,
         count(*) filter (where status = 'skipped' and created_at >= now() - ($1::int * interval '1 minute'))::int as skipped,
         count(*) filter (where status = 'pending' and created_at < now() - interval '10 minutes')::int as stuck
       from public.email_delivery_attempts`,
      [windowMinutes]
    );
    const stats = result.rows[0] || { failed: 0, skipped: 0, stuck: 0 };

    check("mail-failed", stats.failed <= failedMailThreshold, `${stats.failed} failed mail attempt(s) in ${windowMinutes} minutes; threshold ${failedMailThreshold}.`);
    check("mail-skipped", stats.skipped <= skippedMailThreshold, `${stats.skipped} skipped mail attempt(s) in ${windowMinutes} minutes; threshold ${skippedMailThreshold}.`);
    check("mail-stuck", stats.stuck === 0, `${stats.stuck} mail attempt(s) have remained pending for more than 10 minutes.`);
    await client.query("rollback");
  } catch (error) {
    fail("mail-diagnostics", `Mail delivery diagnostics failed: ${safeMessage(error)}.`);
  } finally {
    await client.query("rollback").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

async function deliverAlert(event) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("[operations:monitor] FAIL ALERT_WEBHOOK_URL is not configured.");
    return false;
  }

  const payload = {
    schemaVersion: 1,
    source: "nxttrack-operations-monitor",
    environment: process.env.APP_ENV || "staging",
    incidentOwner: process.env.INCIDENT_OWNER || null,
    supportOwner: process.env.SUPPORT_OWNER || null,
    occurredAt: new Date().toISOString(),
    commitSha: process.env.GITHUB_SHA || null,
    runUrl: githubRunUrl(),
    ...event
  };
  const format = process.env.ALERT_WEBHOOK_FORMAT || "generic";
  let body;

  try {
    body = formatPayload(payload, format);
  } catch (error) {
    console.error(`[operations:monitor] FAIL ${safeMessage(error)}`);
    return false;
  }
  const response = await request(webhookUrl, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  }, false);

  if (!response?.ok) {
    console.error(`[operations:monitor] FAIL alert webhook returned HTTP ${response?.status ?? "unreachable"}.`);
    return false;
  }

  console.log(`[operations:monitor] PASS ${event.event} alert accepted using ${format} format.`);
  return true;
}

function formatPayload(payload, format) {
  const text = [
    payload.summary,
    `environment=${payload.environment}`,
    payload.incidentOwner ? `incident_owner=${payload.incidentOwner}` : null,
    payload.supportOwner ? `support_owner=${payload.supportOwner}` : null,
    ...payload.details,
    payload.runUrl ? `run=${payload.runUrl}` : null
  ].filter(Boolean).join("\n");

  if (format === "slack" || format === "teams") return { text };
  if (format === "discord") return { content: text.slice(0, 2_000) };
  if (format === "generic") return payload;
  throw new Error(`Unsupported ALERT_WEBHOOK_FORMAT: ${format}`);
}

async function request(url, options = {}, recordFailure = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { redirect: "follow", ...options, signal: controller.signal });
  } catch (error) {
    if (recordFailure) fail(`request-${results.length + 1}`, `Request failed: ${safeMessage(error)}.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function check(id, condition, message) {
  results.push({ id, message, status: condition ? "pass" : "fail" });
}

function fail(id, message) {
  results.push({ id, message, status: "fail" });
}

function absoluteUrl(path) {
  return new URL(path, `${appUrl}/`).toString();
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function validHttpUrl(value) {
  try {
    return new Set(["http:", "https:"]).has(new URL(value).protocol);
  } catch {
    return false;
  }
}

function discoverStaticAsset(html) {
  return html.match(/(?:href|src)=["']([^"']*\/_next\/static\/[^"']+\.(?:css|js)(?:\?[^"']*)?)["']/i)?.[1]?.replaceAll("&amp;", "&");
}

function csv(value, fallback) {
  const parsed = value?.split(",").map((part) => part.trim()).filter(Boolean) || [];
  return parsed.length > 0 ? parsed : fallback;
}

function integer(name, fallback, minimum) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer of at least ${minimum}.`);
  return value;
}

function slug(value) {
  return value === "/" ? "root" : value.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

function githubRunUrl() {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : null;
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  let sanitized = message.replaceAll(databaseUrl || "", "[DATABASE_URL]").replaceAll(process.env.ALERT_WEBHOOK_URL || "", "[ALERT_WEBHOOK_URL]");

  for (const value of [databaseUrl, process.env.ALERT_WEBHOOK_URL]) {
    try {
      sanitized = sanitized.replaceAll(new URL(value).hostname, "[REDACTED_HOST]");
    } catch {
      // Invalid or absent URLs are represented without revealing credentials.
    }
  }

  return sanitized;
}
