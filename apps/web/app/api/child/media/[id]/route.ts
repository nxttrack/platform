import { NextResponse } from "next/server";

import { requireChildApiAuthenticatedContext, privateResponseHeaders } from "@/lib/auth/server-guard";
import { evaluateParticipantMediaAccess } from "@/lib/domain/participant-media-contract";
import { getParticipantMediaConsentState, type ParticipantMediaRow } from "@/lib/domain/participant-media";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireChildApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const admin = createAdminClient();
  const approval = await admin
    .from("portal_child_media_approvals")
    .select("media_id")
    .eq("tenant_id", guard.childSession.tenantId)
    .eq("participant_id", guard.childSession.participantId)
    .eq("media_id", id)
    .is("revoked_at", null)
    .maybeSingle();
  if (approval.error || !approval.data) return notFound();

  const mediaResult = await admin
    .from("participant_media")
    .select("id, tenant_id, participant_id, caption, media_type, storage_bucket, storage_path, file_name, mime_type, size_bytes, malware_scan_status, download_allowed, status, consent_checked_at, published_at, expires_at, created_at")
    .eq("tenant_id", guard.childSession.tenantId)
    .eq("participant_id", guard.childSession.participantId)
    .eq("id", id)
    .maybeSingle();
  if (mediaResult.error || !mediaResult.data) return notFound();
  const media = mediaResult.data as ParticipantMediaRow;
  const consent = await getParticipantMediaConsentState(media.tenant_id, media.participant_id);
  const decision = evaluateParticipantMediaAccess({
    allowDraftReview: false,
    consentValid: consent.valid,
    downloadAllowed: false,
    expiresAt: media.expires_at,
    malwareScanStatus: media.malware_scan_status,
    requestedDownload: false,
    status: media.status
  });
  if (!decision.allowed) return notFound();
  const response = await createPrivateFileResponse({
    bucket: media.storage_bucket,
    disposition: "inline",
    fileName: media.file_name,
    mimeType: media.mime_type,
    path: media.storage_path
  });
  if (!response) return notFound();
  for (const [key, value] of Object.entries(privateResponseHeaders())) response.headers.set(key, value);

  const log = await admin.from("media_access_logs").insert({
    tenant_id: media.tenant_id,
    media_id: media.id,
    viewer_profile_id: guard.context.user.id,
    action: "view",
    metadata_json: { source: "child_safe_approved_media", contextVersion: guard.childSession.contextVersion }
  });
  if (log.error) return NextResponse.json({ error: "audit_unavailable" }, { status: 503, headers: privateResponseHeaders() });
  return response;
}

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404, headers: privateResponseHeaders() });
}
