"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { buildPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";

const platformWriteRoles = ["platform_owner", "platform_admin"] as const;
const platformSettingsPath = "/platform/settings";
const platformTemplatesPath = "/platform/templates";

type ActionResult = {
  notice?: string;
  error?: string;
  targetPath: typeof platformSettingsPath | typeof platformTemplatesPath;
};

export async function updatePlatformSettingsAction(formData: FormData) {
  const result = await updatePlatformSettings(formData);
  redirectWithResult(result);
}

export async function upsertSectorTemplateAction(formData: FormData) {
  const result = await upsertSectorTemplate(formData);
  redirectWithResult(result);
}

export async function updateIntegrationStatusAction(formData: FormData) {
  const result = await updateIntegrationStatus(formData);
  redirectWithResult(result);
}

async function updatePlatformSettings(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter("platforminstellingen");
    const admin = createAdminClient();
    const payload = {
      platform_name: requiredString(formData, "platform_name"),
      default_locale: requiredString(formData, "default_locale"),
      default_timezone: requiredString(formData, "default_timezone"),
      support_email: optionalEmail(formData, "support_email"),
      tenant_domain_suffix: optionalString(formData, "tenant_domain_suffix"),
      staging_domain: optionalString(formData, "staging_domain"),
      production_domain: optionalString(formData, "production_domain"),
      maintenance_mode: formData.get("maintenance_mode") === "on",
      signup_mode: enumValue(formData, "signup_mode", ["invite_only", "request_access", "open"], "invite_only"),
      release_channel: enumValue(formData, "release_channel", ["staging", "production", "maintenance"], "staging"),
      updated_by_profile_id: actor.userId,
      metadata: { updated_via: "platform_settings" }
    };
    const existingSettings = await admin.from("platform_settings").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();

    if (existingSettings.error) {
      throw new Error(existingSettings.error.message);
    }

    if (existingSettings.data?.id) {
      await throwOnError(admin.from("platform_settings").update(payload).eq("id", existingSettings.data.id));
    } else {
      await throwOnError(admin.from("platform_settings").insert(payload));
    }

    revalidatePlatform();
    return { notice: "Platforminstellingen zijn opgeslagen.", targetPath: platformSettingsPath };
  } catch (cause) {
    return { error: getErrorMessage(cause), targetPath: platformSettingsPath };
  }
}

async function upsertSectorTemplate(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter("sector templates");
    const admin = createAdminClient();
    const id = optionalString(formData, "id");
    const payload = {
      sector: enumValue(formData, "sector", ["swim_school", "football_school", "sports_club", "martial_arts_school", "dance_school", "generic_lessons"], "swim_school"),
      code: slugify(requiredString(formData, "code")),
      name: requiredString(formData, "name"),
      description: optionalString(formData, "description"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "draft"),
      default_locale: requiredString(formData, "default_locale"),
      terminology: parseKeyValueJson(optionalString(formData, "terminology_text"), "Terminologie"),
      feature_flags: parseFeatureFlags(optionalString(formData, "feature_flags_text")),
      onboarding_checklist: parseChecklist(optionalString(formData, "onboarding_checklist_text")),
      updated_by_profile_id: actor.userId,
      metadata: { updated_via: "platform_templates" }
    };

    if (id) {
      await throwOnError(admin.from("sector_templates").update(payload).eq("id", id));
    } else {
      await throwOnError(admin.from("sector_templates").insert(payload));
    }

    revalidatePlatform();
    return { notice: "Sector template is opgeslagen.", targetPath: platformTemplatesPath };
  } catch (cause) {
    return { error: getErrorMessage(cause), targetPath: platformTemplatesPath };
  }
}

async function updateIntegrationStatus(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter("integratiestatussen");
    const admin = createAdminClient();

    await throwOnError(
      admin
        .from("platform_integration_statuses")
        .update({
          status: enumValue(formData, "status", ["unknown", "ready", "warning", "incident", "disabled"], "unknown"),
          mode: enumValue(formData, "mode", ["staging", "production", "global"], "staging"),
          endpoint_label: optionalString(formData, "endpoint_label"),
          last_error: optionalString(formData, "last_error"),
          runbook_url: optionalString(formData, "runbook_url"),
          last_checked_at: new Date().toISOString(),
          updated_by_profile_id: actor.userId,
          metadata: { updated_via: "platform_integration_status" }
        })
        .eq("id", requiredString(formData, "id"))
    );

    revalidatePlatform();
    return { notice: "Integratiestatus is bijgewerkt.", targetPath: platformSettingsPath };
  } catch (cause) {
    return { error: getErrorMessage(cause), targetPath: platformSettingsPath };
  }
}

async function requirePlatformWriter(scope: string) {
  const context = await getTrustedAuthContext();

  if (context.status !== "authenticated" || !context.platform?.roles.some((role) => platformWriteRoles.includes(role as (typeof platformWriteRoles)[number]))) {
    throw new Error(`Je hebt platform admin rechten nodig om ${scope} te beheren.`);
  }

  return {
    userId: context.user.id
  };
}

function redirectWithResult(result: ActionResult): never {
  revalidatePlatform();
  redirect(buildPath(result.targetPath, { notice: result.notice, error: result.error }));
}

function revalidatePlatform() {
  revalidatePath("/platform");
  revalidatePath("/platform/tenants");
  revalidatePath(platformSettingsPath);
  revalidatePath(platformTemplatesPath);
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
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

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error(`${key} is geen geldig e-mailadres.`);
  }

  return normalized;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function parseKeyValueJson(value: string | null, label: string) {
  if (!value) {
    return {};
  }

  return value.split(/\r?\n/).reduce<Record<string, string>>((parsed, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return parsed;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const cleanKey = key?.trim();
    const cleanValue = valueParts.join("=").trim();

    if (!cleanKey || !cleanValue) {
      throw new Error(`${label}: gebruik key=value per regel.`);
    }

    parsed[cleanKey] = cleanValue;
    return parsed;
  }, {});
}

function parseFeatureFlags(value: string | null) {
  if (!value) {
    return {};
  }

  return value.split(/\r?\n/).reduce<Record<string, boolean>>((parsed, line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return parsed;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const cleanKey = key?.trim();
    const cleanValue = valueParts.join("=").trim().toLowerCase();

    if (!cleanKey || !["true", "false"].includes(cleanValue)) {
      throw new Error("Feature flags: gebruik key=true of key=false per regel.");
    }

    parsed[cleanKey] = cleanValue === "true";
    return parsed;
  }, {});
}

function parseChecklist(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Code heeft geen geldige slug.");
  }

  return slug;
}

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Actie kon niet worden afgerond.";
}
