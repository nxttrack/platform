import {
  ArrowRight,
  Award,
  Bell,
  CheckCircle2,
  CreditCard,
  FileText,
  GraduationCap,
  MessageSquare,
  RefreshCcw,
  Waves
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PortalJourney } from "@/components/portal/journey/portal-journey";
import { journeyBadgeEvents } from "@/lib/domain/journey-badge-events";
import { parentJourneyView } from "@/lib/domain/portal-journey-view";
import { resolveHistoricalJourneyVisual, resolvePortalJourneyVisual } from "@/lib/theme/portal-journey-server";
import { chapterJourneyView } from "@/lib/domain/portal-development-view";
import {
  formatLessonDate,
  getActiveEnrollmentForParticipant,
  getNextLesson,
  getParentPortalData
} from "@/lib/domain/parent-portal";
import {
  getSelectedParticipantId,
  participantContextHref,
  type ParentPortalSearchParams
} from "@/lib/domain/parent-portal-selection";
import { getJourneyForEnrollment } from "@/lib/domain/swim-progress";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ParentHomePage({
  searchParams
}: {
  searchParams?: Promise<ParentPortalSearchParams>;
}) {
  const [data, params] = await Promise.all([
    getParentPortalData(),
    searchParams ?? Promise.resolve<ParentPortalSearchParams>({})
  ]);
  const selectedParticipantId = getSelectedParticipantId(
    params,
    data.participants.map((participant) => participant.id)
  );
  const selectedParticipant = selectedParticipantId
    ? data.participants.find((participant) => participant.id === selectedParticipantId) ?? null
    : data.participants[0] ?? null;
  const participantId = selectedParticipant?.id ?? null;
  const visibleParticipantIds = new Set(
    selectedParticipantId
      ? [selectedParticipantId]
      : data.participants.map((participant) => participant.id)
  );
  const enrollment = selectedParticipant
    ? getActiveEnrollmentForParticipant(data, selectedParticipant.id)
    : null;
  const journey = getJourneyForEnrollment(data.swimJourneys, enrollment?.id);
  const nextLesson = selectedParticipant ? getNextLesson(data, selectedParticipant.id) : null;
  const resolvedTheme = data.portalTheme;
  const chapterId = Array.isArray(params.hoofdstuk) ? params.hoofdstuk[0] : params.hoofdstuk;
  const chapter = chapterId ? journey?.chapterSnapshots.find((snapshot) => snapshot.id === chapterId) : null;
  if (chapterId && !chapter) notFound();
  const journeyEvents = journeyBadgeEvents(journey, data.badgeAwards.filter((award) => award.participant_id === participantId && (!award.enrollment_id || award.enrollment_id === enrollment?.id) && (!chapter || chapter.badge_award_ids.includes(award.id))).map((award) => ({
    id: award.id, title: award.title, awardedAt: award.awarded_at, description: award.resolved_description ?? null,
    isSurprise: award.badge_release?.is_surprise === true, triggerEventType: award.trigger_event_type ?? null, triggerContext: award.trigger_context_json ?? {}
  })));
  const journeyModel = chapter && journey ? chapterJourneyView(journey, chapter) : parentJourneyView(journey);
  const journeyVisual = chapter ? await resolveHistoricalJourneyVisual(chapter) : await resolvePortalJourneyVisual(data.tenant.id, journeyModel, resolvedTheme.manifest);
  const terminology = getPortalTerminology(resolvedTheme.manifest, data.tenant.sector);
  const visibleNotifications = data.notifications.filter(
    (notification) =>
      !notification.participant_id || visibleParticipantIds.has(notification.participant_id)
  );
  const unreadNotifications = visibleNotifications.filter(
    (notification) => notification.status === "unread"
  );
  const pendingGraduationInvite = data.graduationParticipants.find(
    (invite) =>
      invite.invite_status === "sent" && visibleParticipantIds.has(invite.participant_id)
  );
  const openPayment = data.manualPayments.find(
    (payment) =>
      ["due", "overdue"].includes(payment.status)
      && visibleParticipantIds.has(payment.participant_id)
  );
  const activeCredits = data.catchUpCredits.filter(
    (credit) =>
      credit.status === "available" && visibleParticipantIds.has(credit.participant_id)
  );
  const actions: DashboardItem[] = [
    ...(pendingGraduationInvite
      ? [{
          href: participantContextHref("/portaal/planning#afzwemmen", participantId),
          icon: <GraduationCap />,
          label: terminology.finalMoment === "afzwemmen" ? "Afzwemuitnodiging" : "Uitnodiging eindmoment",
          meta: `Bevestig het ${terminology.finalMoment}`
        }]
      : []),
    ...(openPayment
      ? [{
          href: participantContextHref("/portaal/betalingen", participantId),
          icon: <CreditCard />,
          label: "Openstaande betaling",
          meta: "Bekijk factuur en betaalstatus"
        }]
      : []),
    ...(activeCredits.length
      ? [{
          href: participantContextHref("/portaal/planning#inhalen", participantId),
          icon: <RefreshCcw />,
          label: `${activeCredits.length} ${activeCredits.length === 1 ? "beschikbare credit" : "beschikbare credits"}`,
          meta: `Kies een passende ${terminology.makeUpActivity}`
        }]
      : [])
  ];
  const updates: DashboardItem[] = [
    ...(journey?.effectiveObservations.slice(0, 2).map((observation) => ({
      href: participantContextHref(
        `/portaal/ontwikkeling?onderdeel=${encodeURIComponent(
          journey.items.find((item) => item.id === observation.curriculum_item_id)?.stable_key
            ?? observation.curriculum_item_id
        )}`,
        participantId
      ),
      icon: <Waves />,
      label: observation.positive_label,
      meta: `Beoordeling ${observation.rating}/5`
    })) ?? []),
    ...data.badgeAwards
      .filter((award) => visibleParticipantIds.has(award.participant_id))
      .slice(0, 1)
      .map((award) => ({
        href: participantContextHref("/portaal/ontwikkeling/badges", participantId),
        icon: <Award />,
        label: award.title,
        meta: "Nieuwe badge behaald"
      }))
  ];
  const messages: DashboardItem[] = visibleNotifications.slice(0, 3).map((notification) => ({
    href: participantContextHref("/portaal/inbox", participantId),
    icon: notification.type === "document_published"
      ? <FileText />
      : notification.type === "badge_award"
        ? <Award />
        : <MessageSquare />,
    label: notification.title,
    meta: notification.status === "unread" ? "Ongelezen" : "Bekeken"
  }));

  return (
    <div className="portal-dashboard dashboard-page">
      {chapter ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><p>Een bewaarde herinnering · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(chapter.completed_at))}</p><Link className="rounded-lg border p-3" href={participantContextHref("/portaal", participantId)}>Huidige reis</Link></div> : null}
      {journeyVisual ? <PortalJourney events={journeyEvents} audience="parent" participantId={participantId} collectionContext={participantId ? { audience: "parent", actorId: data.user.id, tenantId: data.tenant.id, participantId } : undefined} allowCollectionDiscovery={!!participantId && data.mutableParticipantIds.includes(participantId)} contextKey={`parent:${data.user.id}:${data.tenant.id}:${participantId}:${journey?.version.id ?? "none"}${chapter ? `:chapter:${chapter.id}` : ""}`}
        title={chapter ? journeyModel?.stageName ?? "Eerdere reis" : selectedParticipant ? `De reis van ${selectedParticipant.display_name.split(" ")[0]}` : "Jouw leerreis"}
        model={journeyModel} presentation={journeyVisual.presentation} worldId={journeyVisual.worldId} assetUrls={journeyVisual.assetUrls}
        lesson={!chapter && nextLesson ? { label: formatLessonDate(nextLesson.starts_at, nextLesson.ends_at), href: participantContextHref(`/portaal/lessen/${nextLesson.id}`, participantId) } : null} /> : <section className="rounded-xl border bg-card p-5"><h1 className="text-xl font-bold">Deze historische wereld is niet beschikbaar</h1><p>De oorspronkelijke scores en hoofdstuksamenvatting blijven bewaard.</p><Link href={participantContextHref(`/portaal/ontwikkeling?hoofdstuk=${encodeURIComponent(chapterId!)}`, participantId)}>Bekijk de herinnering</Link></section>}

      <details className="rounded-2xl border border-border bg-card p-4"><summary className="cursor-pointer font-bold">Praktisch, updates en berichten ({actions.length + unreadNotifications.length})</summary><div className="portal-dashboard__cards dashboard-cards mt-4">
        <DashboardCard
          emptyIcon={<CheckCircle2 />}
          emptyText="Je bent helemaal bij."
          href={participantContextHref("/portaal/planning", participantId)}
          items={actions}
          subtitle={`${actions.length} ${actions.length === 1 ? "ding" : "dingen"} vragen je aandacht`}
          title="Openstaande acties"
        />
        <DashboardCard
          emptyIcon={<Waves />}
          emptyText="Nieuwe momenten verschijnen na een beoordeling."
          href={participantContextHref("/portaal/ontwikkeling", participantId)}
          items={updates}
          subtitle="Nieuwe momenten in de reis"
          title="Updates"
        />
        <DashboardCard
          emptyIcon={<Bell />}
          emptyText="Er zijn geen nieuwe berichten."
          href={participantContextHref("/portaal/inbox", participantId)}
          items={messages}
          subtitle={`${unreadNotifications.length} ongelezen`}
          title="Berichten"
        />
      </div></details>
    </div>
  );
}

type DashboardItem = {
  href: string;
  icon: ReactNode;
  label: string;
  meta: string;
};

function DashboardCard({
  emptyIcon,
  emptyText,
  href,
  items,
  subtitle,
  title
}: {
  emptyIcon: ReactNode;
  emptyText: string;
  href: string;
  items: DashboardItem[];
  subtitle: string;
  title: string;
}) {
  return (
    <section className="portal-dashboard-card">
      <header>
        <span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </span>
        <Link href={href}>Alles bekijken</Link>
      </header>
      <div className="portal-dashboard-card__items">
        {items.length
          ? items.slice(0, 3).map((item) => (
              <Link className="portal-dashboard-card__item" href={item.href} key={`${item.label}:${item.meta}`}>
                <span aria-hidden="true">{item.icon}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.meta}</small>
                </span>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))
          : (
              <p className="portal-dashboard-card__empty">
                <span aria-hidden="true">{emptyIcon}</span>
                {emptyText}
              </p>
            )}
      </div>
    </section>
  );
}
