"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBadgeStudioAssetFile } from "@/lib/storage/private-files";
import { awardBadge } from "./badge-engine";
import { renderBadgeSharePngDataUrl } from "./badge-share-renderer";
import {
  badgeFormatDimensions,
  badgeFormats,
  normalizeBadgeGender,
  validateBadgeLayers,
  type BadgeStudioAsset
} from "./badge-system-contract";
import { getActiveTenant } from "./core";
import { createTenantNotifications } from "./tenant-notifications";

const platformFlagNames = [
  "badges_module_available",
  "automatic_badges_available",
  "manual_badges_available",
  "tenant_custom_badges_allowed",
  "badge_collections_available",
  "surprise_badges_available",
  "share_images_available",
  "badge_email_available",
  "badge_notifications_available",
  "tenant_badge_rename_allowed",
  "tenant_message_suggestions_allowed",
  "tenant_template_override_allowed",
  "badge_analytics_available"
] as const;

const tenantFlagNames = [
  "badges_enabled",
  "automatic_badges_enabled",
  "manual_badges_enabled",
  "custom_badges_enabled",
  "collections_enabled",
  "surprise_badges_enabled",
  "show_unearned_badges",
  "show_locked_surprise_badges",
  "share_images_enabled",
  "badge_notifications_enabled",
  "badge_emails_enabled",
  "instructor_can_award_directly",
  "manual_badge_requires_admin_approval"
] as const;

export async function savePlatformBadgeSettingsAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const values = Object.fromEntries(platformFlagNames.map((name) => [name, formData.get(name) === "on"]));
  const admin = createAdminClient();
  const { error } = await admin.from("platform_badge_settings").upsert({
    id: true,
    ...values,
    updated_by_user_id: context.user.id
  });
  if (error) redirectWith(nextPath, "error", "Instellingen konden niet worden opgeslagen.");
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Platforminstellingen opgeslagen.");
}

export async function saveCatalogBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const id = readUuid(formData, "id");
  const admin = createAdminClient();
  const badgeType = readEnum(formData, "badgeType", ["automatic", "manual"] as const, "manual");
  const nameDefault = readOptional(formData, "nameDefault", 120);
  const descriptionDefault = readOptional(formData, "descriptionDefault", 800);
  if (!nameDefault || !descriptionDefault) redirectWith(nextPath, "error", "Naam en beschrijving zijn verplicht.");
  const triggerCandidate = readOptional(formData, "triggerType", 120);
  if (badgeType === "automatic" && !triggerCandidate) {
    redirectWith(nextPath, "error", "Kies een triggertype voor een automatische badge.");
  }
  const triggerType = badgeType === "automatic" ? triggerCandidate : null;
  let triggerConfig: Record<string, unknown>;
  try {
    triggerConfig = readJsonObject(formData, "triggerConfigJson");
  } catch {
    redirectWith(nextPath, "error", "Triggerconfiguratie moet een geldig JSON-object zijn.");
  }
  const currentArtworkAssetId = formData.get("removeArtwork") === "on"
    ? null
    : readUuid(formData, "artworkAssetId");
  let storedArtwork: StoredBadgeStudioAsset | null = null;
  try {
    storedArtwork = await storeArtworkFromForm({
      file: formData.get("artwork"),
      name: nameDefault,
      scope: "platform",
      tenantId: null,
      userId: context.user.id
    });
  } catch (error) {
    redirectWith(nextPath, "error", error instanceof Error ? error.message : "Badge-artwork kon niet worden opgeslagen.");
  }
  const values = {
    name_default: nameDefault,
    name_boy: readOptional(formData, "nameBoy", 120),
    name_girl: readOptional(formData, "nameGirl", 120),
    description_default: descriptionDefault,
    description_boy: readOptional(formData, "descriptionBoy", 800),
    description_girl: readOptional(formData, "descriptionGirl", 800),
    share_text_default: readOptional(formData, "shareTextDefault", 800),
    share_text_boy: readOptional(formData, "shareTextBoy", 800),
    share_text_girl: readOptional(formData, "shareTextGirl", 800),
    category: readEnum(formData, "category", ["start", "attendance", "skills", "stages", "diplomas", "makeup", "compliments", "courage", "technique", "specials"] as const, "specials"),
    badge_type: badgeType,
    trigger_type: triggerType,
    trigger_config_json: triggerConfig,
    audience: readEnum(formData, "audience", ["all", "boys", "girls"] as const, "all"),
    icon_name: readOptional(formData, "iconName", 80) ?? "award",
    artwork_asset_id: storedArtwork?.asset.id ?? currentArtworkAssetId,
    is_surprise: formData.get("isSurprise") === "on",
    allow_custom_message: formData.get("allowCustomMessage") === "on",
    notifications_enabled: formData.get("notificationsEnabled") === "on",
    emails_enabled: formData.get("emailsEnabled") === "on",
    share_enabled: formData.get("shareEnabled") === "on",
    sort_order: readInteger(formData, "sortOrder", 0, 100_000, 0),
    status: readEnum(formData, "status", ["draft", "active", "archived"] as const, "active"),
    updated_by_user_id: context.user.id
  };
  const result = id
    ? await admin.from("badge_catalog_definitions").update(values).eq("id", id).select("id").maybeSingle()
    : await admin.from("badge_catalog_definitions").insert({
        ...values,
        badge_key: readKey(formData, "badgeKey")
      }).select("id").maybeSingle();
  if (result.error || !result.data) {
    if (storedArtwork) await removeStoredBadgeStudioAsset(storedArtwork);
    const message = result.error?.code === "23505"
      ? "Deze badgekey bestaat al."
      : "De badge kon niet worden opgeslagen.";
    redirectWith(nextPath, "error", message);
  }
  revalidateBadgePaths();
  redirectWith(nextPath, "success", id ? "Badge bijgewerkt." : "Nieuwe badge aangemaakt.");
}

