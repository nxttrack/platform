"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { crmLostReasons, crmPriorities, crmStages } from "./crm-pipeline-contract";
import { findAndStoreCrmDuplicates } from "./crm-pipeline";

const contactTypes = new Set(["note", "call", "email", "in_app", "meeting", "trial", "status_update", "reminder"]);
const directions = new Set(["inbound", "outbound", "internal"]);
const channels = new Set(["phone", "email", "in_app", "in_person", "system"]);
const outcomes = new Set(["connected", "left_message", "no_answer", "replied", "scheduled", "completed", "needs_follow_up"]);

export async function updateCrmLeadAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const leadId = readUuid(formData, "leadId");
  const stage = readEnum(formData, "stage", new Set(crmStages));
  const priority = readEnum(formData, "priority", new Set(crmPriorities));
  const lostReason = stage === "lost" ? readEnum(formData, "lostReason", new Set(crmLostReasons)) : null;
  const result = await createAdminClient().rpc("update_crm_lead", {
    p_tenant_id: tenantId,
    p_intake_id: leadId,
    p_actor_user_id: userId,
    p_stage: stage,
    p_priority: priority,
    p_owner_user_id: readOptionalUuid(formData, "ownerId"),
    p_next_follow_up_at: readOptionalDateTime(formData, "nextFollowUpAt"),
    p_sla_due_at: readOptionalDateTime(formData, "slaDueAt"),
    p_lost_reason: lostReason,
    p_lost_notes: stage === "lost" ? readOptional(formData, "lostNotes")?.slice(0, 2000) ?? null : null
  });
  if (result.error) redirect(crmPath(leadId, "error=lead_update"));
  refreshCrm();
  redirect(crmPath(leadId, "saved=lead"));
}

export async function recordCrmContactAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const leadId = readUuid(formData, "leadId");
  if (formData.get("humanConfirmation") !== "confirmed") redirect(crmPath(leadId, "error=confirmation"));
  const subject = readOptional(formData, "subject")?.slice(0, 180) ?? null;
  const summary = readRequired(formData, "summary").slice(0, 4000);
  const classification = classifyContent({ subject: subject ?? "", body: summary }, "personal");
  const outcomeValue = readOptional(formData, "outcome");
  const result = await createAdminClient().rpc("record_crm_contact", {
    p_tenant_id: tenantId,
    p_intake_id: leadId,
    p_actor_user_id: userId,
    p_event_type: readEnum(formData, "eventType", contactTypes),
    p_direction: readEnum(formData, "direction", directions),
    p_channel: readEnum(formData, "channel", channels),
    p_subject: subject,
    p_summary: summary,
    p_outcome: outcomeValue ? readEnumValue(outcomeValue, outcomes, "outcome") : null,
    p_occurred_at: readOptionalDateTime(formData, "occurredAt") ?? new Date().toISOString(),
    p_next_follow_up_at: readOptionalDateTime(formData, "nextFollowUpAt"),
    p_content_classification: classification.classification
  });
  if (result.error) redirect(crmPath(leadId, "error=contact"));
  refreshCrm();
  redirect(crmPath(leadId, "saved=contact"));
}

export async function refreshCrmDuplicatesAction() {
  const { tenantId } = await requireCrmAdmin();
  try {
    const count = await findAndStoreCrmDuplicates(tenantId);
    refreshCrm();
    redirect(`/admin/crm?tab=duplicates&saved=duplicates_${count}`);
  } catch {
    redirect("/admin/crm?tab=duplicates&error=duplicate_scan");
  }
}

export async function dismissCrmDuplicateAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const duplicateId = readUuid(formData, "duplicateId");
  const result = await createAdminClient().from("crm_duplicate_candidates").update({
    status: "dismissed",
    reviewed_at: new Date().toISOString(),
    reviewed_by_user_id: userId
  }).eq("tenant_id", tenantId).eq("id", duplicateId).eq("status", "open");
  if (result.error) redirect("/admin/crm?tab=duplicates&error=duplicate_dismiss");
  refreshCrm();
  redirect("/admin/crm?tab=duplicates&saved=duplicate_dismissed");
}

