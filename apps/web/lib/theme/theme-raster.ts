import sharp from "sharp";
import { safeThemeSourcePath, type PresentationAsset } from "./portal-journey-presentation";
import { themeContentHash, themeImportLimits } from "./theme-package-archive";

export async function inspectThemeRaster(bytes: Buffer, path: string): Promise<Omit<PresentationAsset, "objectKey">> {
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
