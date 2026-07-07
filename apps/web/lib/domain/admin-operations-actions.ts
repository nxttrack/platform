"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildReportMetricsSnapshot, getAdminOperationsData } from "./admin-operations";
import { getActiveTenant } from "./core";

const messageAudiences = new Set(["tenant_staff", "instructors", "parents", "all_tenant"]);
const messageVisibilities = new Set(["internal", "portal"]);
const messageStatuses = new Set(["draft", "published", "archived"]);
const taskPriorities = new Set(["low", "normal", "high", "urgent"]);
const taskStatuses = new Set(["open", "in_progress", "done", "cancelled"]);
const documentAudiences = new Set(["tenant_staff", "instructors", "parents", "all_tenant"]);
const documentVisibilities = new Set(["internal", "portal"]);
const documentStatuses = new Set(["active", "archived"]);
const reportKeys = new Set(["operations", "intake", "billing", "progress", "custom"]);

export async function createAdminMessageAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const status = readEnum(formData, "status", messageStatuses, "draft");
  const messageResult = await admin
    .from("tenant_messages")
    .insert({
      tenant_id: tenant.id,
      author_user_id: user.id,
      title: readRequired(formData, "title"),
      body: readRequired(formData, "body"),
      audience: readEnum(formData, "audience", messageAudiences, "tenant_staff"),
      visibility: readEnum(formData, "visibility", messageVisibilities, "internal"),
      status,
      published_at: status === "published" ? new Date().toISOString() : null
    })
    .select("id, title, audience, visibility, status")
    .single();

  if (messageResult.error || !messageResult.data) {
    redirect("/admin/berichten?error=message");
  }

  if (messageResult.data.status === "published") {
    await notifyAudience({
      tenantId: tenant.id,
      audience: messageResult.data.audience,
      visibility: messageResult.data.visibility,
      type: "admin_message",
      title: "Nieuw bericht",
      message: messageResult.data.title
    });
  }

  redirectAfterWrite("/admin/berichten", "message");
}

export async function createAdminTaskAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const status = readEnum(formData, "status", taskStatuses, "open");
  const taskResult = await admin
    .from("tenant_tasks")
    .insert({
      tenant_id: tenant.id,
      created_by_user_id: user.id,
      assigned_to_user_id: readOptional(formData, "assignedToUserId"),
      related_participant_id: readOptional(formData, "relatedParticipantId"),
      title: readRequired(formData, "title"),
      description: readOptional(formData, "description"),
      priority: readEnum(formData, "priority", taskPriorities, "normal"),
      status,
      due_on: readOptional(formData, "dueOn"),
      completed_at: status === "done" ? new Date().toISOString() : null
    })
    .select("id, assigned_to_user_id, title")
    .single();

  if (taskResult.error || !taskResult.data) {
    redirect("/admin/taken?error=task");
  }

  if (taskResult.data.assigned_to_user_id) {
    await createNotifications({
      tenantId: tenant.id,
      recipientIds: [taskResult.data.assigned_to_user_id],
      type: "task_assigned",
      title: "Nieuwe taak",
      message: taskResult.data.title
    });
  }

  redirectAfterWrite("/admin/taken", "task");
}

export async function updateAdminTaskStatusAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const taskId = readRequired(formData, "taskId");
  const status = readEnum(formData, "status", taskStatuses, "open");
  const { error } = await admin
    .from("tenant_tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null
    })
    .eq("tenant_id", tenant.id)
    .eq("id", taskId);

  if (error) {
    redirect("/admin/taken?error=status");
  }

  redirectAfterWrite("/admin/taken", "status");
}

export async function createAdminDocumentAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const status = readEnum(formData, "status", documentStatuses, "active");
  const visibility = readEnum(formData, "visibility", documentVisibilities, "internal");
  const documentResult = await admin
    .from("tenant_documents")
    .insert({
      tenant_id: tenant.id,
      uploaded_by_user_id: user.id,
      title: readRequired(formData, "title"),
      description: readOptional(formData, "description"),
      audience: readEnum(formData, "audience", documentAudiences, "tenant_staff"),
      visibility,
      status,
      file_name: readOptional(formData, "fileName"),
      file_path: readOptional(formData, "filePath"),
      mime_type: readOptional(formData, "mimeType"),
      size_bytes: readInteger(formData, "sizeBytes")
    })
    .select("id, title, audience, visibility, status")
    .single();

  if (documentResult.error || !documentResult.data) {
    redirect("/admin/documenten?error=document");
  }

  if (documentResult.data.status === "active" && documentResult.data.visibility === "portal") {
    await notifyAudience({
      tenantId: tenant.id,
      audience: documentResult.data.audience,
      visibility: documentResult.data.visibility,
      type: "document_published",
      title: "Nieuw document",
      message: documentResult.data.title
    });
  }

  redirectAfterWrite("/admin/documenten", "document");
}

