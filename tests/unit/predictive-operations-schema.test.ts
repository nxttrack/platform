import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260726223000_predictive_operations_placement.sql", import.meta.url),
  "utf8"
);

test("predictive tables are tenant scoped, RLS protected and service writable", () => {
  for (const table of ["wait_time_band_snapshots", "next_best_actions", "placement_suggestions"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`grant all on public\\.${table} to service_role`));
  }
  assert.match(migration, /current_user_can_manage_tenant_domain\(tenant_id\)/);
});

test("Journey Bot purge removes derived suggestions and actions before source records", () => {
  assert.match(
    migration,
    /delete from public\.placement_suggestions\s+where journey_run_id = target_run_id\s+and is_test\s+and source = 'journey_simulation_bot'/
  );
  assert.match(
    migration,
    /delete from public\.next_best_actions\s+where journey_run_id = target_run_id\s+and is_test\s+and source = 'journey_simulation_bot'/
  );
  assert.match(migration, /'placement_suggestions', deleted_suggestion_count/);
  assert.match(migration, /'next_best_actions', deleted_action_count/);
});

test("state constraints keep proposals auditable and explanation payloads structured", () => {
  assert.match(migration, /next_best_actions_status_check check \(status in \('open', 'dismissed', 'completed', 'auto_resolved'\)\)/);
  assert.match(migration, /placement_suggestions_status_check check \(status in \('suggested', 'offered', 'accepted', 'rejected', 'expired'\)\)/);
  assert.match(migration, /jsonb_typeof\(reasons_json\) = 'array'/);
  assert.match(migration, /jsonb_typeof\(blockers_json\) = 'array'/);
  assert.match(migration, /unique nulls not distinct/);
});
