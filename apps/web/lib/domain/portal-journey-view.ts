import { childAssessmentCompliment } from "./child-assessment-compliment";
import { orderJourneyNodes } from "../theme/portal-journey-contract";
import type { CanonicalSwimJourney } from "./swim-progress";
import { latestJourneyObservations } from "./swim-assessment-order";

export type PortalJourneyViewNode = Readonly<{
  id: string;
  curriculumItemId: string;
  criterionIdentity: string;
  label: string;
  description: string | null;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  progressPercent: number | null;
  state: "not_assessed" | "in_progress" | "completed" | "carryover";
  assessed: boolean;
  completed: boolean;
  completedAt: string | null;
  completionSequence: number | null;
  completionOrderStatus: "event_sequence" | "legacy_inferred" | null;
  curriculumOrder: number;
  lastUpdatedAt: string | null;
  positiveLabel: string | null;
}>;
export type PortalJourneyViewRing = Readonly<{
  key: string;
  kind: "stage" | "diploma";
  label: string;
  progressPercent: number | null;
  coveragePercent: number | null;
  assessedCount: number;
  contributingCount: number;
  formulaVersion: "swim_progress_v3";
}>;
export type PortalJourneyView = Readonly<{
  curriculumVersionId: string;
  programId: string;
  stageId: string | null;
  stageName: string | null;
  nodes: readonly PortalJourneyViewNode[];
  rings: readonly PortalJourneyViewRing[];
}>;

/** Explicit allowlist; private observations, notes, source context and actor IDs never leave it. */
export function parentJourneyView(journey: CanonicalSwimJourney | null): PortalJourneyView | null {
  return journey ? projectJourney(journey, "parent") : null;
}
/** Server constructs this before crossing the child session boundary. No parent DTO is reused. */
export function childJourneyView(journey: CanonicalSwimJourney | null): PortalJourneyView | null {
  return journey ? projectJourney(journey, "child") : null;
}

function projectJourney(journey: CanonicalSwimJourney, audience: "parent" | "child"): PortalJourneyView {
  const observations = new Map(latestJourneyObservations(journey.effectiveObservations.filter((row) => row.visibility === "parent_visible")).map((row) => [row.curriculum_item_id, row]));
  const completions = new Map(journey.itemCompletions.map((row) => [row.curriculum_item_id, row]));
  const carryovers = new Set(journey.carryovers.filter((row) => row.status === "open" && row.to_stage_id === journey.currentStage?.id).map((row) => row.curriculum_item_id));
  const items = [...journey.currentStageItems, ...journey.items.filter((item) => carryovers.has(item.id) && !journey.currentStageItems.some((current) => current.id === item.id))];
  const projected: PortalJourneyViewNode[] = items.map((item) => {
    const observation = observations.get(item.id), completion = completions.get(item.id);
    const rating = observation?.rating ?? null;
    const completed = rating !== null && rating >= item.mastery_threshold;
    return {
      id: item.stable_key, curriculumItemId: item.id, criterionIdentity: item.identity_id,
      label: item.name, description: item.description, rating,
      // Per-item canonical scale is rating/5; stage/diploma rings below come from DB projections.
      progressPercent: rating === null ? null : rating / 5 * 100,
      state: completed ? "completed" : carryovers.has(item.id) ? "carryover" : rating === null ? "not_assessed" : "in_progress",
      assessed: rating !== null, completed,
      // Retain historical completion provenance even after a correction; never invent dates.
      completedAt: completion?.completed_at ?? null,
      completionSequence: completion?.completion_sequence ?? null,
      completionOrderStatus: completion?.order_status ?? null,
      curriculumOrder: item.sort_order, lastUpdatedAt: observation?.finalized_at ?? null,
      positiveLabel: observation ? audience === "parent" ? observation.positive_label : childAssessmentCompliment(observation) : null
    };
  });
  // Zero is only the existing ordering helper's sentinel, never the displayed unknown progress.
  const byId = new Map(projected.map((node) => [node.id, node]));
  const nodes = orderJourneyNodes(projected.map((node) => ({ ...node, progressPercent: node.progressPercent ?? 0 }))).map((node) => byId.get(node.id)!);
  const rings = journey.rings.map((ring): PortalJourneyViewRing => {
    const projection = journey.projectionByScopeKey.get(ring.kind === "stage" ? `stage:${journey.currentStage?.id}` : "diploma:diploma");
    return { key: ring.key, kind: ring.kind, label: ring.label, progressPercent: percent(projection?.progress_fraction), coveragePercent: percent(projection?.coverage_fraction), assessedCount: projection?.assessed_count ?? 0, contributingCount: projection?.contributing_count ?? ring.contributingCount, formulaVersion: journey.version.formula_version };
  });
  return { curriculumVersionId: journey.version.id, programId: journey.version.program_id, stageId: journey.currentStage?.id ?? null, stageName: journey.currentStage?.name ?? null, nodes, rings };
}
function percent(fraction: number | null | undefined): number | null {
  return typeof fraction === "number" && Number.isFinite(fraction) ? Math.round(Math.max(0, Math.min(1, fraction)) * 1000) / 10 : null;
}
