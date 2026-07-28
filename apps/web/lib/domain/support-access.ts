import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { getPlatformHealthDashboard } from "@/lib/domain/platform-health";
import { createAdminClient } from "@/lib/supabase/admin";

export type SupportAccessGrant = {
  id: string;
  tenant_id: string;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  reason: string;
  scope: "diagnostics_read_only";
  status: "requested" | "active" | "denied" | "revoked" | "expired";
  duration_minutes: number;
  requested_at: string;
  approved_at: string | null;
  active_until: string | null;
  revoked_at: string | null;
};

export async function getPlatformSupportAccessData() {
  const context = await requirePrivateShellContext("/platform/support");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin" || role === "platform_support")) return { grants: [], tenants: [] };
  const admin = createAdminClient();
  const [grants, tenants] = await Promise.all([
    admin.from("platform_support_access_grants").select("id, tenant_id, requested_by_user_id, approved_by_user_id, reason, scope, status, duration_minutes, requested_at, approved_at, active_until, revoked_at").order("requested_at", { ascending: false }).limit(250),
    admin.from("tenants").select("id, name, slug, status").order("name")
  ]);
  if (grants.error || tenants.error) throw new Error("Could not load support access.");
  const normalized = await expireElapsedGrants((grants.data ?? []) as SupportAccessGrant[]);
  const people = await loadPeople(normalized.flatMap((row) => [row.requested_by_user_id, row.approved_by_user_id].filter(Boolean) as string[]));
  return { grants: normalized, tenants: tenants.data ?? [], currentUserId: context.user.id, people };
}

export async function getTenantSupportAccessData() {
  const context = await requirePrivateShellContext("/admin/support");
  const tenant = getActiveTenant(context);
  const result = await createAdminClient().from("platform_support_access_grants").select("id, tenant_id, requested_by_user_id, approved_by_user_id, reason, scope, status, duration_minutes, requested_at, approved_at, active_until, revoked_at").eq("tenant_id", tenant.id).order("requested_at", { ascending: false }).limit(100);
  if (result.error) throw new Error("Could not load tenant support access.");
  const grants = await expireElapsedGrants((result.data ?? []) as SupportAccessGrant[]);
  const people = await loadPeople(grants.flatMap((row) => [row.requested_by_user_id, row.approved_by_user_id].filter(Boolean) as string[]));
  return { grants, tenant, people };
}

async function loadPeople(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return {} as Record<string, string>;
  const result = await createAdminClient().from("profiles").select("id, full_name, email").in("id", unique);
  return Object.fromEntries((result.data ?? []).map((row) => [row.id, row.full_name || row.email || "Onbekende gebruiker"]));
}

export async function getAuthorizedSupportDiagnostic(tenantId: string) {
  const context = await requirePrivateShellContext(`/platform/support/${tenantId}`);
  const admin = createAdminClient();
  const grant = await admin.from("platform_support_access_grants")
    .select("id, reason, active_until, approved_at")
    .eq("tenant_id", tenantId)
    .eq("requested_by_user_id", context.user.id)
    .eq("status", "active")
    .gt("active_until", new Date().toISOString())
    .order("active_until", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (grant.error || !grant.data) return null;
  const dashboard = await getPlatformHealthDashboard();
  const tenant = dashboard.tenants.find((row) => row.id === tenantId);
  if (!tenant) return null;
  return { grant: grant.data, tenant, heartbeats: dashboard.heartbeats, incidents: dashboard.incidents.filter((row) => !row.tenant_id || row.tenant_id === tenantId) };
}

async function expireElapsedGrants(grants: SupportAccessGrant[]) {
  const elapsed = grants.filter((grant) => grant.status === "active" && grant.active_until && new Date(grant.active_until).getTime() <= Date.now());
  if (elapsed.length) {
    await createAdminClient().from("platform_support_access_grants").update({ status: "expired" }).in("id", elapsed.map((row) => row.id)).eq("status", "active");
  }
  return grants.map((grant) => elapsed.some((row) => row.id === grant.id) ? { ...grant, status: "expired" as const } : grant);
}
