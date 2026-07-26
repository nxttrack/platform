"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { scanUpload } from "@/lib/security/malware-scanner";
import {
  PARTICIPANT_MEDIA_BUCKET,
  uploadParticipantMediaFile
} from "@/lib/storage/private-files";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getActiveTenant } from "./core";
import {
  normalizeRetentionDays,
  PARTICIPANT_MEDIA_MAX_BYTES,
  PARTICIPANT_MEDIA_POLICY_VERSION,
  PARTICIPANT_MEDIA_PURPOSE
} from "./participant-media-contract";
import { getParticipantMediaConsentState } from "./participant-media";

export async function recordParticipantMediaConsentAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/media");
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const decision = readEnum(formData, "decision", ["granted", "denied", "withdrawn"] as const);
  const authority = readEnum(formData, "authority", ["guardian", "legal_representative"] as const);

  if (formData.get("confirmed") !== "on") {
    redirect("/portaal/media?error=confirmation");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_private_progress_media_consent", {
    target_authority: authority,
    target_decision: decision,
    target_participant_id: participantId,
    target_policy_version: PARTICIPANT_MEDIA_POLICY_VERSION,
    target_tenant_id: tenant.id
  });

  if (error) {
    redirect(`/portaal/media?error=${error.code === "42501" ? "readonly" : "consent"}`);
  }

  revalidatePath("/portaal/media");
  redirect(`/portaal/media?saved=${decision}`);
}

