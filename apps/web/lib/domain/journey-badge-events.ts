import type { JourneyTimelineEvent } from "../theme/portal-journey-contract";
import type { CanonicalSwimJourney } from "./swim-progress";

export type JourneyBadgeAward = {
  id: string; title: string; awardedAt: string; description: string | null;
  isSurprise: boolean; triggerEventType: string | null; triggerContext: Record<string, unknown>;
};

/** Input awards must already belong to the authorized participant and audience. */
export function journeyBadgeEvents(journey: CanonicalSwimJourney | null, awards: readonly JourneyBadgeAward[]): Array<JourneyTimelineEvent & { anchorNodeId: string | null; description: string | null }> {
  if (!journey) return [];
  const stableKeys = new Map(journey.items.map((item) => [item.id, item.stable_key]));
  const anchors = new Map(journey.effectiveObservations.filter((row) => row.visibility === "parent_visible").map((row) => [row.id, stableKeys.get(row.curriculum_item_id) ?? null]));
  return awards.flatMap((award) => {
    if (!award.isSurprise && !["progress_item_completed", "skill_completed"].includes(award.triggerEventType ?? "") && award.triggerContext.showInJourney !== true) return [];
    const contextId = typeof award.triggerContext.entityId === "string" ? award.triggerContext.entityId : typeof award.triggerContext.eventId === "string" ? award.triggerContext.eventId : null;
    return [{ id: award.id, label: award.title, earnedAt: award.awardedAt, description: award.description,
      eventType: award.isSurprise ? "surprise_badge" as const : "badge" as const,
      anchorNodeId: contextId ? anchors.get(contextId) ?? null : null }];
  });
}
