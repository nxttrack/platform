import "server-only";

import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BadgeStudioAsset } from "./badge-system-contract";
import { getActiveTenant } from "./core";

export async function getPlatformBadgeData() {
  const context = await requirePrivateShellContext("/platform/badges");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin" || role === "platform_support")) {
    redirect("/platform?error=forbidden");
  }
  const admin = createAdminClient();
  const [settings, definitions, collections, themes, templateSets, templates, events] = await Promise.all([
    admin.from("platform_badge_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("badge_catalog_definitions").select("*").order("sort_order").order("name_default"),
    admin.from("badge_collections").select("*").is("tenant_id", null).order("sort_order"),
    admin.from("badge_themes").select("*").is("tenant_id", null).order("name"),
    admin.from("badge_share_template_sets").select("*").is("tenant_id", null).order("name"),
    admin.from("badge_share_templates").select("*").order("format"),
    admin.from("badge_analytics_events").select("id, tenant_id, event_type, occurred_at, metadata_json, is_test").order("occurred_at", { ascending: false }).limit(250)
  ]);
  assertResults([
    ["platform badge settings", settings.error],
    ["badge catalog", definitions.error],
    ["badge collections", collections.error],
    ["badge themes", themes.error],
    ["badge template sets", templateSets.error],
    ["badge templates", templates.error],
    ["badge analytics", events.error]
  ]);
  const tenantIds = [...new Set((events.data ?? []).map((event) => event.tenant_id))];
  const tenants = tenantIds.length
    ? await admin.from("tenants").select("id, name, slug").in("id", tenantIds)
    : { data: [], error: null };
  assertResults([["badge analytics tenants", tenants.error]]);

  return {
    canManage: context.platform.roles.some((role) => role === "platform_owner" || role === "platform_admin"),
    settings: settings.data,
    definitions: definitions.data ?? [],
    collections: collections.data ?? [],
    themes: themes.data ?? [],
    templateSets: templateSets.data ?? [],
    templates: templates.data ?? [],
    events: events.data ?? [],
    tenants: tenants.data ?? []
  };
}

