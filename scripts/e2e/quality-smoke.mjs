#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const baseUrl = process.env.E2E_BASE_URL?.replace(/\/+$/, "");

const workflowContracts = [
  {
    label: "Public intake",
    route: "apps/web/app/(tenant-public)/intake/page.tsx",
    files: [
      {
        path: "apps/web/components/public-site/tenant-public-pages.tsx",
        snippets: ["submitIntakeAction", "registration", "trial", "waitlist", "preferredDays"]
      },
      {
        path: "apps/web/lib/public-site/intake-actions.ts",
        snippets: ['from("intake_submissions").insert', 'from("intake_submission_events").insert', "preferred_days", "preferred_time_windows"]
      }
    ]
  },
  {
    label: "Admin placement",
    route: "apps/web/app/(tenant-admin)/admin/plaatsingsvoorstellen/page.tsx",
    files: [
      {
        path: "apps/web/components/placement/admin-placement-pages.tsx",
        snippets: ["createPlacementSuggestionAction", "approvePlacementSuggestionAction", "rejectPlacementSuggestionAction", "Lesplek-aanbod"]
      },
      {
        path: "apps/web/lib/placement/admin-placement-actions.ts",
        snippets: ['from("placement_suggestions").insert', '"offered"', '"rejected"', 'from("slot_offers").insert']
      }
    ]
  },
  {
    label: "Parent portal",
    route: "apps/web/app/(parent)/parent/page.tsx",
    files: [
      {
        path: "apps/web/components/parent-portal/parent-portal-pages.tsx",
        snippets: ["Mijn lessen", "Notificaties", "Documenten", "Betalingen", "Voortgang"]
      },
      {
        path: "apps/web/lib/parent-portal/parent-portal-actions.ts",
        snippets: ["requestCatchUpLessonAction", "markNotificationReadAction", 'from("lesson_catch_up_requests").insert']
      }
    ]
  },
  {
    label: "Instructor attendance",
    route: "apps/web/app/(instructor)/instructor/page.tsx",
    files: [
      {
        path: "apps/web/components/instructor-portal/instructor-portal-pages.tsx",
        snippets: ["recordBulkAttendanceAction", "Aanwezigheid", "Groepslijst", "Voortgang beoordelen"]
      },
      {
        path: "apps/web/lib/instructor-portal/instructor-portal-actions.ts",
        snippets: ["recordBulkAttendanceAction", 'from("session_attendance").upsert', "createProgressUpdateAction", "createStudentNoteAction", "awardBadgeAction"]
      }
    ]
  },
  {
    label: "Manual payment",
    route: "apps/web/app/(tenant-admin)/admin/payments/page.tsx",
    files: [
      {
        path: "apps/web/components/payments/admin-payments-page.tsx",
        snippets: ["recordManualPaymentAction", "recordManualRefundAction", "queueInvoiceReminderAction", "generateFinanceExportAction"]
      },
      {
        path: "apps/web/lib/payments/admin-payments-actions.ts",
        snippets: ["recordManualPaymentAction", "recordManualRefundAction", "calculateOverdueInvoicesAction", 'from("payment_events").insert']
      }
    ]
  },
  {
    label: "Document visibility",
    route: "apps/web/app/api/documents/[id]/download/route.ts",
    files: [
      {
        path: "apps/web/components/operations/admin-phase12-pages.tsx",
        snippets: ["uploadTenantDocumentAction", "Documenten", "zichtbaar"]
      },
      {
        path: "apps/web/app/api/documents/[id]/download/route.ts",
        snippets: ["createSignedUrl", "tenant_document_records", "parent_documents", "getTrustedAuthContext"]
      }
    ]
  }
];

for (const contract of workflowContracts) {
  assertFile(contract.route, `${contract.label} route`);

  for (const fileContract of contract.files) {
    const source = readProjectFile(fileContract.path);

    for (const snippet of fileContract.snippets) {
      if (!source.includes(snippet)) {
        fail(`${contract.label}: missing "${snippet}" in ${fileContract.path}.`);
      }
    }
  }
}

await runOptionalBrowserSmoke();

if (failures.length > 0) {
  console.error("[e2e:smoke] Quality smoke checks failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("[e2e:smoke] Quality smoke checks passed.");

async function runOptionalBrowserSmoke() {
  if (!baseUrl) {
    console.log("[e2e:smoke] E2E_BASE_URL not set; ran source-level smoke contracts only.");
    return;
  }

  const checks = [
    ["/api/health", "health"],
    ["/api/health/ready", "readiness"],
    ["/", "tenant website"],
    ["/programmas", "program overview"],
    ["/intake", "public intake"],
    ["/login", "login"],
    ["/parent", "parent portal boundary"],
    ["/instructor", "instructor portal boundary"],
    ["/admin", "tenant admin boundary"]
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

function assertFile(file, label) {
  if (!existsSync(join(root, file))) {
    fail(`${label} missing: ${file}.`);
  }
}

function readProjectFile(file) {
  const absolutePath = join(root, file);

  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${file}.`);
    return "";
  }

  return readFileSync(absolutePath, "utf8");
}

function fail(message) {
  failures.push(message);
}
