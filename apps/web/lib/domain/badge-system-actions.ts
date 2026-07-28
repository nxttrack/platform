"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadBadgeStudioAssetFile } from "@/lib/storage/private-files";
import { awardBadge } from "./badge-engine";
import { badgeFormats, validateBadgeLayers, type BadgeStudioAsset } from "./badge-system-contract";
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
  const values = {
    name_default: readRequired(formData, "nameDefault", 120),
    name_boy: readOptional(formData, "nameBoy", 120),
    name_girl: readOptional(formData, "nameGirl", 120),
    description_default: readRequired(formData, "descriptionDefault", 800),
    description_boy: readOptional(formData, "descriptionBoy", 800),
    description_girl: readOptional(formData, "descriptionGirl", 800),
    share_text_default: readOptional(formData, "shareTextDefault", 800),
    share_text_boy: readOptional(formData, "shareTextBoy", 800),
    share_text_girl: readOptional(formData, "shareTextGirl", 800),
    status: readEnum(formData, "status", ["draft", "active", "archived"], "active")
  };
  const result = id
    ? await admin.from("badge_catalog_definitions").update(values).eq("id", id)
    : await admin.from("badge_catalog_definitions").insert({
        ...values,
        badge_key: readKey(formData, "badgeKey"),
        category: readEnum(formData, "category", ["start", "attendance", "skills", "stages", "diplomas", "makeup", "compliments", "courage", "technique", "specials"], "specials"),
        badge_type: readEnum(formData, "badgeType", ["automatic", "manual"], "manual"),
        trigger_type: readOptional(formData, "triggerType", 120),
        audience: readEnum(formData, "audience", ["all", "boys", "girls"], "all")
      });
  if (result.error) redirectWith(nextPath, "error", result.error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Badgecanon opgeslagen.");
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
  const values = {
    name_default: readRequired(formData, "nameDefault", 120),
    name_boy: readOptional(formData, "nameBoy", 120),
    name_girl: readOptional(formData, "nameGirl", 120),
    description_default: readRequired(formData, "descriptionDefault", 800),
    description_boy: readOptional(formData, "descriptionBoy", 800),
    description_girl: readOptional(formData, "descriptionGirl", 800),
    share_text_default: readOptional(formData, "shareTextDefault", 800),
    share_text_boy: readOptional(formData, "shareTextBoy", 800),
    share_text_girl: readOptional(formData, "shareTextGirl", 800),
    category: readEnum(formData, "category", ["compliments", "courage", "technique", "specials"], "specials"),
    audience: readEnum(formData, "audience", ["all", "boys", "girls"], "all"),
    icon_name: readOptional(formData, "iconName", 80) ?? "sparkles",
    is_surprise: formData.get("isSurprise") === "on",
    status: readEnum(formData, "status", ["draft", "active", "archived"], "draft")
  };
  const result = id
    ? await admin.from("tenant_custom_badges").update(values).eq("tenant_id", tenant.id).eq("id", id)
    : await admin.from("tenant_custom_badges").insert({
        tenant_id: tenant.id,
        badge_key: `custom_${readKey(formData, "badgeKey").replace(/^custom_/, "")}`,
        ...values,
        created_by_user_id: context.user.id
      });
  if (result.error) redirectWith(nextPath, "error", result.error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Eigen badge opgeslagen.");
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(readRequired(formData, "layersJson", 100_000));
  } catch {
    redirectWith(nextPath, "error", "De laagopbouw is geen geldige JSON.");
  }
  const layers = validateBadgeLayers(parsed);
  if (!layers.length) redirectWith(nextPath, "error", "Voeg minimaal één geldige laag toe.");
  const admin = createAdminClient();
  const imageAssetIds = [...new Set(layers.flatMap((layer) => layer.type === "image" && layer.assetId ? [layer.assetId] : []))];
  if (imageAssetIds.length) {
    const assets = await admin
      .from("badge_studio_assets")
      .select("id")
      .is("tenant_id", null)
      .eq("status", "active")
      .in("id", imageAssetIds);
    if (assets.error || (assets.data ?? []).length !== imageAssetIds.length) {
      redirectWith(nextPath, "error", "Een gebruikte afbeelding is niet meer beschikbaar.");
    }
  }
  const { error } = await admin.from("badge_share_templates").update({
    format,
    layers_json: layers,
    status: readEnum(formData, "status", ["draft", "published", "archived"], "draft"),
    version: Number(readOptional(formData, "version", 12) ?? "1") + 1
  }).eq("id", templateId);
  if (error) redirectWith(nextPath, "error", error.message);
  revalidateBadgePaths();
  redirectWith(nextPath, "success", "Sharetemplate opgeslagen.");
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

  const assetId = crypto.randomUUID();
  const admin = createAdminClient();
  let uploaded: Awaited<ReturnType<typeof uploadBadgeStudioAssetFile>> | null = null;

  try {
    uploaded = await uploadBadgeStudioAssetFile({ assetId, file });
    const name = (readOptional(formData, "name", 120) ?? file.name.replace(/\.[^.]+$/, "")).trim().slice(0, 120) || "Afbeelding";
    const signed = await admin.storage.from(uploaded.storageBucket).createSignedUrl(uploaded.filePath, 60 * 60);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error("De afbeelding kon niet veilig worden voorbereid.");
    }
    const { error } = await admin.from("badge_studio_assets").insert({
      id: assetId,
      tenant_id: null,
      name,
      storage_bucket: uploaded.storageBucket,
      storage_path: uploaded.filePath,
      mime_type: uploaded.mimeType,
      size_bytes: uploaded.sizeBytes,
      sha256: uploaded.scan.sha256,
      malware_scan_status: uploaded.scan.status,
      status: "active",
      uploaded_by_user_id: context.user.id
    });
    if (error) throw new Error("De afbeelding kon niet in de bibliotheek worden opgeslagen.");
    const storedUpload = uploaded;
    uploaded = null;

    revalidatePath("/platform/badges/share-templates");
    return {
      asset: {
        id: assetId,
        mimeType: storedUpload.mimeType as BadgeStudioAsset["mimeType"],
        name,
        signedUrl: signed.data.signedUrl,
        sizeBytes: storedUpload.sizeBytes
      },
      message: "Afbeelding toegevoegd aan de bibliotheek.",
      ok: true
    };
  } catch (error) {
    if (uploaded) {
      await admin.storage.from(uploaded.storageBucket).remove([uploaded.filePath]);
    }
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
  const [awardResult, participantResult, preferencesResult, settingsResult] = await Promise.all([
    admin.from("participant_badge_awards").select("id, participant_id, title, resolved_share_text, status, visibility").eq("tenant_id", tenant.id).eq("id", awardId).maybeSingle(),
    admin.from("participant_badge_awards").select("participant_id, participants!inner(display_name, guardian_user_id)").eq("tenant_id", tenant.id).eq("id", awardId).maybeSingle(),
    admin.from("guardian_communication_preferences").select("badge_sharing_enabled").eq("tenant_id", tenant.id).eq("guardian_user_id", context.user.id).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("share_images_enabled").eq("tenant_id", tenant.id).maybeSingle()
  ]);
  const award = awardResult.data;
  if (!award || award.status !== "awarded" || award.visibility !== "parent_visible") {
    redirectWith(nextPath, "error", "Deze badge kan niet worden gedeeld.");
  }
  const participantRelation = participantResult.data?.participants as unknown as { display_name: string; guardian_user_id: string | null } | null;
  const linked = participantRelation?.guardian_user_id === context.user.id ||
    Boolean((await admin.from("participant_guardians").select("id").eq("tenant_id", tenant.id).eq("participant_id", award.participant_id).eq("guardian_user_id", context.user.id).eq("status", "active").maybeSingle()).data);
  if (!linked || preferencesResult.data?.badge_sharing_enabled === false || settingsResult.data?.share_images_enabled === false) {
    redirectWith(nextPath, "error", "Delen is niet toegestaan volgens de huidige voorkeuren.");
  }
  const firstName = (participantRelation?.display_name ?? "Kind").split(/\s+/)[0];
  const caption = award.resolved_share_text ?? `${firstName} behaalde ${award.title}!`;
  const preview = buildSafeSharePreview({ firstName, title: award.title, format });
  const { error } = await admin.from("badge_share_assets").upsert({
    tenant_id: tenant.id,
    award_id: awardId,
    requested_by_user_id: context.user.id,
    format,
    status: "generated",
    preview_data_url: preview,
    caption,
    expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString()
  }, { onConflict: "tenant_id,award_id,format" });
  if (error) redirectWith(nextPath, "error", error.message);
  await admin.from("badge_analytics_events").insert({
    tenant_id: tenant.id,
    participant_id: award.participant_id,
    award_id: awardId,
    event_type: "shared",
    actor_profile_id: context.user.id,
    metadata_json: { format, generatedOnly: true }
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

function buildSafeSharePreview(input: { firstName: string; format: string; title: string }) {
  const width = input.format === "story" ? 540 : input.format === "landscape" ? 600 : 540;
  const height = input.format === "story" ? 960 : input.format === "landscape" ? 315 : input.format === "certificate" ? 382 : 540;
  const escapedTitle = escapeXml(input.title);
  const escapedName = escapeXml(input.firstName);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eaf8ff"/><stop offset="1" stop-color="#d9fff5"/></linearGradient></defs><rect width="100%" height="100%" rx="32" fill="url(#g)"/><circle cx="${width / 2}" cy="${height * 0.35}" r="${Math.min(width, height) * 0.16}" fill="#0877d1"/><text x="50%" y="${height * 0.38}" text-anchor="middle" font-size="${Math.min(width, height) * 0.13}" fill="white">★</text><text x="50%" y="${height * 0.67}" text-anchor="middle" font-family="system-ui" font-weight="800" font-size="${Math.min(width, height) * 0.072}" fill="#10243e">${escapedTitle}</text><text x="50%" y="${height * 0.78}" text-anchor="middle" font-family="system-ui" font-weight="700" font-size="${Math.min(width, height) * 0.052}" fill="#0877d1">${escapedName}</text><text x="50%" y="${height * 0.9}" text-anchor="middle" font-family="system-ui" font-size="${Math.min(width, height) * 0.03}" fill="#41617f">NXTTRACK · met toestemming gedeeld</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
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

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character);
}
