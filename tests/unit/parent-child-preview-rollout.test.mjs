import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  capturePreviewRollout,
  restorePreviewRollout,
  previewRolloutKeys,
  previewSnapshotKey
} from "../../scripts/staging/parent-child-preview-rollout.mjs";

const tenantId = "10000000-0000-4000-8000-000000000001";
const otherTenantId = "20000000-0000-4000-8000-000000000002";
const projectUrl = "https://fictional-staging.supabase.co";
const copy = (value) => structuredClone(value);
function row(featureKey, status = "enabled", tenant = tenantId) {
  return {
    tenant_id: tenant, feature_key: featureKey, status,
    readiness_json: { security_reviewed: true, visual_matrix_reviewed: true, retained: { reviewedBy: "original" } },
    config_json: { absoluteTtlMinutes: 135, retained: ["original", 9] },
    activated_at: "2026-09-10T12:00:00+00:00",
    activated_by_user_id: "30000000-0000-4000-8000-000000000003",
    created_at: "2026-08-11T12:00:00+00:00"
  };
}
function database(initialRows) {
  const db = {
    rows: copy(initialRows), writes: [], fault: null,
    rpc() { throw new Error("Tenant-wide session revocation must not be called by fixture cleanup"); },
    from(table) {
      assert.equal(table, "tenant_swim_rollouts");
      let operation = "select", selected = "*", payload, filters = [], single = false;
      const query = {
        select(columns) { selected = columns; return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        upsert(value, options) { assert.deepEqual(options, { onConflict: "tenant_id,feature_key" }); operation = "upsert"; payload = value; return query; },
        delete() { operation = "delete"; return query; },
        eq(key, value) { filters.push((r) => r[key] === value); return query; },
        in(key, values) { filters.push((r) => values.includes(r[key])); return query; },
        maybeSingle() { single = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            const matches = (r) => filters.every((filter) => filter(r));
            if (db.fault?.({ operation, payload, matched: db.rows.filter(matches) })) return { error: { message: "Injected storage failure" }, data: null };
            if (operation !== "select") db.writes.push({ operation, payload: copy(payload) });
            if (operation === "insert") db.rows.push(copy(payload));
            if (operation === "upsert") for (const value of payload) {
              const existing = db.rows.find((r) => r.tenant_id === value.tenant_id && r.feature_key === value.feature_key);
              if (existing) Object.assign(existing, copy(value)); else db.rows.push(copy(value));
            }
            if (operation === "delete") db.rows = db.rows.filter((r) => !matches(r));
            const result = db.rows.filter(matches).map((r) => selected === "*" ? copy(r) : Object.fromEntries(selected.split(",").map((key) => [key, copy(r[key])])));
            return { data: single ? result[0] ?? null : result, error: null };
          }).then(resolve, reject);
        }
      };
      return query;
    }
  };
  return db;
}
const currentFlags = (db) => db.rows.filter((r) => r.tenant_id === tenantId && previewRolloutKeys.includes(r.feature_key)).sort((a, b) => a.feature_key.localeCompare(b.feature_key));
const snapshotPresent = (db) => db.rows.some((r) => r.tenant_id === tenantId && r.feature_key === previewSnapshotKey);

test("initial cleanup with no saved preview leaves enabled V4 flags and sessions untouched", async () => {
  const initial = previewRolloutKeys.map((key) => row(key, key.includes("direct_child") ? "disabled" : "enabled"));
  const db = database(initial);
  assert.equal(await restorePreviewRollout(db, tenantId, projectUrl), false);
  assert.deepEqual(db.rows, initial);
  assert.deepEqual(db.writes, []);
});

test("preview cleanup restores exact mixed statuses, readiness, TTL and activation fields without affecting other tenants", async () => {
  const baseline = previewRolloutKeys.map((key, i) => row(key, ["enabled", "disabled", "pilot", "paused"][i]));
  const unrelated = [row("swim.curriculum.v3", "enabled"), row(previewRolloutKeys[0], "enabled", otherTenantId)];
  const db = database([...baseline, ...unrelated]);
  await capturePreviewRollout(db, tenantId, projectUrl);
  for (const flag of currentFlags(db)) Object.assign(flag, { status: "pilot", config_json: { absoluteTtlMinutes: 240 }, readiness_json: {}, activated_at: "2026-09-20T00:00:00+00:00" });
  // A separate helper invocation sees only the durable database state, as the
  // cleanup on the next hosted runner would after an interrupted workflow.
  const restarted = database(db.rows);
  assert.equal(await restorePreviewRollout(restarted, tenantId, projectUrl), true);
  assert.deepEqual(currentFlags(restarted), baseline);
  assert.deepEqual(restarted.rows.filter((r) => !previewRolloutKeys.includes(r.feature_key) || r.tenant_id === otherTenantId), unrelated);
  assert.equal(snapshotPresent(restarted), false);
  const writes = restarted.writes.length;
  assert.equal(await restorePreviewRollout(restarted, tenantId, projectUrl), false);
  assert.equal(restarted.writes.length, writes);
});

test("a repeated prepare keeps the original baseline and removes only previously absent fixture flags", async () => {
  const baseline = [row(previewRolloutKeys[0], "shadow")];
  const db = database(baseline);
  const first = await capturePreviewRollout(db, tenantId, projectUrl);
  db.rows.find((r) => r.feature_key === previewRolloutKeys[0]).status = "pilot";
  db.rows.push(...previewRolloutKeys.slice(1).map((key) => row(key, "pilot")));
  assert.deepEqual(await capturePreviewRollout(db, tenantId, projectUrl), first);
  await restorePreviewRollout(db, tenantId, projectUrl);
  assert.deepEqual(currentFlags(db), baseline);
});

