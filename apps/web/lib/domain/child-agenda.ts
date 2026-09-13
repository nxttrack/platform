import type { SupabaseClient } from "@supabase/supabase-js";

export function loadChildAgendaSessions(admin: SupabaseClient, tenantId: string, groupIds: string[], now = new Date()) {
  if (!groupIds.length) return Promise.resolve({ data: [], error: null });
  return admin.from("sessions")
    .select("id, group_id, resource_id, starts_at, ends_at, status")
    .eq("tenant_id", tenantId)
    .in("group_id", groupIds)
    .eq("status", "scheduled")
    .gte("ends_at", now.toISOString())
    .order("starts_at")
    .limit(24);
}
