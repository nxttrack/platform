import { Backpack, CalendarDays, ChevronRight, Clock3, MapPin, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ChildAgendaPage() {
  const data = await getChildPortalData();
  const terminology = getPortalTerminology(data.theme.manifest, data.tenant.sector);
  const nextLesson = data.lessons[0] ?? null;
  const importantMoment = data.lessons.find((lesson) => lesson.activityType !== "regular") ?? null;
  return <div className="child-page" data-child-route-state="agenda">
    <header className="child-page__heading"><span>Mijn agenda</span><h1>Wanneer is mijn volgende {terminology.activity}?</h1><p>Hier staan alleen jouw {terminology.activities} en bevestigde eindmomenten. Een ouder regelt wijzigingen en betalingen.</p></header>
    <div className="child-agenda-highlight-grid">
      <AgendaHighlight eyebrow="Volgende activiteit" lesson={nextLesson} terminology={terminology} />
      <AgendaHighlight eyebrow="Belangrijk moment" lesson={importantMoment} terminology={terminology} />
    </div>
    <section className="child-card child-lesson-list">
      {data.lessons.length ? data.lessons.map((lesson) => <Link href={`/kind/agenda/lessen/${lesson.id}`} key={lesson.id}>
        <span className="child-lesson-date"><b>{new Date(lesson.startsAt).getDate()}</b><small>{new Intl.DateTimeFormat("nl-NL", { month: "short" }).format(new Date(lesson.startsAt))}</small></span>
        <span><strong>{lesson.groupName}</strong><small><CalendarDays /> {formatTime(lesson.startsAt, lesson.endsAt)}</small>{lesson.activityType !== "regular" ? <small><Sparkles /> {activityLabel(lesson.activityType, terminology.finalMoment)}</small> : null}{lesson.locationName ? <small><MapPin /> {lesson.locationName}</small> : null}{lesson.trainerFirstName ? <small><UserRound /> {terminology.instructor} {lesson.trainerFirstName}</small> : null}{lesson.supplies.length ? <small><Backpack /> {lesson.supplies.join(", ")}</small> : null}</span>
        <ChevronRight aria-hidden="true" />
      </Link>) : <div className="child-empty"><CalendarDays /><h2>Nog geen les gepland</h2><p>Vraag je ouder als je wilt weten wanneer je volgende les is.</p></div>}
    </section>
  </div>;
}
function formatTime(start: string, end: string) { const f = new Intl.DateTimeFormat("nl-NL", { weekday: "long", hour: "2-digit", minute: "2-digit" }); return `${f.format(new Date(start))} – ${new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(end))}`; }

function AgendaHighlight({ eyebrow, lesson, terminology }: {
  eyebrow: string;
  lesson: Awaited<ReturnType<typeof getChildPortalData>>["lessons"][number] | null;
  terminology: ReturnType<typeof getPortalTerminology>;
}) {
  return <section className="child-card child-agenda-highlight">
    <small>{eyebrow}</small>
    {lesson ? <><h2>{lesson.groupName}</h2><p><Clock3 /> {formatTime(lesson.startsAt, lesson.endsAt)}</p>{lesson.locationName ? <p><MapPin /> {lesson.locationName}</p> : null}<strong>{countdownLabel(lesson.startsAt, terminology.activity)}</strong><Link href={`/kind/agenda/lessen/${lesson.id}`}>Bekijk details <ChevronRight /></Link></> : <><h2>Nog niet gepland</h2><p>Nieuwe informatie verschijnt zodra de planning rond is.</p></>}
  </section>;
}

function activityLabel(value: Awaited<ReturnType<typeof getChildPortalData>>["lessons"][number]["activityType"], finalMoment: string) {
  if (value === "graduation") return finalMoment;
  if (value === "vacation_course") return "Vakantieactiviteit";
  if (value === "turbo_course") return "Turbocursus";
  if (value === "temporary_series") return "Tijdelijke reeks";
  return "Activiteit";
}

function countdownLabel(startsAt: string, activity: string) {
  const days = Math.max(0, Math.ceil((new Date(startsAt).getTime() - Date.now()) / 86_400_000));
  if (days === 0) return `Vandaag is je ${activity}`;
  if (days === 1) return `Morgen is je ${activity}`;
  return `Nog ${days} dagen`;
}
