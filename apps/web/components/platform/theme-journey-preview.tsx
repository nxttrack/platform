"use client";

import { useState } from "react";
import { PortalJourneyScene } from "@/components/portal/journey/portal-journey-scene";
import type { PortalJourneyView } from "@/lib/domain/portal-journey-view";
import type { PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";

/** Fictional DTO factory. Never loads participants, calls commands or shares portal context state. */
export function ThemeJourneyPreview({ presentation, assetUrls }: { presentation: PortalJourneyPresentationV1; assetUrls: Record<string, string> }) {
  const [world, setWorld] = useState(Object.keys(presentation.worlds)[0]), [count, setCount] = useState(7), [reduced, setReduced] = useState(false), [audience, setAudience] = useState("parent");
  const [selected, setSelected] = useState<string | null>(null);
  const model: PortalJourneyView = {
    programId: "preview-program", curriculumVersionId: "preview-version", stageId: "preview-stage", stageName: "Fictief niveau",
    nodes: Array.from({ length: count }, (_, index) => ({ id: `preview-${index}`, curriculumItemId: `preview-item-${index}`, criterionIdentity: `preview-identity-${index}`, label: index === count - 1 ? "Een lang onderdeel dat in iedere weergave bereikbaar blijft" : `Voorbeeldonderdeel ${index + 1}`, description: "Fictieve voorbeeldgegevens voor de visuele controle.", rating: index < 2 ? 4 : null, progressPercent: index < 2 ? 80 : null, state: index < 2 ? "completed" : "not_assessed", assessed: index < 2, completed: index < 2, completedAt: index < 2 ? "2026-01-01T10:00:00Z" : null, completionSequence: index < 2 ? index + 1 : null, completionOrderStatus: index < 2 ? "event_sequence" : null, curriculumOrder: index, lastUpdatedAt: null, positiveLabel: null })),
    rings: [{ key: "stage", kind: "stage", label: "Huidig niveau", progressPercent: 48, coveragePercent: 60, assessedCount: 3, contributingCount: 5, formulaVersion: "swim_progress_v3" }, { key: "diploma", kind: "diploma", label: "Diploma", progressPercent: null, coveragePercent: null, assessedCount: 0, contributingCount: 12, formulaVersion: "swim_progress_v3" }]
  };
  return <main className="p-3">
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm">
      <strong>Voorbeeld met fictieve gegevens</strong>
      <label>Wereld <select value={world} onChange={(event) => { setWorld(event.target.value); setSelected(null); }}>{Object.values(presentation.worlds).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label>Onderdelen <select value={count} onChange={(event) => { setCount(Number(event.target.value)); setSelected(null); }}>{[0, 1, 4, 5, 7, 12, 24, 48].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Portaal <select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="parent">Ouder</option><option value="child">Leerling</option></select></label>
      <label><input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} /> Minder beweging</label>
    </div>
    <PortalJourneyScene key={`${world}:${count}:${audience}`} presentation={presentation} worldId={world} model={model} contextKey={`preview:${presentation.themeId}:${presentation.runtimeRelease}:${world}:${count}:${audience}`} title={audience === "child" ? "Jouw zwemreis" : "De zwemreis van Sam"} selectedId={selected} onSelect={setSelected} detailHref={() => "#preview-details"} assetUrls={assetUrls} reducedMotion={reduced} />
    <p id="preview-details" className="mt-3 text-sm">Alle gegevens op deze pagina zijn fictief. Een selectie verandert geen beoordeling, schoolkoppeling of portaalinstelling.</p>
  </main>;
}
