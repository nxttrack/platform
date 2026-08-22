import { toAmsterdamDate } from "../date/business-date";
import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  detectParticipantAttentionSignals,
  type ParticipantEngagementInput
} from "./retention-signals-contract";

export type ParticipantAttentionView = {
  id: string;
  participantId: string;
  participantName: string;
  enrollmentId: string | null;
  signalType: string;
  attentionLevel: "observe" | "contact_suggested" | "priority_contact";
  confidence: number;
  title: string;
  summary: string;
  reasons: string[];
  sourceData: Record<string, unknown>;
  recommendedAction: string;
  status: string;
  lastObservedAt: string;
  expiresAt: string;
  taskCreated: boolean;
};

export async function getParticipantAttentionData(tenantId: string) {
  const admin = createAdminClient();
  const [signalsResult, enrollmentsResult] = await Promise.all([
    admin.from("participant_attention_signals")
      .select("id, participant_id, enrollment_id, signal_type, attention_level, confidence, title, summary, reasons_json, source_data_json, recommended_action, status, last_observed_at, expires_at")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .in("status", ["open", "reviewed", "resolved"])
      .order("last_observed_at", { ascending: false })
      .limit(200),
    admin.from("enrollments").select("id, participant_id, status, is_test").eq("tenant_id", tenantId).eq("is_test", false).in("status", ["active", "paused"])
  ]);
  assertResult(signalsResult.error, "participant attention signals");
  assertResult(enrollmentsResult.error, "attention enrollments");
  const signals = signalsResult.data ?? [];
  const participantIds = [...new Set([...signals.map((signal) => signal.participant_id), ...(enrollmentsResult.data ?? []).map((enrollment) => enrollment.participant_id)])];
  const signalIds = signals.map((signal) => signal.id);
  const [participantsResult, tasksResult] = await Promise.all([
    participantIds.length
      ? admin.from("participants").select("id, display_name").eq("tenant_id", tenantId).in("id", participantIds)
      : Promise.resolve(emptyResult()),
    signalIds.length
      ? admin.from("tenant_tasks").select("participant_attention_signal_id, status").eq("tenant_id", tenantId).in("participant_attention_signal_id", signalIds).in("status", ["open", "in_progress"])
      : Promise.resolve(emptyResult())
  ]);
  assertResult(participantsResult.error, "attention participants");
  assertResult(tasksResult.error, "attention tasks");
  const names = new Map((participantsResult.data ?? []).map((row) => [row.id, row.display_name]));
  const taskSignals = new Set((tasksResult.data ?? []).map((row) => row.participant_attention_signal_id));
  const views: ParticipantAttentionView[] = signals.map((signal) => ({
    id: signal.id,
    participantId: signal.participant_id,
    participantName: names.get(signal.participant_id) ?? "Leerling",
    enrollmentId: signal.enrollment_id,
    signalType: signal.signal_type,
    attentionLevel: signal.attention_level as ParticipantAttentionView["attentionLevel"],
    confidence: Number(signal.confidence),
    title: signal.title,
    summary: signal.summary,
    reasons: toStringArray(signal.reasons_json),
    sourceData: toObject(signal.source_data_json),
    recommendedAction: signal.recommended_action,
    status: signal.status,
    lastObservedAt: signal.last_observed_at,
    expiresAt: signal.expires_at,
    taskCreated: taskSignals.has(signal.id)
  }));
  const open = views.filter((signal) => ["open", "reviewed"].includes(signal.status));
  return {
    signals: views,
    enrollments: (enrollmentsResult.data ?? []).map((enrollment) => ({
      id: enrollment.id,
      participantId: enrollment.participant_id,
      participantName: names.get(enrollment.participant_id) ?? "Leerling",
      status: enrollment.status
    })).sort((left, right) => left.participantName.localeCompare(right.participantName)),
    metrics: {
      open: open.length,
      priority: open.filter((signal) => signal.attentionLevel === "priority_contact").length,
      contact: open.filter((signal) => signal.attentionLevel === "contact_suggested").length,
      observedParticipants: new Set(open.map((signal) => signal.participantId)).size,
      tasks: open.filter((signal) => signal.taskCreated).length
    }
  };
}

