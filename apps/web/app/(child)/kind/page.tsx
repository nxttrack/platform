import { Award, CalendarDays, Map, MessageCircleHeart, Sparkles } from "lucide-react";
import Link from "next/link";

import { PortalJourney } from "@/components/portal/journey/portal-journey";
import { resolvePortalJourneyVisual } from "@/lib/theme/portal-journey-server";
import { formatChildLessonDate } from "@/lib/date/child-lesson-date";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ChildTodayPage() {
  const data = await getChildPortalData();
  const nextLesson = data.lessons[0] ?? null;
  const theme = data.theme.manifest;
  const journeyVisual = await resolvePortalJourneyVisual(data.tenant.id, data.journey?.view ?? null, theme);
  const terminology = getPortalTerminology(theme, data.tenant.sector);
  const latestCompliment = data.journey?.effectiveObservations.find(
    (observation) => observation.childVisible
  )?.positiveLabel ?? null;
  const earnedBadges = data.badges.filter((badge) => badge.earned);
  const latestBadge = earnedBadges[0] ?? null;
  return <div className="child-page child-today" data-child-route-state="today">
    <PortalJourney audience="child" contextKey={`child:${data.tenant.id}:${data.child.id}:${data.journey?.view?.curriculumVersionId ?? "none"}`} title={`Jouw reis, ${data.child.firstName}`} model={data.journey?.view ?? null} presentation={journeyVisual.presentation} worldId={journeyVisual.worldId} assetUrls={journeyVisual.assetUrls} reducedMotion={data.preferences.reducedMotion}
      lesson={nextLesson ? { label: formatChildLessonDate(nextLesson.startsAt, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }, data.tenant.timeZone), href: "/kind/agenda" } : null} />
    <details className="child-card"><summary>Mijn les en momenten</summary>
      <aside className="child-today__info">
        <section><CalendarDays aria-hidden="true" /><small>Volgende {terminology.activity}</small><strong>{nextLesson ? formatDate(nextLesson.startsAt, data.tenant.timeZone) : "Nog niet gepland"}</strong><span>{nextLesson?.locationName ?? "Je ouder ziet de details"}</span></section>
        <section><MessageCircleHeart aria-hidden="true" /><small>Compliment</small><strong>{latestCompliment ?? "Iedere oefening telt"}</strong><span>{latestCompliment ? "Speciaal door je trainer gekozen" : "Hier lees je straks een compliment van je trainer"}</span></section>
        <section><Award aria-hidden="true" /><small>Laatste mijlpaal</small><strong>{latestBadge?.title ?? "Je eerste badge komt eraan"}</strong><span>{latestBadge ? "Mooi verdiend!" : "Blijf lekker oefenen"}</span></section>
      </aside>
    </details>
    <div className="child-quick-grid">
      <Link href="/kind/reis"><Map /><span><strong>Mijn reis</strong><small>Ontdek je volgende stap</small></span></Link>
      <Link href="/kind/badges"><Award /><span><strong>{earnedBadges.length} badges</strong><small>Bekijk wat je hebt verdiend</small></span></Link>
      <Link href="/kind/ik?tab=momenten"><Sparkles /><span><strong>Mijn momenten</strong><small>{data.media.length ? `${data.media.length} mooie herinneringen` : "Binnenkort meer"}</small></span></Link>
    </div>
  </div>;
}

function formatDate(value: string, timeZone: string) {
  return formatChildLessonDate(value, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }, timeZone);
}
