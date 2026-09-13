import { Backpack, CalendarDays, ChevronLeft, MapPin, UserRound, Waves } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { createChildParentRequestAction } from "@/lib/domain/child-portal-actions";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ChildLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, data] = await Promise.all([params, getChildPortalData()]);
  const lesson = data.lessons.find((candidate) => candidate.id === id);
  if (!lesson) notFound();
  const terminology = getPortalTerminology(data.theme.manifest, data.tenant.sector);
  return <div className="child-page child-lesson-detail" data-child-route-state="lesson-detail">
    <Link className="child-back-link" href="/kind/agenda"><ChevronLeft /> Terug naar agenda</Link>
    <section className="child-card child-lesson-hero">
      <span>{lesson.kind === "graduation" ? <CalendarDays /> : <Waves />}</span><div><small>{lesson.kind === "graduation" ? terminology.finalMoment : `Jouw ${terminology.activity}`}</small><h1>{lesson.groupName}</h1><p>Veel plezier, {data.child.firstName}!</p></div>
    </section>
    <div className="child-detail-grid">
      <section className="child-card child-lesson-detail-card"><CalendarDays /><small>Lesinformatie</small><strong>{formatDate(lesson.startsAt)}</strong>{lesson.trainerFirstName ? <p><UserRound /> {terminology.instructor} {lesson.trainerFirstName}</p> : null}</section>
      <section className="child-card child-lesson-detail-card"><MapPin /><small>Locatie en benodigdheden</small>{lesson.resourceFields.map((resource) => <p key={`${resource.kind}:${resource.name}`}><strong>{resourceLabel(resource.kind)}</strong> {resource.name}</p>)}{lesson.supplies.length ? <p><Backpack /> <strong>Benodigd</strong> {lesson.supplies.join(", ")}</p> : null}{!lesson.resourceFields.length && !lesson.supplies.length ? <p>Details volgen zodra ze zijn vastgelegd.</p> : null}</section>
    </div>
    <section className="child-card child-safe-message"><strong>Wil je iets vragen of veranderen?</strong><p>In kindmodus kun je geen les afmelden, boeken of betalen.</p>{data.features["swim.portal.parent_requests"] ? <form action={createChildParentRequestAction}><input name="requestType" type="hidden" value={lesson.activityType === "regular" || lesson.kind === "graduation" ? "lesson_help" : "activity_interest"} /><input name="resourceId" type="hidden" value={lesson.id} /><button type="submit">Vraag mijn ouder</button></form> : null}</section>
  </div>;
}
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)); }

function resourceLabel(kind: "lane" | "location" | "other" | "pool" | "room") {
  return { lane: "Baan", location: "Locatie", other: "Plek", pool: "Bad", room: "Ruimte" }[kind];
}
