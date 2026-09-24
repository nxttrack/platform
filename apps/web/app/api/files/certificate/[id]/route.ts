import { NextResponse } from "next/server";
import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { canInstructParticipantFile, canManageTenantFiles, canViewParticipantFile } from "@/lib/domain/private-file-access";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { DIPLOMA_VAULT_BUCKET } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CertificateDownloadRow = {
  file_name: string | null;
  file_path: string | null;
  id: string;
  mime_type: string | null;
  participant_id: string;
  status: string;
  storage_bucket: string | null;
  tenant_id: string;
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
    .from("certificate_records")
    .select("id, tenant_id, participant_id, status, file_name, file_path, mime_type, storage_bucket, malware_scan_status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const certificate = data as CertificateDownloadRow;
  const allowed =
    canManageTenantFiles(auth, certificate.tenant_id) ||
    (certificate.status === "issued" &&
      ((await canViewParticipantFile(auth, {
        participantId: certificate.participant_id,
        tenantId: certificate.tenant_id
      })) ||
        (await canInstructParticipantFile(auth, {
          participantId: certificate.participant_id,
          tenantId: certificate.tenant_id
        }))));

  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!certificate.file_path) {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }
  if (!hasDownloadableScan(certificate.malware_scan_status)) {
    return NextResponse.json({ error: "file_scan_required" }, { status: 423 });
  }

  const response = await createPrivateFileResponse({
    bucket: certificate.storage_bucket ?? DIPLOMA_VAULT_BUCKET,
    fileName: certificate.file_name ?? `nxttrack-diploma-${certificate.id}.pdf`,
    mimeType: certificate.mime_type,
    path: certificate.file_path
  });

  return response ?? NextResponse.json({ error: "file_missing" }, { status: 404 });
}

function hasDownloadableScan(status: string) {
  return status === "clean" || (process.env.NODE_ENV !== "production" && status === "not_required");
}
