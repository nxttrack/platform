import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalJourney } from "@/components/portal/journey/portal-journey";
import { PortalDevelopment } from "@/components/portal/development/portal-development";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { resolvePortalJourneyVisual } from "@/lib/theme/portal-journey-server";

export const dynamic = "force-dynamic";
type Params = Record<string, string | string[] | undefined>;
const value = (entry: string | string[] | undefined) => Array.isArray(entry) ? entry[0] : entry;

export default async function ChildJourneyPage({ searchParams }: { searchParams?: Promise<Params> }) {
  const [data, params] = await Promise.all([getChildPortalData(), searchParams ?? Promise.resolve<Params>({})]);
  const chapterId = value(params.hoofdstuk), selectedId = value(params.onderdeel) ?? value(params.focus);
  const chapter = chapterId ? data.journey?.chapterSnapshots.find((snapshot) => snapshot.id === chapterId) : null;
  if (chapterId && !chapter) notFound();
  const model = chapter ? chapter.view ?? null : data.journey?.view ?? null;
  if (selectedId && !(chapter ? model?.nodes.some((item) => item.id === selectedId) : data.journey?.development?.items.some((item) => item.id === selectedId))) notFound();
  const visual = chapter ? chapter.visual : await resolvePortalJourneyVisual(data.tenant.id, model, data.theme.manifest);
  return <div className="child-page" data-child-route-state={chapter ? "chapter" : selectedId ? "goal-detail" : "journey"}>
    {chapter ? <div className="child-card"><p>Een bewaarde herinnering · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: data.tenant.timeZone }).format(new Date(chapter.completedAt))}</p><Link className="mt-2 inline-flex rounded-lg border p-3" href="/kind/reis">Mijn huidige reis</Link></div> : null}
    {visual ? <PortalJourney events={chapter ? chapter.events : data.journey?.events} audience="child" collectionContext={{ audience: "child", tenantId: data.tenant.id, participantId: data.child.id }} contextKey={`child:${data.tenant.id}:${data.child.id}:${data.journey?.view?.curriculumVersionId ?? "none"}${chapter ? `:chapter:${chapter.id}` : ""}`} title={chapter ? model?.stageName ?? "Mijn eerdere reis" : `Jouw reis, ${data.child.firstName}`} model={model} presentation={visual.presentation} worldId={visual.worldId} assetUrls={visual.assetUrls} reducedMotion={data.preferences.reducedMotion} /> : <section className="child-card"><h1>De beelden van deze herinnering zijn niet beschikbaar</h1><p>De opgeslagen scores en momenten blijven behouden.</p></section>}
    {data.journey?.development ? <section id="reis-ontwikkeling" aria-label="Mijn onderdelen en momenten">
      <PortalDevelopment key={`${data.child.id}:${data.journey.view?.curriculumVersionId}`} audience="child" participantId={data.child.id} contextKey={`child:${data.tenant.id}:${data.child.id}:${data.journey.view?.curriculumVersionId}`} model={data.journey.development}
        chapters={data.journey.chapterSnapshots.map((snapshot) => ({ id: snapshot.id, stageId: snapshot.curriculumStageId, title: data.journey!.stages.find((stage) => stage.id === snapshot.curriculumStageId)?.name ?? "Afgerond hoofdstuk", completedAt: snapshot.completedAt, badgeCount: snapshot.badgeAwardCount, themeRelease: snapshot.themeRelease, available: !!snapshot.visual, items: snapshot.view?.nodes.map((item) => ({ id: item.id, label: item.label, rating: item.rating })) ?? [] }))}
        badges={data.badges.filter((badge) => badge.earned).map((badge) => ({ id: badge.id, title: badge.title, date: badge.earnedAt, description: null }))}
        itemContent={Object.fromEntries(data.journey.currentStageItems.flatMap((item) => item.instructionalVideo ? [[item.stableKey, <section className="child-instruction-video" key={item.stableKey}><h3 className="font-bold">{item.instructionalVideo.title}</h3><video controls playsInline preload="metadata"><source src={item.instructionalVideo.url} /><track default kind="captions" label="Nederlands" src={item.instructionalVideo.captionsUrl} srcLang="nl" /></video><details><summary>Lees het transcript</summary><p>{item.instructionalVideo.transcript}</p></details></section>]] : []))} />
    </section> : <section className="child-card"><h2>Mijn onderdelen</h2><p>Je doelen worden zichtbaar zodra jouw programma is gestart.</p></section>}
  </div>;
}
