import { ChildJourneyMap } from "@/components/child/child-journey-map";
import { SwimJourneyRings } from "@/components/progress/swim-journey-rings";
import { childJourneyNodes } from "@/lib/domain/child-journey-view";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ChildJourneyPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params]: [Awaited<ReturnType<typeof getChildPortalData>>, Record<string, string | string[] | undefined>] = await Promise.all([getChildPortalData(), searchParams ?? Promise.resolve({})]);
  const theme = data.theme.manifest;
  const requestedItem = Array.isArray(params.onderdeel) ? params.onderdeel[0] : params.onderdeel;
  const selectedItem = requestedItem ? data.journey?.currentStageItems.find((item) => item.stableKey === requestedItem) ?? null : null;
  if (requestedItem && !selectedItem) notFound();
  const observation = selectedItem ? data.journey?.effectiveObservations.find((entry) => entry.curriculumItemId === selectedItem.id) ?? null : null;
  const childVisibleTip = observation?.childVisible ? observation.positiveLabel : null;
  return <div className="child-page" data-child-route-state={selectedItem ? "goal-detail" : "journey"}>
    <header className="child-page__heading"><span>Mijn reis</span><h1>Kijk eens hoe ver je al bent!</h1><p>Iedere stap die je oefent brengt je dichter bij je volgende doel.</p></header>
    <ChildJourneyMap desktopArtwork={theme.assets["progress.journey.desktop"]?.path ?? null} mascotUrl={theme.assets["mascot.idle"]?.path ?? null} mobileArtwork={theme.assets["progress.journey.mobile"]?.path ?? null} nodes={childJourneyNodes(data.journey)} />
    <div className="child-journey-support-grid">
      <section className="child-card"><small>Mijn doelen</small><h2>{data.journey?.currentStage?.name ?? "Mijn huidige reis"}</h2>{data.journey?.currentStageItems.length ? <ol className="child-goal-list">{data.journey.currentStageItems.map((item) => {
        const itemObservation = data.journey?.effectiveObservations.find((entry) => entry.curriculumItemId === item.id);
        return <li key={item.id}><Link href={`/kind/reis?onderdeel=${encodeURIComponent(item.stableKey)}`}><span>{item.name}</span><strong>{itemObservation ? `${itemObservation.rating} / 5` : "Nieuw"}</strong></Link></li>;
      })}</ol> : <p>Je doelen worden zichtbaar zodra jouw programma is gestart.</p>}</section>
      <section className="child-card"><small>Afgeronde hoofdstukken</small><h2>Mijn eerdere avonturen</h2>{data.journey?.chapterSnapshots.length ? <ol className="child-chapter-list">{data.journey.chapterSnapshots.map((snapshot) => <li key={snapshot.id}><span aria-hidden="true">✓</span><div><strong>{data.journey?.stages.find((stage) => stage.id === snapshot.curriculumStageId)?.name ?? "Afgerond hoofdstuk"}</strong><small>{formatDate(snapshot.completedAt)} · {snapshot.badgeAwardCount} {snapshot.badgeAwardCount === 1 ? "badge" : "badges"}</small></div></li>)}</ol> : <p>Een afgerond hoofdstuk blijft hier als vaste herinnering bewaard.</p>}</section>
    </div>
    {selectedItem ? <section className="child-goal-detail">
      <article className="child-card"><small>Mijn doel</small><h2>{selectedItem.name}</h2><p>{selectedItem.description || "Oefen dit onderdeel stap voor stap tijdens je lessen."}</p><strong>{observation ? `${observation.rating} van 5 stappen behaald` : "Nog niet beoordeeld"}</strong></article>
      <article className="child-card child-goal-support"><small>Tip voor jou</small><h2>{childVisibleTip ?? "Blijf rustig oefenen"}</h2><p>Vraag je trainer tijdens de les om dit onderdeel samen nog eens te proberen.</p>{selectedItem.instructionalVideo ? <div className="child-instruction-video"><video controls playsInline preload="metadata"><source src={selectedItem.instructionalVideo.url} /><track default kind="captions" label="Nederlands" src={selectedItem.instructionalVideo.captionsUrl} srcLang="nl" /></video><strong>{selectedItem.instructionalVideo.title}</strong><details><summary>Lees het transcript</summary><p>{selectedItem.instructionalVideo.transcript}</p></details></div> : null}</article>
    </section> : null}
    {data.journey?.rings.length ? <section className="child-card child-rings-card"><h2>Mijn voortgang</h2><SwimJourneyRings labels={{ stage: "badje", diploma: "diploma" }} rings={data.journey.rings} /></section> : null}
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
