import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tenantStaffRoles = ["tenant_owner", "tenant_admin", "tenant_staff"];
const financeExportBucket = "tenant-documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const selection = await getActiveTenantSelection();
  const authContext = await getTrustedAuthContext(selection);

  if (authContext.status !== "authenticated" || !authContext.activeTenant) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const hasAccess = authContext.activeTenant.roles.some((role) => tenantStaffRoles.includes(role));

  if (!hasAccess) {
    return NextResponse.json({ error: "Geen toegang tot finance exports." }, { status: 403 });
  }

  const tenantId = authContext.activeTenant.tenantId;
  const supabase = await createClient();
  const exportResult = await supabase
    .from("finance_export_requests")
    .select("file_path")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "ready")
    .single();

  if (exportResult.error || !exportResult.data?.file_path) {
    return NextResponse.json({ error: "Finance exportbestand niet gevonden." }, { status: 404 });
  }

  const signedResult = await createAdminClient().storage.from(financeExportBucket).createSignedUrl(exportResult.data.file_path, 300);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    return NextResponse.json({ error: signedResult.error?.message ?? "Downloadlink kon niet worden gemaakt." }, { status: 500 });
  }

  return NextResponse.redirect(signedResult.data.signedUrl);
}
