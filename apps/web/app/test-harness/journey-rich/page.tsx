import { notFound } from "next/navigation";
import { PortalJourney } from "@/components/portal/journey/portal-journey";
import type { PortalJourneyView } from "@/lib/domain/portal-journey-view";
import { createDefaultJourneyFixture, defaultJourneyWorlds } from "@/lib/theme/default-journey-profile";
import { RefreshJourneyFixture } from "./refresh-fixture";
import { DraftNavigationFixture } from "./draft-fixture";

export const dynamic = "force-dynamic";

/** Fictional layout fixture, fail-closed outside the existing test environment. */
export default async function RichJourneyHarness({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.APP_ENV !== "test") notFound();
  const params = await searchParams ?? {};
  const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const count = Math.max(0, Math.min(48, Number.parseInt(scalar(params.count) ?? "7", 10) || 0));
  const worldId = scalar(params.world) ?? "badje-01";
  if (!defaultJourneyWorlds.some((world) => world.id === worldId)) notFound();
  const model: PortalJourneyView = {
    curriculumVersionId: "fixture-version", programId: "fixture-program", stageId: "fixture-stage", stageName: "Fictief niveau",
    nodes: Array.from({ length: count }, (_, index) => ({
      id: `fixture-${index + 1}`, curriculumItemId: `item-${index + 1}`, criterionIdentity: `identity-${index + 1}`,
      label: index === count - 1 ? "Een bijzonder lang Nederlands onderdeel dat ook bij tweehonderd procent tekstvergroting bereikbaar blijft" : `Onderdeel ${index + 1}`,
      description: "Fictief onderdeel voor de lay-outtest; geen nieuw curriculum of echte beoordeling.",
      rating: index < 2 ? 4 : null, progressPercent: index < 2 ? 80 : null, state: index < 2 ? "completed" : "not_assessed", assessed: index < 2, completed: index < 2,
      completedAt: index < 2 ? "2026-09-14T08:00:00Z" : null, completionSequence: index < 2 ? index + 1 : null, completionOrderStatus: index < 2 ? "event_sequence" : null,
      curriculumOrder: index, lastUpdatedAt: null, positiveLabel: null
    })),
    rings: [
      { key: "stage", kind: "stage", label: "Huidig niveau", progressPercent: 40, coveragePercent: 50, assessedCount: 2, contributingCount: 4, formulaVersion: "swim_progress_v3" },
      { key: "diploma", kind: "diploma", label: "Diploma", progressPercent: null, coveragePercent: null, assessedCount: 0, contributingCount: 12, formulaVersion: "swim_progress_v3" }
    ]
  };
  const events = scalar(params.moments) === "1" ? [
    { id: "badge-a", label: "Rustig geprobeerd", earnedAt: "2026-09-14T08:05:00Z", eventType: "badge" as const, anchorNodeId: "fixture-2", description: "Een fictieve badge naast de leerroute." },
    { id: "badge-b", label: "Verrassing in de les", earnedAt: "2026-09-14T08:06:00Z", eventType: "surprise_badge" as const, anchorNodeId: "fixture-2" },
    { id: "badge-c", label: "Eerder moment", earnedAt: "2026-08-01T08:00:00Z", eventType: "badge" as const, anchorNodeId: null }
  ] : [];
  return <main style={{ padding: "1rem", maxWidth: "1920px", margin: "auto" }}>
    <p style={{ marginBottom: ".5rem" }}>V4.2 rendererfixture · geen originele Default-artwork</p>
    <RefreshJourneyFixture />
    {scalar(params.draft)?<DraftNavigationFixture editor={scalar(params.draft)==='editor'}/>:null}
    <PortalJourney events={events} audience="preview" contextKey={`fixture:${worldId}:${count}`} model={model} presentation={createDefaultJourneyFixture()} worldId={worldId} title="Jouw zwemreis" lesson={{ label: "Di 15 sep · 16:00", href: "/test-harness/journey-rich" }} />
    <div style={{ height: "70vh" }} aria-hidden="true" />
  </main>;
}
