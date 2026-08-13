import "server-only";

import { cache } from "react";

import { requireChildPortalSession } from "@/lib/auth/portal-session";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThemeDisplayName, getThemeRelease } from "@/lib/theme/portal-theme-registry";
import {
  resolveTenantChildPortalTheme,
  resolveTenantPortalTheme,
  type ResolvedPortalTheme
} from "@/lib/theme/portal-theme-server";
import type { EnrollmentRow } from "./core";
import { getPortalFeatureFlags, type PortalFeatureFlags } from "./portal-features";
import {
  getJourneyForEnrollment,
  loadCanonicalSwimJourneys,
  type CanonicalSwimJourney,
  type SwimJourneyRing
} from "./swim-progress";

export type ChildSafeBadgeDto = {
  id: string;
  title: string;
  category: string;
  earned: boolean;
  earnedAt: string | null;
  isSurprise: boolean;
};

export type ChildSafeCertificateDto = {
  id: string;
  title: string;
  issuedOn: string;
};

export type ChildSafeLessonDto = {
  id: string;
  kind: "graduation" | "lesson";
  activityType: "graduation" | "regular" | "temporary_series" | "turbo_course" | "vacation_course";
  startsAt: string;
  endsAt: string;
  status: string;
  groupName: string;
  locationName: string | null;
  resourceFields: Array<{ kind: "lane" | "location" | "other" | "pool" | "room"; name: string }>;
  supplies: string[];
  trainerFirstName: string | null;
};

export type ChildSafeInstructionalVideoDto = {
  captionsUrl: string;
  title: string;
  transcript: string;
  url: string;
};

export type ChildSafeJourneyDto = {
  stages: Array<{ id: string; name: string; sortOrder: number }>;
  currentStage: { id: string; name: string } | null;
  currentStageItems: Array<{
    completedAt: string | null;
    completionOrderStatus: "event_sequence" | "legacy_inferred" | null;
    completionSequence: number | null;
    description: string | null;
    id: string;
    instructionalVideo: ChildSafeInstructionalVideoDto | null;
    name: string;
    sortOrder: number;
    stableKey: string;
  }>;
  effectiveObservations: Array<{
    childVisible: boolean;
    curriculumItemId: string;
    finalizedAt: string;
    positiveLabel: string | null;
    rating: 1 | 2 | 3 | 4 | 5;
  }>;
  chapterSnapshots: Array<{
    artworkId: string;
    badgeAwardCount: number;
    completedAt: string;
    curriculumStageId: string;
    id: string;
    themeKey: string;
    themeRelease: string;
  }>;
  events: Array<{
    anchorNodeId: string | null;
    description: string | null;
    earnedAt: string;
    eventType: "badge" | "surprise_badge";
    id: string;
    label: string;
  }>;
  rings: SwimJourneyRing[];
};

export type ChildSafeMediaDto = {
  id: string;
  caption: string | null;
  publishedAt: string;
  type: "image" | "video";
  viewUrl: `/api/child/media/${string}`;
};

export type ChildPortalDto = {
  sessionExpiresAt: string;
  tenant: { id: string; logoUrl: string | null; name: string; sector: string };
  child: { id: string; firstName: string; initial: string };
  theme: ResolvedPortalTheme;
  features: PortalFeatureFlags;
  program: { name: string; stageName: string } | null;
  journey: ChildSafeJourneyDto | null;
  lessons: ChildSafeLessonDto[];
  badges: ChildSafeBadgeDto[];
  certificates: ChildSafeCertificateDto[];
  media: ChildSafeMediaDto[];
  preferences: {
    celebrationsEnabled: boolean;
    readAloudEnabled: boolean;
    reducedMotion: boolean;
    soundEnabled: boolean;
    themeKey: string | null;
    themeRelease: string | null;
  };
  availableThemes: Array<{ key: string; name: string; release: string }>;
};

