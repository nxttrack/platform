"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
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

export async function setPortalThemeLicenseAction(formData: FormData) {
  const context = await requireThemeManager();
  const tenantId = uuid(formData, "tenantId");
  const status = required(formData, "licenseStatus", 16);
  if (status !== "verified" && status !== "revoked") {
    redirect("/platform/themes?error=license_status");
  }
  const evidenceReference = optional(formData, "evidenceReference", 500);
  if (status === "verified" && !evidenceReference) {
    redirect("/platform/themes?error=license_evidence");
  }
  const result = await createAdminClient().rpc("set_tenant_portal_theme_license", {
    target_actor_user_id: context.user.id,
    target_evidence_reference: evidenceReference ?? "",
    target_reason: status === "verified"
      ? "Naamlicentie door platformbeheer geverifieerd"
      : required(formData, "reason", 1000),
    target_status: status,
    target_tenant_id: tenantId
  });
  finish(result.error, "license");
}

export async function setPortalThemeAvailabilityAction(formData: FormData) {
  const context = await requireThemeManager();
  const tenantId = uuid(formData, "tenantId");
  const [themeKey, themeRelease] = release(formData);
  const availability = required(formData, "availability", 16);
  if (availability !== "enabled" && availability !== "disabled") {
    redirect("/platform/themes?error=availability");
  }
  const reason = required(formData, "reason", 1000);
  const result = await createAdminClient().rpc("set_tenant_portal_theme_availability", {
    target_actor_user_id: context.user.id,
    target_is_enabled: availability === "enabled",
    target_reason: reason,
    target_tenant_id: tenantId,
    target_theme_key: themeKey,
    target_theme_release: themeRelease
  });
  finish(result.error, "availability");
}

export async function selectTenantPortalThemeAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/branding");
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect("/admin?error=forbidden");
  }
  const tenant = getActiveTenant(context);
  const [themeKey, themeRelease] = release(formData);
  const result = await createAdminClient().rpc("select_available_tenant_portal_theme", {
    target_actor_user_id: context.user.id,
    target_reason: required(formData, "reason", 1000),
    target_tenant_id: tenant.id,
    target_theme_key: themeKey,
    target_theme_release: themeRelease
  });
  if (result.error) redirect("/admin/branding?error=theme");
  revalidatePath("/admin/branding");
  revalidatePath("/portaal");
  redirect("/admin/branding?saved=theme");
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
