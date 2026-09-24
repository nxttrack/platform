import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  evaluateParticipantMediaConsent,
  PARTICIPANT_MEDIA_PURPOSE,
  type MediaConsentSnapshot
} from "./participant-media-contract";

export type ParticipantMediaRow = {
  caption: string | null;
  consent_checked_at: string | null;
  created_at: string;
  download_allowed: boolean;
  expires_at: string;
  file_name: string;
  id: string;
  malware_scan_status: string;
  media_type: "image" | "video";
  mime_type: string;
  participant_id: string;
  published_at: string | null;
  size_bytes: number;
  status: string;
  storage_bucket: string;
  storage_path: string;
  tenant_id: string;
};

type ConsentRow = {
  expires_at: string | null;
  guardian_user_id: string;
  participant_id: string;
  status: "denied" | "expired" | "granted" | "pending" | "withdrawn";
  updated_at: string;
};

type ParticipantIdentity = {
  display_name: string;
  guardian_user_id: string | null;
  id: string;
  is_test: boolean;
};

export async function getAdminParticipantMediaData(participantId: string) {
  const context = await requirePrivateShellContext("/admin/leerlingen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [participantResult, mediaResult, accessResult] = await Promise.all([
    admin
      .from("participants")
      .select("id, display_name, guardian_user_id, is_test")
      .eq("tenant_id", tenant.id)
      .eq("id", participantId)
      .maybeSingle(),
    admin
      .from("participant_media")
      .select(
        "id, tenant_id, participant_id, caption, media_type, storage_bucket, storage_path, file_name, mime_type, size_bytes, malware_scan_status, download_allowed, status, consent_checked_at, published_at, expires_at, created_at"
      )
      .eq("tenant_id", tenant.id)
      .eq("participant_id", participantId)
      .order("created_at", { ascending: false }),
    admin
      .from("media_access_logs")
      .select("id, media_id, action, occurred_at")
      .eq("tenant_id", tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(100)
  ]);

  assertResult(participantResult.error, "leerling");
  assertResult(mediaResult.error, "media");
  assertResult(accessResult.error, "toegangslog");
  if (!participantResult.data) throw new Error("Leerling niet gevonden.");

  const consent = await getParticipantMediaConsentState(tenant.id, participantId);
  const media = (mediaResult.data ?? []) as ParticipantMediaRow[];
  const mediaIds = new Set(media.map((item) => item.id));

  return {
    tenant,
    canMutate: context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false,
    participant: participantResult.data as ParticipantIdentity,
    media,
    consent,
    accessLogs: ((accessResult.data ?? []) as Array<{ action: string; id: string; media_id: string; occurred_at: string }>).filter(
      (item) => mediaIds.has(item.media_id)
    )
  };
}

export async function getParentParticipantMediaData() {
  const context = await requirePrivateShellContext("/portaal/media");
  return getParentParticipantMediaDataForContext(context);
}

