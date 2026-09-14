import { defaultJourneyPalette, defaultJourneyWorlds } from "./default-journey-profile";
import { parseJourneyPresentation, presentationKeys, presentationNumber, presentationObject, presentationText, type PortalJourneyPresentationV1 } from "./portal-journey-presentation";
import { validatePortalThemeManifest, type PortalThemeManifestV3 } from "./portal-theme-contract";
import { defaultPortalTheme } from "./portal-theme-registry";
import { themeImportLimits } from "./theme-package-archive";
import { inspectThemeRaster } from "./theme-raster";

export type ThemeReleaseDocument = { manifest: PortalThemeManifestV3; presentation: PortalJourneyPresentationV1 };
export type ThemeDeliveryRow = { id: string; objectKey: string; contentHash: string; mime: string; width: number; height: number; bytes: number };

/** The existing numeric/native contract stays intact; untrusted imports get additional bounds. */
export function validateThemeReleaseDocument(native: unknown, rich: unknown): ThemeReleaseDocument {
  const manifest = validatePortalThemeManifest(structuredClone(presentationObject(native, "native manifest")) as unknown as PortalThemeManifestV3);
  const presentation = parseJourneyPresentation(rich);
  if (manifest.theme.key !== presentation.themeId || manifest.theme.release !== presentation.runtimeRelease || manifest.theme.status !== "published") throw new Error("Native and presentation release identity disagree");
  presentationText(manifest.theme.displayName, "theme name", 100); presentationText(manifest.theme.description, "theme description", 2000);
  presentationText(manifest.experience.publicDisplayName, "public theme name", 100);
  const color = /^(#[\da-f]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0(?:\.\d+)?|\.\d+|1(?:\.0+)?))?\s*\))$/i;
  presentationKeys(presentationObject(manifest.tokens.color, "colors"), Object.keys(defaultPortalTheme.tokens.color), "colors");
  for (const value of [...Object.values(manifest.tokens.color), ...Object.values(manifest.tokens.gradient).flat()]) if (!color.test(value)) throw new Error("Only bounded color values are allowed");
  presentationKeys(presentationObject(manifest.tokens.radius, "radii"), ["card", "hero"], "radii");
  for (const value of Object.values(manifest.tokens.radius)) if (!/^(?:\d|[1-4]\d)(?:\.\d{1,2})?(?:px|rem)$/.test(value)) throw new Error("Invalid radius token");
  presentationKeys(presentationObject(manifest.tokens.typography, "fonts"), ["display", "body"], "fonts");
  for (const key of ["display", "body"] as const) if (manifest.tokens.typography[key] !== defaultPortalTheme.tokens.typography[key]) throw new Error("Only repository-owned font stacks are allowed");
  presentationKeys(presentationObject(manifest.tokens.motion, "motion"), ["microMs", "standardMs", "celebrationMs"], "motion");
  for (const value of Object.values(manifest.tokens.motion)) presentationNumber(value, 0, 3000, "motion duration", true);
  if (manifest.experience.requiresVerifiedLicenseForDisplayName !== (manifest.theme.key === "nationaal-zwem-abc")) throw new Error("Theme license policy cannot be changed by an import");
  if (manifest.theme.key === "nxttrack-default") {
    const expected = { primary: defaultJourneyPalette.primary, secondary: defaultJourneyPalette.secondary, reward: defaultJourneyPalette.accent, danger: defaultJourneyPalette.attention, text: defaultJourneyPalette.ink };
    for (const [key, value] of Object.entries(expected)) if (manifest.tokens.color[key as keyof typeof manifest.tokens.color].toLowerCase() !== value.toLowerCase()) throw new Error("Default semantic palette must be preserved");
  }
  // Native slots may reference only the same immutable, validated delivery set.
  for (const asset of Object.values(manifest.assets)) {
    if (asset && !Object.values(presentation.assets).some((entry) => `/portal-themes/${entry.objectKey}` === asset.path && entry.contentHash === asset.contentHash && entry.width === asset.width && entry.height === asset.height && entry.mime === asset.mimeType && asset.decorative === true)) throw new Error("Native asset is outside the reviewed delivery set");
  }
  return { manifest, presentation };
}

export async function validateThemeDeliverySet(presentation: PortalJourneyPresentationV1, read: (key: string) => Promise<Buffer>, signal?: AbortSignal): Promise<ThemeDeliveryRow[]> {
  const cache = new Map<string, { bytes: number; metadata: Awaited<ReturnType<typeof inspectThemeRaster>> }>();
  const rows: ThemeDeliveryRow[] = []; let totalBytes = 0, totalPixels = 0;
  for (const [id, expected] of Object.entries(presentation.assets)) {
    signal?.throwIfAborted();
    let checked = cache.get(expected.objectKey);
    if (!checked) {
      const bytes = await read(expected.objectKey);
      checked = { bytes: bytes.length, metadata: await inspectThemeRaster(bytes, expected.objectKey) };
      totalBytes += bytes.length; totalPixels += checked.metadata.width * checked.metadata.height;
      if (totalBytes > themeImportLimits.expanded || totalPixels > 256 * 1024 * 1024) throw new Error("Delivery set exceeds resource budget");
      cache.set(expected.objectKey, checked);
    }
    const actual = checked.metadata;
    if (actual.contentHash !== expected.contentHash || actual.mime !== expected.mime || actual.width !== expected.width || actual.height !== expected.height || actual.hasAlpha !== expected.hasAlpha) throw new Error(`Delivery differs from reviewed metadata: ${id}`);
    rows.push({ id, objectKey: expected.objectKey, contentHash: actual.contentHash, mime: actual.mime, width: actual.width, height: actual.height, bytes: checked.bytes });
  }
  return rows;
}

export function assertThemePublishable(presentation: PortalJourneyPresentationV1, provenance?: Record<string, unknown>): void {
  for (const world of Object.values(presentation.worlds)) for (const orientation of ["landscape", "portrait"] as const) {
    const scene = world[orientation];
    if (!scene.layers.back || scene.quality === "fixture-only" || scene.anchorSource.status === "fixture-only") throw new Error("Een technische fixture is geen publiceerbare wereld. Voeg de echte beelden en gecontroleerde ankers toe.");
  }
  if (presentation.themeId !== "nxttrack-default") return;
  // Only a server adapter verified against the actual original source may assert this provenance.
  // Editing display JSON or copying reference art cannot manufacture Default source verification.
  if (provenance?.dialect !== "default-source-1.1") throw new Error("De originele Default-bron is nog niet geverifieerd. Presentatievelden alleen zijn geen bronbewijs.");
  if (presentation.sourcePackageVersion !== "1.1.0" || Object.keys(presentation.worlds).length !== 6) throw new Error("Origineel Default 1.1-pakket met zes werelden vereist");
  for (const expected of defaultJourneyWorlds) {
    const world = presentation.worlds[expected.id]; if (!world) throw new Error(`Default-wereld ontbreekt: ${expected.id}`);
    for (const orientation of ["landscape", "portrait"] as const) {
      const scene = world[orientation], width = orientation === "portrait" ? 941 : 1672, height = orientation === "portrait" ? 1672 : 941;
      if (scene.anchorSource.status !== "original" || scene.quality !== "source-native" || scene.intrinsic.width !== width || scene.intrinsic.height !== height || !scene.layers.mid || !scene.layers.front || scene.parallax.enabled) throw new Error("Default vereist originele geregistreerde lagen en ankers; geen vervangende crop of parallax");
    }
  }
}
