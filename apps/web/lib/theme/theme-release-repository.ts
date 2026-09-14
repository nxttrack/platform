import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getThemeRelease, portalThemeCatalog } from "./portal-theme-registry";
import { analyzeThemePackage, mapGuidedThemePackage, type ThemeImportAnalysis, type GuidedThemeAnalysis } from "./theme-package-adapters";
import { readThemeArchive, themeContentHash, themeImportLimits } from "./theme-package-archive";
import { assertThemePublishable, validateThemeDeliverySet, validateThemeReleaseDocument, type ThemeReleaseDocument } from "./theme-release-validation";

export type StoredThemeRelease = ThemeReleaseDocument & {
  status: "draft" | "review" | "published"; revision: number; digest: string; reviewDigest: string | null;
  findings: { code: string; message: string; path?: string }[];
  provenance: Record<string, unknown>;
};

/** Request-scoped cache only. No stale global catalog after publication/rollback. */
export const getPublishedThemeRelease = cache(async (key: string, release: string) => {
  const builtIn = getThemeRelease(key, release);
  if (builtIn) return { manifest: builtIn, presentation: null };
  const result = await createAdminClient().from("portal_theme_release")
    .select("manifest_json, presentation_json").eq("theme_key", key).eq("release", release).eq("status", "published").maybeSingle();
  if (result.error) throw new Error("Theme release repository unavailable");
  if (!result.data?.presentation_json) return null;
  return validateThemeReleaseDocument(result.data.manifest_json, result.data.presentation_json);
});

export async function getPublishedThemeCatalog() {
  const result = await createAdminClient().from("portal_theme_release").select("manifest_json, presentation_json")
    .eq("status", "published").not("presentation_json", "is", null).order("created_at", { ascending: false });
  if (result.error) throw new Error("Theme catalog unavailable");
  return [...portalThemeCatalog, ...(result.data ?? []).map((row) => validateThemeReleaseDocument(row.manifest_json, row.presentation_json).manifest)];
}

/** Only call after the platform-manager shell/API guard. Raw provenance never enters portal DTOs. */
export async function getManagedThemeRelease(key: string, release: string): Promise<StoredThemeRelease | null> {
  const result = await createAdminClient().from("portal_theme_release")
    .select("manifest_json, presentation_json, status, import_revision, content_hash, review_digest, import_findings_json, source_provenance_json")
    .eq("theme_key", key).eq("release", release).maybeSingle();
  if (result.error) throw new Error("Theme release could not be loaded");
  if (!result.data?.presentation_json) return null;
  const row = result.data;
  if (!["draft", "review", "published"].includes(row.status)) return null;
  return { ...validateThemeReleaseDocument(row.manifest_json, row.presentation_json), status: row.status, revision: row.import_revision, digest: row.content_hash, reviewDigest: row.review_digest, findings: row.import_findings_json, provenance: row.source_provenance_json };
}

export async function readThemeDelivery(key: string): Promise<Buffer> {
  const result = await createAdminClient().storage.from("portal-theme-assets").download(key);
  if (result.error || !result.data) throw new Error("A presentation asset is unavailable");
  if (result.data.size > themeImportLimits.file) throw new Error("Stored asset exceeds resource budget");
  return Buffer.from(await result.data.arrayBuffer());
}

/** Content-addressed objects are insert-only. Retry verifies existing bytes instead of overwriting. */
export async function storeThemeDeliveries(analysis: ThemeImportAnalysis, signal?: AbortSignal) {
  const rows = await validateThemeDeliverySet(analysis.presentation, async (key) => {
    const bytes = analysis.files.get(key); if (!bytes) throw new Error("Delivery set incomplete"); return bytes;
  }, signal);
  const written = new Set<string>();
  for (const row of rows) {
    signal?.throwIfAborted(); if (written.has(row.objectKey)) continue;
    const result = await createAdminClient().storage.from("portal-theme-assets").upload(row.objectKey, analysis.files.get(row.objectKey)!, { contentType: row.mime, upsert: false, cacheControl: "31536000" });
    if (result.error) {
      const existing = await readThemeDelivery(row.objectKey);
      if (themeContentHash(existing) !== row.contentHash) throw new Error("Existing delivery content differs; overwrite refused");
    }
    written.add(row.objectKey);
  }
  return rows;
}

