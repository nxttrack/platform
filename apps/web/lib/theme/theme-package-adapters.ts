import sharp from "sharp";

import { defaultJourneyPalette } from "./default-journey-profile";
import { parseJourneyPresentation, presentationId, presentationObject, presentationKeys, presentationText, presentationVersion, safeThemeSourcePath, type JourneyScene, type PresentationAsset, type PortalJourneyPresentationV1 } from "./portal-journey-presentation";
import { validatePortalThemeManifest, type PortalThemeManifestV3 } from "./portal-theme-contract";
import { defaultPortalTheme, getThemeRelease } from "./portal-theme-registry";
import { readThemeArchive, readThemeJson, themeContentHash, themeImportLimits, themeReviewDigest, type ThemePackageFiles } from "./theme-package-archive";
import { assertThemeSourceSchema } from "./theme-source-schema";

export type ThemeImportFinding = { code: string; message: string; path?: string };
export type ThemeImportAnalysis = {
  kind: "draft";
  dialect: "package-1.0" | "studio-3.0" | "presentation-1.0";
  manifest: PortalThemeManifestV3;
  presentation: PortalJourneyPresentationV1;
  digest: string;
  sourceHash: string;
  findings: ThemeImportFinding[];
  files: ReadonlyMap<string, Buffer>;
};
export type GuidedThemeAnalysis = { kind: "guided"; sourceHash: string; images: { path: string; width: number; height: number; hash: string; hasAlpha: boolean }[]; findings: ThemeImportFinding[] };
type SourceScene = { width: number; height: number; layers: Partial<Record<"back" | "mid" | "front", string | null>>; anchors: [number, number][]; status?: string; safeZones?: { top?: number; bottom?: number } };
type SourceTheme = {
  schemaVersion: "3.0"; id: string; name: string; kind: "default" | "custom"; description?: string;
  colors?: Partial<Record<"primary" | "secondary" | "ink" | "text" | "surface" | "gold" | "water" | "pearl", string>>;
  guide?: { poses?: Partial<Record<"idle" | "swim" | "look" | "celebrate", string | null>>; widthDesktop?: number; widthMobile?: number; aspectRatio?: number };
  pearls: { artworkMode: "none" | "optional"; artworkByCriterion?: Record<string, string | null>; baseAsset?: string | null };
  worlds: Record<string, { id: string; name: string; scenes: { landscape?: SourceScene; portrait?: SourceScene }; worldBadgeAsset?: string | null; nextWorldId?: string | null }>;
  defaultWorld: string; collectibles?: { pool?: { id: string; title: string; asset?: string | null }[] };
};

async function imageMetadata(bytes: Buffer, path: string): Promise<Omit<PresentationAsset, "objectKey">> {
  if (!bytes.length || bytes.length > themeImportLimits.file) throw new Error("Image exceeds byte budget");
  const input = sharp(bytes, { limitInputPixels: 32 * 1024 * 1024, failOn: "warning", animated: false });
  const meta = await input.metadata();
  const mime = ({ png: "image/png", webp: "image/webp", avif: "image/avif", heif: "image/avif", jpeg: "image/jpeg" } as const)[meta.format as "png" | "webp" | "avif" | "heif" | "jpeg"];
  const extension = path.split(".").at(-1)?.toLowerCase();
  const expected = ({ png: "image/png", webp: "image/webp", avif: "image/avif", jpg: "image/jpeg", jpeg: "image/jpeg" } as const)[extension as "png" | "webp" | "avif" | "jpg" | "jpeg"];
  if (!mime || (meta.format === "heif" && meta.compression !== "av1") || !meta.width || !meta.height || meta.width > 8192 || meta.height > 8192 || meta.width * meta.height > 32 * 1024 * 1024 || (meta.pages ?? 1) !== 1 || (expected && mime !== expected)) throw new Error(`Unsupported raster, dimensions or extension: ${path}`);
  // Force actual decoding before accepting bytes; process one file at a time.
  await input.stats();
  return { sourcePath: safeThemeSourcePath(path), contentHash: themeContentHash(bytes), mime, width: meta.width, height: meta.height, hasAlpha: meta.hasAlpha ?? false, decorative: true };
}
function assetKey(themeId: string, release: string, metadata: Omit<PresentationAsset, "objectKey">): string {
  const extension = { "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/jpeg": "jpg" }[metadata.mime];
  return `${themeId}/${release}/${metadata.contentHash}.${extension}`;
}
function requiredFile(files: ThemePackageFiles, path: string): Buffer {
  const bytes = files.get(safeThemeSourcePath(path));
  if (!bytes) throw new Error(`Missing package file: ${path}`);
  return bytes;
}

