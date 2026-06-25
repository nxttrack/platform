"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const parentRoles = ["parent", "athlete"] as const;

export async function markNotificationReadAction(formData: FormData) {
  const { supabase, tenantId } = await requireParentContext();
  const notificationId = requiredString(formData, "notification_id");

  await throwOnError(
    supabase
      .from("parent_notifications")
      .update({
        status: "read",
        read_at: new Date().toISOString()
      })
      .eq("id", notificationId)
      .eq("tenant_id", tenantId)
  );

  revalidateParentPortal();
}

export async function requestCatchUpLessonAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireParentContext();

  await throwOnError(
    supabase.from("lesson_catch_up_requests").insert({
      tenant_id: tenantId,
      participant_id: requiredString(formData, "participant_id"),
      enrollment_id: requiredString(formData, "enrollment_id"),
      missed_session_id: requiredString(formData, "session_id"),
      requested_by_profile_id: profileId,
      preferred_time_windows: formData.getAll("preferred_time_windows").filter((value): value is string => typeof value === "string"),
      reason: optionalString(formData, "reason"),
      status: "requested"
    })
  );

  revalidateParentPortal();
}

export async function createParentDocumentShareLinkAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireParentContext();
  const documentId = requiredString(formData, "document_id");
  const document = await getAccessibleParentDocument(supabase, tenantId, documentId);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  await throwOnError(
    admin
      .from("parent_documents")
      .update({
        share_enabled: true,
        share_token: token,
        share_created_at: new Date().toISOString(),
        share_expires_at: expiresAt,
        share_revoked_at: null
      })
      .eq("tenant_id", tenantId)
      .eq("id", document.id)
  );

  await logDocumentAccessEvent(admin, {
    tenantId,
    parentDocumentId: document.id,
    participantId: document.participant_id,
    actorProfileId: profileId,
    eventType: "share_link_created",
    metadata: { share_expires_at: expiresAt }
  });

  revalidateParentPortal();
}

export async function revokeParentDocumentShareLinkAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireParentContext();
  const documentId = requiredString(formData, "document_id");
  const document = await getAccessibleParentDocument(supabase, tenantId, documentId);
  const admin = createAdminClient();

  await throwOnError(
    admin
      .from("parent_documents")
      .update({
        share_enabled: false,
        share_token: null,
        share_revoked_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", document.id)
  );

  await logDocumentAccessEvent(admin, {
    tenantId,
    parentDocumentId: document.id,
    participantId: document.participant_id,
    actorProfileId: profileId,
    eventType: "share_link_revoked"
  });

  revalidateParentPortal();
}

async function requireParentContext() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canUseParentPortal = context.activeTenant.roles.some((role) => parentRoles.includes(role as (typeof parentRoles)[number]));

  if (!canUseParentPortal) {
    throw new Error("Je hebt geen ouderportaalrechten voor deze tenant.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

async function getAccessibleParentDocument(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, documentId: string) {
  const result = await supabase
    .from("parent_documents")
    .select("id, tenant_id, participant_id, status, file_path")
    .eq("tenant_id", tenantId)
    .eq("id", documentId)
    .eq("status", "available")
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Document niet gevonden.");
  }

  if (!result.data.file_path) {
    throw new Error("Document heeft nog geen bestand.");
  }

  return result.data as { id: string; tenant_id: string; participant_id: string; status: string; file_path: string | null };
}

async function logDocumentAccessEvent(
  admin: ReturnType<typeof createAdminClient>,
  {
    actorProfileId,
    eventType,
    metadata,
    parentDocumentId,
    participantId,
    tenantId
  }: {
    actorProfileId: string | null;
    eventType: "share_link_created" | "share_link_revoked";
    metadata?: Record<string, unknown>;
    parentDocumentId: string;
    participantId: string;
    tenantId: string;
  }
) {
  await throwOnError(
    admin.from("document_access_events").insert({
      tenant_id: tenantId,
      parent_document_id: parentDocumentId,
      participant_id: participantId,
      actor_profile_id: actorProfileId,
      event_type: eventType,
      access_channel: "web",
      metadata: metadata ?? {}
    })
  );
}

function revalidateParentPortal() {
  for (const path of ["/parent", "/parent/lessen", "/parent/notificaties", "/parent/documenten", "/parent/diplomas", "/parent/profiel"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}
