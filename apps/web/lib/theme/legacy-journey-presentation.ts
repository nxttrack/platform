import { createDefaultJourneyFixture } from "./default-journey-profile";
import { parseJourneyPresentation, type JourneyScene, type PresentationAsset, type PortalJourneyPresentationV1 } from "./portal-journey-presentation";
import type { PortalThemeManifestV3 } from "./portal-theme-contract";

export type ResolvedJourneyVisual = {
  presentation: PortalJourneyPresentationV1;
  worldId: string;
  assetUrls?: Record<string, string>;
  source: "legacy" | "published";
};

/** Existing release artwork stays a legacy presentation, never relabelled as Default source 1.1.
 * The only temporary part is the explicit fixture layout; curriculum/world IDs are not guessed.
 */
export function legacyJourneyVisual(manifest: PortalThemeManifestV3): ResolvedJourneyVisual {
  const fixture = createDefaultJourneyFixture().worlds["badje-01"];
  const assets: Record<string, PresentationAsset> = {}, assetUrls: Record<string, string> = {};
  const sources = { desktop: manifest.assets["progress.journey.desktop"], mobile: manifest.assets["progress.journey.mobile"], mascot: manifest.assets["mascot.idle"] };
  for (const [id, asset] of Object.entries(sources)) {
    if (!asset) continue;
    const extension = asset.mimeType.split("/")[1];
    assets[id] = { objectKey: `${manifest.theme.key}/${manifest.theme.release}/${asset.contentHash}.${extension}`, sourcePath: asset.path.slice(1), contentHash: asset.contentHash, mime: asset.mimeType, width: asset.width, height: asset.height, hasAlpha: id === "mascot", decorative: true };
    assetUrls[id] = asset.path;
  }
  function scene(orientation: "landscape" | "portrait"): JourneyScene {
    const id = orientation === "portrait" ? "mobile" : "desktop", asset = assets[id];
    return { ...fixture[orientation], intrinsic: asset ? { width: asset.width, height: asset.height } : fixture[orientation].intrinsic, layers: { back: asset ? id : null, mid: null, front: null }, anchorSource: { path: "legacy/portal-layout-v3.json", sha256: null, status: "fixture-only" }, quality: asset ? "legacy-crop" : "fixture-only" };
  }
  const presentation = parseJourneyPresentation({ presentationContract: "rich-swim-journey/1.0", themeId: manifest.theme.key, sourcePackageVersion: "legacy-native-3", runtimeRelease: manifest.theme.release, role: "standard", journeyType: "rich-swim-journey", pearlArtwork: { mode: "none", byCriterionIdentity: {} },
    guide: manifest.theme.key === "nxttrack-default" ? { mode: "route-light", pulse: true, halo: true, routeGlow: true } : assets.mascot ? { mode: "character", poses: { idle: "mascot" }, widthDesktop: 170, widthMobile: 140, aspectRatio: assets.mascot.width / assets.mascot.height } : { mode: "none" },
    worlds: { legacy: { id: "legacy", name: manifest.experience.publicDisplayName, landscape: scene("landscape"), portrait: scene("portrait") } }, supportSlots: {}, assets, collectibles: { routeBinding: "none", pool: [] }
  });
  return { presentation, worldId: "legacy", assetUrls, source: "legacy" };
}
