import {
  PARENT_PORTAL_CONTRACT,
  parentPortalRouteIds,
  validatePortalThemeManifest,
  type ParentPortalRouteId,
  type PortalThemeAssetRef,
  type PortalThemeManifestV3,
  type PortalThemeTokenSet
} from "./portal-theme-contract";

type ThemeAssetSource = {
  desktop: { hash: string; width: number; height: number };
  mobile: { hash: string; width: number; height: number };
  mascot?: { hash: string; width: number; height: number };
};

type ThemeDefinition = {
  key: string;
  displayName: string;
  publicDisplayName: string;
  description: string;
  sectorMode: PortalThemeManifestV3["experience"]["sectorMode"];
  mascot: PortalThemeManifestV3["experience"]["mascot"];
  journeyMetaphor: string;
  developmentLabel: string;
  tokens: PortalThemeTokenSet;
  assets: ThemeAssetSource;
  haptics: "calm" | "precise" | "playful";
};

const release = "3.0.0" as const;

const commonComponents = {
  assessment: "assessment/five-point-v1",
  childPicker: "child-picker/pearl-v1",
  inboxActions: "inbox-actions/icon-pair-v1",
  mediaBlend: "media-blend/surface-fade-v1"
} as const;

function asset(
  path: `/${string}`,
  contentHash: string,
  width: number,
  height: number
): PortalThemeAssetRef {
  return {
    path,
    contentHash,
    width,
    height,
    mimeType: "image/png",
    decorative: true
  };
}

function createPages(): Record<ParentPortalRouteId, PortalThemeManifestV3["recipes"]["pages"][ParentPortalRouteId]> {
  const pages = Object.fromEntries(
    parentPortalRouteIds.map((routeId) => [routeId, "page/data-first-v2"])
  ) as Record<ParentPortalRouteId, PortalThemeManifestV3["recipes"]["pages"][ParentPortalRouteId]>;
  pages.overview = "overview/journey-engine-v1";
  pages.planning = "planning/timeline-v1";
  pages.development = "development/progress-v1";
  pages.badges = "badges/placeholder-wall-v1";
  return pages;
}

function createAssets(definition: ThemeDefinition): PortalThemeManifestV3["assets"] {
  const prefix = `/portal-themes/${definition.key}` as const;
  const desktop = asset(
    `${prefix}/journey-desktop.png`,
    definition.assets.desktop.hash,
    definition.assets.desktop.width,
    definition.assets.desktop.height
  );
  const mobile = asset(
    `${prefix}/journey-mobile.png`,
    definition.assets.mobile.hash,
    definition.assets.mobile.width,
    definition.assets.mobile.height
  );
  const assets: PortalThemeManifestV3["assets"] = {
    "overview.hero.desktop": desktop,
    "overview.hero.mobile": mobile,
    "progress.journey.desktop": desktop,
    "progress.journey.mobile": mobile
  };
  if (definition.assets.mascot) {
    assets["mascot.idle"] = asset(
      `${prefix}/mascot.png`,
      definition.assets.mascot.hash,
      definition.assets.mascot.width,
      definition.assets.mascot.height
    );
  }
  return assets;
}

function createManifest(definition: ThemeDefinition): PortalThemeManifestV3 {
  return validatePortalThemeManifest({
    schemaVersion: 3,
    theme: {
      key: definition.key,
      displayName: definition.displayName,
      release,
      status: "published",
      description: definition.description
    },
    compatibility: {
      portalContract: PARENT_PORTAL_CONTRACT,
      minimumWebBuild: "2026.08.03",
      requiredFeatureFlags: ["parent_portal_theme_pack_v3"]
    },
    branding: {
      strategy: definition.key === "nationaal-zwem-abc" ? "locked" : "accent-only",
      allowedTenantOverrides: ["brand.logo"],
      maximumAccentCoveragePercent: 0
    },
    experience: {
      publicDisplayName: definition.publicDisplayName,
      requiresVerifiedLicenseForDisplayName: definition.displayName !== definition.publicDisplayName,
      sectorMode: definition.sectorMode,
      mascot: definition.mascot,
      journeyMetaphor: definition.journeyMetaphor,
      developmentLabel: definition.developmentLabel
    },
    tokens: definition.tokens,
    recipes: {
      shell: "portal-shell/shared-v1",
      pages: createPages(),
      components: commonComponents
    },
    assets: createAssets(definition),
    badges: {
      familyKey: "neutral-artwork-placeholders",
      release: "1.0.0",
      fallbackRecipe: "badge-fallback/neutral-placeholder-v1",
      status: "review"
    },
    native: {
      hapticsProfile: definition.haptics,
      soundProfile: "off-by-default"
    },
    accessibility: {
      colorMode: "light",
      minimumContrast: "WCAG-AA",
      supportsReducedMotion: true,
      supportsDynamicType: true
    }
  });
}

