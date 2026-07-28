"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

const path = "/platform";

export async function createPlatformIncidentAction(formData: FormData) {
  const context = await requirePlatformManager();
  const tenantId = optionalUuid(formData, "tenantId");
  const title = required(formData, "title", 160);
  const summary = required(formData, "summary", 2000);
  const severity = enumValue(formData, "severity", ["info", "warning", "critical"] as const, "warning");
  const admin = createAdminClient();
  const result = await admin.from("platform_incidents").insert({
    tenant_id: tenantId,
    title,
    summary,
    severity,
    status: "open",
    source: "manual",
    created_by_user_id: context.user.id
  }).select("id").single();
  if (result.error) redirect(`${path}?error=incident`);
  await admin.from("platform_admin_audit_events").insert({
    tenant_id: tenantId,
    actor_user_id: context.user.id,
    event_type: "platform.incident_created",
    subject_type: "platform_incident",
    subject_id: result.data.id,
    before_state: {},
    after_state: { severity, status: "open", title }
  });
  revalidatePath(path);
  redirect(`${path}?saved=incident`);
}

export async function resolvePlatformIncidentAction(formData: FormData) {
  const context = await requirePlatformManager();
  if (formData.get("humanConfirmation") !== "resolve") redirect(`${path}?error=confirmation`);
  const incidentId = uuid(formData, "incidentId");
  const admin = createAdminClient();
  const existing = await admin.from("platform_incidents").select("id, tenant_id, status, severity, title").eq("id", incidentId).maybeSingle();
  if (existing.error || !existing.data || existing.data.status === "resolved") redirect(`${path}?error=incident`);
  const result = await admin.from("platform_incidents").update({
    status: "resolved",
    resolved_by_user_id: context.user.id,
    resolved_at: new Date().toISOString()
  }).eq("id", incidentId).neq("status", "resolved");
  if (result.error) redirect(`${path}?error=incident`);
  await admin.from("platform_admin_audit_events").insert({
    tenant_id: existing.data.tenant_id,
    actor_user_id: context.user.id,
    event_type: "platform.incident_resolved",
    subject_type: "platform_incident",
    subject_id: incidentId,
    before_state: { status: existing.data.status, severity: existing.data.severity, title: existing.data.title },
    after_state: { status: "resolved" }
  });
  revalidatePath(path);
  redirect(`${path}?saved=resolved`);
}

async function requirePlatformManager() {
  const context = await requirePrivateShellContext(path);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) redirect(`${path}?error=forbidden`);
  return context;
}

function required(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim().slice(0, maxLength);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function uuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function optionalUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  return value ? uuid(formData, name) : null;
}

function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[], fallback: T): T {
  const value = String(formData.get(name) ?? "");
  return values.includes(value as T) ? value as T : fallback;
}
