import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  badgeAwardKey,
  badgeMatchesAudience,
  normalizeBadgeGender,
  resolveBadgeShortcodes,
  resolveGenderedCopy,
  selectTriggerCandidates,
  type BadgeAudience,
  type BadgeGender
} from "./badge-system-contract";
import { createTenantNotifications } from "./tenant-notifications";

type CatalogBadge = {
  id: string;
  badge_key: string;
  name_default: string;
  name_boy: string | null;
  name_girl: string | null;
  description_default: string;
  description_boy: string | null;
  description_girl: string | null;
  share_text_default: string | null;
  share_text_boy: string | null;
  share_text_girl: string | null;
  badge_type: "automatic" | "manual";
  trigger_type: string | null;
  trigger_config_json: Record<string, unknown>;
  audience: BadgeAudience;
  artwork_asset_id: string | null;
  notifications_enabled: boolean;
  emails_enabled: boolean;
  share_enabled: boolean;
  status: string;
};

type TenantBadgeOverride = {
  catalog_definition_id: string;
  enabled: boolean;
  name_default: string | null;
  name_boy: string | null;
  name_girl: string | null;
  description_default: string | null;
  description_boy: string | null;
  description_girl: string | null;
  share_text_default: string | null;
  share_text_boy: string | null;
  share_text_girl: string | null;
  notifications_enabled: boolean | null;
  emails_enabled: boolean | null;
  share_enabled: boolean | null;
};

export type BadgeEvaluationInput = {
  tenantId: string;
  participantId: string;
  eventType: string;
  eventContext: Record<string, unknown>;
};

export type BadgeAwardInput = {
  tenantId: string;
  participantId: string;
  catalogDefinitionId?: string;
  customBadgeId?: string;
  badgeKey?: string;
  awardedByUserId?: string | null;
  sourceSessionId?: string | null;
  eventType?: string | null;
  eventEntityId?: string | null;
  eventContext?: Record<string, unknown>;
  customMessage?: string | null;
  visibility?: "internal" | "parent_visible";
  forceApproval?: boolean;
};

export type BadgeAwardResult = {
  awardId: string | null;
  awarded: boolean;
  duplicate: boolean;
  pendingApproval: boolean;
  reason: string;
};

