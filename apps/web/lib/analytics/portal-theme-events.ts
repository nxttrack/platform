import { parentPortalRouteIds, type ParentPortalRouteId } from "../theme/portal-theme-contract";

export const portalThemeEventNames = [
  "portal_theme_previewed",
  "portal_theme_scheduled",
  "portal_theme_activated",
  "portal_theme_rolled_back",
  "portal_theme_fallback_used",
  "portal_route_viewed",
  "portal_child_context_changed",
  "portal_command_started",
  "portal_command_succeeded",
  "portal_command_failed",
  "portal_badge_viewed",
  "portal_badge_shared",
  "portal_asset_fallback_used",
  "portal_assessment_viewed",
  "learner_assessment_submitted",
  "learner_assessment_sync_failed"
] as const;

export type PortalThemeEventName = (typeof portalThemeEventNames)[number];
export type PortalThemeAnalyticsProperties = {
  themeKey?: string;
  release?: string;
  routeId?: ParentPortalRouteId;
  platform?: "web" | "ios" | "android";
  breakpoint?: "mobile" | "tablet" | "desktop";
  state?: "data" | "empty" | "locked" | "error";
  errorCode?: string;
  ratingValue?: 1 | 2 | 3 | 4 | 5;
  scaleVersion?: "five_point_v1" | "three_point_legacy";
  sourceScaleVersion?: "five_point_v1" | "three_point_legacy";
  presentation?: "smileys" | "stars";
};

export type PortalThemeAnalyticsEvent = {
  name: PortalThemeEventName;
  properties: PortalThemeAnalyticsProperties;
};

const safeKey = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;

export function buildPortalThemeAnalyticsEvent(
  name: PortalThemeEventName,
  properties: PortalThemeAnalyticsProperties
): PortalThemeAnalyticsEvent {
  if (!portalThemeEventNames.includes(name)) throw new Error("Unknown portal analytics event");
  if (properties.routeId && !parentPortalRouteIds.includes(properties.routeId)) throw new Error("Unknown portal route");
  if (
    properties.ratingValue !== undefined &&
    (!Number.isInteger(properties.ratingValue) || properties.ratingValue < 1 || properties.ratingValue > 5)
  ) {
    throw new Error("Assessment analytics value must be 1–5");
  }
  for (const value of [properties.themeKey, properties.release, properties.errorCode]) {
    if (value && !safeKey.test(value)) throw new Error("Unsafe portal analytics property");
  }
  return { name, properties: { ...properties } };
}

export function trackPortalThemeEvent(
  name: PortalThemeEventName,
  properties: PortalThemeAnalyticsProperties
) {
  const event = buildPortalThemeAnalyticsEvent(name, properties);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nxttrack:portal-analytics", { detail: event }));
  return event;
}
