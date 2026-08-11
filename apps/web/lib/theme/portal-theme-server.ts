import "server-only";

import { cache } from "react";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

import type { AssessmentRatingDisplay, PortalThemeManifestV2 } from "./portal-theme-contract";
import { defaultPortalTheme, getThemeRelease } from "./portal-theme-registry";
import { getThemeDisplayName } from "./portal-theme-registry";

export type ResolvedPortalTheme = {
  manifest: PortalThemeManifestV2;
  source: "assignment" | "fallback";
  fallbackReason: "missing-assignment" | "unknown-release" | "incompatible-data" | null;
  displayName: string;
  verifiedLicense: boolean;
};

export const resolveTenantPortalTheme = cache(async (tenantId: string): Promise<ResolvedPortalTheme> => {
  const result = await createAdminClient()
    .from("tenant_portal_theme_assignment")
    .select("theme_key, theme_release")
    .eq("tenant_id", tenantId)
    .is("deactivated_at", null)
    .maybeSingle();

  if (result.error || !result.data) {
    console.warn("[portal-theme] Default fallback used", { reason: result.error ? "incompatible-data" : "missing-assignment" });
    return {
      manifest: defaultPortalTheme,
      source: "fallback",
      fallbackReason: result.error ? "incompatible-data" : "missing-assignment",
      displayName: getThemeDisplayName(defaultPortalTheme),
      verifiedLicense: false
    };
  }
  const manifest = getThemeRelease(result.data.theme_key, result.data.theme_release);
  if (!manifest) {
    console.warn("[portal-theme] Default fallback used", { reason: "unknown-release" });
    return {
      manifest: defaultPortalTheme,
      source: "fallback",
      fallbackReason: "unknown-release",
      displayName: getThemeDisplayName(defaultPortalTheme),
      verifiedLicense: false
    };
  }
  const verifiedLicense = await hasVerifiedThemeLicense(tenantId, manifest);
  return {
    manifest,
    source: "assignment",
    fallbackReason: null,
    displayName: getThemeDisplayName(manifest, verifiedLicense),
    verifiedLicense
  };
});

export async function resolveCurrentParentPortalTheme(returnPath: `/portaal${string}` | "/portaal") {
  const context = await requirePrivateShellContext(returnPath);
  const tenantId = context.activeTenant?.tenantId;
  if (!tenantId) throw new Error("Active tenant is required for the parent portal theme");
  return resolveTenantPortalTheme(tenantId);
}

async function hasVerifiedThemeLicense(tenantId: string, manifest: PortalThemeManifestV2) {
  if (!manifest.experience.requiresVerifiedLicenseForDisplayName) return false;
  const result = await createAdminClient()
    .from("tenant_portal_theme_license")
    .select("status, expires_at")
    .eq("tenant_id", tenantId)
    .eq("theme_key", manifest.theme.key)
    .maybeSingle();
  if (result.error || result.data?.status !== "verified") return false;
  return !result.data.expires_at || new Date(result.data.expires_at).getTime() > Date.now();
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
