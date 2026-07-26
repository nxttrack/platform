import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { detectCrmFollowUpCandidates } from "./crm-follow-up-contract";
import { calculateLeadScoresForIntakes } from "./lead-scoring";

export type CrmFollowUpRow = {
  id: string;
  intake_submission_id: string | null;
  guardian_user_id: string | null;
  participant_id: string | null;
  signal_type: string;
  status: string;
  reason: string;
  evidence_json: string[];
  suggested_action: string;
  draft_subject: string | null;
  draft_body: string | null;
  last_contacted_at: string | null;
  created_at: string;
  parentName: string;
  participantName: string;
  parentEmail: string;
  parentPhone: string;
  leadScoreBand: string;
};

export async function generateCrmFollowUpItems(tenantId: string) {
  const admin = createAdminClient();
  const [intakesResult, waitlistResult, lineageResult, existingResult] = await Promise.all([
    admin
      .from("intake_submissions")
      .select("id, selected_option, parent_name, parent_email, parent_phone, participant_name, status, received_at, is_test, journey_run_id, test_metadata_json")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .neq("status", "closed"),
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, guardian_user_id, participant_id")
      .eq("tenant_id", tenantId)
      .eq("is_test", false),
    admin
      .from("intake_conversion_lineage")
      .select("intake_submission_id, guardian_user_id, participant_id, enrollment_id")
      .eq("tenant_id", tenantId)
      .eq("is_test", false),
    admin
      .from("crm_follow_up_items")
      .select("intake_submission_id, completed_at, last_contacted_at, status")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
  ]);
  for (const [label, result] of [
    ["CRM intakes", intakesResult],
    ["CRM waitlist", waitlistResult],
    ["CRM lineage", lineageResult],
    ["CRM existing items", existingResult]
  ] as const) assertCrmResult(result.error, label);

  const intakes = intakesResult.data ?? [];
  const intakeIds = intakes.map((intake) => intake.id);
  if (intakeIds.length === 0) return [];
  const scores = await calculateLeadScoresForIntakes({ tenantId, intakeSubmissionIds: intakeIds, persist: true });
  const waitlistByIntake = new Map((waitlistResult.data ?? []).flatMap((row) => row.intake_submission_id ? [[row.intake_submission_id, row] as const] : []));
  const lineageByIntake = new Map((lineageResult.data ?? []).map((row) => [row.intake_submission_id, row]));
  const waitlistIds = (waitlistResult.data ?? []).map((row) => row.id);
  const participantIds = (lineageResult.data ?? []).map((row) => row.participant_id);
  const enrollmentIds = (lineageResult.data ?? []).map((row) => row.enrollment_id);
  const [offersResult, attendanceResult, paymentsResult] = await Promise.all([
    waitlistIds.length
      ? admin
          .from("slot_offers")
          .select("id, waitlist_entry_id, status, offered_at, expires_at, responded_at")
          .eq("tenant_id", tenantId)
          .in("waitlist_entry_id", waitlistIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("session_attendance")
          .select("participant_id, status, marked_at")
          .eq("tenant_id", tenantId)
          .in("participant_id", participantIds)
          .eq("status", "trial")
      : Promise.resolve({ data: [], error: null }),
    enrollmentIds.length
      ? admin
          .from("manual_payments")
          .select("enrollment_id, status")
          .eq("tenant_id", tenantId)
          .in("enrollment_id", enrollmentIds)
          .in("status", ["due", "overdue"])
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const [label, result] of [
    ["CRM offers", offersResult],
    ["CRM trial attendance", attendanceResult],
    ["CRM payments", paymentsResult]
  ] as const) assertCrmResult(result.error, label);

  const offersByWaitlist = groupBy(offersResult.data ?? [], (row) => row.waitlist_entry_id);
  const existingByIntake = groupBy(
    (existingResult.data ?? []).filter((row) => row.intake_submission_id),
    (row) => row.intake_submission_id!
  );
  const now = new Date().toISOString();
  const candidates = detectCrmFollowUpCandidates({
    now,
    leads: intakes.map((intake) => {
      const score = scores.get(intake.id);
      const waitlist = waitlistByIntake.get(intake.id);
      const lineage = lineageByIntake.get(intake.id);
      const offers = waitlist ? offersByWaitlist.get(waitlist.id) ?? [] : [];
      const openOffer = offers
        .filter((offer) => offer.status === "sent" && !offer.responded_at && offer.expires_at > now)
        .sort((left, right) => left.expires_at.localeCompare(right.expires_at))[0] ?? null;
      const trial = lineage
        ? (attendanceResult.data ?? [])
            .filter((row) => row.participant_id === lineage.participant_id)
            .sort((left, right) => right.marked_at.localeCompare(left.marked_at))[0] ?? null
        : null;
      const existing = existingByIntake.get(intake.id) ?? [];
      const latestContactAt = existing
        .flatMap((item) => [item.last_contacted_at, item.completed_at].filter((value): value is string => !!value))
        .sort()
        .at(-1) ?? null;
      return {
        intakeId: intake.id,
        participantId: lineage?.participant_id ?? waitlist?.participant_id ?? null,
        guardianUserId: lineage?.guardian_user_id ?? waitlist?.guardian_user_id ?? null,
        participantName: intake.participant_name,
        parentName: intake.parent_name,
        status: intake.status,
        selectedOption: intake.selected_option,
        receivedAt: intake.received_at,
        leadScoreBand: score?.score_band ?? "waiting_for_information",
        placementAvailable: score?.reasons.some((reason) => reason.source === "smart_placement") ?? false,
        latestContactAt,
        openOffer: openOffer ? { id: openOffer.id, offeredAt: openOffer.offered_at, expiresAt: openOffer.expires_at } : null,
        trialCompletedAt: trial?.marked_at ?? null,
        hasFollowUpAfterTrial: !!trial && existing.some((item) => !!item.completed_at && item.completed_at > trial.marked_at),
        missingPayment: !!lineage && (paymentsResult.data ?? []).some((payment) => payment.enrollment_id === lineage.enrollment_id),
        isTest: false,
        journeyRunId: null
      };
    })
  });

  if (candidates.length > 0) {
    const persistResult = await admin
      .from("crm_follow_up_items")
      .upsert(
        candidates.map((candidate) => ({
          tenant_id: tenantId,
          intake_submission_id: candidate.intakeId,
          guardian_user_id: candidate.guardianUserId,
          participant_id: candidate.participantId,
          signal_type: candidate.signalType,
          fingerprint: candidate.fingerprint,
          status: "open",
          reason: candidate.reason,
          evidence_json: candidate.evidence,
          suggested_action: candidate.suggestedAction,
          draft_subject: candidate.draftSubject,
          draft_body: candidate.draftBody,
          human_review_required: true,
          content_classification: "personal",
          classification_reasons: ["crm_personal_draft", "human_review_required"],
          source: "crm_follow_up",
          is_test: false,
          journey_run_id: null,
          test_metadata_json: {}
        })),
        {
          onConflict: "tenant_id,fingerprint",
          ignoreDuplicates: true
        }
      );
    assertCrmResult(persistResult.error, "CRM follow-up suggestions");
  }

  return getCrmFollowUpItems(tenantId);
}

export async function getCrmFollowUpItems(tenantId: string): Promise<CrmFollowUpRow[]> {
  const admin = createAdminClient();
  const [itemsResult, intakesResult, scoresResult] = await Promise.all([
    admin
      .from("crm_follow_up_items")
      .select("id, intake_submission_id, guardian_user_id, participant_id, signal_type, status, reason, evidence_json, suggested_action, draft_subject, draft_body, last_contacted_at, created_at")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    admin
      .from("intake_submissions")
      .select("id, parent_name, parent_email, parent_phone, participant_name")
      .eq("tenant_id", tenantId)
      .eq("is_test", false),
    admin
      .from("lead_score_snapshots")
      .select("intake_submission_id, score_band")
      .eq("tenant_id", tenantId)
      .eq("is_test", false)
      .eq("model_version", "lead-score-v1")
  ]);
  for (const [label, result] of [
    ["CRM follow-up items", itemsResult],
    ["CRM contacts", intakesResult],
    ["CRM scores", scoresResult]
  ] as const) assertCrmResult(result.error, label);
  const intakeById = new Map((intakesResult.data ?? []).map((row) => [row.id, row]));
  const scoreByIntake = new Map((scoresResult.data ?? []).map((row) => [row.intake_submission_id, row.score_band]));

  return (itemsResult.data ?? []).map((row) => {
    const intake = row.intake_submission_id ? intakeById.get(row.intake_submission_id) : null;
    return {
      ...row,
      evidence_json: row.evidence_json as string[],
      parentName: intake?.parent_name ?? "Ouder/verzorger",
      participantName: intake?.participant_name ?? "Leerling",
      parentEmail: intake?.parent_email ?? "",
      parentPhone: intake?.parent_phone ?? "",
      leadScoreBand: row.intake_submission_id ? scoreByIntake.get(row.intake_submission_id) ?? "onbekend" : "onbekend"
    };
  });
}

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function assertCrmResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
