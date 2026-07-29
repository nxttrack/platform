import "server-only";

import { createHash } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  prioritizeOperationalSignals,
  type OperationalSignal,
  type OperationalSignalPriority,
  type OperationalSignalState
} from "./operational-cockpit-contract";

export type DailyCockpitData = {
  signals: ReturnType<typeof prioritizeOperationalSignals>;
  metrics: {
    now: number;
    today: number;
    thisWeek: number;
    critical: number;
    acknowledged: number;
  };
  generatedAt: string;
};

export async function getDailyOperationalCockpit(tenantId: string): Promise<DailyCockpitData> {
  const admin = createAdminClient();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3_600_000);
  const inThreeDays = new Date(now.getTime() + 72 * 3_600_000);
  const inSevenDays = new Date(now.getTime() + 7 * 86_400_000);
  const activeStages = ["new", "contacted", "trial", "waitlist", "offer"];

  const [
    crmResult,
    sessionsResult,
    emptySeatsResult,
    offersResult,
    paymentsResult,
    threadsResult,
    mediaResult,
    automationResult,
    attentionResult,
    statesResult
  ] = await Promise.all([
    admin.from("intake_submissions")
      .select("id, participant_name, parent_name, crm_stage, crm_priority, next_follow_up_at, sla_due_at, stage_changed_at, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .is("merged_into_intake_id", null)
      .in("crm_stage", activeStages)
      .or(`next_follow_up_at.lte.${inThreeDays.toISOString()},sla_due_at.lte.${inThreeDays.toISOString()}`)
      .limit(80),
    admin.from("sessions")
      .select("id, group_id, starts_at, ends_at, status, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .gte("ends_at", yesterday.toISOString())
      .lte("starts_at", inThreeDays.toISOString())
      .in("status", ["scheduled", "completed"])
      .order("starts_at")
      .limit(160),
    admin.from("empty_seat_recovery_snapshots")
      .select("id, group_id, available_seats, actionable_candidate_count, recovery_band, confidence, summary, source_fingerprint, expires_at, status")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .in("status", ["open", "reviewed"])
      .gt("expires_at", now.toISOString())
      .order("generated_at", { ascending: false })
      .limit(40),
    admin.from("slot_offers")
      .select("id, waitlist_entry_id, expires_at, status, delivery_status, waitlist_entries!inner(participant_name, is_test)")
      .eq("tenant_id", tenantId)
      .eq("waitlist_entries.is_test", false)
      .in("status", ["draft", "sent"])
      .lte("expires_at", inThreeDays.toISOString())
      .order("expires_at")
      .limit(40),
    admin.from("billing_collection_attempts")
      .select("id, manual_payment_id, status, failure_code, failure_message, completed_at, attempt_number")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .gte("completed_at", inSevenDaysAgo(now).toISOString())
      .order("completed_at", { ascending: false })
      .limit(40),
    admin.from("message_threads")
      .select("id, subject, thread_type, status, last_message_at, updated_at, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .in("status", ["waiting_for_school", "open", "assigned"])
      .order("last_message_at", { ascending: false })
      .limit(60),
    admin.from("participant_media")
      .select("id, participant_id, file_name, expires_at, status")
      .eq("tenant_id", tenantId)
      .eq("status", "published")
      .gt("expires_at", now.toISOString())
      .lte("expires_at", inSevenDays.toISOString())
      .order("expires_at")
      .limit(40),
    admin.from("automation_recipe_runs")
      .select("id, recipe_key, error_code, reasons_json, completed_at, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .eq("status", "failed")
      .gte("completed_at", yesterday.toISOString())
      .order("completed_at", { ascending: false })
      .limit(40),
    admin.from("participant_attention_signals")
      .select("id, participant_id, attention_level, title, summary, reasons_json, recommended_action, source_fingerprint, expires_at, status, is_test")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .in("status", ["open", "reviewed"])
      .gt("expires_at", now.toISOString())
      .order("last_observed_at", { ascending: false })
      .limit(40),
    admin.from("operational_signal_states")
      .select("id, signal_key, source_fingerprint, status, snoozed_until, assigned_to_user_id")
      .eq("tenant_id", tenantId)
      .limit(500)
  ]);

  for (const [label, result] of [
    ["CRM follow-up", crmResult],
    ["sessions", sessionsResult],
    ["empty seats", emptySeatsResult],
    ["slot offers", offersResult],
    ["payment attempts", paymentsResult],
    ["parent questions", threadsResult],
    ["expiring media", mediaResult],
    ["automation failures", automationResult],
    ["attention signals", attentionResult],
    ["signal states", statesResult]
  ] as const) assertResult(result.error, label);

  const sessions = sessionsResult.data ?? [];
  const sessionIds = sessions.map((row) => row.id);
  const groupIds = [...new Set(sessions.map((row) => row.group_id))];
  const [
    groupsResult,
    sessionInstructorsResult,
    groupInstructorsResult,
    attendanceResult,
    participantsResult
  ] = await Promise.all([
    groupIds.length
      ? admin.from("groups").select("id, name").eq("tenant_id", tenantId).in("id", groupIds)
      : Promise.resolve(emptyResult()),
    sessionIds.length
      ? admin.from("session_instructor_assignments").select("session_id, status").eq("tenant_id", tenantId).in("session_id", sessionIds).eq("status", "active")
      : Promise.resolve(emptyResult()),
    groupIds.length
      ? admin.from("group_instructor_assignments").select("group_id, status, starts_on, ends_on").eq("tenant_id", tenantId).in("group_id", groupIds).eq("status", "active")
      : Promise.resolve(emptyResult()),
    sessionIds.length
      ? admin.from("session_attendance").select("session_id").eq("tenant_id", tenantId).in("session_id", sessionIds)
      : Promise.resolve(emptyResult()),
    (mediaResult.data ?? []).length || (attentionResult.data ?? []).length
      ? admin.from("participants").select("id, display_name").eq("tenant_id", tenantId).in("id", [...new Set([
          ...(mediaResult.data ?? []).map((row) => row.participant_id),
          ...(attentionResult.data ?? []).map((row) => row.participant_id)
        ])])
      : Promise.resolve(emptyResult())
  ]);
  for (const [label, result] of [
    ["groups", groupsResult],
    ["session instructors", sessionInstructorsResult],
    ["group instructors", groupInstructorsResult],
    ["attendance", attendanceResult],
    ["media participants", participantsResult]
  ] as const) assertResult(result.error, label);

  const groupNames = new Map((groupsResult.data ?? []).map((row) => [row.id, row.name]));
  const directInstructorSessions = new Set((sessionInstructorsResult.data ?? []).map((row) => row.session_id));
  const groupInstructorRows = groupBy(groupInstructorsResult.data ?? [], (row) => row.group_id);
  const attendanceSessions = new Set((attendanceResult.data ?? []).map((row) => row.session_id));
  const participantNames = new Map((participantsResult.data ?? []).map((row) => [row.id, row.display_name]));
  const signals: OperationalSignal[] = [];

  for (const lead of crmResult.data ?? []) {
    const dueAt = earliestDate(lead.next_follow_up_at, lead.sla_due_at);
    const overdue = !!dueAt && new Date(dueAt) <= now;
    signals.push(createSignal({
      key: `crm:${lead.id}`,
      type: "crm_follow_up",
      entityType: "intake",
      entityId: lead.id,
      title: `Opvolging voor ${lead.parent_name}`,
      summary: `${lead.participant_name} staat in CRM-fase ${crmStageLabel(lead.crm_stage)}.`,
      evidence: [
        lead.next_follow_up_at ? `Volgende opvolging: ${formatDateTime(lead.next_follow_up_at)}` : "Geen concrete opvolgdatum",
        lead.sla_due_at ? `SLA: ${formatDateTime(lead.sla_due_at)}` : "Geen SLA-deadline",
        "Geen bericht wordt automatisch verzonden"
      ],
      priority: overdue || lead.crm_priority === "urgent" ? "high" : lead.crm_priority === "high" ? "high" : "medium",
      dueAt,
      href: `/admin/crm?lead=${lead.id}`,
      actionLabel: "Open CRM-dossier"
    }));
  }

  for (const session of sessions) {
    const sessionDate = session.starts_at.slice(0, 10);
    const hasGroupInstructor = (groupInstructorRows.get(session.group_id) ?? []).some((assignment) =>
      (!assignment.starts_on || assignment.starts_on <= sessionDate)
      && (!assignment.ends_on || assignment.ends_on >= sessionDate)
    );
    const groupName = groupNames.get(session.group_id) ?? "Onbekende groep";
    if (new Date(session.starts_at) > now && !directInstructorSessions.has(session.id) && !hasGroupInstructor) {
      signals.push(createSignal({
        key: `instructor:${session.id}`,
        type: "session_without_instructor",
        entityType: "session",
        entityId: session.id,
        title: `${groupName} heeft nog geen instructeur`,
        summary: `De les start ${relativeTime(session.starts_at, now)} en vraagt een bewuste roosterkeuze.`,
        evidence: ["Geen actieve sessiekoppeling", "Geen geldige actieve groepskoppeling", formatDateTime(session.starts_at)],
        priority: hoursUntil(session.starts_at, now) <= 24 ? "critical" : "high",
        dueAt: session.starts_at,
        href: `/admin/vervanging?session=${session.id}`,
        actionLabel: "Zoek vervanger"
      }));
    }
    if (new Date(session.ends_at) < now && !attendanceSessions.has(session.id)) {
      signals.push(createSignal({
        key: `attendance:${session.id}`,
        type: "missing_attendance",
        entityType: "session",
        entityId: session.id,
        title: `Aanwezigheid ontbreekt voor ${groupName}`,
        summary: "De les is voorbij, maar er is nog geen enkele aanwezigheidsregistratie.",
        evidence: [formatDateTime(session.ends_at), `Sessiestatus: ${session.status}`, "0 registraties gevonden"],
        priority: hoursUntil(session.ends_at, now) < -12 ? "high" : "medium",
        dueAt: session.ends_at,
        href: `/admin/groepen?group=${session.group_id}`,
        actionLabel: "Controleer les"
      }));
    }
  }

  for (const snapshot of emptySeatsResult.data ?? []) {
    signals.push(createSignal({
      key: `empty-seat:${snapshot.id}`,
      type: "empty_seat",
      entityType: "recovery_snapshot",
      entityId: snapshot.id,
      title: `${snapshot.available_seats} ${snapshot.available_seats === 1 ? "vrije plek" : "vrije plekken"} herstelbaar`,
      summary: snapshot.summary,
      evidence: [
        `${snapshot.actionable_candidate_count} kandidaten zonder blocker`,
        `${Math.round(Number(snapshot.confidence) * 100)}% confidence`,
        `Herstelband: ${snapshot.recovery_band}`
      ],
      priority: snapshot.recovery_band === "within_24h" ? "high" : "medium",
      dueAt: snapshot.expires_at,
      href: "/admin/plekherstel",
      actionLabel: "Beoordeel matches",
      fingerprint: snapshot.source_fingerprint
    }));
  }

  for (const offer of offersResult.data ?? []) {
    const waitlist = normalizeEmbedded(offer.waitlist_entries);
    signals.push(createSignal({
      key: `offer:${offer.id}`,
      type: "expiring_offer",
      entityType: "slot_offer",
      entityId: offer.id,
      title: `Aanbod voor ${waitlist?.participant_name ?? "wachtlijstkandidaat"} verloopt bijna`,
      summary: "Controleer de reactie en bepaal handmatig of opvolging passend is.",
      evidence: [`Verloopt ${relativeTime(offer.expires_at, now)}`, `Status: ${offer.status}`, `Bezorging: ${offer.delivery_status}`],
      priority: hoursUntil(offer.expires_at, now) <= 24 ? "high" : "medium",
      dueAt: offer.expires_at,
      href: `/admin/wachtlijst?offer=${offer.id}`,
      actionLabel: "Open aanbod"
    }));
  }

  for (const attempt of paymentsResult.data ?? []) {
    signals.push(createSignal({
      key: `payment:${attempt.id}`,
      type: "failed_payment",
      entityType: "payment_attempt",
      entityId: attempt.id,
      title: `Incassopoging ${attempt.attempt_number} is mislukt`,
      summary: "Controleer de betaalstatus en kies bewust een passende opvolgactie.",
      evidence: [
        attempt.failure_code ? `Code: ${attempt.failure_code}` : "Geen providercode",
        attempt.failure_message ?? "Geen providertekst",
        attempt.completed_at ? formatDateTime(attempt.completed_at) : "Afrondtijd onbekend"
      ],
      priority: "high",
      dueAt: attempt.completed_at,
      href: `/admin/betalingen?attempt=${attempt.id}`,
      actionLabel: "Open betaling"
    }));
  }

  for (const thread of threadsResult.data ?? []) {
    if (thread.status !== "waiting_for_school") continue;
    signals.push(createSignal({
      key: `question:${thread.id}`,
      type: "parent_question",
      entityType: "message_thread",
      entityId: thread.id,
      title: thread.subject,
      summary: "Een ouder wacht op een antwoord van de zwemschool.",
      evidence: [`Type: ${thread.thread_type}`, `Status: ${thread.status}`, `Laatste bericht: ${formatDateTime(thread.last_message_at ?? thread.updated_at)}`],
      priority: hoursUntil(thread.last_message_at ?? thread.updated_at, now) < -24 ? "high" : "medium",
      dueAt: addHours(thread.last_message_at ?? thread.updated_at, 24),
      href: `/admin/berichten?thread=${thread.id}`,
      actionLabel: "Open gesprek"
    }));
  }

  for (const media of mediaResult.data ?? []) {
    signals.push(createSignal({
      key: `media:${media.id}`,
      type: "expiring_media",
      entityType: "participant_media",
      entityId: media.id,
      title: `Media van ${participantNames.get(media.participant_id) ?? "leerling"} verloopt binnenkort`,
      summary: "Controleer bewaartermijn en consentstatus; verleng niet automatisch.",
      evidence: [`Bestand: ${media.file_name}`, `Vervalt ${formatDateTime(media.expires_at)}`, "Status: gepubliceerd"],
      priority: hoursUntil(media.expires_at, now) <= 48 ? "high" : "low",
      dueAt: media.expires_at,
      href: `/admin/leerlingen?participant=${media.participant_id}`,
      actionLabel: "Open media"
    }));
  }

  for (const run of automationResult.data ?? []) {
    signals.push(createSignal({
      key: `automation:${run.id}`,
      type: "automation_failure",
      entityType: "automation_run",
      entityId: run.id,
      title: `Automation recipe “${run.recipe_key}” faalde`,
      summary: "De run heeft geen stille vervolgactie uitgevoerd en vraagt technische controle.",
      evidence: [run.error_code ? `Foutcode: ${run.error_code}` : "Geen foutcode", ...toStringArray(run.reasons_json).slice(0, 2)],
      priority: "critical",
      dueAt: run.completed_at,
      href: "/admin/automatisering",
      actionLabel: "Open runlog"
    }));
  }

  for (const attention of attentionResult.data ?? []) {
    signals.push(createSignal({
      key: `attention:${attention.id}`,
      type: "retention_risk",
      entityType: "participant",
      entityId: attention.participant_id,
      title: attention.title,
      summary: attention.summary,
      evidence: [...toStringArray(attention.reasons_json).slice(0, 3), attention.recommended_action],
      priority: attention.attention_level === "priority_contact" ? "high" : attention.attention_level === "contact_suggested" ? "medium" : "low",
      dueAt: attention.expires_at,
      href: "/admin/aandacht",
      actionLabel: `Open aandacht voor ${participantNames.get(attention.participant_id) ?? "leerling"}`,
      fingerprint: attention.source_fingerprint
    }));
  }

  const states: OperationalSignalState[] = (statesResult.data ?? []).map((state) => ({
    id: state.id,
    signalKey: state.signal_key,
    sourceFingerprint: state.source_fingerprint,
    status: state.status as OperationalSignalState["status"],
    snoozedUntil: state.snoozed_until,
    assignedToUserId: state.assigned_to_user_id
  }));
  const prioritized = prioritizeOperationalSignals({ signals, states, now });
  return {
    signals: prioritized,
    metrics: {
      now: prioritized.filter((signal) => signal.window === "now").length,
      today: prioritized.filter((signal) => signal.window === "today").length,
      thisWeek: prioritized.filter((signal) => signal.window === "this_week").length,
      critical: prioritized.filter((signal) => signal.priority === "critical").length,
      acknowledged: prioritized.filter((signal) => signal.stateStatus === "acknowledged").length
    },
    generatedAt: now.toISOString()
  };
}

function createSignal(input: Omit<OperationalSignal, "fingerprint"> & { fingerprint?: string }): OperationalSignal {
  return {
    ...input,
    fingerprint: input.fingerprint ?? createHash("sha256").update(JSON.stringify([
      input.type,
      input.entityId,
      input.title,
      input.summary,
      input.evidence,
      input.dueAt
    ])).digest("hex")
  };
}

function earliestDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return new Date(left) <= new Date(right) ? left : right;
}

function inSevenDaysAgo(now: Date) {
  return new Date(now.getTime() - 7 * 86_400_000);
}

function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 3_600_000).toISOString();
}

function hoursUntil(value: string, now: Date) {
  return (new Date(value).getTime() - now.getTime()) / 3_600_000;
}

function relativeTime(value: string, now: Date) {
  const hours = hoursUntil(value, now);
  if (hours < -1) return `${Math.abs(Math.round(hours))} uur geleden`;
  if (hours <= 1) return "binnen een uur";
  if (hours <= 48) return `over ${Math.round(hours)} uur`;
  return `over ${Math.round(hours / 24)} dagen`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam"
  }).format(new Date(value));
}

function crmStageLabel(value: string) {
  return ({
    new: "Nieuw",
    contacted: "Contact opgenomen",
    trial: "Proefles",
    waitlist: "Wachtlijst",
    offer: "Aanbod"
  } as Record<string, string>)[value] ?? value;
}

function normalizeEmbedded<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function emptyResult() {
  return { data: [], error: null };
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
