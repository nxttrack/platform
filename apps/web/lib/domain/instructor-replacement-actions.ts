"use server";

import { toAmsterdamDate } from "../date/business-date";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { getInstructorReplacementData } from "./instructor-replacement";

const path = "/admin/vervanging";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveInstructorQualificationAction(formData: FormData) {
  const { tenantId, userId } = await requireReplacementAdmin();
  const instructorUserId = readUuid(formData, "instructorUserId");
  const programId = readOptionalUuid(formData, "programId");
  const stageId = readOptionalUuid(formData, "stageId");
  const resourceId = readOptionalUuid(formData, "resourceId");
  if (!programId && !stageId && !resourceId) redirect(`${path}?error=qualification_scope`);
  const name = readText(formData, "name", 120);
  const validUntil = readOptionalDate(formData, "validUntil");
  const admin = createAdminClient();
  const membership = await admin.from("tenant_memberships").select("id").eq("tenant_id", tenantId).eq("user_id", instructorUserId).eq("role", "instructor").eq("status", "active").maybeSingle();
  if (membership.error || !membership.data) redirect(`${path}?error=instructor`);
  const result = await admin.from("instructor_qualifications").upsert({
    tenant_id: tenantId,
    instructor_user_id: instructorUserId,
    program_id: programId,
    stage_id: stageId,
    resource_id: resourceId,
    qualification_key: "lesson_instruction",
    name,
    status: "active",
    valid_from: toAmsterdamDate(),
    valid_until: validUntil,
    evidence_note: readOptionalText(formData, "evidenceNote", 1000),
    verified_by_user_id: userId,
    verified_at: new Date().toISOString()
  }, { onConflict: "tenant_id,instructor_user_id,qualification_key,program_id,stage_id,resource_id" });
  if (result.error) redirect(`${path}?error=qualification`);
  refresh();
  redirect(`${path}?saved=qualification`);
}

export async function saveInstructorWorkloadLimitsAction(formData: FormData) {
  const { tenantId, userId } = await requireReplacementAdmin();
  const instructorUserId = readUuid(formData, "instructorUserId");
  const admin = createAdminClient();
  const result = await admin.from("instructor_workload_limits").upsert({
    tenant_id: tenantId,
    instructor_user_id: instructorUserId,
    max_weekly_minutes: readInteger(formData, "maxWeeklyMinutes", 45, 3600),
    max_daily_minutes: readInteger(formData, "maxDailyMinutes", 45, 720),
    max_consecutive_minutes: readInteger(formData, "maxConsecutiveMinutes", 45, 360),
    max_sessions_per_day: readInteger(formData, "maxSessionsPerDay", 1, 16),
    minimum_break_minutes: readInteger(formData, "minimumBreakMinutes", 0, 180),
    cross_location_buffer_minutes: readInteger(formData, "crossLocationBufferMinutes", 0, 240),
    effective_from: toAmsterdamDate(),
    effective_until: null,
    status: "active",
    updated_by_user_id: userId
  }, { onConflict: "tenant_id,instructor_user_id" });
  if (result.error) redirect(`${path}?error=workload`);
  refresh();
  redirect(`${path}?saved=workload`);
}

export async function reportInstructorAbsenceAction(formData: FormData) {
  const { tenantId, userId } = await requireReplacementAdmin();
  const sessionId = readUuid(formData, "sessionId");
  const instructorUserId = readUuid(formData, "instructorUserId");
  const reason = readEnum(formData, "reasonCategory", ["illness", "emergency", "leave", "training", "unavailable", "other"] as const);
  const data = await getInstructorReplacementData(tenantId, sessionId);
  if (!data.selectedSession || data.selectedSession.originalInstructorId !== instructorUserId) redirect(`${path}?error=absence_context`);
  const admin = createAdminClient();
  const result = await admin.from("instructor_absences").upsert({
    tenant_id: tenantId,
    session_id: sessionId,
    instructor_user_id: instructorUserId,
    reason_category: reason,
    private_note: readOptionalText(formData, "privateNote", 1000),
    status: "reported",
    reported_by_user_id: userId,
    reported_at: new Date().toISOString(),
    covered_by_user_id: null,
    covered_at: null
  }, { onConflict: "tenant_id,session_id,instructor_user_id" });
  if (result.error) redirect(`${path}?error=absence`);
  refresh();
  redirect(`${path}?session=${sessionId}&saved=absence`);
}

