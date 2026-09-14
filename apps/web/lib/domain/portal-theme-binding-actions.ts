"use server";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { readThemeJson } from "@/lib/theme/theme-package-archive";

export type ThemeBindingActionState = { error?: string; saved?: string };
function value(form: FormData, key: string, limit = 100) {
  const text = form.get(key); if (typeof text !== "string" || !text.trim() || text.length > limit) throw new Error("Vul alle verplichte velden in"); return text.trim();
}
function id(form: FormData, key: string): string {
  const text = value(form, key, 36); if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(text)) throw new Error("Ongeldige koppeling"); return text;
}
export async function updatePortalThemeBindingAction(_: ThemeBindingActionState, form: FormData): Promise<ThemeBindingActionState> {
  const context = await requirePrivateShellContext("/platform/themes/bindings");
  try {
    if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) throw new Error("Platformbeheer vereist");
    if (process.env.MAINTENANCE_NO_WRITE === "true") throw new Error("Schrijven is tijdelijk uitgeschakeld wegens onderhoud");
    const actor = context.user.id, tenant = id(form, "tenantId"), reason = value(form, "reason", 1000), operation = value(form, "operation"), admin = createAdminClient();
    let result: { error: { code?: string; message: string } | null };
    if (operation === "management") {
      result = await admin.rpc("set_portal_theme_management_mode", { p_actor: actor, p_tenant: tenant, p_mode: value(form, "mode"), p_reason: reason });
    } else if (operation === "remove") {
      const bindingId = id(form, "bindingId");
      const bound = await admin.from("portal_theme_world_binding").select("id").eq("tenant_id", tenant).eq("id", bindingId).maybeSingle();
      if (bound.error || !bound.data) throw new Error("Koppeling hoort niet bij deze organisatie");
      result = await admin.rpc("remove_portal_theme_world_binding", { p_actor: actor, p_binding: bindingId, p_reason: reason });
    } else if (operation === "bind" || operation === "rollback") {
      const parts = value(form, "target", 110).split(":");
      if (parts.length !== 3 || parts.some((part) => !/^[a-f\d-]{36}$/i.test(part))) throw new Error("Kies een bestaande curriculumstage");
      const chosen = operation === "bind" ? value(form, "world", 240).match(/^([a-z0-9-]+)@([\d.]+)#([a-zA-Z0-9_.-]+)$/) : null;
      if (operation === "bind" && !chosen) throw new Error("Kies een gepubliceerde wereld");
      const artwork = operation === "bind" ? readThemeJson(Buffer.from(value(form, "artwork", 65000)), "criterion artwork") : {};
      result = await admin.rpc("bind_portal_theme_world", {
        p_actor: actor, p_tenant: tenant, p_program: parts[0], p_version: parts[1], p_stage: parts[2],
        p_theme: chosen?.[1] ?? "", p_release: chosen?.[2] ?? "", p_world: chosen?.[3] ?? "", p_artwork: artwork,
        p_expected_binding: form.get("expectedBinding") ? id(form, "expectedBinding") : null,
        p_rollback_binding: operation === "rollback" ? id(form, "previousBinding") : null, p_reason: reason
      });
    } else throw new Error("Onbekende beheerhandeling");
    if (result.error) throw new Error(result.error.code === "40001" ? "De koppeling is inmiddels gewijzigd. Laad de actuele koppeling voordat je verdergaat." : "Koppeling niet gewijzigd. Controleer de beheermodus, tenant, curriculumstage en gepubliceerde wereld.");
    revalidatePath("/platform/themes", "layout"); revalidatePath("/portaal", "layout"); revalidatePath("/kind", "layout"); revalidatePath("/admin/branding");
    return { saved: operation };
  } catch (error) { return { error: error instanceof Error ? error.message : "Koppeling niet opgeslagen" }; }
}
