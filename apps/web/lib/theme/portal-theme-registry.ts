import {
  PARENT_PORTAL_CONTRACT,
  parentPortalRouteIds,
  validatePortalThemeManifest,
  type ParentPortalRouteId,
  type PortalThemeAssetRef,
  type PortalThemeManifestV2,
  type PortalThemeTokenSet,
  type RegisteredBadgeFallbackRecipeId,
  type RegisteredPageRecipeId,
  type RegisteredShellRecipeId
} from "./portal-theme-contract";

type ThemeDefinition = {
  key: string;
  displayName: string;
  release: `${number}.${number}.${number}`;
  description: string;
  shell: RegisteredShellRecipeId;
  overview: RegisteredPageRecipeId;
  planning: RegisteredPageRecipeId;
  progress: RegisteredPageRecipeId;
  badges: RegisteredPageRecipeId;
  badgeFamily: string;
  badgeFallback: RegisteredBadgeFallbackRecipeId;
  badgeStatus: "review" | "published";
  branding: PortalThemeManifestV2["branding"];
  tokens: PortalThemeTokenSet;
  assets?: PortalThemeManifestV2["assets"];
  haptics: "calm" | "precise" | "playful";
};

const commonComponents = {
  assessment: "assessment/five-point-v1",
  childPicker: "child-picker/pearl-v1",
  inboxActions: "inbox-actions/icon-pair-v1",
  mediaBlend: "media-blend/surface-fade-v1"
} as const;

function asset(path: `/${string}`, contentHash: string, width: number, height: number): PortalThemeAssetRef {
  return { path, contentHash, width, height, mimeType: "image/webp", decorative: true };
}

function createPages(definition: ThemeDefinition): Record<ParentPortalRouteId, RegisteredPageRecipeId> {
  const pages = Object.fromEntries(parentPortalRouteIds.map((routeId) => [routeId, "page/data-first-v1"])) as Record<
    ParentPortalRouteId,
    RegisteredPageRecipeId
  >;
  pages.overview = definition.overview;
  pages.planning = definition.planning;
  pages.progress = definition.progress;
  pages.badges = definition.badges;
  return pages;
}

function createManifest(definition: ThemeDefinition): PortalThemeManifestV2 {
  return validatePortalThemeManifest({
    schemaVersion: 2,
    theme: {
      key: definition.key,
      displayName: definition.displayName,
      release: definition.release,
      status: "published",
      description: definition.description
    },
    compatibility: { portalContract: PARENT_PORTAL_CONTRACT, minimumWebBuild: "2026.08.01" },
    branding: definition.branding,
    tokens: definition.tokens,
    recipes: { shell: definition.shell, pages: createPages(definition), components: commonComponents },
    assets: definition.assets ?? {},
    badges: {
      familyKey: definition.badgeFamily,
      release: "1.0.0",
      fallbackRecipe: definition.badgeFallback,
      status: definition.badgeStatus
    },
    native: { hapticsProfile: definition.haptics, soundProfile: "off-by-default" },
    accessibility: {
      colorMode: "light",
      minimumContrast: "WCAG-AA",
      supportsReducedMotion: true,
      supportsDynamicType: true
    }
  });
}

const statusColors = {
  info: "#075EA8",
  success: "#146C4C",
  warning: "#7A4B00",
  danger: "#B4233D"
} as const;

