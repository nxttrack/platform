#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");
const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const phaseStatePath = path.resolve(process.cwd(), process.env.PHASE16_STATE_PATH || "artifacts/phase16-state.json");
const parentStatePath = path.resolve(process.cwd(), process.env.SPRINT4_PARENT_STATE_PATH || "artifacts/sprint4-parent-state.json");
const marker = "sprint4-parent:";
const targetGroupCode = "sprint4-parent-catchup";
const targetGroupName = "Sprint 4 Inhaalgroep";
const notificationTitle = "Sprint 4 ouderactie";
const graduationTitle = "Sprint 4 Afzwemuitnodiging";

if (process.env.APP_ENV !== "staging" || hostname(appUrl) !== "staging.nxttrack.nl") {
  throw new Error("Sprint 4 parent preparation is restricted to staging.nxttrack.nl.");
}

if (!supabaseUrl || !supabaseSecret) {
  throw new Error("Staging Supabase credentials are required.");
}

if (!existsSync(phaseStatePath)) {
  throw new Error(`Phase 16 state is missing at ${phaseStatePath}.`);
}

const phase = JSON.parse(readFileSync(phaseStatePath, "utf8"));
const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const tenantId = phase.tenant.id;
const participantId = phase.expected.participantId;
const parentUserId = phase.users.parent.id;

