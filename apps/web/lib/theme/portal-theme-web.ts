import type { CSSProperties } from "react";

import {
  LEARNER_ASSESSMENT_SCALE,
  PARENT_PORTAL_CONTRACT,
  parentPortalRouteIds,
  type PortalThemeManifestV2
} from "./portal-theme-contract";

export type PortalThemeCssProperties = CSSProperties & Record<`--portal-${string}`, string>;

export function portalThemeCssVariables(manifest: PortalThemeManifestV2): PortalThemeCssProperties {
  const { color, radius, typography, motion } = manifest.tokens;
  const desktopHero = manifest.assets["overview.hero.desktop"]?.path;
  const mobileHero = manifest.assets["overview.hero.mobile"]?.path;
  const desktopProgress =
    manifest.assets["progress.journey.desktop"]?.path ??
    manifest.assets["progress.hero.desktop"]?.path ??
    desktopHero;
  const mobileProgress =
    manifest.assets["progress.journey.mobile"]?.path ??
    manifest.assets["progress.hero.mobile"]?.path;
  return {
    "--portal-canvas": color.canvas,
    "--portal-surface": color.surface,
    "--portal-surface-alt": color.surfaceAlt,
    "--portal-text": color.text,
    "--portal-text-muted": color.textMuted,
    "--portal-primary": color.primary,
    "--portal-primary-strong": color.primaryStrong,
    "--portal-secondary": color.secondary,
    "--portal-reward": color.reward,
    "--portal-rail": color.rail,
    "--portal-card-radius": radius.card,
    "--portal-hero-radius": radius.hero,
    "--portal-display-font": typography.display,
    "--portal-body-font": typography.body,
    "--portal-motion-micro": `${motion.microMs}ms`,
    "--portal-motion-standard": `${motion.standardMs}ms`,
    "--portal-motion-celebration": `${motion.celebrationMs}ms`,
    "--portal-hero-desktop": desktopHero ? `url("${desktopHero}")` : "none",
    "--portal-hero-mobile": mobileHero ? `url("${mobileHero}")` : "none",
    "--portal-progress-desktop": desktopProgress ? `url("${desktopProgress}")` : "none",
    "--portal-progress-mobile": mobileProgress ? `url("${mobileProgress}")` : "none"
  };
}

const progressLabels: Record<string, string> = {
  "ocean-quest": "Zwemreis",
  "dolphin-bay": "Zwemroute",
  "turtle-trails": "Zwemtrail",
  "aqua-academy": "Training"
};

export function getProgressNavigationLabel(manifest: PortalThemeManifestV2) {
  return progressLabels[manifest.theme.key] ?? "Ontwikkeling";
}

export type NativeThemeTokenExport = {
  schemaVersion: 2;
  portalContract: typeof PARENT_PORTAL_CONTRACT;
  themeKey: string;
  release: string;
  compatibility: PortalThemeManifestV2["compatibility"];
  navigation: {
    primaryDestinations: readonly ["overview", "planning", "progress", "inbox", "payments"];
    routeIds: typeof parentPortalRouteIds;
  };
  tokens: {
    colors: PortalThemeManifestV2["tokens"]["color"];
    radii: PortalThemeManifestV2["tokens"]["radius"];
    typography: PortalThemeManifestV2["tokens"]["typography"];
    motionMilliseconds: PortalThemeManifestV2["tokens"]["motion"];
  };
  recipes: PortalThemeManifestV2["recipes"];
  assets: PortalThemeManifestV2["assets"];
  badges: PortalThemeManifestV2["badges"];
  behavior: PortalThemeManifestV2["native"] & {
    offlineCacheKey: "tenantId+themeKey+release";
    unknownRecipe: "fallback-to-default-and-report";
    childPicker: "native-popover-or-sheet";
    secureExternalNavigationOnly: true;
  };
  assessment: {
    scaleVersion: "five_point_v1";
    values: readonly [1, 2, 3, 4, 5];
    unratedValue: null;
    displayModes: readonly ["smileys", "stars"];
    optionCount: typeof LEARNER_ASSESSMENT_SCALE;
  };
  accessibility: PortalThemeManifestV2["accessibility"];
};

export function toNativeThemeTokenExport(manifest: PortalThemeManifestV2): NativeThemeTokenExport {
  return {
    schemaVersion: 2,
    portalContract: PARENT_PORTAL_CONTRACT,
    themeKey: manifest.theme.key,
    release: manifest.theme.release,
    compatibility: manifest.compatibility,
    navigation: {
      primaryDestinations: ["overview", "planning", "progress", "inbox", "payments"],
      routeIds: parentPortalRouteIds
    },
    tokens: {
      colors: manifest.tokens.color,
      radii: manifest.tokens.radius,
      typography: manifest.tokens.typography,
      motionMilliseconds: manifest.tokens.motion
    },
    recipes: manifest.recipes,
    assets: manifest.assets,
    badges: manifest.badges,
    behavior: {
      ...manifest.native,
      offlineCacheKey: "tenantId+themeKey+release",
      unknownRecipe: "fallback-to-default-and-report",
      childPicker: "native-popover-or-sheet",
      secureExternalNavigationOnly: true
    },
    assessment: {
      scaleVersion: "five_point_v1",
      values: [1, 2, 3, 4, 5],
      unratedValue: null,
      displayModes: ["smileys", "stars"],
      optionCount: LEARNER_ASSESSMENT_SCALE
    },
    accessibility: manifest.accessibility
  };
}
