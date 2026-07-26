"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAutomationRecipeDefinition,
  normalizeAutomationRecipeSettings,
  parseAutomationRecipeKey,
  type AutomationRecipeSettings
} from "./automation-recipe-contract";
import { getActiveTenant } from "./core";
import { executeAutomationRecipe } from "./automation-recipes";

const galleryPath = "/admin/automatisering";

export async function saveAutomationRecipeConfigAction(formData: FormData) {
  const { tenant, userId } = await requireAutomationAdmin();
  const recipeKey = requireRecipeKey(formData);
  const definition = getAutomationRecipeDefinition(recipeKey);
  const settings = normalizeAutomationRecipeSettings(readSettings(formData), definition);
  const admin = createAdminClient();
  const existing = await admin
    .from("tenant_automation_recipes")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("recipe_key", recipeKey)
    .maybeSingle();
  if (existing.error) redirectWith("error", "config_lookup", recipeKey);

  const write = existing.data
    ? await admin
        .from("tenant_automation_recipes")
        .update({
          recipe_version: 1,
          settings_json: settings,
          review_only: true,
          external_delivery_enabled: false,
          updated_by_user_id: userId
        })
        .eq("tenant_id", tenant.id)
        .eq("id", existing.data.id)
    : await admin.from("tenant_automation_recipes").insert({
        tenant_id: tenant.id,
        recipe_key: recipeKey,
        recipe_version: 1,
        enabled: false,
        settings_json: settings,
        review_only: true,
        external_delivery_enabled: false,
        created_by_user_id: userId,
        updated_by_user_id: userId
      });
  if (write.error) redirectWith("error", "config_save", recipeKey);
  refreshAutomationPaths();
  redirectWith("saved", "config", recipeKey);
}

export async function setAutomationRecipeEnabledAction(formData: FormData) {
  const { tenant, userId } = await requireAutomationAdmin();
  const recipeKey = requireRecipeKey(formData);
  const enable = formData.get("enabled") === "true";
  if (enable && formData.get("humanConfirmation") !== "confirmed") {
    redirectWith("error", "activation_confirmation", recipeKey);
  }

  const definition = getAutomationRecipeDefinition(recipeKey);
  const admin = createAdminClient();
  const existing = await admin
    .from("tenant_automation_recipes")
    .select("id, settings_json")
    .eq("tenant_id", tenant.id)
    .eq("recipe_key", recipeKey)
    .maybeSingle();
  if (existing.error) redirectWith("error", "config_lookup", recipeKey);
  const now = new Date().toISOString();
  const settings = normalizeAutomationRecipeSettings(
    (existing.data?.settings_json ?? {}) as Partial<AutomationRecipeSettings>,
    definition
  );
  const write = await admin
    .from("tenant_automation_recipes")
    .upsert({
      id: existing.data?.id,
      tenant_id: tenant.id,
      recipe_key: recipeKey,
      recipe_version: 1,
      enabled: enable,
      settings_json: settings,
      review_only: true,
      external_delivery_enabled: false,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      enabled_by_user_id: enable ? userId : null,
      enabled_at: enable ? now : null
    }, { onConflict: "tenant_id,recipe_key" });
  if (write.error) redirectWith("error", "activation", recipeKey);
  refreshAutomationPaths();
  redirectWith("saved", enable ? "activated" : "paused", recipeKey);
}

export async function runAutomationRecipeAction(formData: FormData) {
  const { tenant, userId } = await requireAutomationAdmin();
  const recipeKey = requireRecipeKey(formData);
  const executionMode = formData.get("executionMode") === "live" ? "live" : "test";
  const admin = createAdminClient();
  const config = await admin
    .from("tenant_automation_recipes")
    .select("id, enabled, settings_json")
    .eq("tenant_id", tenant.id)
    .eq("recipe_key", recipeKey)
    .maybeSingle();
  if (config.error) redirectWith("error", "config_lookup", recipeKey);
  if (executionMode === "live") {
    if (!config.data?.enabled) redirectWith("error", "recipe_not_active", recipeKey);
    if (formData.get("humanConfirmation") !== "confirmed") {
      redirectWith("error", "live_confirmation", recipeKey);
    }
  }

  try {
    const result = await executeAutomationRecipe({
      tenantId: tenant.id,
      recipeKey,
      executionMode,
      initiatedByUserId: userId,
      tenantRecipeId: config.data?.id ?? null,
      settings: (config.data?.settings_json ?? {}) as Partial<AutomationRecipeSettings>
    });
    refreshAutomationPaths();
    redirectWith(
      "saved",
      result.action === "review_task_created"
        ? "review_task"
        : result.action === "simulation_only"
          ? "test"
          : result.action === "duplicate"
            ? "duplicate"
            : result.action === "failed"
              ? "failed"
              : "skipped",
      recipeKey
    );
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[automation-recipes] manual evaluation failed", {
      recipeKey,
      tenantId: tenant.id,
      error: error instanceof Error ? error.message : "unexpected"
    });
    redirectWith("error", "evaluation", recipeKey);
  }
}

async function requireAutomationAdmin() {
  const context = await requirePrivateShellContext(galleryPath);
  const canManage = context.activeTenant?.roles.some((role) =>
    role === "tenant_owner" || role === "tenant_admin"
  ) ?? false;
  if (!canManage) redirect(`${galleryPath}?error=forbidden`);
  return { tenant: getActiveTenant(context), userId: context.user.id };
}

function requireRecipeKey(formData: FormData) {
  const value = parseAutomationRecipeKey(formData.get("recipeKey"));
  if (!value) redirect(`${galleryPath}?error=recipe`);
  return value;
}

function readSettings(formData: FormData) {
  return {
    cooldownDays: formData.get("cooldownDays"),
    daysAhead: formData.get("daysAhead"),
    lookbackDays: formData.get("lookbackDays"),
    minimumOccurrences: formData.get("minimumOccurrences"),
    minimumConfidence: formData.get("minimumConfidence")
  };
}

function redirectWith(kind: "error" | "saved", value: string, recipeKey: string): never {
  redirect(`${galleryPath}?${kind}=${encodeURIComponent(value)}&recipe=${encodeURIComponent(recipeKey)}#recipe-${recipeKey}`);
}

function refreshAutomationPaths() {
  revalidatePath(galleryPath);
  revalidatePath("/admin/taken");
}

function isRedirectError(error: unknown) {
  return !!error
    && typeof error === "object"
    && "digest" in error
    && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