export async function analyzeStoredThemeImport(actorId: string, bytes: Buffer, name: string, runtimeRelease?: string, signal?: AbortSignal) {
  if (!bytes.length || bytes.length > themeImportLimits.archive || name.length > 160 || !/\.(zip|json)$/i.test(name)) throw new Error("Kies een ZIP- of JSON-bestand binnen de uploadlimiet");
  const admin = createAdminClient();
  const recent = await admin.from("portal_theme_import").select("id", { count: "exact", head: true }).eq("created_by_user_id", actorId).gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (recent.error) throw new Error("Import storage unavailable");
  if ((recent.count ?? 0) >= 20) throw new Error("Er zijn te veel imports gestart. Rond de openstaande imports eerst af.");
  const id = crypto.randomUUID(), hash = themeContentHash(bytes), objectKey = `${id}/${hash}`;
  const record = await admin.from("portal_theme_import").insert({ id, created_by_user_id: actorId, source_hash: hash, source_name: name, source_object_key: objectKey, byte_size: bytes.length });
  if (record.error) throw new Error("Import could not be registered");
  try {
    signal?.throwIfAborted();
    const upload = await admin.storage.from("portal-theme-imports").upload(objectKey, bytes, { contentType: "application/octet-stream", upsert: false });
    if (upload.error) throw new Error("Quarantaine-opslag is niet bereikbaar");
    const analysis = await analyzeThemePackage(bytes, name, { runtimeRelease, signal });
    if (analysis.kind === "draft") {
      validateThemeReleaseDocument(analysis.manifest, analysis.presentation);
      await storeThemeDeliveries(analysis, signal);
    } else {
      const images = readThemeArchive(bytes, signal), uploadedHashes = new Set<string>();
      for (const image of analysis.images) {
        signal?.throwIfAborted();
        if (uploadedHashes.has(image.hash)) continue;
        const uploaded = await admin.storage.from("portal-theme-imports").upload(`${id}/preview/${image.hash}`, images.get(image.path)!, { contentType: "application/octet-stream", upsert: false });
        if (uploaded.error) throw new Error("Beeldpreview kon niet worden opgeslagen");
        uploadedHashes.add(image.hash);
      }
    }
    const { files: _files, ...summary } = analysis.kind === "draft" ? analysis : { ...analysis, files: undefined };
    const updated = await admin.from("portal_theme_import").update({ status: "analyzed", analysis_json: summary }).eq("id", id);
    if (updated.error) throw new Error("Import analysis could not be saved");
    return { id, analysis: summary };
  } catch (error) {
    await admin.from("portal_theme_import").update({ status: "rejected", analysis_json: { error: error instanceof Error ? error.message.slice(0, 500) : "Import failed" } }).eq("id", id);
    throw error;
  }
}

export async function saveThemeDraft(actorId: string, document: ThemeReleaseDocument, expectedRevision: number, provenance: Record<string, unknown>, findings: ThemeImportAnalysis["findings"]) {
  const { manifest, presentation } = validateThemeReleaseDocument(document.manifest, document.presentation);
  const assets = await validateThemeDeliverySet(presentation, readThemeDelivery);
  const result = await createAdminClient().rpc("save_portal_theme_draft", { p_actor: actorId, p_theme: manifest.theme.key, p_release: manifest.theme.release, p_expected_revision: expectedRevision, p_manifest: manifest, p_presentation: presentation, p_provenance: provenance, p_findings: findings, p_assets: assets });
  if (result.error) throw new Error(result.error.code === "40001" ? "Het concept is inmiddels gewijzigd. Laad de actuele versie; jouw wijzigingen zijn niet overschreven." : "Het concept kon niet worden opgeslagen.");
  return result.data as { revision: number; digest: string };
}

export async function createThemeDraftFromImport(actorId: string, importId: string) {
  const admin = createAdminClient();
  const result = await admin.from("portal_theme_import").select("id, status, source_hash, source_object_key, analysis_json").eq("id", importId).single();
  if (result.error || !result.data || !["analyzed", "draft"].includes(result.data.status)) throw new Error("Geen afgeronde importanalyse gevonden");
  const analysis = result.data.analysis_json as Omit<ThemeImportAnalysis, "files">;
  if (analysis.kind !== "draft") throw new Error("Koppel de losse beelden eerst expliciet");
  const document = validateThemeReleaseDocument(analysis.manifest, analysis.presentation);
  const existing = await getManagedThemeRelease(document.manifest.theme.key, document.manifest.theme.release);
  // Response loss after commit is recoverable without a duplicate concept or release overwrite.
  if (existing?.provenance.importId === importId && existing.provenance.sourceHash === result.data.source_hash) {
    await admin.from("portal_theme_import").update({ status: "draft" }).eq("id", importId);
    return { revision: existing.revision, digest: existing.digest, key: document.manifest.theme.key, release: document.manifest.theme.release };
  }
  const saved = await saveThemeDraft(actorId, document, 0, { importId, sourceHash: result.data.source_hash, sourceObjectKey: result.data.source_object_key, dialect: analysis.dialect }, analysis.findings);
  const updated = await admin.from("portal_theme_import").update({ status: "draft" }).eq("id", importId);
  if (updated.error) throw new Error("Het concept is opgeslagen, maar de importstatus kon niet worden bijgewerkt. Open dezelfde import opnieuw.");
  return { ...saved, key: document.manifest.theme.key, release: document.manifest.theme.release };
}

