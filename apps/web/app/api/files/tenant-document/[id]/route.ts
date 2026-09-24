import { NextResponse } from "next/server";
import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { canManageTenantFiles, hasTenantRole } from "@/lib/domain/private-file-access";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { TENANT_DOCUMENTS_BUCKET } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type TenantDocumentDownloadRow = {
  audience: string;
  file_name: string | null;
  file_path: string | null;
  id: string;
  mime_type: string | null;
  status: string;
  storage_bucket: string | null;
  tenant_id: string;
  visibility: string;
  malware_scan_status: string;
};

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireApiAuthenticatedContext(request);

  if (!guard.ok) {
    return guard.response;
  }

  const auth = guard.context;
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_documents")
    .select("id, tenant_id, audience, visibility, status, file_name, file_path, mime_type, storage_bucket, malware_scan_status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const document = data as TenantDocumentDownloadRow;

  if (!canDownloadDocument(auth, document)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!document.file_path) {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }
  if (!hasDownloadableScan(document.malware_scan_status)) {
    return NextResponse.json({ error: "file_scan_required" }, { status: 423 });
  }

  const response = await createPrivateFileResponse({
    bucket: document.storage_bucket ?? TENANT_DOCUMENTS_BUCKET,
    fileName: document.file_name ?? `nxttrack-document-${document.id}`,
    mimeType: document.mime_type,
    path: document.file_path
  });

  return response ?? NextResponse.json({ error: "file_missing" }, { status: 404 });
}

function hasDownloadableScan(status: string) {
  return status === "clean" || (process.env.NODE_ENV !== "production" && status === "not_required");
}

function canDownloadDocument(auth: AuthenticatedTrustedAuthContext, document: TenantDocumentDownloadRow) {
  if (canManageTenantFiles(auth, document.tenant_id)) {
    return true;
  }

  if (document.status !== "active") {
    return false;
  }

  if (document.audience === "instructors" || document.audience === "all_tenant") {
    if (hasTenantRole(auth, document.tenant_id, ["instructor"])) {
      return true;
    }
  }

  if (document.visibility === "portal" && (document.audience === "parents" || document.audience === "all_tenant")) {
    return hasTenantRole(auth, document.tenant_id, ["parent"]);
  }

  return false;
}
