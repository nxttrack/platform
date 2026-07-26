import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { computeLeadScore, type LeadScoreResult } from "./lead-scoring-contract";
import type { GroupRow } from "./core";
import type { WaitlistEntryRow, WaitlistPreferenceRow } from "./placement";
import { calculateSmartPlacementSuggestionsForEntries } from "./smart-placement";
import type { SmartPlacementSuggestion } from "./placement-contract";

type LeadIntakeRow = {
  id: string;
  form_id: string | null;
  program_id: string | null;
  selected_option: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  participant_name: string;
  participant_birth_date: string | null;
  preferred_days: string[];
  selected_group_id: string | null;
  selected_wait_band: string | null;
  status: string;
  is_test: boolean;
  journey_run_id: string | null;
  test_metadata_json: Record<string, unknown>;
};

export type CalculatedLeadScore = LeadScoreResult & {
  intakeId: string;
};

export async function calculateLeadScore(input: {
  tenantId: string;
  intakeSubmissionId: string;
}) {
  const scores = await calculateLeadScoresForIntakes({
    tenantId: input.tenantId,
    intakeSubmissionIds: [input.intakeSubmissionId],
    persist: true
  });
  return scores.get(input.intakeSubmissionId) ?? null;
}

export async function calculateLeadScoresForIntakes(input: {
  tenantId: string;
  intakeSubmissionIds: string[];
  persist?: boolean;
}) {
  const ids = [...new Set(input.intakeSubmissionIds)];
  const result = new Map<string, CalculatedLeadScore>();
  if (ids.length === 0) return result;

  const admin = createAdminClient();
  const [
    intakesResult,
    answersResult,
    questionsResult,
    waitlistResult,
    groupsResult,
    offersResult,
    lineageResult
  ] = await Promise.all([
    admin
      .from("intake_submissions")
      .select("id, form_id, program_id, selected_option, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, preferred_days, selected_group_id, selected_wait_band, status, is_test, journey_run_id, test_metadata_json")
      .eq("tenant_id", input.tenantId)
      .in("id", ids),
    admin
      .from("intake_answers")
      .select("submission_id, question_id, field_key")
      .eq("tenant_id", input.tenantId)
      .in("submission_id", ids),
    admin
      .from("intake_questions")
      .select("id, form_id, required, applies_to_options")
      .eq("tenant_id", input.tenantId)
      .eq("required", true),
    admin
      .from("waitlist_entries")
      .select(waitlistSelect)
      .eq("tenant_id", input.tenantId)
      .in("intake_submission_id", ids),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active"),
    admin
      .from("slot_offers")
      .select("id, waitlist_entry_id, offered_at, responded_at, status")
      .eq("tenant_id", input.tenantId),
    admin
      .from("intake_conversion_lineage")
      .select("intake_submission_id, participant_id, enrollment_id")
      .eq("tenant_id", input.tenantId)
      .in("intake_submission_id", ids)
  ]);
  for (const [label, query] of [
    ["lead intakes", intakesResult],
    ["lead answers", answersResult],
    ["lead questions", questionsResult],
    ["lead waitlist", waitlistResult],
    ["lead groups", groupsResult],
    ["lead offers", offersResult],
    ["lead lineage", lineageResult]
  ] as const) assertLeadResult(query.error, label);

  const intakes = (intakesResult.data ?? []) as LeadIntakeRow[];
  const waitlist = (waitlistResult.data ?? []) as WaitlistEntryRow[];
  const waitlistIds = waitlist.map((entry) => entry.id);
  const lineage = lineageResult.data ?? [];
  const participantIds = lineage.map((row) => row.participant_id);
  const enrollmentIds = lineage.map((row) => row.enrollment_id);
  const [preferencesResult, attendanceResult, paymentsResult] = await Promise.all([
    waitlistIds.length
      ? admin
          .from("waitlist_preferences")
          .select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight")
          .eq("tenant_id", input.tenantId)
          .in("waitlist_entry_id", waitlistIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin
          .from("session_attendance")
          .select("participant_id, status, marked_at")
          .eq("tenant_id", input.tenantId)
          .in("participant_id", participantIds)
          .eq("status", "trial")
      : Promise.resolve({ data: [], error: null }),
    enrollmentIds.length
      ? admin
          .from("manual_payments")
          .select("enrollment_id, status, paid_on")
          .eq("tenant_id", input.tenantId)
          .in("enrollment_id", enrollmentIds)
          .eq("status", "paid")
      : Promise.resolve({ data: [], error: null })
  ]);
  for (const [label, query] of [
    ["lead preferences", preferencesResult],
    ["lead trial attendance", attendanceResult],
    ["lead payments", paymentsResult]
  ] as const) assertLeadResult(query.error, label);

  const smart: Map<string, SmartPlacementSuggestion[]> = waitlist.length
    ? await calculateSmartPlacementSuggestionsForEntries({
        tenantId: input.tenantId,
        entries: waitlist,
        preferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[],
        groups: (groupsResult.data ?? []) as GroupRow[]
      })
    : new Map<string, SmartPlacementSuggestion[]>();
  const answersBySubmission = groupBy(answersResult.data ?? [], (row) => row.submission_id);
  const questionsByForm = groupBy(questionsResult.data ?? [], (row) => row.form_id);
  const waitlistByIntake = new Map(waitlist.map((entry) => [entry.intake_submission_id, entry]));
  const offersByWaitlist = groupBy(offersResult.data ?? [], (row) => row.waitlist_entry_id);
  const lineageByIntake = new Map(lineage.map((row) => [row.intake_submission_id, row]));

  for (const intake of intakes) {
    const entry = waitlistByIntake.get(intake.id);
    const suggestions = entry ? smart.get(entry.id) ?? [] : [];
    const best = suggestions.find((suggestion) => suggestion.canOffer) ?? suggestions[0] ?? null;
    const requiredQuestions = (intake.form_id ? questionsByForm.get(intake.form_id) ?? [] : [])
      .filter((question) => question.applies_to_options.includes(intake.selected_option));
    const answeredIds = new Set((answersBySubmission.get(intake.id) ?? []).map((answer) => answer.question_id));
    const offers = entry ? offersByWaitlist.get(entry.id) ?? [] : [];
    const respondedOffer = offers.find((offer) => offer.responded_at && offer.offered_at);
    const conversion = lineageByIntake.get(intake.id);
    const trialCompleted = !!conversion && (attendanceResult.data ?? []).some((row) => row.participant_id === conversion.participant_id);
    const paymentPaid = !!conversion && (paymentsResult.data ?? []).some((row) => row.enrollment_id === conversion.enrollment_id);
    const score = computeLeadScore({
      requiredFieldsComplete: !!(
        intake.parent_name &&
        intake.parent_email &&
        intake.participant_name &&
        intake.participant_birth_date &&
        intake.program_id
      ),
      requiredAnswersComplete: requiredQuestions.every((question) => answeredIds.has(question.id)),
      birthDate: intake.participant_birth_date,
      preferredDayCount: intake.preferred_days.length,
      selectedGroupId: intake.selected_group_id,
      placementAvailable: best?.canOffer ?? false,
      placementConfidence: best?.confidence ?? null,
      placementBlockers: (best?.blockers ?? []).map((blocker) => ({ label: blocker.label, evidence: blocker.evidence })),
      waitBand: intake.selected_wait_band,
      offerResponseHours: respondedOffer ? hoursBetween(respondedOffer.offered_at, respondedOffer.responded_at!) : null,
      trialCompleted,
      paymentPaid,
      locationMatchInferred: !!intake.selected_group_id,
      now: new Date().toISOString()
    });
    result.set(intake.id, { intakeId: intake.id, ...score });
  }

  if (input.persist && result.size > 0) {
    const rows = intakes.flatMap((intake) => {
      const score = result.get(intake.id);
      if (!score) return [];
      return [{
        tenant_id: input.tenantId,
        intake_submission_id: intake.id,
        score_band: score.score_band,
        score: score.score,
        confidence: score.confidence,
        reasons_json: score.reasons,
        blockers_json: score.blockers,
        suggested_next_action: score.suggested_next_action,
        model_version: score.model_version,
        calculated_at: new Date().toISOString(),
        source: intake.is_test ? "journey_simulation_bot" : "lead_scoring",
        is_test: intake.is_test,
        journey_run_id: intake.journey_run_id,
        test_metadata_json: intake.test_metadata_json
      }];
    });
    const persistResult = await admin
      .from("lead_score_snapshots")
      .upsert(rows, { onConflict: "tenant_id,intake_submission_id,model_version" });
    assertLeadResult(persistResult.error, "lead score snapshots");
  }

  return result;
}

const waitlistSelect =
  "id, intake_submission_id, participant_id, guardian_user_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, created_at, admin_notes, source, is_test, journey_run_id, test_metadata_json, eligible_from, minimum_age_blocked, waitlist_reason";

function groupBy<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function hoursBetween(left: string, right: string) {
  return Math.max(0, (new Date(right).getTime() - new Date(left).getTime()) / 3_600_000);
}

function assertLeadResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not calculate ${label}: ${error.message}`);
}
