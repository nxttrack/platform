import { toAmsterdamDate } from "../date/business-date";
import "server-only";
import { buildTenantGrowthReport } from "@/lib/analytics/growth-cohorts";
import { createAdminClient } from "@/lib/supabase/admin";

export async function generateManagementSummaryDraft(input: { tenantId: string; userId?: string | null; range?: { start: string; end: string } }) {
  const range = input.range ?? previousWeekRange();
  const report = await buildTenantGrowthReport(input.tenantId, range.start, range.end);
  const narrative = createNarrative(report);
  const result = await createAdminClient().from("management_summary_drafts").upsert({
    tenant_id: input.tenantId,
    period_start: range.start,
    period_end: range.end,
    status: "draft",
    title: `Managementsamenvatting · ${formatDate(range.start)} – ${formatDate(range.end)}`,
    narrative,
    metrics_json: report.metrics,
    evidence_json: report.evidence,
    generation_method: "rule_based",
    generated_by_user_id: input.userId ?? null,
    approved_by_user_id: null,
    approved_at: null
  }, { onConflict: "tenant_id,period_start,period_end" }).select("id").single();
  if (result.error) throw new Error(`Could not generate management summary: ${result.error.message}`);
  return result.data.id;
}

export function createNarrative(report: Awaited<ReturnType<typeof buildTenantGrowthReport>>) {
  const topCampaign = report.byCampaign.find((row) => row.intakes > 0);
  const topProgram = [...report.byProgram].filter((row) => row.label !== "Nog niet geplaatst").sort((a, b) => b.placements - a.placements)[0];
  return [
    `De huidige cohortanalyse bevat ${report.metrics.intakes} intakeverzoeken; ${report.metrics.placements} zijn relationeel bewezen geplaatst (${report.metrics.placementConversion}%).`,
    report.metrics.medianDaysToPlace === null ? "Er is nog onvoldoende plaatsingsdata voor een betrouwbare mediane doorlooptijd." : `De mediane tijd van intake tot plaatsing is ${report.metrics.medianDaysToPlace} dagen.`,
    topCampaign ? `${topCampaign.label} is de grootste herleidbare instroombron met ${topCampaign.intakes} intakes en ${topCampaign.conversion}% plaatsingsconversie.` : "Er is nog geen herleidbare campagne-instroom.",
    topProgram ? `${topProgram.label} realiseert in deze cohortselectie de meeste plaatsingen (${topProgram.placements}).` : "Er is nog onvoldoende programmalineage.",
    report.metrics.medianDaysToDiploma === null ? "De diplomasnelheid is nog niet betrouwbaar te berekenen." : `De mediane tijd van intake tot eerste uitgegeven diploma is ${report.metrics.medianDaysToDiploma} dagen.`,
    "Dit is een rule-based concept op aggregaatniveau. Controleer context en brondata vóór intern gebruik; er wordt niets automatisch verstuurd."
  ].join("\n\n");
}

export function previousWeekRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = end.getUTCDay() || 7;
  end.setUTCDate(end.getUTCDate() - weekday);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { start: toAmsterdamDate(start), end: toAmsterdamDate(end) };
}
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)); }