function tokens(input: {
  primary: string;
  secondary: string;
  accent: string;
  attention: string;
  success: string;
  ink: string;
  muted: string;
  page: readonly [string, string, string];
  sidebar: readonly [string, string, string];
}): PortalThemeTokenSet {
  return {
    color: {
      canvas: input.page[0],
      surface: "rgba(255,255,255,.96)",
      surfaceAlt: input.page[1],
      text: input.ink,
      textMuted: input.muted,
      primary: input.primary,
      primaryStrong: input.ink,
      secondary: input.secondary,
      reward: input.accent,
      rail: input.sidebar[2],
      info: input.primary,
      success: input.success,
      warning: "#7A4B00",
      danger: input.attention
    },
    gradient: {
      page: input.page,
      sidebar: input.sidebar
    },
    radius: { card: "22px", hero: "29px" },
    typography: {
      display: "\"Inter Variable\", Inter, system-ui, sans-serif",
      body: "\"Inter Variable\", Inter, system-ui, sans-serif"
    },
    motion: { microMs: 140, standardMs: 220, celebrationMs: 480 }
  };
}

const definitions: ThemeDefinition[] = [
  {
    key: "nxttrack-default",
    displayName: "NXTTRACK Default",
    publicDisplayName: "NXTTRACK Default",
    description: "Een rustige, sectorspecifiek neutrale momentumroute.",
    sectorMode: "generic",
    mascot: null,
    journeyMetaphor: "momentum-route",
    developmentLabel: "Ontwikkeling",
    tokens: tokens({
      primary: "#4D63E6",
      secondary: "#15B8A6",
      accent: "#F0B447",
      attention: "#EF6C75",
      success: "#1EAF82",
      ink: "#172A46",
      muted: "#6B7C93",
      page: ["#F7F9FF", "#EAF1FF", "#EFFBF8"],
      sidebar: ["#26365B", "#1E2E50", "#172640"]
    }),
    assets: {
      desktop: { hash: "63bf886e4fc43d99f7ded594cfe419abe0de9ebe946dcfd2f0b2fa2c4f6cda12", width: 1672, height: 941 },
      mobile: { hash: "8a1b4bbdb33967f70dce1e0a7b97a614296d214c8cf0b91715c005a802308518", width: 941, height: 1672 }
    },
    haptics: "calm"
  },
  {
    key: "dolphin-bay",
    displayName: "Dolphin Bay",
    publicDisplayName: "Dolphin Bay",
    description: "Een zonnige, sociale reis van baai naar baai.",
    sectorMode: "swim",
    mascot: "dolphin",
    journeyMetaphor: "bay-to-bay",
    developmentLabel: "Zwemreis",
    tokens: tokens({
      primary: "#087BD5",
      secondary: "#0DC3C8",
      accent: "#FFC857",
      attention: "#FF7F73",
      success: "#24B88A",
      ink: "#073351",
      muted: "#617F91",
      page: ["#EFFCFF", "#D7F8FB", "#EEFBFF"],
      sidebar: ["#075071", "#063D61", "#052B4D"]
    }),
    assets: {
      desktop: { hash: "d2294e3ce995c2fc2d9a0b0962ac058e1a9f46dc3a289a37844a10b0e81c1c58", width: 1672, height: 941 },
      mobile: { hash: "6718a238c5787a20a582fe8d2f0ea71f2ce27065f4eac6d15a92970c0e7ed719", width: 941, height: 1672 },
      mascot: { hash: "03d852ba7b0d2e3a430222f1250a2479fc9a05119ce75479205cfc750e53b7d5", width: 1254, height: 1254 }
    },
    haptics: "playful"
  },
  {
    key: "turtle-trails",
    displayName: "Turtle Trails",
    publicDisplayName: "Turtle Trails",
    description: "Een kalme stroomroute met veilige, herkenbare stappen.",
    sectorMode: "swim",
    mascot: "sea-turtle",
    journeyMetaphor: "calm-current-trail",
    developmentLabel: "Zwemroute",
    tokens: tokens({
      primary: "#147E84",
      secondary: "#45A878",
      accent: "#E8BD68",
      attention: "#E57C6F",
      success: "#3B9D70",
      ink: "#153D42",
      muted: "#69827E",
      page: ["#F5FBF7", "#E4F3E9", "#EEF9F7"],
      sidebar: ["#245652", "#194946", "#123B3B"]
    }),
    assets: {
      desktop: { hash: "6634b7b7eb9d4ebc6f2f0dd08172266e3489a3fce1f866d1b7096e7511a41de2", width: 1664, height: 936 },
      mobile: { hash: "4eefe146e8723ff0a3ccfdfe5d4d665ac24862e86533fbc9379c142bbf7a05fd", width: 936, height: 1664 },
      mascot: { hash: "4876ed4c2b5fb924d2f5ff25c348d0babe07892a6b945afea8ee8db4bc483d8e", width: 1254, height: 1254 }
    },
    haptics: "calm"
  },
  {
    key: "polar-splash",
    displayName: "Polar Splash",
    publicDisplayName: "Polar Splash",
    description: "Een heldere expeditie langs ijsplaten en poolwater.",
    sectorMode: "swim",
    mascot: "penguin",
    journeyMetaphor: "ice-floe-expedition",
    developmentLabel: "Poolreis",
    tokens: tokens({
      primary: "#3278D5",
      secondary: "#66CDDD",
      accent: "#F4C969",
      attention: "#EF758D",
      success: "#39AA9E",
      ink: "#18385B",
      muted: "#6D819D",
      page: ["#F5FAFF", "#E4F3FF", "#F0EDFF"],
      sidebar: ["#284F7A", "#203F68", "#1A3157"]
    }),
    assets: {
      desktop: { hash: "8b26b922f823872e8d8a390cec67b89861c09fa723a11ae7d72e4aa46f23fa51", width: 1664, height: 936 },
      mobile: { hash: "903f56d660b460d7a57e43f6440c1190e3bcf4e0a11642bc77265771951c17d1", width: 936, height: 1664 },
      mascot: { hash: "af24557e10ed39c052c8e515bb42572693e55b580c254df1c32068807c1cd7ec", width: 1024, height: 1536 }
    },
    haptics: "playful"
  },
  {
    key: "coastal-explorer",
    displayName: "Coastal Explorer",
    publicDisplayName: "Coastal Explorer",
    description: "Een nuchtere ontdekkingstocht langs de Nederlandse kust.",
    sectorMode: "swim",
    mascot: "beach-lifeguard",
    journeyMetaphor: "dutch-coast-route",
    developmentLabel: "Kustreis",
    tokens: tokens({
      primary: "#176BB3",
      secondary: "#1DA8A5",
      accent: "#F1BA57",
      attention: "#EF6E4F",
      success: "#2C9C75",
      ink: "#173A55",
      muted: "#6C7E8D",
      page: ["#F8FBF7", "#E9F2EA", "#EAF7FA"],
      sidebar: ["#244F67", "#1D4159", "#17364C"]
    }),
    assets: {
      desktop: { hash: "a70b067e64ef50143788a2c1bdd5c87be9c2487edcde260f768e0a0ac44f1fd1", width: 1672, height: 941 },
      mobile: { hash: "d3ac6cb81a806820b1591f6f236e5b5f48c2abf13f6d5eada737f69f95796a7d", width: 941, height: 1672 },
      mascot: { hash: "5f940c254a8c560a51289422f8c66377b0fc563a812c9944cad940ee683564c6", width: 1024, height: 1536 }
    },
    haptics: "precise"
  },
  {
    key: "nationaal-zwem-abc",
    displayName: "Nationaal Zwem ABC",
    publicDisplayName: "Diplomareis A–B–C",
    description: "Een krachtige A–B–C diplomareis met gecontroleerde naamvoering.",
    sectorMode: "swim-abc-gated",
    mascot: null,
    journeyMetaphor: "abc-diploma-lanes",
    developmentLabel: "Zwem ABC",
    tokens: tokens({
      primary: "#00AEDE",
      secondary: "#10B9D9",
      accent: "#FFDA25",
      attention: "#EE2D35",
      success: "#009D61",
      ink: "#17324D",
      muted: "#6B7A8A",
      page: ["#F7FCFF", "#E5F8FF", "#FFF1EC"],
      sidebar: ["#1B4C70", "#163C5E", "#112E4E"]
    }),
    assets: {
      desktop: { hash: "68a954d4b754540552eea2ef834653235379ff2fd6f99f7e53a5e8a7c2b478b6", width: 1672, height: 941 },
      mobile: { hash: "dcc52b05c4a7a55aa61676b6463797fecdbd39037003e442ee838eaffceca4d2", width: 941, height: 1672 }
    },
    haptics: "precise"
  }
];

