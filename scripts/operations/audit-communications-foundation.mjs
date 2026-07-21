#!/usr/bin/env node

import { resolveTxt } from "node:dns/promises";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
const results = [];
let deliveryStats = null;

check("database-url", Boolean(databaseUrl), "Staging DATABASE_URL is configured for the read-only audit.");
check("app-url", Boolean(appUrl), "Staging APP_URL is configured.");

if (databaseUrl) {
  const client = new Client({
    application_name: "nxttrack-communications-foundation-audit",
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 15_000
  });

  try {
    await client.connect();
    await client.query("begin read only");
    const readOnly = scalar(await client.query("show transaction_read_only"));
    check("database-read-only", readOnly === "on", "Communications audit transaction is read-only.");

    const settingsTable = scalar(await client.query("select to_regclass('public.platform_email_settings') is not null"));
    const attemptsTable = scalar(await client.query("select to_regclass('public.email_delivery_attempts') is not null"));
    check("email-settings-table", settingsTable === true, "Platform email settings table exists.");
    check("delivery-attempts-table", attemptsTable === true, "Email delivery diagnostics table exists.");

    if (settingsTable === true) {
      const settings = first(
        await client.query(`
          select
            enabled,
            provider,
            from_email is not null as has_from_email,
            sendgrid_api_key_encrypted is not null as has_sendgrid_key,
            smtp_host is not null as has_smtp_host,
            smtp_user is not null as has_smtp_user,
            smtp_password_encrypted is not null as has_smtp_password
          from public.platform_email_settings
          where id = true
        `),
        null
      );

      check("email-settings-row", Boolean(settings), "Singleton platform email settings row exists.");

      if (settings) {
        const providerReady =
          settings.provider === "sendgrid_api"
            ? settings.has_sendgrid_key
            : settings.provider === "smtp" && settings.has_smtp_host && settings.has_smtp_user && settings.has_smtp_password;

        check("email-enabled", settings.enabled === true, "Transactional email is enabled in platform settings.");
        check("email-from", settings.has_from_email === true, "A verified sender address is configured.");
        check("email-provider", providerReady === true, "The selected email provider has its required secret and connection fields.");
      }
    }

    if (attemptsTable === true) {
      deliveryStats = first(
        await client.query(`
          select
            count(*)::int as total,
            count(*) filter (where status = 'sent')::int as sent,
            count(*) filter (where status = 'failed')::int as failed,
            count(*) filter (where status = 'skipped')::int as skipped,
            count(*) filter (
              where template_key = 'platform_delivery_test'
                and status = 'sent'
                and delivered_at >= now() - interval '30 days'
            )::int as controlled_test_sent
          from public.email_delivery_attempts
        `)
      );
    }

    await client.query("rollback");
  } catch (error) {
    fail("database-audit", `Read-only communications inventory failed: ${safeMessage(error)}.`);
  } finally {
    try {
      await client.query("rollback");
    } catch {
      // Connection or transaction may already be closed.
    }
    await client.end().catch(() => undefined);
  }
}

check(
  "controlled-test-delivery",
  Number(deliveryStats?.controlled_test_sent ?? 0) > 0,
  "At least one controlled platform test email was delivered in the last 30 days."
);

check("spf", await txtContains("nxttrack.nl", "v=spf1"), "nxttrack.nl publishes an SPF policy.");
check("dmarc", await txtContains("_dmarc.nxttrack.nl", "v=DMARC1"), "nxttrack.nl publishes a DMARC policy.");

const dkimSelector = process.env.EMAIL_DKIM_SELECTOR || "";
check("dkim-selector", Boolean(dkimSelector), "EMAIL_DKIM_SELECTOR identifies the active sender selector.");

if (dkimSelector) {
  check(
    "dkim",
    await txtContains(`${dkimSelector}._domainkey.nxttrack.nl`, "v=DKIM1"),
    "The configured DKIM selector publishes a DKIM key."
  );
}

check("alert-destination", Boolean(process.env.ALERT_WEBHOOK_URL), "An independent operator webhook destination is configured.");
check("monitor-enabled", process.env.MONITORING_ENABLED === "true", "Scheduled operational monitoring is enabled.");
check("incident-owner", Boolean(process.env.INCIDENT_OWNER), "INCIDENT_OWNER names the incident escalation owner.");
check("support-owner", Boolean(process.env.SUPPORT_OWNER), "SUPPORT_OWNER names the user-support owner.");
check(
  "log-retention",
  Number.isInteger(Number(process.env.LOG_RETENTION_DAYS)) && Number(process.env.LOG_RETENTION_DAYS) >= 7,
  "LOG_RETENTION_DAYS is explicitly set to at least seven days."
);
check("staging-health", await healthyApp(appUrl), "Staging health and database probe pass.");

for (const result of results) {
  console.log(`[communications:foundation] ${result.status.toUpperCase()} ${result.id}: ${result.message}`);
}

if (deliveryStats) {
  console.log(
    `[communications:foundation] INFO delivery attempts total=${deliveryStats.total} sent=${deliveryStats.sent} failed=${deliveryStats.failed} skipped=${deliveryStats.skipped} controlled_test_sent_30d=${deliveryStats.controlled_test_sent}.`
  );
}

const failures = results.filter((result) => result.status === "fail");

if (failures.length > 0) {
  console.error(`[communications:foundation] Audit blocked by ${failures.length} failure(s).`);
  process.exit(1);
}

console.log(`[communications:foundation] PASS ${results.length} communications and observability foundation checks.`);

function check(id, condition, message) {
  results.push({ id, message, status: condition ? "pass" : "fail" });
}

function fail(id, message) {
  results.push({ id, message, status: "fail" });
}

function scalar(result, fallback = undefined) {
  const row = first(result, null);
  return row ? row[Object.keys(row)[0]] : fallback;
}

function first(result, fallback = undefined) {
  return result.rows[0] ?? fallback;
}

async function txtContains(hostname, expected) {
  try {
    const records = await resolveTxt(hostname);
    return records.some((parts) => parts.join("").includes(expected));
  } catch {
    return false;
  }
}

async function healthyApp(value) {
  if (!value) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(new URL("/api/health", value), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    const body = await response.json();
    return response.ok && body.ok === true && body.checks?.database?.status === "pass";
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  let sanitized = message.replaceAll(databaseUrl || "", "[DATABASE_URL]");

  try {
    sanitized = sanitized.replaceAll(new URL(databaseUrl).hostname, "[DATABASE_HOST]");
  } catch {
    // Invalid URLs are already handled by the database client.
  }

  return sanitized;
}