export const getChildPortalData = cache(async (): Promise<ChildPortalDto> => {
  const context = await requirePrivateShellContext("/kind");
  const childSession = await requireChildPortalSession(context);
  const tenant = context.tenants.find((candidate) => candidate.tenantId === childSession.tenantId);
  if (!tenant) throw new Error("Child portal tenant binding is no longer valid");

  const admin = createAdminClient();
  const [participantResult, guardianResult, enrollmentResult, tenantTheme, features, preferencesResult, availableThemesResult, brandingResult] = await Promise.all([
    admin
      .from("participants")
      .select("id, display_name, gender, guardian_user_id, status")
      .eq("tenant_id", childSession.tenantId)
      .eq("id", childSession.participantId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("participant_guardians")
      .select("id")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .eq("guardian_user_id", childSession.userId)
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("enrollments")
      .select("id, participant_id, guardian_user_id, program_id, current_stage_id, curriculum_version_id, status, source, starts_on")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .eq("status", "active")
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
    resolveTenantPortalTheme(childSession.tenantId),
    getPortalFeatureFlags(childSession.tenantId),
    admin
      .from("portal_child_preferences")
      .select("reduced_motion, celebrations_enabled, sound_enabled, read_aloud_enabled, theme_key, theme_release")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .maybeSingle(),
    admin
      .from("tenant_portal_theme_availability")
      .select("theme_key, theme_release")
      .eq("tenant_id", childSession.tenantId)
      .eq("is_enabled", true),
    admin
      .from("tenant_branding")
      .select("logo_url")
      .eq("tenant_id", childSession.tenantId)
      .eq("status", "active")
      .maybeSingle()
  ]);

  const legacyGuardianBound = participantResult.data?.guardian_user_id === childSession.userId;
  if (participantResult.error || !participantResult.data || guardianResult.error || (!guardianResult.data && !legacyGuardianBound)) {
    throw new Error("Child portal participant binding is no longer valid");
  }
  if (enrollmentResult.error) throw new Error("Child portal enrollment could not be loaded");
  if (preferencesResult.error || availableThemesResult.error || brandingResult.error) throw new Error("Child portal preferences could not be loaded");
  const themePreference = preferencesResult.data?.theme_key && preferencesResult.data.theme_release ? {
    themeKey: preferencesResult.data.theme_key,
    themeRelease: preferencesResult.data.theme_release
  } : null;
  const theme = themePreference
    ? await resolveTenantChildPortalTheme(childSession.tenantId, themePreference)
    : tenantTheme;
  const enrollment = enrollmentResult.data as EnrollmentRow | null;
  const journeys = await loadCanonicalSwimJourneys({
    tenantId: childSession.tenantId,
    enrollments: enrollment ? [enrollment] : [],
    parentVisibleOnly: true
  });
  const canonicalJourney = getJourneyForEnrollment(journeys, enrollment?.id);

  const [membershipResult, awardResult, mediaApprovalResult, programResult, stageResult, standardReleasesResult, certificatesResult, graduationInvitesResult] = await Promise.all([
    admin
      .from("group_memberships")
      .select("group_id")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .in("status", ["active", "trial"]),
    admin
      .from("participant_badge_awards")
      .select("id, badge_release_id, title, awarded_at, resolved_description, trigger_event_type, trigger_context_json")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .eq("status", "awarded")
      .eq("visibility", "parent_visible")
      .order("awarded_at", { ascending: false }),
    admin
      .from("portal_child_media_approvals")
      .select("media_id")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .is("revoked_at", null),
    enrollment
      ? admin.from("programs").select("id, name").eq("tenant_id", childSession.tenantId).eq("id", enrollment.program_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    enrollment?.current_stage_id
      ? admin.from("program_stages").select("id, name").eq("tenant_id", childSession.tenantId).eq("id", enrollment.current_stage_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("badge_definition_releases")
      .select("id, tenant_id, stable_key, release_number, name_default, name_boy, name_girl, category, audience, is_surprise")
      .or(`tenant_id.is.null,tenant_id.eq.${childSession.tenantId}`)
      .eq("is_surprise", false)
      .order("release_number", { ascending: false }),
    admin
      .from("certificate_records")
      .select("id, title, issued_on")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .eq("status", "issued")
      .order("issued_on", { ascending: false }),
    admin
      .from("graduation_event_participants")
      .select("event_id")
      .eq("tenant_id", childSession.tenantId)
      .eq("participant_id", childSession.participantId)
      .eq("invite_status", "confirmed")
      .in("status", ["confirmed", "invited"])
  ]);
  for (const result of [membershipResult, awardResult, mediaApprovalResult, programResult, stageResult, standardReleasesResult, certificatesResult, graduationInvitesResult]) {
    if (result.error) throw new Error("A child-safe portal projection could not be loaded");
  }

  const groupIds = (membershipResult.data ?? []).map((row) => row.group_id);
  const awards = awardResult.data ?? [];
  const releaseIds = awards.flatMap((award) => award.badge_release_id ? [award.badge_release_id] : []);
  const mediaIds = (mediaApprovalResult.data ?? []).map((approval) => approval.media_id);
  const standardReleaseIds = (standardReleasesResult.data ?? []).map((release) => release.id);
  const graduationEventIds = (graduationInvitesResult.data ?? []).map((invite) => invite.event_id);
  const [groupsResult, sessionsResult, releasesResult, mediaResult, lifecycleResult, graduationEventsResult] = await Promise.all([
    groupIds.length
      ? admin.from("groups").select("id, name, default_resource_id, offering_type").eq("tenant_id", childSession.tenantId).in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? admin.from("sessions").select("id, group_id, resource_id, starts_at, ends_at, status").eq("tenant_id", childSession.tenantId).in("group_id", groupIds).gte("ends_at", new Date().toISOString()).order("starts_at").limit(24)
      : Promise.resolve({ data: [], error: null }),
    releaseIds.length
      ? admin.from("badge_definition_releases").select("id, category, is_surprise, name_default, name_boy, name_girl").in("id", releaseIds)
      : Promise.resolve({ data: [], error: null }),
    mediaIds.length
      ? admin.from("participant_media").select("id, caption, media_type, published_at").eq("tenant_id", childSession.tenantId).eq("participant_id", childSession.participantId).eq("status", "published").gt("expires_at", new Date().toISOString()).in("id", mediaIds).order("published_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    standardReleaseIds.length
      ? admin.from("badge_release_lifecycle").select("badge_release_id, availability, effective_at").in("badge_release_id", standardReleaseIds).order("effective_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    graduationEventIds.length
      ? admin.from("graduation_events").select("id, title, resource_id, starts_at, ends_at, status").eq("tenant_id", childSession.tenantId).eq("status", "published").gte("ends_at", new Date().toISOString()).in("id", graduationEventIds).order("starts_at")
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const result of [groupsResult, sessionsResult, releasesResult, mediaResult, lifecycleResult, graduationEventsResult]) {
    if (result.error) throw new Error("A child-safe portal projection could not be assembled");
  }

  const groups = groupsResult.data ?? [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const resourcesResult = await admin
    .from("resources")
    .select("id, parent_resource_id, kind, name")
    .eq("tenant_id", childSession.tenantId);
  if (resourcesResult.error) throw new Error("Child-safe lesson locations could not be loaded");
  const sessionIds = (sessionsResult.data ?? []).map((session) => session.id);
  const [sessionInstructorsResult, groupInstructorsResult, lessonPlansResult] = await Promise.all([
    sessionIds.length
      ? admin.from("session_instructor_assignments").select("session_id, instructor_user_id").eq("tenant_id", childSession.tenantId).in("session_id", sessionIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? admin.from("group_instructor_assignments").select("group_id, instructor_user_id").eq("tenant_id", childSession.tenantId).in("group_id", groupIds).eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? admin
          .from("lesson_plans")
          .select("session_id, current_version_id, status")
          .eq("tenant_id", childSession.tenantId)
          .in("session_id", sessionIds)
          .in("status", ["approved", "completed"])
      : Promise.resolve({ data: [], error: null })
  ]);
  if (sessionInstructorsResult.error || groupInstructorsResult.error || lessonPlansResult.error) {
    throw new Error("Child-safe lesson details could not be loaded");
  }
  const instructorIds = [...new Set([
    ...(sessionInstructorsResult.data ?? []).map((assignment) => assignment.instructor_user_id),
    ...(groupInstructorsResult.data ?? []).map((assignment) => assignment.instructor_user_id)
  ])];
  const instructorProfilesResult = instructorIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", instructorIds)
    : { data: [], error: null };
  if (instructorProfilesResult.error) throw new Error("Child-safe trainer names could not be loaded");
  const lessonPlanVersionIds = (lessonPlansResult.data ?? []).map((plan) => plan.current_version_id);
  const lessonPlanVersionsResult = lessonPlanVersionIds.length
    ? await admin
        .from("lesson_plan_versions")
        .select("id, proposal_json")
        .eq("tenant_id", childSession.tenantId)
        .in("id", lessonPlanVersionIds)
    : { data: [], error: null };
  if (lessonPlanVersionsResult.error) throw new Error("Child-safe lesson supplies could not be loaded");
  const resourceById = new Map((resourcesResult.data ?? []).map((resource) => [resource.id, resource]));
  const instructorNameById = new Map((instructorProfilesResult.data ?? []).map((profile) => [profile.id, firstName(profile.full_name)]));
  const sessionInstructorById = new Map((sessionInstructorsResult.data ?? []).map((assignment) => [assignment.session_id, assignment.instructor_user_id]));
  const groupInstructorById = new Map((groupInstructorsResult.data ?? []).map((assignment) => [assignment.group_id, assignment.instructor_user_id]));
  const proposalByVersionId = new Map((lessonPlanVersionsResult.data ?? []).map((version) => [version.id, version.proposal_json]));
  const suppliesBySessionId = new Map((lessonPlansResult.data ?? []).map((plan) => [
    plan.session_id,
    childSafeSupplies(proposalByVersionId.get(plan.current_version_id))
  ]));
  const releaseById = new Map((releasesResult.data ?? []).map((release) => [release.id, release]));
  const latestAvailabilityByReleaseId = new Map<string, string>();
  for (const lifecycle of lifecycleResult.data ?? []) {
    if (!latestAvailabilityByReleaseId.has(lifecycle.badge_release_id)) {
      latestAvailabilityByReleaseId.set(lifecycle.badge_release_id, lifecycle.availability);
    }
  }
  const participantGender = participantResult.data.gender;
  const standardReleases = (standardReleasesResult.data ?? [])
    .filter((release) => audienceMatches(release.audience, participantGender))
    .filter((release) => (latestAvailabilityByReleaseId.get(release.id) ?? "available") === "available")
    .sort((first, second) => {
      if (first.stable_key !== second.stable_key) return first.stable_key.localeCompare(second.stable_key);
      const tenantPriority = Number(Boolean(second.tenant_id)) - Number(Boolean(first.tenant_id));
      return tenantPriority || second.release_number - first.release_number;
    });
  const currentStandardReleaseByKey = new Map<string, (typeof standardReleases)[number]>();
  for (const release of standardReleases) {
    if (!currentStandardReleaseByKey.has(release.stable_key)) currentStandardReleaseByKey.set(release.stable_key, release);
  }
  const earnedReleaseIds = new Set(releaseIds);
  const displayName = participantResult.data.display_name;
  const earnedBadges: ChildSafeBadgeDto[] = awards.map((award) => {
    const release = award.badge_release_id ? releaseById.get(award.badge_release_id) : null;
    return {
      id: award.id,
      title: release ? genderedBadgeTitle(release, participantGender) : award.title,
      category: release?.category ?? "compliments",
      earned: true,
      earnedAt: award.awarded_at,
      isSurprise: release?.is_surprise === true
    };
  });
  const lockedBadges: ChildSafeBadgeDto[] = [...currentStandardReleaseByKey.values()]
    .filter((release) => !earnedReleaseIds.has(release.id))
    .map((release) => ({
      id: `locked:${release.id}`,
      title: genderedBadgeTitle(release, participantGender),
      category: release.category,
      earned: false,
      earnedAt: null,
      isSurprise: false
    }));
  const journey = projectChildSafeJourney(canonicalJourney, awards.map((award) => {
    const release = award.badge_release_id ? releaseById.get(award.badge_release_id) : null;
    return {
      id: award.id,
      title: release ? genderedBadgeTitle(release, participantGender) : award.title,
      awardedAt: award.awarded_at,
      description: boundedString(award.resolved_description, 280),
      isSurprise: release?.is_surprise === true,
      triggerEventType: award.trigger_event_type,
      triggerContext: asObject(award.trigger_context_json)
    };
  }));

  return {
    sessionExpiresAt: childSession.expiresAt,
    tenant: { id: tenant.tenantId, logoUrl: safeHttpsUrl(brandingResult.data?.logo_url), name: tenant.name, sector: tenant.sector },
    child: {
      id: childSession.participantId,
      firstName: displayName.trim().split(/\s+/)[0] || "Jij",
      initial: displayName.trim().charAt(0).toUpperCase() || "★"
    },
    theme,
    features,
    program: enrollment ? {
      name: programResult.data?.name ?? "Programma",
      stageName: stageResult.data?.name ?? "Huidig niveau"
    } : null,
    journey,
    lessons: [...(sessionsResult.data ?? []).map((lesson): ChildSafeLessonDto => {
      const group = groupById.get(lesson.group_id);
      const resourceFields = childSafeResourceFields(resourceById, lesson.resource_id ?? group?.default_resource_id ?? null);
      return {
        id: lesson.id,
        kind: "lesson" as const,
        activityType: normalizeOfferingType(group?.offering_type),
        startsAt: lesson.starts_at,
        endsAt: lesson.ends_at,
        status: lesson.status,
        groupName: group?.name ?? "Les",
        locationName: resourceFields.length ? resourceFields.map((resource) => resource.name).join(" · ") : null,
        resourceFields,
        supplies: suppliesBySessionId.get(lesson.id) ?? [],
        trainerFirstName: instructorNameById.get(sessionInstructorById.get(lesson.id) ?? groupInstructorById.get(lesson.group_id) ?? "") ?? null
      };
    }), ...(graduationEventsResult.data ?? []).map((event): ChildSafeLessonDto => {
      const resourceFields = childSafeResourceFields(resourceById, event.resource_id);
      return {
      id: event.id,
      kind: "graduation" as const,
      activityType: "graduation" as const,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      status: event.status,
      groupName: event.title,
      locationName: resourceFields.length ? resourceFields.map((resource) => resource.name).join(" · ") : null,
      resourceFields,
      supplies: [],
      trainerFirstName: null
      };
    })].sort((first, second) => first.startsAt.localeCompare(second.startsAt)),
    badges: earnedBadges.concat(lockedBadges),
    certificates: (certificatesResult.data ?? []).flatMap((certificate) => certificate.issued_on ? [{
      id: certificate.id,
      title: certificate.title,
      issuedOn: certificate.issued_on
    }] : []),
    media: (mediaResult.data ?? []).flatMap((media) => media.published_at ? [{
      id: media.id,
      caption: media.caption,
      publishedAt: media.published_at,
      type: media.media_type === "video" ? "video" as const : "image" as const,
      viewUrl: `/api/child/media/${media.id}` as const
    }] : []),
    preferences: {
      celebrationsEnabled: preferencesResult.data?.celebrations_enabled ?? true,
      readAloudEnabled: preferencesResult.data?.read_aloud_enabled ?? false,
      reducedMotion: preferencesResult.data?.reduced_motion ?? false,
      soundEnabled: preferencesResult.data?.sound_enabled ?? false,
      themeKey: preferencesResult.data?.theme_key ?? null,
      themeRelease: preferencesResult.data?.theme_release ?? null
    },
    availableThemes: (availableThemesResult.data ?? []).flatMap((release) => {
      const manifest = getThemeRelease(release.theme_key, release.theme_release);
      return manifest ? [{
        key: release.theme_key,
        name: getThemeDisplayName(manifest),
        release: release.theme_release
      }] : [];
    })
  };
});

function firstName(value: string | null) {
  return value?.trim().split(/\s+/)[0] || "Trainer";
}

function projectChildSafeJourney(
  journey: CanonicalSwimJourney | null,
  earnedAwards: Array<{
    awardedAt: string;
    description: string | null;
    id: string;
    isSurprise: boolean;
    title: string;
    triggerContext: Record<string, unknown>;
    triggerEventType: string | null;
  }>
): ChildSafeJourneyDto | null {
  if (!journey) return null;
  const stableKeyByItemId = new Map(journey.currentStageItems.map((item) => [item.id, item.stable_key]));
  const stableKeyByObservationId = new Map(
    journey.effectiveObservations.map((observation) => [
      observation.id,
      stableKeyByItemId.get(observation.curriculum_item_id) ?? null
    ])
  );
  const completionByItemId = new Map(
    journey.itemCompletions.map((completion) => [completion.curriculum_item_id, completion])
  );
  return {
    stages: journey.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      sortOrder: stage.sort_order
    })),
    currentStage: journey.currentStage ? {
      id: journey.currentStage.id,
      name: journey.currentStage.name
    } : null,
    currentStageItems: journey.currentStageItems.map((item) => ({
      completedAt: completionByItemId.get(item.id)?.completed_at ?? null,
      description: item.description,
      id: item.id,
      instructionalVideo: childSafeInstructionalVideo(item.context_json),
      name: item.name,
      sortOrder: item.sort_order,
      stableKey: item.stable_key,
      completionSequence: completionByItemId.get(item.id)?.completion_sequence ?? null,
      completionOrderStatus: completionByItemId.get(item.id)?.order_status ?? null
    })),
    effectiveObservations: journey.effectiveObservations.map((observation) => {
      const childVisible = observation.context_json.childVisible === true;
      return {
        childVisible,
        curriculumItemId: observation.curriculum_item_id,
        finalizedAt: observation.finalized_at,
        positiveLabel: childVisible ? observation.positive_label : null,
        rating: observation.rating
      };
    }),
    chapterSnapshots: journey.chapterSnapshots.map((snapshot) => ({
      artworkId: snapshot.artwork_id,
      badgeAwardCount: snapshot.badge_award_ids.length,
      completedAt: snapshot.completed_at,
      curriculumStageId: snapshot.curriculum_stage_id,
      id: snapshot.id,
      themeKey: snapshot.theme_key,
      themeRelease: snapshot.theme_release
    })),
    events: earnedAwards.flatMap((award) => {
      const journeyEligible = award.isSurprise
        || award.triggerEventType === "progress_item_completed"
        || award.triggerEventType === "skill_completed"
        || award.triggerContext.showInJourney === true;
      if (!journeyEligible) return [];
      const contextEntityId = typeof award.triggerContext.entityId === "string"
        ? award.triggerContext.entityId
        : typeof award.triggerContext.eventId === "string"
          ? award.triggerContext.eventId
          : null;
      return [{
        anchorNodeId: contextEntityId ? stableKeyByObservationId.get(contextEntityId) ?? null : null,
        description: award.description,
        earnedAt: award.awardedAt,
        eventType: award.isSurprise ? "surprise_badge" as const : "badge" as const,
        id: award.id,
        label: award.title
      }];
    }),
    rings: journey.rings.map((ring) => ({ ...ring }))
  };
}

function childSafeInstructionalVideo(context: Record<string, unknown>): ChildSafeInstructionalVideoDto | null {
  const value = context.childInstructionVideo;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const title = boundedString(row.title, 160);
  const transcript = boundedString(row.transcript, 8_000);
  const url = safeContentUrl(row.url);
  const captionsUrl = safeContentUrl(row.captionsUrl);
  return row.status === "approved" && title && transcript && url && captionsUrl
    ? { captionsUrl, title, transcript, url }
    : null;
}

function childSafeSupplies(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const equipment = (value as Record<string, unknown>).equipment;
  if (!Array.isArray(equipment)) return [];
  return [...new Set(equipment.flatMap((item) => {
    const normalized = boundedString(item, 80);
    return normalized ? [normalized] : [];
  }))].slice(0, 12);
}

type ChildResourceRow = {
  id: string;
  kind: string;
  name: string;
  parent_resource_id: string | null;
};

function childSafeResourceFields(
  resourceById: Map<string, ChildResourceRow>,
  resourceId: string | null
): ChildSafeLessonDto["resourceFields"] {
  const fields: ChildSafeLessonDto["resourceFields"] = [];
  const seen = new Set<string>();
  let currentId = resourceId;
  while (currentId && fields.length < 8 && !seen.has(currentId)) {
    seen.add(currentId);
    const resource = resourceById.get(currentId);
    if (!resource) break;
    const name = boundedString(resource.name, 160);
    if (name && isChildSafeResourceKind(resource.kind)) {
      fields.unshift({ kind: resource.kind, name });
    }
    currentId = resource.parent_resource_id;
  }
  return fields;
}

function isChildSafeResourceKind(value: string): value is ChildSafeLessonDto["resourceFields"][number]["kind"] {
  return ["lane", "location", "other", "pool", "room"].includes(value);
}

function normalizeOfferingType(value: string | null | undefined): ChildSafeLessonDto["activityType"] {
  return ["temporary_series", "turbo_course", "vacation_course"].includes(value ?? "")
    ? value as ChildSafeLessonDto["activityType"]
    : "regular";
}

function boundedString(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeContentUrl(value: unknown) {
  const normalized = boundedString(value, 2_000);
  if (!normalized) return null;
  if (/^\/(?!\/)[A-Za-z0-9/_.,?=&%-]+$/.test(normalized)) return normalized;
  try {
    const url = new URL(normalized);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function audienceMatches(audience: string, gender: string) {
  return audience === "all"
    || (audience === "boys" && gender === "boy")
    || (audience === "girls" && gender === "girl");
}

function genderedBadgeTitle(
  release: { name_boy: string | null; name_default: string; name_girl: string | null },
  gender: string
) {
  if (gender === "boy") return release.name_boy ?? release.name_default;
  if (gender === "girl") return release.name_girl ?? release.name_default;
  return release.name_default;
}

function safeHttpsUrl(value: string | null | undefined) {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
