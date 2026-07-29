"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { shadowLimitDefinitions } from "./shadow-entitlements";

const path = "/platform/packages";

export async function createShadowPackageAction(formData: FormData) {
  const context = await requirePlatformManager();
  const name = required(formData, "name", 120);
  const key = packageKey(formData, "key");
  const description = required(formData, "description", 500);
  const admin = createAdminClient();
  const result = await admin.from("platform_package_catalog").insert({
    key,
    name,
    description,
    status: "draft",
    is_legacy_full_access: false,
    created_by_user_id: context.user.id
  }).select("id, key, name, description, status").single();
  if (result.error) redirect(`${path}?error=package`);
  await writeAudit(admin, {
    actor: context.user.id,
    event: "platform.package_created",
    subjectId: result.data.id,
    subjectType: "package_config",
    after: result.data
  });
  revalidatePath(path);
  redirect(`${path}?package=${result.data.id}&saved=package`);
}

export async function saveShadowPackageConfigurationAction(formData: FormData) {
  const context = await requirePlatformManager();
  const packageId = uuid(formData, "packageId");
  const admin = createAdminClient();
  const [packageResult, featuresResult, beforeEntitlementsResult, beforeLimitsResult] = await Promise.all([
    admin.from("platform_package_catalog").select("id, key, name, status, is_legacy_full_access").eq("id", packageId).maybeSingle(),
    admin.from("platform_commercial_features").select("key").eq("status", "active"),
    admin.from("platform_package_entitlements").select("feature_key, included_in_simulation").eq("package_id", packageId),
    admin.from("platform_package_limits").select("metric_key, soft_limit, unit").eq("package_id", packageId)
  ]);
  if (packageResult.error || !packageResult.data || packageResult.data.status !== "draft" || packageResult.data.is_legacy_full_access || featuresResult.error) {
    redirect(`${path}?error=immutable`);
  }
  const entitlementInput = Object.fromEntries(
    (featuresResult.data ?? []).map((feature) => [feature.key, formData.get(`feature.${feature.key}`) === "on"])
  );
  const limitsInput = Object.fromEntries(
    shadowLimitDefinitions.flatMap((definition) => {
      const raw = String(formData.get(`limit.${definition.key}`) ?? "").trim();
      if (!raw) return [];
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value <= 0 || value > 1_000_000) redirect(`${path}?package=${packageId}&error=limit`);
      return [[definition.key, value]];
    })
  );
  const result = await admin.rpc("replace_shadow_package_configuration", {
    target_package_id: packageId,
    target_entitlements: entitlementInput,
    target_limits: limitsInput
  });
  if (result.error) redirect(`${path}?package=${packageId}&error=configuration`);
  await writeAudit(admin, {
    actor: context.user.id,
    event: "platform.package_configuration_saved",
    subjectId: packageId,
    subjectType: "package_config",
    before: {
      entitlements: beforeEntitlementsResult.data ?? [],
      limits: beforeLimitsResult.data ?? []
    },
    after: {
      package: packageResult.data.name,
      entitlements: entitlementInput,
      softLimits: limitsInput,
      evaluationMode: "shadow"
    }
  });
  revalidatePath(path);
  redirect(`${path}?package=${packageId}&saved=configuration`);
}

export async function assignShadowPackageAction(formData: FormData) {
  const context = await requirePlatformManager();
  if (formData.get("humanConfirmation") !== "assign-shadow-package") redirect(`${path}?error=confirmation`);
  const tenantId = uuid(formData, "tenantId");
  const packageId = uuid(formData, "packageId");
  const admin = createAdminClient();
  const [tenantResult, packageResult, existingResult] = await Promise.all([
    admin.from("tenants").select("id, name").eq("id", tenantId).maybeSingle(),
    admin.from("platform_package_catalog").select("id, name, status").eq("id", packageId).neq("status", "archived").maybeSingle(),
    admin.from("tenant_package_assignments").select("id, package_id, evaluation_mode").eq("tenant_id", tenantId).maybeSingle()
  ]);
  if (tenantResult.error || !tenantResult.data || packageResult.error || !packageResult.data) redirect(`${path}?error=assignment`);
  const result = await admin.from("tenant_package_assignments").upsert({
    tenant_id: tenantId,
    package_id: packageId,
    evaluation_mode: "shadow",
    assigned_by_user_id: context.user.id,
    assigned_at: new Date().toISOString()
  }, { onConflict: "tenant_id" }).select("id").single();
  if (result.error) redirect(`${path}?error=assignment`);
  await writeAudit(admin, {
    tenantId,
    actor: context.user.id,
    event: "platform.tenant_package_simulated",
    subjectId: result.data.id,
    subjectType: "tenant_package_assignment",
    before: existingResult.data ?? {},
    after: {
      tenantName: tenantResult.data.name,
      packageId,
      packageName: packageResult.data.name,
      evaluationMode: "shadow",
      accessChanged: false
    }
  });
  revalidatePath(path);
  redirect(`${path}?saved=assignment`);
}

export async function updateTechnicalReleaseFlagAction(formData: FormData) {
  const context = await requirePlatformManager();
  if (formData.get("humanConfirmation") !== "update-release-inventory") redirect(`${path}?error=confirmation`);
  const key = packageKey(formData, "flagKey");
  const rolloutState = enumValue(formData, "rolloutState", ["disabled", "shadow", "enabled"] as const);
  const admin = createAdminClient();
  const existing = await admin.from("platform_release_flags").select("key, name, rollout_state").eq("key", key).maybeSingle();
  if (existing.error || !existing.data) redirect(`${path}?error=release`);
  const result = await admin.from("platform_release_flags").update({ rollout_state: rolloutState }).eq("key", key);
  if (result.error) redirect(`${path}?error=release`);
  await writeAudit(admin, {
    actor: context.user.id,
    event: "platform.release_inventory_updated",
    subjectId: null,
    subjectType: "release_flag",
    before: existing.data,
    after: { key, rolloutState, runtimeWiringChanged: false }
  });
  revalidatePath(path);
  redirect(`${path}?saved=release`);
}

async function requirePlatformManager() {
  const context = await requirePrivateShellContext(path);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) redirect(`${path}?error=forbidden`);
  return context;
}

async function writeAudit(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    tenantId?: string;
    actor: string;
    event: string;
    subjectId: string | null;
    subjectType: "package_config" | "tenant_package_assignment" | "release_flag";
    before?: Record<string, unknown>;
    after: Record<string, unknown>;
  }
) {
  const result = await admin.from("platform_admin_audit_events").insert({
    tenant_id: input.tenantId ?? null,
    actor_user_id: input.actor,
    event_type: input.event,
    subject_type: input.subjectType,
    subject_id: input.subjectId,
    before_state: input.before ?? {},
    after_state: input.after
  });
  if (result.error) throw new Error(`Could not write package audit event: ${result.error.message}`);
}

function required(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim().slice(0, maxLength);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function packageKey(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_]{3,80}$/.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function uuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} is invalid`);
  return value;
}

function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[]) {
  const value = String(formData.get(name) ?? "");
  if (!values.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}
