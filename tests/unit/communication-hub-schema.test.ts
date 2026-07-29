import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260727120000_communication_hub.sql", import.meta.url),
  "utf8"
);

const hubTables = [
  "communication_templates",
  "message_threads",
  "message_thread_participants",
  "messages",
  "newsletter_campaigns",
  "newsletter_recipients",
  "communication_deliveries"
];

test("communication hub reuses existing notification and announcement records", () => {
  assert.doesNotMatch(migration, /create table public\.notifications\b/);
  assert.doesNotMatch(migration, /create table public\.tenant_notifications\b/);
  assert.doesNotMatch(migration, /create table public\.tenant_messages\b/);
  assert.match(migration, /alter table public\.tenant_notifications/);
  assert.match(migration, /alter table public\.tenant_messages/);
  assert.match(migration, /'message_received'/);
  assert.match(migration, /message_kind in \('announcement', 'news_update', 'service_notice'\)/);
});

test("all new communication tables are tenant scoped and force RLS", () => {
  for (const table of hubTables) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant select on public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
});

test("parent access cannot expose internal notes", () => {
  assert.match(migration, /message_thread_participants_parent_internal_check[\s\S]+role <> 'parent' or not can_view_internal/);
  assert.match(migration, /current_user_can_view_message_thread\([\s\S]+not include_internal[\s\S]+thread\.guardian_user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /participant\.role = 'instructor'[\s\S]+participant\.can_view_internal/);
  assert.match(migration, /visibility = 'public_to_thread'[\s\S]+current_user_can_view_message_thread\(tenant_id, thread_id, false\)/);
  assert.match(migration, /visibility in \('internal_note', 'staff_only'\)[\s\S]+current_user_can_view_message_thread\(tenant_id, thread_id, true\)/);
});

test("thread RLS requires an active tenant membership for direct assignees", () => {
  assert.match(migration, /join public\.tenant_memberships membership/);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /membership\.status = 'active'/);
  assert.match(migration, /membership\.role = 'parent'/);
  assert.match(migration, /membership\.role = 'instructor'/);
});

test("instructor parent communication defaults are assigned-only and read-only", () => {
  assert.match(migration, /instructors_can_reply_to_parents boolean not null default false/);
  assert.match(migration, /instructors_can_view_parent_threads text not null default 'assigned_only'/);
  assert.match(migration, /instructors_can_view_parent_threads in \('disabled', 'assigned_only', 'own_groups'\)/);
});

test("newsletters require explicit consent and human confirmation", () => {
  assert.match(migration, /newsletter_email_enabled boolean not null default false/);
  assert.match(migration, /marketing_consent_status = 'granted'/);
  assert.match(migration, /marketing_unsubscribed_at is null/);
  assert.match(migration, /status not in \('scheduled', 'sending', 'sent'\)[\s\S]+human_confirmed_at is not null[\s\S]+confirmed_by_user_id is not null/);
  assert.match(migration, /unsubscribe_token_hash ~ '\^\[a-f0-9\]\{64\}\$'/);
});

test("external delivery is evidence-only and cannot be marked complete without confirmation", () => {
  assert.match(migration, /channel in \('in_app', 'email', 'newsletter', 'whatsapp_urgent', 'sms_fallback'\)/);
  assert.match(migration, /provider in \('not_configured', 'in_app', 'sendgrid_api', 'smtp', 'manual'\)/);
  assert.match(migration, /channel = 'in_app'[\s\S]+or human_confirmed_at is not null/);
  assert.match(migration, /email_delivery_attempt_id uuid references public\.email_delivery_attempts/);
});

test("journey test data has explicit lineage and cannot masquerade as real communication", () => {
  for (const table of ["message_threads", "messages", "newsletter_campaigns", "newsletter_recipients", "communication_deliveries"]) {
    assert.match(migration, new RegExp(`${table}_test_marker_check`));
  }
  assert.match(migration, /source = 'journey_simulation_bot'[\s\S]+is_test[\s\S]+journey_run_id is not null/);
  assert.match(migration, /source <> 'journey_simulation_bot'[\s\S]+not is_test[\s\S]+journey_run_id is null/);
});
