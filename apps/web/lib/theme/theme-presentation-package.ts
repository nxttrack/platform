import { parseJourneyPresentation, presentationKeys, presentationObject, presentationVersion } from "./portal-journey-presentation";
import { readThemeJson, themeReviewDigest, writeThemeArchive, type ThemePackageFiles } from "./theme-package-archive";
import { validateThemeDeliverySet, validateThemeReleaseDocument, type ThemeReleaseDocument } from "./theme-release-validation";

export const PRESENTATION_PACKAGE_FORMAT = "nxttrack-presentation-package/1.0";

/** Export has no access to tenants, learners, audit notes, storage credentials or import records. */
export async function exportPresentationPackage(document: ThemeReleaseDocument, read: (key: string) => Promise<Buffer>): Promise<Buffer> {
  const checked = validateThemeReleaseDocument(document.manifest, document.presentation);
  const files = new Map<string, Buffer>();
  await validateThemeDeliverySet(checked.presentation, async (key) => {
    const bytes = await read(key); files.set(`assets/${key}`, bytes); return bytes;
  });
  files.set("manifest.json", Buffer.from(JSON.stringify({ format: PRESENTATION_PACKAGE_FORMAT, themeId: checked.presentation.themeId, release: checked.presentation.runtimeRelease, digest: themeReviewDigest(checked) })));
  files.set("native-manifest.json", Buffer.from(JSON.stringify(checked.manifest)));
  files.set("presentation.json", Buffer.from(JSON.stringify(checked.presentation)));
  return writeThemeArchive(files);
}

export async function importPresentationPackage(files: ThemePackageFiles, sourceHash: string, runtimeRelease?: string) {
  const required = (path: string) => { const bytes = files.get(path); if (!bytes) throw new Error(`Missing portable package file: ${path}`); return bytes; };
  const envelope = presentationObject(readThemeJson(required("manifest.json"), "manifest.json"), "portable package");
  presentationKeys(envelope, ["format", "themeId", "release", "digest"], "portable package");
  if (envelope.format !== PRESENTATION_PACKAGE_FORMAT) throw new Error("Unsupported presentation package format");
  const original = validateThemeReleaseDocument(readThemeJson(required("native-manifest.json"), "native-manifest.json"), readThemeJson(required("presentation.json"), "presentation.json"));
  if (envelope.themeId !== original.presentation.themeId || envelope.release !== original.presentation.runtimeRelease || envelope.digest !== themeReviewDigest(original)) throw new Error("Portable package identity/digest mismatch");
  const deliveries = new Map<string, Buffer>();
  await validateThemeDeliverySet(original.presentation, async (key) => { const bytes = required(`assets/${key}`); deliveries.set(key, bytes); return bytes; });
  const native = structuredClone(original.manifest); let rich = structuredClone(original.presentation);
  if (runtimeRelease && runtimeRelease !== rich.runtimeRelease) {
    const next = presentationVersion(runtimeRelease), previous = rich.runtimeRelease;
    native.theme.release = next as `${number}.${number}.${number}`; rich = { ...rich, runtimeRelease: next };
    for (const asset of Object.values(rich.assets)) {
      const old = asset.objectKey, key = old.replace(`/${previous}/`, `/${next}/`);
      Object.assign(asset, { objectKey: key }); deliveries.set(key, deliveries.get(old)!);
    }
    for (const asset of Object.values(native.assets)) if (asset) asset.path = asset.path.replace(`/${previous}/`, `/${next}/`) as `/${string}`;
    for (const key of [...deliveries.keys()]) if (key.startsWith(`${rich.themeId}/${previous}/`)) deliveries.delete(key);
  }
  const document = validateThemeReleaseDocument(native, parseJourneyPresentation(rich));
  return { kind: "draft" as const, dialect: "presentation-1.0" as const, ...document, files: deliveries, sourceHash, digest: themeReviewDigest(document), findings: [{ code: "PORTABLE_PRESENTATION", message: "Gevalideerde presentatie en rasterassets; publicatie en toewijzing zijn afzonderlijke stappen." }] };
}
