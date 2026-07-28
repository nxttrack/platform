import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type DashboardWidgetPreference = {
  key: string;
  position: number;
  visible: boolean;
  width: "small" | "medium" | "large" | "full";
};

export async function getDashboardWidgetPreferences(input: {
  dashboardKey: string;
  defaults: DashboardWidgetPreference[];
  tenantId: string | null;
  userId: string;
}) {
  const result = await createAdminClient().from("dashboard_widget_preferences")
    .select("widget_key, position, visible, width")
    .eq("dashboard_key", input.dashboardKey)
    .eq("user_id", input.userId)
    .is("tenant_id", input.tenantId);
  if (result.error || !result.data?.length) return input.defaults;
  const stored = new Map(result.data.map((row) => [row.widget_key, row]));
  return input.defaults.map((item) => {
    const value = stored.get(item.key);
    return value ? { key: item.key, position: value.position, visible: value.visible, width: value.width as DashboardWidgetPreference["width"] } : item;
  }).sort((left, right) => left.position - right.position);
}
