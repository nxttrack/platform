import { AdminSection, DataList, DataListRow, EmptyState, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createSlotOfferAction, createWaitlistEntryFromIntakeAction, scoreWaitlistEntryAction } from "@/lib/domain/placement-actions";
import { computePlacementScores, getPlacementDashboardData, type PlacementScoreRow, type WaitlistEntryRow } from "@/lib/domain/placement";

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

      <AdminSection title="Placement assistant">
        {data.waitlistEntries.length === 0 ? (
          <EmptyState>Nog geen wachtlijstentries.</EmptyState>
        ) : (
          <div className="space-y-4">
            {data.waitlistEntries.map((entry) => {
              const savedScores = scoresByEntry.get(entry.id) ?? [];
              const computedScores =
                savedScores.length > 0
                  ? savedScores
                  : computePlacementScores({
                      entry,
                      preferences: preferencesByEntry.get(entry.id) ?? [],
                      groups: data.groups,
                      memberships: data.groupMemberships
                    });
              const offers = offersByEntry.get(entry.id) ?? [];

              return (
                <article className="rounded-2xl border border-border bg-white p-4 shadow-soft" key={entry.id}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{programById.get(entry.program_id)?.name ?? "Programma"}</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{entry.participant_name}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {entry.parent_name} · {entry.parent_email}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill tone={entry.status === "waiting" ? "info" : entry.status === "offered" ? "warning" : entry.status === "placed" ? "success" : "neutral"}>{entry.status}</StatusPill>
                      {entry.recommended_stage_id ? <StatusPill>{stageById.get(entry.recommended_stage_id)?.name ?? "Stage"}</StatusPill> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <h4 className="text-sm font-bold text-foreground">Scores</h4>
                        <form action={scoreWaitlistEntryAction}>
                          <input name="waitlistEntryId" type="hidden" value={entry.id} />
                          <button className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted" type="submit">
                            Herbereken
                          </button>
                        </form>
                      </div>
                      <div className="space-y-2">
                        {computedScores.slice(0, 3).map((score) => (
                          <ScoreRow groupName={getScoreGroupName(score, groupById)} key={getScoreGroupId(score)} score={score} />
                        ))}
                        {computedScores.length === 0 ? <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Geen passende actieve groepen.</p> : null}
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-sm font-bold text-foreground">Aanbod maken</h4>
                      <form action={createSlotOfferAction} className="grid gap-3">
                        <input name="waitlistEntryId" type="hidden" value={entry.id} />
                        <SelectField label="Groep" name="groupId" required>
                          <option value="">Kies groep</option>
                          {getOfferGroups(entry, data.placementScores, data.groups).map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                        </SelectField>
                        <SubmitButton>Maak aanbodlink</SubmitButton>
                      </form>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        {offers.slice(0, 3).map((offer) => (
                          <p key={offer.id}>
                            {groupById.get(offer.group_id)?.name ?? "Groep"} · {offer.status} · {offer.delivery_status}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminSection>
    </div>
  );
}

function ScoreRow({ groupName, score }: { groupName: string; score: PlacementScoreRow | ReturnType<typeof computePlacementScores>[number] }) {
  const value = "score" in score ? Number(score.score) : 0;
  const reasons = Array.isArray(score.reasons) ? score.reasons.join(", ") : "";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm">
      <div>
        <p className="font-semibold text-foreground">{groupName}</p>
        <p className="text-xs text-muted-foreground">{reasons}</p>
      </div>
      <span className="font-bold text-primary">{Math.round(value)}</span>
    </div>
  );
}

function getScoreGroupName(score: PlacementScoreRow | ReturnType<typeof computePlacementScores>[number], groupById: Map<string, { name: string }>) {
  if ("group" in score) {
    return score.group.name;
  }

  return groupById.get(score.group_id)?.name ?? "Groep";
}

function getScoreGroupId(score: PlacementScoreRow | ReturnType<typeof computePlacementScores>[number]) {
  return "group" in score ? score.group.id : score.group_id;
}

function getOfferGroups(entry: WaitlistEntryRow, scores: PlacementScoreRow[], groups: { id: string; name: string; program_id: string; status: string }[]) {
  const scoredGroupIds = scores.filter((score) => score.waitlist_entry_id === entry.id).sort((a, b) => Number(b.score) - Number(a.score)).map((score) => score.group_id);

  if (scoredGroupIds.length > 0) {
    return scoredGroupIds.flatMap((groupId) => groups.find((group) => group.id === groupId) ?? []);
  }

  return groups.filter((group) => group.program_id === entry.program_id && group.status === "active");
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
