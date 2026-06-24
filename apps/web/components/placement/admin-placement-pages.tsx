import type { ReactNode } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, Send, Users } from "lucide-react";
import Link from "next/link";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  approvePlacementSuggestionAction,
  cancelSlotOfferAction,
  createPlacementSuggestionAction,
  createWaitlistEntryFromIntakeAction,
  rejectPlacementSuggestionAction
} from "@/lib/placement/admin-placement-actions";
import type {
  CapacitySnapshot,
  GroupLookupRow,
  IntakeSubmissionRow,
  PlacementSuggestionRow,
  PlacementWorkflowData,
  PlacementWorkflowSnapshot,
  ProgramLookupRow,
  ResourceLookupRow,
  SlotOfferRow,
  StageLookupRow,
  WaitlistEntryRow
} from "@/lib/placement/admin-placement-read-model";

type PlacementPageProps = {
  snapshot: PlacementWorkflowSnapshot;
};

type LookupMaps = {
  intakes: Map<string, IntakeSubmissionRow>;
  programs: Map<string, ProgramLookupRow>;
  stages: Map<string, StageLookupRow>;
  groups: Map<string, GroupLookupRow>;
  resources: Map<string, ResourceLookupRow>;
  waitlistEntriesByIntake: Map<string, WaitlistEntryRow>;
  suggestionsByWaitlist: Map<string, PlacementSuggestionRow[]>;
  offersBySuggestion: Map<string, SlotOfferRow>;
  capacitiesByGroup: Map<string, CapacitySnapshot>;
};

type Column<Row> = {
  header: string;
  render: (row: Row) => ReactNode;
  className?: string;
};

export function AdminIntakeWorkflowPage({ snapshot }: PlacementPageProps) {
  const lookups = buildLookups(snapshot.data);
  const openIntakes = snapshot.data.intakes.filter((intake) => !lookups.waitlistEntriesByIntake.has(intake.id));

  return (
    <PlacementFrame snapshot={snapshot} kicker="Backoffice - instroom" title="Intake aanvragen" subtitle="Nieuwe intakes worden beoordeeld en omgezet naar een wachtlijstregel met aanbevolen niveau.">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Aanvragen" value={snapshot.data.intakes.length.toString()} detail={`${openIntakes.length} nog niet op wachtlijst`} />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Wachtlijst" value={snapshot.data.waitlistEntries.length.toString()} detail="intake en handmatig" />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Lesplek-aanbod" value={snapshot.data.slotOffers.length.toString()} detail="verstuurd, geaccepteerd, geweigerd" />
      </div>

      <Card>
        <SectionHeader title="Intake aanvragen" count={snapshot.data.intakes.length} />
        <WorkflowTable
          columns={[
            {
              header: "Kind / ouder",
              render: (intake) => (
                <div>
                  <StrongText>{intake.participant_name}</StrongText>
                  <p className="text-xs text-muted-foreground">{intake.parent_name}</p>
                  <p className="text-xs text-muted-foreground">{intake.parent_email}</p>
                </div>
              )
            },
            { header: "Programma", render: (intake) => lookups.programs.get(intake.program_id)?.name ?? "Onbekend" },
            { header: "Type", render: (intake) => <StatusPill tone="info">{intakeOptionLabel(intake.intake_type)}</StatusPill> },
            { header: "Status", render: (intake) => <StatusPill tone={workflowTone(intake.status)}>{intake.status}</StatusPill> },
            { header: "Voorkeuren", className: "min-w-[220px] whitespace-normal", render: (intake) => preferenceText(intake.preferred_days, intake.preferred_time_windows) },
            { header: "Datum", render: (intake) => formatDate(intake.created_at) },
            {
              header: "Actie",
              className: "min-w-[340px] whitespace-normal",
              render: (intake) => {
                const waitlistEntry = lookups.waitlistEntriesByIntake.get(intake.id);

                return waitlistEntry ? (
                  <InlineNotice tone="success">Wachtlijst: {waitlistEntry.status}</InlineNotice>
                ) : (
                  <WaitlistFromIntakeForm intake={intake} stages={snapshot.data.stages.filter((stage) => stage.program_id === intake.program_id)} />
                );
              }
            }
          ]}
          emptyLabel="Nog geen intake aanvragen gevonden."
          rows={snapshot.data.intakes}
          rowKey={(intake) => intake.id}
        />
      </Card>
    </PlacementFrame>
  );
}

