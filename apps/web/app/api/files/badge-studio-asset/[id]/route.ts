import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { BADGE_STUDIO_ASSETS_BUCKET } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type BadgeStudioAssetRow = {
  id: string;
  malware_scan_status: string;
  mime_type: string;
  name: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  tenant_id: string | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const admin = createAdminClient();
  const result = await admin
    .from("badge_studio_assets")
    .select("id, tenant_id, name, storage_bucket, storage_path, mime_type, malware_scan_status, status")
    .eq("id", id)
    .maybeSingle();
  if (result.error || !result.data) return notFound();

  const asset = result.data as BadgeStudioAssetRow;
  const globalAllowed = asset.tenant_id === null;
  const tenantAllowed = asset.tenant_id
    ? guard.context.tenants.some((tenant) =>
        tenant.tenantId === asset.tenant_id
      )
    : false;

  if (!globalAllowed && !tenantAllowed) return notFound();
  if (asset.storage_bucket !== BADGE_STUDIO_ASSETS_BUCKET) return notFound();
  if (asset.status !== "active" || !hasDownloadableScan(asset.malware_scan_status)) return notFound();

  const extension = asset.mime_type === "image/png" ? "png" : "jpg";
  const response = await createPrivateFileResponse({
    bucket: asset.storage_bucket,
    disposition: "inline",
    fileName: `${asset.name}.${extension}`,
    mimeType: asset.mime_type,
    path: asset.storage_path
  });

  return response ?? notFound();
}

function hasDownloadableScan(status: string) {
  return status === "clean" || (process.env.NODE_ENV !== "production" && status === "not_required");
}

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
