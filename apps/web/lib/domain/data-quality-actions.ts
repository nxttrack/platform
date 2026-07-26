"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { runDataQualityChecks, type DataQualityIssueRow } from "./data-quality";

const dataQualityPath = "/admin/automatisering/datakwaliteit";

export async function runDataQualityChecksAction() {
  const { tenant } = await getActionContext();

  try {
    const result = await runDataQualityChecks(tenant.id);
    revalidateQualityPaths();
    redirect(`${dataQualityPath}?saved=scan&detected=${result.detected}&created=${result.createdOrReopened}&resolved=${result.autoResolved}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[data-quality] Scan failed", error);
    redirect(`${dataQualityPath}?error=scan`);
  }
}

export async function setDataQualityIssueStatusAction(formData: FormData) {
  const { tenant, userId } = await getActionContext();
  const issueId = readUuid(formData, "issueId");
  const requestedStatus = String(formData.get("status") ?? "");
  const status = requestedStatus === "ignored" ? "ignored" : requestedStatus === "resolved" ? "resolved" : null;

  if (!status) redirect(`${dataQualityPath}?error=status`);

  const now = new Date().toISOString();
  const admin = createAdminClient();
  const result = await admin
    .from("data_quality_issues")
    .update({
      status,
      ignored_at: status === "ignored" ? now : null,
      ignored_by_user_id: status === "ignored" ? userId : null,
      resolved_at: status === "resolved" ? now : null,
      resolved_by_user_id: status === "resolved" ? userId : null
    })
    .eq("tenant_id", tenant.id)
    .eq("id", issueId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (result.error || !result.data) redirect(`${dataQualityPath}?error=issue_state`);

  revalidateQualityPaths();
  redirect(`${dataQualityPath}?saved=${status}`);
}

export async function createDataQualityTaskAction(formData: FormData) {
  const { tenant, userId } = await getActionContext();
  const issueId = readUuid(formData, "issueId");
  const admin = createAdminClient();
  const issueResult = await admin
    .from("data_quality_issues")
    .select("id, entity_type, entity_id, severity, title, description, suggested_action, status, metadata_json")
    .eq("tenant_id", tenant.id)
    .eq("id", issueId)
    .maybeSingle();

  if (issueResult.error || !issueResult.data) redirect(`${dataQualityPath}?error=issue_missing`);
  const issue = issueResult.data as Pick<
    DataQualityIssueRow,
    "id" | "entity_type" | "entity_id" | "severity" | "title" | "description" | "suggested_action" | "status" | "metadata_json"
  >;
  const existingTask = await admin
    .from("tenant_tasks")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("data_quality_issue_id", issue.id)
    .in("status", ["open", "in_progress"])
    .limit(1)
    .maybeSingle();

  if (existingTask.error) redirect(`${dataQualityPath}?error=task_lookup`);
  if (existingTask.data) redirect(`${dataQualityPath}?saved=task_exists`);

  const participantId =
    issue.entity_type === "participant"
      ? issue.entity_id
      : typeof issue.metadata_json.participantId === "string"
        ? issue.metadata_json.participantId
        : null;
  const description = `${issue.description}\n\nAanbevolen vervolgstap: ${issue.suggested_action}\n\nBron: Data Quality Assistant (${issue.id}).`;
  const classification = classifyContent({ title: issue.title, description }, participantId ? "personal" : "operational");
  const taskResult = await admin.from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: userId,
    related_participant_id: participantId,
    data_quality_issue_id: issue.id,
    title: `Datakwaliteit: ${issue.title}`,
    description,
    content_classification: classification.classification,
    classification_reasons: classification.reasons,
    priority: issue.severity === "critical" ? "urgent" : issue.severity === "error" ? "high" : "normal",
    status: "open"
  });

  if (taskResult.error) redirect(`${dataQualityPath}?error=task`);

  revalidateQualityPaths();
  revalidatePath("/admin/taken");
  redirect(`${dataQualityPath}?saved=task`);
}

async function getActionContext() {
  const context = await requirePrivateShellContext(dataQualityPath);
  const tenant = getActiveTenant(context);
  const canManage = context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
  );
  if (!canManage) redirect(`${dataQualityPath}?error=forbidden`);
  return { tenant, userId: context.user.id };
}

function revalidateQualityPaths() {
  revalidatePath(dataQualityPath);
  revalidatePath("/admin");
}

function readUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    redirect(`${dataQualityPath}?error=identifier`);
  }
  return value;
}

function isRedirectError(error: unknown) {
  return !!error && typeof error === "object" && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}