export function AdminWaitlistWorkflowPage({ snapshot }: PlacementPageProps) {
  const lookups = buildLookups(snapshot.data);
  const queued = snapshot.data.waitlistEntries.filter((entry) => entry.status === "queued").length;
  const matched = snapshot.data.waitlistEntries.filter((entry) => entry.status === "matched").length;
  const offered = snapshot.data.waitlistEntries.filter((entry) => entry.status === "offered").length;

  return (
    <PlacementFrame snapshot={snapshot} kicker="Backoffice - plaatsing" title="Wachtlijst" subtitle="Wachtlijstregels worden gematcht op programma, niveau, voorkeursmomenten en beschikbare capaciteit.">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="In wachtrij" value={queued.toString()} detail="klaar voor matching" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Gematcht" value={matched.toString()} detail="voorstel aanwezig" />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Aangeboden" value={offered.toString()} detail="lesplek verstuurd" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionHeader title="Wachtlijstregels" count={snapshot.data.waitlistEntries.length} />
          <WorkflowTable
            columns={[
              { header: "Leerling", render: (entry) => intakeName(lookups, entry) },
              { header: "Programma", render: (entry) => lookups.programs.get(entry.program_id)?.name ?? "Onbekend" },
              { header: "Niveau", render: (entry) => nullableText(lookups.stages.get(entry.recommended_stage_id ?? "")?.name) },
              { header: "Status", render: (entry) => <StatusPill tone={workflowTone(entry.status)}>{entry.status}</StatusPill> },
              { header: "Voorkeur", className: "min-w-[220px] whitespace-normal", render: (entry) => preferenceText(entry.preferred_days, entry.preferred_time_windows) },
              {
                header: "Voorstel",
                className: "min-w-[360px] whitespace-normal",
                render: (entry) => <PlacementSuggestionForm entry={entry} groups={activeGroupsForEntry(snapshot.data.groups, entry)} lookups={lookups} suggestions={lookups.suggestionsByWaitlist.get(entry.id) ?? []} />
              }
            ]}
            emptyLabel="Nog geen wachtlijstregels. Zet een intake eerst om naar de wachtlijst."
            rows={snapshot.data.waitlistEntries}
            rowKey={(entry) => entry.id}
          />
        </Card>

        <CapacityPanel data={snapshot.data} lookups={lookups} />
      </div>
    </PlacementFrame>
  );
}

export function AdminPlacementSuggestionsPage({ snapshot }: PlacementPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <PlacementFrame snapshot={snapshot} kicker="Backoffice - plaatsingsvoorstellen" title="Plaatsingsvoorstellen" subtitle="Goedkeuren maakt lesplek-aanbod aan zonder abonnement of betaling te wijzigen.">
      <Card>
        <SectionHeader title="Plaatsingsvoorstellen" count={snapshot.data.placementSuggestions.length} />
        <WorkflowTable
          columns={[
            { header: "Leerling", render: (suggestion) => suggestionName(lookups, suggestion) },
            { header: "Programma", render: (suggestion) => lookups.programs.get(suggestion.program_id)?.name ?? "Onbekend" },
            { header: "Groep", render: (suggestion) => groupSummary(lookups, suggestion.group_id) },
            { header: "Score", render: (suggestion) => <ScorePill score={suggestion.score} /> },
            { header: "Status", render: (suggestion) => <StatusPill tone={workflowTone(suggestion.status)}>{suggestion.status}</StatusPill> },
            { header: "Capaciteit", className: "min-w-[180px] whitespace-normal", render: (suggestion) => capacityText(lookups.capacitiesByGroup.get(suggestion.group_id)) },
            { header: "Onderbouwing", className: "min-w-[260px] whitespace-normal", render: (suggestion) => nullableText(suggestion.rationale) },
            {
              header: "Actie",
              className: "min-w-[320px] whitespace-normal",
              render: (suggestion) => <SuggestionActionPanel offer={lookups.offersBySuggestion.get(suggestion.id) ?? null} suggestion={suggestion} />
            }
          ]}
          emptyLabel="Nog geen plaatsingsvoorstellen. Maak eerst een voorstel vanuit de wachtlijst."
          rows={snapshot.data.placementSuggestions}
          rowKey={(suggestion) => suggestion.id}
        />
      </Card>
    </PlacementFrame>
  );
}

