import type { CanonicalAssessmentObservation } from "./swim-progress";

/** Same tie breakers as the canonical swim_progress_v3 SQL projection. */
export function compareAssessmentRecency(left: CanonicalAssessmentObservation, right: CanonicalAssessmentObservation): number {
  return Date.parse(right.observed_at) - Date.parse(left.observed_at)
    || Date.parse(right.finalized_at) - Date.parse(left.finalized_at)
    || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0);
}

/** Input has already had corrections/retractions and audience visibility resolved. */
export function latestJourneyObservations(observations: readonly CanonicalAssessmentObservation[]): CanonicalAssessmentObservation[] {
  const byItem = new Map<string, CanonicalAssessmentObservation>();
  for (const row of [...observations].sort(compareAssessmentRecency)) if (!byItem.has(row.curriculum_item_id)) byItem.set(row.curriculum_item_id, row);
  return [...byItem.values()];
}
