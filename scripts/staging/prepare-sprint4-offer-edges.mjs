#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const pepper = process.env.AUTH_CODE_PEPPER || process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
const phaseStatePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");
const edgeStatePath = path.resolve(process.cwd(), process.env.SPRINT4_EDGE_STATE_PATH || "artifacts/sprint4-edge-state.json");

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 offer-edge preparation is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret || !pepper) {
  throw new Error("Staging Supabase credentials and an offer-token pepper are required.");
}

if (!existsSync(phaseStatePath)) {
  throw new Error(`Phase 16 state is missing at ${phaseStatePath}.`);
}

const phase = JSON.parse(readFileSync(phaseStatePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const groupResult = await admin
  .from("groups")
  .select("program_id, stage_id")
  .eq("tenant_id", phase.tenant.id)
  .eq("id", phase.expected.groupId)
  .single();

if (groupResult.error || !groupResult.data) {
  throw new Error(`Could not resolve the Phase 16 program and stage: ${groupResult.error?.message ?? "group missing"}`);
}

const tenantId = phase.tenant.id;
const programId = groupResult.data.program_id;
const stageId = groupResult.data.stage_id;
const fullGroup = await insertOne("groups", {
  tenant_id: tenantId,
  program_id: programId,
  stage_id: stageId,
  name: "Sprint 4 Volle Randgroep",
  code: "sprint4-edge-full",
  status: "active",
  capacity: 1,
  default_weekday: 7,
  default_start_time: "08:00",
  default_end_time: "08:45"
});
const capacityParticipant = await insertOne("participants", {
  tenant_id: tenantId,
  display_name: "Sprint 4 Capaciteitsvuller",
  birth_date: "2018-01-01",
  external_reference: "sprint4-edge-full-participant",
  status: "active"
});
const capacityEnrollment = await insertOne("enrollments", {
  tenant_id: tenantId,
  participant_id: capacityParticipant.id,
  program_id: programId,
  current_stage_id: stageId,
  status: "active",
  source: "manual",
  starts_on: new Date().toISOString().slice(0, 10)
});

await insertOne("group_memberships", {
  tenant_id: tenantId,
  group_id: fullGroup.id,
  enrollment_id: capacityEnrollment.id,
  participant_id: capacityParticipant.id,
  status: "active",
  starts_on: new Date().toISOString().slice(0, 10),
  capacity_weight: 1
});

const runKey = `${process.env.GITHUB_RUN_ID || Date.now()}-${randomBytes(6).toString("hex")}`;
const expired = await createEdgeOffer({
  participantName: `Sprint4 Verlopen ${runKey}`,
  marker: `sprint4-browser:edge-expired:${runKey}`,
  token: `sprint4-expired-${runKey}`,
  expiresAt: new Date(Date.now() - 60_000).toISOString()
});
const full = await createEdgeOffer({
  participantName: `Sprint4 Vol ${runKey}`,
  marker: `sprint4-browser:edge-full:${runKey}`,
  token: `sprint4-full-${runKey}`,
  expiresAt: new Date(Date.now() + 3_600_000).toISOString()
});

mkdirSync(path.dirname(edgeStatePath), { recursive: true });
writeFileSync(edgeStatePath, `${JSON.stringify({ expired, full }, null, 2)}\n`);
console.log(`[sprint4:prepare-offer-edges] PASS wrote bounded edge state to ${edgeStatePath}.`);

async function createEdgeOffer({ participantName, marker, token, expiresAt }) {
  const submission = await insertOne("intake_submissions", {
    tenant_id: tenantId,
    program_id: programId,
    selected_option: "waitlist",
    parent_name: "Sprint 4 Randgeval",
    parent_email: "sprint4-edge@example.test",
    participant_name: participantName,
    participant_birth_date: "2019-07-22",
    preferred_days: ["zondag"],
    preferred_notes: "Begrensde staging-fixture voor Sprint 4.",
    message: marker,
    consent_given: true,
    source_hostname: phase.tenant.hostname,
    status: "reviewing"
  });
  const entry = await insertOne("waitlist_entries", {
    tenant_id: tenantId,
    intake_submission_id: submission.id,
    program_id: programId,
    recommended_stage_id: stageId,
    parent_name: "Sprint 4 Randgeval",
    parent_email: "sprint4-edge@example.test",
    participant_name: participantName,
    participant_birth_date: "2019-07-22",
    selected_option: "waitlist",
    status: "offered",
    source: "intake",
    admin_notes: marker
  });

  await insertOne("slot_offers", {
    tenant_id: tenantId,
    waitlist_entry_id: entry.id,
    group_id: fullGroup.id,
    token_hash: hashOfferToken(token),
    parent_email: "sprint4-edge@example.test",
    status: "sent",
    delivery_status: "skipped",
    delivery_error: "staging edge fixture; no mail sent",
    offered_at: new Date().toISOString(),
    expires_at: expiresAt
  });

  return { participantName, token };
}

async function insertOne(table, values) {
  const result = await admin.from(table).insert(values).select("id").single();

  if (result.error || !result.data) {
    throw new Error(`Could not create Sprint 4 ${table} fixture: ${result.error?.message ?? "row missing"}`);
  }

  return result.data;
}

function hashOfferToken(token) {
  return createHash("sha256").update(`${pepper}:slot-offer:${token}`).digest("hex");
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
