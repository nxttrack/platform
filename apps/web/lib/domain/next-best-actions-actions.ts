"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { generateNextBestActions } from "./next-best-actions";

const actionsPath = "/admin/automatisering/acties";

export async function generateNextBestActionsAction() {
  const { tenant } = await getActionContext();
  try {
    const result = await generateNextBestActions(tenant.id);
    revalidateActionPaths();
    redirect(`${actionsPath}?saved=generated&detected=${result.detected}&resolved=${result.autoResolved}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[next-best-actions] generation failed", error);
    redirect(`${actionsPath}?error=generation`);
  }
}

export async function setNextBestActionStatusAction(formData: FormData) {
  const { tenant, userId } = await getActionContext();
  const actionId = readUuid(formData, "actionId");
  const requested = String(formData.get("status") ?? "");
  const status = requested === "dismissed" ? "dismissed" : requested === "completed" ? "completed" : null;
  if (!status) redirect(`${actionsPath}?error=status`);

  const now = new Date().toISOString();
  const result = await createAdminClient()
    .from("next_best_actions")
    .update({
      status,
      dismissed_at: status === "dismissed" ? now : null,
      dismissed_by_user_id: status === "dismissed" ? userId : null,
      completed_at: status === "completed" ? now : null,
      completed_by_user_id: status === "completed" ? userId : null
    })
    .eq("tenant_id", tenant.id)
    .eq("id", actionId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();
  if (result.error || !result.data) redirect(`${actionsPath}?error=state`);

  revalidateActionPaths();
  redirect(`${actionsPath}?saved=${status}`);
}

export async function createNextBestActionTaskAction(formData: FormData) {
  const { tenant, userId } = await getActionContext();
  const actionId = readUuid(formData, "actionId");
  const admin = createAdminClient();
  const actionResult = await admin
    .from("next_best_actions")
    .select("id, title, description, priority, participant_id, source_href, reasons_json, status")
    .eq("tenant_id", tenant.id)
    .eq("id", actionId)
    .eq("status", "open")
    .maybeSingle();
  if (actionResult.error || !actionResult.data) redirect(`${actionsPath}?error=missing`);

  const existing = await admin
    .from("tenant_tasks")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("next_best_action_id", actionId)
    .in("status", ["open", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (existing.error) redirect(`${actionsPath}?error=task_lookup`);
  if (existing.data) redirect(`${actionsPath}?saved=task_exists`);

  const reasons = Array.isArray(actionResult.data.reasons_json)
    ? actionResult.data.reasons_json as Array<{ label?: unknown; evidence?: unknown }>
    : [];
  const description = [
    actionResult.data.description,
    reasons.length
      ? `Redenen:\n${reasons.map((reason) => `- ${String(reason.label ?? "Signaal")}: ${String(reason.evidence ?? "zie brondata")}`).join("\n")}`
      : "",
    `Bron: ${actionResult.data.source_href}`,
    "Deze taak is een voorstel. Bevestig eventuele operationele mutatie afzonderlijk."
  ].filter(Boolean).join("\n\n");
  const classification = classifyContent(
    { title: actionResult.data.title, description },
    actionResult.data.participant_id ? "personal" : "operational"
  );
  const taskResult = await admin.from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: userId,
    related_participant_id: actionResult.data.participant_id,
    next_best_action_id: actionId,
    title: actionResult.data.title,
    description,
    priority: actionResult.data.priority === "high" ? "high" : actionResult.data.priority === "low" ? "low" : "normal",
    status: "open",
    content_classification: classification.classification,
    classification_reasons: classification.reasons
  });
  if (taskResult.error) redirect(`${actionsPath}?error=task`);

  revalidateActionPaths();
  revalidatePath("/admin/taken");
  redirect(`${actionsPath}?saved=task`);
}

async function getActionContext() {
  const context = await requirePrivateShellContext(actionsPath);
  const tenant = getActiveTenant(context);
  const canManage = context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
  );
  if (!canManage) redirect(`${actionsPath}?error=forbidden`);
  return { tenant, userId: context.user.id };
}

function revalidateActionPaths() {
  revalidatePath("/admin");
  revalidatePath(actionsPath);
}

function readUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    redirect(`${actionsPath}?error=input`);
  }
  return value;
}

function isRedirectError(error: unknown) {
  return !!error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
