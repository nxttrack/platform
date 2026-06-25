"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { automationLevelToLegacyMode, evaluateAutomationSafety, isAutomationLevel, isSmartEngineKey, logAutomationExecution, normalizeSafetyLimits, type AutomationLevel } from "@/lib/smart-flow/automation";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantAutomationRoles = ["tenant_owner", "tenant_admin"] as const;

export async function updateAutomationEngineSettingsAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAutomationAdmin();
  const engineKey = smartEngineKeyValue(formData, "engine_key");
  const automationLevel = automationLevelValue(formData, "automation_level");
  const safetyLimits = {
    max_auto_offers_per_day: intValue(formData, "max_auto_offers_per_day", 5, 0, 100),
    min_confidence: enumValue(formData, "min_confidence", ["unknown", "low", "medium", "high", "manual"], "high"),
    min_score: intValue(formData, "min_score", 80, 0, 100),
    block_on_duplicate_risk: boolValue(formData, "block_on_duplicate_risk"),
    require_available_target_group: boolValue(formData, "require_available_target_group"),
    require_registered_result_for_diploma: boolValue(formData, "require_registered_result_for_diploma"),
    rollback_window_minutes: intValue(formData, "rollback_window_minutes", 1440, 0, 10080)
  };
  const featureFlags = {
    auto_execution: boolValue(formData, "engine_auto_execution"),
    auto_placement: boolValue(formData, "engine_auto_placement"),
    auto_slot_offers: boolValue(formData, "engine_auto_slot_offers"),
    auto_flow_through: boolValue(formData, "engine_auto_flow_through"),
    auto_diploma: boolValue(formData, "engine_auto_diploma")
  };

  await throwOnError(
    supabase
      .from("tenant_smart_engine_settings")
      .update({
        automation_level: automationLevel,
        mode: automationLevelToLegacyMode(automationLevel),
        safety_limits: safetyLimits,
        feature_flags: featureFlags,
        status: automationLevel === "disabled" ? "disabled" : "active",
        last_automation_reviewed_at: new Date().toISOString(),
        last_automation_reviewed_by_profile_id: profileId,
        metadata: {
          phase: "s12",
          updated_via: "tenant_admin_automation",
          automatic_execution_requires_safety_gate: true
        }
      })
      .eq("tenant_id", tenantId)
      .eq("engine_key", engineKey)
  );

  const safety = evaluateAutomationSafety({
    engineKey,
    automationLevel,
    safetyLimits,
    featureFlags,
    confidence: "unknown",
    score: null,
    duplicateRisk: "none",
    availableTargetGroup: false,
    registeredResult: false,
    autoOffersToday: 0
  });

  await logAutomationExecution(supabase, {
    tenantId,
    engineKey,
    automationLevel,
    actionKey: "settings_review",
    actionStatus: automationLevel === "execute_automatically" && !safety.allowed ? "blocked" : "prepared",
    inputSnapshot: { engine_key: engineKey, automation_level: automationLevel },
    safetyResult: safety,
    result: { settings_updated: true },
    createdByProfileId: profileId,
    metadata: { phase: "s12", source: "settings_update" }
  });

  revalidateAutomation();
}

export async function updateTenantFeatureFlagAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAutomationAdmin();
  const flagKey = requiredString(formData, "flag_key");
  const enabled = boolValue(formData, "enabled");
  const rolloutState = enumValue(formData, "rollout_state", ["disabled", "internal", "beta", "enabled"], enabled ? "beta" : "disabled");

  await throwOnError(
    supabase
      .from("tenant_feature_flags")
      .update({
        enabled,
        rollout_state: rolloutState,
        metadata: {
          phase: "s12",
          updated_by_profile_id: profileId,
          automation_feature_flag: true
        }
      })
      .eq("tenant_id", tenantId)
      .eq("flag_key", flagKey)
  );

  revalidateAutomation();
}

export async function createAutomationSafetyLogAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAutomationAdmin();
  const engineKey = smartEngineKeyValue(formData, "engine_key");
  const automationLevel = automationLevelValue(formData, "automation_level");
  const safetyLimits = normalizeSafetyLimits(jsonObjectValue(formData, "safety_limits"));
  const featureFlags = jsonBooleanObjectValue(formData, "feature_flags");
  const confidence = enumValue(formData, "confidence", ["unknown", "low", "medium", "high", "manual"], "unknown");
  const score = optionalInt(formData, "score");
  const duplicateRisk = optionalString(formData, "duplicate_risk") ?? "none";
  const availableTargetGroup = boolValue(formData, "available_target_group");
  const registeredResult = boolValue(formData, "registered_result");
  const autoOffersToday = intValue(formData, "auto_offers_today", 0, 0, 1000);
  const safety = evaluateAutomationSafety({
    engineKey,
    automationLevel,
    safetyLimits,
    featureFlags,
    confidence,
    score,
    duplicateRisk,
    availableTargetGroup,
    registeredResult,
    autoOffersToday
  });

  await logAutomationExecution(supabase, {
    tenantId,
    engineKey,
    automationLevel,
    actionKey: "safety_check",
    actionStatus: safety.allowed ? "prepared" : "blocked",
    inputSnapshot: {
      confidence,
      score,
      duplicate_risk: duplicateRisk,
      available_target_group: availableTargetGroup,
      registered_result: registeredResult,
      auto_offers_today: autoOffersToday
    },
    safetyResult: safety,
    result: { safe_for_automatic: safety.allowed },
    createdByProfileId: profileId,
    metadata: { phase: "s12", source: "manual_safety_check" }
  });

  revalidateAutomation();
}

export async function requestAutomationRollbackAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAutomationAdmin();
  const id = requiredString(formData, "id");
  const note = optionalString(formData, "note");

  await throwOnError(
    supabase
      .from("automation_execution_logs")
      .update({
        rollback_status: "requested",
        action_status: "rollback_unavailable",
        metadata: {
          phase: "s12",
          rollback_requested_by_profile_id: profileId,
          rollback_note: note,
          rollback_support: "manual_review_required"
        }
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
  );

  revalidateAutomation();
}

async function requireTenantAutomationAdmin() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canManage = context.activeTenant.roles.some((role) => tenantAutomationRoles.includes(role as (typeof tenantAutomationRoles)[number]));

  if (!canManage) {
    throw new Error("Je hebt geen rechten om automatisering te beheren.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidateAutomation() {
  for (const path of ["/admin", "/admin/automatisering"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function smartEngineKeyValue(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!isSmartEngineKey(value)) {
    throw new Error(`${key} is geen geldige smart engine.`);
  }

  return value;
}

function automationLevelValue(formData: FormData, key: string): AutomationLevel {
  const value = optionalString(formData, key);

  if (!isAutomationLevel(value)) {
    throw new Error(`${key} is geen geldig automation level.`);
  }

  return value;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function intValue(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function optionalInt(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function jsonObjectValue(formData: FormData, key: string) {
  const raw = optionalString(formData, key);

  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} moet een JSON-object zijn.`);
  }

  return parsed as Record<string, unknown>;
}

function jsonBooleanObjectValue(formData: FormData, key: string) {
  const raw = jsonObjectValue(formData, key);
  return Object.fromEntries(Object.entries(raw).map(([flagKey, value]) => [flagKey, value === true]));
}
