import "server-only";

import { Buffer } from "node:buffer";
import { scanUpload, type MalwareScanEvidence } from "@/lib/security/malware-scanner";
import { createAdminClient } from "@/lib/supabase/admin";

export const TENANT_DOCUMENTS_BUCKET = "tenant-documents";
export const DIPLOMA_VAULT_BUCKET = "diploma-vault";
export const PARTICIPANT_MEDIA_BUCKET = "participant-media";
export const BADGE_STUDIO_ASSETS_BUCKET = "badge-studio-assets";
export const TENANT_MEDIA_ASSETS_BUCKET = "tenant-media-assets";
export const PRIVATE_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const BADGE_STUDIO_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const TENANT_MEDIA_ASSET_MAX_BYTES = 10 * 1024 * 1024;

export type PrivateFileUpload = {
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string;
  scan: MalwareScanEvidence;
};

export async function uploadTenantDocumentFile(input: { documentId: string; file: File; tenantId: string }): Promise<PrivateFileUpload> {
  return uploadPrivateFile({
    bucket: TENANT_DOCUMENTS_BUCKET,
    file: input.file,
    path: `${input.tenantId}/documents/${input.documentId}/${normalizeStorageFileName(input.file.name)}`
  });
}

export async function uploadCertificateFile(input: { certificateId: string; file: File; tenantId: string }): Promise<PrivateFileUpload> {
  return uploadPrivateFile({
    bucket: DIPLOMA_VAULT_BUCKET,
    file: input.file,
    path: `${input.tenantId}/certificates/${input.certificateId}/${normalizeStorageFileName(input.file.name)}`
  });
}

export async function uploadParticipantMediaFile(input: {
  file: File;
  mediaId: string;
  participantId: string;
  tenantId: string;
}): Promise<PrivateFileUpload> {
  const extension = input.file.type === "image/png" ? "png" : "jpg";

  return uploadPrivateFile({
    bucket: PARTICIPANT_MEDIA_BUCKET,
    file: input.file,
    path: `${input.tenantId}/participants/${input.participantId}/${input.mediaId}.${extension}`,
    purpose: "participant_media",
    upsert: false
  });
}

export async function uploadBadgeStudioAssetFile(input: {
  assetId: string;
  file: File;
  scope?: string;
}): Promise<PrivateFileUpload> {
  if (input.file.size > BADGE_STUDIO_ASSET_MAX_BYTES) {
    throw new Error("De afbeelding is groter dan 5 MB.");
  }
  if (!["image/jpeg", "image/png"].includes(input.file.type)) {
    throw new Error("Alleen JPEG- en PNG-afbeeldingen zijn toegestaan.");
  }
  const extension = input.file.type === "image/png" ? "png" : "jpg";

  return uploadPrivateFile({
    bucket: BADGE_STUDIO_ASSETS_BUCKET,
    file: input.file,
    path: `${input.scope ?? "platform"}/assets/${input.assetId}.${extension}`,
    purpose: "badge_studio",
    upsert: false
  });
}

export async function uploadTenantMediaAssetFile(input: {
  assetId: string;
  file: File;
  tenantId: string;
}): Promise<PrivateFileUpload> {
  if (input.file.size > TENANT_MEDIA_ASSET_MAX_BYTES) {
    throw new Error("De afbeelding is groter dan 10 MB.");
  }
  if (!["image/jpeg", "image/png"].includes(input.file.type)) {
    throw new Error("Alleen JPEG- en PNG-afbeeldingen zijn toegestaan.");
  }
  const extension = input.file.type === "image/png" ? "png" : "jpg";
  return uploadPrivateFile({
    bucket: TENANT_MEDIA_ASSETS_BUCKET,
    file: input.file,
    path: `${input.tenantId}/library/${input.assetId}.${extension}`,
    purpose: "site_media",
    upsert: false
  });
}

export function getFileFromFormData(formData: FormData, field: string) {
  const value = formData.get(field);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  validatePrivateFile(value);

  return value;
}

function validatePrivateFile(file: File) {
  if (file.size > PRIVATE_FILE_MAX_BYTES) {
    throw new Error("Het bestand is groter dan 20 MB.");
  }

  if (!file.type) {
    throw new Error("Bestandstype ontbreekt.");
  }
}

async function uploadPrivateFile(input: {
  bucket: string;
  file: File;
  path: string;
  purpose?: "badge_studio" | "participant_media" | "private_document" | "site_media";
  upsert?: boolean;
}): Promise<PrivateFileUpload> {
  validatePrivateFile(input.file);
  const scan = await scanUpload(input.file, input.purpose ?? "private_document");

  const admin = createAdminClient();
  const { error } = await admin.storage.from(input.bucket).upload(input.path, Buffer.from(await input.file.arrayBuffer()), {
    contentType: input.file.type,
    upsert: input.upsert ?? true
  });

  if (error) {
    throw new Error(`Could not upload private file: ${error.message}`);
  }

  return {
    fileName: input.file.name,
    filePath: input.path,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    storageBucket: input.bucket,
    scan
  };
}

function normalizeStorageFileName(value: string) {
  const trimmed = value.trim() || "bestand";
  const normalized = trimmed
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 140);

  return normalized || "bestand";
}
