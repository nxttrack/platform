/** Portable presentation only. Never put tenant, learner or assessment records here.
 * Kept outside the exact numeric PortalThemeManifestV3/native contract.
 */
export const JOURNEY_PRESENTATION_CONTRACT = "rich-swim-journey/1.0" as const;
export const presentationLimits = Object.freeze({ assets: 300, worlds: 30, points: 100, dimension: 8192, pixels: 256 * 1024 * 1024 });

export type PresentationAsset = Readonly<{
  objectKey: string;
  sourcePath: string;
  contentHash: string;
  mime: "image/png" | "image/webp" | "image/avif" | "image/jpeg";
  width: number;
  height: number;
  hasAlpha: boolean;
  decorative: true;
}>;
export type JourneyPoint = Readonly<{ slotId: string; x: number; y: number }>;
export type JourneyScene = Readonly<{
  intrinsic: { width: number; height: number };
  layers: { back: string | null; mid: string | null; front: string | null };
  controlPoints: readonly JourneyPoint[];
  anchorSource: { path: string; sha256: string | null; status: "original" | "fixture-only" | "adapted" };
  safeZones: { topFraction: number; bottomFraction: number };
  parallax: { enabled: boolean; edgeCoverageApproved: boolean };
  quality: "source-native" | "legacy-crop" | "fixture-only";
}>;
export type JourneyGuide =
  | Readonly<{ mode: "none" }>
  | Readonly<{ mode: "route-light"; pulse: boolean; halo: boolean; routeGlow: boolean }>
  | Readonly<{ mode: "character"; poses: Partial<Record<"idle" | "travel" | "look" | "celebrate", string>>; widthDesktop: number; widthMobile: number; aspectRatio: number }>;
export type JourneyWorld = Readonly<{ id: string; name: string; landscape: JourneyScene; portrait: JourneyScene }>;
export type PortalJourneyPresentationV1 = Readonly<{
  presentationContract: typeof JOURNEY_PRESENTATION_CONTRACT;
  themeId: string;
  sourcePackageVersion: string;
  runtimeRelease: string;
  role: "standard" | "custom";
  journeyType: "rich-swim-journey";
  pearlArtwork: { mode: "none" | "explicit"; byCriterionIdentity: Readonly<Record<string, string>> };
  guide: JourneyGuide;
  worlds: Readonly<Record<string, JourneyWorld>>;
  supportSlots: Readonly<Record<string, string>>;
  collectibles: { routeBinding: "none"; pool: readonly { id: string; title: string; assetId: string | null }[] };
  assets: Readonly<Record<string, PresentationAsset>>;
}>;

const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const reserved = new Set(["__proto__", "constructor", "prototype"]);

export function presentationObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}: expected object`);
  if (Object.keys(value).some((key) => reserved.has(key))) throw new Error(`Invalid ${label}: reserved key`);
  return value as Record<string, unknown>;
}
export function presentationKeys(value: Record<string, unknown>, keys: readonly string[], label: string, required: readonly string[] = keys) {
  if (Object.keys(value).some((key) => !keys.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) throw new Error(`Invalid ${label}: unsupported or missing field`);
}
export function presentationText(value: unknown, label: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new Error(`Invalid ${label}: text`);
  return value;
}
export function presentationId(value: unknown, label = "identifier"): string {
  const id = presentationText(value, label, 100);
  if (!idPattern.test(id) || reserved.has(id)) throw new Error(`Invalid ${label}`);
  return id;
}
export function presentationNumber(value: unknown, min: number, max: number, label: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw new Error(`Invalid ${label}: number`);
  return value;
}
export function presentationEnum<const T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) throw new Error(`Invalid ${label}`);
  return value as T;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}: boolean`);
  return value;
}
export function safeThemeSourcePath(value: unknown): string {
  const path = presentationText(value, "source path", 240);
  if (!/^[a-zA-Z0-9_. /-]+$/.test(path) || path.startsWith("/") || path.endsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid theme source path");
  return path;
}
function hash(value: unknown): string {
  if (typeof value !== "string" || !hashPattern.test(value)) throw new Error("Invalid content hash");
  return value;
}
export function presentationVersion(value: unknown): string {
  if (typeof value !== "string" || value.length > 40 || !semverPattern.test(value)) throw new Error("Invalid runtime release");
  return value;
}
function dictionary<T>(input: unknown, label: string, max: number, parse: (value: unknown, key: string) => T): Record<string, T> {
  const object = presentationObject(input, label);
  if (Object.keys(object).length > max) throw new Error(`Too many ${label}`);
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [presentationId(key, label), parse(value, key)]));
}

