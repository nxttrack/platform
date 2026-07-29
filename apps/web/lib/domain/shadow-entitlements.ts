import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateShadowEntitlement,
  summarizeShadowLimits,
  type ShadowEntitlementEvaluation,
  type ShadowEvaluationStatus
} from "./shadow-entitlements-contract";

export const shadowLimitDefinitions = [
  { key: "active_participants", label: "Actieve leerlingen", unit: "count" as const },
  { key: "active_staff", label: "Actieve medewerkers", unit: "count" as const },
  { key: "locations", label: "Locaties", unit: "count" as const },
  { key: "private_storage_gb", label: "Gevolgde opslag", unit: "gigabytes" as const }
] as const;

type PackageRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  status: string;
  is_legacy_full_access: boolean;
  created_at: string;
};

type FeatureRow = {
  key: string;
  name: string;
  description: string;
  category: string;
  status: string;
};

export type ShadowPackageTenantRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  packageId: string;
  packageName: string;
  activeParticipants: number;
  activeStaff: number;
  locations: number;
  storageGb: number;
  featureIncludedCount: number;
  featureTotalCount: number;
  evaluationStatus: ShadowEvaluationStatus;
  evaluations: Array<{
    key: string;
    label: string;
    value: number;
    limit: number;
    unit: "count" | "gigabytes";
    evaluation: ShadowEntitlementEvaluation;
  }>;
};

