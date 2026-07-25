import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

const tenantTables = [
  "tenant_settings", "tenant_domains", "tenant_branding", "tenant_memberships", "auth_invitations",
  "programs", "program_stages", "resources", "groups", "sessions", "group_instructor_assignments",
  "session_instructor_assignments", "participants", "participant_guardians", "enrollments", "group_memberships",
  "intake_forms", "intake_questions", "intake_submissions", "intake_answers", "waitlist_entries",
  "waitlist_preferences", "placement_recommendations", "placement_scores", "placement_audit_events", "slot_offers",
  "session_attendance", "participant_progress_scores", "progress_notes", "progress_modules", "progress_items",
  "participant_badge_awards", "badge_definitions", "graduation_readiness", "graduation_events", "graduation_event_participants", "certificate_records",
  "payment_plans", "subscriptions", "manual_payments", "billing_events", "tenant_messages", "tenant_tasks",
  "billing_provider_configs", "billing_provider_customers", "billing_invoices", "billing_invoice_lines",
  "billing_export_batches", "billing_mandates", "billing_collection_attempts", "billing_refunds", "billing_chargebacks",
  "payment_sessions", "payment_provider_events", "tenant_documents", "tenant_report_snapshots", "tenant_events",
  "tenant_notifications", "automation_rules", "automation_runs", "saved_views", "lesson_cancellations",
  "catch_up_credits", "catch_up_requests", "instructor_availability", "planning_change_events",
  "import_jobs", "import_rows", "import_job_events", "media_consents"
] as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAuthenticatedContext();
  if (!guard.ok) return guard.response;
  const context = guard.context;
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const admin = createAdminClient();
  const runResult = await admin.from("tenant_offboarding_runs").select("id, tenant_id, status, retention_ends_at, created_at").eq("id", id).single();
  if (runResult.error || !runResult.data || !["requested", "export_ready"].includes(runResult.data.status)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const tenantResult = await admin.from("tenants").select("*").eq("id", runResult.data.tenant_id).single();
  if (tenantResult.error || !tenantResult.data) return NextResponse.json({ error: "tenant_not_found" }, { status: 404 });

  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of tenantTables) {
    const { data, error } = await admin.from(table).select("*").eq("tenant_id", runResult.data.tenant_id);
    if (error) {
      tables[table] = [{ export_error: error.message }];
      counts[table] = -1;
    } else {
      tables[table] = data ?? [];
      counts[table] = data?.length ?? 0;
    }
  }
  const exportData = {
    format: "nxttrack-tenant-export-v1",
    exportedAt: new Date().toISOString(),
    retentionEndsAt: runResult.data.retention_ends_at,
    tenant: tenantResult.data,
    tables,
    storage: {
      includedInline: false,
      buckets: ["tenant-documents", "diploma-vault"],
      paths: [
        ...(tables.tenant_documents ?? []).map((row) => isRecord(row) ? row.file_path : null),
        ...(tables.certificate_records ?? []).map((row) => isRecord(row) ? row.file_path : null)
      ].filter(Boolean),
      instruction: "Exporteer de genoemde private objecten via het storage-backuprunbook vóór accountsluiting."
    }
  };
  const body = JSON.stringify(exportData, null, 2);
  const sha256 = createHash("sha256").update(body).digest("hex");
  await admin.from("tenant_offboarding_runs").update({
    status: "export_ready",
    export_completed_at: new Date().toISOString(),
    export_manifest: { format: exportData.format, sha256, counts, bytes: Buffer.byteLength(body), storageObjects: exportData.storage.paths.length }
  }).eq("id", id);
  return new NextResponse(body, {
    headers: {
      "Content-Disposition": `attachment; filename=\"${tenantResult.data.slug}-nxttrack-export.json\"`,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-SHA256": sha256
    }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
