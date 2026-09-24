import { isDeepStrictEqual } from "node:util";

export const previewRolloutKeys = [
  "swim.portal.child_mode",
  "swim.portal.direct_child_login",
  "swim.portal.parent_child_split",
  "swim.portal.parent_requests"
];
export const previewSnapshotKey = "swim.portal.preview_fixture_snapshot";
// A disabled fixture-only row survives an interrupted hosted runner. Runtime
// feature lookups use the four explicit keys above, never this recovery marker.
const columns = "tenant_id,feature_key,status,readiness_json,config_json,activated_at,activated_by_user_id,created_at";
const statuses = ["disabled", "shadow", "pilot", "enabled", "paused"];

export async function capturePreviewRollout(admin, tenantId, projectUrl, owner = `process:${process.pid}`) {
  const existing = await readSnapshot(admin, tenantId, projectUrl);
  if (existing) {
    if (existing.owner !== owner) throw new Error("Another preview owns the saved rollout; restore its interrupted snapshot before preparing again.");
    return existing;
  }
  const rows = await readRollouts(admin, tenantId);
  const snapshot = { version: 1, owner, tenantId, projectUrl: new URL(projectUrl).origin, rows };
  validateSnapshot(snapshot, tenantId, projectUrl);
  const result = await admin.from("tenant_swim_rollouts").insert({
    tenant_id: tenantId,
    feature_key: previewSnapshotKey,
    status: "disabled",
    config_json: snapshot
  });
  if (result.error) throw new Error(`Could not preserve the child portal rollout: ${result.error.message}`);
  const saved = await readSnapshot(admin, tenantId, projectUrl);
  if (!isDeepStrictEqual(saved, snapshot)) throw new Error("Child portal rollout snapshot readback differs; preview must not start.");
  return saved;
}

export async function restorePreviewRollout(admin, tenantId, projectUrl) {
  const snapshot = await readSnapshot(admin, tenantId, projectUrl);
  if (!snapshot) return false;

  // The public configure_child_portal_rollout_for_service command intentionally
  // normalizes all four rows and revokes every child session when disabled. A
  // fixture restore must preserve mixed statuses/config and existing sessions.
  if (snapshot.rows.length) {
    const restored = await admin.from("tenant_swim_rollouts").upsert(snapshot.rows, { onConflict: "tenant_id,feature_key" });
    if (restored.error) throw new Error(`Could not restore the child portal rollout: ${restored.error.message}`);
  }
  const absent = previewRolloutKeys.filter((key) => !snapshot.rows.some((row) => row.feature_key === key));
  if (absent.length) {
    const removed = await admin.from("tenant_swim_rollouts").delete().eq("tenant_id", tenantId).in("feature_key", absent);
    if (removed.error) throw new Error(`Could not restore absent child portal flags: ${removed.error.message}`);
  }
  // updated_at is deliberately omitted: the existing database trigger records
  // the restoration time. Original creation/activation data and settings survive.
  if (!isDeepStrictEqual(await readRollouts(admin, tenantId), snapshot.rows)) {
    throw new Error("Child portal rollout restore readback differs; recovery snapshot retained.");
  }
  const removed = await admin.from("tenant_swim_rollouts").delete().eq("tenant_id", tenantId).eq("feature_key", previewSnapshotKey);
  if (removed.error) throw new Error(`Rollout restored but recovery snapshot could not be removed: ${removed.error.message}`);
  return true;
}

async function readRollouts(admin, tenantId) {
  const result = await admin.from("tenant_swim_rollouts").select(columns).eq("tenant_id", tenantId).in("feature_key", previewRolloutKeys);
  if (result.error) throw new Error(`Could not read the child portal rollout: ${result.error.message}`);
  return (result.data ?? []).sort((a, b) => a.feature_key.localeCompare(b.feature_key));
}

async function readSnapshot(admin, tenantId, projectUrl) {
  const result = await admin.from("tenant_swim_rollouts").select("status,config_json").eq("tenant_id", tenantId).eq("feature_key", previewSnapshotKey).maybeSingle();
  if (result.error) throw new Error(`Could not read child portal recovery snapshot: ${result.error.message}`);
  if (!result.data) return null;
  if (result.data.status !== "disabled") throw new Error("Child portal recovery marker must stay disabled.");
  validateSnapshot(result.data.config_json, tenantId, projectUrl);
  return result.data.config_json;
}

function validateSnapshot(snapshot, tenantId, projectUrl) {
  if (!snapshot || snapshot.version !== 1 || typeof snapshot.owner !== "string" || !snapshot.owner.length || snapshot.owner.length > 150
    || snapshot.tenantId !== tenantId || snapshot.projectUrl !== new URL(projectUrl).origin || !Array.isArray(snapshot.rows) || snapshot.rows.length > 4
    || JSON.stringify(snapshot).length > 64 * 1024) {
    throw new Error("Child portal recovery snapshot does not match this tenant/project.");
  }
  const seen = new Set();
  for (const row of snapshot.rows) {
    if (!row || row.tenant_id !== tenantId || !previewRolloutKeys.includes(row.feature_key) || seen.has(row.feature_key) || !statuses.includes(row.status)
      || Object.keys(row).sort().join(",") !== columns.split(",").sort().join(",")
      || !isObject(row.readiness_json) || !isObject(row.config_json)) {
      throw new Error("Child portal recovery snapshot contains an invalid rollout row.");
    }
    seen.add(row.feature_key);
  }
}

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
