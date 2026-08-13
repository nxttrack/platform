"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export async function configureChildPortalRolloutAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/instellingen");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect("/admin/instellingen?error=child_portal_permission");
  }
  const status = String(formData.get("childPortalStatus") ?? "disabled");
  const ttlMinutes = Number(formData.get("childPortalTtlMinutes"));
  if (!["disabled", "paused", "pilot", "enabled"].includes(status) || !Number.isInteger(ttlMinutes)) {
    redirect("/admin/instellingen?error=child_portal_config");
  }
  const result = await createAdminClient().rpc("configure_child_portal_rollout_for_service", {
    p_absolute_ttl_minutes: ttlMinutes,
    p_actor_user_id: context.user.id,
    p_security_reviewed: formData.get("childPortalSecurityReviewed") === "on",
    p_status: status,
    p_tenant_id: tenant.id,
    p_visual_matrix_reviewed: formData.get("childPortalVisualReviewed") === "on"
  });
  if (result.error) {
    const reason = result.error.code === "23514" ? "child_portal_readiness" : "child_portal_config";
    redirect(`/admin/instellingen?error=${reason}`);
  }
  revalidatePath("/admin/instellingen");
  revalidatePath("/portaal/kinderen");
  redirect("/admin/instellingen?saved=child_portal");
}
