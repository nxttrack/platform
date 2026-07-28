import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260727101000_privacy_safe_participant_media.sql", import.meta.url),
  "utf8"
);
const backupScript = readFileSync(new URL("../../scripts/storage/object-backup.mjs", import.meta.url), "utf8");
const erasureModule = readFileSync(new URL("../../apps/web/lib/storage/tenant-erasure.ts", import.meta.url), "utf8");
const cleanReadMigration = readFileSync(
  new URL("../../supabase/migrations/20260727101100_private_storage_clean_read_enforcement.sql", import.meta.url),
  "utf8"
);

test("media schema is tenant-scoped, private and service-written", () => {
  for (const table of ["participant_media", "media_consent_events", "media_access_logs"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
  assert.match(migration, /grant select on public\.participant_media to authenticated/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on public\.participant_media to authenticated/);
  assert.doesNotMatch(migration, /participant-media[\s\S]+storage\.objects[\s\S]+create policy/i);
  assert.match(migration, /'participant-media',[\s\S]+'participant-media',[\s\S]+false/);
});

test("safe MVP accepts only privacy-normalized still images and no Journey data", () => {
  assert.match(migration, /participant_media_type_check check \(media_type = 'image'\)/);
  assert.match(migration, /mime_type in \('image\/jpeg', 'image\/png'\)/);
  assert.match(migration, /participant_media_test_boundary_check check \([\s\S]+is_test = false[\s\S]+journey_run_id is null/);
  assert.match(migration, /size_bytes > 0 and size_bytes <= 20971520/);
});

test("consent is append-only, parent-authorized and immediately blocks publication", () => {
  assert.match(migration, /create table public\.media_consent_events/);
  assert.match(migration, /revoke insert, update, delete on public\.media_consents from authenticated/);
  assert.match(migration, /record_private_progress_media_consent/);
  assert.match(migration, /current_user_can_mutate_participant\(target_participant_id\)/);
  assert.match(migration, /guardian\.guardian_user_id = actor_id[\s\S]+guardian\.access_level in \('primary', 'secondary'\)/);
  assert.match(migration, /read_only_guardian\.access_level = 'view_only'/);
  assert.match(migration, /set status = 'consent_blocked'/);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on public\.media_consent_events to authenticated/);
});

test("publication requires a separate service-only human-confirmed transition", () => {
  assert.match(migration, /publish_private_progress_media/);
  assert.match(migration, /revoke all on function public\.publish_private_progress_media\(uuid, uuid\) from public/);
  assert.match(migration, /grant execute on function public\.publish_private_progress_media\(uuid, uuid\) to service_role/);
  assert.match(migration, /media_row\.status <> 'draft'/);
  assert.match(migration, /membership\.role in \('tenant_owner', 'tenant_admin'\)/);
  assert.match(migration, /participant_media_has_valid_consent/);
  assert.match(migration, /media_row\.malware_scan_status <> 'clean'/);
  assert.match(migration, /\{"confirmed":true\}/);
});

test("private media objects participate in backup and verified tenant erasure", () => {
  assert.match(backupScript, /tenant-documents,diploma-vault,participant-media,badge-studio-assets/);
  assert.match(backupScript, /participant-media/);
  assert.match(erasureModule, /PARTICIPANT_MEDIA_BUCKET/);
  assert.match(erasureModule, /tenantPrivateBuckets = \[TENANT_DOCUMENTS_BUCKET, DIPLOMA_VAULT_BUCKET, PARTICIPANT_MEDIA_BUCKET, BADGE_STUDIO_ASSETS_BUCKET\]/);
});

test("existing private buckets only expose exact, stored and clean objects", () => {
  for (const field of [
    "document.storage_bucket = storage.objects.bucket_id",
    "document.file_path = storage.objects.name",
    "document.storage_status = 'stored'",
    "document.malware_scan_status = 'clean'",
    "certificate.storage_bucket = storage.objects.bucket_id",
    "certificate.file_path = storage.objects.name",
    "certificate.storage_status = 'stored'",
    "certificate.malware_scan_status = 'clean'",
    "certificate.status = 'issued'"
  ]) {
    assert.ok(cleanReadMigration.includes(field), `missing clean-read boundary: ${field}`);
  }
  assert.match(cleanReadMigration, /drop policy if exists "Tenant staff can update tenant document files"/);
  assert.match(cleanReadMigration, /drop policy if exists "Tenant staff can update diploma vault files"/);
});
