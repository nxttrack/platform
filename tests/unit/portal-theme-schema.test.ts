import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { portalThemeCatalog } from "../../apps/web/lib/theme/portal-theme-registry";

const root = path.resolve(import.meta.dirname, "../..");
const requireFromWeb = createRequire(path.join(root, "apps/web/package.json"));
const sharp = requireFromWeb("sharp") as (input: string) => { metadata(): Promise<{ width?: number; height?: number }> };
const migrationPath = path.join(root, "supabase/migrations/20260801120000_parent_portal_theme_engine_v2_1.sql");
const v3MigrationPath = path.join(root, "supabase/migrations/20260803190000_parent_portal_six_theme_pack_v3.sql");
const oceanMigrationPath = path.join(root, "supabase/migrations/20260811130000_ocean_quest_seventh_theme.sql");
const controlActionsPath = path.join(root, "apps/web/lib/domain/portal-theme-control-actions.ts");

test("themamigratie bevat assignment, planning, audit, RLS en server-only assessmentwrites", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const table of [
    "portal_theme",
    "portal_theme_release",
    "portal_theme_asset",
    "portal_badge_family_release",
    "tenant_portal_theme_assignment",
    "tenant_portal_theme_schedule",
    "portal_theme_audit_event"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.match(sql, /where deactivated_at is null/);
  assert.match(sql, /revoke insert, update on public\.participant_progress_scores from authenticated/);
  assert.match(sql, /when 1 then 1 when 2 then 3 when 3 then 5/);
  assert.match(sql, /source_scale_version = 'three_point_legacy'/);
  assert.match(sql, /for update skip locked/);
});

test("geselecteerde runtime-assets bestaan, zijn gehasht en blijven binnen netwerkbudget", async () => {
  for (const theme of portalThemeCatalog) {
    for (const [slot, asset] of Object.entries(theme.assets)) {
      if (!asset) continue;
      const bytes = await readFile(path.join(root, "apps/web/public", asset.path));
      const info = await stat(path.join(root, "apps/web/public", asset.path));
      const metadata = await sharp(path.join(root, "apps/web/public", asset.path)).metadata();
      assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.contentHash, `${theme.theme.key}:${slot}`);
      assert.equal(metadata.width, asset.width, `${theme.theme.key}:${slot} width`);
      assert.equal(metadata.height, asset.height, `${theme.theme.key}:${slot} height`);
      const budget = theme.theme.key === "ocean-quest" ? 2_800_000 : slot.startsWith("mascot.") ? 800_000 : 2_700_000;
      assert.ok(info.size <= budget, `${theme.theme.key}:${slot} overschrijdt budget`);
    }
  }
});

test("Ocean Quest publiceert de vier definitieve bronassets byte-voor-byte", async () => {
  const sql = await readFile(oceanMigrationPath, "utf8");
  const expected = {
    "journey-desktop.png": "c8f4ca9f64608dffb2579d5494ff1cc811459e238b0b55727eda77296e64de7b",
    "journey-mobile.png": "fcfd746bb3b186d3e6a29702aa1eee020347f1b0491761eb14a8a79674fb1615",
    "mascot.png": "b84d87656b55646bc8bee3697b1b72093846d89e06f87055ca051a49f3a6dde0",
    "journey-completed.png": "8183dc2282b61b234b103095774d813171b63d5f9b1207ed4f18d95ef7d619ca"
  } as const;
  for (const [fileName, hash] of Object.entries(expected)) {
    const bytes = await readFile(path.join(root, "apps/web/public/portal-themes/ocean-quest", fileName));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
    assert.match(sql, new RegExp(hash));
  }
  assert.match(sql, /'ocean-quest',\s*'3\.0\.0',\s*'published'/);
  assert.match(sql, /"childContract":"child-portal\/1\.0"/);
});

test("v3-migratie publiceert zes immutable releases en een fail-closed licentiegate", async () => {
  const sql = await readFile(v3MigrationPath, "utf8");
  for (const key of [
    "nxttrack-default",
    "dolphin-bay",
    "turtle-trails",
    "polar-splash",
    "coastal-explorer",
    "nationaal-zwem-abc"
  ]) {
    assert.match(sql, new RegExp(`'${key}', '3\\.0\\.0'`));
  }
  assert.match(sql, /create table public\.tenant_portal_theme_license/);
  assert.match(sql, /create table public\.tenant_portal_theme_availability/);
  assert.match(sql, /create function app_private\.select_available_tenant_portal_theme/);
  assert.match(sql, /create function app_private\.set_tenant_portal_theme_availability/);
  assert.match(sql, /create function app_private\.set_tenant_portal_theme_license/);
  assert.match(sql, /perform 1 from public\.tenants where id = target_tenant_id for update/);
  assert.match(sql, /release\.portal_contract = 'parent-portal\/1\.2'/);
  assert.match(sql, /release\.manifest_schema_version = 3/);
  assert.match(sql, /activation_source in \('platform', 'tenant_admin', 'migration'\)/);
  assert.match(sql, /Only a published six-theme v3 release can be activated/);
  assert.match(sql, /status = 'verified'/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /Published portal theme releases are immutable/);
  assert.match(sql, /Assets of published portal theme releases are immutable/);
});

test("platformbeheer wijzigt beschikbaarheid en licenties uitsluitend via transactionele RPCs", async () => {
  const actions = await readFile(controlActionsPath, "utf8");
  assert.match(actions, /\.rpc\("set_tenant_portal_theme_availability"/);
  assert.match(actions, /\.rpc\("set_tenant_portal_theme_license"/);
  assert.doesNotMatch(actions, /\.from\("tenant_portal_theme_availability"\)\s*\.upsert/);
  assert.doesNotMatch(actions, /\.from\("tenant_portal_theme_license"\)\s*\.upsert/);
});

test("v3-migratie bewaart afgeronde Journey-hoofdstukken immutable en tenantgeïsoleerd", async () => {
  const sql = await readFile(v3MigrationPath, "utf8");
  assert.match(sql, /create table public\.portal_journey_chapter_snapshots/);
  assert.match(sql, /theme_key text not null/);
  assert.match(sql, /theme_release text not null/);
  assert.match(sql, /artwork_id text not null/);
  assert.match(sql, /route_order_json jsonb not null/);
  assert.match(sql, /completion_data_json jsonb not null/);
  assert.match(sql, /badge_award_ids uuid\[\] not null/);
  assert.match(sql, /create policy portal_journey_chapter_snapshots_read/);
  assert.match(sql, /capture_portal_journey_chapter_snapshot/);
  assert.doesNotMatch(sql, /grant (?:update|delete|all) on public\.portal_journey_chapter_snapshots to authenticated/);
});