export async function evaluateBadgeTriggers(input: BadgeEvaluationInput) {
  const admin = createAdminClient();
  const [platformResult, tenantResult, participantResult, catalogResult, overrideResult] = await Promise.all([
    admin.from("platform_badge_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("*").eq("tenant_id", input.tenantId).maybeSingle(),
    admin.from("participants").select("id, display_name, gender, status, is_test").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin
      .from("badge_catalog_definitions")
      .select("id, badge_key, name_default, name_boy, name_girl, description_default, description_boy, description_girl, share_text_default, share_text_boy, share_text_girl, badge_type, trigger_type, trigger_config_json, audience, artwork_asset_id, notifications_enabled, emails_enabled, share_enabled, status")
      .eq("badge_type", "automatic")
      .eq("status", "active")
      .eq("trigger_type", input.eventType),
    admin.from("tenant_badge_settings").select("*").eq("tenant_id", input.tenantId)
  ]);

  if (platformResult.error || tenantResult.error || participantResult.error || catalogResult.error || overrideResult.error) {
    return { awarded: [], skipped: ["Badgevoorwaarden konden niet veilig worden geladen."] };
  }
  if (!participantResult.data || participantResult.data.status !== "active") {
    return { awarded: [], skipped: ["De leerling is niet actief of bestaat niet."] };
  }
  const platform = platformResult.data;
  const tenant = tenantResult.data;
  if (platform?.badges_module_available === false || platform?.automatic_badges_available === false) {
    return { awarded: [], skipped: ["Automatische badges zijn platformbreed uitgeschakeld."] };
  }
  if (tenant?.badges_enabled === false || tenant?.automatic_badges_enabled === false) {
    return { awarded: [], skipped: ["Automatische badges zijn voor deze organisatie uitgeschakeld."] };
  }

  const definitions = (catalogResult.data ?? []) as CatalogBadge[];
  const candidates = selectTriggerCandidates(
    definitions.flatMap((definition) =>
      definition.trigger_type
        ? [{ badgeKey: definition.badge_key, triggerType: definition.trigger_type, triggerConfig: definition.trigger_config_json }]
        : []
    ),
    input.eventType,
    input.eventContext
  );
  const definitionByKey = new Map(definitions.map((definition) => [definition.badge_key, definition]));
  const overrideByDefinition = new Map(
    ((overrideResult.data ?? []) as TenantBadgeOverride[]).map((override) => [override.catalog_definition_id, override])
  );
  const awarded: BadgeAwardResult[] = [];
  const skipped: string[] = [];
  const gender = normalizeBadgeGender(participantResult.data.gender);

  for (const candidate of candidates) {
    const definition = definitionByKey.get(candidate.badgeKey);
    if (!definition) continue;
    const override = overrideByDefinition.get(definition.id);
    if (override?.enabled === false) {
      skipped.push(`${definition.badge_key}: voor tenant uitgeschakeld.`);
      continue;
    }
    if (!badgeMatchesAudience(gender, definition.audience)) {
      skipped.push(`${definition.badge_key}: past niet bij de ingestelde badgevariant.`);
      continue;
    }
    awarded.push(
      await awardBadge({
        tenantId: input.tenantId,
        participantId: input.participantId,
        catalogDefinitionId: definition.id,
        badgeKey: definition.badge_key,
        eventType: input.eventType,
        eventEntityId: readString(input.eventContext.entityId),
        eventContext: input.eventContext,
        forceApproval: false
      })
    );
  }

  await admin.from("badge_analytics_events").insert({
    tenant_id: input.tenantId,
    participant_id: input.participantId,
    event_type: "evaluated",
    metadata_json: {
      eventType: input.eventType,
      candidates: candidates.map((candidate) => candidate.badgeKey),
      awarded: awarded.filter((result) => result.awarded).length,
      skipped
    },
    is_test: participantResult.data.is_test === true
  });

  return { awarded, skipped };
}

export async function awardBadge(input: BadgeAwardInput): Promise<BadgeAwardResult> {
  const admin = createAdminClient();
  const [platformResult, tenantResult, participantResult, catalogResult, customResult, overrideResult] = await Promise.all([
    admin.from("platform_badge_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("*").eq("tenant_id", input.tenantId).maybeSingle(),
    admin
      .from("participants")
      .select("id, display_name, gender, guardian_user_id, status, is_test")
      .eq("tenant_id", input.tenantId)
      .eq("id", input.participantId)
      .maybeSingle(),
    input.catalogDefinitionId
      ? admin.from("badge_catalog_definitions").select("*").eq("id", input.catalogDefinitionId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.customBadgeId
      ? admin.from("tenant_custom_badges").select("*").eq("tenant_id", input.tenantId).eq("id", input.customBadgeId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.catalogDefinitionId
      ? admin.from("tenant_badge_settings").select("*").eq("tenant_id", input.tenantId).eq("catalog_definition_id", input.catalogDefinitionId).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (
    platformResult.error || tenantResult.error || participantResult.error ||
    catalogResult.error || customResult.error || overrideResult.error
  ) {
    return result("Badgegegevens konden niet veilig worden geladen.");
  }
  const participant = participantResult.data;
  const definition = (catalogResult.data ?? customResult.data) as Record<string, unknown> | null;
  if (!participant || participant.status !== "active" || !definition) {
    return result("Leerling of badge is niet beschikbaar.");
  }
  const platform = platformResult.data;
  const tenant = tenantResult.data;
  if (platform?.badges_module_available === false || tenant?.badges_enabled === false) {
    return result("Badges zijn uitgeschakeld.");
  }
  if (input.catalogDefinitionId && overrideResult.data?.enabled === false) {
    return result("Deze badge is voor de organisatie uitgeschakeld.");
  }

  const gender = normalizeBadgeGender(participant.gender);
  const audience = String(definition.audience ?? "all") as BadgeAudience;
  if (!badgeMatchesAudience(gender, audience)) {
    return result("Deze badgevariant past niet bij de leerling.");
  }
  const override = overrideResult.data as TenantBadgeOverride | null;
  const badgeKey = String(definition.badge_key ?? input.badgeKey ?? "manual_badge");
  const name = resolveGenderedCopy(
    {
      default: override?.name_default ?? String(definition.name_default ?? "Badge"),
      boy: override?.name_boy ?? asNullableString(definition.name_boy),
      girl: override?.name_girl ?? asNullableString(definition.name_girl)
    },
    gender
  );
  const description = resolveGenderedCopy(
    {
      default: override?.description_default ?? String(definition.description_default ?? "Een mooie stap."),
      boy: override?.description_boy ?? asNullableString(definition.description_boy),
      girl: override?.description_girl ?? asNullableString(definition.description_girl)
    },
    gender
  );
  const shareTemplate =
    override?.share_text_default ??
    asNullableString(definition.share_text_default) ??
    "{child_first_name} behaalde {badge_name_gendered}!";
  const shareText = resolveBadgeShortcodes(
    resolveGenderedCopy(
      {
        default: shareTemplate,
        boy: override?.share_text_boy ?? asNullableString(definition.share_text_boy),
        girl: override?.share_text_girl ?? asNullableString(definition.share_text_girl)
      },
      gender
    ),
    {
      badgeDescription: description,
      badgeName: name,
      childFirstName: participant.display_name,
      gender
    }
  );
  const manual = String(definition.badge_type ?? "manual") === "manual";
  const pendingApproval =
    input.forceApproval === true ||
    (manual && tenant?.manual_badge_requires_admin_approval !== false) ||
    (manual && tenant?.instructor_can_award_directly !== true);
  const eventEntityId = input.eventEntityId ?? null;
  const idempotencyKey = badgeAwardKey({
    badgeKey,
    participantId: input.participantId,
    eventEntityId: manual ? eventEntityId ?? crypto.randomUUID() : null
  });
  const insertResult = await admin
    .from("participant_badge_awards")
    .insert({
      tenant_id: input.tenantId,
      participant_id: input.participantId,
      catalog_definition_id: input.catalogDefinitionId ?? null,
      custom_badge_id: input.customBadgeId ?? null,
      awarded_by_user_id: input.awardedByUserId ?? null,
      source_session_id: input.sourceSessionId ?? null,
      title: name,
      note: input.customMessage?.trim().slice(0, 1_000) || description,
      visibility: input.visibility ?? "parent_visible",
      status: pendingApproval ? "pending" : "awarded",
      approval_status: pendingApproval ? "pending" : "approved",
      award_key: idempotencyKey,
      resolved_badge_key: badgeKey,
      resolved_name: name,
      resolved_description: description,
      resolved_share_text: shareText,
      resolved_artwork_asset_id: asNullableString(definition.artwork_asset_id),
      participant_gender_snapshot: gender,
      trigger_event_type: input.eventType ?? null,
      trigger_context_json: input.eventContext ?? {},
      delivery_status: pendingApproval ? "not_requested" : "queued",
      share_status: "not_requested",
      is_test: participant.is_test === true,
      source: participant.is_test === true ? "journey_simulation_bot" : "manual"
    })
    .select("id")
    .single();

  if (insertResult.error) {
    if (insertResult.error.code === "23505") {
      return { awardId: null, awarded: false, duplicate: true, pendingApproval: false, reason: "Deze badge was al toegekend." };
    }
    return result(`Badge kon niet worden opgeslagen: ${insertResult.error.message}`);
  }

  const awardId = insertResult.data.id;
  await admin.from("badge_analytics_events").insert({
    tenant_id: input.tenantId,
    participant_id: input.participantId,
    award_id: awardId,
    event_type: pendingApproval ? "pending_approval" : "earned",
    actor_profile_id: input.awardedByUserId ?? null,
    metadata_json: { badgeKey, eventType: input.eventType ?? "manual", genderVariant: gender },
    is_test: participant.is_test === true
  });
  if (!pendingApproval && (input.visibility ?? "parent_visible") === "parent_visible") {
    await deliverBadgeAward({
      awardId,
      badgeKey,
      definition,
      override,
      participant,
      platform,
      tenant,
      tenantId: input.tenantId,
      title: name,
      message: input.customMessage?.trim() || description
    });
  }

  return {
    awardId,
    awarded: !pendingApproval,
    duplicate: false,
    pendingApproval,
    reason: pendingApproval ? "Badge wacht op menselijke goedkeuring." : "Badge toegekend."
  };
}

async function deliverBadgeAward(input: {
  awardId: string;
  badgeKey: string;
  definition: Record<string, unknown>;
  override: TenantBadgeOverride | null;
  participant: {
    display_name: string;
    guardian_user_id: string | null;
    id: string;
    is_test: boolean;
  };
  platform: Record<string, unknown> | null;
  tenant: Record<string, unknown> | null;
  tenantId: string;
  title: string;
  message: string;
}) {
  const admin = createAdminClient();
  const guardiansResult = await admin
    .from("participant_guardians")
    .select("guardian_user_id")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participant.id)
    .eq("status", "active");
  const recipientIds = [
    input.participant.guardian_user_id,
    ...(guardiansResult.data ?? []).map((row) => row.guardian_user_id)
  ].filter((value): value is string => Boolean(value));
  const preferencesResult = recipientIds.length
    ? await admin
        .from("guardian_communication_preferences")
        .select("guardian_user_id, badge_notifications_enabled, badge_emails_enabled")
        .eq("tenant_id", input.tenantId)
        .in("guardian_user_id", recipientIds)
    : { data: [], error: null };
  const preferenceByUser = new Map(
    (preferencesResult.data ?? []).map((preference) => [preference.guardian_user_id, preference])
  );
  const definitionNotifications = readBoolean(input.definition.notifications_enabled, true);
  const tenantNotifications = readBoolean(input.tenant?.badge_notifications_enabled, true);
  const platformNotifications = readBoolean(input.platform?.badge_notifications_available, true);
  const allowNotifications =
    definitionNotifications &&
    (input.override?.notifications_enabled ?? true) &&
    tenantNotifications &&
    platformNotifications;
  const definitionEmails = readBoolean(input.definition.emails_enabled, true);
  const tenantEmails = readBoolean(input.tenant?.badge_emails_enabled, false);
  const platformEmails = readBoolean(input.platform?.badge_email_available, true);

  for (const recipientId of recipientIds) {
    const preference = preferenceByUser.get(recipientId);
    if (preference?.badge_notifications_enabled === false || !allowNotifications) continue;
    await createTenantNotifications({
      tenantId: input.tenantId,
      recipientIds: [recipientId],
      participantId: input.participant.id,
      relatedBadgeAwardId: input.awardId,
      type: "badge_award",
      title: `Nieuwe badge: ${input.title}`,
      message: input.message,
      actionHref: "/portaal/badges",
      entityType: "badge_award",
      entityId: input.awardId,
      deliverEmail:
        !input.participant.is_test &&
        definitionEmails &&
        (input.override?.emails_enabled ?? true) &&
        tenantEmails &&
        platformEmails &&
        preference?.badge_emails_enabled === true
    });
  }

  await admin
    .from("participant_badge_awards")
    .update({ delivery_status: recipientIds.length && allowNotifications ? "sent" : "skipped" })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.awardId);
}

function result(reason: string): BadgeAwardResult {
  return { awardId: null, awarded: false, duplicate: false, pendingApproval: false, reason };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