export async function getParentParticipantMediaDataForContext(
  context: AuthenticatedTrustedAuthContext
) {
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [guardianLinksResult, legacyParticipantsResult] = await Promise.all([
    admin
      .from("participant_guardians")
      .select("participant_id, access_level")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .eq("status", "active"),
    admin
      .from("participants")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
  ]);

  assertResult(guardianLinksResult.error, "gezinskoppelingen");
  assertResult(legacyParticipantsResult.error, "leerlingkoppelingen");

  const accessByParticipant = new Map<string, string>();
  for (const link of (guardianLinksResult.data ?? []) as Array<{ access_level: string; participant_id: string }>) {
    accessByParticipant.set(link.participant_id, link.access_level);
  }
  for (const participant of (legacyParticipantsResult.data ?? []) as Array<{ id: string }>) {
    if (!accessByParticipant.has(participant.id)) accessByParticipant.set(participant.id, "primary");
  }

  const participantIds = [...accessByParticipant.keys()];
  if (participantIds.length === 0) {
    return {
      tenant,
      participants: [],
      media: [],
      consents: [],
      consentStates: {},
      childMediaApprovalIds: [],
      childModeEnabled: false
    };
  }

  const [participantsResult, mediaResult, consentsResult, childApprovalsResult, childModeResult] = await Promise.all([
    admin
      .from("participants")
      .select("id, display_name, guardian_user_id, is_test")
      .eq("tenant_id", tenant.id)
      .in("id", participantIds)
      .eq("is_test", false)
      .order("display_name"),
    admin
      .from("participant_media")
      .select(
        "id, tenant_id, participant_id, caption, media_type, storage_bucket, storage_path, file_name, mime_type, size_bytes, malware_scan_status, download_allowed, status, consent_checked_at, published_at, expires_at, created_at"
      )
      .eq("tenant_id", tenant.id)
      .in("participant_id", participantIds)
      .eq("status", "published")
      .gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false }),
    admin
      .from("media_consents")
      .select("participant_id, guardian_user_id, status, expires_at, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .eq("purpose", PARTICIPANT_MEDIA_PURPOSE)
      .in("participant_id", participantIds),
    admin
      .from("portal_child_media_approvals")
      .select("media_id")
      .eq("tenant_id", tenant.id)
      .in("participant_id", participantIds)
      .is("revoked_at", null),
    admin
      .from("tenant_swim_rollouts")
      .select("status")
      .eq("tenant_id", tenant.id)
      .eq("feature_key", "swim.portal.child_mode")
      .in("status", ["pilot", "enabled"])
      .maybeSingle()
  ]);

  assertResult(participantsResult.error, "leerlingen");
  assertResult(mediaResult.error, "media");
  assertResult(consentsResult.error, "toestemmingen");
  assertResult(childApprovalsResult.error, "kindmodus-mediagoedkeuringen");
  assertResult(childModeResult.error, "kindmodusstatus");
  const consentStates = new Map(
    await Promise.all(
      participantIds.map(async (participantId) => [
        participantId,
        await getParticipantMediaConsentState(tenant.id, participantId)
      ] as const)
    )
  );

  return {
    tenant,
    participants: ((participantsResult.data ?? []) as ParticipantIdentity[]).map((participant) => ({
      ...participant,
      accessLevel: accessByParticipant.get(participant.id) ?? "view_only"
    })),
    media: ((mediaResult.data ?? []) as ParticipantMediaRow[]).filter(
      (item) => consentStates.get(item.participant_id)?.valid
    ),
    consents: (consentsResult.data ?? []) as ConsentRow[],
    consentStates: Object.fromEntries(consentStates),
    childMediaApprovalIds: (childApprovalsResult.data ?? []).map((approval) => approval.media_id),
    childModeEnabled: Boolean(childModeResult.data)
  };
}

export async function getParticipantMediaConsentState(tenantId: string, participantId: string) {
  const admin = createAdminClient();
  const [participantResult, guardiansResult, consentsResult] = await Promise.all([
    admin
      .from("participants")
      .select("guardian_user_id, is_test")
      .eq("tenant_id", tenantId)
      .eq("id", participantId)
      .maybeSingle(),
    admin
      .from("participant_guardians")
      .select("guardian_user_id, access_level")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .eq("status", "active"),
    admin
      .from("media_consents")
      .select("guardian_user_id, status, expires_at")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .eq("purpose", PARTICIPANT_MEDIA_PURPOSE)
  ]);

  if (participantResult.error || guardiansResult.error || consentsResult.error || !participantResult.data) {
    return { valid: false, confidence: "high" as const, reason: "source_unavailable", sources: ["database"] };
  }
  const participant = participantResult.data as { guardian_user_id: string | null; is_test: boolean };
  if (participant.is_test) {
    return { valid: false, confidence: "high" as const, reason: "test_participant_blocked", sources: ["participants.is_test"] };
  }

  const guardianLinks = (guardiansResult.data ?? []) as Array<{ access_level: string; guardian_user_id: string }>;
  const guardianIds = new Set(
    guardianLinks
      .filter((item) => item.access_level === "primary" || item.access_level === "secondary")
      .map((item) => item.guardian_user_id)
  );
  if (
    participant.guardian_user_id &&
    !guardianLinks.some(
      (item) => item.guardian_user_id === participant.guardian_user_id && item.access_level === "view_only"
    )
  ) {
    guardianIds.add(participant.guardian_user_id);
  }

  return evaluateParticipantMediaConsent(
    ((consentsResult.data ?? []) as Array<{ expires_at: string | null; guardian_user_id: string; status: MediaConsentSnapshot["status"] }>).map(
      (item) => ({
        expiresAt: item.expires_at,
        guardianUserId: item.guardian_user_id,
        status: item.status
      })
    ),
    [...guardianIds]
  );
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Kon ${label} niet laden: ${error.message}`);
}