const definitions: ThemeDefinition[] = [
  {
    key: "nxttrack-default",
    displayName: "NXTTRACK Default",
    release: "2.2.2",
    description: "Heldere, speels-professionele zwemschoolbasis.",
    shell: "pearl-frame/default-v2",
    overview: "overview/swim-school-v2",
    planning: "planning/standard-timeline-v2",
    progress: "progress/growth-cards-v2",
    badges: "badges/default-medallions-v1",
    badgeFamily: "nxttrack-default-medallions",
    badgeFallback: "badge-fallback/default-medallion-v1",
    badgeStatus: "review",
    branding: {
      strategy: "safe-palette",
      allowedTenantOverrides: ["brand.primary", "brand.secondary", "brand.accent", "brand.logo"],
      maximumAccentCoveragePercent: 18
    },
    tokens: {
      color: {
        canvas: "#EEF6FB", surface: "#FFFFFF", surfaceAlt: "#F6FAFC", text: "#09203E", textMuted: "#61748B",
        primary: "#0878E5", primaryStrong: "#0759B4", secondary: "#14B8B1", reward: "#F6B744", rail: "#071D39", ...statusColors
      },
      radius: { card: "19px", hero: "27px" },
      typography: { display: "\"Inter Variable\", system-ui, sans-serif", body: "\"Inter Variable\", system-ui, sans-serif" },
      motion: { microMs: 140, standardMs: 200, celebrationMs: 420 }
    },
    assets: {
      "overview.hero.desktop": asset("/portal-themes/nxttrack-default/overview-landscape-1440.webp", "a6fa038007e31e549d8dd2db3e7e4aae38780666551bbd6bd75eae1756945cda", 1440, 810),
      "progress.journey.desktop": asset("/portal-themes/nxttrack-default/progress-journey-landscape-1440.webp", "08b1faa8d7dad55d3697265a718e156f164f285171cee620e7042dfb956f8c9e", 1440, 810)
    },
    haptics: "calm"
  },
  {
    key: "ocean-quest",
    displayName: "Ocean Quest",
    release: "1.2.2",
    description: "Avontuurlijke parel- en eilandreis.",
    shell: "pearl-frame/ocean-v2",
    overview: "overview/pearl-route-v2",
    planning: "planning/quest-waypoints-v2",
    progress: "progress/pearl-trail-v2",
    badges: "badges/ocean-medallions-v1",
    badgeFamily: "ocean-quest-medallions",
    badgeFallback: "badge-fallback/ocean-medallion-v1",
    badgeStatus: "published",
    branding: { strategy: "accent-only", allowedTenantOverrides: ["brand.logo", "brand.accent"], maximumAccentCoveragePercent: 10 },
    tokens: {
      color: {
        canvas: "#DFF5FC", surface: "rgba(255,255,255,.93)", surfaceAlt: "#F0FAFF", text: "#071D40", textMuted: "#54708E",
        primary: "#0878E5", primaryStrong: "#0753BD", secondary: "#0FC4BA", reward: "#F4BE5D", rail: "#08274A", ...statusColors
      },
      radius: { card: "23px", hero: "32px" },
      typography: { display: "\"Nunito Sans Variable\", \"Inter Variable\", system-ui, sans-serif", body: "\"Inter Variable\", system-ui, sans-serif" },
      motion: { microMs: 150, standardMs: 240, celebrationMs: 560 }
    },
    assets: {
      "overview.hero.desktop": asset("/portal-themes/ocean-quest/overview-landscape-1440.webp", "de9175ba78c56e0a050606a703cc3bac47f2ffd96783bf72ca2dbac5ffe59816", 1440, 810),
      "overview.hero.mobile": asset("/portal-themes/ocean-quest/overview-portrait-640.webp", "cc4146c25d2ef04fec30f13fec851811024cfb65572bf12865d4a64dd09db08e", 640, 1001),
      "progress.journey.desktop": asset("/portal-themes/ocean-quest/progress-journey-landscape-1440.webp", "0697e2c99d2cafffe66a85c8d73866dc814d61a06615f4af80ec93653c49438e", 1440, 810),
      "progress.journey.mobile": asset("/portal-themes/ocean-quest/progress-journey-portrait-640.webp", "158ed2425b1783eb43bb318a24b8ea42fa91359aafb2c70a622bce0edca9c6cf", 640, 999)
    },
    haptics: "playful"
  },
  {
    key: "dolphin-bay",
    displayName: "Dolphin Bay",
    release: "1.0.1",
    description: "Zonnige, sociale en energieke boeienroute.",
    shell: "pearl-frame/bay-v1",
    overview: "overview/bay-route-v1",
    planning: "planning/bay-buoys-v1",
    progress: "progress/bay-course-v1",
    badges: "badges/bay-medallions-v1",
    badgeFamily: "dolphin-bay-medallions",
    badgeFallback: "badge-fallback/bay-medallion-v1",
    badgeStatus: "review",
    branding: { strategy: "accent-only", allowedTenantOverrides: ["brand.logo", "brand.accent"], maximumAccentCoveragePercent: 10 },
    tokens: {
      color: {
        canvas: "#DFF7FB", surface: "rgba(255,255,255,.95)", surfaceAlt: "#EFFBFD", text: "#072A49", textMuted: "#5A7389",
        primary: "#0873B4", primaryStrong: "#07578D", secondary: "#2BBCCB", reward: "#E8A92F", rail: "#062D4B", ...statusColors
      },
      radius: { card: "22px", hero: "31px" },
      typography: { display: "\"Nunito Sans Variable\", \"Inter Variable\", system-ui, sans-serif", body: "\"Inter Variable\", system-ui, sans-serif" },
      motion: { microMs: 140, standardMs: 220, celebrationMs: 480 }
    },
    assets: {
      "overview.hero.desktop": asset("/portal-themes/dolphin-bay/overview-landscape-1440.webp", "fd594669bba0a25815861e68af92289ced10a14a64c082157134b813151dc11e", 1440, 810),
      "overview.hero.mobile": asset("/portal-themes/dolphin-bay/overview-portrait-640.webp", "a3e13396ed88e0997a602c3b816a119c3479783694db33532fb8a7430c682d2d", 640, 1137),
      "progress.journey.desktop": asset("/portal-themes/dolphin-bay/progress-journey-landscape-1440.webp", "fd594669bba0a25815861e68af92289ced10a14a64c082157134b813151dc11e", 1440, 810),
      "progress.journey.mobile": asset("/portal-themes/dolphin-bay/progress-journey-portrait-640.webp", "a3e13396ed88e0997a602c3b816a119c3479783694db33532fb8a7430c682d2d", 640, 1137)
    },
    haptics: "playful"
  },
  {
    key: "turtle-trails",
    displayName: "Turtle Trails",
    release: "1.0.1",
    description: "Rustige, veilige zwemtrail met schelpstappen.",
    shell: "pearl-frame/trail-v1",
    overview: "overview/shell-route-v1",
    planning: "planning/shell-calendar-v1",
    progress: "progress/shell-trail-v1",
    badges: "badges/turtle-scutes-v1",
    badgeFamily: "turtle-trails-scutes",
    badgeFallback: "badge-fallback/turtle-scute-v1",
    badgeStatus: "review",
    branding: { strategy: "accent-only", allowedTenantOverrides: ["brand.logo", "brand.accent"], maximumAccentCoveragePercent: 10 },
    tokens: {
      color: {
        canvas: "#E5F5ED", surface: "rgba(255,255,255,.95)", surfaceAlt: "#F4FBF7", text: "#123A3C", textMuted: "#5D7978",
        primary: "#087F75", primaryStrong: "#06675F", secondary: "#5DBB83", reward: "#D5A947", rail: "#103B40", ...statusColors
      },
      radius: { card: "22px", hero: "31px" },
      typography: { display: "\"Plus Jakarta Sans Variable\", \"Inter Variable\", system-ui, sans-serif", body: "\"Inter Variable\", system-ui, sans-serif" },
      motion: { microMs: 160, standardMs: 260, celebrationMs: 600 }
    },
    assets: {
      "overview.hero.desktop": asset("/portal-themes/turtle-trails/overview-landscape-1440.webp", "4e533aa1f1a49924ec99760743f27df98dd8f9cbcb32feb8fe039d4130e0dbc9", 1440, 810),
      "overview.hero.mobile": asset("/portal-themes/turtle-trails/overview-portrait-640.webp", "c0cafdf7d0d683c8d5cb43b33df19d521f7b3a339769d76acdbf13a8323ebd73", 640, 1137),
      "progress.journey.desktop": asset("/portal-themes/turtle-trails/progress-journey-landscape-1440.webp", "4e533aa1f1a49924ec99760743f27df98dd8f9cbcb32feb8fe039d4130e0dbc9", 1440, 810),
      "progress.journey.mobile": asset("/portal-themes/turtle-trails/progress-journey-portrait-640.webp", "c0cafdf7d0d683c8d5cb43b33df19d521f7b3a339769d76acdbf13a8323ebd73", 640, 1137)
    },
    haptics: "calm"
  },
  {
    key: "aqua-academy",
    displayName: "Aqua Academy",
    release: "1.0.1",
    description: "Strakke, sportieve zwemacademie met checkpoints.",
    shell: "pearl-frame/academy-v1",
    overview: "overview/academy-checkpoints-v1",
    planning: "planning/academy-lanes-v1",
    progress: "progress/academy-pass-v1",
    badges: "badges/academy-crests-v1",
    badgeFamily: "aqua-academy-crests",
    badgeFallback: "badge-fallback/academy-crest-v1",
    badgeStatus: "review",
    branding: { strategy: "accent-only", allowedTenantOverrides: ["brand.logo", "brand.accent"], maximumAccentCoveragePercent: 10 },
    tokens: {
      color: {
        canvas: "#E7F1F6", surface: "rgba(255,255,255,.96)", surfaceAlt: "#F5FAFC", text: "#071B33", textMuted: "#5C7188",
        primary: "#0869D7", primaryStrong: "#06459D", secondary: "#11B9C6", reward: "#D3A13A", rail: "#06284C", ...statusColors
      },
      radius: { card: "18px", hero: "27px" },
      typography: { display: "\"Manrope Variable\", \"Inter Variable\", system-ui, sans-serif", body: "\"Inter Variable\", system-ui, sans-serif" },
      motion: { microMs: 120, standardMs: 180, celebrationMs: 360 }
    },
    assets: {
      "overview.hero.desktop": asset("/portal-themes/aqua-academy/overview-landscape-1440.webp", "a596f09f3475ca7d8f2823f79f5eb47586770f4126c396b9b23d39cd5ad5c6b7", 1440, 810),
      "overview.hero.mobile": asset("/portal-themes/aqua-academy/overview-portrait-640.webp", "82fb8009275b46c8d13456fb43b4ce66fdd48c59b34a8e58ac0b75e88fbc482c", 640, 1137),
      "progress.journey.desktop": asset("/portal-themes/aqua-academy/progress-journey-landscape-1440.webp", "a596f09f3475ca7d8f2823f79f5eb47586770f4126c396b9b23d39cd5ad5c6b7", 1440, 810),
      "progress.journey.mobile": asset("/portal-themes/aqua-academy/progress-journey-portrait-640.webp", "82fb8009275b46c8d13456fb43b4ce66fdd48c59b34a8e58ac0b75e88fbc482c", 640, 1137)
    },
    haptics: "precise"
  }
];

const releases = new Map(definitions.map((definition) => {
  const manifest = createManifest(definition);
  return [`${manifest.theme.key}@${manifest.theme.release}`, manifest];
}));

export const defaultPortalTheme = releases.get("nxttrack-default@2.2.2")!;
export const portalThemeCatalog = Object.freeze(Array.from(releases.values()));

export function getThemeRelease(themeKey: string, release: string): PortalThemeManifestV2 | null {
  return releases.get(`${themeKey}@${release}`) ?? null;
}

export function resolveRegisteredTheme(themeKey?: string | null, release?: string | null) {
  return (themeKey && release ? getThemeRelease(themeKey, release) : null) ?? defaultPortalTheme;
}

export function getRouteRecipe(manifest: PortalThemeManifestV2, routeId: ParentPortalRouteId) {
  return manifest.recipes.pages[routeId];
}

export function getThemeAsset(manifest: PortalThemeManifestV2, slot: keyof PortalThemeManifestV2["assets"]) {
  return manifest.assets[slot];
}
