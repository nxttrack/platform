import { Award, CalendarDays, Map, MessageCircleHeart, Sparkles } from "lucide-react";
import Link from "next/link";

import { ChildJourneyMap } from "@/components/child/child-journey-map";
import { ProgressRing } from "@/components/shell/ui";
import { childJourneyEvents, childJourneyNodes } from "@/lib/domain/child-journey-view";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ChildTodayPage() {
  const data = await getChildPortalData();
  const nextLesson = data.lessons[0] ?? null;
  const rings = data.journey?.rings ?? [];
  const theme = data.theme.manifest;
  const terminology = getPortalTerminology(theme, data.tenant.sector);
  const latestCompliment = data.journey?.effectiveObservations.find(
    (observation) => observation.childVisible
  )?.positiveLabel ?? "Goed bezig! Iedere oefening telt.";
  const earnedBadges = data.badges.filter((badge) => badge.earned);
  const latestBadge = earnedBadges[0] ?? null;
  return <div className="child-page child-today" data-child-route-state="today">
    <header className="child-page__heading">
      <span>Hoi {data.child.firstName}!</span>
      <h1>Dit is jouw avontuur van vandaag</h1>
      <p>Bekijk je volgende stap, je les en alles wat je al hebt bereikt.</p>
    </header>
    <div className="child-today__grid">
      <div className="child-today__quest">
        <ChildJourneyMap
          desktopArtwork={theme.assets["overview.hero.desktop"]?.path ?? null}
          events={childJourneyEvents(data.journey)}
          mascotKind={theme.experience.mascot}
          mascotUrl={theme.assets["mascot.idle"]?.path ?? null}
          mobileArtwork={theme.assets["overview.hero.mobile"]?.path ?? null}
          nodes={childJourneyNodes(data.journey)}
        />
        <section className="child-today__mobile-lesson" data-journey-exclusion><CalendarDays aria-hidden="true" /><span><small>Volgende {terminology.activity}</small><strong>{nextLesson ? formatDate(nextLesson.startsAt) : "Nog niet gepland"}</strong></span></section>
        {rings.length ? <section aria-label="Mijn voortgang" className="child-today__quest-rings" data-journey-exclusion>
          {rings.map((ring) => <div key={`${ring.kind}:${ring.key}`}>
            <ProgressRing label={ring.kind === "stage" ? "badje" : "diploma"} size={62} value={ring.progressPercent} />
            <small>{ring.kind === "stage" ? "Dit badje" : "Naar diploma"}</small>
          </div>)}
        </section> : null}
      </div>
      <aside className="child-today__info">
        <section><CalendarDays aria-hidden="true" /><small>Volgende {terminology.activity}</small><strong>{nextLesson ? formatDate(nextLesson.startsAt) : "Nog niet gepland"}</strong><span>{nextLesson?.locationName ?? "Je ouder ziet de details"}</span></section>
        <section><MessageCircleHeart aria-hidden="true" /><small>Compliment</small><strong>{latestCompliment}</strong><span>Speciaal door je trainer gekozen</span></section>
        <section><Award aria-hidden="true" /><small>Laatste mijlpaal</small><strong>{latestBadge?.title ?? "Je eerste badge komt eraan"}</strong><span>{latestBadge ? "Mooi verdiend!" : "Blijf lekker oefenen"}</span></section>
      </aside>
    </div>
    <div className="child-quick-grid">
      <Link href="/kind/reis"><Map /><span><strong>Mijn reis</strong><small>Ontdek je volgende stap</small></span></Link>
      <Link href="/kind/badges"><Award /><span><strong>{earnedBadges.length} badges</strong><small>Bekijk wat je hebt verdiend</small></span></Link>
      <Link href="/kind/ik?tab=momenten"><Sparkles /><span><strong>Mijn momenten</strong><small>{data.media.length ? `${data.media.length} mooie herinneringen` : "Binnenkort meer"}</small></span></Link>
    </div>
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