/** Parse untrusted JSON to a fresh, deeply frozen allowlisted value. No URLs/CSS/HTML. */
export function parseJourneyPresentation(input: unknown): PortalJourneyPresentationV1 {
  const data = presentationObject(input, "presentation");
  presentationKeys(data, ["presentationContract", "themeId", "sourcePackageVersion", "runtimeRelease", "role", "journeyType", "pearlArtwork", "guide", "worlds", "supportSlots", "collectibles", "assets"], "presentation");
  const themeId = presentationText(data.themeId, "theme ID", 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(themeId)) throw new Error("Invalid theme ID");
  const runtimeRelease = presentationVersion(data.runtimeRelease);
  let totalPixels = 0;
  const assets = dictionary(data.assets, "assets", presentationLimits.assets, (value): PresentationAsset => {
    const asset = presentationObject(value, "asset");
    presentationKeys(asset, ["objectKey", "sourcePath", "contentHash", "mime", "width", "height", "hasAlpha", "decorative"], "asset");
    const contentHash = hash(asset.contentHash);
    const mime = presentationEnum(asset.mime, ["image/png", "image/webp", "image/avif", "image/jpeg"], "asset MIME");
    const extension = { "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/jpeg": "jpg" }[mime];
    const objectKey = `${themeId}/${runtimeRelease}/${contentHash}.${extension}`;
    if (asset.objectKey !== objectKey || asset.decorative !== true) throw new Error("Invalid content-addressed asset reference");
    const width = presentationNumber(asset.width, 1, presentationLimits.dimension, "width", true);
    const height = presentationNumber(asset.height, 1, presentationLimits.dimension, "height", true);
    totalPixels += width * height;
    return { objectKey, sourcePath: safeThemeSourcePath(asset.sourcePath), contentHash, mime, width, height, hasAlpha: boolean(asset.hasAlpha, "alpha"), decorative: true };
  });
  if (totalPixels > presentationLimits.pixels) throw new Error("Theme exceeds decoded pixel budget");
  function assetReference(value: unknown): string {
    const id = presentationId(value, "asset reference");
    if (!Object.hasOwn(assets, id)) throw new Error(`Missing asset: ${id}`);
    return id;
  }
  function parseScene(input: unknown): JourneyScene {
    const scene = presentationObject(input, "scene");
    presentationKeys(scene, ["intrinsic", "layers", "controlPoints", "anchorSource", "safeZones", "parallax", "quality"], "scene");
    const size = presentationObject(scene.intrinsic, "intrinsic size");
    presentationKeys(size, ["width", "height"], "intrinsic size");
    const intrinsic = { width: presentationNumber(size.width, 1, presentationLimits.dimension, "scene width", true), height: presentationNumber(size.height, 1, presentationLimits.dimension, "scene height", true) };
    const layersInput = presentationObject(scene.layers, "layers");
    presentationKeys(layersInput, ["back", "mid", "front"], "layers");
    const layers = { back: layersInput.back === null ? null : assetReference(layersInput.back), mid: layersInput.mid === null ? null : assetReference(layersInput.mid), front: layersInput.front === null ? null : assetReference(layersInput.front) };
    const quality = presentationEnum(scene.quality, ["source-native", "legacy-crop", "fixture-only"], "scene quality");
    for (const id of Object.values(layers)) {
      if (!id) continue;
      const asset = assets[id];
      if (quality === "source-native" && (asset.width !== intrinsic.width || asset.height !== intrinsic.height)) throw new Error("Unregistered scene layer dimensions");
    }
    const points = scene.controlPoints;
    if (!Array.isArray(points) || points.length < 2 || points.length > presentationLimits.points) throw new Error("Invalid route control points");
    const controlPoints = points.map((input) => {
      const point = presentationObject(input, "control point");
      presentationKeys(point, ["slotId", "x", "y"], "control point");
      return { slotId: presentationId(point.slotId), x: presentationNumber(point.x, 0, 100, "point x"), y: presentationNumber(point.y, 0, 100, "point y") };
    });
    if (new Set(controlPoints.map((point) => point.slotId)).size !== controlPoints.length) throw new Error("Duplicate control point ID");
    const source = presentationObject(scene.anchorSource, "anchor source");
    presentationKeys(source, ["path", "sha256", "status"], "anchor source");
    const anchorSource = { path: safeThemeSourcePath(source.path), sha256: source.sha256 === null ? null : hash(source.sha256), status: presentationEnum(source.status, ["original", "fixture-only", "adapted"], "anchor status") };
    if (anchorSource.status !== "fixture-only" && !anchorSource.sha256) throw new Error("Missing source anchor digest");
    if (quality === "fixture-only" && anchorSource.status !== "fixture-only") throw new Error("Fixture provenance is required");
    const zones = presentationObject(scene.safeZones, "safe zones");
    presentationKeys(zones, ["topFraction", "bottomFraction"], "safe zones");
    const safeZones = { topFraction: presentationNumber(zones.topFraction, 0, 0.4, "top safe zone"), bottomFraction: presentationNumber(zones.bottomFraction, 0, 0.4, "bottom safe zone") };
    const depth = presentationObject(scene.parallax, "parallax");
    presentationKeys(depth, ["enabled", "edgeCoverageApproved"], "parallax");
    const parallax = { enabled: boolean(depth.enabled, "parallax"), edgeCoverageApproved: boolean(depth.edgeCoverageApproved, "edge coverage") };
    if (parallax.enabled && !parallax.edgeCoverageApproved) throw new Error("Unreviewed parallax edge coverage");
    return { intrinsic, layers, controlPoints, anchorSource, safeZones, parallax, quality };
  }
  const worlds = dictionary(data.worlds, "worlds", presentationLimits.worlds, (value, id): JourneyWorld => {
    const world = presentationObject(value, "world");
    presentationKeys(world, ["id", "name", "landscape", "portrait"], "world");
    if (world.id !== id) throw new Error("World key differs from ID");
    return { id, name: presentationText(world.name, "world name", 100), landscape: parseScene(world.landscape), portrait: parseScene(world.portrait) };
  });
  if (!Object.keys(worlds).length) throw new Error("At least one world required");
  const guideInput = presentationObject(data.guide, "guide");
  const mode = presentationEnum(guideInput.mode, ["none", "route-light", "character"], "guide mode");
  let guide: JourneyGuide;
  if (mode === "none") {
    presentationKeys(guideInput, ["mode"], "guide"); guide = { mode };
  } else if (mode === "route-light") {
    presentationKeys(guideInput, ["mode", "pulse", "halo", "routeGlow"], "guide");
    guide = { mode, pulse: boolean(guideInput.pulse, "pulse"), halo: boolean(guideInput.halo, "halo"), routeGlow: boolean(guideInput.routeGlow, "route glow") };
  } else {
    presentationKeys(guideInput, ["mode", "poses", "widthDesktop", "widthMobile", "aspectRatio"], "guide");
    const poses = presentationObject(guideInput.poses, "guide poses");
    presentationKeys(poses, ["idle", "travel", "look", "celebrate"], "guide poses", ["idle"]);
    guide = { mode, poses: Object.fromEntries(Object.entries(poses).map(([key, value]) => [key, assetReference(value)])), widthDesktop: presentationNumber(guideInput.widthDesktop, 40, 320, "guide desktop width"), widthMobile: presentationNumber(guideInput.widthMobile, 40, 320, "guide mobile width"), aspectRatio: presentationNumber(guideInput.aspectRatio, 0.2, 6, "guide aspect ratio") };
  }
  const pearls = presentationObject(data.pearlArtwork, "pearl artwork");
  presentationKeys(pearls, ["mode", "byCriterionIdentity"], "pearl artwork");
  const pearlMode = presentationEnum(pearls.mode, ["none", "explicit"], "pearl artwork mode");
  const artwork = dictionary(pearls.byCriterionIdentity, "criterion artwork", 300, assetReference);
  const role = presentationEnum(data.role, ["standard", "custom"], "theme role");
  if ((pearlMode === "none" && Object.keys(artwork).length) || (role === "standard" && pearlMode !== "none")) throw new Error("Neutral pearl policy forbids criterion artwork");
  if (themeId === "nxttrack-default" && (role !== "standard" || guide.mode === "character" || Object.values(worlds).some((world) => world.landscape.parallax.enabled || world.portrait.parallax.enabled))) throw new Error("Default requires neutral pearls, no character and no parallax");
  const collection = presentationObject(data.collectibles, "collectibles");
  presentationKeys(collection, ["routeBinding", "pool"], "collectibles");
  const routeBinding = presentationEnum(collection.routeBinding, ["none"], "collectible route binding");
  if (!Array.isArray(collection.pool) || collection.pool.length > 100) throw new Error("Invalid collectible pool");
  const pool = collection.pool.map((input) => {
    const item = presentationObject(input, "collectible");
    presentationKeys(item, ["id", "title", "assetId"], "collectible");
    return { id: presentationId(item.id), title: presentationText(item.title, "collectible title", 100), assetId: item.assetId === null ? null : assetReference(item.assetId) };
  });
  if (new Set(pool.map((item) => item.id)).size !== pool.length) throw new Error("Duplicate collectible ID");
  return freezePresentation({ presentationContract: presentationEnum(data.presentationContract, [JOURNEY_PRESENTATION_CONTRACT], "presentation contract"), themeId, sourcePackageVersion: presentationText(data.sourcePackageVersion, "source package version", 40), runtimeRelease, role, journeyType: presentationEnum(data.journeyType, ["rich-swim-journey"], "journey type"), pearlArtwork: { mode: pearlMode, byCriterionIdentity: artwork }, guide, worlds, supportSlots: dictionary(data.supportSlots, "support slots", 100, assetReference), collectibles: { routeBinding, pool }, assets });
}

function freezePresentation<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freezePresentation); }
  return value;
}

/** Check policy before any fallback resolver. Decorations are never skill artwork. */
export function resolvePearlArtwork(presentation: PortalJourneyPresentationV1, criterionIdentity: string): PresentationAsset | null {
  if (presentation.role === "standard" || presentation.pearlArtwork.mode === "none") return null;
  const id = presentation.pearlArtwork.byCriterionIdentity[criterionIdentity];
  return id && Object.hasOwn(presentation.assets, id) ? presentation.assets[id] : null;
}

export function presentationAssetUrl(asset: PresentationAsset): string {
  return `/portal-themes/${asset.objectKey}`;
}
