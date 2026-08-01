"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThemeRelease } from "@/lib/theme/portal-theme-registry";

export async function activatePortalThemeAction(formData: FormData) {
  const context = await requireThemeManager();
  const tenantId = uuid(formData, "tenantId");
  const [themeKey, themeRelease] = release(formData);
  const result = await createAdminClient().rpc("activate_tenant_portal_theme", {
    target_actor_user_id: context.user.id,
    target_event_type: "activated",
    target_reason: required(formData, "reason", 1000),
    target_request_correlation_id: crypto.randomUUID(),
    target_tenant_id: tenantId,
    target_theme_key: themeKey,
    target_theme_release: themeRelease,
    target_ticket_reference: optional(formData, "ticketReference", 160)
  });
  finish(result.error, "activation");
}

export async function schedulePortalThemeAction(formData: FormData) {
  const context = await requireThemeManager();
  const tenantId = uuid(formData, "tenantId");
  const [themeKey, themeRelease] = release(formData);
  const scheduledFor = new Date(required(formData, "scheduledFor", 80));
  if (!Number.isFinite(scheduledFor.getTime()) || scheduledFor <= new Date()) redirect("/platform/themes?error=schedule");
  const result = await createAdminClient().rpc("schedule_tenant_portal_theme", {
    target_actor_user_id: context.user.id,
    target_reason: required(formData, "reason", 1000),
    target_scheduled_for: scheduledFor.toISOString(),
    target_tenant_id: tenantId,
    target_theme_key: themeKey,
    target_theme_release: themeRelease,
    target_ticket_reference: optional(formData, "ticketReference", 160)
  });
  finish(result.error, "schedule");
}

export async function rollbackPortalThemeAction(formData: FormData) {
  const context = await requireThemeManager();
  const tenantId = uuid(formData, "tenantId");
  const admin = createAdminClient();
  const current = await admin
    .from("tenant_portal_theme_assignment")
    .select("previous_assignment_id")
    .eq("tenant_id", tenantId)
    .is("deactivated_at", null)
    .maybeSingle();
  if (current.error || !current.data?.previous_assignment_id) redirect("/platform/themes?error=no_rollback");
  const previous = await admin
    .from("tenant_portal_theme_assignment")
    .select("theme_key, theme_release")
    .eq("id", current.data.previous_assignment_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (previous.error || !previous.data || !getThemeRelease(previous.data.theme_key, previous.data.theme_release)) {
    redirect("/platform/themes?error=no_rollback");
  }
  const result = await admin.rpc("activate_tenant_portal_theme", {
    target_actor_user_id: context.user.id,
    target_event_type: "rolled_back",
    target_reason: required(formData, "reason", 1000),
    target_request_correlation_id: crypto.randomUUID(),
    target_tenant_id: tenantId,
    target_theme_key: previous.data.theme_key,
    target_theme_release: previous.data.theme_release,
    target_ticket_reference: optional(formData, "ticketReference", 160)
  });
  finish(result.error, "rollback");
}

async function requireThemeManager() {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirect("/platform?error=forbidden");
  }
  return context;
}

function release(formData: FormData): [string, string] {
  const value = required(formData, "themeRelease", 120);
  const separator = value.lastIndexOf("@");
  const themeKey = value.slice(0, separator);
  const themeRelease = value.slice(separator + 1);
  if (!getThemeRelease(themeKey, themeRelease)) redirect("/platform/themes?error=release");
  return [themeKey, themeRelease];
}

function uuid(formData: FormData, field: string) {
  const value = required(formData, field, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    redirect("/platform/themes?error=tenant");
  }
  return value;
}

function required(formData: FormData, field: string, maxLength: number) {
  const value = optional(formData, field, maxLength);
  if (!value) redirect("/platform/themes?error=validation");
  return value;
}

function optional(formData: FormData, field: string, maxLength: number) {
  const value = formData.get(field);
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function finish(error: { message: string } | null, operation: string): never {
  if (error) redirect(`/platform/themes?error=${operation}`);
  revalidatePath("/platform/themes");
  revalidatePath("/portaal");
  redirect(`/platform/themes?saved=${operation}`);
}
