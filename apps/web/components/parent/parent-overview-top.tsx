import { CalendarDays, ChevronRight, Clock3, MapPin, Waves } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { ProgressRing } from "@/components/shell/ui";
import type { SwimJourneyRing } from "@/lib/domain/swim-progress";

export function ParentOverviewTop({
  currentGoal,
  destinationStage,
  lesson,
  participantId,
  progressHref,
  program,
  rings,
  sceneUrl,
  stage
}: {
  currentGoal: { label: string; progressPercent: number; assessed: boolean } | null;
  destinationStage: string;
  lesson: { dateLabel: string; groupName: string | null; locationName: string | null } | null;
  participantId: string | null;
  progressHref: string;
  program: string;
  rings: SwimJourneyRing[];
  sceneUrl: string | null;
  stage: string;
}) {
  const planningHref = participantId ? `/portaal/planning?kind=${encodeURIComponent(participantId)}` : "/portaal/planning";
  return <div className="parent-dashboard-top">
    <section className="parent-overview-panel parent-overview-planning">
      <header><span><CalendarDays aria-hidden="true" /></span><div><small>Volgende activiteit</small><h1>{lesson ? "De volgende les staat klaar" : "Nog geen les gepland"}</h1></div></header>
      {lesson ? <div className="parent-overview-planning__facts">
        <p><Clock3 aria-hidden="true" /><span><small>Wanneer</small><strong>{lesson.dateLabel}</strong></span></p>
        {lesson.locationName ? <p><MapPin aria-hidden="true" /><span><small>Waar</small><strong>{lesson.locationName}</strong></span></p> : null}
        {lesson.groupName ? <p><Waves aria-hidden="true" /><span><small>Groep</small><strong>{lesson.groupName}</strong></span></p> : null}
      </div> : <p className="parent-overview-panel__empty">Nieuwe lessen verschijnen hier zodra ze zijn ingepland.</p>}
      <Link href={planningHref}>Bekijk planning <ChevronRight aria-hidden="true" /></Link>
    </section>

    <section className="parent-overview-panel parent-overview-progress" style={{ "--parent-progress-scene": sceneUrl ? `url("${sceneUrl}")` : "none" } as CSSProperties}>
      <div aria-hidden="true" className="parent-overview-progress__scene" />
      <header><div><small>Voortgang</small><h2>{program}</h2><p>{stage} → {destinationStage}</p></div></header>
      <div className="parent-overview-progress__body">
        <div className="parent-overview-progress__goal"><small>Huidig doel</small><strong>{currentGoal?.label ?? "De volgende stap volgt"}</strong><span>{currentGoal?.assessed ? `${Math.round(currentGoal.progressPercent)}%` : "Nog niet beoordeeld"}</span></div>
        <div className="parent-overview-progress__rings" data-ring-count={rings.length}>
          {rings.map((ring) => <div key={`${ring.kind}:${ring.key}`}><ProgressRing label={ring.kind === "stage" ? "badje" : "diploma"} size={76} value={ring.progressPercent} /><small>{ring.kind === "stage" ? "Huidig badje" : "Naar diploma"}</small></div>)}
        </div>
      </div>
      <Link href={progressHref}>Bekijk ontwikkeling <ChevronRight aria-hidden="true" /></Link>
    </section>
  </div>;
}
