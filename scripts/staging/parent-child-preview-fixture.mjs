#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { capturePreviewRollout, restorePreviewRollout } from "./parent-child-preview-rollout.mjs";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const mode = process.argv[2] ?? "prepare";
const appUrl = String(process.env.APP_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "").replace(/\/+$/, "");
const statePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH ?? "artifacts/phase16-state.json");
const evidencePath = path.resolve(process.cwd(), "artifacts/parent-child-preview-fixture.json");
const visualThemes = [
  "nxttrack-default",
  "dolphin-bay",
  "turtle-trails",
  "polar-splash",
  "coastal-explorer",
  "nationaal-zwem-abc",
  "ocean-quest"
];

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
  const { tenantId } = await resolveCleanupContext();
  const restored = await restorePreviewRollout(admin, tenantId, supabaseUrl);
  console.log(restored
    ? "[parent-child-preview] PASS previous rollout flags and settings restored; existing sessions preserved."
    : "[parent-child-preview] PASS no interrupted preview snapshot; current rollout and sessions preserved.");
  process.exit(0);
}

if (!state) throw new Error(`Phase 16 fixture state is missing at ${statePath}.`);
const tenantId = requiredUuid(state?.tenant?.id, "tenant.id");
const participantId = requiredUuid(state?.expected?.participantId, "expected.participantId");
const parentUserId = requiredUuid(state?.users?.parent?.id, "users.parent.id");
await resolveCleanupContext();
// Persist before any preview mutations. The workflow's always() cleanup also
// restores this baseline after a failed prepare or browser test.
await capturePreviewRollout(admin, tenantId, supabaseUrl,
  process.env.GITHUB_RUN_ID ? `github:${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : `process:${process.pid}`);
const platformThemeActor = await admin
  .from("platform_memberships")
  .select("user_id")
  .eq("status", "active")
  .in("role", ["platform_owner", "platform_admin"])
  .order("created_at")
  .limit(1)
  .maybeSingle();
if (platformThemeActor.error || !platformThemeActor.data) {
  throw new Error(`Could not resolve the preserved platform theme manager: ${platformThemeActor.error?.message ?? "membership missing"}`);
}
const platformThemeActorUserId = requiredUuid(platformThemeActor.data.user_id, "platformThemeActor.user_id");
for (const themeKey of visualThemes) {
  const availability = await admin.rpc("set_tenant_portal_theme_availability", {
    target_actor_user_id: platformThemeActorUserId,
    target_is_enabled: true,
    target_reason: "AquaSwim Demo staging visual matrix seed",
    target_tenant_id: tenantId,
    target_theme_key: themeKey,
    target_theme_release: "3.0.0"
  });
  if (availability.error) {
    throw new Error(`Could not enable ${themeKey} through the public platform wrapper: ${availability.error.message}`);
  }
}
const nationalLicense = await admin.rpc("set_tenant_portal_theme_license", {
  target_actor_user_id: platformThemeActorUserId,
  target_evidence_reference: "",
  target_reason: "AquaSwim Demo staging preview keeps protected naming fail-closed",
  target_status: "revoked",
  target_tenant_id: tenantId
});
if (nationalLicense.error) {
  throw new Error(`Could not reset the protected theme license through the public platform wrapper: ${nationalLicense.error.message}`);
}
const themeAvailability = await admin
  .from("tenant_portal_theme_availability")
  .select("theme_key, theme_release, is_enabled")
  .eq("tenant_id", tenantId)
  .eq("theme_release", "3.0.0")
  .in("theme_key", visualThemes);
if (
  themeAvailability.error
  || themeAvailability.data?.length !== visualThemes.length
  || themeAvailability.data.some((entry) => entry.theme_release !== "3.0.0" || !entry.is_enabled)
) {
  throw new Error(`Seven-theme tenant availability could not be seeded: ${themeAvailability.error?.message ?? JSON.stringify(themeAvailability.data ?? [])}`);
}

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
if (process.env.GITHUB_ENV) {
  appendFileSync(process.env.GITHUB_ENV, [
    `E2E_CERTIFICATE_CODE=${publicCode}`,
    ""
  ].join("\n"));
}
mkdirSync(path.dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  certificateCode: publicCode,
  guardianAccess: guardian.data.access_level,
  participantId,
  platformThemeActorUserId,
  protectedThemeLicense: "revoked",
  preparedAt: new Date().toISOString(),
  tenantId,
  themes: themeAvailability.data.map((entry) => `${entry.theme_key}@${entry.theme_release}`).sort(),
  upcomingSessionId: upcoming.data[0].id
}, null, 2)}\n`);
console.log("[parent-child-preview] PASS parent, child, lesson, badge, certificate and seven-theme fixtures are ready.");

function requiredUuid(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`A valid ${label} UUID is required.`);
  }
  return value;
}

async function resolveCleanupContext() {
  const tenant = await admin.from("tenants").select("id").eq("slug", "aquaswim-demo").maybeSingle();
  if (tenant.error || !tenant.data) throw new Error(`Could not resolve AquaSwim Demo: ${tenant.error?.message ?? "tenant missing"}`);
  const tenantId = requiredUuid(tenant.data.id, "tenant.id");
  if (state?.tenant?.id && state.tenant.id !== tenantId) throw new Error("Phase 16 state does not belong to AquaSwim Demo.");
  return { tenantId };
}