export async function archiveCatalogBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const id = requireUuid(formData, "id");
  const { data, error } = await createAdminClient()
    .from("badge_catalog_definitions")
    .update({ status: "archived" })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirectWith(nextPath, "error", "De badge kon niet worden gearchiveerd.");
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Badge gearchiveerd; bestaande toekenningen blijven behouden.");
}

export async function duplicateCatalogBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const id = requireUuid(formData, "id");
  const admin = createAdminClient();
  const source = await admin.from("badge_catalog_definitions").select("*").eq("id", id).maybeSingle();
  if (source.error || !source.data) redirectWith(nextPath, "error", "Bronbadge niet gevonden.");
  const {
    id: _id,
    badge_key: sourceKey,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...copy
  } = source.data;
  const suffix = crypto.randomUUID().slice(0, 8);
  const result = await admin.from("badge_catalog_definitions").insert({
    ...copy,
    badge_key: `${sourceKey}_copy_${suffix}`.slice(0, 120),
    name_default: `${source.data.name_default} (kopie)`.slice(0, 120),
    status: "draft",
    updated_by_user_id: context.user.id
  }).select("id").single();
  if (result.error) redirectWith(nextPath, "error", "De badge kon niet worden gedupliceerd.");
  revalidateBadgePaths();
  redirectWith(`/platform/badges?edit=${result.data.id}`, "success", "Badge gedupliceerd als concept.");
}

export async function saveBadgeCollectionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges/collections");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const id = readUuid(formData, "id");
  const admin = createAdminClient();
  const requestedDefinitionIds = [...new Set(
    formData.getAll("definitionId")
      .map((value) => String(value))
      .filter((value) => readUuidValue(value))
  )];
  const collectionStatus = readEnum(formData, "status", ["draft", "active", "archived"] as const, "draft");
  if (collectionStatus === "active" && !requestedDefinitionIds.length) {
    redirectWith(nextPath, "error", "Een actieve collectie moet minimaal één badge bevatten.");
  }
  if (requestedDefinitionIds.length) {
    const definitions = await admin.from("badge_catalog_definitions").select("id").in("id", requestedDefinitionIds);
    if (definitions.error || (definitions.data ?? []).length !== requestedDefinitionIds.length) {
      redirectWith(nextPath, "error", "Een of meer gekozen badges bestaan niet meer.");
    }
  }
  const values = {
    name: readRequired(formData, "name", 120),
    description: readOptional(formData, "description", 800),
    is_surprise: formData.get("isSurprise") === "on",
    status: collectionStatus,
    sort_order: readInteger(formData, "sortOrder", 0, 100_000, 0)
  };
  const collection = id
    ? await admin.from("badge_collections").update(values).eq("id", id).is("tenant_id", null).select("id").maybeSingle()
    : await admin.from("badge_collections").insert({
        ...values,
        tenant_id: null,
        collection_key: readKey(formData, "collectionKey"),
        created_by_user_id: context.user.id
      }).select("id").maybeSingle();
  if (collection.error || !collection.data) {
    redirectWith(nextPath, "error", collection.error?.code === "23505"
      ? "Deze collectiekey bestaat al."
      : "De collectie kon niet worden opgeslagen.");
  }
  const collectionId = collection.data.id;
  const remove = await admin.from("badge_collection_items").delete().eq("collection_id", collectionId);
  if (remove.error) redirectWith(nextPath, "error", "De collectie is opgeslagen, maar de inhoud kon niet worden bijgewerkt.");
  if (requestedDefinitionIds.length) {
    const insert = await admin.from("badge_collection_items").insert(requestedDefinitionIds.map((definitionId, index) => ({
      collection_id: collectionId,
      catalog_definition_id: definitionId,
      sort_order: index
    })));
    if (insert.error) redirectWith(nextPath, "error", "De collectie is opgeslagen, maar niet alle badges konden worden gekoppeld.");
  }
  revalidateBadgePaths();
  redirectWith(nextPath, "success", id ? "Collectie bijgewerkt." : "Collectie aangemaakt.");
}

export async function archiveBadgeCollectionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges/collections");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const { data, error } = await createAdminClient()
    .from("badge_collections")
    .update({ status: "archived" })
    .eq("id", requireUuid(formData, "id"))
    .is("tenant_id", null)
    .select("id")
    .maybeSingle();
  if (error || !data) redirectWith(nextPath, "error", "De collectie kon niet worden gearchiveerd.");
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Collectie gearchiveerd.");
}

