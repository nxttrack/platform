import { AdminSection, DataList, DataListRow, EmptyState, SubmitButton } from "@/components/admin/domain-ui";
import { PlacementCockpit, type PlacementCockpitRow } from "@/components/admin/placement-cockpit";
import { PageHeader } from "@/components/shell/ui";
import { createWaitlistEntryFromIntakeAction } from "@/lib/domain/placement-actions";
import { computePlacementScores, getPlacementDashboardData } from "@/lib/domain/placement";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminWaitlistPage({ searchParams }: PageProps) {
  const data = await getPlacementDashboardData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const offerLink = getParam(params, "aanbod");
  const waitlistIntakeIds = new Set(data.waitlistEntries.flatMap((entry) => (entry.intake_submission_id ? [entry.intake_submission_id] : [])));
  const pendingIntakes = data.intakeSubmissions.filter((submission) => submission.program_id && !waitlistIntakeIds.has(submission.id));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const preferencesByEntry = groupBy(data.waitlistPreferences, "waitlist_entry_id");
  const scoresByEntry = groupBy(data.placementScores, "waitlist_entry_id");
  const offersByEntry = groupBy(data.slotOffers, "waitlist_entry_id");
  const cockpitRows: PlacementCockpitRow[] = data.waitlistEntries.map((entry) => {
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
      proposals,
      offerGroups: getOfferGroups(entry.program_id, proposals.map((proposal) => proposal.groupId), data.groups),
      offers: (offersByEntry.get(entry.id) ?? []).map((offer) => ({ deliveryStatus: offer.delivery_status, groupName: groupById.get(offer.group_id)?.name ?? "Groep", status: offer.status }))
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader kicker="Placement assistant" title="Wachtlijst en plaatsing" subtitle="Zet intake om naar wachtlijst, score beschikbare groepen en verstuur een aanbodlink." />
      <Feedback saved={saved} error={error} offerLink={offerLink} />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Nieuwe intakes" value={pendingIntakes.length} />
        <Metric label="Wachtlijst" value={data.waitlistEntries.filter((entry) => entry.status === "waiting").length} />
        <Metric label="Aanbiedingen" value={data.slotOffers.filter((offer) => offer.status === "sent").length} />
        <Metric label="Geplaatst" value={data.waitlistEntries.filter((entry) => entry.status === "placed").length} />
      </div>

      <AdminSection title="Intake naar wachtlijst">
        {pendingIntakes.length === 0 ? (
          <EmptyState>Geen nieuwe programmagelinkte intakes om om te zetten.</EmptyState>
        ) : (
          <DataList>
            {pendingIntakes.map((submission) => (
              <DataListRow
                key={submission.id}
                title={`${submission.participant_name} · ${submission.parent_name}`}
                meta={`${programById.get(submission.program_id ?? "")?.name ?? "Programma onbekend"} · ${submission.selected_option}`}
                aside={
                  <form action={createWaitlistEntryFromIntakeAction}>
                    <input name="intakeSubmissionId" type="hidden" value={submission.id} />
                    <SubmitButton>Maak wachtlijst</SubmitButton>
                  </form>
                }
              />
            ))}
          </DataList>
        )}
      </AdminSection>

      <AdminSection title="Smart Placement & Capacity Cockpit" description="Vergelijk verklaarbare voorstellen, bewaar rolgerichte filters en keur een plaatsing handmatig goed.">
        {data.waitlistEntries.length === 0 ? (
          <EmptyState>Nog geen wachtlijstentries.</EmptyState>
        ) : (
          <PlacementCockpit rows={cockpitRows} />
        )}
      </AdminSection>
    </div>
  );
}

function getOfferGroups(programId: string, scoredGroupIds: string[], groups: { id: string; name: string; program_id: string; status: string }[]) {
  if (scoredGroupIds.length > 0) {
    return scoredGroupIds.flatMap((groupId) => groups.find((group) => group.id === groupId) ?? []);
  }

  return groups.filter((group) => group.program_id === programId && group.status === "active");
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-aqua before:to-primary">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function Feedback({ saved, error, offerLink }: { saved: boolean; error?: string; offerLink?: string }) {
  if (offerLink) {
    return (
      <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">
        Aanbodlink aangemaakt: <span className="break-all">{offerLink}</span>
      </p>
    );
  }

  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
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
