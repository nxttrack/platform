"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";

const adminPath = "/admin/feedback";

export async function createFeedbackCampaignAction(formData: FormData) {
  const { context, tenant } = await requireTenantAdmin();
  const name = required(formData, "name", 120);
  const prompt = required(formData, "prompt", 240);
  const followUp = optional(formData, "followUp", 240);
  const triggerType = enumValue(formData, "triggerType", ["trial_completed", "first_month", "certificate_issued", "manual"] as const, "manual");
  const status = formData.get("activate") === "on" ? "active" : "draft";
  const result = await createAdminClient().from("tenant_feedback_campaigns").insert({
    tenant_id: tenant.id,
    name,
    prompt,
    follow_up_question: followUp,
    trigger_type: triggerType,
    status,
    active_from: status === "active" ? new Date().toISOString().slice(0, 10) : null,
    created_by_user_id: context.user.id
  });
  if (result.error) redirect(`${adminPath}?error=campaign`);
  revalidatePath(adminPath);
  redirect(`${adminPath}?saved=campaign`);
}

export async function requestFeedbackAction(formData: FormData) {
  const { context, tenant } = await requireTenantAdmin();
  if (formData.get("humanConfirmation") !== "confirmed") redirect(`${adminPath}?error=confirmation`);
  const campaignId = uuid(formData, "campaignId");
  const participantId = uuid(formData, "participantId");
  const admin = createAdminClient();
  const [campaign, participant] = await Promise.all([
    admin.from("tenant_feedback_campaigns").select("id, status").eq("tenant_id", tenant.id).eq("id", campaignId).maybeSingle(),
    admin.from("participants").select("id, guardian_user_id, is_test").eq("tenant_id", tenant.id).eq("id", participantId).maybeSingle()
  ]);
  if (campaign.error || participant.error || campaign.data?.status !== "active" || !participant.data?.guardian_user_id || participant.data.is_test) {
    redirect(`${adminPath}?error=selection`);
  }
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 30);
  const result = await admin.from("feedback_survey_requests").insert({
    tenant_id: tenant.id,
    campaign_id: campaignId,
    participant_id: participantId,
    guardian_user_id: participant.data.guardian_user_id,
    status: "open",
    source_entity_type: "manual",
    requested_by_user_id: context.user.id,
    expires_at: expiresAt.toISOString()
  });
  if (result.error) redirect(`${adminPath}?error=request`);
  revalidatePath(adminPath);
  revalidatePath("/portaal/feedback");
  redirect(`${adminPath}?saved=request`);
}

export async function submitParentFeedbackAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/feedback");
  const tenant = getActiveTenant(context);
  const requestId = uuid(formData, "requestId");
  const score = Number.parseInt(String(formData.get("score") ?? ""), 10);
  if (!Number.isInteger(score) || score < 0 || score > 10) redirect("/portaal/feedback?error=score");
  const comment = optional(formData, "comment", 2000);
  const classification = classifyContent(comment ?? "", "personal");
  if (classification.classification === "restricted") redirect("/portaal/feedback?error=sensitive");
  const admin = createAdminClient();
  const request = await admin.from("feedback_survey_requests").select("id, status, expires_at").eq("tenant_id", tenant.id).eq("id", requestId).eq("guardian_user_id", context.user.id).maybeSingle();
  if (request.error || !request.data || request.data.status !== "open" || new Date(request.data.expires_at).getTime() <= Date.now()) {
    redirect("/portaal/feedback?error=request");
  }
  const inserted = await admin.from("feedback_survey_responses").insert({
    tenant_id: tenant.id,
    request_id: requestId,
    guardian_user_id: context.user.id,
    score,
    comment,
    follow_up_allowed: formData.get("followUpAllowed") === "on",
    content_classification: classification.classification
  }).select("id").single();
  if (inserted.error) redirect("/portaal/feedback?error=save");
  const completed = await admin.from("feedback_survey_requests").update({
    status: "completed",
    completed_at: new Date().toISOString()
  }).eq("tenant_id", tenant.id).eq("id", requestId).eq("status", "open");
  if (completed.error) {
    await admin.from("feedback_survey_responses").delete().eq("tenant_id", tenant.id).eq("id", inserted.data.id);
    redirect("/portaal/feedback?error=save");
  }
  revalidatePath("/portaal/feedback");
  revalidatePath(adminPath);
  redirect("/portaal/feedback?saved=response");
}

async function requireTenantAdmin() {
  const context = await requirePrivateShellContext(adminPath);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect(`${adminPath}?error=forbidden`);
  return { context, tenant };
}

function required(formData: FormData, name: string, max: number) {
  const value = String(formData.get(name) ?? "").trim().slice(0, max);
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function optional(formData: FormData, name: string, max: number) {
  return String(formData.get(name) ?? "").trim().slice(0, max) || null;
}
function uuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} is invalid`);
  return value;
}
function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[], fallback: T) {
  const value = String(formData.get(name) ?? "");
  return values.includes(value as T) ? value as T : fallback;
}
