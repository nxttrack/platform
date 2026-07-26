"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { findMakeupMarketplaceMatches } from "./makeup-marketplace";
import { createTenantNotifications } from "./tenant-notifications";

export async function inviteMakeupMarketplaceParentAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/agenda");
  const tenant = getActiveTenant(context);
  const sessionId = readRequired(formData, "sessionId");
  const creditId = readRequired(formData, "creditId");
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=confirmation#makeup-marketplace`);
  }
  const data = await findMakeupMarketplaceMatches({ tenantId: tenant.id, sessionId });
  const match = data?.matches.find((candidate) => candidate.credit_id === creditId);
  if (!data || !match || match.is_test || !match.notification_allowed || !match.guardian_user_id) {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=invite_not_allowed#makeup-marketplace`);
  }
  const admin = createAdminClient();
  const preferenceResult = await admin
    .from("guardian_communication_preferences")
    .select("make_up_in_app_enabled, make_up_email_enabled")
    .eq("tenant_id", tenant.id)
    .eq("guardian_user_id", match.guardian_user_id)
    .maybeSingle();
  if (preferenceResult.error || preferenceResult.data?.make_up_in_app_enabled === false) {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=communication_preference#makeup-marketplace`);
  }

  const decisionResult = await admin
    .from("makeup_marketplace_decisions")
    .upsert({
      tenant_id: tenant.id,
      session_id: sessionId,
      participant_id: match.participant_id,
      credit_id: match.credit_id,
      status: "invited",
      score: match.score,
      reasons_json: match.reasons,
      suggested_action: match.suggested_action,
      expires_soon: match.expires_soon,
      invited_at: new Date().toISOString(),
      decided_by_user_id: context.user.id,
      source: "makeup_marketplace",
      is_test: false,
      journey_run_id: null,
      test_metadata_json: {}
    }, { onConflict: "tenant_id,session_id,credit_id" });
  if (decisionResult.error) {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=invite#makeup-marketplace`);
  }

  const notification = await createTenantNotifications({
    tenantId: tenant.id,
    recipientIds: [match.guardian_user_id],
    participantId: match.participant_id,
    type: "makeup_invitation",
    title: `Inhaalmogelijkheid voor ${match.participant_name}`,
    message: `Er is een passend inhaalmoment op ${formatDateTime(data.session.startsAt)}. Open Mijn lessen om de geldige optie te bekijken en zelf te bevestigen.`,
    organizationName: tenant.name,
    deliverEmail: preferenceResult.data?.make_up_email_enabled ?? true
  });
  if (notification.length === 0) {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=notification#makeup-marketplace`);
  }

  revalidatePath("/admin/agenda");
  revalidatePath("/portaal/lessen");
  redirect(`/admin/agenda?marketplace=${sessionId}&saved=marketplace-invited#makeup-marketplace`);
}

export async function bookMakeupMarketplaceDirectAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/agenda");
  const tenant = getActiveTenant(context);
  const sessionId = readRequired(formData, "sessionId");
  const creditId = readRequired(formData, "creditId");
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=confirmation#makeup-marketplace`);
  }
  const data = await findMakeupMarketplaceMatches({ tenantId: tenant.id, sessionId });
  const match = data?.matches.find((candidate) => candidate.credit_id === creditId);
  if (!match || match.is_test) {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=match#makeup-marketplace`);
  }
  const result = await createAdminClient().rpc("book_makeup_marketplace_session", {
    target_tenant_id: tenant.id,
    target_credit_id: creditId,
    target_session_id: sessionId,
    actor_user_id: context.user.id,
    booking_mode: "admin_direct",
    human_confirmation: true
  });
  if (result.error) {
    console.error("[makeup-marketplace] direct booking failed", { tenantId: tenant.id, sessionId, creditId, code: result.error.code, message: result.error.message });
    redirect(`/admin/agenda?marketplace=${sessionId}&error=booking#makeup-marketplace`);
  }
  revalidatePath("/admin/agenda");
  revalidatePath("/portaal/lessen");
  redirect(`/admin/agenda?marketplace=${sessionId}&saved=marketplace-booked#makeup-marketplace`);
}

export async function ignoreMakeupMarketplaceMatchAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/agenda");
  const tenant = getActiveTenant(context);
  const sessionId = readRequired(formData, "sessionId");
  const creditId = readRequired(formData, "creditId");
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirect(`/admin/agenda?marketplace=${sessionId}&error=confirmation#makeup-marketplace`);
  }
  const data = await findMakeupMarketplaceMatches({ tenantId: tenant.id, sessionId });
  const match = data?.matches.find((candidate) => candidate.credit_id === creditId);
  if (!match) redirect(`/admin/agenda?marketplace=${sessionId}&error=match#makeup-marketplace`);
  const result = await createAdminClient()
    .from("makeup_marketplace_decisions")
    .upsert({
      tenant_id: tenant.id,
      session_id: sessionId,
      participant_id: match.participant_id,
      credit_id: match.credit_id,
      status: "ignored",
      score: match.score,
      reasons_json: match.reasons,
      suggested_action: match.suggested_action,
      expires_soon: match.expires_soon,
      decided_at: new Date().toISOString(),
      decided_by_user_id: context.user.id,
      source: match.is_test ? "journey_simulation_bot" : "makeup_marketplace",
      is_test: match.is_test,
      journey_run_id: match.journey_run_id,
      test_metadata_json: match.is_test ? { source: "journey_simulation_bot" } : {}
    }, { onConflict: "tenant_id,session_id,credit_id" });
  if (result.error) redirect(`/admin/agenda?marketplace=${sessionId}&error=ignore#makeup-marketplace`);
  revalidatePath("/admin/agenda");
  redirect(`/admin/agenda?marketplace=${sessionId}&saved=marketplace-ignored#makeup-marketplace`);
}

function readRequired(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
