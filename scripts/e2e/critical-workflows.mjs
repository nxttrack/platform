#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const baseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, "");

const routeContracts = [
  ["Tenant homepage", "apps/web/app/page.tsx"],
  ["Program overview", "apps/web/app/(tenant-public)/programmas/page.tsx"],
  ["Program detail", "apps/web/app/(tenant-public)/programmas/[slug]/page.tsx"],
  ["Public intake", "apps/web/app/(tenant-public)/intake/page.tsx"],
  ["Slot offer response", "apps/web/app/(tenant-public)/slot-offers/[token]/page.tsx"],
  ["Tenant login", "apps/web/app/(tenant-public)/login/page.tsx"],
  ["Tenant admin", "apps/web/app/(tenant-admin)/admin/page.tsx"],
  ["Parent portal", "apps/web/app/(parent)/parent/page.tsx"],
  ["Instructor portal", "apps/web/app/(instructor)/instructor/page.tsx"],
  ["Document download route", "apps/web/app/api/documents/[id]/download/route.ts"],
  ["Report download route", "apps/web/app/api/reports/[id]/download/route.ts"]
];

const actionContracts = [
  {
    label: "Public intake stores submission and lifecycle event",
    file: "apps/web/lib/public-site/intake-actions.ts",
    snippets: ['from("intake_submissions").insert', 'from("intake_submission_events").insert', "preferred_days", "preferred_time_windows"]
  },
  {
    label: "Slot offers can be accepted or declined publicly",
    file: "apps/web/lib/placement/slot-offer-public-actions.ts",
    snippets: ['from("slot_offer_responses").insert', '"accepted"', '"declined"']
  },
  {
    label: "Instructor lesson workflow records attendance and progress",
    file: "apps/web/lib/instructor-portal/instructor-portal-actions.ts",
    snippets: ['from("session_attendance").upsert', "recordBulkAttendanceAction", 'from("stage_module_progress").upsert', "awardBadgeAction"]
  },
  {
    label: "Parent workflow supports catch-up and notifications",
    file: "apps/web/lib/parent-portal/parent-portal-actions.ts",
    snippets: ['from("lesson_catch_up_requests").insert', 'from("parent_notifications")', "markNotificationReadAction"]
  },
  {
    label: "Operations workflow sends messages, uploads documents, and generates reports",
    file: "apps/web/lib/operations/admin-phase12-actions.ts",
    snippets: ["runMessageDispatchWorkerAction", "uploadTenantDocumentAction", "generateReportExportAction", "sendLiveEmail"]
  },
  {
    label: "Private download routes use signed URLs",
    file: "apps/web/app/api/documents/[id]/download/route.ts",
    snippets: ["createSignedUrl", "getTrustedAuthContext", "tenant_document_records", "parent_documents"]
  },
  {
    label: "Payment workflow handles manual corrections and reminders",
    file: "apps/web/lib/payments/admin-payments-actions.ts",
    snippets: ["updateInvoiceCorrectionAction", "queueInvoiceReminderAction", 'from("payment_events").insert', 'from("message_outbox").insert']
  }
];

for (const [label, file] of routeContracts) {
  if (!existsSync(join(root, file))) {
    fail(`${label} route missing: ${file}`);
  }
}

for (const contract of actionContracts) {
  const source = readProjectFile(contract.file);

  for (const snippet of contract.snippets) {
    if (!source.includes(snippet)) {
      fail(`${contract.label}: missing "${snippet}" in ${contract.file}.`);
    }
  }
}

await runOptionalHttpChecks();

if (failures.length > 0) {
  console.error("[e2e:critical] Critical workflow checks failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[e2e:critical] Critical workflow checks passed.");

async function runOptionalHttpChecks() {
  if (!baseUrl) {
    console.log("[e2e:critical] E2E_BASE_URL not set; ran source-level workflow contracts only.");
    return;
  }

  const checks = [
    ["/api/health", "health"],
    ["/", "tenant homepage"],
    ["/programmas", "program overview"],
    ["/login", "login"],
    ["/slot-offers/demo-token", "slot offer shell"]
  ];

  for (const [path, label] of checks) {
    try {
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });

      if (response.status >= 500) {
        fail(`${label} returned HTTP ${response.status}.`);
      }
    } catch (error) {
      fail(`${label} request failed: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
}

function readProjectFile(file) {
  const absolutePath = join(root, file);

  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${file}`);
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function fail(message) {
  failures.push(message);
}
