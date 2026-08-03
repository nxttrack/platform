import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export type PortalDocumentRow = {
  id: string;
  title: string;
  description: string | null;
  audience: string;
  visibility: string;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_status: string;
  created_at: string;
};

export async function getParentDocuments(): Promise<PortalDocumentRow[]> {
  const context = await requirePrivateShellContext("/portaal");
  const tenant = getActiveTenant(context);

  return getParentDocumentsForTenant(tenant.id);
}

export function getParentDocumentsForTenant(tenantId: string) {
  return getDocuments({
    audiences: ["parents", "all_tenant"],
    requirePortalVisibility: true,
    tenantId
  });
}

export async function getInstructorDocuments(): Promise<PortalDocumentRow[]> {
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);

  return getInstructorDocumentsForTenant(tenant.id);
}

export function getInstructorDocumentsForTenant(tenantId: string) {
  return getDocuments({
    audiences: ["instructors", "all_tenant"],
    requirePortalVisibility: false,
    tenantId
  });
}

function getDocuments(input: { audiences: string[]; requirePortalVisibility: boolean; tenantId: string }) {
  const admin = createAdminClient();
  let query = admin
    .from("tenant_documents")
    .select("id, title, description, audience, visibility, file_name, file_path, mime_type, size_bytes, storage_status, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .in("audience", input.audiences)
    .order("created_at", { ascending: false });

  if (input.requirePortalVisibility) {
    query = query.eq("visibility", "portal");
  }

  return query.then(({ data, error }) => {
    if (error) {
      throw new Error(`Could not load documents: ${error.message}`);
    }

    return (data ?? []) as PortalDocumentRow[];
  });
}

export function formatDocumentSize(value: number | null) {
  if (!value) {
    return "onbekende grootte";
  }

  if (value < 1024 * 1024) {
    return `${Math.max(1, Math.round(value / 1024))} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}