export type StoredThemeImportAnalysis = Omit<ThemeImportAnalysis, "files"> | GuidedThemeAnalysis;
/** Platform manager guard must run first; includes private source inventory, never a portal DTO. */
export async function getAnalyzedThemeImport(id: string): Promise<{ id: string; analysis: StoredThemeImportAnalysis } | null> {
  if (!/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) return null;
  const result = await createAdminClient().from("portal_theme_import").select("id, status, analysis_json").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Importanalyse niet beschikbaar");
  if (!result.data || !["analyzed", "draft"].includes(result.data.status)) return null;
  const analysis = result.data.analysis_json as StoredThemeImportAnalysis;
  if (analysis.kind === "draft") validateThemeReleaseDocument(analysis.manifest, analysis.presentation);
  else if (analysis.kind !== "guided" || !Array.isArray(analysis.images)) throw new Error("Ongeldige opgeslagen importanalyse");
  return { id: result.data.id, analysis };
}

export async function saveGuidedThemeMapping(actorId: string, importId: string, mapping: unknown) {
  const admin = createAdminClient(), record = await admin.from("portal_theme_import").select("source_object_key, source_hash, status, analysis_json").eq("id", importId).single();
  if (record.error || record.data?.status !== "analyzed" || record.data.analysis_json.kind !== "guided") throw new Error("Deze import wacht niet op een beeldkoppeling");
  const raw = await admin.storage.from("portal-theme-imports").download(record.data.source_object_key);
  if (raw.error || !raw.data || raw.data.size > themeImportLimits.archive) throw new Error("Bronbestand niet beschikbaar");
  const bytes = Buffer.from(await raw.data.arrayBuffer());
  if (themeContentHash(bytes) !== record.data.source_hash) throw new Error("Bronbestand is gewijzigd");
  const analysis = await mapGuidedThemePackage(bytes, mapping);
  validateThemeReleaseDocument(analysis.manifest, analysis.presentation); await storeThemeDeliveries(analysis);
  const { files: _files, ...summary } = analysis;
  // Compare the entire analysis to avoid one mapping editor silently replacing another.
  const updated = await admin.from("portal_theme_import").update({ analysis_json: summary }).eq("id", importId).eq("status", "analyzed").eq("analysis_json", JSON.stringify(record.data.analysis_json)).select("id");
  if (updated.error || !updated.data?.length) throw new Error("De importkoppeling is inmiddels gewijzigd. Laad de actuele analyse opnieuw.");
  return { id: importId, analysis: summary };
}

export async function reviewThemeRelease(actorId: string, stored: StoredThemeRelease, checks: Record<string, boolean>) {
  await validateThemeDeliverySet(stored.presentation, readThemeDelivery);
  const result = await createAdminClient().rpc("review_portal_theme_release", { p_actor: actorId, p_theme: stored.manifest.theme.key, p_release: stored.manifest.theme.release, p_revision: stored.revision, p_digest: stored.digest, p_checks: checks });
  if (result.error) throw new Error("Review niet opgeslagen: controleer alle onderdelen en de actuele conceptversie.");
}

export async function publishThemeRelease(actorId: string, stored: StoredThemeRelease) {
  assertThemePublishable(stored.presentation);
  await validateThemeDeliverySet(stored.presentation, readThemeDelivery);
  const result = await createAdminClient().rpc("publish_portal_theme_release", { p_actor: actorId, p_theme: stored.manifest.theme.key, p_release: stored.manifest.theme.release, p_revision: stored.revision, p_digest: stored.digest });
  if (result.error) throw new Error("Publicatie geblokkeerd: de review ontbreekt of de inhoud is gewijzigd.");
}
