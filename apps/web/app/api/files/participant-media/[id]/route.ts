import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import {
  evaluateParticipantMediaAccess
} from "@/lib/domain/participant-media-contract";
import {
  canInstructParticipantFile,
  canManageTenantFiles,
  canViewParticipantFile,
  hasTenantRole
} from "@/lib/domain/private-file-access";
import { getParticipantMediaConsentState, type ParticipantMediaRow } from "@/lib/domain/participant-media";
import { createPrivateFileResponse } from "@/lib/storage/private-file-response";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const admin = createAdminClient();
  const mediaResult = await admin
    .from("participant_media")
    .select(
      "id, tenant_id, participant_id, caption, storage_bucket, storage_path, file_name, mime_type, size_bytes, malware_scan_status, download_allowed, status, consent_checked_at, published_at, expires_at, created_at, visibility"
    )
    .eq("id", id)
    .maybeSingle();

  if (mediaResult.error || !mediaResult.data) return notFound();
  const media = mediaResult.data as ParticipantMediaRow & { visibility: string };
  const url = new URL(request.url);
  const requestedDownload = url.searchParams.get("download") === "1";
  const requestedReview = url.searchParams.get("review") === "1";
  const mayReviewDraft = requestedReview && canManageTenantFiles(guard.context, media.tenant_id);
  const permitted = await canViewerAccessMedia(guard.context, media);
  if (!permitted) return notFound();

  const consent = await getParticipantMediaConsentState(media.tenant_id, media.participant_id);
  const decision = evaluateParticipantMediaAccess({
    allowDraftReview: mayReviewDraft,
    consentValid: consent.valid,
    downloadAllowed: media.download_allowed,
    expiresAt: media.expires_at,
    malwareScanStatus: media.malware_scan_status,
    requestedDownload: requestedDownload || (requestedReview && !mayReviewDraft),
    status: media.status
  });
  if (!decision.allowed) return notFound();

  const extension = media.mime_type === "image/png" ? "png" : "jpg";
  const response = await createPrivateFileResponse({
    bucket: media.storage_bucket,
    disposition: requestedDownload ? "attachment" : "inline",
    fileName: media.file_name || `nxttrack-media-${media.id}.${extension}`,
    mimeType: media.mime_type,
    path: media.storage_path
  });
  if (!response) return notFound();

  const logResult = await admin.from("media_access_logs").insert({
    tenant_id: media.tenant_id,
    media_id: media.id,
    viewer_profile_id: guard.context.user.id,
    action: requestedDownload ? "download" : "view",
    metadata_json: {
      confidence: decision.confidence,
      reason: decision.reason,
      source: "audited_media_proxy"
    }
  });
  if (logResult.error) {
    return NextResponse.json({ error: "audit_unavailable" }, { status: 503 });
  }

  return response;
}

async function canViewerAccessMedia(
  context: AuthenticatedTrustedAuthContext,
  media: ParticipantMediaRow & { visibility: string }
) {
  if (!context) return false;
  if (canManageTenantFiles(context, media.tenant_id)) return true;

  if (
    media.visibility === "guardian_and_staff" &&
    hasTenantRole(context, media.tenant_id, ["parent"]) &&
    (await canViewParticipantFile(context, { participantId: media.participant_id, tenantId: media.tenant_id }))
  ) {
    return true;
  }

  return (
    hasTenantRole(context, media.tenant_id, ["instructor"]) &&
    (await canInstructParticipantFile(context, { participantId: media.participant_id, tenantId: media.tenant_id }))
  );
}

function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
