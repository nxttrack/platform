import { Bot, Clock3, Send, UserCheck } from "lucide-react";

import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptyState } from "@/components/admin/domain-ui";
import { PendingIntakesTable, PlacementCockpit, type PlacementCockpitRow } from "@/components/admin/placement-cockpit";
import { PageHeader } from "@/components/shell/ui";
import { computePlacementScores, getPlacementDashboardData } from "@/lib/domain/placement";
import { toSmartActivityItem } from "@/lib/domain/smart-event-contract";
import { getTenantSmartEvents } from "@/lib/domain/smart-events";
import { calculateSmartPlacementSuggestionsForEntries } from "@/lib/domain/smart-placement";
import { calculateWaitTimeBands } from "@/lib/domain/wait-time";
import type { WaitTimeQuery } from "@/lib/domain/wait-time-contract";
import { compareIntakeOperationalOrder, compareWaitlistOperationalOrder } from "@/lib/ui/status-meta";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminWaitlistPage({ searchParams }: PageProps) {
  const [data, smartEvents] = await Promise.all([getPlacementDashboardData(), getTenantSmartEvents()]);
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const offerLink = getParam(params, "aanbod");
  const testFilter = getParam(params, "testdata") ?? "all";
  const query = getParam(params, "q");
  const waitlistIntakeIds = new Set(data.waitlistEntries.flatMap((entry) => (entry.intake_submission_id ? [entry.intake_submission_id] : [])));
  const pendingIntakes = data.intakeSubmissions
    .filter((submission) => submission.program_id && ["received", "reviewing"].includes(submission.status) && !waitlistIntakeIds.has(submission.id) && matchesTestFilter(submission.is_test, testFilter))
    .sort(compareIntakeOperationalOrder);
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const preferencesByEntry = groupBy(data.waitlistPreferences, "waitlist_entry_id");
  const scoresByEntry = groupBy(data.placementScores, "waitlist_entry_id");
  const offersByEntry = groupBy(data.slotOffers, "waitlist_entry_id");
  const visibleWaitlist = data.waitlistEntries.filter((entry) => matchesTestFilter(entry.is_test, testFilter)).sort(compareWaitlistOperationalOrder);
  const waitRequestByEntry = new Map(visibleWaitlist.map((entry) => {
    const preference = (preferencesByEntry.get(entry.id) ?? [])[0];
    return [entry.id, {
      programId: entry.program_id,
      stageId: entry.recommended_stage_id,
      preferredDay: preference?.weekday ?? null,
      preferredTimeBlock: preference ? derivePreferenceBlock(preference.starts_after) : null
    } satisfies WaitTimeQuery] as const;
  }));
  const waitTimeRequests = [...waitRequestByEntry.values()];
  const waitTimes = await calculateWaitTimeBands({
    tenantId: data.tenant.id,
    requests: waitTimeRequests
  });
  const waitTimeByScope = new Map(waitTimes.map((row) => [waitTimeKey(row.query), row.prediction]));
  const smartPlacements = await calculateSmartPlacementSuggestionsForEntries({
    tenantId: data.tenant.id,
    entries: visibleWaitlist,
    preferences: data.waitlistPreferences,
    groups: data.groups
  });
  const cockpitRows: PlacementCockpitRow[] = visibleWaitlist.map((entry) => {
    const stored = scoresByEntry.get(entry.id) ?? [];
    const computed = computePlacementScores({ entry, preferences: preferencesByEntry.get(entry.id) ?? [], groups: data.groups, memberships: data.groupMemberships });
    const smart = smartPlacements.get(entry.id) ?? [];
    const proposals: PlacementCockpitRow["proposals"] = smart.length
      ? smart.map((score) => ({
          capacity: score.capacitySnapshot.available,
          capacityFixed: score.capacitySnapshot.fixed,
          capacityUsed: score.capacitySnapshot.used,
          confidence: score.confidence,
          groupId: score.groupId,
          groupName: score.groupName,
          reasons: score.reasons,
          blockers: score.blockers,
          score: score.score,
          canOffer: score.canOffer
        }))
      : stored.length
        ? stored.map((score) => ({
            capacity: score.capacity_available,
            capacityFixed: groupById.get(score.group_id)?.capacity ?? score.capacity_available,
            capacityUsed: Math.max(0, (groupById.get(score.group_id)?.capacity ?? score.capacity_available) - score.capacity_available),
            confidence: 0.35,
            groupId: score.group_id,
            groupName: groupById.get(score.group_id)?.name ?? "Groep",
            reasons: score.reasons.map((reason) => ({ label: reason, explanation: "Bestaande basisplaatsingsscore.", evidence: "legacy placement score" })),
            blockers: [],
            score: Number(score.score),
            canOffer: score.capacity_available > 0
          }))
        : computed.map((score) => ({
            capacity: score.capacityAvailable,
            capacityFixed: score.group.capacity,
            capacityUsed: Math.max(0, score.group.capacity - score.capacityAvailable),
            confidence: 0.3,
            groupId: score.group.id,
            groupName: score.group.name,
            reasons: score.reasons.map((reason) => ({ label: reason, explanation: "Bestaande basisplaatsingsscore.", evidence: "live groepsdata" })),
            blockers: [],
            score: score.score,
            canOffer: score.capacityAvailable > 0
          }));
    return {
      id: entry.id,
      participantName: entry.participant_name,
      parentName: entry.parent_name,
      parentEmail: entry.parent_email,
      program: programById.get(entry.program_id)?.name ?? "Programma onbekend",
      stage: entry.recommended_stage_id ? stageById.get(entry.recommended_stage_id)?.name ?? null : null,
      status: entry.status,
      priorityDate: entry.priority_date,
      isTest: entry.is_test,
      journeyRunId: entry.journey_run_id,
      minimumAgeBlocked: entry.minimum_age_blocked,
      eligibleFrom: entry.eligible_from,
      waitTime: waitTimeByScope.get(waitTimeKey(waitRequestByEntry.get(entry.id)!)) ?? insufficientWaitTime(),
      proposals,
      offerGroups: getOfferGroups(entry.program_id, proposals.filter((proposal) => proposal.canOffer).map((proposal) => proposal.groupId), data.groups, proposals.length > 0),
      offers: (offersByEntry.get(entry.id) ?? []).map((offer) => ({ deliveryStatus: offer.delivery_status, groupName: groupById.get(offer.group_id)?.name ?? "Groep", status: offer.status }))
      ,
      preferences: (preferencesByEntry.get(entry.id) ?? []).map((preference) => formatPreference(preference.weekday, preference.starts_after, preference.ends_before)),
      auditEvents: data.auditEvents.filter((event) => event.waitlist_entry_id === entry.id).slice(0, 12).map((event) => ({ createdAt: event.created_at, eventType: event.event_type, message: event.message ?? "" })),
      smartEvents: smartEvents
        .filter((event) =>
          (event.entity_type === "waitlist_entry" && event.entity_id === entry.id) ||
          event.metadata_json.waitlist_entry_id === entry.id ||
          event.metadata_json.waitlistEntryId === entry.id
        )
        .slice(0, 20)
        .map(toSmartActivityItem)
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader kicker="Leerlingen" title="Wachtlijst en plaatsing" subtitle="Accepteer nieuwe kandidaten, bewaak FIFO en open verklaarbare plaatsingsmogelijkheden vanuit één operationele lijst." />
      <Feedback saved={saved} error={error} offerLink={offerLink} />
      <AdminFilterPills current={testFilter} href={(value) => `/admin/wachtlijst?testdata=${value}`} items={[{ label: "Alle", value: "all" }, { label: "Verberg testdata", value: "hide" }, { label: "Alleen testdata", value: "only" }]} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={UserCheck} label="Te beoordelen" tone="warning" value={pendingIntakes.length} />
        <AdminMetricCard icon={Clock3} label="Op wachtlijst" value={visibleWaitlist.filter((entry) => entry.status === "waiting").length} />
        <AdminMetricCard icon={Send} label="Aanbiedingen" tone="success" value={data.slotOffers.filter((offer) => offer.status === "sent").length} />
        <AdminMetricCard icon={Bot} label="Journey Bot" tone="info" value={data.waitlistEntries.filter((entry) => entry.is_test).length} />
      </div>

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Nieuwe wachtlijstkandidaten</h2><p className="text-[13px] text-muted-foreground">Accepteer of weiger eerst; pas na acceptatie verschijnen plaatsingsacties.</p></div>
        {pendingIntakes.length === 0 ? (
          <EmptyState>Geen nieuwe programmagelinkte intakes om om te zetten.</EmptyState>
        ) : (
          <PendingIntakesTable rows={pendingIntakes.map((submission) => ({ id: submission.id, isTest: submission.is_test, option: submission.selected_option, parentName: submission.parent_name, participantName: submission.participant_name, program: programById.get(submission.program_id ?? "")?.name ?? "Programma onbekend", receivedAt: submission.received_at }))} />
        )}
      </AdminListSurface>

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Smart Placement & Capacity</h2><p className="text-[13px] text-muted-foreground">Vergelijk verklaarbare voorstellen, respecteer leeftijd en FIFO en keur handmatig goed.</p></div>
        {visibleWaitlist.length === 0 ? (
          <EmptyState>Nog geen wachtlijstentries.</EmptyState>
        ) : (
          <PlacementCockpit initialSearch={query} rows={cockpitRows} />
        )}
      </AdminListSurface>
    </div>
  );
}

function matchesTestFilter(isTest: boolean, filter: string) {
  return filter === "only" ? isTest : filter === "hide" ? !isTest : true;
}

function getOfferGroups(programId: string, scoredGroupIds: string[], groups: { id: string; name: string; program_id: string; status: string }[], hasSuggestions: boolean) {
  if (scoredGroupIds.length > 0) {
    return scoredGroupIds.flatMap((groupId) => groups.find((group) => group.id === groupId) ?? []);
  }

  if (hasSuggestions) return [];
  return groups.filter((group) => group.program_id === programId && group.status === "active");
}

function Feedback({ saved, error, offerLink }: { saved?: string; error?: string; offerLink?: string }) {
  if (offerLink) {
    return (
      <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">
        Aanbodlink aangemaakt: <span className="break-all">{offerLink}</span>
      </p>
    );
  }

  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{saved === "declined" ? "Kandidaat is geweigerd en blijft als afgehandelde aanvraag bewaard." : saved === "direct_placement" ? "Directe plaatsing is transactioneel uitgevoerd en in de auditlog vastgelegd." : "Wachtlijstactie opgeslagen."}</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function formatPreference(weekday: number, startsAfter: string | null, endsBefore: string | null) {
  const weekdays = ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
  const time = startsAfter || endsBefore ? `${startsAfter?.slice(0, 5) ?? "start"}–${endsBefore?.slice(0, 5) ?? "einde"}` : "ieder tijdstip";
  return `${weekdays[weekday] ?? "dag"} ${time}`;
}

function derivePreferenceBlock(startsAfter: string | null) {
  if (!startsAfter) return null;
  const hour = Number(startsAfter.slice(0, 2));
  return hour < 12 ? "morning" as const : hour < 17 ? "afternoon" as const : "evening" as const;
}

function waitTimeKey(query: WaitTimeQuery) {
  return [query.programId, query.stageId ?? "", query.preferredDay ?? "", query.preferredTimeBlock ?? "", query.locationId ?? ""].join(":");
}

function insufficientWaitTime() {
  return {
    band: "insufficient_data" as const,
    confidence: 0,
    sample_size: 0,
    basis: "insufficient_data" as const,
    reasons: ["geen berekenbare wachttijdgegevens"],
    admin_explanation: "Onvoldoende gegevens om de wachttijdband te berekenen.",
    parent_explanation: "Er is nog onvoldoende informatie voor een betrouwbare wachttijdindicatie.",
    suggested_alternatives: [],
    statistics: {
      medianWeeks: null,
      p75Weeks: null,
      p90Weeks: null,
      inflowPerWeek: 0,
      outflowPerWeek: 0,
      currentWaitlist: 0,
      availableCapacity: 0
    }
  };
}

function groupBy<Row extends Record<Key, string>, Key extends string>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    grouped.set(row[key], [...(grouped.get(row[key]) ?? []), row]);
  }

  return grouped;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
