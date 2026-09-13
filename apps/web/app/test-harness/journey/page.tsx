import { notFound } from "next/navigation";

import type { ChildJourneyNodeDto } from "@/components/child/child-journey-map";
import { getThemeRelease, portalThemeCatalog } from "@/lib/theme/portal-theme-registry";
import { portalThemeCssVariables } from "@/lib/theme/portal-theme-web";
import type { JourneyTimelineEvent } from "@/lib/theme/portal-journey-contract";

import { JourneyHarnessClient } from "./journey-harness-client";

export const dynamic = "force-dynamic";

export default async function JourneyTestPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.APP_ENV !== "test") notFound();
  const params: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}));
  const requestedTheme = scalar(params.theme) ?? "ocean-quest";
  const count = Math.min(40, Math.max(0, Number.parseInt(scalar(params.count) ?? "7", 10) || 0));
  const completedCount = scalar(params.complete) === "all" ? count : Math.min(2, count);
  const withoutAssessments = scalar(params.assessments) === "none";
  const withoutScenery = scalar(params.scenery) === "none";
  const manifest = portalThemeCatalog.find((release) => release.theme.key === requestedTheme) ?? getThemeRelease("ocean-quest", "3.0.0");
  if (!manifest) notFound();
  const nodes: ChildJourneyNodeDto[] = Array.from({ length: count }, (_, index) => ({
    id: `doel-${index + 1}`,
    label: index === Math.max(0, count - 1) ? "Een uitzonderlijk lang Nederlands onderdeellabel voor veilige reflow" : `Doel ${index + 1}`,
    progressPercent: withoutAssessments ? 0 : index < completedCount ? 100 : index === completedCount ? 80 : Math.max(0, 35 - index),
    completed: !withoutAssessments && index < completedCount,
    assessed: !withoutAssessments && index <= completedCount,
    completedAt: !withoutAssessments && index < completedCount ? `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` : null,
    completionOrderStatus: !withoutAssessments && index < completedCount ? "event_sequence" : null,
    completionSequence: !withoutAssessments && index < completedCount ? index + 1 : null,
    curriculumOrder: index,
    lastUpdatedAt: !withoutAssessments && index <= completedCount ? `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z` : null,
    positiveLabel: !withoutAssessments && index === completedCount ? "Je houdt je lichaam al mooi lang." : null
  }));
  const events: JourneyTimelineEvent[] = count >= 2 ? [
    { id: "badge-voor", label: "Eerste duik", earnedAt: "2026-07-31T10:00:00.000Z", eventType: "badge" },
    { id: "surprise-tussen", label: "Dappere ontdekker", earnedAt: "2026-08-01T12:00:00.000Z", eventType: "surprise_badge", description: "Je probeerde iets nieuws!" },
    { id: "badge-tussen", label: "Watermaatje", earnedAt: "2026-08-01T12:00:00.000Z", eventType: "badge" },
    { id: "badge-na", label: "Sterke zwemmer", earnedAt: "2026-08-03T10:00:00.000Z", eventType: "badge", anchorNodeId: "doel-2" }
  ] : [];
  return <main className="child-theme-root journey-test-harness" data-journey-test-theme={manifest.theme.key} style={portalThemeCssVariables(manifest)}>
    <div className="journey-test-quest">
      <JourneyHarnessClient desktopArtwork={withoutScenery ? null : manifest.assets["progress.journey.desktop"]?.path ?? null} events={events} mascotKind={manifest.experience.mascot} mascotUrl={manifest.assets["mascot.idle"]?.path ?? null} mobileArtwork={withoutScenery ? null : manifest.assets["progress.journey.mobile"]?.path ?? null} nodes={nodes} />
      <aside aria-label="Vaste voortgangsfixture" className="journey-test-fixed-exclusion" data-journey-exclusion>62%</aside>
    </div>
    <div className="journey-test-scroll-target" aria-hidden="true" />
  </main>;
}

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
