import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { TENANT_MEDIA_ASSETS_BUCKET } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const publicRequest = new URL(request.url).searchParams.get("public") === "1";
  const admin = createAdminClient();
  const result = await admin.from("tenant_media_assets")
    .select("id, tenant_id, name, alt_text, storage_bucket, storage_path, mime_type, malware_scan_status, consent_status, consent_expires_at, public_enabled, status")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) return notFound();
  const asset = result.data;
  if (asset.storage_bucket !== TENANT_MEDIA_ASSETS_BUCKET || asset.status !== "active" || !downloadableScan(asset.malware_scan_status)) return notFound();

  if (publicRequest) {
    if (
      !asset.public_enabled
      || !["not_required", "granted"].includes(asset.consent_status)
      || (asset.consent_expires_at && new Date(asset.consent_expires_at) <= new Date())
    ) return notFound();
  } else {
    const guard = await requireApiAuthenticatedContext();
    if (!guard.ok) return guard.response;
    const allowed = guard.context.tenants.some((tenant) =>
      tenant.tenantId === asset.tenant_id
      && tenant.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")
    );
    if (!allowed) return notFound();
  }
  const extension = asset.mime_type === "image/png" ? "png" : "jpg";
  return await createPrivateFileResponse({
    bucket: asset.storage_bucket,
    disposition: "inline",
    fileName: `${asset.name}.${extension}`,
    mimeType: asset.mime_type,
    path: asset.storage_path
  }) ?? notFound();
}

function downloadableScan(status: string) {
  return status === "clean" || (process.env.NODE_ENV !== "production" && status === "not_required");
}

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
