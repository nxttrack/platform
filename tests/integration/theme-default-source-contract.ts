import assert from "node:assert/strict";
import type pg from "pg";
import { defaultJourneyPalette, defaultJourneyWorlds } from "../../apps/web/lib/theme/default-journey-profile";
import { validateThemeReleaseDocument, type ThemeDeliveryRow, type ThemeReleaseDocument } from "../../apps/web/lib/theme/theme-release-validation";

/** A deliberately forged original-source claim must fail even after a digest-bound review.
 * Fictional local data only; the draft, review and audit rows are rolled back together. */
export async function testDefaultSourceProvenance(client: pg.Client, actor: string, source: ThemeReleaseDocument, assets: ThemeDeliveryRow[], files: ReadonlyMap<string, Buffer>, apiUrl: string, serviceKey: string) {
  const manifest = structuredClone(source.manifest), presentation = structuredClone(source.presentation);
  const key = "nxttrack-default", version = manifest.theme.release;
  manifest.theme.key = key; manifest.theme.displayName = "Fictional source-verification rejection fixture";
  Object.assign(manifest.tokens.color, { primary: defaultJourneyPalette.primary, secondary: defaultJourneyPalette.secondary, reward: defaultJourneyPalette.accent, danger: defaultJourneyPalette.attention, text: defaultJourneyPalette.ink });
  const rekey = (value: string) => value.replace(`${source.presentation.themeId}/`, `${key}/`);
  for (const asset of Object.values(manifest.assets)) if (asset) asset.path = rekey(asset.path);
  const baseWorld = Object.values(presentation.worlds)[0];
  const forged = { ...presentation, themeId: key, role: "standard", sourcePackageVersion: "1.1.0", guide: { mode: "none" }, pearlArtwork: { mode: "none", byCriterionIdentity: {} },
    worlds: Object.fromEntries(defaultJourneyWorlds.map((world) => [world.id, { ...baseWorld, id: world.id,
      landscape: { ...baseWorld.landscape, anchorSource: { ...baseWorld.landscape.anchorSource, status: "original" } },
      portrait: { ...baseWorld.portrait, anchorSource: { ...baseWorld.portrait.anchorSource, status: "original" } }
    }])), assets: Object.fromEntries(Object.entries(presentation.assets).map(([id, asset]) => [id, { ...asset, objectKey: rekey(asset.objectKey) }])) };
  validateThemeReleaseDocument(manifest, forged); // Shape alone cannot establish original provenance.
  const deliveries = assets.map((asset) => ({ ...asset, objectKey: rekey(asset.objectKey) })), uploaded: string[] = [];
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  try {
    for (const [path, bytes] of files) {
      const target = rekey(path), meta = assets.find((asset) => asset.objectKey === path)!;
      const response = await fetch(`${apiUrl}/storage/v1/object/portal-theme-assets/${target}`, { method: "POST", headers: { ...headers, "Content-Type": meta.mime }, body: new Uint8Array(bytes) });
      assert.equal(response.ok, true, "Local verification fixture upload failed"); uploaded.push(target);
    }
    await client.query("begin");
    try {
      const saved = (await client.query("select public.save_portal_theme_draft($1,$2,$3,0,$4::jsonb,$5::jsonb,$6::jsonb,'[]'::jsonb,$7::jsonb) as result", [actor, key, version, JSON.stringify(manifest), JSON.stringify(forged), JSON.stringify({ dialect: "package-1.0", purpose: "intentional false source claim; local rejection test" }), JSON.stringify(deliveries)])).rows[0].result;
      await client.query("select public.review_portal_theme_release($1,$2,$3,1,$4,$5::jsonb)", [actor, key, version, saved.digest, JSON.stringify({ desktop: true, mobile: true, content: true, warnings: true })]);
      await client.query("savepoint publication_attempt");
      await assert.rejects(client.query("select public.publish_portal_theme_release($1,$2,$3,1,$4)", [actor, key, version, saved.digest]), /original_default_source_required/);
      await client.query("rollback to savepoint publication_attempt");
      assert.equal((await client.query("select status from public.portal_theme_release where theme_key=$1 and release=$2", [key, version])).rows[0].status, "review");
      console.log("PASS Default publication rejects manufactured original fields without verified server provenance; no Default release published");
    } finally { await client.query("rollback"); }
  } finally {
    if (uploaded.length) {
      const removed = await fetch(`${apiUrl}/storage/v1/object/portal-theme-assets`, { method: "DELETE", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: uploaded }) });
      assert.equal(removed.ok, true, "Local temporary verification images could not be cleaned up");
    }
  }
}