export async function saveBadgeThemeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges/themes");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const id = readUuid(formData, "id");
  const admin = createAdminClient();
  const isDefault = formData.get("isDefault") === "on";
  const values = {
    name: readRequired(formData, "name", 120),
    description: readOptional(formData, "description", 800),
    palette_json: {
      accent: readHexColor(formData, "accent", "#f59e0b"),
      ink: readHexColor(formData, "ink", "#10243e"),
      primary: readHexColor(formData, "primary", "#0877d1"),
      secondary: readHexColor(formData, "secondary", "#12b8a6"),
      surface: readHexColor(formData, "surface", "#ffffff")
    },
    status: readEnum(formData, "status", ["draft", "active", "archived"] as const, "draft")
  };
  if (isDefault && values.status !== "active") {
    redirectWith(nextPath, "error", "Alleen een actief thema kan platformstandaard zijn.");
  }
  const result = id
    ? await admin.from("badge_themes").update(isDefault ? values : { ...values, is_default: false }).eq("id", id).is("tenant_id", null).select("id").maybeSingle()
    : await admin.from("badge_themes").insert({
        ...values,
        tenant_id: null,
        theme_key: readKey(formData, "themeKey"),
        is_default: false,
        created_by_user_id: context.user.id
      }).select("id").maybeSingle();
  if (result.error || !result.data) {
    redirectWith(nextPath, "error", result.error?.code === "23505"
      ? "Deze themakey bestaat al."
      : "Het thema kon niet worden opgeslagen.");
  }
  if (isDefault) {
    const clearDefault = await admin.from("badge_themes").update({ is_default: false }).is("tenant_id", null).eq("is_default", true).neq("id", result.data.id);
    if (clearDefault.error) redirectWith(nextPath, "error", "Het thema is opgeslagen, maar kon niet als standaard worden ingesteld.");
    const setDefault = await admin.from("badge_themes").update({ is_default: true }).eq("id", result.data.id).is("tenant_id", null);
    if (setDefault.error) redirectWith(nextPath, "error", "Het thema is opgeslagen, maar kon niet als standaard worden ingesteld.");
  }
  revalidateBadgePaths();
  redirectWith(nextPath, "success", id ? "Thema bijgewerkt." : "Thema aangemaakt.");
}

export async function archiveBadgeThemeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges/themes");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen beheerrecht.");
  }
  const admin = createAdminClient();
  const id = requireUuid(formData, "id");
  const current = await admin.from("badge_themes").select("id, is_default").eq("id", id).is("tenant_id", null).maybeSingle();
  if (current.error || !current.data) redirectWith(nextPath, "error", "Het thema is niet gevonden.");
  if (current.data.is_default) redirectWith(nextPath, "error", "Kies eerst een ander platformstandaardthema.");
  const { data, error } = await admin
    .from("badge_themes")
    .update({ status: "archived", is_default: false })
    .eq("id", id)
    .is("tenant_id", null)
    .select("id")
    .maybeSingle();
  if (error || !data) redirectWith(nextPath, "error", "Het thema kon niet worden gearchiveerd.");
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Thema gearchiveerd.");
}

export async function saveTenantBadgeSettingsAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges/instellingen");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  const activeThemeId = readUuid(formData, "activeThemeId");
  const values = Object.fromEntries(tenantFlagNames.map((name) => [name, formData.get(name) === "on"]));
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_badge_module_settings").upsert({
    tenant_id: tenant.id,
    ...values,
    active_theme_id: activeThemeId,
    updated_by_user_id: context.user.id
  });
  if (error) redirectWith(nextPath, "error", error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Badge-instellingen opgeslagen.");
}

export async function saveTenantBadgeOverrideAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  const catalogDefinitionId = requireUuid(formData, "catalogDefinitionId");
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_badge_settings").upsert({
    tenant_id: tenant.id,
    catalog_definition_id: catalogDefinitionId,
    enabled: formData.get("enabled") === "on",
    name_default: readOptional(formData, "nameDefault", 120),
    name_boy: readOptional(formData, "nameBoy", 120),
    name_girl: readOptional(formData, "nameGirl", 120),
    description_default: readOptional(formData, "descriptionDefault", 800),
    description_boy: readOptional(formData, "descriptionBoy", 800),
    description_girl: readOptional(formData, "descriptionGirl", 800),
    share_text_default: readOptional(formData, "shareTextDefault", 800),
    share_text_boy: readOptional(formData, "shareTextBoy", 800),
    share_text_girl: readOptional(formData, "shareTextGirl", 800),
    notifications_enabled: readNullableCheckbox(formData, "notificationsEnabled"),
    emails_enabled: readNullableCheckbox(formData, "emailsEnabled"),
    share_enabled: readNullableCheckbox(formData, "shareEnabled"),
    updated_by_user_id: context.user.id
  }, { onConflict: "tenant_id,catalog_definition_id" });
  if (error) redirectWith(nextPath, "error", error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Tenantvariant opgeslagen.");
}

