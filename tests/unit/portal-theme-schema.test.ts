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
      assert.ok(info.size <= (slot.endsWith("mobile") ? 250_000 : 500_000), `${theme.theme.key}:${slot} overschrijdt budget`);
    }
  }
});
