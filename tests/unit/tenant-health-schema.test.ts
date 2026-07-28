import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../../supabase/migrations/20260729170000_platform_tenant_health.sql", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../apps/web/lib/domain/platform-health-actions.ts", import.meta.url), "utf8");
const heartbeatRoute = readFileSync(new URL("../../apps/web/app/api/internal/platform-health/heartbeat/route.ts", import.meta.url), "utf8");
const monitor = readFileSync(new URL("../../scripts/operations/monitor-operational-health.mjs", import.meta.url), "utf8");
const storageBackup = readFileSync(new URL("../../scripts/storage/object-backup.mjs", import.meta.url), "utf8");

test("platform health evidence is service-owned and incidents are platform-role scoped", () => {
  for (const table of ["platform_service_heartbeats", "platform_incidents"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
  }
  assert.doesNotMatch(migration, /grant (?:insert|update|all) on public\.platform_service_heartbeats to authenticated/);
  assert.match(migration, /current_user_has_platform_role\(array\['platform_owner', 'platform_admin', 'platform_support'\]\)/);
  assert.match(migration, /Platform administrators create incidents/);
  assert.match(migration, /status = 'resolved' and resolved_by_user_id is not null and resolved_at is not null/);
  assert.match(migration, /'platform_incident'/);
});

test("heartbeat ingestion and incident resolution require explicit authority", () => {
  assert.match(heartbeatRoute, /timingSafeEqual/);
  assert.match(heartbeatRoute, /allowedServices/);
  assert.match(heartbeatRoute, /CRON_SECRET/);
  assert.match(actions, /platform_owner" \|\| role === "platform_admin"/);
  assert.match(actions, /humanConfirmation"\) !== "resolve"/);
  assert.match(actions, /platform_admin_audit_events/);
});

test("monitoring and storage backup publish evidence and cover CMS media", () => {
  assert.match(monitor, /publishPlatformHeartbeat/);
  assert.match(monitor, /serviceKey: "runtime_monitor"/);
  assert.match(storageBackup, /tenant-media-assets/);
  assert.match(storageBackup, /platform_service_heartbeats/);
  assert.match(storageBackup, /service_key: "storage_backup"/);
});