export async function saveCustomBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges/eigen");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  const id = readUuid(formData, "id");
  const admin = createAdminClient();
  const [platformResult, tenantSettingsResult] = await Promise.all([
    admin.from("platform_badge_settings").select("tenant_custom_badges_allowed").eq("id", true).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("custom_badges_enabled").eq("tenant_id", tenant.id).maybeSingle()
  ]);
  if (platformResult.data?.tenant_custom_badges_allowed === false || tenantSettingsResult.data?.custom_badges_enabled !== true) {
    redirectWith(nextPath, "error", "Eigen badges zijn nog niet geactiveerd.");
  }
  const nameDefault = readOptional(formData, "nameDefault", 120);
  const descriptionDefault = readOptional(formData, "descriptionDefault", 800);
  if (!nameDefault || !descriptionDefault) redirectWith(nextPath, "error", "Naam en beschrijving zijn verplicht.");
  const currentArtworkAssetId = formData.get("removeArtwork") === "on"
    ? null
    : readUuid(formData, "artworkAssetId");
  let storedArtwork: StoredBadgeStudioAsset | null = null;
  try {
    storedArtwork = await storeArtworkFromForm({
      file: formData.get("artwork"),
      name: nameDefault,
      scope: `tenant/${tenant.id}`,
      tenantId: tenant.id,
      userId: context.user.id
    });
  } catch (error) {
    redirectWith(nextPath, "error", error instanceof Error ? error.message : "Badge-artwork kon niet worden opgeslagen.");
  }
  const values = {
    name_default: nameDefault,
    name_boy: readOptional(formData, "nameBoy", 120),
    name_girl: readOptional(formData, "nameGirl", 120),
    description_default: descriptionDefault,
    description_boy: readOptional(formData, "descriptionBoy", 800),
    description_girl: readOptional(formData, "descriptionGirl", 800),
    share_text_default: readOptional(formData, "shareTextDefault", 800),
    share_text_boy: readOptional(formData, "shareTextBoy", 800),
    share_text_girl: readOptional(formData, "shareTextGirl", 800),
    category: readEnum(formData, "category", ["compliments", "courage", "technique", "specials"], "specials"),
    audience: readEnum(formData, "audience", ["all", "boys", "girls"], "all"),
    icon_name: readOptional(formData, "iconName", 80) ?? "sparkles",
    artwork_asset_id: storedArtwork?.asset.id ?? currentArtworkAssetId,
    is_surprise: formData.get("isSurprise") === "on",
    status: readEnum(formData, "status", ["draft", "active", "archived"], "draft"),
    updated_by_user_id: context.user.id
  };
  const result = id
    ? await admin.from("tenant_custom_badges").update(values).eq("tenant_id", tenant.id).eq("id", id).select("id").maybeSingle()
    : await admin.from("tenant_custom_badges").insert({
        tenant_id: tenant.id,
        badge_key: `custom_${readKey(formData, "badgeKey").replace(/^custom_/, "")}`,
        ...values,
        created_by_user_id: context.user.id
      }).select("id").maybeSingle();
  if (result.error || !result.data) {
    if (storedArtwork) await removeStoredBadgeStudioAsset(storedArtwork);
    const message = result.error?.code === "23505"
      ? "Deze eigen badgekey bestaat al."
      : "De eigen badge kon niet worden opgeslagen.";
    redirectWith(nextPath, "error", message);
  }
  revalidateBadgePaths();
  redirectWith(nextPath, "success", id ? "Eigen badge bijgewerkt." : "Eigen badge aangemaakt.");
}

export async function archiveCustomBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges/eigen");
  const { tenant } = await requireTenantBadgeAdmin(nextPath);
  const id = requireUuid(formData, "id");
  const { data, error } = await createAdminClient()
    .from("tenant_custom_badges")
    .update({ status: "archived" })
    .eq("tenant_id", tenant.id)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) redirectWith(nextPath, "error", "De eigen badge kon niet worden gearchiveerd.");
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Eigen badge gearchiveerd.");
}

export async function duplicateCustomBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges/eigen");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  const id = requireUuid(formData, "id");
  const admin = createAdminClient();
  const source = await admin.from("tenant_custom_badges").select("*").eq("tenant_id", tenant.id).eq("id", id).maybeSingle();
  if (source.error || !source.data) redirectWith(nextPath, "error", "Bronbadge niet gevonden.");
  const {
    id: _id,
    badge_key: sourceKey,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...copy
  } = source.data;
  const suffix = crypto.randomUUID().slice(0, 8);
  const result = await admin.from("tenant_custom_badges").insert({
    ...copy,
    badge_key: `${sourceKey}_copy_${suffix}`.slice(0, 120),
    name_default: `${source.data.name_default} (kopie)`.slice(0, 120),
    status: "draft",
    created_by_user_id: context.user.id,
    updated_by_user_id: context.user.id
  }).select("id").single();
  if (result.error) redirectWith(nextPath, "error", "De eigen badge kon niet worden gedupliceerd.");
  revalidateBadgePaths();
  redirectWith(`/admin/badges/eigen?edit=${result.data.id}`, "success", "Eigen badge gedupliceerd als concept.");
}

export async function awardPremiumBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) =>
    role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff" || role === "instructor"
  )) {
    redirectWith(nextPath, "error", "Geen badgebevoegdheid.");
  }
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirectWith(nextPath, "error", "Bevestig de handmatige toekenning.");
  }
  const result = await awardBadge({
    tenantId: tenant.id,
    participantId: requireUuid(formData, "participantId"),
    catalogDefinitionId: readUuid(formData, "catalogDefinitionId") ?? undefined,
    customBadgeId: readUuid(formData, "customBadgeId") ?? undefined,
    awardedByUserId: context.user.id,
    sourceSessionId: readUuid(formData, "sessionId"),
    eventType: "manual_award",
    eventEntityId: crypto.randomUUID(),
    customMessage: readOptional(formData, "message", 1_000),
    visibility: readEnum(formData, "visibility", ["internal", "parent_visible"] as const, "parent_visible")
  });
  if (!result.awarded && !result.pendingApproval) redirectWith(nextPath, "error", result.reason);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", result.reason);
}

export async function reviewBadgeAwardAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirectWith(nextPath, "error", "Bevestig de beoordeling.");
  }
  const awardId = requireUuid(formData, "awardId");
  const decision = readEnum(formData, "decision", ["approved", "rejected"], "rejected");
  const admin = createAdminClient();
  const awardResult = await admin
    .from("participant_badge_awards")
    .select("id, participant_id, title, note, visibility, status")
    .eq("tenant_id", tenant.id)
    .eq("id", awardId)
    .eq("status", "pending")
    .maybeSingle();
  if (awardResult.error || !awardResult.data) redirectWith(nextPath, "error", "Open badgeverzoek niet gevonden.");
  const { error } = await admin
    .from("participant_badge_awards")
    .update({
      status: decision === "approved" ? "awarded" : "rejected",
      approval_status: decision,
      reviewed_by_user_id: context.user.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: decision === "rejected" ? readOptional(formData, "reason", 500) ?? "Niet goedgekeurd." : null,
      delivery_status: decision === "approved" ? "queued" : "not_requested",
      awarded_at: decision === "approved" ? new Date().toISOString() : undefined
    })
    .eq("tenant_id", tenant.id)
    .eq("id", awardId);
  if (error) redirectWith(nextPath, "error", error.message);
  if (decision === "approved" && awardResult.data.visibility === "parent_visible") {
    await notifyApprovedAward({
      tenantId: tenant.id,
      participantId: awardResult.data.participant_id,
      awardId,
      title: awardResult.data.title,
      message: awardResult.data.note ?? "Een mooie stap in de zwemreis."
    });
  }
  await admin.from("badge_analytics_events").insert({
    tenant_id: tenant.id,
    participant_id: awardResult.data.participant_id,
    award_id: awardId,
    event_type: decision,
    actor_profile_id: context.user.id,
    metadata_json: { humanConfirmed: true }
  });
  revalidateBadgePaths();
  redirectWith(nextPath, "success", decision === "approved" ? "Badge goedgekeurd." : "Badge afgewezen.");
}

