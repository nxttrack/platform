"use server";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedPlatformWidgets = new Set(["organizations", "average_health", "healthy", "watch", "risk", "incidents"]);

export async function savePlatformDashboardWidgetsAction(input: Array<{ key: string; position: number; visible: boolean }>) {
  const context = await requirePrivateShellContext("/platform");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin" || role === "platform_support")) return { ok: false, error: "Geen toegang." } as const;
  if (!Array.isArray(input) || input.length !== allowedPlatformWidgets.size) return { ok: false, error: "Ongeldige dashboardindeling." } as const;
  const unique = new Set(input.map((row) => row.key));
  if (unique.size !== allowedPlatformWidgets.size || input.some((row) => !allowedPlatformWidgets.has(row.key))) return { ok: false, error: "Onbekende widget." } as const;
  const admin = createAdminClient();
  const result = await admin.from("dashboard_widget_preferences").upsert(input.map((row, index) => ({
    tenant_id: null,
    user_id: context.user.id,
    dashboard_key: "platform_command_center",
    widget_key: row.key,
    position: index,
    visible: Boolean(row.visible),
    width: "small",
    settings_json: {}
  })), { onConflict: "tenant_id,user_id,dashboard_key,widget_key" });
  return result.error ? { ok: false, error: "Opslaan is niet gelukt." } as const : { ok: true } as const;
}
