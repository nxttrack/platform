import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const certificateBucket = "tenant-documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResolvedCertificate = {
  id: string;
  tenantId: string;
  participantId: string;
  enrollmentId: string | null;
  versionId: string | null;
  bucket: string;
  filePath: string;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const shareToken = request.nextUrl.searchParams.get("share");
  const admin = createAdminClient();

  if (shareToken) {
    const sharedCertificate = await resolveSharedCertificate(admin, id, shareToken);

    if (sharedCertificate instanceof NextResponse) {
      return sharedCertificate;
    }

    return redirectToSignedCertificate(admin, sharedCertificate, null, "share_link");
  }

  const selection = await getActiveTenantSelection();
  const authContext = await getTrustedAuthContext(selection);

  if (authContext.status !== "authenticated" || !authContext.activeTenant) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const supabase = await createClient();
  const certificateResult = await supabase
    .from("certificates")
    .select("id, tenant_id, enrollment_id, participant_id, status, file_path, storage_bucket, current_version_id, download_status, vault_status, retention_until, revoked_at")
    .eq("tenant_id", authContext.activeTenant.tenantId)
    .eq("id", id)
    .single();

  if (certificateResult.error || !certificateResult.data) {
    return NextResponse.json({ error: "Diploma niet gevonden." }, { status: 404 });
  }

  const resolved = resolveCertificateAccess(certificateResult.data as CertificateAccessRow);

  if (resolved instanceof NextResponse) {
    return resolved;
  }

  return redirectToSignedCertificate(admin, resolved, authContext.user.id, "authenticated");
}

async function resolveSharedCertificate(admin: ReturnType<typeof createAdminClient>, certificateId: string, shareToken: string): Promise<ResolvedCertificate | NextResponse> {
  const result = await admin
    .from("certificates")
    .select("id, tenant_id, enrollment_id, participant_id, status, file_path, storage_bucket, current_version_id, download_status, vault_status, retention_until, revoked_at, share_enabled, share_token, share_expires_at, share_revoked_at")
    .eq("id", certificateId)
    .eq("share_token", shareToken)
    .maybeSingle();

  if (result.error || !result.data) {
    return NextResponse.json({ error: "Deellink is niet geldig." }, { status: 404 });
  }

  const certificate = result.data as CertificateAccessRow & {
    share_enabled: boolean;
    share_token: string | null;
    share_expires_at: string | null;
    share_revoked_at: string | null;
  };

  if (!certificate.share_enabled || certificate.share_revoked_at) {
    return NextResponse.json({ error: "Deellink is ingetrokken." }, { status: 410 });
  }

  if (certificate.share_expires_at && new Date(certificate.share_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Deellink is verlopen." }, { status: 410 });
  }

  const resolved = resolveCertificateAccess(certificate);

  if (resolved instanceof NextResponse) {
    return resolved;
  }

  return resolved;
}

type CertificateAccessRow = {
  id: string;
  tenant_id: string;
  enrollment_id: string | null;
  participant_id: string;
  status: string;
  file_path: string | null;
  storage_bucket: string | null;
  current_version_id: string | null;
  download_status: string;
  vault_status: string;
  retention_until: string | null;
  revoked_at: string | null;
};

function resolveCertificateAccess(certificate: CertificateAccessRow): ResolvedCertificate | NextResponse {
  if (certificate.status === "revoked" || certificate.revoked_at) {
    return NextResponse.json({ error: "Dit diploma is ingetrokken." }, { status: 410 });
  }

  if (certificate.vault_status !== "available" || certificate.download_status !== "ready") {
    return NextResponse.json({ error: "Dit diploma is nog niet beschikbaar voor download." }, { status: 409 });
  }

  if (certificate.retention_until && new Date(`${certificate.retention_until}T23:59:59`).getTime() < Date.now()) {
    return NextResponse.json({ error: "De bewaartermijn voor dit diploma is verlopen." }, { status: 410 });
  }

  if (!certificate.file_path) {
    return NextResponse.json({ error: "Diplomabestand ontbreekt." }, { status: 404 });
  }

  return {
    id: certificate.id,
    tenantId: certificate.tenant_id,
    participantId: certificate.participant_id,
    enrollmentId: certificate.enrollment_id,
    versionId: certificate.current_version_id,
    bucket: certificate.storage_bucket ?? certificateBucket,
    filePath: certificate.file_path
  };
}

async function redirectToSignedCertificate(
  admin: ReturnType<typeof createAdminClient>,
  certificate: ResolvedCertificate,
  actorProfileId: string | null,
  channel: "authenticated" | "share_link"
) {
  const signedResult = await admin.storage.from(certificate.bucket).createSignedUrl(certificate.filePath, 300);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    await logCertificateAccess(admin, certificate, actorProfileId, "blocked", channel, {
      reason: signedResult.error?.message ?? "signed_url_failed",
      storage_bucket: certificate.bucket
    });

    return NextResponse.json({ error: signedResult.error?.message ?? "Downloadlink kon niet worden gemaakt." }, { status: 500 });
  }

  const now = new Date().toISOString();

  await admin
    .from("certificates")
    .update({
      signed_download_expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
      last_downloaded_at: now
    })
    .eq("tenant_id", certificate.tenantId)
    .eq("id", certificate.id);

  await logCertificateAccess(admin, certificate, actorProfileId, channel === "share_link" ? "share_link_used" : "download", channel, {
    signed_url_ttl_seconds: 300,
    storage_bucket: certificate.bucket
  });

  return NextResponse.redirect(signedResult.data.signedUrl);
}

async function logCertificateAccess(
  admin: ReturnType<typeof createAdminClient>,
  certificate: ResolvedCertificate,
  actorProfileId: string | null,
  eventType: "download" | "share_link_used" | "blocked",
  channel: "authenticated" | "share_link",
  metadata: Record<string, unknown>
) {
  await admin.from("certificate_access_events").insert({
    tenant_id: certificate.tenantId,
    certificate_id: certificate.id,
    certificate_version_id: certificate.versionId,
    participant_id: certificate.participantId,
    actor_profile_id: actorProfileId,
    event_type: eventType,
    access_channel: channel === "share_link" ? "share_link" : "web",
    metadata
  });
}
