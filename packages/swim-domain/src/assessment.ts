import { parseAssessmentRating, type AssessmentRating } from "./progress";

export interface FinalAssessmentObservation {
  id: string;
  itemKey: string;
  rating: AssessmentRating;
  observedAt: string;
  createdAt: string;
  correctsObservationId?: string | null;
  retractedAt?: string | null;
}

export function latestFinalObservations(
  observations: readonly FinalAssessmentObservation[]
): Map<string, FinalAssessmentObservation> {
  const correctedIds = new Set(
    observations
      .map((observation) => observation.correctsObservationId)
      .filter((id): id is string => Boolean(id))
  );
  const latest = new Map<string, FinalAssessmentObservation>();

  for (const observation of observations) {
    parseAssessmentRating(observation.rating);
    if (observation.retractedAt || correctedIds.has(observation.id)) continue;
    const current = latest.get(observation.itemKey);
    if (!current || compareObservationOrder(current, observation) < 0) {
      latest.set(observation.itemKey, observation);
    }
  }
  return latest;
}

export function validateCorrectionChain(
  observations: readonly FinalAssessmentObservation[]
): { valid: true } | { valid: false; reason: string } {
  const byId = new Map(observations.map((observation) => [observation.id, observation]));
  for (const observation of observations) {
    const seen = new Set([observation.id]);
    let correctedId = observation.correctsObservationId ?? null;
    while (correctedId) {
      if (seen.has(correctedId)) return { valid: false, reason: "cycle" };
      seen.add(correctedId);
      const corrected = byId.get(correctedId);
      if (!corrected) return { valid: false, reason: "missing_predecessor" };
      if (corrected.itemKey !== observation.itemKey) return { valid: false, reason: "cross_item_correction" };
      correctedId = corrected.correctsObservationId ?? null;
    }
  }
  return { valid: true };
}

function compareObservationOrder(left: FinalAssessmentObservation, right: FinalAssessmentObservation) {
  const observedOrder = left.observedAt.localeCompare(right.observedAt);
  if (observedOrder !== 0) return observedOrder;
  const createdOrder = left.createdAt.localeCompare(right.createdAt);
  if (createdOrder !== 0) return createdOrder;
  return left.id.localeCompare(right.id);
}
