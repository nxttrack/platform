"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function requestSupportAccessAction(formData: FormData) {
  const context = await requirePrivateShellContext("/platform/support");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin" || role === "platform_support")) redirect("/platform/support?error=forbidden");
  const tenantId = uuid(formData, "tenantId");
  const reason = required(formData, "reason", 1000);
  const duration = numberValue(formData, "duration", 15, 120);
  const admin = createAdminClient();
  const tenant = await admin.from("tenants").select("id").eq("id", tenantId).eq("status", "active").maybeSingle();
  if (tenant.error || !tenant.data) redirect("/platform/support?error=tenant");
  const result = await admin.from("platform_support_access_grants").insert({
    tenant_id: tenantId,
    requested_by_user_id: context.user.id,
    reason,
    scope: "diagnostics_read_only",
    duration_minutes: duration,
    status: "requested"
  }).select("id").single();
  if (result.error) redirect("/platform/support?error=request");
  await audit(admin, { actor: context.user.id, event: "platform.support_access_requested", subjectId: result.data.id, tenantId, after: { duration, scope: "diagnostics_read_only", status: "requested" } });
  revalidatePath("/platform/support"); revalidatePath("/admin/support");
  redirect("/platform/support?saved=requested");
}

export async function decideSupportAccessAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/support");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin/support?error=forbidden");
  const grantId = uuid(formData, "grantId");
  const decision = enumValue(formData, "decision", ["approve", "deny"] as const);
  if (formData.get("humanConfirmation") !== decision) redirect("/admin/support?error=confirmation");
  const admin = createAdminClient();
  const grant = await admin.from("platform_support_access_grants").select("id, status, duration_minutes, requested_by_user_id").eq("tenant_id", tenant.id).eq("id", grantId).eq("status", "requested").maybeSingle();
  if (grant.error || !grant.data) redirect("/admin/support?error=grant");
  const now = new Date();
  const activeUntil = new Date(now.getTime() + grant.data.duration_minutes * 60_000);
  const update = decision === "approve"
    ? { status: "active", approved_by_user_id: context.user.id, approved_at: now.toISOString(), active_until: activeUntil.toISOString() }
    : { status: "denied", approved_by_user_id: context.user.id, approved_at: now.toISOString() };
  const result = await admin.from("platform_support_access_grants").update(update).eq("tenant_id", tenant.id).eq("id", grantId).eq("status", "requested");
  if (result.error) redirect("/admin/support?error=save");
  await audit(admin, { actor: context.user.id, event: decision === "approve" ? "platform.support_access_approved" : "platform.support_access_denied", subjectId: grantId, tenantId: tenant.id, after: update });
  revalidatePath("/admin/support"); revalidatePath("/platform/support");
  redirect(`/admin/support?saved=${decision === "approve" ? "approved" : "denied"}`);
}

export async function revokeSupportAccessAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/support");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin/support?error=forbidden");
  if (formData.get("humanConfirmation") !== "revoke") redirect("/admin/support?error=confirmation");
  const grantId = uuid(formData, "grantId");
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const result = await admin.from("platform_support_access_grants").update({ status: "revoked", revoked_by_user_id: context.user.id, revoked_at: now }).eq("tenant_id", tenant.id).eq("id", grantId).eq("status", "active");
  if (result.error) redirect("/admin/support?error=save");
  await audit(admin, { actor: context.user.id, event: "platform.support_access_revoked", subjectId: grantId, tenantId: tenant.id, after: { status: "revoked", revokedAt: now } });
  revalidatePath("/admin/support"); revalidatePath("/platform/support");
  redirect("/admin/support?saved=revoked");
}

async function audit(admin: ReturnType<typeof createAdminClient>, input: { actor: string; event: string; subjectId: string; tenantId: string; after: Record<string, unknown> }) {
  await admin.from("platform_admin_audit_events").insert({ tenant_id: input.tenantId, actor_user_id: input.actor, event_type: input.event, subject_type: "support_access", subject_id: input.subjectId, before_state: {}, after_state: input.after });
}
function required(formData: FormData, name: string, max: number) { const value = String(formData.get(name) ?? "").trim().slice(0, max); if (!value || value.length < 10) throw new Error(`${name} is required`); return value; }
function uuid(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} is invalid`); return value; }
function numberValue(formData: FormData, name: string, min: number, max: number) { const value = Number.parseInt(String(formData.get(name) ?? ""), 10); return Number.isInteger(value) && value >= min && value <= max ? value : 60; }
function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[]) { const value = String(formData.get(name) ?? ""); if (!values.includes(value as T)) throw new Error(`${name} is invalid`); return value as T; }
