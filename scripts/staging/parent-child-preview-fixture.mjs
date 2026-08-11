#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const mode = process.argv[2] ?? "prepare";
const appUrl = String(process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").replace(/\/+$/, "");
const statePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH ?? "artifacts/phase16-state.json");
const evidencePath = path.resolve(process.cwd(), "artifacts/parent-child-preview-fixture.json");

if (!['prepare', 'cleanup'].includes(mode)) throw new Error(`Unsupported preview fixture mode: ${mode}`);
if (process.env.APP_ENV !== "staging" || process.env.TARGET !== "staging" || appUrl !== "https://staging.nxttrack.nl") {
  throw new Error("Parent/child preview fixtures are restricted to https://staging.nxttrack.nl.");
}
if (process.env.PHASE16_TENANT_SLUG !== "aquaswim-demo") {
  throw new Error("Parent/child preview fixtures are restricted to the aquaswim-demo tenant.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase staging service credentials are required.");

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null;

if (mode === "cleanup") {
  const { tenantId, tenantAdminUserId } = await resolveCleanupContext();
  const rollout = await admin.rpc("configure_child_portal_rollout_for_service", {
    p_absolute_ttl_minutes: 240,
    p_actor_user_id: tenantAdminUserId,
    p_security_reviewed: true,
    p_status: "disabled",
    p_tenant_id: tenantId,
    p_visual_matrix_reviewed: true
  });
  if (rollout.error) throw new Error(`Could not disable child portal rollout: ${rollout.error.message}`);
  const disabled = await admin
    .from("tenant_swim_rollouts")
    .select("feature_key, status")
    .eq("tenant_id", tenantId)
    .in("feature_key", [
      "swim.portal.child_mode",
      "swim.portal.direct_child_login",
      "swim.portal.parent_child_split",
      "swim.portal.parent_requests"
    ]);
  if (disabled.error || disabled.data?.length !== 4 || disabled.data.some((entry) => entry.status !== "disabled")) {
    throw new Error(`Child portal rollout did not return to its disabled state: ${disabled.error?.message ?? JSON.stringify(disabled.data ?? [])}`);
  }
  console.log("[parent-child-preview] PASS rollout disabled and active child sessions revoked.");
  process.exit(0);
}

if (!state) throw new Error(`Phase 16 fixture state is missing at ${statePath}.`);
const tenantId = requiredUuid(state?.tenant?.id, "tenant.id");
const participantId = requiredUuid(state?.expected?.participantId, "expected.participantId");
const parentUserId = requiredUuid(state?.users?.parent?.id, "users.parent.id");

const [guardian, certificate, award, groupMembership] = await Promise.all([
  admin
    .from("participant_guardians")
    .select("id, access_level, status")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("guardian_user_id", parentUserId)
    .eq("status", "active")
    .maybeSingle(),
  admin
    .from("certificate_records")
    .select("id, verification_public_id, verification_status, status")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "issued")
    .order("issued_on", { ascending: false })
    .limit(1)
    .maybeSingle(),
  admin
    .from("participant_badge_awards")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "awarded")
    .limit(1),
  admin
    .from("group_memberships")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "active")
]);

for (const [label, result] of Object.entries({ guardian, certificate, award, groupMembership })) {
  if (result.error) throw new Error(`${label} fixture check failed: ${result.error.message}`);
}
if (!guardian.data || !certificate.data?.verification_public_id || certificate.data.verification_status !== "active") {
  throw new Error("Guardian or public certificate fixture is incomplete.");
}
if (!award.data?.length) throw new Error("An earned badge fixture is required.");
const groupIds = [...new Set((groupMembership.data ?? []).map((entry) => entry.group_id))];
if (!groupIds.length) throw new Error("An active child group membership is required.");
const upcoming = await admin
  .from("sessions")
  .select("id")
  .eq("tenant_id", tenantId)
  .in("group_id", groupIds)
  .gte("ends_at", new Date().toISOString())
  .order("starts_at")
  .limit(1);
if (upcoming.error || !upcoming.data?.length) throw new Error("An upcoming child-safe lesson fixture is required.");

const publicCode = requiredUuid(certificate.data.verification_public_id, "certificate.verification_public_id");
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `E2E_CERTIFICATE_CODE=${publicCode}\n`);
mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  certificateCode: publicCode,
  guardianAccess: guardian.data.access_level,
  participantId,
  preparedAt: new Date().toISOString(),
  tenantId,
  upcomingSessionId: upcoming.data[0].id
}, null, 2)}\n`);
console.log("[parent-child-preview] PASS parent, child, lesson, badge and certificate fixtures are ready.");

function requiredUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`A valid ${label} UUID is required.`);
  }
  return value;
}

async function resolveCleanupContext() {
  let tenantId = optionalUuid(state?.tenant?.id);
  let tenantAdminUserId = optionalUuid(state?.users?.tenantAdmin?.id);

  if (!tenantId) {
    const tenant = await admin.from("tenants").select("id").eq("slug", "aquaswim-demo").maybeSingle();
    if (tenant.error || !tenant.data) throw new Error(`Could not resolve AquaSwim Demo: ${tenant.error?.message ?? "tenant missing"}`);
    tenantId = requiredUuid(tenant.data.id, "tenant.id");
  }

  if (!tenantAdminUserId) {
    const membership = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", ["tenant_owner", "tenant_admin"])
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (membership.error || !membership.data) {
      throw new Error(`Could not resolve the preserved AquaSwim administrator: ${membership.error?.message ?? "membership missing"}`);
    }
    tenantAdminUserId = requiredUuid(membership.data.user_id, "tenantAdmin.user_id");
  }

  return { tenantId, tenantAdminUserId };
}

function optionalUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}