export async function revokeBadgeAwardAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/badges");
  const { context, tenant } = await requireTenantBadgeAdmin(nextPath);
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirectWith(nextPath, "error", "Bevestig dat je de badge wilt intrekken.");
  }
  const awardId = requireUuid(formData, "awardId");
  const reason = readRequired(formData, "reason", 500);
  const admin = createAdminClient();
  const awardResult = await admin.from("participant_badge_awards").select("participant_id").eq("tenant_id", tenant.id).eq("id", awardId).maybeSingle();
  if (!awardResult.data) redirectWith(nextPath, "error", "Badge niet gevonden.");
  const { error } = await admin.from("participant_badge_awards").update({
    status: "revoked",
    rejection_reason: reason,
    reviewed_by_user_id: context.user.id,
    reviewed_at: new Date().toISOString()
  }).eq("tenant_id", tenant.id).eq("id", awardId);
  if (error) redirectWith(nextPath, "error", error.message);
  await admin.from("badge_analytics_events").insert({
    tenant_id: tenant.id,
    participant_id: awardResult.data.participant_id,
    award_id: awardId,
    event_type: "revoked",
    actor_profile_id: context.user.id,
    metadata_json: { reason, humanConfirmed: true }
  });
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Badge ingetrokken; het auditrecord blijft bewaard.");
}

export async function saveBadgeTemplateAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/platform/badges/share-templates");
  const context = await requirePrivateShellContext(nextPath);
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    redirectWith(nextPath, "error", "Geen templatebeheerrecht.");
  }
  const templateId = requireUuid(formData, "templateId");
  const format = readEnum(formData, "format", badgeFormats, "square");
  const dimensions = badgeFormatDimensions[format];
  const submittedVersion = readInteger(formData, "version", 1, Number.MAX_SAFE_INTEGER, 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readRequired(formData, "layersJson", 100_000));
  } catch {
    redirectWith(nextPath, "error", "De laagopbouw is geen geldige JSON.");
  }
  const layers = validateBadgeLayers(parsed, dimensions);
  if (!layers.length) redirectWith(nextPath, "error", "Voeg minimaal één geldige laag toe.");
  const admin = createAdminClient();
  const templateResult = await admin
    .from("badge_share_templates")
    .select("id, template_set_id, format, version")
    .eq("id", templateId)
    .maybeSingle();
  if (templateResult.error || !templateResult.data) {
    redirectWith(nextPath, "error", "Sharetemplate niet gevonden.");
  }
  if (templateResult.data.format !== format) {
    redirectWith(nextPath, "error", "Het templateformaat kan niet via de editor worden gewijzigd.");
  }
  const templateSetResult = await admin
    .from("badge_share_template_sets")
    .select("id, tenant_id")
    .eq("id", templateResult.data.template_set_id)
    .maybeSingle();
  if (templateSetResult.error || !templateSetResult.data || templateSetResult.data.tenant_id !== null) {
    redirectWith(nextPath, "error", "Alleen platformtemplates kunnen hier worden bewerkt.");
  }
  if (templateResult.data.version !== submittedVersion) {
    redirectWith(nextPath, "error", "Deze template is intussen gewijzigd. Herlaad de pagina en voeg je wijziging opnieuw toe.");
  }
  const imageAssetIds = [...new Set(layers.flatMap((layer) => layer.type === "image" && layer.assetId ? [layer.assetId] : []))];
  if (imageAssetIds.length) {
    const assets = await admin
      .from("badge_studio_assets")
      .select("id")
      .is("tenant_id", null)
      .eq("purpose", "template_image")
      .eq("status", "active")
      .in("id", imageAssetIds);
    if (assets.error || (assets.data ?? []).length !== imageAssetIds.length) {
      redirectWith(nextPath, "error", "Een gebruikte afbeelding is niet meer beschikbaar.");
    }
  }
  const result = await admin.from("badge_share_templates").update({
    format,
    width: dimensions.width,
    height: dimensions.height,
    layers_json: layers,
    status: readEnum(formData, "status", ["draft", "published", "archived"], "draft"),
    version: submittedVersion + 1
  }).eq("id", templateId).eq("version", submittedVersion).select("id").maybeSingle();
  if (result.error) redirectWith(nextPath, "error", "De sharetemplate kon niet worden opgeslagen.");
  if (!result.data) {
    redirectWith(nextPath, "error", "Opslaan is gestopt omdat een nieuwere templateversie bestaat.");
  }
  revalidateBadgePaths();
  redirectWith(nextPath, "success", `Sharetemplate opgeslagen als versie ${submittedVersion + 1}.`);
}

