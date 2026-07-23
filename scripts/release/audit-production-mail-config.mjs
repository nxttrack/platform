#!/usr/bin/env node

import { resolveTxt } from "node:dns/promises";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const results = [];
const senderEmail = normalized(process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL);
const dkimSelector = normalized(process.env.EMAIL_DKIM_SELECTOR);

present(
  "provider-secret",
  process.env.SENDGRID_API_KEY || process.env.SMTP_PASSWORD,
  "A production SendGrid API key or SMTP password is configured for first-release delivery."
);
check("sender-email", senderEmail === "noreply@nxttrack.nl", "The production fallback sender is noreply@nxttrack.nl.");
check("sender-name", process.env.SMTP_FROM_NAME === "NXTTRACK", "The production fallback sender name is NXTTRACK.");
check(
  "delivery-timeout",
  Number(process.env.EMAIL_DELIVERY_TIMEOUT_MS) === 15_000,
  "Production email delivery uses the approved 15000 ms timeout."
);
present("dkim-selector", dkimSelector, "The active SendGrid DKIM selector is recorded.");
check("spf", await txtContains("nxttrack.nl", "v=spf1"), "nxttrack.nl publishes an SPF policy.");
check("dmarc", await txtContains("_dmarc.nxttrack.nl", "v=DMARC1"), "nxttrack.nl publishes a DMARC policy.");

if (dkimSelector) {
  check(
    "dkim",
    await txtContains(`${dkimSelector}._domainkey.nxttrack.nl`, "p="),
    "The configured SendGrid DKIM selector publishes a public key."
  );
}

const failures = results.filter((result) => result.status === "fail");

for (const result of results) {
  console.log(`[production:mail] ${result.status.toUpperCase()} ${result.id}: ${result.message}`);
}

writeSummary(results, failures.length);
writeEvidence(results, failures.length);

if (failures.length > 0) {
  console.error(`[production:mail] Audit blocked by ${failures.length} failure(s).`);
  process.exit(1);
}

console.log(`[production:mail] PASS ${results.length} production mail configuration check(s).`);

function check(id, condition, message) {
  results.push({ id, message, status: condition ? "pass" : "fail" });
}

function present(id, value, message) {
  check(id, Boolean(value), message);
}

function normalized(value) {
  return (value || "").trim().toLowerCase();
}

async function txtContains(hostname, expected) {
  try {
    const records = await resolveTxt(hostname);
    return records.some((parts) => parts.join("").toLowerCase().includes(expected.toLowerCase()));
  } catch {
    return false;
  }
}

function writeSummary(entries, failureCount) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;

  const lines = [
    "## Production mail configuration audit",
    "",
    `Result: ${failureCount === 0 ? "PASS" : `BLOCKED (${failureCount} failure(s))`}`,
    "",
    "| Check | Result | Contract |",
    "| --- | --- | --- |",
    ...entries.map((entry) => `| \`${entry.id}\` | ${entry.status.toUpperCase()} | ${entry.message} |`),
    ""
  ];

  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function writeEvidence(entries, failureCount) {
  const outputPath = resolve(process.cwd(), "artifacts/production-mail-configuration-audit.json");
  const evidence = {
    schemaVersion: 1,
    status: failureCount === 0 ? "pass" : "blocked",
    failureCount,
    checks: entries,
    commitSha: process.env.GITHUB_SHA || null,
    runId: process.env.GITHUB_RUN_ID || null,
    createdAt: new Date().toISOString()
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o640 });
}