test("a new prepare cannot replace an unfinished run baseline and the workflow serializes the complete preview lifecycle", async () => {
  const db = database([row(previewRolloutKeys[0])]);
  await capturePreviewRollout(db, tenantId, projectUrl, "github:previous:1");
  const before = copy(db.rows), writes = db.writes.length;
  await assert.rejects(() => capturePreviewRollout(db, tenantId, projectUrl, "github:next:1"), /Another preview owns/);
  assert.deepEqual(db.rows, before);
  assert.equal(db.writes.length, writes);
  await restorePreviewRollout(db, tenantId, projectUrl);
  await capturePreviewRollout(db, tenantId, projectUrl, "github:next:1");
  const workflow = readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /^concurrency:\n  group: nxttrack-\$\{\{ inputs\.target \}\}\n  cancel-in-progress: false/m);
  assert.match(workflow, /Restore parent and child test rollout\n\s+if: always\(\)/);
  const browserJob = workflow.split("  staging-browser-validation:")[1];
  const restore = browserJob.indexOf("- name: Restore parent and child test rollout");
  // Phase 15 runs the broad E2E suite, which includes the mutating theme matrix.
  // Its original baseline must still exist until that final suite has finished.
  assert.ok(restore > browserJob.indexOf("- name: Phase 15 staging truth and security validation"));
  assert.ok(restore < browserJob.indexOf("- name: Write release evidence"));
  assert.equal(browserJob.match(/- name: Restore parent and child test rollout/g)?.length, 1);
});

test("the disabled recovery marker satisfies the deployed feature-key contract and is outside runtime portal capabilities", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/20260802150000_curriculum_wizard_and_migrations.sql", import.meta.url), "utf8");
  const pattern = migration.match(/check \(feature_key ~ '([^']+)'\)/)?.[1];
  assert.ok(pattern, "The existing database feature-key constraint must remain available");
  assert.match(previewSnapshotKey, new RegExp(pattern));
  const features = readFileSync(new URL("../../apps/web/lib/domain/portal-features.ts", import.meta.url), "utf8");
  const runtimeKeys = [...features.matchAll(/"(swim\.portal\.[a-z_]+)"/g)].map((entry) => entry[1]);
  assert.deepEqual(runtimeKeys.sort(), [...previewRolloutKeys].sort());
  assert.ok(!runtimeKeys.includes(previewSnapshotKey));
});

test("empty baseline restores absence instead of inventing disabled configuration", async () => {
  const db = database([]);
  await capturePreviewRollout(db, tenantId, projectUrl);
  db.rows.push(...previewRolloutKeys.map((key) => row(key, "pilot")));
  await restorePreviewRollout(db, tenantId, projectUrl);
  assert.deepEqual(db.rows, []);
});

test("failed restore retains the recovery baseline and a later retry restores the original state", async () => {
  const baseline = [row(previewRolloutKeys[0], "enabled")];
  const db = database(baseline);
  await capturePreviewRollout(db, tenantId, projectUrl);
  db.rows.find((r) => r.feature_key === previewRolloutKeys[0]).status = "pilot";
  db.fault = ({ operation }) => operation === "upsert";
  await assert.rejects(() => restorePreviewRollout(db, tenantId, projectUrl), /Could not restore/);
  assert.equal(snapshotPresent(db), true);
  db.fault = null;
  await restorePreviewRollout(db, tenantId, projectUrl);
  assert.deepEqual(currentFlags(db), baseline);
});

test("failed verification or marker deletion remains retryable without losing the original settings", async () => {
  for (const failure of ["verify", "delete"]) {
    const baseline = [row(previewRolloutKeys[0])], db = database(baseline);
    await capturePreviewRollout(db, tenantId, projectUrl);
    db.fault = ({ operation, matched }) => failure === "verify"
      ? operation === "select" && matched.some((r) => r.feature_key === previewRolloutKeys[0])
      : operation === "delete" && matched.some((r) => r.feature_key === previewSnapshotKey);
    await assert.rejects(() => restorePreviewRollout(db, tenantId, projectUrl), /Could not read|could not be removed/);
    assert.equal(snapshotPresent(db), true);
    db.fault = null;
    await restorePreviewRollout(db, tenantId, projectUrl);
    assert.deepEqual(currentFlags(db), baseline);
  }
});

test("a recovery record from another project or containing unrelated rows is refused before writes", async () => {
  for (const mutation of [
    (snapshot) => { snapshot.projectUrl = "https://other-project.supabase.co"; },
    (snapshot) => { snapshot.rows[0].tenant_id = otherTenantId; },
    (snapshot) => { snapshot.rows[0].feature_key = "swim.curriculum.v3"; },
    (snapshot) => { snapshot.rows.push(copy(snapshot.rows[0])); }
  ]) {
    const db = database([row(previewRolloutKeys[0])]);
    await capturePreviewRollout(db, tenantId, projectUrl);
    mutation(db.rows.find((r) => r.feature_key === previewSnapshotKey).config_json);
    const before = copy(db.rows), writes = db.writes.length;
    await assert.rejects(() => restorePreviewRollout(db, tenantId, projectUrl), /recovery snapshot/);
    assert.deepEqual(db.rows, before);
    assert.equal(db.writes.length, writes);
  }
});