export async function uploadBadgeStudioAssetAction(formData: FormData): Promise<{
  asset?: BadgeStudioAsset;
  message: string;
  ok: boolean;
}> {
  const context = await requirePrivateShellContext("/platform/badges/share-templates");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    return { message: "Geen recht om studio-afbeeldingen toe te voegen.", ok: false };
  }
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return { message: "Kies eerst een JPEG- of PNG-afbeelding.", ok: false };
  }

  try {
    const stored = await storeBadgeStudioAsset({
      file,
      name: readOptional(formData, "name", 120) ?? file.name.replace(/\.[^.]+$/, ""),
      purpose: "template_image",
      scope: "platform",
      tenantId: null,
      userId: context.user.id
    });

    return {
      asset: stored.asset,
      message: "Afbeelding toegevoegd aan de bibliotheek.",
      ok: true
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "De afbeelding kon niet worden toegevoegd.",
      ok: false
    };
  }
}

export async function saveParentBadgePreferencesAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/badges");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.includes("parent")) redirectWith(nextPath, "error", "Geen oudertoegang.");
  const admin = createAdminClient();
  const { error } = await admin.from("guardian_communication_preferences").upsert({
    tenant_id: tenant.id,
    guardian_user_id: context.user.id,
    badge_notifications_enabled: formData.get("badgeNotificationsEnabled") === "on",
    badge_emails_enabled: formData.get("badgeEmailsEnabled") === "on",
    badge_sharing_enabled: formData.get("badgeSharingEnabled") === "on",
    show_unearned_badges: formData.get("showUnearnedBadges") === "on",
    share_first_name_only: true
  }, { onConflict: "tenant_id,guardian_user_id" });
  if (error) redirectWith(nextPath, "error", error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Badgevoorkeuren opgeslagen.");
}

