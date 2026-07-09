import "server-only";

import { Buffer } from "node:buffer";
import { createAdminClient } from "@/lib/supabase/admin";

export const TENANT_DOCUMENTS_BUCKET = "tenant-documents";
export const DIPLOMA_VAULT_BUCKET = "diploma-vault";
export const PRIVATE_FILE_MAX_BYTES = 20 * 1024 * 1024;

export type PrivateFileUpload = {
  fileName: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string;
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

export async function createPrivateFileSignedUrl(input: { bucket: string; path: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(input.bucket).createSignedUrl(input.path, 60 * 5);

  if (error || !data?.signedUrl) {
    throw new Error(`Could not create signed file URL: ${error?.message ?? "missing URL"}`);
  }

  return data.signedUrl;
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

async function uploadPrivateFile(input: { bucket: string; file: File; path: string }): Promise<PrivateFileUpload> {
  validatePrivateFile(input.file);

  const admin = createAdminClient();
  const { error } = await admin.storage.from(input.bucket).upload(input.path, Buffer.from(await input.file.arrayBuffer()), {
    contentType: input.file.type,
    upsert: true
  });

  if (error) {
    throw new Error(`Could not upload private file: ${error.message}`);
  }

  return {
    fileName: input.file.name,
    filePath: input.path,
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    storageBucket: input.bucket
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
