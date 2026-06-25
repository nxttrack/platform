"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createMakeupCapacityHold, refreshMakeupCandidates } from "@/lib/makeup/makeup-engine";
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
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const sessionId = requiredString(formData, "session_id");
  const reason = optionalString(formData, "reason");
  const preferredTimeWindows = formData.getAll("preferred_time_windows").filter((value): value is string => typeof value === "string");

  const { data, error } = await supabase
    .from("lesson_catch_up_requests")
    .insert({
      tenant_id: tenantId,
      participant_id: participantId,
      enrollment_id: enrollmentId,
      missed_session_id: sessionId,
      requested_by_profile_id: profileId,
      preferred_time_windows: preferredTimeWindows,
      reason,
      status: "requested"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inhaalaanvraag kon niet worden aangemaakt.");
  }

  const admin = createAdminClient();
  const credit = await ensureMakeupCreditForRequest(admin, {
    tenantId,
    participantId,
    enrollmentId,
    sessionId,
    requestId: (data as { id: string }).id,
    reason
  });

  if (credit?.id) {
    await throwOnError(
      admin
        .from("lesson_catch_up_requests")
        .update({ makeup_credit_id: credit.id })
        .eq("tenant_id", tenantId)
        .eq("id", (data as { id: string }).id)
    );
    await refreshMakeupCandidates(admin, tenantId, credit.id);
  }

  revalidateParentPortal();
}

export async function selectMakeupCandidateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireParentContext();
  const requestId = requiredString(formData, "request_id");
  const candidateId = requiredString(formData, "candidate_id");
  const request = await getAccessibleCatchUpRequest(supabase, tenantId, requestId);
  const candidate = await getAccessibleMakeupCandidate(supabase, tenantId, candidateId, request.makeup_credit_id);
  const admin = createAdminClient();

  await throwOnError(
    admin
      .from("makeup_candidate_sessions")
      .update({
        status: "selected",
        selected_by_profile_id: profileId,
        selected_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", candidate.id)
  );

  await throwOnError(
    admin
      .from("lesson_catch_up_requests")
      .update({
        candidate_session_id: candidate.id,
        target_session_id: candidate.session_id,
        approval_mode: "parent_choice",
        decision_reason: "Ouder heeft dit inhaalmoment gekozen."
      })
      .eq("tenant_id", tenantId)
      .eq("id", request.id)
  );

  await createMakeupCapacityHold(admin, {
    tenantId,
    groupId: candidate.group_id,
    enrollmentId: request.enrollment_id,
    expiresAt: candidate.expires_at ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    makeupCreditId: request.makeup_credit_id,
    catchUpRequestId: request.id,
    targetSessionId: candidate.session_id,
    createdByProfileId: profileId
  });

  await logMakeupEvent(admin, {
    tenantId,
    requestId: request.id,
    creditId: request.makeup_credit_id,
    candidateId: candidate.id,
    participantId: request.participant_id,
    enrollmentId: request.enrollment_id,
    profileId,
    eventType: "candidate_selected",
    summary: "Ouder heeft een kandidaat-inhaalles gekozen."
  });

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

async function ensureMakeupCreditForRequest(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    tenantId: string;
    participantId: string;
    enrollmentId: string;
    sessionId: string;
    requestId: string;
    reason: string | null;
  }
) {
  const existing = await admin
    .from("makeup_credits")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("source_request_id", input.requestId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return existing.data as { id: string };
  }

  const ruleResult = await admin
    .from("tenant_lesson_cancellation_rules")
    .select("id, credit_valid_days, makeup_credit_granted")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .eq("rule_key", "default")
    .maybeSingle();

  if (ruleResult.error) {
    throw new Error(ruleResult.error.message);
  }

  const rule = ruleResult.data as { id: string; credit_valid_days: number; makeup_credit_granted: boolean } | null;

  if (!rule?.makeup_credit_granted) {
    return null;
  }

  const creditResult = await admin
    .from("makeup_credits")
    .insert({
      tenant_id: input.tenantId,
      participant_id: input.participantId,
      enrollment_id: input.enrollmentId,
      source_session_id: input.sessionId,
      source_request_id: input.requestId,
      rule_id: rule.id,
      status: "available",
      reason: input.reason,
      granted_by: "parent_cancel",
      expires_at: new Date(Date.now() + rule.credit_valid_days * 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        source: "parent_catch_up_request",
        request_id: input.requestId
      }
    })
    .select("id")
    .single();

  if (creditResult.error || !creditResult.data) {
    throw new Error(creditResult.error?.message ?? "Inhaalcredit kon niet worden aangemaakt.");
  }

  return creditResult.data as { id: string };
}

async function getAccessibleCatchUpRequest(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, requestId: string) {
  const { data, error } = await supabase
    .from("lesson_catch_up_requests")
    .select("id, participant_id, enrollment_id, makeup_credit_id")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inhaalaanvraag niet gevonden.");
  }

  const request = data as { id: string; participant_id: string; enrollment_id: string; makeup_credit_id: string | null };

  if (!request.makeup_credit_id) {
    throw new Error("Deze aanvraag heeft nog geen inhaalcredit.");
  }

  return { ...request, makeup_credit_id: request.makeup_credit_id };
}

async function getAccessibleMakeupCandidate(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, candidateId: string, creditId: string) {
  const { data, error } = await supabase
    .from("makeup_candidate_sessions")
    .select("id, makeup_credit_id, session_id, group_id, expires_at")
    .eq("tenant_id", tenantId)
    .eq("id", candidateId)
    .eq("makeup_credit_id", creditId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inhaalmoment niet gevonden.");
  }

  return data as { id: string; makeup_credit_id: string; session_id: string; group_id: string; expires_at: string | null };
}

async function logMakeupEvent(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    tenantId: string;
    requestId: string;
    creditId: string | null;
    candidateId: string;
    participantId: string;
    enrollmentId: string;
    profileId: string;
    eventType: string;
    summary: string;
  }
) {
  await throwOnError(
    admin.from("lesson_makeup_events").insert({
      tenant_id: input.tenantId,
      makeup_credit_id: input.creditId,
      catch_up_request_id: input.requestId,
      candidate_session_id: input.candidateId,
      participant_id: input.participantId,
      enrollment_id: input.enrollmentId,
      event_type: input.eventType,
      summary: input.summary,
      created_by_profile_id: input.profileId
    })
  );
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
