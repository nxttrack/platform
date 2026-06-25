import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tenantStaffRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"];
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

  const tenantId = authContext.activeTenant.tenantId;
  const supabase = await createClient();
  const staffAccess = authContext.activeTenant.roles.some((role) => tenantStaffRoles.includes(role));
  let filePath: string | null = null;
  let bucket = documentBucket;
  let tenantDocumentId: string | null = null;

  if (staffAccess) {
    const documentResult = await supabase
      .from("tenant_document_records")
      .select("id, storage_bucket, file_path")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .single();

    if (!documentResult.error && documentResult.data?.file_path) {
      filePath = documentResult.data.file_path;
      bucket = documentResult.data.storage_bucket ?? documentBucket;
      tenantDocumentId = documentResult.data.id;
    }
  }

  if (!filePath) {
    const parentDocumentResult = await supabase
      .from("parent_documents")
      .select("id, file_path")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("status", "available")
      .single();

    if (parentDocumentResult.error || !parentDocumentResult.data?.file_path) {
      return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
    }

    filePath = parentDocumentResult.data.file_path;
  }

  if (!filePath) {
    return NextResponse.json({ error: "Documentbestand ontbreekt." }, { status: 404 });
  }

  const resolvedFilePath = filePath;
  const admin = createAdminClient();
  const signedResult = await admin.storage.from(bucket).createSignedUrl(resolvedFilePath, 300);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    return NextResponse.json({ error: signedResult.error?.message ?? "Downloadlink kon niet worden gemaakt." }, { status: 500 });
  }

  if (tenantDocumentId) {
    await supabase
      .from("tenant_document_records")
      .update({
        signed_download_expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
        last_downloaded_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", tenantDocumentId);
  }

  return NextResponse.redirect(signedResult.data.signedUrl);
}
