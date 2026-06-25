import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";

const tenantStaffRoles = ["tenant_owner", "tenant_admin", "tenant_staff"];
const exportTypes = ["participants", "guardians", "groups", "payments"] as const;

type ExportType = (typeof exportTypes)[number];
type RouteContext = {
  params: Promise<{ type: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { type } = await context.params;
  const exportType = exportTypes.includes(type as ExportType) ? (type as ExportType) : null;

  if (!exportType) {
    return NextResponse.json({ error: "Onbekend exporttype." }, { status: 404 });
  }

  const selection = await getActiveTenantSelection();
  const authContext = await getTrustedAuthContext(selection);

  if (authContext.status !== "authenticated" || !authContext.activeTenant) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const hasAccess = authContext.activeTenant.roles.some((role) => tenantStaffRoles.includes(role));

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot admin exports." }, { status: 403 });
  }

  const tenantId = authContext.activeTenant.tenantId;
  const admin = createAdminClient();
  const rows = await buildRows(admin, tenantId, exportType);

  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_profile_id: authContext.user.id,
    source_table: "admin_export",
    action: "insert",
    risk_level: "sensitive",
    metadata: { export_type: exportType, row_count: rows.length }
  });

  return new NextResponse(toCsv(rows), {
    headers: {
      "content-disposition": `attachment; filename="${exportType}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "content-type": "text/csv; charset=utf-8"
    }
  });
}

async function buildRows(admin: ReturnType<typeof createAdminClient>, tenantId: string, exportType: ExportType) {
  if (exportType === "participants") {
    const { data, error } = await admin.from("participants").select("id, external_reference, display_name, birthdate, status, created_at").eq("tenant_id", tenantId).order("display_name", { ascending: true });
    throwOnError(error);
    return data ?? [];
  }

  if (exportType === "guardians") {
    const { data, error } = await admin.from("participant_guardians").select("id, participant_id, profile_id, relationship, display_name, email, status, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    throwOnError(error);
    return data ?? [];
  }

  if (exportType === "groups") {
    const { data, error } = await admin.from("groups").select("id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true });
    throwOnError(error);
    return data ?? [];
  }

  const { data, error } = await admin
    .from("invoices")
    .select("id, invoice_number, title, status, amount_due_cents, amount_paid_cents, refunded_amount_cents, currency, issued_on, due_on, collection_method")
    .eq("tenant_id", tenantId)
    .order("issued_on", { ascending: false });
  throwOnError(error);
  return data ?? [];
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});

  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function throwOnError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}