export async function createReportSnapshotAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const data = await getAdminOperationsData();
  const admin = createAdminClient();
  const reportKey = readEnum(formData, "reportKey", reportKeys, "operations");
  const snapshot = buildReportMetricsSnapshot(data, reportKey);
  const title = readOptional(formData, "title") ?? `${snapshot.key} snapshot`;
  const snapshotResult = await admin
    .from("tenant_report_snapshots")
    .insert({
      tenant_id: tenant.id,
      report_key: snapshot.key,
      title,
      period_start: readOptional(formData, "periodStart"),
      period_end: readOptional(formData, "periodEnd"),
      metrics: snapshot.metrics,
      generated_by_user_id: user.id,
      status: "active"
    })
    .select("id, title")
    .single();

  if (snapshotResult.error || !snapshotResult.data) {
    redirect("/admin/rapportages?error=report");
  }

  await createNotifications({
    tenantId: tenant.id,
    recipientIds: await getStaffRecipientIds(tenant.id),
    type: "report_ready",
    title: "Rapport snapshot klaar",
    message: snapshotResult.data.title
  });

  redirectAfterWrite("/admin/rapportages", "report");
}

async function getActionContext() {
  const context = await requirePrivateShellContext("/admin");

  return {
    tenant: getActiveTenant(context),
    user: context.user
  };
}

async function notifyAudience(input: {
  tenantId: string;
  audience: string;
  visibility: string;
  type: "admin_message" | "document_published";
  title: string;
  message: string;
}) {
  if (input.visibility !== "portal" && input.audience === "parents") {
    return;
  }

  const recipientIds = await getAudienceRecipientIds(input.tenantId, input.audience);

  await createNotifications({
    tenantId: input.tenantId,
    recipientIds,
    type: input.type,
    title: input.title,
    message: input.message
  });
}

async function getAudienceRecipientIds(tenantId: string, audience: string) {
  if (audience === "parents") {
    return getTenantMemberIds(tenantId, ["parent"]);
  }

  if (audience === "instructors") {
    return getTenantMemberIds(tenantId, ["instructor"]);
  }

  if (audience === "all_tenant") {
    return getTenantMemberIds(tenantId, ["tenant_owner", "tenant_admin", "tenant_staff", "instructor", "parent"]);
  }

  return getStaffRecipientIds(tenantId);
}

async function getStaffRecipientIds(tenantId: string) {
  return getTenantMemberIds(tenantId, ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"]);
}

async function getTenantMemberIds(tenantId: string, roles: string[]) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId).eq("status", "active").in("role", roles);

  if (error) {
    return [];
  }

  return unique(((data ?? []) as { user_id: string }[]).map((membership) => membership.user_id));
}

async function createNotifications(input: {
  tenantId: string;
  recipientIds: string[];
  type: "admin_message" | "task_assigned" | "document_published" | "report_ready";
  title: string;
  message: string;
}) {
  const recipientIds = unique(input.recipientIds);

  if (recipientIds.length === 0) {
    return;
  }

  const admin = createAdminClient();

  await admin.from("tenant_notifications").insert(
    recipientIds.map((recipientId) => ({
      tenant_id: input.tenantId,
      recipient_user_id: recipientId,
      type: input.type,
      title: input.title,
      message: input.message,
      status: "unread"
    }))
  );

  revalidatePath("/admin");
  revalidatePath("/portaal");
}

function redirectAfterWrite(path: string, saved: string): never {
  revalidatePath("/admin");
  revalidatePath(path);

  redirect(`${path}?saved=${encodeURIComponent(saved)}`);
}

function readEnum(formData: FormData, field: string, allowed: Set<string>, fallback: string) {
  const value = readOptional(formData, field) ?? fallback;

  return allowed.has(value) ? value : fallback;
}

function readRequired(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function readOptional(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function readInteger(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
