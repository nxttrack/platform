import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { analyzeThemePackage } from "../../apps/web/lib/theme/theme-package-adapters";
import { validateThemeDeliverySet } from "../../apps/web/lib/theme/theme-release-validation";
import { parseJourneyPresentation } from "../../apps/web/lib/theme/portal-journey-presentation";

async function main() {
// The reused seed validates every endpoint as explicit loopback before writing.
execFileSync(process.execPath, [new URL("./seed-portal-assessment-browser.mjs", import.meta.url).pathname], { stdio: "inherit", env: process.env });
const file = process.env.PORTAL_MESSAGE_BROWSER_FIXTURE!;
const fixture = JSON.parse(await readFile(file, "utf8"));
const api = process.env.PORTAL_MESSAGE_TEST_API_URL!, service = process.env.PORTAL_MESSAGE_TEST_SERVICE_KEY!;
const release = `99.1.${randomInt(1, 1_000_000_000)}`, manager = randomUUID();
const bytes = await readFile(new URL("../../tests/fixtures/portal-v42/NXTTRACK-De-Parelroute-Wereld-1-Referentiepakket-1.0.0.zip", import.meta.url));
const source = await analyzeThemePackage(bytes, "reference.zip", { runtimeRelease: release });
if (source.kind !== "draft") throw new Error("Real reference package must validate");
const assetId = Object.keys(source.presentation.assets)[0];
const presentation = parseJourneyPresentation({ ...source.presentation, collectibles: { routeBinding: "none", pool: [
  { id: "fictional-shell", title: "Fictieve schelp", assetId }, { id: "fictional-stone", title: "Fictieve steen", assetId }
] } });
const assets = await validateThemeDeliverySet(presentation, async key => source.files.get(key)!);
for (const [objectKey, body] of source.files) {
  const meta = assets.find(asset => asset.objectKey === objectKey)!;
  const response = await fetch(`${api}/storage/v1/object/portal-theme-assets/${objectKey}`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": meta.mime, "x-upsert": "false" }, body: new Uint8Array(body) });
  assert.equal(response.ok, true, `Local fixture asset upload failed (${response.status})`);
}
const client = new pg.Client({ connectionString: process.env.PORTAL_MESSAGE_TEST_DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}')", [manager, `${manager}@example.test`]);
  await client.query("insert into public.platform_memberships(user_id,role,status) values($1,'platform_admin','active')", [manager]);
  await client.query("set local role service_role");
  const draft = (await client.query("select public.save_portal_theme_draft($1,$2,$3,0,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) as value", [manager, presentation.themeId, release, JSON.stringify(source.manifest), JSON.stringify(presentation), JSON.stringify({ test: "Explicit fictional cosmetic browser fixture; not original Default assets", sourceHash: source.sourceHash }), JSON.stringify(source.findings), JSON.stringify(assets)])).rows[0].value;
  await client.query("select public.review_portal_theme_release($1,$2,$3,$4,$5,$6::jsonb)", [manager, presentation.themeId, release, draft.revision, draft.digest, JSON.stringify({ desktop: true, mobile: true, content: true, warnings: true })]);
  await client.query("select public.publish_portal_theme_release($1,$2,$3,$4,$5)", [manager, presentation.themeId, release, draft.revision, draft.digest]);
  await client.query("select public.set_portal_theme_management_mode($1,$2,'platform','Explicit fictional collection browser fixture')", [manager,fixture.tenant]);
  const world = Object.keys(presentation.worlds)[0];
  fixture.binding = (await client.query("select public.bind_portal_theme_world($1,$2,$3,$4,$5,$6,$7,$8,'{}',null,'Fictional collection browser world',null) as id", [manager,fixture.tenant,fixture.program,fixture.version,fixture.stage,presentation.themeId,release,world])).rows[0].id;
  fixture.theme = presentation.themeId; fixture.release = release;
  fixture.orientationPaths = Object.fromEntries((["portrait", "landscape"] as const).map(orientation => [orientation,
    Object.values(presentation.worlds[world][orientation].layers).flatMap(id => id ? [`/portal-themes/${presentation.assets[id].objectKey}`] : [])
  ]));
  await client.query("commit");
  await writeFile(file, JSON.stringify(fixture), { mode: 0o600 });
  console.log("Fictional cosmetic pool imported, reviewed, published and bound through existing commands in the owned local fixture; no provider action.");
} catch(error) { await client.query("rollback"); throw error; }
finally { await client.end(); }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
