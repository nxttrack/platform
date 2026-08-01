import type { CSSProperties } from "react";

import type { PortalThemeManifestV2 } from "./portal-theme-contract";

export type PortalThemeCssProperties = CSSProperties & Record<`--portal-${string}`, string>;

export function portalThemeCssVariables(manifest: PortalThemeManifestV2): PortalThemeCssProperties {
  const { color, radius, typography, motion } = manifest.tokens;
  const desktopHero = manifest.assets["overview.hero.desktop"]?.path;
  const mobileHero = manifest.assets["overview.hero.mobile"]?.path;
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
    "--portal-hero-mobile": mobileHero ? `url("${mobileHero}")` : "none"
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
  schemaVersion: 1;
  themeKey: string;
  release: string;
  colors: PortalThemeManifestV2["tokens"]["color"];
  radii: PortalThemeManifestV2["tokens"]["radius"];
  typography: PortalThemeManifestV2["tokens"]["typography"];
  motionMilliseconds: PortalThemeManifestV2["tokens"]["motion"];
};

export function toNativeThemeTokenExport(manifest: PortalThemeManifestV2): NativeThemeTokenExport {
  return {
    schemaVersion: 1,
    themeKey: manifest.theme.key,
    release: manifest.theme.release,
    colors: manifest.tokens.color,
    radii: manifest.tokens.radius,
    typography: manifest.tokens.typography,
    motionMilliseconds: manifest.tokens.motion
  };
}
