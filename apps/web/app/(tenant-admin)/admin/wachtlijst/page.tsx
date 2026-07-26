import { Bot, Clock3, Send, UserCheck } from "lucide-react";

import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptyState } from "@/components/admin/domain-ui";
import { PendingIntakesTable, PlacementCockpit, type PlacementCockpitRow } from "@/components/admin/placement-cockpit";
import { PageHeader } from "@/components/shell/ui";
import { computePlacementScores, getPlacementDashboardData } from "@/lib/domain/placement";
import { compareIntakeOperationalOrder, compareWaitlistOperationalOrder } from "@/lib/ui/status-meta";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminWaitlistPage({ searchParams }: PageProps) {
  const data = await getPlacementDashboardData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const offerLink = getParam(params, "aanbod");
  const testFilter = getParam(params, "testdata") ?? "all";
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
  const cockpitRows: PlacementCockpitRow[] = visibleWaitlist.map((entry) => {
    const stored = scoresByEntry.get(entry.id) ?? [];
    const computed = computePlacementScores({ entry, preferences: preferencesByEntry.get(entry.id) ?? [], groups: data.groups, memberships: data.groupMemberships });
    const proposals = stored.length ? stored.map((score) => ({ capacity: score.capacity_available, groupId: score.group_id, groupName: groupById.get(score.group_id)?.name ?? "Groep", reasons: score.reasons, score: Number(score.score) })) : computed.map((score) => ({ capacity: score.capacityAvailable, groupId: score.group.id, groupName: score.group.name, reasons: score.reasons, score: score.score }));
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
      proposals,
      offerGroups: getOfferGroups(entry.program_id, proposals.map((proposal) => proposal.groupId), data.groups),
      offers: (offersByEntry.get(entry.id) ?? []).map((offer) => ({ deliveryStatus: offer.delivery_status, groupName: groupById.get(offer.group_id)?.name ?? "Groep", status: offer.status }))
      ,
      preferences: (preferencesByEntry.get(entry.id) ?? []).map((preference) => formatPreference(preference.weekday, preference.starts_after, preference.ends_before)),
      auditEvents: data.auditEvents.filter((event) => event.waitlist_entry_id === entry.id).slice(0, 12).map((event) => ({ createdAt: event.created_at, eventType: event.event_type, message: event.message ?? "" }))
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
          <PlacementCockpit rows={cockpitRows} />
        )}
      </AdminListSurface>
    </div>
  );
}

function matchesTestFilter(isTest: boolean, filter: string) {
  return filter === "only" ? isTest : filter === "hide" ? !isTest : true;
}

function getOfferGroups(programId: string, scoredGroupIds: string[], groups: { id: string; name: string; program_id: string; status: string }[]) {
  if (scoredGroupIds.length > 0) {
    return scoredGroupIds.flatMap((groupId) => groups.find((group) => group.id === groupId) ?? []);
  }

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
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">{saved === "declined" ? "Kandidaat is geweigerd en blijft als afgehandelde aanvraag bewaard." : "Wachtlijstactie opgeslagen."}</p>;
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