export async function generateBadgeShareAssetAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/badges");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.includes("parent")) redirectWith(nextPath, "error", "Geen oudertoegang.");
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirectWith(nextPath, "error", "Bevestig dat je een deelafbeelding wilt maken.");
  }
  const awardId = requireUuid(formData, "awardId");
  const format = readEnum(formData, "format", badgeFormats, "square");
  const admin = createAdminClient();
  const awardResult = await admin
    .from("participant_badge_awards")
    .select("id, participant_id, title, resolved_name, resolved_description, resolved_share_text, resolved_artwork_asset_id, catalog_definition_id, custom_badge_id, participant_gender_snapshot, status, visibility")
    .eq("tenant_id", tenant.id)
    .eq("id", awardId)
    .maybeSingle();
  const award = awardResult.data;
  if (awardResult.error || !award || award.status !== "awarded" || award.visibility !== "parent_visible") {
    redirectWith(nextPath, "error", "Deze badge kan niet worden gedeeld.");
  }

  const [participantResult, preferencesResult, settingsResult, platformResult, templateSetsResult, guardianLinkResult] = await Promise.all([
    admin.from("participants").select("id, display_name, guardian_user_id").eq("tenant_id", tenant.id).eq("id", award.participant_id).maybeSingle(),
    admin.from("guardian_communication_preferences").select("badge_sharing_enabled").eq("tenant_id", tenant.id).eq("guardian_user_id", context.user.id).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("share_images_enabled").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("platform_badge_settings").select("share_images_available").eq("id", true).maybeSingle(),
    admin
      .from("badge_share_template_sets")
      .select("id, tenant_id, is_default, status")
      .eq("status", "published")
      .or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`),
    admin.from("participant_guardians").select("id").eq("tenant_id", tenant.id).eq("participant_id", award.participant_id).eq("guardian_user_id", context.user.id).eq("status", "active").maybeSingle()
  ]);
  if (
    participantResult.error ||
    preferencesResult.error ||
    settingsResult.error ||
    platformResult.error ||
    templateSetsResult.error ||
    guardianLinkResult.error
  ) {
    redirectWith(nextPath, "error", "De deelrechten konden niet veilig worden gecontroleerd.");
  }
  const participant = participantResult.data;
  if (!participant) redirectWith(nextPath, "error", "De leerling is niet beschikbaar.");
  const linked = participant.guardian_user_id === context.user.id ||
    Boolean(guardianLinkResult.data);
  if (
    !linked ||
    preferencesResult.data?.badge_sharing_enabled === false ||
    settingsResult.data?.share_images_enabled === false ||
    platformResult.data?.share_images_available === false
  ) {
    redirectWith(nextPath, "error", "Delen is niet toegestaan volgens de huidige voorkeuren.");
  }

  const templateSet = selectBadgeTemplateSet(templateSetsResult.data ?? [], tenant.id);
  if (!templateSet) {
    redirectWith(nextPath, "error", "Er is geen gepubliceerde sharetemplateset beschikbaar.");
  }
  const templateResult = await admin
    .from("badge_share_templates")
    .select("id, format, width, height, layers_json, version, status")
    .eq("template_set_id", templateSet.id)
    .eq("format", format)
    .eq("status", "published")
    .maybeSingle();
  const template = templateResult.data;
  if (templateResult.error || !template) {
    redirectWith(nextPath, "error", "Voor dit formaat is geen gepubliceerde sharetemplate beschikbaar.");
  }
  const dimensions = {
    height: Number(template.height),
    width: Number(template.width)
  };
  const layers = validateBadgeLayers(template.layers_json, dimensions);
  if (!layers.length) redirectWith(nextPath, "error", "De gepubliceerde sharetemplate bevat geen geldige lagen.");

  const [catalogBadgeResult, customBadgeResult, badgeOverrideResult] = await Promise.all([
    award.catalog_definition_id
      ? admin.from("badge_catalog_definitions").select("artwork_asset_id, share_enabled").eq("id", award.catalog_definition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    award.custom_badge_id
      ? admin.from("tenant_custom_badges").select("artwork_asset_id").eq("tenant_id", tenant.id).eq("id", award.custom_badge_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    award.catalog_definition_id
      ? admin.from("tenant_badge_settings").select("share_enabled").eq("tenant_id", tenant.id).eq("catalog_definition_id", award.catalog_definition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);
  if (catalogBadgeResult.error || customBadgeResult.error || badgeOverrideResult.error) {
    redirectWith(nextPath, "error", "De badge-instellingen konden niet veilig worden gecontroleerd.");
  }
  if (catalogBadgeResult.data?.share_enabled === false || badgeOverrideResult.data?.share_enabled === false) {
    redirectWith(nextPath, "error", "Delen is voor deze badge uitgeschakeld.");
  }
  const artworkAssetId = award.resolved_artwork_asset_id as string | null ??
    catalogBadgeResult.data?.artwork_asset_id ??
    customBadgeResult.data?.artwork_asset_id ??
    null;
  const templateAssetIds = layers.flatMap((layer) =>
    layer.type === "image" && layer.assetId ? [layer.assetId] : []
  );
  let assetDataUrls: Map<string, string>;
  try {
    assetDataUrls = await loadBadgeAssetDataUrls(
      [...new Set([...templateAssetIds, ...(artworkAssetId ? [artworkAssetId] : [])])],
      tenant.id,
      artworkAssetId
    );
  } catch {
    redirectWith(nextPath, "error", "Een afbeelding uit de sharetemplate is niet meer beschikbaar.");
  }
  let preview: string;
  try {
    preview = await renderBadgeSharePngDataUrl({
      assetDataUrls,
      badgeArtworkDataUrl: artworkAssetId ? assetDataUrls.get(artworkAssetId) : null,
      context: {
        badgeDescription: award.resolved_description ?? "Een mooie stap in de zwemreis.",
        badgeName: award.resolved_name ?? award.title,
        childFirstName: participant.display_name,
        gender: normalizeBadgeGender(award.participant_gender_snapshot),
        organizationName: tenant.name
      },
      height: dimensions.height,
      layers,
      width: dimensions.width
    });
  } catch {
    redirectWith(nextPath, "error", "De deelafbeelding kon niet veilig worden gerenderd.");
  }

  const firstName = participant.display_name.split(/\s+/)[0] || "Kind";
  const caption = award.resolved_share_text ?? `${firstName} behaalde ${award.title}!`;
  const { error } = await admin.from("badge_share_assets").upsert({
    tenant_id: tenant.id,
    award_id: awardId,
    template_id: template.id,
    template_version: template.version,
    requested_by_user_id: context.user.id,
    format,
    status: "generated",
    preview_data_url: preview,
    caption,
    rendered_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()
  }, { onConflict: "tenant_id,award_id,format" });
  if (error) redirectWith(nextPath, "error", "De deelafbeelding kon niet worden opgeslagen.");
  const awardUpdate = await admin.from("participant_badge_awards").update({ share_status: "generated" }).eq("tenant_id", tenant.id).eq("id", awardId);
  if (awardUpdate.error) redirectWith(nextPath, "error", "De deelafbeelding is gemaakt, maar de badgestatus kon niet worden bijgewerkt.");
  await admin.from("badge_analytics_events").insert({
    tenant_id: tenant.id,
    participant_id: award.participant_id,
    award_id: awardId,
    event_type: "shared",
    actor_profile_id: context.user.id,
    metadata_json: {
      format,
      generatedOnly: true,
      templateId: template.id,
      templateVersion: template.version
    }
  });
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Veilige deelafbeelding gemaakt.");
}

async function requireTenantBadgeAdmin(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) =>
    role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff"
  )) {
    redirectWith(path, "error", "Geen beheerrecht.");
  }
  return { context, tenant };
}

async function notifyApprovedAward(input: { awardId: string; message: string; participantId: string; tenantId: string; title: string }) {
  const admin = createAdminClient();
  const [participantResult, guardiansResult, settingsResult] = await Promise.all([
    admin.from("participants").select("guardian_user_id, display_name").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin.from("participant_guardians").select("guardian_user_id").eq("tenant_id", input.tenantId).eq("participant_id", input.participantId).eq("status", "active"),
    admin.from("tenant_badge_module_settings").select("badge_notifications_enabled, badge_emails_enabled").eq("tenant_id", input.tenantId).maybeSingle()
  ]);
  const recipientIds = [
    participantResult.data?.guardian_user_id,
    ...(guardiansResult.data ?? []).map((guardian) => guardian.guardian_user_id)
  ].filter((value): value is string => Boolean(value));
  await createTenantNotifications({
    tenantId: input.tenantId,
    recipientIds,
    participantId: input.participantId,
    relatedBadgeAwardId: input.awardId,
    type: "badge_award",
    title: `Nieuwe badge: ${input.title}`,
    message: input.message,
    actionHref: "/portaal/badges",
    entityType: "badge_award",
    entityId: input.awardId,
    deliverEmail: settingsResult.data?.badge_emails_enabled === true
  });
  await admin.from("participant_badge_awards").update({
    delivery_status: recipientIds.length && settingsResult.data?.badge_notifications_enabled !== false ? "sent" : "skipped"
  }).eq("tenant_id", input.tenantId).eq("id", input.awardId);
}

type StoredBadgeStudioAsset = {
  asset: BadgeStudioAsset;
  storageBucket: string;
  storagePath: string;
};

async function storeArtworkFromForm(input: {
  file: FormDataEntryValue | null;
  name: string;
  scope: string;
  tenantId: string | null;
  userId: string;
}) {
  if (!(input.file instanceof File) || input.file.size === 0) return null;
  return storeBadgeStudioAsset({
    file: input.file,
    name: input.name,
    purpose: "badge_artwork",
    scope: input.scope,
    tenantId: input.tenantId,
    userId: input.userId
  });
}

async function storeBadgeStudioAsset(input: {
  file: File;
  name: string;
  purpose: "badge_artwork" | "template_image";
  scope: string;
  tenantId: string | null;
  userId: string;
}): Promise<StoredBadgeStudioAsset> {
  const assetId = crypto.randomUUID();
  const uploaded = await uploadBadgeStudioAssetFile({
    assetId,
    file: input.file,
    scope: input.scope
  });
  const admin = createAdminClient();
  const name = input.name.trim().slice(0, 120) ||
    input.file.name.replace(/\.[^.]+$/, "").slice(0, 120) ||
    "Afbeelding";
  const { error } = await admin.from("badge_studio_assets").insert({
    id: assetId,
    tenant_id: input.tenantId,
    name,
    purpose: input.purpose,
    storage_bucket: uploaded.storageBucket,
    storage_path: uploaded.filePath,
    mime_type: uploaded.mimeType,
    size_bytes: uploaded.sizeBytes,
    sha256: uploaded.scan.sha256,
    malware_scan_status: uploaded.scan.status,
    status: "active",
    uploaded_by_user_id: input.userId
  });
  if (error) {
    await admin.storage.from(uploaded.storageBucket).remove([uploaded.filePath]);
    throw new Error("De afbeelding kon niet in de bibliotheek worden opgeslagen.");
  }
  return {
    asset: {
      id: assetId,
      mimeType: uploaded.mimeType as BadgeStudioAsset["mimeType"],
      name,
      sizeBytes: uploaded.sizeBytes,
      url: `/api/files/badge-studio-asset/${assetId}`
    },
    storageBucket: uploaded.storageBucket,
    storagePath: uploaded.filePath
  };
}

async function removeStoredBadgeStudioAsset(stored: StoredBadgeStudioAsset) {
  const admin = createAdminClient();
  await admin.from("badge_studio_assets").delete().eq("id", stored.asset.id);
  await admin.storage.from(stored.storageBucket).remove([stored.storagePath]);
}

function selectBadgeTemplateSet(
  rows: Array<{ id: string; is_default: boolean; status: string; tenant_id: string | null }>,
  tenantId: string
) {
  return rows.find((row) => row.tenant_id === tenantId && row.is_default) ??
    rows.find((row) => row.tenant_id === null && row.is_default) ??
    rows.find((row) => row.tenant_id === tenantId) ??
    rows.find((row) => row.tenant_id === null);
}

async function loadBadgeAssetDataUrls(assetIds: string[], tenantId: string, artworkAssetId: string | null) {
  const dataUrls = new Map<string, string>();
  if (!assetIds.length) return dataUrls;
  const admin = createAdminClient();
  const result = await admin
    .from("badge_studio_assets")
    .select("id, tenant_id, purpose, storage_bucket, storage_path, mime_type, malware_scan_status, status")
    .in("id", assetIds);
  if (result.error || (result.data ?? []).length !== assetIds.length) {
    throw new Error("Badge asset metadata is incomplete.");
  }
  for (const asset of result.data ?? []) {
    const allowedScope = asset.tenant_id === null || asset.tenant_id === tenantId;
    const expectedPurpose = asset.id === artworkAssetId ? "badge_artwork" : "template_image";
    const downloadable = asset.malware_scan_status === "clean" ||
      (process.env.NODE_ENV !== "production" && asset.malware_scan_status === "not_required");
    if (!allowedScope || asset.purpose !== expectedPurpose || asset.status !== "active" || !downloadable) {
      throw new Error("Badge asset is unavailable.");
    }
    const download = await admin.storage.from(asset.storage_bucket).download(asset.storage_path);
    if (download.error || !download.data) throw new Error("Badge asset bytes are unavailable.");
    const bytes = Buffer.from(await download.data.arrayBuffer());
    dataUrls.set(asset.id, `data:${asset.mime_type};base64,${bytes.toString("base64")}`);
  }
  return dataUrls;
}

function revalidateBadgePaths() {
  for (const path of ["/platform/badges", "/platform/badges/collections", "/platform/badges/themes", "/platform/badges/share-templates", "/platform/badges/analytics", "/admin/badges", "/admin/badges/instellingen", "/admin/badges/eigen", "/admin/badges/collecties", "/admin/badges/analytics", "/instructor", "/portaal/badges"]) {
    revalidatePath(path);
  }
}

function redirectWith(path: `/${string}`, key: "error" | "success", message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(message)}`);
}

function readRequired(formData: FormData, name: string, maxLength: number) {
  const value = readOptional(formData, name, maxLength);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptional(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

function readKey(formData: FormData, name: string) {
  const value = readRequired(formData, name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!value) throw new Error(`${name} is not a valid key`);
  return value;
}

function readUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return readUuidValue(value);
}

function readUuidValue(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function requireUuid(formData: FormData, name: string) {
  const value = readUuid(formData, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readEnum<T extends string>(formData: FormData, name: string, values: readonly T[], fallback: T) {
  const value = String(formData.get(name) ?? "");
  return values.includes(value as T) ? value as T : fallback;
}

function readNullableCheckbox(formData: FormData, name: string) {
  const mode = String(formData.get(`${name}Mode`) ?? "inherit");
  return mode === "inherit" ? null : formData.get(name) === "on";
}

function readInteger(formData: FormData, name: string, minimum: number, maximum: number, fallback: number) {
  const value = Number(formData.get(name));
  if (!Number.isInteger(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function readJsonObject(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return {};
  if (value.length > 10_000) throw new Error(`${name} is too large`);
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function readHexColor(formData: FormData, name: string, fallback: string) {
  const value = String(formData.get(name) ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(value) ? value : fallback;
}
