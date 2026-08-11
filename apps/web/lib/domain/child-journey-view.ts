import type { ChildJourneyNodeDto } from "@/components/child/child-journey-map";
import type { ChildSafeJourneyDto } from "./child-portal";

export function childJourneyNodes(journey: ChildSafeJourneyDto | null): ChildJourneyNodeDto[] {
  if (!journey) return [];
  const observationByItem = new Map(
    journey.effectiveObservations.map((observation) => [observation.curriculumItemId, observation])
  );
  return journey.currentStageItems
    .slice()
    .sort((first, second) => first.sortOrder - second.sortOrder || first.name.localeCompare(second.name))
    .map((item) => {
      const observation = observationByItem.get(item.id);
      return {
        id: item.stableKey,
        label: item.name,
        progressPercent: observation ? (observation.rating / 5) * 100 : 0,
        completed: observation?.rating === 5,
        assessed: Boolean(observation),
        completedAt: observation?.rating === 5 ? observation.finalizedAt : null,
        curriculumOrder: item.sortOrder,
        lastUpdatedAt: observation?.finalizedAt ?? null
      };
    });
}
