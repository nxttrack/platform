import {
  PortalJourneyEngine,
  type PortalJourneyNode
} from "@/components/parent/portal-journey-engine";
import type { SwimJourneyRing } from "@/lib/domain/swim-progress";
import type { PortalThemeManifestV3 } from "@/lib/theme/portal-theme-contract";

export type PortalOverviewHeroChild = {
  initial: string;
  name: string;
  program: string;
  stage: string;
  progressPercent: number;
  nextLesson: string | null;
  location: string | null;
};

export function PortalOverviewHero({
  child,
  destinationStage,
  displayName,
  href,
  manifest,
  nodes,
  participantId,
  rings
}: {
  child: PortalOverviewHeroChild | null;
  destinationStage: string;
  displayName: string;
  href: string;
  manifest: PortalThemeManifestV3;
  nodes: PortalJourneyNode[];
  participantId: string | null;
  rings: SwimJourneyRing[];
}) {
  return (
    <PortalJourneyEngine
      childName={child?.name ?? "jouw gezin"}
      currentStage={child?.stage ?? "Start"}
      destinationStage={destinationStage}
      href={href}
      location={child?.location ?? null}
      nextLesson={child?.nextLesson ?? null}
      nodes={nodes}
      participantId={participantId}
      program={child?.program ?? "jouw volgende doel"}
      rings={rings}
      theme={{
        developmentLabel: manifest.experience.developmentLabel,
        displayName,
        key: manifest.theme.key,
        mascotUrl: manifest.assets["mascot.idle"]?.path ?? null,
        sectorMode: manifest.experience.sectorMode
      }}
    />
  );
}
