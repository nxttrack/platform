import type { SupabaseClient } from "@supabase/supabase-js";

import { capacitySnapshotToRecord, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { smartBlocker, smartReason, upsertSmartDecision, type SmartDecisionBlocker, type SmartDecisionReason } from "@/lib/smart-flow/decision";
import { placementAssistantRuleVersion, type PlacementAssistantMode, type PlacementSuggestedAction } from "@/lib/smart-flow/placement-assistant";

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
  capacitySnapshot: CapacitySnapshot;
  score: number;
  rationale: string;
  waitlistScore?: number | null;
  waitlistReasons?: unknown[];
  assistantMode?: PlacementAssistantMode;
  suggestedAction?: PlacementSuggestedAction;
  matchReasons?: SmartDecisionReason[];
  matchBlockers?: SmartDecisionBlocker[];
  matchSnapshot?: Record<string, unknown>;
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export async function createPlacementSmartDecision(client: SmartDecisionClient, input: PlacementDecisionInput) {
  return upsertSmartDecision(client, {
    tenantId: input.tenantId,
    engineKey: "placement",
    subjectType: "placement_suggestion",
    subjectId: input.suggestionId,
    inputSnapshot: {
      ...(input.matchSnapshot ?? {}),
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
      available_spots: input.availableSpots,
      capacity_snapshot: capacitySnapshotToRecord(input.capacitySnapshot),
      waitlist_score: input.waitlistScore ?? null,
      waitlist_reasons: input.waitlistReasons ?? [],
      assistant_mode: input.assistantMode ?? "manual",
      suggested_action: input.suggestedAction ?? "offer_slot"
    },
    ruleVersion: input.matchReasons ? placementAssistantRuleVersion : "placement-v1",
    score: input.score,
    reasons: input.matchReasons ?? [
      smartReason({
        code: "capacity_available",
        label: "Capaciteit beschikbaar",
        detail: `${input.availableSpots} plek${input.availableSpots === 1 ? "" : "ken"} vrij binnen groep, resource, holds en reserveringen.`,
        weight: 30,
        evidence: {
          capacity_limit: input.capacityLimit,
          active_memberships: input.activeMemberships,
          available_spots: input.availableSpots,
          resource_capacity: input.resourceCapacity,
          held_spots: input.capacitySnapshot.heldSpots,
          reserved_spots: input.capacitySnapshot.reservedSpots,
          future_starts: input.capacitySnapshot.futureStarts
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
      }),
      smartReason({
        code: "waitlist_rank",
        label: "Wachtlijstranking",
        detail: typeof input.waitlistScore === "number" ? `Kandidaat heeft wachtlijstscore ${input.waitlistScore}/100.` : "Nog geen opgeslagen wachtlijstscore.",
        weight: 15,
        evidence: {
          waitlist_score: input.waitlistScore ?? null,
          waitlist_reasons: input.waitlistReasons ?? []
        }
      })
    ],
    blockers:
      input.matchBlockers ??
      input.capacitySnapshot.blockers.map((blocker) =>
        smartBlocker({
          code: blocker.code,
          label: blocker.label,
          detail: blocker.detail,
          severity: blocker.severity === "blocking" ? "blocking" : "warning"
        })
      ),
    recommendation: {
      action: input.suggestedAction ?? "offer_slot",
      group_id: input.group.id,
      waitlist_score: input.waitlistScore ?? null,
      score: input.score,
      rationale: input.rationale,
      capacity_explanation: capacitySnapshotToRecord(input.capacitySnapshot),
      parent_summary: "Er lijkt een passende lesplek beschikbaar. De zwemschool controleert dit voordat er een aanbod wordt verstuurd."
    },
    metadata: {
      source: "admin_placement",
      automation_mode: "semi_automatic"
    }
  });
}
