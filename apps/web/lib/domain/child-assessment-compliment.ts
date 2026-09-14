/** Only an explicit publication, or already-curated historical data, is child copy. */
export function childAssessmentCompliment(observation: { visibility: string; child_compliment?: string | null; context_json: Record<string, unknown>; positive_label: string }): string | null {
  if (observation.visibility !== "parent_visible") return null;
  if (observation.child_compliment) return observation.child_compliment;
  return observation.context_json.childVisible === true ? observation.positive_label : null;
}
