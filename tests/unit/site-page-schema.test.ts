import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260728110000_tenant_site_page_cms.sql", import.meta.url),
  "utf8"
);
const action = readFileSync(new URL("../../apps/web/lib/domain/site-page-actions.ts", import.meta.url), "utf8");
const publicSite = readFileSync(new URL("../../apps/web/lib/domain/public-site.ts", import.meta.url), "utf8");
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
  assert.match(action, /\.upsert\(\{[\s\S]+tenant_id: tenant\.id/);
  assert.match(action, /isSafeTenantSiteHref/);
  assert.match(publicSite, /\.from\("tenant_site_pages"\)[\s\S]+\.eq\("tenant_id", tenant\.id\)/);
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
