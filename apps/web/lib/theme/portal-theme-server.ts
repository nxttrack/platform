import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import type { AssessmentRatingDisplay, PortalThemeManifestV2 } from "./portal-theme-contract";
import { defaultPortalTheme, getThemeRelease } from "./portal-theme-registry";

export type ResolvedPortalTheme = {
  manifest: PortalThemeManifestV2;
  source: "assignment" | "fallback";
  fallbackReason: "missing-assignment" | "unknown-release" | "incompatible-data" | null;
};

export async function resolveTenantPortalTheme(tenantId: string): Promise<ResolvedPortalTheme> {
  const result = await createAdminClient()
    .from("tenant_portal_theme_assignment")
    .select("theme_key, theme_release")
    .eq("tenant_id", tenantId)
    .is("deactivated_at", null)
    .maybeSingle();

  if (result.error || !result.data) {
    console.warn("[portal-theme] Default fallback used", { reason: result.error ? "incompatible-data" : "missing-assignment" });
    return { manifest: defaultPortalTheme, source: "fallback", fallbackReason: result.error ? "incompatible-data" : "missing-assignment" };
  }
  const manifest = getThemeRelease(result.data.theme_key, result.data.theme_release);
  if (!manifest) {
    console.warn("[portal-theme] Default fallback used", { reason: "unknown-release" });
    return { manifest: defaultPortalTheme, source: "fallback", fallbackReason: "unknown-release" };
  }
  return { manifest, source: "assignment", fallbackReason: null };
}

export async function getTenantAssessmentRatingDisplay(
  tenantId: string,
  fallback: AssessmentRatingDisplay = "smileys"
): Promise<AssessmentRatingDisplay> {
  const result = await createAdminClient()
    .from("tenant_settings")
    .select("assessment_rating_display")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const value = result.data?.assessment_rating_display;
  return value === "stars" || value === "smileys" ? value : fallback;
}
