import { notFound } from "next/navigation";
import { PortalDevelopment } from "@/components/portal/development/portal-development";
import type { PortalDevelopmentView } from "@/lib/domain/portal-development-view";

export const dynamic = "force-dynamic";

/** Fictional UI data only. Actual canonical privacy/chronology is tested separately. */
export default function DevelopmentHarness() {
  if (process.env.APP_ENV !== "test") notFound();
  const model: PortalDevelopmentView = {
    stageId: "fixture-stage", stageName: "Fictief niveau", stages: [{ id: "fixture-stage", name: "Fictief niveau" }],
    items: ["Ademen", "Rustig drijven met een bijzonder lange Nederlandse onderdeelnaam"].map((label, index) => ({ id: `fixture-${index}`, curriculumItemId: `item-${index}`, criterionIdentity: `identity-${index}`, label, description: "Fictieve beschrijving van dit onderdeel.", rating: index ? null : 3, progressPercent: index ? null : 60, state: index ? "not_assessed" : "completed", assessed: index === 0, completed: index === 0, completedAt: index ? null : "2026-09-12T10:00:00Z", completionSequence: index ? null : 1, completionOrderStatus: index ? null : "event_sequence", curriculumOrder: index, lastUpdatedAt: index ? null : "2026-09-14T10:00:00Z", positiveLabel: null, stageId: "fixture-stage", stageName: "Fictief niveau", current: true, masteryThreshold: index ? 5 : 3 })),
    history: [
      { id: "new", itemId: "fixture-0", label: "Ademen", at: "2026-09-14T10:00:00Z", finalizedAt: "2026-09-14T10:00:00Z", rating: 3, previousRating: 5, status: "recorded", correction: true, current: true, positiveLabel: null },
      { id: "old", itemId: "fixture-0", label: "Ademen", at: "2026-09-12T10:00:00Z", finalizedAt: "2026-09-12T10:00:00Z", rating: 5, previousRating: null, status: "corrected", correction: false, current: false, positiveLabel: null }
    ]
  };
  return <main className="mx-auto max-w-6xl p-4"><h1 className="mb-4 text-3xl font-bold [overflow-wrap:anywhere]">Ontwikkeling · fictieve testgegevens</h1><PortalDevelopment model={model} contextKey="fixture-development" participantId="fixture-child"
    badges={[{ id: "fixture-badge", title: "Een fictief moment", date: "2026-09-10T10:00:00Z", description: "Alleen een UI-fixture." }]}
    chapters={[{ id: "fixture-chapter", stageId: "previous", title: "Eerdere wereld", completedAt: "2026-08-10T10:00:00Z", badgeCount: 1, themeRelease: "1.0.0", items: [{ id: "old-item", label: "Historisch onderdeel", rating: 2 }, { id: "unknown", label: "Onbekende historische score", rating: null }], available: false }]} /></main>;
}
