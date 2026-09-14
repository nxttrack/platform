import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import pg from "pg";
import { analyzeThemePackage } from "../../apps/web/lib/theme/theme-package-adapters";
import { validateThemeDeliverySet } from "../../apps/web/lib/theme/theme-release-validation";
import { testWorldBindingContracts } from "./theme-world-binding-contract";
import { testDefaultSourceProvenance } from "./theme-default-source-contract";

const databaseUrl = process.env.PORTAL_THEME_TEST_DATABASE_URL;
const apiUrl = process.env.PORTAL_THEME_TEST_API_URL;
const serviceKey = process.env.PORTAL_THEME_TEST_SERVICE_KEY;
const anonKey = process.env.PORTAL_THEME_TEST_ANON_KEY;
for (const value of [databaseUrl, apiUrl]) if (!value || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) throw new Error("Explicit isolated loopback database/API required for theme integration tests");
if (!serviceKey || !anonKey) throw new Error("Local test API credentials required");

test("real storage and canonical SQL commands preserve optimistic review, publication, access and restart contracts", async () => {
  const manager = randomUUID(), outsider = randomUUID(), version = `99.0.${randomInt(1, 1_000_000_000)}`;
  const bytes = readFileSync(new URL("../fixtures/portal-v42/NXTTRACK-De-Parelroute-Wereld-1-Referentiepakket-1.0.0.zip", import.meta.url));
  const imported = await analyzeThemePackage(bytes, "reference.zip", { runtimeRelease: version });
  if (imported.kind !== "draft") throw new Error("Expected real reference package");
  const assets = await validateThemeDeliverySet(imported.presentation, async (key) => imported.files.get(key)!);
  const key = imported.presentation.themeId;
  for (const [objectKey, body] of imported.files) {
    const meta = assets.find((asset) => asset.objectKey === objectKey)!;
    const response = await fetch(`${apiUrl}/storage/v1/object/portal-theme-assets/${objectKey}`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": meta.mime, "x-upsert": "false" }, body: new Uint8Array(body) });
    assert.equal(response.ok, true, `Local storage upload failed: ${await response.text()}`);
  }
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  const saveSql = "select public.save_portal_theme_draft($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb) as result";
  const args = (revision: number, actor = manager, manifest = imported.manifest) => [actor, key, version, revision, JSON.stringify(manifest), JSON.stringify(imported.presentation), JSON.stringify({ test: "fictional local reference package", sourceHash: imported.sourceHash }), JSON.stringify(imported.findings), JSON.stringify(assets)];
  try {
    await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}'),($3,'authenticated','authenticated',$4,'{}','{}')", [manager, `${manager}@example.test`, outsider, `${outsider}@example.test`]);
    await client.query("insert into public.platform_memberships(user_id,role,status) values($1,'platform_admin','active')", [manager]);
    await client.query("set role service_role");
    await assert.rejects(client.query(saveSql, args(0, outsider)), /platform_theme_manager_required/);
    const first = (await client.query(saveSql, args(0))).rows[0].result;
    assert.equal(first.revision, 1); assert.match(first.digest, /^[a-f0-9]{64}$/);
    await assert.rejects(client.query(saveSql, args(0)), /theme_revision_conflict/);
    await assert.rejects(client.query("select public.publish_portal_theme_release($1,$2,$3,$4,$5)", [manager, key, version, 1, first.digest]), /current_review/);
    await assert.rejects(client.query("select public.review_portal_theme_release($1,$2,$3,$4,$5,$6::jsonb)", [manager, key, version, 1, first.digest, JSON.stringify({ desktop: true })]), /review_incomplete/);
    const checks = JSON.stringify({ desktop: true, mobile: true, content: true, warnings: true });
    await client.query("select public.review_portal_theme_release($1,$2,$3,$4,$5,$6::jsonb)", [manager, key, version, 1, first.digest, checks]);
    const edit = structuredClone(imported.manifest); edit.theme.description += " · edited";
    const second = (await client.query(saveSql, args(1, manager, edit))).rows[0].result;
    assert.notEqual(second.digest, first.digest);
    const reset = (await client.query("select status, review_digest from public.portal_theme_release where theme_key=$1 and release=$2", [key, version])).rows[0];
    assert.deepEqual(reset, { status: "draft", review_digest: null });
    await assert.rejects(client.query("select public.review_portal_theme_release($1,$2,$3,$4,$5,$6::jsonb)", [manager, key, version, 1, first.digest, checks]), /review_stale/);

    // Two concurrent editors race the same revision through the actual SQL command.
    const other = new pg.Client({ connectionString: databaseUrl }); await other.connect();
    let current: { revision: number; digest: string };
    try {
      await other.query("set role service_role");
      const races = await Promise.allSettled([client.query(saveSql, args(2, manager, edit)), other.query(saveSql, args(2, manager, edit))]);
      assert.equal(races.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(races.filter((r) => r.status === "rejected" && /theme_revision_conflict/.test(String(r.reason))).length, 1);
      const won = races.find((r) => r.status === "fulfilled"); if (won?.status !== "fulfilled") throw new Error("No successful editor");
      current = won.value.rows[0].result;
    } finally { await other.end(); }
    const before = (await client.query("select count(*) from public.tenant_portal_theme_assignment")).rows[0].count;
    await client.query("select public.review_portal_theme_release($1,$2,$3,$4,$5,$6::jsonb)", [manager, key, version, current.revision, current.digest, checks]);
    await client.query("select public.publish_portal_theme_release($1,$2,$3,$4,$5)", [manager, key, version, current.revision, current.digest]);
    assert.equal((await client.query("select count(*) from public.tenant_portal_theme_assignment")).rows[0].count, before);
    await assert.rejects(client.query(saveSql, args(current.revision)), /immutable_theme_release/);
    await assert.rejects(client.query("update public.portal_theme_release set manifest_json='{}' where theme_key=$1 and release=$2", [key, version]), /immutable/);
    await assert.rejects(client.query("delete from public.portal_theme_asset where theme_key=$1 and theme_release=$2", [key, version]), /immutable/);
    await assert.rejects(client.query("insert into public.portal_theme_asset select theme_key,theme_release,'rich.injected',asset_path,content_hash,mime_type,intrinsic_width,intrinsic_height,is_decorative,created_at,storage_object_key,byte_size from public.portal_theme_asset where theme_key=$1 and theme_release=$2 limit 1", [key, version]), /immutable/);
    await assert.rejects(client.query("update public.portal_theme_revision set document_json='{}' where theme_key=$1 and theme_release=$2", [key, version]), /permission denied|immutable/);
    await testWorldBindingContracts(client, databaseUrl!, manager, outsider, key, version, Object.keys(imported.presentation.worlds)[0]);
    await testDefaultSourceProvenance(client, manager, imported, assets, imported.files, apiUrl!, serviceKey!);

    // New application/DB connection reads the persisted release and every exact raster again.
    const restarted = new pg.Client({ connectionString: databaseUrl }); await restarted.connect();
    try {
      const persisted = (await restarted.query("select status, content_hash, import_revision from public.portal_theme_release where theme_key=$1 and release=$2", [key, version])).rows[0];
      assert.deepEqual(persisted, { status: "published", content_hash: current.digest, import_revision: 3 });
      assert.equal(Number((await restarted.query("select count(*) from public.portal_theme_revision where theme_key=$1 and theme_release=$2", [key, version])).rows[0].count), 3);
    } finally { await restarted.end(); }
    for (const [objectKey, expected] of imported.files) {
      const response = await fetch(`${apiUrl}/storage/v1/object/portal-theme-assets/${objectKey}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      assert.equal(response.ok, true); assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      const denied = await fetch(`${apiUrl}/storage/v1/object/authenticated/portal-theme-assets/${objectKey}`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
      assert.equal(denied.ok, false, "Anonymous storage read must stay denied even after publication");
    }
    const deniedRpc = await fetch(`${apiUrl}/rest/v1/rpc/publish_portal_theme_release`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_actor: manager, p_theme: key, p_release: version, p_revision: 3, p_digest: current.digest }) });
    assert.equal(deniedRpc.ok, false, "Anonymous caller must not impersonate a platform actor");
    await client.query("reset role"); await client.query("set role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
    assert.equal((await client.query("select * from public.portal_theme_revision where theme_key=$1 and theme_release=$2", [key, version])).rows.length, 0);
    await assert.rejects(client.query(saveSql, args(3)), /permission denied/);
    console.log("PASS real storage, authorized SQL, concurrent revision conflict, review invalidation, immutable publication, restart reads, anonymous and authenticated denial; assignment count unchanged");
  } finally { await client.end(); }
});
