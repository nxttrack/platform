import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type SwimTransitionCaseRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  curriculum_version_id: string;
  from_stage_id: string;
  to_stage_id: string | null;
  eligibility_status: "unknown" | "not_eligible" | "eligible";
  eligibility_json: {
    requiredCount?: number;
    masteredCount?: number;
    openCount?: number;
    stageProgressFraction?: number | null;
    stageCoverageFraction?: number | null;
    formulaVersion?: string;
    nextStageAvailable?: boolean;
  };
  review_status: "pending" | "reviewed";
  approval_status: "pending" | "approved" | "rejected";
  execution_status: "pending" | "executed" | "cancelled";
  reason: string | null;
  eligibility_calculated_at: string | null;
};

export type PreviousStageItemPreview = {
  carryover_id: string;
  curriculum_item_id: string;
  stable_key: string;
  item_name: string;
  from_stage_name: string;
  mastery_threshold: number;
  latest_rating: number | null;
  latest_observation_id: string | null;
};

export type RemainingBadgePreview = {
  badge_release_id: string;
  stable_key: string;
  resolved_name: string;
  is_surprise: boolean;
  eligibility_status: "eligible" | "ineligible";
  eligibility_reason: string;
};

export type SwimStudentCommandData = {
  transitionCase: SwimTransitionCaseRow | null;
  previousStageItems: PreviousStageItemPreview[];
  remainingBadges: RemainingBadgePreview[];
};

export async function getSwimStudentCommandData(input: {
  tenantId: string;
  participantId: string;
  enrollmentId: string | null;
  includeRemainingBadges: boolean;
}): Promise<SwimStudentCommandData> {
  if (!input.enrollmentId) {
    return {
      transitionCase: null,
      previousStageItems: [],
      remainingBadges: []
    };
  }

  const admin = createAdminClient();
  const supabase = await createClient();
  const [transitionResult, carryoverResult, remainingBadgesResult] = await Promise.all([
    admin
      .from("swim_transition_cases")
      .select("id, participant_id, enrollment_id, curriculum_version_id, from_stage_id, to_stage_id, eligibility_status, eligibility_json, review_status, approval_status, execution_status, reason, eligibility_calculated_at")
      .eq("tenant_id", input.tenantId)
      .eq("enrollment_id", input.enrollmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("preview_previous_stage_items", {
      target_enrollment_id: input.enrollmentId,
      target_tenant_id: input.tenantId
    }),
    input.includeRemainingBadges
      ? supabase.rpc("preview_remaining_badges", {
          target_participant_id: input.participantId,
          target_tenant_id: input.tenantId
        })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (transitionResult.error) {
    throw new Error(`Kon doorstroomcase niet laden: ${transitionResult.error.message}`);
  }

  return {
    transitionCase: (transitionResult.data as SwimTransitionCaseRow | null) ?? null,
    previousStageItems: carryoverResult.error
      ? []
      : ((carryoverResult.data ?? []) as PreviousStageItemPreview[]),
    remainingBadges: remainingBadgesResult.error
      ? []
      : ((remainingBadgesResult.data ?? []) as RemainingBadgePreview[])
  };
}
