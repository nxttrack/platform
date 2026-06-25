import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tenantStaffRoles = ["tenant_owner", "tenant_admin", "tenant_staff"];
const documentBucket = "tenant-documents";

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
    return NextResponse.json({ error: "Geen toegang tot rapportages." }, { status: 403 });
  }

  const tenantId = authContext.activeTenant.tenantId;
  const supabase = await createClient();
  const exportResult = await supabase
    .from("report_export_requests")
    .select("id, file_path, metadata")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "ready")
    .single();

  if (exportResult.error || !exportResult.data?.file_path) {
    return NextResponse.json({ error: "Rapportbestand niet gevonden." }, { status: 404 });
  }

  const admin = createAdminClient();
  const signedResult = await admin.storage.from(documentBucket).createSignedUrl(exportResult.data.file_path, 300);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    return NextResponse.json({ error: signedResult.error?.message ?? "Downloadlink kon niet worden gemaakt." }, { status: 500 });
  }

  const metadata = exportResult.data.metadata && typeof exportResult.data.metadata === "object" && !Array.isArray(exportResult.data.metadata) ? exportResult.data.metadata : {};
  await supabase
    .from("report_export_requests")
    .update({
      metadata: {
        ...metadata,
        last_downloaded_at: new Date().toISOString(),
        last_downloaded_by_profile_id: authContext.user.id,
        last_download_channel: "admin_report_download"
      }
    })
    .eq("tenant_id", tenantId)
    .eq("id", id);

  return NextResponse.redirect(signedResult.data.signedUrl);
}
