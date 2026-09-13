"use server";

import { addAmsterdamCalendarDays, toAmsterdamDate } from "../date/business-date";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { refreshParticipantAttentionSignals } from "./retention-signals";

const path = "/admin/aandacht";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function refreshParticipantAttentionSignalsAction() {
  const { tenantId } = await requireAttentionAdmin();
  let count: number;
  try {
    count = await refreshParticipantAttentionSignals(tenantId);
  } catch {
    redirect(`${path}?error=refresh`);
  }
  refresh();
  redirect(`${path}?saved=refreshed_${count}`);
}

export async function createAttentionContactTaskAction(formData: FormData) {
  const { tenantId, userId } = await requireAttentionAdmin();
  const signalId = readUuid(formData, "signalId");
  if (formData.get("humanConfirmation") !== "confirmed") redirect(`${path}?error=confirmation`);
  const admin = createAdminClient();
  const signal = await admin.from("participant_attention_signals").select("id, participant_id, title, recommended_action, status, is_test").eq("tenant_id", tenantId).eq("id", signalId).maybeSingle();
  if (signal.error || !signal.data || signal.data.is_test || !["open", "reviewed"].includes(signal.data.status)) redirect(`${path}?error=signal`);
  const existing = await admin.from("tenant_tasks").select("id").eq("tenant_id", tenantId).eq("participant_attention_signal_id", signalId).in("status", ["open", "in_progress"]).maybeSingle();
  if (existing.error) redirect(`${path}?error=task`);
  if (!existing.data) {
    const task = await admin.from("tenant_tasks").insert({
      tenant_id: tenantId,
      created_by_user_id: userId,
      related_participant_id: signal.data.participant_id,
      participant_attention_signal_id: signalId,
      title: signal.data.title,
      description: `${signal.data.recommended_action}\n\nBekijk altijd de volledige context. Er is geen bericht verstuurd en geen klant- of inschrijfstatus gewijzigd.`,
      priority: "high",
      status: "open",
      due_on: addAmsterdamCalendarDays(new Date(), 2),
      is_test: false,
      journey_run_id: null
    });
    if (task.error) redirect(`${path}?error=task`);
  }
  const now = new Date().toISOString();
  await admin.from("participant_attention_signals").update({ status: "reviewed", reviewed_by_user_id: userId, reviewed_at: now }).eq("tenant_id", tenantId).eq("id", signalId);
  await admin.from("participant_attention_events").insert({ tenant_id: tenantId, signal_id: signalId, event_type: "contact_task_created", actor_user_id: userId, note: "Interne taak voor persoonlijke opvolging aangemaakt; niets verzonden." });
  refresh();
  redirect(`${path}?saved=task`);
}

export async function resolveParticipantAttentionSignalAction(formData: FormData) {
  const { tenantId, userId } = await requireAttentionAdmin();
  const signalId = readUuid(formData, "signalId");
  const decision = readEnum(formData, "decision", ["resolved", "dismissed"] as const);
  if (formData.get("humanConfirmation") !== decision) redirect(`${path}?error=confirmation`);
  const note = readOptionalText(formData, "reviewNote", 1000);
  const admin = createAdminClient();
  const result = await admin.from("participant_attention_signals").update({
    status: decision,
    reviewed_by_user_id: userId,
    reviewed_at: new Date().toISOString(),
    review_note: note
  }).eq("tenant_id", tenantId).eq("id", signalId).in("status", ["open", "reviewed"]);
  if (result.error) redirect(`${path}?error=resolve`);
  await admin.from("participant_attention_events").insert({ tenant_id: tenantId, signal_id: signalId, event_type: decision, actor_user_id: userId, note });
  refresh();
  redirect(`${path}?saved=${decision}`);
}

export async function saveEnrollmentPauseAction(formData: FormData) {
  const { tenantId, userId } = await requireAttentionAdmin();
  const enrollmentId = readUuid(formData, "enrollmentId");
  const admin = createAdminClient();
  const enrollment = await admin.from("enrollments").select("participant_id").eq("tenant_id", tenantId).eq("id", enrollmentId).maybeSingle();
  if (enrollment.error || !enrollment.data) redirect(`${path}?error=enrollment`);
  const startsOn = readDate(formData, "startsOn");
  const expectedReturnOn = readOptionalDate(formData, "expectedReturnOn");
  if (expectedReturnOn && expectedReturnOn < startsOn) redirect(`${path}?error=pause_dates`);
  const result = await admin.from("enrollment_pause_periods").insert({
    tenant_id: tenantId,
    enrollment_id: enrollmentId,
    participant_id: enrollment.data.participant_id,
    starts_on: startsOn,
    expected_return_on: expectedReturnOn,
    reason_category: readEnum(formData, "reasonCategory", ["medical", "holiday", "schedule", "financial", "family", "other"] as const),
    status: startsOn <= toAmsterdamDate() ? "active" : "planned",
    internal_note: readOptionalText(formData, "internalNote", 1000),
    created_by_user_id: userId
  });
  if (result.error) redirect(`${path}?error=pause`);
  refresh();
  redirect(`${path}?saved=pause`);
}

async function requireAttentionAdmin() {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role))) redirect("/admin?error=forbidden");
  return { tenantId: tenant.id, userId: context.user.id };
}

function refresh() {
  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/admin/taken");
}

function readUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readOptionalText(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function readDate(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readOptionalDate(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readEnum<const T extends readonly string[]>(formData: FormData, name: string, allowed: T): T[number] {
  const value = formData.get(name);
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) throw new Error(`${name} is invalid.`);
  return value as T[number];
}