export async function mergeCrmLeadsAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const sourceId = readUuid(formData, "sourceId");
  const targetId = readUuid(formData, "targetId");
  if (formData.get("humanConfirmation") !== "MERGE") redirect("/admin/crm?tab=duplicates&error=merge_confirmation");
  const reason = readRequired(formData, "reason").slice(0, 1000);
  const result = await createAdminClient().rpc("merge_crm_leads", {
    p_tenant_id: tenantId,
    p_source_intake_id: sourceId,
    p_target_intake_id: targetId,
    p_actor_user_id: userId,
    p_reason: reason
  });
  if (result.error) redirect("/admin/crm?tab=duplicates&error=merge");
  refreshCrm();
  redirect(crmPath(targetId, "saved=merged"));
}

export async function revertCrmMergeAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const leadId = readUuid(formData, "leadId");
  if (formData.get("humanConfirmation") !== "UNDO") redirect(crmPath(leadId, "error=undo_confirmation"));
  const result = await createAdminClient().rpc("revert_crm_lead_merge", {
    p_tenant_id: tenantId,
    p_merge_event_id: readUuid(formData, "mergeEventId"),
    p_actor_user_id: userId
  });
  if (result.error) redirect(crmPath(leadId, "error=undo_merge"));
  refreshCrm();
  redirect(crmPath(leadId, "saved=merge_undone"));
}

export async function saveCrmSlaPolicyAction(formData: FormData) {
  const { tenantId, userId } = await requireCrmAdmin();
  const payload = {
    tenant_id: tenantId,
    first_response_hours: readInteger(formData, "firstResponseHours", 1, 168),
    follow_up_hours: readInteger(formData, "followUpHours", 1, 336),
    offer_follow_up_hours: readInteger(formData, "offerFollowUpHours", 1, 168),
    trial_follow_up_hours: readInteger(formData, "trialFollowUpHours", 1, 168),
    updated_by_user_id: userId
  };
  const result = await createAdminClient().from("crm_sla_policies").upsert(payload, { onConflict: "tenant_id" });
  if (result.error) redirect("/admin/crm?tab=settings&error=sla");
  refreshCrm();
  redirect("/admin/crm?tab=settings&saved=sla");
}

async function requireCrmAdmin() {
  const context = await requirePrivateShellContext("/admin/crm");
  const tenant = getActiveTenant(context);
  const allowed = context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role));
  if (!allowed) redirect("/admin?error=forbidden");
  return { tenantId: tenant.id, userId: context.user.id };
}

function refreshCrm() {
  revalidatePath("/admin");
  revalidatePath("/admin/crm");
  revalidatePath("/admin/opvolging");
}

function crmPath(leadId: string, suffix: string) {
  return `/admin/crm?lead=${encodeURIComponent(leadId)}&${suffix}`;
}

function readRequired(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  return value.trim();
}

function readOptional(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(formData: FormData, name: string) {
  const value = readRequired(formData, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} must be a UUID.`);
  return value;
}

function readOptionalUuid(formData: FormData, name: string) {
  const value = readOptional(formData, name);
  if (!value) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} must be a UUID.`);
  return value;
}

function readEnum<T extends string>(formData: FormData, name: string, values: Set<T>) {
  return readEnumValue(readRequired(formData, name), values, name);
}

function readEnumValue<T extends string>(value: string, values: Set<T>, name: string) {
  if (!values.has(value as T)) throw new Error(`${name} is invalid.`);
  return value as T;
}

function readOptionalDateTime(formData: FormData, name: string) {
  const value = readOptional(formData, name);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} is invalid.`);
  return parsed.toISOString();
}

function readInteger(formData: FormData, name: string, min: number, max: number) {
  const value = Number(readRequired(formData, name));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is invalid.`);
  return value;
}
