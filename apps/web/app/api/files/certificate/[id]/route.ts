import { NextResponse } from "next/server";
import { getTrustedAuthContextForRequest } from "@/lib/auth/server-guard";
import { canInstructParticipantFile, canManageTenantFiles, canViewParticipantFile } from "@/lib/domain/private-file-access";
import { createPrivateFileSignedUrl, DIPLOMA_VAULT_BUCKET } from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type CertificateDownloadRow = {
  file_path: string | null;
  id: string;
  participant_id: string;
  status: string;
  storage_bucket: string | null;
  tenant_id: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await getTrustedAuthContextForRequest();

  if (auth.status === "anonymous") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificate_records")
    .select("id, tenant_id, participant_id, status, file_path, storage_bucket")
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

  const signedUrl = await createPrivateFileSignedUrl({
    bucket: certificate.storage_bucket ?? DIPLOMA_VAULT_BUCKET,
    path: certificate.file_path
  });

  return NextResponse.redirect(signedUrl, { status: 302 });
}
