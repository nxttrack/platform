import { NextResponse, type NextRequest } from "next/server";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const tenantStaffRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"];
const documentBucket = "tenant-documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResolvedDocument = {
  bucket: string;
  filePath: string;
  tenantId: string;
  tenantDocumentId: string | null;
  parentDocumentId: string | null;
  participantId: string | null;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const shareToken = request.nextUrl.searchParams.get("share");
  const admin = createAdminClient();

  if (shareToken) {
    const sharedDocument = await resolveSharedParentDocument(admin, id, shareToken);
    if (sharedDocument instanceof NextResponse) {
      return sharedDocument;
    }
    return redirectToSignedDownload(admin, sharedDocument, null, "share_link");
  }

  const selection = await getActiveTenantSelection();
  const authContext = await getTrustedAuthContext(selection);

  if (authContext.status !== "authenticated" || !authContext.activeTenant) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  const tenantId = authContext.activeTenant.tenantId;
  const supabase = await createClient();
  const staffAccess = authContext.activeTenant.roles.some((role) => tenantStaffRoles.includes(role));
  let resolvedDocument: ResolvedDocument | null = null;

  if (staffAccess) {
    const documentResult = await supabase
      .from("tenant_document_records")
      .select("id, storage_bucket, file_path, parent_document_id, participant_id")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .single();

    if (!documentResult.error && documentResult.data?.file_path) {
      resolvedDocument = {
        bucket: documentResult.data.storage_bucket ?? documentBucket,
        filePath: documentResult.data.file_path,
        tenantId,
        tenantDocumentId: documentResult.data.id,
        parentDocumentId: documentResult.data.parent_document_id,
        participantId: documentResult.data.participant_id
      };
    }
  }

  if (!resolvedDocument) {
    const parentDocumentResult = await supabase
      .from("parent_documents")
      .select("id, participant_id, file_path")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("status", "available")
      .single();

    if (parentDocumentResult.error || !parentDocumentResult.data?.file_path) {
      return NextResponse.json({ error: "Document niet gevonden." }, { status: 404 });
    }

    const tenantDocumentResult = await admin
      .from("tenant_document_records")
      .select("id, storage_bucket")
      .eq("tenant_id", tenantId)
      .eq("parent_document_id", parentDocumentResult.data.id)
      .maybeSingle();

    resolvedDocument = {
      bucket: tenantDocumentResult.data?.storage_bucket ?? documentBucket,
      filePath: parentDocumentResult.data.file_path,
      tenantId,
      tenantDocumentId: tenantDocumentResult.data?.id ?? null,
      parentDocumentId: parentDocumentResult.data.id,
      participantId: parentDocumentResult.data.participant_id
    };
  }

  if (!resolvedDocument.filePath) {
    return NextResponse.json({ error: "Documentbestand ontbreekt." }, { status: 404 });
  }

  return redirectToSignedDownload(admin, resolvedDocument, authContext.user.id, "authenticated");
}

async function resolveSharedParentDocument(admin: ReturnType<typeof createAdminClient>, documentId: string, shareToken: string): Promise<ResolvedDocument | NextResponse> {
  const result = await admin
    .from("parent_documents")
    .select("id, tenant_id, participant_id, status, file_path, share_enabled, share_token, share_expires_at")
    .eq("id", documentId)
    .eq("share_token", shareToken)
    .maybeSingle();

  if (result.error || !result.data) {
    return NextResponse.json({ error: "Deellink is niet geldig." }, { status: 404 });
  }

  const document = result.data as {
    id: string;
    tenant_id: string;
    participant_id: string;
    status: string;
    file_path: string | null;
    share_enabled: boolean;
    share_token: string | null;
    share_expires_at: string | null;
  };

  if (document.status !== "available" || !document.share_enabled || !document.file_path) {
    return NextResponse.json({ error: "Deellink is niet beschikbaar." }, { status: 410 });
  }

  if (document.share_expires_at && new Date(document.share_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Deellink is verlopen." }, { status: 410 });
  }

  const tenantDocumentResult = await admin
    .from("tenant_document_records")
    .select("id, storage_bucket")
    .eq("tenant_id", document.tenant_id)
    .eq("parent_document_id", document.id)
    .maybeSingle();

  return {
    bucket: tenantDocumentResult.data?.storage_bucket ?? documentBucket,
    filePath: document.file_path,
    tenantId: document.tenant_id,
    tenantDocumentId: tenantDocumentResult.data?.id ?? null,
    parentDocumentId: document.id,
    participantId: document.participant_id
  };
}

async function redirectToSignedDownload(admin: ReturnType<typeof createAdminClient>, document: ResolvedDocument, actorProfileId: string | null, channel: "authenticated" | "share_link") {
  const signedResult = await admin.storage.from(document.bucket).createSignedUrl(document.filePath, 300);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    return NextResponse.json({ error: signedResult.error?.message ?? "Downloadlink kon niet worden gemaakt." }, { status: 500 });
  }

  const now = new Date().toISOString();

  if (document.tenantDocumentId) {
    await admin
      .from("tenant_document_records")
      .update({
        signed_download_expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
        last_downloaded_at: now
      })
      .eq("tenant_id", document.tenantId)
      .eq("id", document.tenantDocumentId);
  }

  if (document.parentDocumentId) {
    const parentResult = await admin
      .from("parent_documents")
      .select("download_count")
      .eq("tenant_id", document.tenantId)
      .eq("id", document.parentDocumentId)
      .maybeSingle();

    await admin
      .from("parent_documents")
      .update({
        download_count: ((parentResult.data?.download_count as number | undefined) ?? 0) + 1,
        last_downloaded_at: now
      })
      .eq("tenant_id", document.tenantId)
      .eq("id", document.parentDocumentId);
  }

  await admin.from("document_access_events").insert({
    tenant_id: document.tenantId,
    tenant_document_id: document.tenantDocumentId,
    parent_document_id: document.parentDocumentId,
    participant_id: document.participantId,
    actor_profile_id: actorProfileId,
    event_type: "download",
    access_channel: channel,
    metadata: {
      signed_url_ttl_seconds: 300,
      storage_bucket: document.bucket
    }
  });

  return NextResponse.redirect(signedResult.data.signedUrl);
}
