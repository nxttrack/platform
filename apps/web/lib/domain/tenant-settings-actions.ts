"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { normalizeAnalyticsMeasurementId } from "@/lib/analytics/attribution";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

const settingsPath = "/admin/instellingen";
const sectors = new Set(["swim_school", "football_school", "sports_club", "martial_arts_school", "dance_school", "generic_lessons"]);

export async function saveTenantSettingsAction(formData: FormData) {
  const context = await requirePrivateShellContext(settingsPath);
  const canManage = context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false;

  if (!canManage) {
    redirect(`${settingsPath}?error=forbidden`);
  }

  const tenant = getActiveTenant(context);
  const admin = createAdminClient();

  const terminologySector = readEnum(formData, "terminologySector", sectors, "swim_school");
  const locale = readText(formData, "locale", "nl-NL");
  const timezone = readText(formData, "timezone", "Europe/Amsterdam");
  const cutoffHours = readInt(formData, "lessonCancellationCutoffHours", 12, 0, 168);
  const creditWindowDays = readInt(formData, "lessonCancellationCreditWindowDays", 60, 1, 365);
  const grantsCredit = formData.get("lessonCancellationGrantsCredit") === "on";
  const analyticsEnabled = formData.get("analyticsEnabled") === "on";
  const analyticsMeasurementIdInput = readOptionalText(formData, "googleAnalyticsMeasurementId");
  const analyticsMeasurementId = normalizeAnalyticsMeasurementId(analyticsMeasurementIdInput);

  if ((analyticsMeasurementIdInput && !analyticsMeasurementId) || (analyticsEnabled && !analyticsMeasurementId)) {
    redirect(`${settingsPath}?error=analytics_id`);
  }

  const { error } = await admin.from("tenant_settings").upsert(
    {
      tenant_id: tenant.id,
      terminology_sector: terminologySector,
      locale,
      timezone,
      lesson_cancellation_cutoff_hours: cutoffHours,
      lesson_cancellation_credit_window_days: creditWindowDays,
      lesson_cancellation_grants_credit: grantsCredit,
      analytics_enabled: analyticsEnabled,
      google_analytics_measurement_id: analyticsMeasurementId
    },
    { onConflict: "tenant_id" }
  );

  if (error) {
    redirect(`${settingsPath}?error=save_failed`);
  }

  revalidatePath(settingsPath);
  revalidatePath("/portaal/profiel");
  revalidatePath("/portaal/lessen");
  revalidatePath("/");
  redirect(`${settingsPath}?saved=1`);
}

function readEnum(formData: FormData, key: string, allowed: Set<string>, fallback: string) {
  const value = readText(formData, key, fallback);

  return allowed.has(value) ? value : fallback;
}

function readText(formData: FormData, key: string, fallback: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return trimmed || fallback;
}

function readOptionalText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function readInt(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(readText(formData, key, String(fallback)), 10);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