export async function getShadowPackageControlCenter() {
  const context = await requirePrivateShellContext("/platform/packages");
  const admin = createAdminClient();
  const [
    releaseFlagsResult,
    featuresResult,
    packagesResult,
    entitlementsResult,
    limitsResult,
    assignmentsResult,
    tenantsResult,
    participantsResult,
    membershipsResult,
    resourcesResult,
    documentsResult,
    participantMediaResult,
    siteMediaResult
  ] = await Promise.all([
    admin.from("platform_release_flags").select("key, name, description, category, rollout_state, owner_team, updated_at").order("category").order("name"),
    admin.from("platform_commercial_features").select("key, name, description, category, status").eq("status", "active").order("category").order("name"),
    admin.from("platform_package_catalog").select("id, key, name, description, status, is_legacy_full_access, created_at").neq("status", "archived").order("is_legacy_full_access", { ascending: false }).order("name"),
    admin.from("platform_package_entitlements").select("package_id, feature_key, included_in_simulation"),
    admin.from("platform_package_limits").select("package_id, metric_key, soft_limit, unit"),
    admin.from("tenant_package_assignments").select("tenant_id, package_id, evaluation_mode, assigned_at"),
    admin.from("tenants").select("id, name, slug, status").order("name"),
    admin.from("participants").select("tenant_id, status, is_test"),
    admin.from("tenant_memberships").select("tenant_id, role, status"),
    admin.from("resources").select("tenant_id, kind, status"),
    admin.from("tenant_documents").select("tenant_id, size_bytes, status"),
    admin.from("participant_media").select("tenant_id, size_bytes, status, is_test"),
    admin.from("tenant_media_assets").select("tenant_id, size_bytes, status")
  ]);

  for (const [label, error] of [
    ["technical release flags", releaseFlagsResult.error],
    ["commercial features", featuresResult.error],
    ["package catalog", packagesResult.error],
    ["package entitlements", entitlementsResult.error],
    ["package limits", limitsResult.error],
    ["tenant package assignments", assignmentsResult.error],
    ["tenants", tenantsResult.error],
    ["participants", participantsResult.error],
    ["memberships", membershipsResult.error],
    ["resources", resourcesResult.error],
    ["documents", documentsResult.error],
    ["participant media", participantMediaResult.error],
    ["website media", siteMediaResult.error]
  ] as const) assertResult(error, label);

  const packages = (packagesResult.data ?? []) as PackageRow[];
  const features = (featuresResult.data ?? []) as FeatureRow[];
  const entitlements = entitlementsResult.data ?? [];
  const limits = limitsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];
  const legacyPackage = packages.find((item) => item.is_legacy_full_access);
  if (!legacyPackage) throw new Error("The full-access shadow package is missing.");

  const packageById = new Map(packages.map((item) => [item.id, item]));
  const assignmentByTenant = new Map(assignments.map((item) => [item.tenant_id, item]));
  const entitlementsByPackage = new Map<string, Map<string, boolean>>();
  const limitsByPackage = new Map<string, Map<string, number>>();

  for (const entitlement of entitlements) {
    const packageEntitlements = entitlementsByPackage.get(entitlement.package_id) ?? new Map<string, boolean>();
    packageEntitlements.set(entitlement.feature_key, entitlement.included_in_simulation);
    entitlementsByPackage.set(entitlement.package_id, packageEntitlements);
  }
  for (const limit of limits) {
    const packageLimits = limitsByPackage.get(limit.package_id) ?? new Map<string, number>();
    packageLimits.set(limit.metric_key, Number(limit.soft_limit));
    limitsByPackage.set(limit.package_id, packageLimits);
  }

  const tenantRows: ShadowPackageTenantRow[] = (tenantsResult.data ?? []).map((tenant) => {
    const assignment = assignmentByTenant.get(tenant.id);
    const selectedPackage = packageById.get(assignment?.package_id ?? "") ?? legacyPackage;
    const packageEntitlements = entitlementsByPackage.get(selectedPackage.id) ?? new Map<string, boolean>();
    const packageLimits = limitsByPackage.get(selectedPackage.id) ?? new Map<string, number>();
    const activeParticipants = (participantsResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status === "active" && !row.is_test).length;
    const activeStaff = (membershipsResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status === "active" && ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"].includes(row.role)).length;
    const locations = (resourcesResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status === "active" && row.kind === "location").length;
    const bytes = [
      ...(documentsResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status === "active"),
      ...(participantMediaResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status !== "deleted" && !row.is_test),
      ...(siteMediaResult.data ?? []).filter((row) => row.tenant_id === tenant.id && row.status !== "deleted")
    ].reduce((sum, row) => sum + Number(row.size_bytes ?? 0), 0);
    const storageGb = round(bytes / 1024 / 1024 / 1024, 2);
    const values: Record<(typeof shadowLimitDefinitions)[number]["key"], number> = {
      active_participants: activeParticipants,
      active_staff: activeStaff,
      locations,
      private_storage_gb: storageGb
    };
    const evaluations = shadowLimitDefinitions.flatMap((definition) => {
      const limit = packageLimits.get(definition.key);
      if (!limit) return [];
      return [{
        key: definition.key,
        label: definition.label,
        value: values[definition.key],
        limit,
        unit: definition.unit,
        evaluation: evaluateShadowEntitlement({
          metricLabel: definition.label,
          observedValue: values[definition.key],
          softLimit: limit,
          unit: definition.unit
        })
      }];
    });
    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      packageId: selectedPackage.id,
      packageName: selectedPackage.name,
      activeParticipants,
      activeStaff,
      locations,
      storageGb,
      featureIncludedCount: features.filter((feature) => packageEntitlements.get(feature.key) ?? selectedPackage.is_legacy_full_access).length,
      featureTotalCount: features.length,
      evaluationStatus: summarizeShadowLimits(evaluations.map((item) => item.evaluation)),
      evaluations
    };
  });

  return {
    canManage: context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin") ?? false,
    releaseFlags: releaseFlagsResult.data ?? [],
    features,
    packages: packages.map((item) => ({
      ...item,
      includedFeatureKeys: features
        .filter((feature) => entitlementsByPackage.get(item.id)?.get(feature.key) ?? item.is_legacy_full_access)
        .map((feature) => feature.key),
      limits: Object.fromEntries(limitsByPackage.get(item.id) ?? [])
    })),
    tenants: tenantRows,
    summary: {
      activePackages: packages.filter((item) => item.status === "active").length,
      draftPackages: packages.filter((item) => item.status === "draft").length,
      measuredTenants: tenantRows.filter((item) => item.evaluations.length > 0).length,
      approaching: tenantRows.filter((item) => item.evaluationStatus === "approaching").length,
      exceeded: tenantRows.filter((item) => item.evaluationStatus === "exceeded").length,
      accessDenied: 0
    }
  };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
