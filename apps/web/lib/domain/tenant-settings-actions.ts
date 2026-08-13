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

export async function saveTenantBillingProfileAction(formData: FormData) {
  const context = await requirePrivateShellContext(settingsPath);
  const canManage = context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false;

  if (!canManage) {
    redirect(`${settingsPath}?error=forbidden`);
  }

  const tenant = getActiveTenant(context);
  const legalName = readText(formData, "legalName", tenant.name);
  const billingEmail = readOptionalText(formData, "billingEmail").toLowerCase();
  const countryCode = readText(formData, "countryCode", "NL").toUpperCase();
  const vatRate = readInt(formData, "defaultVatRateBasisPoints", 2100, 0, 2100);
  const vatScheme = readEnum(formData, "vatScheme", new Set(["standard", "exempt", "small_business"]), "standard");
  const invoicePrefix = normalizePrefix(readText(formData, "invoicePrefix", "INV"), "INV");
  const creditNotePrefix = normalizePrefix(readText(formData, "creditNotePrefix", "CN"), "CN");

  if (
    legalName.length < 2 ||
    !readOptionalText(formData, "addressLine1") ||
    !readOptionalText(formData, "postalCode") ||
    !readOptionalText(formData, "city") ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail) ||
    ![0, 900, 2100].includes(vatRate)
  ) {
    redirect(`${settingsPath}?error=billing_profile`);
  }

  const { error } = await createAdminClient().from("tenant_billing_profiles").upsert(
    {
      address_line_1: readOptionalText(formData, "addressLine1"),
      address_line_2: readOptionalText(formData, "addressLine2") || null,
      billing_email: billingEmail,
      chamber_of_commerce_number: readOptionalText(formData, "chamberOfCommerceNumber") || null,
      city: readOptionalText(formData, "city"),
      country_code: countryCode,
      credit_note_prefix: creditNotePrefix,
      default_vat_rate_basis_points: vatScheme === "standard" ? vatRate : 0,
      iban: normalizeIban(readOptionalText(formData, "iban")),
      invoice_prefix: invoicePrefix,
      legal_name: legalName,
      payment_terms_days: readInt(formData, "paymentTermsDays", 14, 0, 90),
      phone: readOptionalText(formData, "billingPhone") || null,
      postal_code: readOptionalText(formData, "postalCode"),
      prices_include_vat: true,
      tenant_id: tenant.id,
      trade_name: readOptionalText(formData, "tradeName") || null,
      updated_by_user_id: context.user.id,
      vat_number: readOptionalText(formData, "vatNumber").toUpperCase() || null,
      vat_scheme: vatScheme
    },
    { onConflict: "tenant_id" }
  );

  if (error) {
    console.error("[tenant-settings] billing profile save failed", {
      code: error.code,
      tenantId: tenant.id
    });
    redirect(`${settingsPath}?error=billing_profile_save`);
  }

  revalidatePath(settingsPath);
  revalidatePath("/admin/betalingen");
  redirect(`${settingsPath}?saved=billing`);
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

function normalizePrefix(value: string, fallback: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);

  return normalized.length >= 2 ? normalized : fallback;
}

function normalizeIban(value: string) {
  const normalized = value.toUpperCase().replace(/\s/g, "");

  return normalized || null;
}
