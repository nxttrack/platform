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
import type { ReactNode } from "react";

import { PortalOverviewHero } from "@/components/parent/portal-overview-hero";
import type { PortalJourneyNode } from "@/components/parent/portal-journey-engine";
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
import {
  orderJourneyNodes,
  resolveJourneyDestination
} from "@/lib/theme/portal-journey-contract";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

export const dynamic = "force-dynamic";

export default async function ParentHomePage({
  searchParams
}: {
  searchParams?: Promise<ParentPortalSearchParams>;
}) {
  const [data, params] = await Promise.all([
    getParentPortalData(),
    searchParams ?? Promise.resolve({})
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
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const enrollment = selectedParticipant
    ? getActiveEnrollmentForParticipant(data, selectedParticipant.id)
    : null;
  const journey = getJourneyForEnrollment(data.swimJourneys, enrollment?.id);
  const nextLesson = selectedParticipant ? getNextLesson(data, selectedParticipant.id) : null;
  const locationId = nextLesson?.resource_id
    ?? (nextLesson ? groupById.get(nextLesson.group_id)?.default_resource_id : null);
  const resolvedTheme = data.portalTheme;
  const terminology = getPortalTerminology(resolvedTheme.manifest);
  const observationByItemId = new Map(
    (journey?.effectiveObservations ?? []).map((observation) => [
      observation.curriculum_item_id,
      observation
    ])
  );
  const openCarryoverItemIds = new Set(
    (journey?.carryovers ?? [])
      .filter((carryover) => carryover.status === "open")
      .map((carryover) => carryover.curriculum_item_id)
  );
  const nodes: PortalJourneyNode[] = orderJourneyNodes((journey?.currentStageItems ?? []).map((item) => {
    const observation = observationByItemId.get(item.id);
    const blocked = item.context_json.blocked === true;
    return {
      id: item.stable_key,
      label: item.name,
      progressPercent: observation ? (observation.rating / 5) * 100 : 0,
      assessed: Boolean(observation),
      completed: observation?.rating === 5,
      completedAt: observation?.rating === 5 ? observation.finalized_at : null,
      curriculumOrder: item.sort_order,
      lastUpdatedAt: observation?.finalized_at ?? null,
      carryover: openCarryoverItemIds.has(item.id),
      blocked,
      blockedReason: blocked && typeof item.context_json.block_reason === "string"
        ? item.context_json.block_reason
        : null
    };
  }));
  const destinationStage = resolveJourneyDestination({
    stages: journey?.stages ?? [],
    currentStageId: journey?.currentStage?.id,
    programName: programById.get(enrollment?.program_id ?? "")?.name,
    fallback: "jouw volgende doel"
  });
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
      <PortalOverviewHero
        child={selectedParticipant
          ? {
              initial:
                selectedParticipant.display_name.trim().charAt(0).toUpperCase() || "★",
              location: locationId
                ? resourceById.get(locationId)?.name ?? null
                : null,
              name: selectedParticipant.display_name,
              nextLesson: nextLesson
                ? formatLessonDate(nextLesson.starts_at, nextLesson.ends_at)
                : null,
              program: enrollment
                ? programById.get(enrollment.program_id)?.name ?? "Programma"
                : "Nog geen programma",
              progressPercent:
                journey?.rings.find((ring) => ring.kind === "diploma")?.progressPercent
                ?? 0,
              stage: journey?.currentStage?.name ?? "Startniveau"
            }
          : null}
        destinationStage={destinationStage}
        displayName={resolvedTheme.displayName}
        href="/portaal/ontwikkeling"
        manifest={resolvedTheme.manifest}
        nodes={nodes}
        participantId={participantId}
        rings={journey?.rings ?? []}
      />

      <div className="portal-dashboard__cards dashboard-cards">
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
      </div>
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
