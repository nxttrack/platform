import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { getInstructorData } from "./instructor";

export type PortalMessageRow = {
  id: string;
  title: string;
  body: string;
  audience: string;
  visibility: string;
  status: string;
  published_at: string | null;
  created_at: string;
};

export type InstructorTaskRow = {
  id: string;
  assigned_to_user_id: string | null;
  related_participant_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getParentMessages(): Promise<PortalMessageRow[]> {
  const context = await requirePrivateShellContext("/portaal/berichten");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_messages")
    .select("id, title, body, audience, visibility, status, published_at, created_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .eq("visibility", "portal")
    .in("audience", ["parents", "all_tenant"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  assertCommunicationResult(error, "parent messages");

  return (data ?? []) as PortalMessageRow[];
}

export async function getInstructorMessages(): Promise<PortalMessageRow[]> {
  const context = await requirePrivateShellContext("/instructor/berichten");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_messages")
    .select("id, title, body, audience, visibility, status, published_at, created_at")
    .eq("tenant_id", tenant.id)
    .eq("status", "published")
    .in("audience", ["instructors", "all_tenant"])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  assertCommunicationResult(error, "instructor messages");

  return (data ?? []) as PortalMessageRow[];
}

export async function getInstructorTasks(): Promise<InstructorTaskRow[]> {
  const [context, instructorData] = await Promise.all([requirePrivateShellContext("/instructor/taken"), getInstructorData()]);
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_tasks")
    .select("id, assigned_to_user_id, related_participant_id, title, description, priority, status, due_on, completed_at, created_at, updated_at")
    .eq("tenant_id", tenant.id)
    .order("due_on", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  assertCommunicationResult(error, "instructor tasks");

  const tasks = (data ?? []) as InstructorTaskRow[];

  if (instructorData.canManageTenant) {
    return tasks;
  }

  const instructedParticipantIds = new Set(instructorData.participants.map((participant) => participant.id));

  return tasks.filter((task) => task.assigned_to_user_id === context.user.id || (task.related_participant_id ? instructedParticipantIds.has(task.related_participant_id) : false));
}

export function formatCommunicationDate(value: string | null) {
  if (!value) {
    return "Nog niet gepubliceerd";
  }

  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function messageAudienceLabel(audience: string) {
  if (audience === "parents") {
    return "ouders";
  }

  if (audience === "instructors") {
    return "instructeurs";
  }

  if (audience === "all_tenant") {
    return "iedereen";
  }

  return "team";
}

export function taskPriorityLabel(priority: string) {
  if (priority === "urgent") {
    return "urgent";
  }

  if (priority === "high") {
    return "hoog";
  }

  if (priority === "low") {
    return "laag";
  }

  return "normaal";
}

export function taskStatusLabel(status: string) {
  if (status === "in_progress") {
    return "bezig";
  }

  if (status === "done") {
    return "klaar";
  }

  if (status === "cancelled") {
    return "vervallen";
  }

  return "open";
}

function assertCommunicationResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
