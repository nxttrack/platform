"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { getInstructorData } from "./instructor";

const instructorTaskStatuses = new Set(["open", "in_progress", "done"]);

export async function markNotificationReadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const notificationId = readRequired(formData, "notificationId");
  const admin = createAdminClient();
  const { error } = await admin
    .from("tenant_notifications")
    .update({
      status: "read",
      read_at: new Date().toISOString()
    })
    .eq("tenant_id", tenant.id)
    .eq("id", notificationId)
    .eq("recipient_user_id", context.user.id);

  revalidateCommunicationPaths(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "notification");
  }

  redirectWithStatus(nextPath, "saved", "read");
}

export async function updateInstructorTaskStatusAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor/taken");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const taskId = readRequired(formData, "taskId");
  const status = readEnum(formData, "status", instructorTaskStatuses, "in_progress");
  const admin = createAdminClient();
  const taskResult = await admin
    .from("tenant_tasks")
    .select("id, assigned_to_user_id, related_participant_id")
    .eq("tenant_id", tenant.id)
    .eq("id", taskId)
    .maybeSingle();

  if (taskResult.error || !taskResult.data) {
    redirectWithStatus(nextPath, "error", "task");
  }

  const task = taskResult.data as { assigned_to_user_id: string | null; id: string; related_participant_id: string | null };
  const instructorData = await getInstructorData();
  const instructedParticipantIds = new Set(instructorData.participants.map((participant) => participant.id));
  const canUpdate =
    instructorData.canManageTenant ||
    task.assigned_to_user_id === context.user.id ||
    (task.related_participant_id ? instructedParticipantIds.has(task.related_participant_id) : false);

  if (!canUpdate) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const { error } = await admin
    .from("tenant_tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null
    })
    .eq("tenant_id", tenant.id)
    .eq("id", task.id);

  revalidateCommunicationPaths(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "task");
  }

  redirectWithStatus(nextPath, "saved", "task");
}

function revalidateCommunicationPaths(nextPath: `/${string}`) {
  revalidatePath("/portaal");
  revalidatePath("/portaal/berichten");
  revalidatePath("/instructor");
  revalidatePath("/instructor/berichten");
  revalidatePath("/instructor/taken");
  revalidatePath(nextPath);
}

function redirectWithStatus(path: `/${string}`, key: "saved" | "error", value: string): never {
  const separator = path.includes("?") ? "&" : "?";

  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
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