export function AdminSlotOffersPage({ snapshot }: PlacementPageProps) {
  const lookups = buildLookups(snapshot.data);
  const sent = snapshot.data.slotOffers.filter((offer) => offer.status === "sent").length;
  const accepted = snapshot.data.slotOffers.filter((offer) => offer.status === "accepted").length;
  const declined = snapshot.data.slotOffers.filter((offer) => offer.status === "declined").length;

  return (
    <PlacementFrame snapshot={snapshot} kicker="Backoffice - lesplek-aanbod" title="Lesplek-aanbod" subtitle="Ouders accepteren of weigeren via een token-link. Bij acceptatie maakt het systeem een inschrijving en groepsplaatsing aan.">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Send className="h-5 w-5" />} label="Open" value={sent.toString()} detail="wacht op ouder" />
        <MetricCard icon={<CheckCircle2 className="h-5 w-5" />} label="Geaccepteerd" value={accepted.toString()} detail="plaatsing aangemaakt" />
        <MetricCard icon={<CalendarClock className="h-5 w-5" />} label="Geweigerd" value={declined.toString()} detail="plek blijft beschikbaar" />
      </div>

      <Card>
        <SectionHeader title="Lesplek-aanbod" count={snapshot.data.slotOffers.length} />
        <WorkflowTable
          columns={[
            { header: "Leerling", render: (offer) => offerName(lookups, offer) },
            { header: "Groep", render: (offer) => groupSummary(lookups, offer.group_id) },
            { header: "Status", render: (offer) => <StatusPill tone={workflowTone(offer.status)}>{offer.status}</StatusPill> },
            { header: "Verloopt", render: (offer) => formatDate(offer.expires_at) },
            {
              header: "Aanbodlink",
              className: "min-w-[260px] whitespace-normal",
              render: (offer) => (
                <Link className="font-mono text-xs font-semibold text-primary underline-offset-4 hover:underline" href={`/slot-offers/${offer.offer_token}`}>
                  /slot-offers/{shortToken(offer.offer_token)}
                </Link>
              )
            },
            {
              header: "Resultaat",
              className: "min-w-[260px] whitespace-normal",
              render: (offer) =>
                offer.status === "accepted" ? (
                  <InlineNotice tone="success">Inschrijving en groepsplaatsing zijn gekoppeld.</InlineNotice>
                ) : offer.parent_response_note ? (
                  <span className="text-sm text-muted-foreground">{offer.parent_response_note}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Nog geen ouderreactie.</span>
                )
            },
            { header: "Actie", className: "min-w-[220px] whitespace-normal", render: (offer) => <SlotOfferActionPanel offer={offer} /> }
          ]}
          emptyLabel="Nog geen lesplek-aanbod. Keur eerst een plaatsingsvoorstel goed."
          rows={snapshot.data.slotOffers}
          rowKey={(offer) => offer.id}
        />
      </Card>
    </PlacementFrame>
  );
}

function PlacementFrame({ snapshot, kicker, title, subtitle, children }: PlacementPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Plaatsingsflow</StatusPill>} />
      {snapshot.status === "ready" ? children : <PlacementStatusPanel snapshot={snapshot} />}
    </div>
  );
}

