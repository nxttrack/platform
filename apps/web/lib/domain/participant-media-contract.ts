export const PARTICIPANT_MEDIA_PURPOSE = "private_progress_media";
export const PARTICIPANT_MEDIA_POLICY_VERSION = "2026-07";
export const PARTICIPANT_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const PARTICIPANT_MEDIA_DEFAULT_RETENTION_DAYS = 365;
export const PARTICIPANT_MEDIA_MIN_RETENTION_DAYS = 30;
export const PARTICIPANT_MEDIA_MAX_RETENTION_DAYS = 730;

export type MediaConsentDecision = "granted" | "denied" | "withdrawn" | "expired" | "pending";

export type MediaConsentSnapshot = {
  expiresAt: string | null;
  guardianUserId: string;
  status: MediaConsentDecision;
};

export type ParticipantMediaAccessInput = {
  allowDraftReview?: boolean;
  consentValid: boolean;
  downloadAllowed: boolean;
  expiresAt: string;
  malwareScanStatus: string;
  now?: Date;
  requestedDownload?: boolean;
  status: string;
};

export type ParticipantMediaAccessDecision = {
  allowed: boolean;
  confidence: "high";
  reason:
    | "allowed"
    | "consent_missing"
    | "download_disabled"
    | "expired"
    | "not_published"
    | "scan_required";
  sources: string[];
};

export function evaluateParticipantMediaConsent(
  snapshots: readonly MediaConsentSnapshot[],
  activeGuardianIds: readonly string[],
  now = new Date()
) {
  const relevant = snapshots.filter((snapshot) => activeGuardianIds.includes(snapshot.guardianUserId));
  const denied = relevant.some((snapshot) => ["denied", "withdrawn", "expired"].includes(snapshot.status));
  const granted = relevant.some(
    (snapshot) =>
      snapshot.status === "granted" &&
      (!snapshot.expiresAt || new Date(snapshot.expiresAt).getTime() > now.getTime())
  );

  return {
    valid: granted && !denied,
    confidence: "high" as const,
    reason: denied ? "explicitly_blocked" : granted ? "active_guardian_consent" : "consent_missing",
    sources: ["media_consents", "participant_guardians"]
  };
}

export function evaluateParticipantMediaAccess(input: ParticipantMediaAccessInput): ParticipantMediaAccessDecision {
  const now = input.now ?? new Date();
  const sources = ["participant_media", "media_consents", "participant_guardians"];

  if (input.status !== "published" && !(input.allowDraftReview && input.status === "draft")) {
    return { allowed: false, confidence: "high", reason: "not_published", sources };
  }
  if (new Date(input.expiresAt).getTime() <= now.getTime()) {
    return { allowed: false, confidence: "high", reason: "expired", sources };
  }
  if (!input.consentValid) {
    return { allowed: false, confidence: "high", reason: "consent_missing", sources };
  }
  if (!isDownloadableScan(input.malwareScanStatus)) {
    return { allowed: false, confidence: "high", reason: "scan_required", sources };
  }
  if (input.requestedDownload && !input.downloadAllowed) {
    return { allowed: false, confidence: "high", reason: "download_disabled", sources };
  }

  return { allowed: true, confidence: "high", reason: "allowed", sources };
}

export function normalizeRetentionDays(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? PARTICIPANT_MEDIA_DEFAULT_RETENTION_DAYS);
  if (!Number.isInteger(parsed)) return PARTICIPANT_MEDIA_DEFAULT_RETENTION_DAYS;
  return Math.min(PARTICIPANT_MEDIA_MAX_RETENTION_DAYS, Math.max(PARTICIPANT_MEDIA_MIN_RETENTION_DAYS, parsed));
}

export function isDownloadableScan(status: string) {
  return status === "clean";
}

export function mediaStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Concept · menselijke controle nodig",
    published: "Zichtbaar voor ouder/verzorger",
    consent_blocked: "Verborgen na toestemmingswijziging",
    expired: "Bewaartermijn verstreken",
    pending_deletion: "Wordt veilig verwijderd",
    deleted: "Verwijderd",
    failed: "Verwerking mislukt"
  };

  return labels[status] ?? status;
}
