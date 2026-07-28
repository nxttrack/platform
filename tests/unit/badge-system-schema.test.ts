import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260727180000_premium_badges.sql", import.meta.url),
  "utf8"
);
const imageAssetMigration = readFileSync(
  new URL("../../supabase/migrations/20260728100000_badge_studio_image_assets.sql", import.meta.url),
  "utf8"
);
const badgeActions = readFileSync(
  new URL("../../apps/web/lib/domain/badge-system-actions.ts", import.meta.url),
  "utf8"
);
const backupScript = readFileSync(new URL("../../scripts/storage/object-backup.mjs", import.meta.url), "utf8");
const badgeAssetRoute = readFileSync(
  new URL("../../apps/web/app/api/files/badge-studio-asset/[id]/route.ts", import.meta.url),
  "utf8"
);

const tenantTables = [
  "tenant_badge_module_settings",
  "tenant_badge_settings",
  "tenant_custom_badges",
  "badge_message_suggestions",
  "badge_collections",
  "badge_share_template_sets",
  "badge_share_assets",
  "badge_analytics_events"
];

test("premium badgemodel bevat canon, instellingen, collecties, editor en analytics", () => {
  for (const table of [
    "platform_badge_settings",
    "badge_catalog_definitions",
    "badge_themes",
    ...tenantTables,
    "badge_collection_items",
    "badge_share_templates"
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
});

test("tenanttabellen zijn tenant-aware en platformtabellen hebben expliciete platformpolicies", () => {
  for (const table of tenantTables.filter((table) => !["badge_message_suggestions", "badge_collections", "badge_share_template_sets"].includes(table))) {
    assert.match(migration, new RegExp(`create table public\\.${table}[\\s\\S]+?tenant_id uuid`));
  }
  assert.match(migration, /Platform admins manage badge platform settings/);
  assert.match(migration, /Platform admins manage badge catalog/);
  assert.match(migration, /Tenant admins manage badge module settings/);
  assert.match(migration, /Tenant admins manage badge overrides/);
  assert.match(migration, /Tenant admins manage custom badges/);
});

test("awards zijn idempotent, approval-safe en kunnen niet hard worden verwijderd", () => {
  assert.match(migration, /participant_badge_awards_idempotency_idx/);
  assert.match(migration, /approval_status in \('pending', 'approved', 'rejected'\)/);
  assert.match(migration, /Earned badge records are immutable; revoke instead of delete/);
  assert.match(migration, /Assigned instructors propose badges/);
  assert.match(migration, /status = 'pending'[\s\S]+approval_status = 'pending'/);
  assert.doesNotMatch(migration, /create policy "Assigned instructors can manage badge awards"/);
});

test("gender is presentation-only met neutrale defaults en audience checks", () => {
  assert.match(migration, /participants_gender_check check \(gender in \('boy', 'girl', 'unknown'\)\)/);
  assert.match(migration, /participant_gender text not null default 'unknown'/);
  assert.match(migration, /audience in \('all', 'boys', 'girls'\)/);
  assert.match(migration, /Presentation-only badge copy selector/);
  assert.match(migration, /never usable for placement, progress, waitlist or payment decisions/);
});

test("canonieke seed bevat alle gevraagde kernmijlpalen en collecties", () => {
  for (const key of [
    "swim_start_created",
    "first_lesson_attended",
    "twenty_five_lessons_attended",
    "attendance_streak_10",
    "water_confidence_completed",
    "stage_4_completed",
    "afzwem_ready",
    "certificate_a_issued",
    "certificate_b_issued",
    "certificate_c_issued",
    "abc_complete",
    "first_makeup_attended",
    "manual_compliment",
    "manual_brave_diver",
    "manual_strong_arms",
    "collection_start",
    "collection_water_confidence",
    "collection_diplomas",
    "collection_specials"
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
});

test("shareformats zijn laag-gebaseerd, versieerbaar en privacyveilig voorbereid", () => {
  for (const format of ["square", "story", "landscape", "certificate"]) {
    assert.match(migration, new RegExp(`'${format}'`));
  }
  assert.match(migration, /layers_json jsonb not null/);
  assert.match(migration, /version integer not null default 1/);
  assert.match(migration, /share_first_name_only boolean not null default true/);
  assert.match(migration, /status in \('queued', 'generating', 'generated', 'failed'\)/);
});

test("studio-afbeeldingen zijn privé, gescand, begrensd en RLS-beveiligd", () => {
  assert.match(imageAssetMigration, /create table public\.badge_studio_assets/);
  assert.match(imageAssetMigration, /tenant_id uuid references public\.tenants/);
  assert.match(imageAssetMigration, /mime_type in \('image\/jpeg', 'image\/png'\)/);
  assert.match(imageAssetMigration, /size_bytes > 0 and size_bytes <= 5242880/);
  assert.match(imageAssetMigration, /alter table public\.badge_studio_assets enable row level security/);
  assert.match(imageAssetMigration, /alter table public\.badge_studio_assets force row level security/);
  assert.match(imageAssetMigration, /'badge-studio-assets',[\s\S]+'badge-studio-assets',[\s\S]+false/);
  assert.doesNotMatch(imageAssetMigration, /badge-studio-assets[\s\S]+storage\.objects[\s\S]+create policy/i);
  assert.match(badgeActions, /uploadBadgeStudioAssetFile/);
  assert.match(badgeActions, /platform_owner.*platform_admin/);
  assert.doesNotMatch(badgeActions, /createSignedUrl|signedUrl/);
  assert.match(badgeActions, /url: `\/api\/files\/badge-studio-asset\/\$\{assetId\}`/);
  assert.match(badgeAssetRoute, /requireApiAuthenticatedContext/);
  assert.match(badgeAssetRoute, /createPrivateFileResponse/);
  assert.match(badgeAssetRoute, /asset\.storage_bucket !== BADGE_STUDIO_ASSETS_BUCKET/);
  assert.doesNotMatch(badgeAssetRoute, /createSignedUrl|NextResponse\.redirect/);
});

test("studio-afbeeldingen vallen onder de objectbackup en herstelrehearsal", () => {
  assert.match(backupScript, /tenant-documents,diploma-vault,participant-media,badge-studio-assets/);
  assert.match(backupScript, /badge-studio-assets/);
});