export async function analyzeThemePackage(bytes: Buffer, inputName: string, options: { signal?: AbortSignal; runtimeRelease?: string; localFiles?: ThemePackageFiles } = {}): Promise<ThemeImportAnalysis | GuidedThemeAnalysis> {
  options.signal?.throwIfAborted();
  const findings: ThemeImportFinding[] = [], sourceHash = themeContentHash(bytes);
  let files: ThemePackageFiles, source: unknown, sourceVersion: string, sourcePath: string, dialect: ThemeImportAnalysis["dialect"], index: Record<string, unknown>;
  if (inputName.toLowerCase().endsWith(".zip")) {
    files = readThemeArchive(bytes, options.signal);
    if (files.has("config/manifest.json")) {
      readThemeJson(requiredFile(files, "config/manifest.json"), "Default source manifest");
      throw new Error("DEFAULT_SOURCE_CONTRACT_NOT_AVAILABLE: de originele Default 1.1 JSON-structuur moet eerst worden geverifieerd; geen automatische beeldimport.");
    }
    if (!files.has("manifest.json")) {
      if ([...files.keys()].some((path) => /(^|\/)manifest\.json$/i.test(path) || path === "theme.json" || path === "presentation.json")) throw new Error("Recognized but incomplete theme package; guided fallback forbidden");
      const images: GuidedThemeAnalysis["images"] = []; let pixels = 0;
      for (const [path, image] of files) {
        options.signal?.throwIfAborted();
        if (!/\.(png|jpe?g|webp|avif)$/i.test(path)) continue;
        const meta = await imageMetadata(image, path); pixels += meta.width * meta.height;
        if (pixels > 256 * 1024 * 1024) throw new Error("Image set exceeds pixel budget");
        images.push({ path, width: meta.width, height: meta.height, hash: meta.contentHash, hasAlpha: meta.hasAlpha });
      }
      if (!images.length) throw new Error("No manifest or raster images found");
      return { kind: "guided", sourceHash, images, findings: [{ code: "MANUAL_MAPPING_REQUIRED", message: "Kies expliciet de wereld, oriëntatie en rol van ieder beeld. Er is nog niets opgeslagen of toegewezen." }] };
    }
    const manifest = readThemeJson(requiredFile(files, "manifest.json"), "manifest.json");
    assertThemeSourceSchema(manifest, "manifest");
    const info = presentationObject(manifest, "manifest");
    sourceVersion = presentationText(info.packageVersion, "package version");
    sourcePath = "theme.json"; dialect = "package-1.0";
    source = readThemeJson(requiredFile(files, sourcePath), sourcePath);
    index = presentationObject(readThemeJson(requiredFile(files, "assets.json"), "assets.json"), "asset index");
    assertThemeSourceSchema(index, "assets");
    if (presentationObject(source, "theme").id !== info.themeId) throw new Error("Manifest and source theme IDs disagree");
    options = { ...options, runtimeRelease: options.runtimeRelease ?? presentationVersion(info.version) };
  } else if (inputName.toLowerCase().endsWith(".json")) {
    const input = presentationObject(readThemeJson(bytes, "Studio JSON"), "Studio export");
    presentationKeys(input, ["schemaVersion", "exportedAt", "notice", "theme", "assets"], "Studio export", ["schemaVersion", "theme", "assets"]);
    if (input.schemaVersion !== "3.0") throw new Error("Unsupported Studio version");
    source = input.theme; index = presentationObject(input.assets, "Studio assets");
    files = options.localFiles ?? new Map(); sourceVersion = "3.0"; sourcePath = "studio.json"; dialect = "studio-3.0";
    findings.push({ code: "STUDIO_ADAPTED", message: "Oude Studio-export vertaald; publiceren en toewijzen blijven aparte handelingen." });
  } else throw new Error("Select a ZIP package or supported Studio JSON");
  assertThemeSourceSchema(source, "theme");
  const theme = source as SourceTheme; // Narrowed only after the repository-owned source schema succeeds.
  const release = presentationVersion(options.runtimeRelease ?? "1.0.0");
  if (getThemeRelease(theme.id, release)) throw new Error("Release already exists; choose a new immutable release version");
  if (!Object.hasOwn(theme.worlds, theme.defaultWorld)) throw new Error("Default world is missing");
  if (Object.keys(index).length > 300) throw new Error("Too many assets");
  const assets: Record<string, PresentationAsset> = {}, deliveries = new Map<string, Buffer>();
  let totalPixels = 0, totalBytes = 0;
  for (const [id, value] of Object.entries(index)) {
    options.signal?.throwIfAborted(); presentationId(id, "asset ID");
    let image: Buffer, path: string, expectedHash: unknown;
    if (dialect === "package-1.0") {
      const entry = presentationObject(value, "asset entry"); path = safeThemeSourcePath(entry.path); expectedHash = entry.sha256;
      image = requiredFile(files, path);
    } else {
      const entry = typeof value === "string" ? null : presentationObject(value, "Studio asset");
      if (entry) presentationKeys(entry, ["src", "variants"], "Studio asset", ["src"]);
      const src = presentationText(entry ? entry.src : value, "Studio image", themeImportLimits.file * 2);
      if (src.startsWith("data:")) {
        const match = /^data:image\/(png|jpeg|webp|avif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
        if (!match) throw new Error("Unsupported inline raster");
        image = Buffer.from(match[2], "base64"); path = `assets/${id}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
      } else {
        path = safeThemeSourcePath(src);
        if (!path.startsWith("assets/")) throw new Error("Studio assets must be local; remote fetch forbidden");
        image = requiredFile(files, path);
      }
      if (entry?.variants !== undefined) findings.push({ code: "STUDIO_VARIANTS_INERT", path, message: "Alleen de basisafbeelding wordt gebruikt; oude responsive variantmetadata wordt niet uitgevoerd." });
    }
    const meta = await imageMetadata(image, path);
    if (expectedHash !== undefined && expectedHash !== meta.contentHash) throw new Error(`Asset hash mismatch: ${path}`);
    totalPixels += meta.width * meta.height; totalBytes += image.length;
    if (totalPixels > 256 * 1024 * 1024 || totalBytes > themeImportLimits.expanded) throw new Error("Asset set exceeds decode/byte budget");
    const objectKey = assetKey(theme.id, release, meta);
    assets[id] = { ...meta, objectKey }; deliveries.set(objectKey, image);
    if (meta.width < 1440 && meta.height < 1440) findings.push({ code: "SOURCE_RESOLUTION", path, message: `${meta.width} × ${meta.height} bronpixels; niet opgeschaald. Visuele beoordeling vereist.` });
  }
  const nullableRef = (value: string | null | undefined, required = false): string | null => {
    if (!value) { if (required) throw new Error("Required background reference missing"); return null; }
    if (!Object.hasOwn(assets, value)) {
      if (required) throw new Error(`Required asset missing: ${value}`);
      findings.push({ code: "OPTIONAL_ASSET_MISSING", path: value, message: "Optionele afbeelding ontbreekt; neutrale weergave blijft beschikbaar." }); return null;
    }
    return value;
  };
  const sourceDigest = dialect === "studio-3.0" ? sourceHash : themeContentHash(requiredFile(files, sourcePath));
  const worlds = Object.fromEntries(Object.entries(theme.worlds).map(([id, world]) => {
    if (id !== world.id) throw new Error("World key differs from source ID");
    if (world.nextWorldId && !Object.hasOwn(theme.worlds, world.nextWorldId)) throw new Error("Unknown next world");
    function scene(orientation: "portrait" | "landscape"): JourneyScene {
      const input = world.scenes[orientation]; if (!input) throw new Error(`Missing ${orientation} scene`);
      const fixture = input.status === "procedural-fallback";
      const layers = { back: nullableRef(input.layers.back, !fixture), mid: nullableRef(input.layers.mid), front: nullableRef(input.layers.front) };
      const mismatched = Object.values(layers).some((key) => key && (assets[key].width !== input.width || assets[key].height !== input.height));
      if (mismatched && (layers.mid || layers.front)) throw new Error("Scene layers use different intrinsic canvases");
      if (mismatched) findings.push({ code: "LEGACY_CROP", path: `${id}/${orientation}`, message: "Historische beeldcrop; geen zelfstandige portraitmaster. Controleer de compositie." });
      if (fixture) findings.push({ code: "TECHNICAL_FIXTURE", path: `${id}/${orientation}`, message: "Expliciete technische fallback zonder illustratie; geen geleverde wereldkunst." });
      return { intrinsic: { width: input.width, height: input.height }, layers, controlPoints: input.anchors.map(([x, y], index) => ({ slotId: `source-${index}`, x, y })), anchorSource: { path: sourcePath, sha256: sourceDigest, status: fixture ? "fixture-only" : "adapted" }, safeZones: { topFraction: input.safeZones?.top ?? 0.15, bottomFraction: input.safeZones?.bottom ?? 0.2 }, parallax: { enabled: false, edgeCoverageApproved: false }, quality: fixture ? "fixture-only" : mismatched ? "legacy-crop" : "source-native" };
    }
    return [id, { id, name: world.name, landscape: scene("landscape"), portrait: scene("portrait") }];
  }));
  const poses = Object.fromEntries(Object.entries(theme.guide?.poses ?? {}).flatMap(([key, value]) => {
    const ref = nullableRef(value); return ref ? [[key === "swim" ? "travel" : key, ref]] : [];
  }));
  const standard = theme.kind === "default";
  if (standard && (theme.pearls.artworkMode !== "none" || Object.keys(theme.pearls.artworkByCriterion ?? {}).length)) findings.push({ code: "NEUTRAL_PEARLS_ENFORCED", message: "Standaardthema: illustratieverwijzingen blijven catalogusdecoratie; onderdelen houden neutrale parels." });
  const criterionArtwork = standard ? {} : Object.fromEntries(Object.entries(theme.pearls.artworkByCriterion ?? {}).flatMap(([id, value]) => { const ref = nullableRef(value); return ref ? [[id, ref]] : []; }));
  const supportSlots = Object.fromEntries(Object.entries(theme.worlds).flatMap(([id, world]) => { const ref = nullableRef(world.worldBadgeAsset); return ref ? [[`world.${id}.badge`, ref]] : []; }));
  const presentation = parseJourneyPresentation({ presentationContract: "rich-swim-journey/1.0", themeId: theme.id, sourcePackageVersion: sourceVersion, runtimeRelease: release, role: standard ? "standard" : "custom", journeyType: "rich-swim-journey", pearlArtwork: { mode: standard || theme.pearls.artworkMode === "none" ? "none" : "explicit", byCriterionIdentity: criterionArtwork },
    guide: theme.id === "nxttrack-default" ? { mode: "route-light", pulse: true, halo: true, routeGlow: true } : poses.idle ? { mode: "character", poses, widthDesktop: theme.guide?.widthDesktop ?? 170, widthMobile: theme.guide?.widthMobile ?? 140, aspectRatio: theme.guide?.aspectRatio ?? 1 } : { mode: "none" },
    worlds, supportSlots, assets, collectibles: { routeBinding: "none", pool: (theme.collectibles?.pool ?? []).map((item) => ({ id: item.id, title: item.title, assetId: nullableRef(item.asset) })) }
  });
  const manifest = sourceThemeNativeManifest(theme, release);
  return { kind: "draft", dialect, manifest, presentation, digest: themeReviewDigest({ manifest, presentation }), sourceHash, findings, files: deliveries };
}

/** Token projection is constructed from trusted recipes and hex colors, never uploaded CSS. */
function sourceThemeNativeManifest(theme: SourceTheme, release: string): PortalThemeManifestV3 {
  const native = structuredClone(defaultPortalTheme), color = theme.colors ?? {};
  native.theme = { key: theme.id, release: release as `${number}.${number}.${number}`, displayName: theme.name, description: theme.description ?? "Geïmporteerde portaalpresentatie", status: "published" };
  native.experience = { ...native.experience, publicDisplayName: theme.name, sectorMode: "swim", journeyMetaphor: "rich-swim-journey", developmentLabel: "Ontwikkeling", mascot: null };
  native.assets = {};
  const palette = theme.id === "nxttrack-default" ? defaultJourneyPalette : { primary: color.primary ?? native.tokens.color.primary, secondary: color.secondary ?? native.tokens.color.secondary, accent: color.gold ?? native.tokens.color.reward, attention: native.tokens.color.danger, ink: color.ink ?? color.text ?? native.tokens.color.text };
  Object.assign(native.tokens.color, { primary: palette.primary, secondary: palette.secondary, reward: palette.accent, danger: palette.attention, text: palette.ink, primaryStrong: palette.ink });
  return validatePortalThemeManifest(native);
}
