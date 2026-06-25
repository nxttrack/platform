"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;
const intakeOptions = ["trial", "registration", "waitlist"] as const;

export async function updateTenantPublicProfileAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const heroTitle = requiredString(formData, "hero_title");

  await throwOnError(
    supabase.from("tenant_public_profiles").upsert(
      {
        tenant_id: tenantId,
        status: enumValue(formData, "status", ["draft", "published", "archived"], "published"),
        hero_title: heroTitle,
        hero_subtitle: requiredString(formData, "hero_subtitle"),
        primary_cta_label: requiredString(formData, "primary_cta_label"),
        secondary_cta_label: requiredString(formData, "secondary_cta_label"),
        intro_title: optionalString(formData, "intro_title"),
        intro_body: optionalString(formData, "intro_body"),
        logo_url: optionalString(formData, "logo_url"),
        hero_image_url: optionalString(formData, "hero_image_url"),
        hero_image_alt: optionalString(formData, "hero_image_alt"),
        brand_primary_hex: hexColor(formData, "brand_primary_hex", "#1d4ed8"),
        brand_accent_hex: hexColor(formData, "brand_accent_hex", "#b6ff2e"),
        location_label: optionalString(formData, "location_label"),
        footer_tagline: optionalString(formData, "footer_tagline"),
        contact_email: optionalEmail(formData, "contact_email"),
        contact_phone: optionalString(formData, "contact_phone"),
        address_lines: linesValue(formData, "address_lines"),
        seo_title: optionalString(formData, "seo_title"),
        seo_description: optionalString(formData, "seo_description"),
        news_items: jsonArrayValue(formData, "news_items_json"),
        agenda_items: jsonArrayValue(formData, "agenda_items_json")
      },
      { onConflict: "tenant_id" }
    )
  );

  revalidateTenantWebsite();
}

export async function upsertProgramPublicSettingsAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const programId = requiredString(formData, "program_id");
  const fallbackName = requiredString(formData, "program_name");

  await throwOnError(
    supabase.from("program_public_settings").upsert(
      {
        tenant_id: tenantId,
        program_id: programId,
        public_slug: slugValue(formData, "public_slug", fallbackName),
        status: enumValue(formData, "status", ["draft", "published", "archived"], "published"),
        summary: optionalString(formData, "summary"),
        detail: optionalString(formData, "detail"),
        age_label: optionalString(formData, "age_label"),
        duration_label: optionalString(formData, "duration_label"),
        price_label: optionalString(formData, "price_label"),
        capacity_label: optionalString(formData, "capacity_label"),
        trial_enabled: booleanValue(formData, "trial_enabled"),
        registration_enabled: booleanValue(formData, "registration_enabled"),
        waitlist_enabled: booleanValue(formData, "waitlist_enabled"),
        sort_order: intValue(formData, "sort_order", 0)
      },
      { onConflict: "program_id" }
    )
  );

  revalidateTenantWebsite();
}

export async function upsertIntakeFormConfigAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const programId = requiredString(formData, "program_id");
  const allowedOptions = formData
    .getAll("allowed_intake_options")
    .flatMap((value) => (typeof value === "string" && intakeOptions.includes(value as (typeof intakeOptions)[number]) ? [value] : []));

  if (allowedOptions.length === 0) {
    throw new Error("Kies minimaal een intake-optie.");
  }

  await throwOnError(
    supabase.from("intake_form_configs").upsert(
      {
        tenant_id: tenantId,
        program_id: programId,
        status: enumValue(formData, "status", ["draft", "active", "archived"], "active"),
        intro: optionalString(formData, "intro"),
        allowed_intake_options: allowedOptions,
        custom_questions: jsonArrayValue(formData, "custom_questions_json")
      },
      { onConflict: "program_id" }
    )
  );

  revalidateTenantWebsite();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om tenantwebsite instellingen te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId
  };
}

function revalidateTenantWebsite() {
  for (const path of ["/", "/programmas", "/intake", "/nieuws", "/agenda", "/admin/instellingen"]) {
    revalidatePath(path);
  }
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

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${key} is geen geldig e-mailadres.`);
  }

  return value;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function booleanValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function intValue(formData: FormData, key: string, fallback: number) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function hexColor(formData: FormData, key: string, fallback: string) {
  const value = optionalString(formData, key) ?? fallback;

  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${key} moet een hexkleur zijn, bijvoorbeeld #1d4ed8.`);
  }

  return value.toLowerCase();
}

function slugValue(formData: FormData, key: string, fallback: string) {
  const raw = optionalString(formData, key) ?? fallback;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error(`${key} heeft geen geldige slug.`);
  }

  return slug;
}

function linesValue(formData: FormData, key: string) {
  return (optionalString(formData, key) ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function jsonArrayValue(formData: FormData, key: string) {
  const raw = optionalString(formData, key);

  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`${key} moet een JSON-array zijn.`);
  }

  return parsed;
}