export async function getTenantBadgeData() {
  const context = await requirePrivateShellContext("/admin/badges");
  const tenant = getActiveTenant(context);
  const canManage = context.activeTenant?.roles.some((role) =>
    role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff"
  ) === true;
  if (!canManage) redirect("/admin?error=forbidden");

  const admin = createAdminClient();
  const [platformSettings, settings, definitions, overrides, customBadges, collections, themes, awards, events, participants, suggestions] = await Promise.all([
    admin.from("platform_badge_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("badge_catalog_definitions").select("*").eq("status", "active").order("sort_order"),
    admin.from("tenant_badge_settings").select("*").eq("tenant_id", tenant.id),
    admin.from("tenant_custom_badges").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    admin.from("badge_collections").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`).order("sort_order"),
    admin.from("badge_themes").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`).order("name"),
    admin.from("participant_badge_awards").select("*").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(250),
    admin.from("badge_analytics_events").select("*").eq("tenant_id", tenant.id).order("occurred_at", { ascending: false }).limit(250),
    admin.from("participants").select("id, display_name, gender, status, is_test").eq("tenant_id", tenant.id).order("display_name"),
    admin.from("badge_message_suggestions").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`).eq("status", "active").order("sort_order")
  ]);
  assertResults([
    ["platform badge settings", platformSettings.error],
    ["tenant badge settings", settings.error],
    ["badge catalog", definitions.error],
    ["badge overrides", overrides.error],
    ["custom badges", customBadges.error],
    ["badge collections", collections.error],
    ["badge themes", themes.error],
    ["badge awards", awards.error],
    ["badge analytics", events.error],
    ["badge participants", participants.error],
    ["badge suggestions", suggestions.error]
  ]);

  return {
    tenant,
    platformSettings: platformSettings.data,
    settings: settings.data,
    definitions: definitions.data ?? [],
    overrides: overrides.data ?? [],
    customBadges: customBadges.data ?? [],
    collections: collections.data ?? [],
    themes: themes.data ?? [],
    awards: awards.data ?? [],
    events: events.data ?? [],
    participants: participants.data ?? [],
    suggestions: suggestions.data ?? []
  };
}

export async function getParentBadgeWallData() {
  const context = await requirePrivateShellContext("/portaal/badges");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.includes("parent")) redirect("/portaal?error=forbidden");
  const admin = createAdminClient();
  const [participants, guardianLinks, settings, preferences, catalog, overrides, customBadges, awards, collections, collectionItems, shareAssets] = await Promise.all([
    admin.from("participants").select("id, display_name, gender, status").eq("tenant_id", tenant.id).eq("guardian_user_id", context.user.id),
    admin.from("participant_guardians").select("participant_id").eq("tenant_id", tenant.id).eq("guardian_user_id", context.user.id).eq("status", "active"),
    admin.from("tenant_badge_module_settings").select("*").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("guardian_communication_preferences").select("*").eq("tenant_id", tenant.id).eq("guardian_user_id", context.user.id).maybeSingle(),
    admin.from("badge_catalog_definitions").select("*").eq("status", "active").order("sort_order"),
    admin.from("tenant_badge_settings").select("*").eq("tenant_id", tenant.id),
    admin.from("tenant_custom_badges").select("*").eq("tenant_id", tenant.id).eq("status", "active"),
    admin.from("participant_badge_awards").select("*").eq("tenant_id", tenant.id).eq("visibility", "parent_visible").eq("status", "awarded").order("awarded_at", { ascending: false }),
    admin.from("badge_collections").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenant.id}`).eq("status", "active").order("sort_order"),
    admin.from("badge_collection_items").select("*").order("sort_order"),
    admin.from("badge_share_assets").select("*").eq("tenant_id", tenant.id)
  ]);
  assertResults([
    ["parent participants", participants.error],
    ["parent guardian links", guardianLinks.error],
    ["badge module settings", settings.error],
    ["guardian badge preferences", preferences.error],
    ["badge catalog", catalog.error],
    ["badge overrides", overrides.error],
    ["custom badges", customBadges.error],
    ["badge awards", awards.error],
    ["badge collections", collections.error],
    ["badge collection items", collectionItems.error],
    ["badge share assets", shareAssets.error]
  ]);
  const participantIds = new Set([
    ...(participants.data ?? []).map((participant) => participant.id),
    ...(guardianLinks.data ?? []).map((link) => link.participant_id)
  ]);
  const linkedParticipants = participantIds.size
    ? await admin.from("participants").select("id, display_name, gender, status").eq("tenant_id", tenant.id).in("id", [...participantIds])
    : { data: [], error: null };
  assertResults([["linked participants", linkedParticipants.error]]);

  return {
    tenant,
    userId: context.user.id,
    settings: settings.data,
    preferences: preferences.data,
    participants: linkedParticipants.data ?? [],
    catalog: catalog.data ?? [],
    overrides: overrides.data ?? [],
    customBadges: customBadges.data ?? [],
    awards: (awards.data ?? []).filter((award) => participantIds.has(award.participant_id)),
    collections: collections.data ?? [],
    collectionItems: collectionItems.data ?? [],
    shareAssets: (shareAssets.data ?? []).filter((asset) =>
      (awards.data ?? []).some((award) => award.id === asset.award_id && participantIds.has(award.participant_id))
    )
  };
}

export async function getBadgeEditorData(templateId?: string) {
  const data = await getPlatformBadgeData();
  const admin = createAdminClient();
  const assetsResult = await admin
    .from("badge_studio_assets")
    .select("id, name, storage_bucket, storage_path, mime_type, size_bytes")
    .is("tenant_id", null)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  assertResults([["badge studio assets", assetsResult.error]]);
  const assets = (await Promise.all((assetsResult.data ?? []).map(async (asset): Promise<BadgeStudioAsset | null> => {
    const signed = await admin.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) return null;
    return {
      id: asset.id,
      mimeType: asset.mime_type as BadgeStudioAsset["mimeType"],
      name: asset.name,
      signedUrl: signed.data.signedUrl,
      sizeBytes: Number(asset.size_bytes)
    };
  }))).filter((asset): asset is BadgeStudioAsset => asset !== null);
  const selected = templateId
    ? data.templates.find((template) => template.id === templateId)
    : data.templates.find((template) => template.format === "square") ?? data.templates[0];
  return { ...data, assets, selected };
}

function assertResults(results: Array<[string, { message: string } | null]>) {
  const failure = results.find(([, error]) => error);
  if (failure) throw new Error(`Could not load ${failure[0]}: ${failure[1]?.message}`);
}