export async function refreshParticipantAttentionSignals(tenantId: string) {
  const admin = createAdminClient();
  const now = new Date();
  const since = new Date(now.getTime() - 120 * 86_400_000);
  const cancellationSince = new Date(now.getTime() - 60 * 86_400_000);
  const [
    enrollmentsResult,
    participantsResult,
    attendanceResult,
    progressResult,
    paymentsResult,
    threadsResult,
    pausesResult,
    cancellationsResult
  ] = await Promise.all([
    admin.from("enrollments").select("id, participant_id, status, is_test").eq("tenant_id", tenantId).eq("is_test", false).in("status", ["active", "paused"]),
    admin.from("participants").select("id, display_name, is_test").eq("tenant_id", tenantId).eq("is_test", false).eq("status", "active"),
    admin.from("session_attendance").select("participant_id, status, marked_at").eq("tenant_id", tenantId).gte("marked_at", since.toISOString()).order("marked_at", { ascending: false }),
    admin.from("participant_progress_scores").select("participant_id, scored_at, status").eq("tenant_id", tenantId).eq("status", "active").order("scored_at", { ascending: false }),
    admin.from("manual_payments").select("participant_id, amount_cents, status, due_on").eq("tenant_id", tenantId).in("status", ["due", "overdue"]),
    admin.from("message_threads").select("id, participant_id, status, is_test").eq("tenant_id", tenantId).eq("is_test", false).eq("status", "waiting_for_school"),
    admin.from("enrollment_pause_periods").select("enrollment_id, participant_id, expected_return_on, status").eq("tenant_id", tenantId).in("status", ["planned", "active"]),
    admin.from("lesson_cancellations").select("participant_id, requested_at, status").eq("tenant_id", tenantId).in("status", ["accepted", "late_cancelled"]).gte("requested_at", cancellationSince.toISOString())
  ]);
  for (const [label, result] of [
    ["enrollments", enrollmentsResult], ["participants", participantsResult], ["attendance", attendanceResult],
    ["progress", progressResult], ["payments", paymentsResult], ["parent questions", threadsResult],
    ["pauses", pausesResult], ["cancellations", cancellationsResult]
  ] as const) assertResult(result.error, `attention ${label}`);

  const participants = new Map((participantsResult.data ?? []).map((row) => [row.id, row]));
  const enrollments = new Map((enrollmentsResult.data ?? []).map((row) => [row.participant_id, row]));
  const attendance = groupBy(attendanceResult.data ?? [], (row) => row.participant_id);
  const progress = groupBy(progressResult.data ?? [], (row) => row.participant_id);
  const payments = groupBy(paymentsResult.data ?? [], (row) => row.participant_id);
  const threads = groupBy((threadsResult.data ?? []).filter((row) => row.participant_id), (row) => row.participant_id as string);
  const pauses = new Map((pausesResult.data ?? []).map((row) => [row.participant_id, row]));
  const cancellations = groupBy(cancellationsResult.data ?? [], (row) => row.participant_id);
  const activeKeys = new Set<string>();
  let generated = 0;

  for (const [participantId, participant] of participants) {
    const enrollment = enrollments.get(participantId);
    if (!enrollment) continue;
    const attendanceRows = attendance.get(participantId) ?? [];
    const progressRows = progress.get(participantId) ?? [];
    const latestProgress = progressRows[0]?.scored_at ?? null;
    const engagement: ParticipantEngagementInput = {
      participantId,
      participantName: participant.display_name,
      enrollmentId: enrollment.id,
      recentAttendance: attendanceRows.slice(0, 8).map((row) => row.status as ParticipantEngagementInput["recentAttendance"][number]),
      previousAttendance: attendanceRows.slice(8, 16).map((row) => row.status as ParticipantEngagementInput["previousAttendance"][number]),
      daysSinceProgress: latestProgress ? Math.floor((now.getTime() - new Date(latestProgress).getTime()) / 86_400_000) : null,
      overdueAmountCents: (payments.get(participantId) ?? []).filter((row) => row.status === "overdue" || row.due_on < toAmsterdamDate(now)).reduce((sum, row) => sum + row.amount_cents, 0),
      openParentQuestions: (threads.get(participantId) ?? []).length,
      pauseExpectedReturnOn: pauses.get(participantId)?.expected_return_on ?? null,
      cancellationsLast60Days: (cancellations.get(participantId) ?? []).length,
      isTest: participant.is_test || enrollment.is_test
    };
    for (const signal of detectParticipantAttentionSignals(engagement, now)) {
      const fingerprint = createHash("sha256").update(JSON.stringify(signal.sourceData)).digest("hex");
      const key = `${participantId}:${signal.type}:${fingerprint}`;
      activeKeys.add(key);
      const existing = await admin.from("participant_attention_signals").select("id, status").eq("tenant_id", tenantId).eq("participant_id", participantId).eq("signal_type", signal.type).eq("source_fingerprint", fingerprint).maybeSingle();
      assertResult(existing.error, "existing attention signal");
      if (existing.data) {
        const update = await admin.from("participant_attention_signals").update({
          attention_level: signal.attentionLevel,
          confidence: signal.confidence,
          title: signal.title,
          summary: signal.summary,
          reasons_json: signal.reasons,
          source_data_json: signal.sourceData,
          recommended_action: signal.recommendedAction,
          last_observed_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
          ...(existing.data.status === "expired" ? { status: "open", reviewed_by_user_id: null, reviewed_at: null, review_note: null } : {})
        }).eq("tenant_id", tenantId).eq("id", existing.data.id);
        assertResult(update.error, "attention signal refresh");
      } else {
        const insert = await admin.from("participant_attention_signals").insert({
          tenant_id: tenantId,
          participant_id: participantId,
          enrollment_id: enrollment.id,
          signal_type: signal.type,
          attention_level: signal.attentionLevel,
          confidence: signal.confidence,
          title: signal.title,
          summary: signal.summary,
          reasons_json: signal.reasons,
          source_data_json: signal.sourceData,
          recommended_action: signal.recommendedAction,
          source_fingerprint: fingerprint,
          status: "open",
          first_observed_at: now.toISOString(),
          last_observed_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
          is_test: false,
          journey_run_id: null
        }).select("id").single();
        assertResult(insert.error, "attention signal insert");
        await admin.from("participant_attention_events").insert({
          tenant_id: tenantId,
          signal_id: insert.data.id,
          event_type: "generated",
          note: "Uitlegbaar persoonlijk-aandachtssignaal gegenereerd; geen contact of nadelige actie uitgevoerd."
        });
        generated += 1;
      }
    }
  }

  const openResult = await admin.from("participant_attention_signals").select("id, participant_id, signal_type, source_fingerprint").eq("tenant_id", tenantId).eq("status", "open").eq("is_test", false);
  assertResult(openResult.error, "open attention signals");
  for (const signal of openResult.data ?? []) {
    if (activeKeys.has(`${signal.participant_id}:${signal.signal_type}:${signal.source_fingerprint}`)) continue;
    await admin.from("participant_attention_signals").update({ status: "expired" }).eq("tenant_id", tenantId).eq("id", signal.id);
    await admin.from("participant_attention_events").insert({ tenant_id: tenantId, signal_id: signal.id, event_type: "expired", note: "Bronsituatie is niet langer actief." });
  }
  return generated;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function toObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function emptyResult() {
  return { data: [], error: null };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