const [groupResult, enrollmentResult, settingsResult] = await Promise.all([
  admin
    .from("groups")
    .select("id, program_id, stage_id, default_resource_id")
    .eq("tenant_id", tenantId)
    .eq("id", phase.expected.groupId)
    .single(),
  admin
    .from("enrollments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single(),
  admin
    .from("tenant_settings")
    .select("lesson_cancellation_cutoff_hours, lesson_cancellation_grants_credit, catch_up_booking_window_days, catch_up_requires_admin_approval")
    .eq("tenant_id", tenantId)
    .single()
]);

const group = checked(groupResult, "Phase 16 group");
const enrollment = checked(enrollmentResult, "Phase 16 enrollment");
const settings = checked(settingsResult, "tenant self-service settings");

if (!settings.lesson_cancellation_grants_credit || Number(settings.lesson_cancellation_cutoff_hours) > 168 || Number(settings.catch_up_booking_window_days) < 9) {
  throw new Error("Staging tenant settings do not support the bounded cancellation-to-catch-up journey.");
}

await cleanupPriorFixture();

const profileResult = await admin
  .from("profiles")
  .update({ full_name: phase.users.parent.fullName, phone: null })
  .eq("id", parentUserId);

if (profileResult.error) {
  throw new Error(`Could not restore the parent profile: ${profileResult.error.message}`);
}

const targetGroup = await insertOne("groups", {
  tenant_id: tenantId,
  program_id: group.program_id,
  stage_id: group.stage_id,
  default_resource_id: group.default_resource_id,
  name: targetGroupName,
  code: targetGroupCode,
  status: "active",
  capacity: 4,
  default_weekday: 3,
  default_start_time: "17:00",
  default_end_time: "17:45"
});
const sourceWindow = futureWindow(8, 17, 0);
const targetWindow = futureWindow(9, 17, 0);
const graduationWindow = futureWindow(14, 11, 0, 90);
const sourceSession = await insertOne("sessions", {
  tenant_id: tenantId,
  group_id: group.id,
  resource_id: group.default_resource_id,
  starts_at: sourceWindow.startsAt,
  ends_at: sourceWindow.endsAt,
  status: "scheduled",
  capacity_override: 8,
  notes: `${marker}cancellation-source`
});
const targetSession = await insertOne("sessions", {
  tenant_id: tenantId,
  group_id: targetGroup.id,
  resource_id: group.default_resource_id,
  starts_at: targetWindow.startsAt,
  ends_at: targetWindow.endsAt,
  status: "scheduled",
  capacity_override: 4,
  notes: `${marker}catch-up-target`
});
const notification = await insertOne("tenant_notifications", {
  tenant_id: tenantId,
  recipient_user_id: parentUserId,
  participant_id: participantId,
  type: "system",
  title: notificationTitle,
  message: "Browserbewijs voor de ouder-selfservicejourney.",
  status: "unread"
});
const graduationEvent = await insertOne("graduation_events", {
  tenant_id: tenantId,
  program_id: group.program_id,
  stage_id: group.stage_id,
  resource_id: group.default_resource_id,
  title: graduationTitle,
  status: "published",
  starts_at: graduationWindow.startsAt,
  ends_at: graduationWindow.endsAt,
  capacity: 12,
  notes: `${marker}graduation-event`,
  created_by_user_id: phase.users.tenantAdmin.id
});
const graduationParticipant = await insertOne("graduation_event_participants", {
  tenant_id: tenantId,
  event_id: graduationEvent.id,
  participant_id: participantId,
  enrollment_id: enrollment.id,
  invite_status: "sent",
  status: "invited",
  invited_at: new Date().toISOString(),
  result: "pending"
});

const [graduationEventCheck, graduationParticipantCheck] = await Promise.all([
  admin.from("graduation_events").select("id, title, status").eq("tenant_id", tenantId).eq("id", graduationEvent.id).single(),
  admin
    .from("graduation_event_participants")
    .select("id, event_id, participant_id, invite_status, status")
    .eq("tenant_id", tenantId)
    .eq("id", graduationParticipant.id)
    .single()
]);
const verifiedGraduationEvent = checked(graduationEventCheck, "Sprint 4 graduation event");
const verifiedGraduationParticipant = checked(graduationParticipantCheck, "Sprint 4 graduation participant");

if (
  verifiedGraduationEvent.title !== graduationTitle ||
  verifiedGraduationEvent.status !== "published" ||
  verifiedGraduationParticipant.event_id !== graduationEvent.id ||
  verifiedGraduationParticipant.participant_id !== participantId ||
  verifiedGraduationParticipant.invite_status !== "sent" ||
  verifiedGraduationParticipant.status !== "invited"
) {
  throw new Error("Sprint 4 graduation fixture verification failed.");
}

const state = {
  profileName: "Sprint 4 Ouder",
  profilePhone: "0612345678",
  participantName: phase.expected.participantName,
  sourceSessionId: sourceSession.id,
  targetSessionId: targetSession.id,
  targetGroupName,
  notificationId: notification.id,
  notificationTitle,
  graduationParticipantId: graduationParticipant.id,
  graduationTitle,
  catchUpOutcome: settings.catch_up_requires_admin_approval ? "requested" : "approved"
};

mkdirSync(path.dirname(parentStatePath), { recursive: true });
writeFileSync(parentStatePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(`[sprint4:prepare-parent] PASS wrote bounded parent state to ${parentStatePath}.`);

async function cleanupPriorFixture() {
  const priorSessionsResult = await admin.from("sessions").select("id").eq("tenant_id", tenantId).like("notes", `${marker}%`);
  const priorSessions = checkedMany(priorSessionsResult, "prior parent sessions").map((row) => row.id);
  let cancellationIds = [];

  if (priorSessions.length > 0) {
    const cancellationsResult = await admin.from("lesson_cancellations").select("id").eq("tenant_id", tenantId).in("session_id", priorSessions);
    cancellationIds = checkedMany(cancellationsResult, "prior parent cancellations").map((row) => row.id);
  }

  let creditIds = [];

  if (cancellationIds.length > 0) {
    const creditsResult = await admin.from("catch_up_credits").select("id").eq("tenant_id", tenantId).in("source_cancellation_id", cancellationIds);
    creditIds = checkedMany(creditsResult, "prior parent credits").map((row) => row.id);
  }

  if (creditIds.length > 0) {
    await removeWhereIn("catch_up_requests", "credit_id", creditIds);
    await removeWhereIn("catch_up_credits", "id", creditIds);
  }

  if (cancellationIds.length > 0) {
    await removeWhereIn("lesson_cancellations", "id", cancellationIds);
  }

  if (priorSessions.length > 0) {
    await removeWhereIn("sessions", "id", priorSessions);
  }

  await removeWhere("graduation_events", "notes", `${marker}graduation-event`);
  await removeWhere("tenant_notifications", "title", notificationTitle, parentUserId);
  await removeWhere("groups", "code", targetGroupCode);
}

async function insertOne(table, values) {
  const result = await admin.from(table).insert(values).select("id").single();

  if (result.error || !result.data) {
    throw new Error(`Could not create Sprint 4 ${table} fixture: ${result.error?.message ?? "row missing"}`);
  }

  return result.data;
}

async function removeWhereIn(table, field, values) {
  const result = await admin.from(table).delete().eq("tenant_id", tenantId).in(field, values);

  if (result.error) {
    throw new Error(`Could not clean Sprint 4 ${table}: ${result.error.message}`);
  }
}

async function removeWhere(table, field, value, recipientUserId) {
  let query = admin.from(table).delete().eq("tenant_id", tenantId).eq(field, value);

  if (recipientUserId) query = query.eq("recipient_user_id", recipientUserId);
  const result = await query;

  if (result.error) {
    throw new Error(`Could not clean Sprint 4 ${table}: ${result.error.message}`);
  }
}

function checked(result, label) {
  if (result.error || !result.data) {
    throw new Error(`Could not resolve ${label}: ${result.error?.message ?? "row missing"}`);
  }

  return result.data;
}

function checkedMany(result, label) {
  if (result.error) throw new Error(`Could not resolve ${label}: ${result.error.message}`);
  return result.data ?? [];
}

function futureWindow(days, hour, minute, durationMinutes = 45) {
  const starts = new Date();
  starts.setDate(starts.getDate() + days);
  starts.setHours(hour, minute, 0, 0);
  const ends = new Date(starts.getTime() + durationMinutes * 60 * 1000);
  return { startsAt: starts.toISOString(), endsAt: ends.toISOString() };
}

function hostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}
