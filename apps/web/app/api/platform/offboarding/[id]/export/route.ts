import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { listTenantStorageObjects } from "@/lib/storage/tenant-erasure";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireApiAuthenticatedContext();
  if (!guard.ok) return guard.response;
  if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const admin = createAdminClient();
  const runResult = await admin
    .from("tenant_offboarding_runs")
    .select("id, tenant_id, status, retention_ends_at, created_at")
    .eq("id", id)
    .single();

  if (
    runResult.error ||
    !runResult.data?.tenant_id ||
    !["requested", "export_failed", "export_ready"].includes(runResult.data.status)
  ) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const tenantId = runResult.data.tenant_id;

  try {
    const tenantResult = await admin.from("tenants").select("*").eq("id", tenantId).single();
    if (tenantResult.error || !tenantResult.data) throw new Error(`tenant: ${tenantResult.error?.message ?? "missing"}`);

    const datasetResult = await admin.rpc("export_tenant_dataset", { target_tenant_id: tenantId });
    if (datasetResult.error || !isRecord(datasetResult.data)) {
      throw new Error(`database export: ${datasetResult.error?.message ?? "invalid dataset"}`);
    }

    const tables = datasetResult.data as Record<string, unknown>;
    const storage = await listTenantStorageObjects(tenantId);
    const authAccounts = await exportTenantAuthAccountInventory(tables);
    const counts = Object.fromEntries(
      Object.entries(tables).map(([table, rows]) => [table, Array.isArray(rows) ? rows.length : 0])
    );
    const storagePaths = Object.values(storage).flat();
    const exportData = {
      format: "nxttrack-tenant-export-v2",
      exportedAt: new Date().toISOString(),
      retentionEndsAt: runResult.data.retention_ends_at,
      tenant: tenantResult.data,
      tables,
      authAccounts,
      storage: {
        includedInline: false,
        inventory: storage,
        objectCount: storagePaths.length,
        instruction: "Bewaar de versleutelde Storage-backup en checksum als apart offboardingbewijs."
      }
    };
    const body = JSON.stringify(exportData, null, 2);
    const sha256 = createHash("sha256").update(body).digest("hex");
    const completedAt = new Date().toISOString();
    const update = await admin
      .from("tenant_offboarding_runs")
      .update({
        status: "export_ready",
        export_completed_at: completedAt,
        export_errors: [],
        export_manifest: {
          authAccounts: authAccounts.length,
          bytes: Buffer.byteLength(body),
          counts,
          format: exportData.format,
          sha256,
          storageObjects: storagePaths.length
        },
        tenant_name_snapshot: tenantResult.data.name,
        tenant_slug_snapshot: tenantResult.data.slug
      })
      .eq("id", id);

    if (update.error) throw new Error(`export evidence: ${update.error.message}`);

    return new NextResponse(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename=\"${tenantResult.data.slug}-nxttrack-export.json\"`,
        "Content-Type": "application/json; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-SHA256": sha256
      }
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    await admin
      .from("tenant_offboarding_runs")
      .update({
        status: "export_failed",
        export_completed_at: null,
        export_errors: [{ at: new Date().toISOString(), message }]
      })
      .eq("id", id);

    return NextResponse.json(
      {
        error: "export_failed",
        message: "De export is onvolledig en daarom niet vrijgegeven. Herstel de gemelde stap en probeer opnieuw."
      },
      { status: 503 }
    );
  }
}

async function exportTenantAuthAccountInventory(tables: Record<string, unknown>) {
  const admin = createAdminClient();
  const userIds = collectTenantAuthUserIds(tables);
  const accounts: Array<Record<string, unknown>> = [];

  for (const userId of userIds) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error) throw new Error(`Auth account ${userId}: ${error.message}`);
    if (!data.user) continue;

    accounts.push({
      id: data.user.id,
      email: data.user.email ?? null,
      createdAt: data.user.created_at,
      lastSignInAt: data.user.last_sign_in_at ?? null,
      providers: (data.user.identities ?? []).map((identity) => identity.provider)
    });
  }

  return accounts;
}

function collectTenantAuthUserIds(tables: Record<string, unknown>) {
  const sources: Array<[string, string]> = [
    ["tenant_memberships", "user_id"],
    ["participants", "guardian_user_id"],
    ["participant_guardians", "guardian_user_id"],
    ["group_instructor_assignments", "instructor_user_id"],
    ["session_instructor_assignments", "instructor_user_id"],
    ["media_consents", "guardian_user_id"]
  ];
  const ids = new Set<string>();

  for (const [table, field] of sources) {
    const rows = tables[table];
    if (!Array.isArray(rows)) continue;

    for (const row of rows) {
      if (!isRecord(row)) continue;
      const value = row[field];
      if (typeof value === "string") ids.add(value);
    }
  }

  return [...ids].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