function PlacementStatusPanel({ snapshot }: PlacementPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Workflow niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft tenantdata, Supabase-configuratie en de plaatsingsmigratie nodig.</p>
      {snapshot.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function WaitlistFromIntakeForm({ intake, stages }: { intake: IntakeSubmissionRow; stages: StageLookupRow[] }) {
  return (
    <WorkflowForm action={createWaitlistEntryFromIntakeAction} submitLabel="Naar wachtlijst">
      <input name="intake_submission_id" type="hidden" value={intake.id} />
      <SelectField includeEmpty label="Aanbevolen niveau" name="recommended_stage_id" options={stages.map(optionFromName)} />
      <TextField defaultValue={todayInput()} label="Prioriteit vanaf" name="priority_date" type="date" />
      <TextAreaField defaultValue={intake.notes} label="Interne notitie" name="notes" />
    </WorkflowForm>
  );
}

function PlacementSuggestionForm({ entry, groups, lookups, suggestions }: { entry: WaitlistEntryRow; groups: GroupLookupRow[]; lookups: LookupMaps; suggestions: PlacementSuggestionRow[] }) {
  if (["offered", "placed", "declined", "rejected", "cancelled"].includes(entry.status)) {
    return <InlineNotice tone="neutral">Geen nieuw voorstel nodig: {entry.status}</InlineNotice>;
  }

  return (
    <div className="grid gap-3">
      {suggestions.length > 0 ? (
        <div className="grid gap-1 text-xs text-muted-foreground">
          {suggestions.map((suggestion) => (
            <p key={suggestion.id}>
              {lookups.groups.get(suggestion.group_id)?.name ?? "Onbekende groep"} - {suggestion.status}
            </p>
          ))}
        </div>
      ) : null}
      <WorkflowForm action={createPlacementSuggestionAction} submitLabel="Voorstel maken">
        <input name="waitlist_entry_id" type="hidden" value={entry.id} />
        <SelectField label="Groep" name="group_id" options={groups.map((group) => ({ label: groupOptionLabel(group, lookups), value: group.id }))} required />
        <TextAreaField label="Onderbouwing" name="rationale" />
      </WorkflowForm>
    </div>
  );
}

function SuggestionActionPanel({ suggestion, offer }: { suggestion: PlacementSuggestionRow; offer: SlotOfferRow | null }) {
  if (offer) {
    return (
      <div className="grid gap-2">
        <InlineNotice tone="success">Lesplek-aanbod: {offer.status}</InlineNotice>
        <Link className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href="/admin/slot-offers">
          Bekijk lesplek-aanbod
        </Link>
      </div>
    );
  }

  if (suggestion.status !== "suggested" && suggestion.status !== "approved") {
    return <InlineNotice tone="neutral">Geen actie: {suggestion.status}</InlineNotice>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <form action={approvePlacementSuggestionAction}>
        <input name="placement_suggestion_id" type="hidden" value={suggestion.id} />
        <button className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Goedkeuren + aanbod
        </button>
      </form>
      <form action={rejectPlacementSuggestionAction}>
        <input name="placement_suggestion_id" type="hidden" value={suggestion.id} />
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" type="submit">
          Afwijzen
        </button>
      </form>
    </div>
  );
}

function SlotOfferActionPanel({ offer }: { offer: SlotOfferRow }) {
  if (offer.status !== "sent") {
    return <InlineNotice tone="neutral">Afgerond: {offer.status}</InlineNotice>;
  }

  return (
    <form action={cancelSlotOfferAction}>
      <input name="slot_offer_id" type="hidden" value={offer.id} />
      <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" type="submit">
        Annuleren
      </button>
    </form>
  );
}

function CapacityPanel({ data, lookups }: { data: PlacementWorkflowData; lookups: LookupMaps }) {
  return (
    <Card>
      <SectionHeader title="Capaciteit" count={data.capacities.length} />
      <div className="grid gap-3">
        {data.groups.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">Nog geen groepen beschikbaar.</div> : null}
        {data.groups.map((group) => {
          const capacity = lookups.capacitiesByGroup.get(group.id);
          const resource = group.resource_id ? lookups.resources.get(group.resource_id) : null;

          return (
            <div key={group.id} className="rounded-2xl border border-border bg-muted/35 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {weekdayLabel(group.weekday)} {formatTime(group.starts_at)}-{formatTime(group.ends_at)} - {resource?.name ?? "Geen resource"}
                  </p>
                </div>
                <StatusPill tone={capacity && capacity.availableSpots > 0 ? "success" : "warning"}>{capacityText(capacity)}</StatusPill>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${capacityPercent(capacity)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function WorkflowTable<Row>({ columns, rows, rowKey, emptyLabel }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; emptyLabel: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            {columns.map((column) => (
              <th key={column.header} className={`whitespace-nowrap px-3 py-3 font-semibold ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top">
              {columns.map((column) => (
                <td key={column.header} className={`whitespace-nowrap px-3 py-3 ${column.className ?? ""}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkflowForm({ action, submitLabel, children }: { action: (formData: FormData) => Promise<void>; submitLabel: string; children: ReactNode }) {
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
      <div>
        <button className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TextField({ defaultValue, label, name, required, type = "text" }: { defaultValue?: string | number | null; label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name} required={required} type={type} />
    </label>
  );
}

function TextAreaField({ defaultValue, label, name }: { defaultValue?: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name} />
    </label>
  );
}

function SelectField({
  defaultValue,
  includeEmpty,
  label,
  name,
  options,
  required
}: {
  defaultValue?: string | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name} required={required}>
        {includeEmpty || required ? <option value="">{required ? "Selecteer" : "-"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScorePill({ score }: { score: number }) {
  return <StatusPill tone={score >= 80 ? "success" : score >= 60 ? "info" : "warning"}>{score}/100</StatusPill>;
}

function InlineNotice({ children, tone }: { children: ReactNode; tone: "success" | "neutral" }) {
  const className = tone === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800" : "border-border bg-muted/40 text-muted-foreground";

  return <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${className}`}>{children}</div>;
}

function buildLookups(data: PlacementWorkflowData): LookupMaps {
  return {
    intakes: byId(data.intakes),
    programs: byId(data.programs),
    stages: byId(data.stages),
    groups: byId(data.groups),
    resources: byId(data.resources),
    waitlistEntriesByIntake: new Map(data.waitlistEntries.flatMap((entry) => (entry.intake_submission_id ? [[entry.intake_submission_id, entry] as const] : []))),
    suggestionsByWaitlist: groupBy(data.placementSuggestions, (suggestion) => suggestion.waitlist_entry_id),
    offersBySuggestion: new Map(data.slotOffers.map((offer) => [offer.placement_suggestion_id, offer])),
    capacitiesByGroup: new Map(data.capacities.map((capacity) => [capacity.groupId, capacity]))
  };
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<Row>(rows: Row[], getKey: (row: Row) => string) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function activeGroupsForEntry(groups: GroupLookupRow[], entry: WaitlistEntryRow) {
  return groups.filter((group) => {
    if (group.status !== "active" || group.program_id !== entry.program_id) {
      return false;
    }

    return !entry.recommended_stage_id || group.stage_id === entry.recommended_stage_id;
  });
}

function intakeName(lookups: LookupMaps, entry: WaitlistEntryRow) {
  const intake = entry.intake_submission_id ? getIntakeById(lookups, entry.intake_submission_id) : null;

  return intake ? (
    <div>
      <StrongText>{intake.participant_name}</StrongText>
      <p className="text-xs text-muted-foreground">{intake.parent_name}</p>
    </div>
  ) : (
    <span className="text-muted-foreground">Handmatige regel</span>
  );
}

function suggestionName(lookups: LookupMaps, suggestion: PlacementSuggestionRow) {
  const intakeId = suggestion.intake_submission_id;
  const intake = intakeId ? getIntakeById(lookups, intakeId) : null;

  return intake ? (
    <div>
      <StrongText>{intake.participant_name}</StrongText>
      <p className="text-xs text-muted-foreground">{intake.parent_email}</p>
    </div>
  ) : (
    <span className="text-muted-foreground">Wachtlijstregel</span>
  );
}

function offerName(lookups: LookupMaps, offer: SlotOfferRow) {
  const intake = offer.intake_submission_id ? getIntakeById(lookups, offer.intake_submission_id) : null;

  return intake ? (
    <div>
      <StrongText>{intake.participant_name}</StrongText>
      <p className="text-xs text-muted-foreground">{intake.parent_email}</p>
    </div>
  ) : (
    <span className="text-muted-foreground">Lesplek-aanbod</span>
  );
}

function getIntakeById(lookups: LookupMaps, intakeId: string) {
  return lookups.intakes.get(intakeId) ?? null;
}

function groupSummary(lookups: LookupMaps, groupId: string) {
  const group = lookups.groups.get(groupId);

  if (!group) {
    return "Onbekende groep";
  }

  const resource = group.resource_id ? lookups.resources.get(group.resource_id) : null;

  return (
    <div>
      <StrongText>{group.name}</StrongText>
      <p className="text-xs text-muted-foreground">
        {weekdayLabel(group.weekday)} {formatTime(group.starts_at)}-{formatTime(group.ends_at)} {resource ? `- ${resource.name}` : ""}
      </p>
    </div>
  );
}

function groupOptionLabel(group: GroupLookupRow, lookups: LookupMaps) {
  const stage = lookups.stages.get(group.stage_id)?.name ?? "Niveau onbekend";
  const capacity = lookups.capacitiesByGroup.get(group.id);

  return `${group.name} - ${stage} - ${weekdayLabel(group.weekday)} ${formatTime(group.starts_at)} (${capacityText(capacity)})`;
}

function capacityText(capacity: CapacitySnapshot | undefined) {
  if (!capacity) {
    return "Cap. onbekend";
  }

  return `${capacity.availableSpots}/${capacity.capacityLimit} vrij`;
}

function capacityPercent(capacity: CapacitySnapshot | undefined) {
  if (!capacity || capacity.capacityLimit <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (capacity.activeMemberships / capacity.capacityLimit) * 100));
}

function preferenceText(days: string[], times: string[]) {
  const dayText = days.length > 0 ? days.map(preferredDayLabel).join(", ") : "Geen dagvoorkeur";
  const timeText = times.length > 0 ? times.map(preferredTimeLabel).join(", ") : "Geen tijdvoorkeur";

  return (
    <span className="text-sm text-muted-foreground">
      {dayText}
      <br />
      {timeText}
    </span>
  );
}

function nullableText(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : <span className="text-muted-foreground">-</span>;
}

function StrongText({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

function workflowTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["accepted", "placed", "active"].includes(status)) {
    return "success";
  }

  if (["new", "queued", "reviewing", "matched", "suggested", "sent", "slot_offered"].includes(status)) {
    return "info";
  }

  if (["offered", "approved"].includes(status)) {
    return "warning";
  }

  if (["declined", "rejected", "cancelled", "expired"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function intakeOptionLabel(value: string) {
  const labels: Record<string, string> = {
    trial: "Proefles",
    registration: "Inschrijving",
    waitlist: "Wachtlijst"
  };

  return labels[value] ?? value;
}

function preferredDayLabel(value: string) {
  const labels: Record<string, string> = {
    monday: "Ma",
    tuesday: "Di",
    wednesday: "Wo",
    thursday: "Do",
    friday: "Vr",
    saturday: "Za",
    sunday: "Zo"
  };

  return labels[value] ?? value;
}

function preferredTimeLabel(value: string) {
  const labels: Record<string, string> = {
    morning: "Ochtend",
    afternoon: "Middag",
    evening: "Avond",
    weekend: "Weekend"
  };

  return labels[value] ?? value;
}

function weekdayLabel(weekday: number) {
  const labels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return labels[weekday - 1] ?? `Dag ${weekday}`;
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function shortToken(token: string) {
  return token.length > 12 ? `${token.slice(0, 8)}...` : token;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
