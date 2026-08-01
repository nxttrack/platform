import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { portalThemeCatalog } from "@/lib/theme/portal-theme-registry";

export type ThemeAssignmentRow = {
  id: string;
  tenant_id: string;
  theme_key: string;
  theme_release: string;
  activated_at: string;
  previous_assignment_id: string | null;
  reason: string;
};

export type ThemeScheduleRow = {
  id: string;
  tenant_id: string;
  theme_key: string;
  theme_release: string;
  scheduled_for: string;
  status: string;
  reason: string;
};

export async function getPortalThemeControlCenterData() {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    return { authorized: false as const, assignments: [], auditEvents: [], catalog: portalThemeCatalog, schedules: [], tenants: [] };
  }
  const admin = createAdminClient();
  const [tenants, assignments, schedules, auditEvents] = await Promise.all([
    admin.from("tenants").select("id, name, slug, status").order("name"),
    admin.from("tenant_portal_theme_assignment").select("id, tenant_id, theme_key, theme_release, activated_at, previous_assignment_id, reason").is("deactivated_at", null),
    admin.from("tenant_portal_theme_schedule").select("id, tenant_id, theme_key, theme_release, scheduled_for, status, reason").eq("status", "scheduled"),
    admin.from("portal_theme_audit_event").select("id, tenant_id, actor_user_id, event_type, previous_theme_key, previous_theme_release, next_theme_key, next_theme_release, reason, ticket_reference, created_at").order("created_at", { ascending: false }).limit(80)
  ]);
  for (const [label, result] of [["tenants", tenants], ["assignments", assignments], ["schedules", schedules], ["audit", auditEvents]] as const) {
    if (result.error) throw new Error(`Could not load portal theme ${label}: ${result.error.message}`);
  }
  return {
    authorized: true as const,
    catalog: portalThemeCatalog,
    tenants: (tenants.data ?? []) as Array<{ id: string; name: string; slug: string; status: string }>,
    assignments: (assignments.data ?? []) as ThemeAssignmentRow[],
    schedules: (schedules.data ?? []) as ThemeScheduleRow[],
    auditEvents: (auditEvents.data ?? []) as Array<{
      id: string;
      tenant_id: string | null;
      event_type: string;
      previous_theme_key: string | null;
      previous_theme_release: string | null;
      next_theme_key: string | null;
      next_theme_release: string | null;
      reason: string;
      ticket_reference: string | null;
      created_at: string;
    }>
  };
}
