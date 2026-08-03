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

type BadgeRelease = {
  id: string;
  catalog_definition_id: string | null;
  stable_key: string;
  release_number: number;
  badge_type: "automatic" | "manual";
  trigger_type: string | null;
  rule_json: { config?: unknown };
  audience: BadgeAudience;
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

export type BadgeTriggerSetInput = {
  tenantId: string;
  participantId: string;
  events: Array<{
    eventType: string;
    eventContext: Record<string, unknown>;
  }>;
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
  return evaluateBadgeTriggerSet({
    tenantId: input.tenantId,
    participantId: input.participantId,
    events: [{ eventType: input.eventType, eventContext: input.eventContext }]
  });
}

export async function evaluateBadgeTriggerSet(input: BadgeTriggerSetInput) {
  const events = input.events.filter(
    (event, index, all) =>
      event.eventType.trim().length > 0 &&
      all.findIndex(
        (candidate) =>
          candidate.eventType === event.eventType &&
          JSON.stringify(candidate.eventContext) === JSON.stringify(event.eventContext)
      ) === index
  );
  if (events.length === 0) {
    return { awarded: [], skipped: ["Geen badge-events aangeboden."] };
  }
  const admin = createAdminClient();
  const eventTypes = [...new Set(events.map((event) => event.eventType))];
  const [platformResult, tenantResult, participantResult, releasesResult, overrideResult] = await Promise.all([
    admin.from("platform_badge_settings").select("*").eq("id", true).maybeSingle(),
    admin.from("tenant_badge_module_settings").select("*").eq("tenant_id", input.tenantId).maybeSingle(),
    admin.from("participants").select("id, display_name, gender, status, is_test").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin
      .from("badge_definition_releases")
      .select("id, catalog_definition_id, stable_key, release_number, badge_type, trigger_type, rule_json, audience")
      .is("tenant_id", null)
      .eq("badge_type", "automatic")
      .in("trigger_type", eventTypes)
      .order("release_number", { ascending: false }),
    admin.from("tenant_badge_settings").select("*").eq("tenant_id", input.tenantId)
  ]);

  if (platformResult.error || tenantResult.error || participantResult.error || releasesResult.error || overrideResult.error) {
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

  const latestReleaseBySource = new Map<string, BadgeRelease>();
  for (const release of (releasesResult.data ?? []) as BadgeRelease[]) {
    const sourceKey = release.catalog_definition_id ?? release.stable_key;
    if (!latestReleaseBySource.has(sourceKey)) latestReleaseBySource.set(sourceKey, release);
  }
  const releases = [...latestReleaseBySource.values()];
  const candidates = events.flatMap((event) =>
    selectTriggerCandidates(
      releases.flatMap((release) =>
        release.trigger_type
          ? [{
              badgeKey: release.stable_key,
              triggerType: release.trigger_type,
              triggerConfig: asObject(release.rule_json.config)
            }]
          : []
      ),
      event.eventType,
      event.eventContext
    )
  );
  const releaseByKey = new Map(releases.map((release) => [release.stable_key, release]));
  const overrideByDefinition = new Map(
    ((overrideResult.data ?? []) as TenantBadgeOverride[]).map((override) => [override.catalog_definition_id, override])
  );
  const skipped: string[] = [];
  const gender = normalizeBadgeGender(participantResult.data.gender);
  const eligibleReleaseIds = new Set<string>();

  for (const candidate of candidates) {
    const release = releaseByKey.get(candidate.badgeKey);
    if (!release) continue;
    const override = release.catalog_definition_id
      ? overrideByDefinition.get(release.catalog_definition_id)
      : undefined;
    if (override?.enabled === false) {
      skipped.push(`${release.stable_key}: voor tenant uitgeschakeld.`);
      continue;
    }
    if (!badgeMatchesAudience(gender, release.audience)) {
      skipped.push(`${release.stable_key}: past niet bij de ingestelde badgevariant.`);
      continue;
    }
    eligibleReleaseIds.add(release.id);
  }

  let awarded: BadgeAwardResult[] = [];
  if (eligibleReleaseIds.size) {
    const sourceEventId = readUuidValue(events.find((event) => readUuidValue(event.eventContext.entityId))?.eventContext.entityId);
    const eventType = eventTypes.slice().sort().join("+");
    const eventFingerprint = await stableDigest({
      events,
      participantId: input.participantId
    });
    const batchResult = await admin.rpc("award_badge_batch", {
      target_actor_user_id: null,
      target_badge_release_ids: [...eligibleReleaseIds],
      target_command_type: "automatic",
      target_enrollment_id: null,
      target_idempotency_key: `badge:auto:${input.participantId}:${eventType}:${eventFingerprint}`.slice(0, 200),
      target_participant_id: input.participantId,
      target_reason: `Automatische evaluatie: ${eventType}`,
      target_source_event_id: sourceEventId,
      target_source_event_type: eventType,
      target_source_session_id: null,
      target_tenant_id: input.tenantId,
      target_visibility: "parent_visible"
    });
    if (batchResult.error || !batchResult.data) {
      skipped.push("De badge-batch kon niet transactioneel worden verwerkt.");
    } else {
      const itemsResult = await admin
        .from("badge_award_batch_items")
        .select("award_id, outcome, outcome_reason")
        .eq("tenant_id", input.tenantId)
        .eq("batch_id", batchResult.data);
      if (itemsResult.error) {
        skipped.push("Het resultaat van de badge-batch kon niet worden bevestigd.");
      } else {
        awarded = (itemsResult.data ?? []).map((item) => ({
          awardId: item.award_id,
          awarded: item.outcome === "awarded",
          duplicate: item.outcome === "duplicate",
          pendingApproval: false,
          reason: item.outcome_reason ?? (item.outcome === "awarded" ? "Badge toegekend." : "Badge overgeslagen.")
        }));
      }
    }
  }

  await admin.from("badge_analytics_events").insert({
    tenant_id: input.tenantId,
    participant_id: input.participantId,
    event_type: "evaluated",
    metadata_json: {
      eventTypes,
      candidates: candidates.map((candidate) => candidate.badgeKey),
      awarded: awarded.filter((result) => result.awarded).length,
      skipped,
      evaluationContract: "immutable_release_batch_v1"
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

function readUuidValue(value: unknown) {
  const candidate = readString(value);
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function stableDigest(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  return null;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}
