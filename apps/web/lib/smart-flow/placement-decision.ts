import type { SupabaseClient } from "@supabase/supabase-js";

import { smartReason, upsertSmartDecision } from "@/lib/smart-flow/decision";

type PlacementDecisionInput = {
  tenantId: string;
  suggestionId: string;
  waitlistEntryId: string;
  intakeSubmissionId: string | null;
  programId: string;
  recommendedStageId: string | null;
  group: {
    id: string;
    program_id: string;
    stage_id: string;
    resource_id: string | null;
    weekday: number;
    capacity: number;
  };
  preferredWeekday: string;
  preferredDays: string[];
  preferredTimeWindows: string[];
  dayMatch: boolean;
  stageMatch: boolean;
  activeMemberships: number;
  capacityLimit: number;
  availableSpots: number;
  resourceCapacity: number | null;
  score: number;
  rationale: string;
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export async function createPlacementSmartDecision(client: SmartDecisionClient, input: PlacementDecisionInput) {
  return upsertSmartDecision(client, {
    tenantId: input.tenantId,
    engineKey: "placement",
    subjectType: "placement_suggestion",
    subjectId: input.suggestionId,
    inputSnapshot: {
      waitlist_entry_id: input.waitlistEntryId,
      intake_submission_id: input.intakeSubmissionId,
      program_id: input.programId,
      recommended_stage_id: input.recommendedStageId,
      group_id: input.group.id,
      group_stage_id: input.group.stage_id,
      resource_id: input.group.resource_id,
      group_weekday: input.group.weekday,
      preferred_weekday: input.preferredWeekday,
      preferred_days: input.preferredDays,
      preferred_time_windows: input.preferredTimeWindows,
      capacity_limit: input.capacityLimit,
      active_memberships: input.activeMemberships,
      available_spots: input.availableSpots
    },
    ruleVersion: "placement-v1",
    score: input.score,
    reasons: [
      smartReason({
        code: "capacity_available",
        label: "Capaciteit beschikbaar",
        detail: `${input.availableSpots} plek${input.availableSpots === 1 ? "" : "ken"} vrij binnen de groep/resource capaciteit.`,
        weight: 30,
        evidence: {
          capacity_limit: input.capacityLimit,
          active_memberships: input.activeMemberships,
          available_spots: input.availableSpots,
          resource_capacity: input.resourceCapacity
        }
      }),
      smartReason({
        code: input.dayMatch ? "preferred_day_match" : "preferred_day_missing",
        label: input.dayMatch ? "Voorkeursdag matcht" : "Geen voorkeursdag-match",
        detail: input.dayMatch ? "De groep valt op een opgegeven voorkeursdag." : "De groep valt niet op een opgegeven voorkeursdag.",
        weight: 20,
        evidence: { preferred_weekday: input.preferredWeekday, preferred_days: input.preferredDays }
      }),
      smartReason({
        code: input.stageMatch ? "stage_match" : "stage_review_needed",
        label: input.stageMatch ? "Niveau matcht" : "Niveau vraagt beoordeling",
        detail: input.stageMatch ? "Het aanbevolen niveau komt overeen met de groep." : "Er is geen aanbevolen niveau of het niveau wijkt af.",
        weight: 25,
        evidence: { recommended_stage_id: input.recommendedStageId, group_stage_id: input.group.stage_id }
      })
    ],
    recommendation: {
      action: "approve_slot_offer",
      group_id: input.group.id,
      score: input.score,
      rationale: input.rationale,
      parent_summary: "Er lijkt een passende lesplek beschikbaar. De zwemschool controleert dit voordat er een aanbod wordt verstuurd."
    },
    metadata: {
      source: "admin_placement",
      automation_mode: "semi_automatic"
    }
  });
}