const releases = new Map(
  definitions.map((definition) => {
    const manifest = createManifest(definition);
    return [`${manifest.theme.key}@${manifest.theme.release}`, manifest];
  })
);

export const defaultPortalTheme = releases.get(`nxttrack-default@${release}`)!;
export const portalThemeCatalog = Object.freeze(Array.from(releases.values()));
export const portalThemeKeys = Object.freeze(portalThemeCatalog.map((theme) => theme.theme.key));

export function getThemeRelease(themeKey: string, themeRelease: string): PortalThemeManifestV3 | null {
  return releases.get(`${themeKey}@${themeRelease}`) ?? null;
}

export function resolveRegisteredTheme(themeKey?: string | null, themeRelease?: string | null) {
  return (themeKey && themeRelease ? getThemeRelease(themeKey, themeRelease) : null) ?? defaultPortalTheme;
}

export function getRouteRecipe(manifest: PortalThemeManifestV3, routeId: ParentPortalRouteId) {
  return manifest.recipes.pages[routeId];
}

export function getThemeAsset(
  manifest: PortalThemeManifestV3,
  slot: keyof PortalThemeManifestV3["assets"]
) {
  return manifest.assets[slot];
}

export function getThemeDisplayName(manifest: PortalThemeManifestV3, verifiedLicense = false) {
  return manifest.experience.requiresVerifiedLicenseForDisplayName && !verifiedLicense
    ? manifest.experience.publicDisplayName
    : manifest.theme.displayName;
}
