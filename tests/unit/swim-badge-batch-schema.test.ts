import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const migrationPath = path.join(
  root,
  "supabase/migrations/20260802140000_versioned_badge_batches.sql"
);

test("badgepublicaties zijn immutable, versiegebonden en gebruiken gestructureerde regels", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.badge_definition_releases/);
  assert.match(sql, /release_number integer not null/);
  assert.match(sql, /rule_json jsonb not null/);
  assert.match(sql, /badge_definition_releases_immutable/);
  assert.match(sql, /badge_studio_assets_release_immutable/);
  assert.match(sql, /publish_active_badge_definition_release/);
  assert.doesNotMatch(sql, /raw.*(?:javascript|sql|html|css)/i);
});

test("batchtoekenning is idempotent en levert per ontvanger exact één verzamelnotificatie", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.badge_award_batches/);
  assert.match(sql, /badge_award_batches_idempotency_unique unique \(tenant_id, idempotency_key\)/);
  assert.match(sql, /badge_batch_notifications_recipient_unique unique \(tenant_id, batch_id, recipient_user_id\)/);
  assert.match(sql, /create or replace function public\.award_badge_batch/);
  assert.match(sql, /for target_recipient_id in[\s\S]+insert into public\.tenant_notifications[\s\S]+insert into public\.badge_batch_notifications/);
  assert.match(sql, /'badge\.batch_awarded'/);
});

test("surprisebadges en legacy gender zijn afgeschermd in database en viewmodel", async () => {
  const [sql, domainSource, pageSource] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(path.join(root, "apps/web/lib/domain/badge-system.ts"), "utf8"),
    readFile(path.join(root, "apps/web/app/(portaal)/portaal/ontwikkeling/badges/parent-badges-page.tsx"), "utf8")
  ]);
  assert.match(sql, /unknown_legacy/);
  assert.match(sql, /badge_catalog_surprise_safe_read/);
  assert.match(sql, /badge_definition_releases_read[\s\S]+not is_surprise[\s\S]+participant_badge_awards/);
  assert.match(domainSource, /an unearned surprise may not[\s\S]+safeCatalog[\s\S]+safeCollectionItems/);
  assert.match(pageSource, /grid grid-cols-2 gap-3 md:grid-cols-4/);
  assert.doesNotMatch(pageSource, /locked=\{surprise\}/);
});

test("legacy gender wordt pas herschreven nadat de oude checkconstraints zijn verwijderd", async () => {
  const sql = await readFile(migrationPath, "utf8");
  for (const [constraint, update] of [
    ["participants_gender_check", "update public.participants set gender = 'unknown_legacy'"],
    ["intake_submissions_participant_gender_check", "update public.intake_submissions set participant_gender = 'unknown_legacy'"],
    ["waitlist_entries_participant_gender_check", "update public.waitlist_entries set participant_gender = 'unknown_legacy'"],
    ["participant_badge_awards_gender_check", "update public.participant_badge_awards"]
  ] as const) {
    const droppedAt = sql.indexOf(`drop constraint ${constraint}`);
    const updatedAt = sql.indexOf(update);
    assert.ok(droppedAt >= 0, `${constraint} wordt verwijderd`);
    assert.ok(updatedAt > droppedAt, `${constraint} wordt voor de legacy-update verwijderd`);
  }
});
