import "server-only";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { buildTenantGrowthReport } from "@/lib/analytics/growth-cohorts";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export async function getGrowthAnalyticsData(from?: string, to?: string) {
  const context = await requirePrivateShellContext("/admin/rapportages/groei");
  const tenant = getActiveTenant(context);
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 364 * 86_400_000).toISOString().slice(0, 10);
  const period = { from: validDate(from) ?? yearAgo, to: validDate(to) ?? today };
  const [report, drafts] = await Promise.all([
    buildTenantGrowthReport(tenant.id, period.from, period.to),
    createAdminClient().from("management_summary_drafts").select("id, period_start, period_end, status, title, narrative, metrics_json, evidence_json, created_at, approved_at").eq("tenant_id", tenant.id).order("period_end", { ascending: false }).limit(20)
  ]);
  if (drafts.error) throw new Error(`Could not load management summaries: ${drafts.error.message}`);
  return { tenant, period, report, drafts: drafts.data ?? [] };
}
function validDate(value?: string) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null; }
