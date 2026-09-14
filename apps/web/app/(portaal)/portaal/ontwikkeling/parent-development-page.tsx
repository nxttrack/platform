import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalDevelopment } from "@/components/portal/development/portal-development";
import { getParentPortalData, getActiveEnrollmentForParticipant, getActiveMembershipsForParticipant } from "@/lib/domain/parent-portal";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { getJourneyForEnrollment } from "@/lib/domain/swim-progress";
import { parentDevelopmentView, chapterJourneyView } from "@/lib/domain/portal-development-view";
import { resolveHistoricalJourneyVisual } from "@/lib/theme/portal-journey-server";
import LegacyParentDevelopmentPage from "./legacy-parent-development-page";

export const dynamic = "force-dynamic";
const value = (entry: string | string[] | undefined) => Array.isArray(entry) ? entry[0] : entry;

export default async function ParentDevelopmentPage({ searchParams }: { searchParams?: Promise<ParentPortalSearchParams> }) {
  const [data, params] = await Promise.all([getParentPortalData(), searchParams ?? Promise.resolve<ParentPortalSearchParams>({})]);
  const requested = value(params.kind);
  if (requested && requested !== "all" && !data.participants.some((participant) => participant.id === requested)) notFound();
  const selectedId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id)) ?? (!requested && data.participants.length === 1 ? data.participants[0].id : null);
  const participant = data.participants.find((entry) => entry.id === selectedId);
  if (!participant) return <div className="space-y-6"><header><p className="text-sm text-primary">Inzicht en historie</p><h1 className="text-3xl font-bold">Ontwikkeling van je kinderen</h1><p className="mt-2 text-muted-foreground">Kies een kind voor onderdelen, beoordelingen en mijlpalen.</p></header><div className="grid gap-4 md:grid-cols-2">{data.participants.map((entry) => {
    const journey = getJourneyForEnrollment(data.swimJourneys, getActiveEnrollmentForParticipant(data, entry.id)?.id), model = journey ? parentDevelopmentView(journey) : null;
    const items = model?.items.filter((item) => item.current) ?? [];
    return <article className="space-y-4 rounded-2xl border bg-card p-5" key={entry.id}><h2 className="text-xl font-bold">{entry.display_name}</h2><p>{journey?.currentStage?.name ?? "Jouw ontwikkeling"}</p>{model ? <p>{items.filter((item) => item.completed).length} van {items.length} onderdelen behaald</p> : null}<div className="flex flex-wrap gap-3"><Link className="rounded-xl bg-primary p-3 font-bold text-primary-foreground" href={participantContextHref("/portaal/ontwikkeling", entry.id)}>Bekijk ontwikkeling</Link><Link className="rounded-xl border p-3" href={participantContextHref("/portaal", entry.id)}>Zwemwereld</Link></div></article>;
  })}</div>{!data.participants.length ? <p className="rounded-xl border border-dashed p-5">Er zijn nog geen kinderen gekoppeld.</p> : <p className="text-sm text-muted-foreground">Ieder kind houdt eigen beoordelingen en historie. Er wordt geen gezamenlijke gezinsscore berekend.</p>}</div>;
  const journey = getJourneyForEnrollment(data.swimJourneys, getActiveEnrollmentForParticipant(data, participant.id)?.id);
  // Existing non-canonical/non-swim programs retain their established progress modules and actions.
  if (!journey) return <LegacyParentDevelopmentPage searchParams={Promise.resolve({ ...params, kind: participant.id })} />;
  const model = parentDevelopmentView(journey), selectedItem = value(params.onderdeel) ?? value(params.focus), selectedChapter = value(params.hoofdstuk);
  if (selectedItem && !model.items.some((item) => item.id === selectedItem)) notFound();
  if (selectedChapter && !journey.chapterSnapshots.some((entry) => entry.id === selectedChapter)) notFound();
  const chapters = await Promise.all(journey.chapterSnapshots.map(async (snapshot) => {
    const visual = await resolveHistoricalJourneyVisual(snapshot), view = chapterJourneyView(journey, snapshot);
    return { id: snapshot.id, stageId: snapshot.curriculum_stage_id, title: view.stageName ?? "Afgerond hoofdstuk", completedAt: snapshot.completed_at,
      badgeCount: snapshot.badge_award_ids.length, themeRelease: snapshot.theme_release, items: view.nodes.map((item) => ({ id: item.id, label: item.label, rating: item.rating })), available: visual !== null };
  }));
  const memberships = getActiveMembershipsForParticipant(data, participant.id), groupIds = new Set(memberships.map((entry) => entry.group_id));
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-primary">Inzicht en historie</p><h1 className="text-3xl font-bold">Ontwikkeling</h1><p className="mt-2 text-muted-foreground">De groei van {participant.display_name}, stap voor stap.</p><p className="mt-1 text-sm">{data.groups.filter((group) => groupIds.has(group.id)).map((group) => group.name).join(" · ")}</p></div><Link className="rounded-xl border bg-card p-3 font-semibold" href={participantContextHref("/portaal", participant.id)}>Terug naar zwemwereld</Link></header>
    {data.participants.length > 1 ? <nav aria-label="Kind in ontwikkeling" className="flex flex-wrap gap-2">{data.participants.map((entry) => <Link key={entry.id} className="rounded-xl border bg-card p-3" aria-current={entry.id === participant.id ? "page" : undefined} href={participantContextHref("/portaal/ontwikkeling", entry.id)}>{entry.display_name}</Link>)}<Link className="rounded-xl border p-3" href="/portaal/ontwikkeling?kind=all">Alle kinderen</Link></nav> : null}
    <PortalDevelopment key={participant.id} contextKey={`parent:${data.user.id}:${data.tenant.id}:${participant.id}:${journey.version.id}`} participantId={participant.id} model={model} chapters={chapters}
      badges={data.badgeAwards.filter((award) => award.participant_id === participant.id && award.status === "awarded" && award.visibility === "parent_visible").map((award) => ({ id: award.id, title: award.title, date: award.awarded_at, description: award.note }))} />
    <nav aria-label="Meer ontwikkeling" className="flex flex-wrap gap-3">{[["badges", "Alle badges"], ["media", "Media"], ["diplomas", "Diploma’s en bewijzen"]].map(([path, title]) => <Link className="rounded-xl border bg-card p-3" key={path} href={participantContextHref(`/portaal/ontwikkeling/${path}`, participant.id)}>{title}</Link>)}</nav>
  </div>;
}