export async function createInstructorReplacementDraftAction(formData: FormData) {
  const { tenantId, userId } = await requireReplacementAdmin();
  const sessionId = readUuid(formData, "sessionId");
  const replacementInstructorId = readUuid(formData, "replacementInstructorId");
  if (formData.get("humanConfirmation") !== "draft") redirect(`${path}?error=confirmation`);
  const data = await getInstructorReplacementData(tenantId, sessionId);
  const session = data.selectedSession;
  const candidate = data.candidates.find((row) => row.instructorId === replacementInstructorId);
  if (!session || !candidate?.actionable) redirect(`${path}?session=${sessionId}&error=candidate`);
  const proposedMessage = readOptionalText(formData, "proposedMessage", 2000)
    ?? `Kun je ${session.groupName} op ${formatDateTime(session.startsAt)} overnemen? Controleer de lescontext in NXTTRACK en bevestig dit verzoek bij de planner.`;
  const admin = createAdminClient();
  const result = await admin.from("instructor_replacement_requests").insert({
    tenant_id: tenantId,
    absence_id: session.absenceId,
    session_id: sessionId,
    original_instructor_user_id: session.originalInstructorId,
    replacement_instructor_user_id: replacementInstructorId,
    status: "draft",
    score: candidate.score,
    confidence: candidate.confidence,
    reasons_json: candidate.reasons,
    source_data_json: {
      blockers: candidate.blockers,
      workload_after: candidate.workloadAfter,
      lesson_context: candidate.lessonContext,
      evaluated_at: new Date().toISOString()
    },
    proposed_message: proposedMessage,
    requested_by_user_id: userId
  }).select("id").single();
  if (result.error) redirect(`${path}?session=${sessionId}&error=draft`);
  await admin.from("instructor_replacement_events").insert({
    tenant_id: tenantId,
    request_id: result.data.id,
    event_type: "drafted",
    actor_user_id: userId,
    message: "Vervangingsverzoek als intern concept aangemaakt; niets verzonden en rooster niet gewijzigd.",
    evidence_json: { score: candidate.score, confidence: candidate.confidence, reasons: candidate.reasons }
  });
  refresh();
  redirect(`${path}?session=${sessionId}&saved=draft`);
}

export async function confirmInstructorReplacementAction(formData: FormData) {
  const { tenantId, userId } = await requireReplacementAdmin();
  const requestId = readUuid(formData, "requestId");
  if (formData.get("humanConfirmation") !== "confirmed") redirect(`${path}?error=confirmation`);
  const admin = createAdminClient();
  const request = await admin.from("instructor_replacement_requests")
    .select("id, session_id, original_instructor_user_id, replacement_instructor_user_id, status, absence_id")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .maybeSingle();
  if (request.error || !request.data || !["draft", "ready"].includes(request.data.status)) redirect(`${path}?error=request`);
  const requestData = request.data;
  const data = await getInstructorReplacementData(tenantId, requestData.session_id);
  const candidate = data.candidates.find((row) => row.instructorId === requestData.replacement_instructor_user_id);
  if (!candidate?.actionable) redirect(`${path}?session=${requestData.session_id}&error=revalidation`);

  const assignment = await admin.from("session_instructor_assignments").upsert({
    tenant_id: tenantId,
    session_id: requestData.session_id,
    instructor_user_id: requestData.replacement_instructor_user_id,
    role: "substitute",
    status: "active"
  }, { onConflict: "session_id,instructor_user_id,role" });
  if (assignment.error) redirect(`${path}?session=${requestData.session_id}&error=assignment`);
  const now = new Date().toISOString();
  const requestUpdate = await admin.from("instructor_replacement_requests").update({
    status: "confirmed",
    score: candidate.score,
    confidence: candidate.confidence,
    reasons_json: candidate.reasons,
    source_data_json: { blockers: [], workload_after: candidate.workloadAfter, lesson_context: candidate.lessonContext, revalidated_at: now },
    human_confirmed_at: now,
    confirmed_by_user_id: userId
  }).eq("tenant_id", tenantId).eq("id", requestId).in("status", ["draft", "ready"]);
  if (requestUpdate.error) redirect(`${path}?session=${requestData.session_id}&error=assignment`);
  if (requestData.absence_id) {
    await admin.from("instructor_absences").update({
      status: "covered",
      covered_by_user_id: requestData.replacement_instructor_user_id,
      covered_at: now
    }).eq("tenant_id", tenantId).eq("id", requestData.absence_id);
  }
  await admin.from("instructor_replacement_requests").update({ status: "superseded" }).eq("tenant_id", tenantId).eq("session_id", requestData.session_id).neq("id", requestId).in("status", ["draft", "ready"]);
  await admin.from("instructor_replacement_events").insert({
    tenant_id: tenantId,
    request_id: requestId,
    event_type: "confirmed",
    actor_user_id: userId,
    message: "Vervanger na actuele kwalificatie-, beschikbaarheids-, conflict- en belastingcontrole handmatig ingepland.",
    evidence_json: { score: candidate.score, confidence: candidate.confidence, reasons: candidate.reasons, human_confirmation: true }
  });
  refresh();
  redirect(`${path}?session=${requestData.session_id}&saved=confirmed`);
}

async function requireReplacementAdmin() {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role))) redirect("/admin?error=forbidden");
  return { tenantId: tenant.id, userId: context.user.id };
}

function refresh() {
  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/admin/agenda");
  revalidatePath("/instructor");
  revalidatePath("/instructor/agenda");
}

function readUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readOptionalUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  if (!uuidPattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readText(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function readOptionalText(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function readOptionalDate(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readInteger(formData: FormData, name: string, min: number, max: number) {
  const value = Number.parseInt(String(formData.get(name) ?? ""), 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is invalid.`);
  return value;
}

function readEnum<const T extends readonly string[]>(formData: FormData, name: string, allowed: T): T[number] {
  const value = formData.get(name);
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`${name} is invalid.`);
  return value as T[number];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