export async function uploadParticipantMediaAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/leerlingen");
  requireTenantMediaAdmin(context);
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const caption = readOptional(formData, "caption")?.slice(0, 280) ?? null;
  const retentionDays = normalizeRetentionDays(formData.get("retentionDays"));
  const downloadAllowed = formData.get("downloadAllowed") === "on";
  const file = formData.get("file");

  if (formData.get("privacyConfirmed") !== "on") {
    redirect(`/admin/leerlingen/${participantId}/media?error=confirmation`);
  }
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/leerlingen/${participantId}/media?error=file`);
  }
  if (file.size > PARTICIPANT_MEDIA_MAX_BYTES || !["image/jpeg", "image/png"].includes(file.type)) {
    redirect(`/admin/leerlingen/${participantId}/media?error=file_type`);
  }

  const admin = createAdminClient();
  const participantResult = await admin
    .from("participants")
    .select("id, is_test, journey_run_id")
    .eq("tenant_id", tenant.id)
    .eq("id", participantId)
    .maybeSingle();

  if (
    participantResult.error ||
    !participantResult.data ||
    participantResult.data.is_test ||
    participantResult.data.journey_run_id
  ) {
    redirect(`/admin/leerlingen/${participantId}/media?error=participant`);
  }

  const consent = await getParticipantMediaConsentState(tenant.id, participantId);
  if (!consent.valid) {
    redirect(`/admin/leerlingen/${participantId}/media?error=consent`);
  }

  let processed: File;
  try {
    await scanUpload(file, "participant_media");
    processed = await normalizeProgressImage(file);
  } catch {
    redirect(`/admin/leerlingen/${participantId}/media?error=processing`);
  }

  const mediaId = randomUUID();
  let upload: Awaited<ReturnType<typeof uploadParticipantMediaFile>>;

  try {
    upload = await uploadParticipantMediaFile({
      file: processed,
      mediaId,
      participantId,
      tenantId: tenant.id
    });
  } catch {
    redirect(`/admin/leerlingen/${participantId}/media?error=upload`);
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1_000);
  const insertResult = await admin.from("participant_media").insert({
    id: mediaId,
    tenant_id: tenant.id,
    participant_id: participantId,
    uploaded_by: context.user.id,
    media_type: "image",
    storage_bucket: upload.storageBucket,
    storage_path: upload.filePath,
    file_name: processed.type === "image/png" ? "voortgangsfoto.png" : "voortgangsfoto.jpg",
    mime_type: upload.mimeType,
    size_bytes: upload.sizeBytes,
    caption,
    visibility: "guardian_and_staff",
    consent_purpose: PARTICIPANT_MEDIA_PURPOSE,
    expires_at: expiresAt.toISOString(),
    status: "draft",
    download_allowed: downloadAllowed,
    content_classification: "restricted",
    classification_reasons: ["minor_media", "biometric_context", "metadata_removed"],
    file_sha256: upload.scan.sha256,
    malware_scan_engine: upload.scan.engine,
    malware_scan_status: upload.scan.status,
    malware_scanned_at: upload.scan.scannedAt,
    is_test: false,
    journey_run_id: null,
    test_metadata_json: {}
  });

  if (insertResult.error) {
    await admin.storage.from(PARTICIPANT_MEDIA_BUCKET).remove([upload.filePath]);
    redirect(`/admin/leerlingen/${participantId}/media?error=metadata`);
  }

  const logResult = await admin.from("media_access_logs").insert({
    tenant_id: tenant.id,
    media_id: mediaId,
    viewer_profile_id: context.user.id,
    action: "upload",
    metadata_json: {
      consent_reason: consent.reason,
      retention_days: retentionDays,
      source: "tenant_admin"
    }
  });

  if (logResult.error) {
    await admin.from("participant_media").delete().eq("tenant_id", tenant.id).eq("id", mediaId);
    await admin.storage.from(PARTICIPANT_MEDIA_BUCKET).remove([upload.filePath]);
    redirect(`/admin/leerlingen/${participantId}/media?error=audit`);
  }

  revalidatePath(`/admin/leerlingen/${participantId}/media`);
  redirect(`/admin/leerlingen/${participantId}/media?saved=uploaded`);
}

export async function publishParticipantMediaAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/leerlingen");
  requireTenantMediaAdmin(context);
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const mediaId = readRequired(formData, "mediaId");

  if (formData.get("confirmed") !== "on") {
    redirect(`/admin/leerlingen/${participantId}/media?error=confirmation`);
  }

  const admin = createAdminClient();
  const mediaResult = await admin
    .from("participant_media")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("participant_id", participantId)
    .eq("id", mediaId)
    .eq("status", "draft")
    .maybeSingle();

  if (mediaResult.error || !mediaResult.data) {
    redirect(`/admin/leerlingen/${participantId}/media?error=media`);
  }

  const { data, error } = await admin.rpc("publish_private_progress_media", {
    target_actor_user_id: context.user.id,
    target_media_id: mediaId
  });

  if (error || data !== true) {
    redirect(`/admin/leerlingen/${participantId}/media?error=publish`);
  }

  revalidatePath(`/admin/leerlingen/${participantId}/media`);
  revalidatePath("/portaal/media");
  redirect(`/admin/leerlingen/${participantId}/media?saved=published`);
}

export async function deleteParticipantMediaAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/leerlingen");
  requireTenantMediaAdmin(context);
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const mediaId = readRequired(formData, "mediaId");

  if (formData.get("confirmed") !== "on") {
    redirect(`/admin/leerlingen/${participantId}/media?error=confirmation`);
  }

  const admin = createAdminClient();
  const mediaResult = await admin
    .from("participant_media")
    .select("id, storage_bucket, storage_path")
    .eq("tenant_id", tenant.id)
    .eq("participant_id", participantId)
    .eq("id", mediaId)
    .neq("status", "deleted")
    .maybeSingle();

  if (mediaResult.error || !mediaResult.data) {
    redirect(`/admin/leerlingen/${participantId}/media?error=media`);
  }

  const pendingResult = await admin
    .from("participant_media")
    .update({ status: "pending_deletion" })
    .eq("tenant_id", tenant.id)
    .eq("id", mediaId);
  if (pendingResult.error) {
    redirect(`/admin/leerlingen/${participantId}/media?error=delete`);
  }

  const storageResult = await admin.storage
    .from(mediaResult.data.storage_bucket)
    .remove([mediaResult.data.storage_path]);
  if (storageResult.error) {
    redirect(`/admin/leerlingen/${participantId}/media?error=delete_storage`);
  }

  await admin
    .from("participant_media")
    .update({ status: "deleted", failure_reason: null })
    .eq("tenant_id", tenant.id)
    .eq("id", mediaId);
  await admin.from("media_access_logs").insert({
    tenant_id: tenant.id,
    media_id: mediaId,
    viewer_profile_id: context.user.id,
    action: "delete",
    metadata_json: { confirmed: true, source: "tenant_admin" }
  });

  revalidatePath(`/admin/leerlingen/${participantId}/media`);
  revalidatePath("/portaal/media");
  redirect(`/admin/leerlingen/${participantId}/media?saved=deleted`);
}

async function normalizeProgressImage(file: File) {
  const input = Buffer.from(await file.arrayBuffer());
  const pipeline = sharp(input, {
    failOn: "warning",
    limitInputPixels: 40_000_000
  })
    .rotate()
    .resize({ height: 4096, width: 4096, fit: "inside", withoutEnlargement: true });

  const output =
    file.type === "image/png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.jpeg({ mozjpeg: true, quality: 88 }).toBuffer();
  const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : "jpg";

  return new File([new Uint8Array(output)], `privacy-safe.${extension}`, {
    type: mimeType
  });
}

function readRequired(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requireTenantMediaAdmin(context: AuthenticatedTrustedAuthContext) {
  const roles = context.activeTenant?.roles ?? [];
  if (!roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect("/admin?error=forbidden");
  }
}

function readOptional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readEnum<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[]): Value {
  const value = String(formData.get(key) ?? "");
  if (!allowed.includes(value as Value)) throw new Error(`${key} is invalid.`);
  return value as Value;
}
