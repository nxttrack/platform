import type { PortalThemeManifestV3 } from "./portal-theme-contract";

export const childPortalRouteIds = ["today", "journey", "badges", "schedule", "me"] as const;
export type ChildPortalRouteId = (typeof childPortalRouteIds)[number];

export type ChildPortalThemeRecipe = {
  themeKey: string;
  shellRecipe: "child-shell/calm-play-v1";
  pages: Record<ChildPortalRouteId, "child/today-v1" | "child/journey-v1" | "child/badges-v1" | "child/schedule-v1" | "child/me-v1">;
  navigation: readonly ["today", "journey", "badges", "schedule", "me"];
};

export function getChildPortalThemeRecipe(manifest: PortalThemeManifestV3): ChildPortalThemeRecipe {
  return Object.freeze({
    themeKey: manifest.theme.key,
    shellRecipe: "child-shell/calm-play-v1",
    navigation: childPortalRouteIds,
    pages: {
      today: "child/today-v1",
      journey: "child/journey-v1",
      badges: "child/badges-v1",
      schedule: "child/schedule-v1",
      me: "child/me-v1"
    }
  } satisfies ChildPortalThemeRecipe);
}

export function resolveChildPortalRouteId(pathname: string): ChildPortalRouteId {
  if (pathname.startsWith("/kind/reis")) return "journey";
  if (pathname.startsWith("/kind/badges")) return "badges";
  if (pathname.startsWith("/kind/agenda")) return "schedule";
  if (pathname.startsWith("/kind/ik")) return "me";
  return "today";
}
