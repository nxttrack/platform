import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260728110000_tenant_site_page_cms.sql", import.meta.url),
  "utf8"
);
const cms2Migration = readFileSync(
  new URL("../../supabase/migrations/20260729150000_tenant_site_cms_2.sql", import.meta.url),
  "utf8"
);
const action = readFileSync(new URL("../../apps/web/lib/domain/site-page-actions.ts", import.meta.url), "utf8");
const publicSite = readFileSync(new URL("../../apps/web/lib/domain/public-site.ts", import.meta.url), "utf8");
const publicMedia = readFileSync(new URL("../../apps/web/app/api/files/tenant-media-asset/[id]/route.ts", import.meta.url), "utf8");
const agenda = readFileSync(new URL("../../apps/web/app/(tenant-admin)/admin/agenda/page.tsx", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("../../apps/web/app/(tenant-admin)/admin/inhaalmarkt/page.tsx", import.meta.url), "utf8");
const documentPage = readFileSync(new URL("../../apps/web/app/(tenant-admin)/admin/documenten/page.tsx", import.meta.url), "utf8");
const documentAction = readFileSync(new URL("../../apps/web/lib/domain/admin-operations-actions.ts", import.meta.url), "utf8");

test("website CMS is tenant scoped, structurally constrained and forced through RLS", () => {
  assert.match(migration, /create table public\.tenant_site_pages/);
  assert.match(migration, /tenant_id uuid not null references public\.tenants/);
  assert.match(migration, /constraint tenant_site_pages_scope_unique unique \(tenant_id, page_key\)/);
  assert.match(migration, /primary_cta_href !~ '\^\/\/'/);
  assert.match(migration, /alter table public\.tenant_site_pages enable row level security/);
  assert.match(migration, /alter table public\.tenant_site_pages force row level security/);
  assert.match(migration, /current_user_can_manage_tenant_domain\(tenant_id\)/);
  assert.doesNotMatch(migration, /\b(?:body_html|content_html|custom_script)\b/i);
});

test("website writes require tenant administration and public reads stay tenant filtered", () => {
  assert.match(action, /role === "tenant_owner" \|\| role === "tenant_admin"/);
  assert.match(action, /tenantId: context\.tenant\.id/);
  assert.match(action, /\.rpc\("save_tenant_site_draft"/);
  assert.match(action, /isSafeTenantSiteHref/);
  assert.match(publicSite, /\.from\("tenant_site_pages"\)[\s\S]+\.eq\("tenant_id", tenant\.id\)/);
});

test("CMS 2.0 versions, media and publishing are tenant-safe and recoverable", () => {
  for (const table of [
    "tenant_site_page_versions",
    "tenant_media_assets",
    "tenant_site_version_asset_links",
    "tenant_site_page_events"
  ]) {
    assert.match(cms2Migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(cms2Migration, /snapshot_json jsonb not null/);
  assert.match(cms2Migration, /status in \('draft', 'published', 'archived'\)/);
  assert.match(cms2Migration, /app_private\.publish_tenant_site_version/);
  assert.match(cms2Migration, /app_private\.save_tenant_site_draft/);
  assert.match(cms2Migration, /perform 1[\s\S]+for update/);
  assert.match(cms2Migration, /set status = 'archived'[\s\S]+status = 'draft'/);
  assert.match(cms2Migration, /grant execute on function public\.publish_tenant_site_version[\s\S]+to service_role/);
  assert.doesNotMatch(cms2Migration, /grant execute on function public\.publish_tenant_site_version\([^;]+to authenticated;/);
  assert.match(cms2Migration, /malware_scan_status not in \('clean', 'not_required'\)/);
  assert.match(cms2Migration, /consent_status not in \('not_required', 'granted'\)/);
  assert.match(cms2Migration, /set public_enabled = exists/);
  assert.doesNotMatch(cms2Migration, /revoke all on table storage\.objects from authenticated/);
});

test("public media requires a published link, valid consent and a clean scan", () => {
  assert.match(publicMedia, /asset\.public_enabled/);
  assert.match(publicMedia, /\["not_required", "granted"\]\.includes\(asset\.consent_status\)/);
  assert.match(publicMedia, /consent_expires_at/);
  assert.match(publicMedia, /downloadableScan\(asset\.malware_scan_status\)/);
  assert.match(publicSite, /normalizeTenantSiteSnapshot/);
  assert.match(publicSite, /\.from\("tenant_site_page_versions"\)/);
});

test("planbord is focused and the inhaalmarkt is a dedicated human-confirmed workflow", () => {
  assert.doesNotMatch(agenda, /What-if planning|Inhaalverzoeken<\/h2>|Instructor availability/);
  assert.match(marketplace, /title="Inhaalmarkt"/);
  assert.match(marketplace, /humanConfirmation: "confirmed"/);
  assert.match(marketplace, /Open inhaalverzoeken/);
  assert.equal(existsSync(new URL("../../apps/web/components/admin/planning-workbench.tsx", import.meta.url)), false);
});

test("document upload cannot bypass malware scanning with a metadata-only save", () => {
  assert.match(documentPage, /name="file" required type="file"/);
  assert.match(documentPage, /Upload geweigerd: de malwarecontrole is niet bereikbaar of het bestand is niet schoon/);
  assert.match(documentAction, /if \(!file\) \{\s*redirect\("\/admin\/documenten\?error=file_required"\)/);
  assert.match(documentAction, /malware_scan_status: "pending"/);
  assert.doesNotMatch(documentAction, /malware_scan_status: file \? "pending" : "not_required"/);
});
