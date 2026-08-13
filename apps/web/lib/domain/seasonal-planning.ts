import "server-only";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getSeasonalPlanningData() {
  const context = await requirePrivateShellContext("/admin/seizoenen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [seasons, blackouts, resources, sessions, groups, changes, proposals] = await Promise.all([
    admin.from("planning_seasons").select("id, name, starts_on, ends_on, status, created_at").eq("tenant_id", tenant.id).order("starts_on", { ascending: false }),
    admin.from("season_blackout_periods").select("id, season_id, resource_id, name, starts_at, ends_at, session_handling, financial_handling, credit_per_lesson_cents, impact_snapshot_json, status, reason, published_at").eq("tenant_id", tenant.id).order("starts_at"),
    admin.from("resources").select("id, name, status").eq("tenant_id", tenant.id).eq("status", "active").order("name"),
    admin.from("sessions").select("id, group_id, resource_id, starts_at, ends_at, status").eq("tenant_id", tenant.id).gte("starts_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).order("starts_at").limit(5000),
    admin.from("groups").select("id, default_resource_id").eq("tenant_id", tenant.id),
    admin.from("season_schedule_change_events").select("blackout_id, status").eq("tenant_id", tenant.id),
    admin.from("season_financial_adjustment_proposals").select("blackout_id, status, estimated_gross_cents, data_quality").eq("tenant_id", tenant.id)
  ]);
  for (const result of [seasons, blackouts, resources, sessions, groups, changes, proposals]) if (result.error) throw new Error(`Could not load seasonal planning: ${result.error.message}`);
  const groupResources = new Map((groups.data ?? []).map((row) => [row.id, row.default_resource_id]));
  const impactByBlackout = new Map<string, number>();
  for (const blackout of blackouts.data ?? []) {
    impactByBlackout.set(blackout.id, (sessions.data ?? []).filter((session) =>
      session.status === "scheduled"
      && new Date(session.starts_at) < new Date(blackout.ends_at)
      && new Date(session.ends_at) > new Date(blackout.starts_at)
      && (!blackout.resource_id || (session.resource_id ?? groupResources.get(session.group_id)) === blackout.resource_id)
    ).length);
  }
  const changesByBlackout = new Map<string, number>();
  for (const row of changes.data ?? []) if (row.status === "applied") changesByBlackout.set(row.blackout_id, (changesByBlackout.get(row.blackout_id) ?? 0) + 1);
  const proposalsByBlackout = new Map<string, { count: number; estimatedGrossCents: number; incomplete: number }>();
  for (const row of proposals.data ?? []) {
    const current = proposalsByBlackout.get(row.blackout_id) ?? { count: 0, estimatedGrossCents: 0, incomplete: 0 };
    current.count += row.status === "proposed" ? 1 : 0;
    current.estimatedGrossCents += row.estimated_gross_cents ?? 0;
    current.incomplete += row.data_quality === "complete" ? 0 : 1;
    proposalsByBlackout.set(row.blackout_id, current);
  }
  const draftPreviews = await Promise.all((blackouts.data ?? []).map(async (row) => {
    if (row.status !== "draft") return [row.id, null] as const;
    const result = await admin.rpc("preview_season_blackout", {
      actor_user_id: context.user.id,
      target_blackout_id: row.id,
      target_tenant_id: tenant.id
    });
    if (result.error) throw new Error(`Could not preview seasonal impact: ${result.error.message}`);
    return [row.id, asRecord(result.data)] as const;
  }));
  const previewByBlackout = new Map(draftPreviews);
  return {
    tenant,
    seasons: seasons.data ?? [],
    blackouts: (blackouts.data ?? []).map((row) => ({
      ...row,
      appliedChanges: changesByBlackout.get(row.id) ?? 0,
      financialProposals: proposalsByBlackout.get(row.id) ?? { count: 0, estimatedGrossCents: 0, incomplete: 0 },
      impact: impactByBlackout.get(row.id) ?? 0,
      impactPreview: previewByBlackout.get(row.id) ?? asRecord(row.impact_snapshot_json)
    })),
    resources: resources.data ?? []
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
