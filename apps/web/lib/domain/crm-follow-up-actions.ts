"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export async function createCrmFollowUpTaskAction(formData: FormData) {
  const { tenantId, userId, item } = await loadLiveCrmItem(formData);
  const admin = createAdminClient();
  const existingResult = await admin
    .from("tenant_tasks")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("crm_follow_up_item_id", item.id)
    .in("status", ["open", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (existingResult.error) redirect("/admin/opvolging?error=task");
  if (!existingResult.data) {
    const taskResult = await admin.from("tenant_tasks").insert({
      tenant_id: tenantId,
      created_by_user_id: userId,
      intake_submission_id: item.intake_submission_id,
      crm_follow_up_item_id: item.id,
      related_participant_id: item.participant_id,
      title: item.suggested_action,
      description: `${item.reason}\n\nBewijs:\n- ${(item.evidence_json as string[]).join("\n- ")}`,
      priority: ["offer_unanswered", "placeable_uncontacted"].includes(item.signal_type) ? "high" : "normal",
      status: "open",
      is_test: false,
      journey_run_id: null
    });
    if (taskResult.error) redirect("/admin/opvolging?error=task");
  }
  revalidatePath("/admin/taken");
  revalidatePath("/admin/opvolging");
  redirect("/admin/opvolging?saved=task");
}

export async function saveCrmDraftAction(formData: FormData) {
  const { tenantId, item } = await loadLiveCrmItem(formData);
  const subject = readRequired(formData, "subject").slice(0, 180);
  const body = readRequired(formData, "body").slice(0, 4_000);
  const classification = classifyContent({ subject, body }, "personal");
  const result = await createAdminClient()
    .from("crm_follow_up_items")
    .update({
      draft_subject: subject,
      draft_body: body,
      content_classification: classification.classification,
      classification_reasons: classification.reasons,
      human_review_required: true
    })
    .eq("tenant_id", tenantId)
    .eq("id", item.id)
    .eq("is_test", false);
  if (result.error) redirect("/admin/opvolging?error=draft");
  revalidatePath("/admin/opvolging");
  redirect("/admin/opvolging?saved=draft");
}

export async function completeCrmFollowUpAction(formData: FormData) {
  const { tenantId, userId, item } = await loadLiveCrmItem(formData);
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirect("/admin/opvolging?error=confirmation");
  }
  const now = new Date().toISOString();
  const result = await createAdminClient()
    .from("crm_follow_up_items")
    .update({
      status: "done",
      last_contacted_at: now,
      completed_at: now,
      completed_by_user_id: userId
    })
    .eq("tenant_id", tenantId)
    .eq("id", item.id)
    .eq("status", "open")
    .eq("is_test", false);
  if (result.error) redirect("/admin/opvolging?error=complete");
  revalidatePath("/admin");
  revalidatePath("/admin/opvolging");
  redirect("/admin/opvolging?saved=done");
}

async function loadLiveCrmItem(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/opvolging");
  const tenant = getActiveTenant(context);
  const itemId = readRequired(formData, "itemId");
  const result = await createAdminClient()
    .from("crm_follow_up_items")
    .select("id, intake_submission_id, participant_id, signal_type, reason, evidence_json, suggested_action, status, is_test")
    .eq("tenant_id", tenant.id)
    .eq("id", itemId)
    .eq("is_test", false)
    .maybeSingle();
  if (result.error || !result.data || result.data.status !== "open") {
    redirect("/admin/opvolging?error=item");
  }
  return { tenantId: tenant.id, userId: context.user.id, item: result.data };
}

function readRequired(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
