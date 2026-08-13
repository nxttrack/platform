export const PARENT_PORTAL_CONTRACT = "parent-portal/1.2" as const;
export const LEARNER_ASSESSMENT_SCALE = 5 as const;

export const parentPortalRouteIds = [
  "overview",
  "planning",
  "lesson-detail",
  "development",
  "badges",
  "media",
  "diplomas",
  "inbox",
  "payments",
  "documents",
  "feedback",
  "children",
  "profile"
] as const;

export type ParentPortalRouteId = (typeof parentPortalRouteIds)[number];
export type AssessmentRatingDisplay = "smileys" | "stars";
export type ThemeReleaseStatus = "draft" | "review" | "published" | "deprecated";
export type BrandingOverride = "brand.primary" | "brand.secondary" | "brand.accent" | "brand.logo";

export type PortalThemeTokenSet = {
  color: {
    canvas: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    primary: string;
    primaryStrong: string;
    secondary: string;
    reward: string;
    rail: string;
    info: string;
    success: string;
    warning: string;
    danger: string;
  };
  gradient: {
    page: readonly [string, string, string];
    sidebar: readonly [string, string, string];
  };
  radius: { card: string; hero: string };
  typography: { display: string; body: string };
  motion: { microMs: number; standardMs: number; celebrationMs: number };
};

export const registeredShellRecipeIds = [
  "portal-shell/shared-v1"
] as const;

export const registeredPageRecipeIds = [
  "page/data-first-v2",
  "overview/journey-engine-v1",
  "planning/timeline-v1",
  "development/progress-v1",
  "badges/placeholder-wall-v1"
] as const;

export const registeredComponentVariantIds = [
  "assessment/five-point-v1",
  "child-picker/pearl-v1",
  "inbox-actions/icon-pair-v1",
  "media-blend/surface-fade-v1"
] as const;

export const registeredBadgeFallbackRecipeIds = [
  "badge-fallback/neutral-placeholder-v1"
] as const;

export type RegisteredShellRecipeId = (typeof registeredShellRecipeIds)[number];
export type RegisteredPageRecipeId = (typeof registeredPageRecipeIds)[number];
export type RegisteredComponentVariantId = (typeof registeredComponentVariantIds)[number];
export type RegisteredBadgeFallbackRecipeId = (typeof registeredBadgeFallbackRecipeIds)[number];

export const themeAssetSlots = [
  "shell.background.mobile",
  "shell.background.desktop",
  "overview.hero.mobile",
  "overview.hero.desktop",
  "overview.no-actions",
  "planning.empty-lessons",
  "planning.no-credits",
  "progress.hero.mobile",
  "progress.hero.desktop",
  "progress.journey.mobile",
  "progress.journey.desktop",
  "progress.empty",
  "progress.chapter.completed",
  "badges.reference",
  "badges.locked",
  "badges.surprise",
  "badges.empty",
  "media.empty",
  "diplomas.empty",
  "inbox.empty",
  "payments.empty",
  "documents.empty",
  "feedback.empty",
  "family.empty",
  "profile.header",
  "mascot.idle",
  "mascot.celebrate"
] as const;

export type ThemeAssetSlot = (typeof themeAssetSlots)[number];

export type PortalThemeAssetRef = {
  path: `/${string}`;
  contentHash: string;
  width: number;
  height: number;
  mimeType: "image/avif" | "image/webp" | "image/png";
  decorative: true;
};

export interface PortalThemeManifestV3 {
  schemaVersion: 3;
  theme: {
    key: string;
    displayName: string;
    release: `${number}.${number}.${number}`;
    status: ThemeReleaseStatus;
    description: string;
  };
  compatibility: {
    portalContract: typeof PARENT_PORTAL_CONTRACT;
    minimumWebBuild?: string;
    minimumIosBuild?: string;
    minimumAndroidBuild?: string;
    requiredFeatureFlags?: string[];
  };
  branding: {
    strategy: "safe-palette" | "accent-only" | "locked";
    allowedTenantOverrides: BrandingOverride[];
    maximumAccentCoveragePercent: number;
  };
  experience: {
    publicDisplayName: string;
    requiresVerifiedLicenseForDisplayName: boolean;
    sectorMode: "generic" | "swim" | "swim-abc-gated";
    mascot: "dolphin" | "sea-turtle" | "penguin" | "beach-lifeguard" | "manta" | null;
    journeyMetaphor: string;
    developmentLabel: string;
  };
  tokens: PortalThemeTokenSet;
  recipes: {
    shell: RegisteredShellRecipeId;
    pages: Record<ParentPortalRouteId, RegisteredPageRecipeId>;
    components: Record<
      "assessment" | "childPicker" | "inboxActions" | "mediaBlend",
      RegisteredComponentVariantId
    >;
  };
  assets: Partial<Record<ThemeAssetSlot, PortalThemeAssetRef>>;
  badges: {
    familyKey: string;
    release: `${number}.${number}.${number}`;
    fallbackRecipe: RegisteredBadgeFallbackRecipeId;
    status: "review" | "published";
  };
  native: {
    hapticsProfile: "calm" | "precise" | "playful";
    soundProfile: "off-by-default";
  };
  accessibility: {
    colorMode: "light";
    minimumContrast: "WCAG-AA";
    supportsReducedMotion: true;
    supportsDynamicType: true;
  };
}

const themeKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const colorPattern = /^(#[0-9a-f]{6}|rgba?\([^)]+\))$/i;

export type PortalThemeManifestV2 = PortalThemeManifestV3;

export function validatePortalThemeManifest(input: PortalThemeManifestV3): PortalThemeManifestV3 {
  assertExactKeys(input, ["schemaVersion", "theme", "compatibility", "branding", "experience", "tokens", "recipes", "assets", "badges", "native", "accessibility"], "manifest");
  assertExactKeys(input.theme, ["key", "displayName", "release", "status", "description"], "theme");
  assertExactKeys(
    input.compatibility,
    ["portalContract", "minimumWebBuild", "minimumIosBuild", "minimumAndroidBuild", "requiredFeatureFlags"],
    "compatibility",
    ["portalContract"]
  );
  assertExactKeys(input.branding, ["strategy", "allowedTenantOverrides", "maximumAccentCoveragePercent"], "branding");
  assertExactKeys(input.experience, ["publicDisplayName", "requiresVerifiedLicenseForDisplayName", "sectorMode", "mascot", "journeyMetaphor", "developmentLabel"], "experience");
  assertExactKeys(input.tokens, ["color", "gradient", "radius", "typography", "motion"], "tokens");
  assertExactKeys(input.tokens.gradient, ["page", "sidebar"], "token gradients");
  assertExactKeys(input.recipes, ["shell", "pages", "components"], "recipes");
  assertExactKeys(input.recipes.pages, parentPortalRouteIds, "page recipes");
  assertExactKeys(input.recipes.components, ["assessment", "childPicker", "inboxActions", "mediaBlend"], "component recipes");
  assertExactKeys(input.badges, ["familyKey", "release", "fallbackRecipe", "status"], "badges");
  assertExactKeys(input.native, ["hapticsProfile", "soundProfile"], "native");
  assertExactKeys(input.accessibility, ["colorMode", "minimumContrast", "supportsReducedMotion", "supportsDynamicType"], "accessibility");
  if (input.schemaVersion !== 3) throw new Error("Unsupported portal theme schema");
  if (!themeKeyPattern.test(input.theme.key)) throw new Error("Invalid portal theme key");
  if (!semverPattern.test(input.theme.release)) throw new Error("Invalid portal theme release");
  if (!semverPattern.test(input.badges.release)) throw new Error("Invalid badge family release");
  if (input.compatibility.portalContract !== PARENT_PORTAL_CONTRACT) throw new Error("Incompatible portal contract");
  if (input.branding.maximumAccentCoveragePercent < 0 || input.branding.maximumAccentCoveragePercent > 100) {
    throw new Error("Invalid accent coverage");
  }
  if (!registeredShellRecipeIds.includes(input.recipes.shell)) throw new Error("Unknown shell recipe");
  for (const routeId of parentPortalRouteIds) {
    if (!registeredPageRecipeIds.includes(input.recipes.pages[routeId])) {
      throw new Error(`Unknown page recipe for ${routeId}`);
    }
  }
  for (const recipe of Object.values(input.recipes.components)) {
    if (!registeredComponentVariantIds.includes(recipe)) throw new Error("Unknown component recipe");
  }
  if (!registeredBadgeFallbackRecipeIds.includes(input.badges.fallbackRecipe)) throw new Error("Unknown badge fallback recipe");
  for (const value of Object.values(input.tokens.color)) {
    if (!colorPattern.test(value)) throw new Error("Invalid semantic color token");
  }
  for (const gradient of Object.values(input.tokens.gradient)) {
    if (gradient.length !== 3 || gradient.some((value) => !colorPattern.test(value))) {
      throw new Error("Invalid semantic gradient token");
    }
  }
  for (const [slot, asset] of Object.entries(input.assets)) {
    if (!themeAssetSlots.includes(slot as ThemeAssetSlot)) throw new Error(`Unknown asset slot: ${slot}`);
    if (asset) {
      assertExactKeys(asset, ["path", "contentHash", "width", "height", "mimeType", "decorative"], `asset ${slot}`);
      if (!/^\/portal-themes\/[a-z0-9/_\.-]+$/.test(asset.path) || !/^[a-f0-9]{64}$/.test(asset.contentHash)) {
        throw new Error(`Invalid asset reference: ${slot}`);
      }
      if (!Number.isInteger(asset.width) || !Number.isInteger(asset.height) || asset.width < 1 || asset.height < 1) {
        throw new Error(`Invalid asset dimensions: ${slot}`);
      }
    }
  }
  return deepFreeze(input);
}

function assertExactKeys(value: object, allowed: readonly string[], label: string, required: readonly string[] = allowed) {
  const allowedKeys = new Set<string>(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key));
  const missing = required.filter((key) => !(key in value));
  if (unknown.length || missing.length) {
    throw new Error(`Invalid ${label} keys: ${[...unknown, ...missing].join(", ")}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
