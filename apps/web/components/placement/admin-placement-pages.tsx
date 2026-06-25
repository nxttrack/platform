import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Filter, PhoneCall, RotateCcw, Send, Users } from "lucide-react";
import Link from "next/link";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  approvePlacementSuggestionAction,
  cancelSlotOfferAction,
  createPlacementSuggestionAction,
  createWaitlistEntryFromIntakeAction,
  recordWaitlistContactAction,
  reevaluateWaitlistEntryAction,
  rejectPlacementSuggestionAction,
  updateWaitlistPriorityAction
} from "@/lib/placement/admin-placement-actions";
import type {
  CapacitySnapshot,
  GroupLookupRow,
  IntakeDuplicateMatchRow,
  IntakeSubmissionRow,
  PlacementSuggestionRow,
  PlacementWorkflowData,
  PlacementWorkflowSnapshot,
  ProgramLookupRow,
  ResourceLookupRow,
  SmartDecisionSummaryRow,
  SlotOfferRow,
  StageLookupRow,
  WaitlistEntryEventRow,
  WaitlistEntryRow
} from "@/lib/placement/admin-placement-read-model";

type WaitlistFilters = {
  program?: string;
  stage?: string;
  preferred_day?: string;
  status?: string;
  priority?: string;
  duplicate?: string;
  contact?: string;
};

type PlacementPageProps = {
  snapshot: PlacementWorkflowSnapshot;
  filters?: WaitlistFilters;
};

type LookupMaps = {
  intakes: Map<string, IntakeSubmissionRow>;
  programs: Map<string, ProgramLookupRow>;
  stages: Map<string, StageLookupRow>;
  groups: Map<string, GroupLookupRow>;
  resources: Map<string, ResourceLookupRow>;
  waitlistEntries: Map<string, WaitlistEntryRow>;
  waitlistEntriesByIntake: Map<string, WaitlistEntryRow>;
  suggestionsByWaitlist: Map<string, PlacementSuggestionRow[]>;
  offersBySuggestion: Map<string, SlotOfferRow>;
  capacitiesByGroup: Map<string, CapacitySnapshot>;
  duplicateMatchesByIntake: Map<string, IntakeDuplicateMatchRow[]>;
  smartDecisionsBySubject: Map<string, SmartDecisionSummaryRow>;
  waitlistEventsByEntry: Map<string, WaitlistEntryEventRow[]>;
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
                  <Link className="font-semibold text-primary hover:underline" href={`/admin/intake/${intake.id}`}>
                    {intake.participant_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{intake.parent_name}</p>
                  <p className="text-xs text-muted-foreground">{intake.parent_email}</p>
                </div>
              )
            },
            { header: "Programma", render: (intake) => lookups.programs.get(intake.program_id)?.name ?? "Onbekend" },
            {
              header: "Smart advies",
              className: "min-w-[260px] whitespace-normal",
              render: (intake) => <SmartDecisionPanel decision={smartDecisionFor(lookups, "intake_recommendation", "intake_submission", intake.id)} />
            },
            {
              header: "Duplicaten",
              className: "min-w-[220px] whitespace-normal",
              render: (intake) => <DuplicateWarningPanel matches={lookups.duplicateMatchesByIntake.get(intake.id) ?? []} />
            },
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

export function AdminWaitlistWorkflowPage({ filters = {}, snapshot }: PlacementPageProps) {
  const lookups = buildLookups(snapshot.data);
  const waitlistEntries = applyWaitlistFilters(snapshot.data.waitlistEntries, filters);
  const rankByEntry = new Map(waitlistEntries.map((entry, index) => [entry.id, index + 1]));
  const queued = waitlistEntries.filter((entry) => entry.status === "queued").length;
  const priority = waitlistEntries.filter((entry) => entry.admin_priority === "high" || entry.admin_priority === "urgent").length;
  const reevaluation = waitlistEntries.filter((entry) => entry.reevaluation_requested_at).length;

  return (
    <PlacementFrame snapshot={snapshot} kicker="Backoffice - plaatsing" title="Wachtlijst" subtitle="Wachtlijstregels worden gematcht op programma, niveau, voorkeursmomenten en beschikbare capaciteit.">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="In wachtrij" value={queued.toString()} detail="klaar voor matching" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Prioriteit" value={priority.toString()} detail="high of urgent" />
        <MetricCard icon={<RotateCcw className="h-5 w-5" />} label="Hercheck" value={reevaluation.toString()} detail="capaciteit gewijzigd" />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeader title="Wachtlijstregels" count={waitlistEntries.length} />
            {hasActiveWaitlistFilters(filters) ? (
              <Link className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" href="/admin/wachtlijst">
                Filters wissen
              </Link>
            ) : null}
          </div>
          <WaitlistFilterBar data={snapshot.data} filters={filters} />
          <WorkflowTable
            columns={[
              { header: "Rang", render: (entry) => <span className="text-lg font-bold">#{rankByEntry.get(entry.id) ?? "-"}</span> },
              { header: "Leerling", className: "min-w-[180px] whitespace-normal", render: (entry) => intakeName(lookups, entry) },
              {
                header: "Score",
                className: "min-w-[300px] whitespace-normal",
                render: (entry) => <WaitlistScorePanel decision={smartDecisionFor(lookups, "waitlist", "waitlist_entry", entry.id)} entry={entry} />
              },
              { header: "Programma", render: (entry) => lookups.programs.get(entry.program_id)?.name ?? "Onbekend" },
              { header: "Niveau", render: (entry) => nullableText(lookups.stages.get(entry.recommended_stage_id ?? "")?.name) },
              { header: "Status", render: (entry) => <StatusPill tone={workflowTone(entry.status)}>{entry.status}</StatusPill> },
              { header: "Voorkeur", className: "min-w-[220px] whitespace-normal", render: (entry) => preferenceText(entry.preferred_days, entry.preferred_time_windows) },
              {
                header: "Prioriteit / contact",
                className: "min-w-[320px] whitespace-normal",
                render: (entry) => <WaitlistPriorityPanel entry={entry} events={lookups.waitlistEventsByEntry.get(entry.id) ?? []} />
              },
              {
                header: "Voorstel",
                className: "min-w-[360px] whitespace-normal",
                render: (entry) => <PlacementSuggestionForm entry={entry} groups={activeGroupsForEntry(snapshot.data.groups, entry)} lookups={lookups} suggestions={lookups.suggestionsByWaitlist.get(entry.id) ?? []} />
              }
            ]}
            emptyLabel="Nog geen wachtlijstregels. Zet een intake eerst om naar de wachtlijst."
            rows={waitlistEntries}
            rowKey={(entry) => entry.id}
          />
        </Card>

        <div className="grid gap-4">
          <CapacityPanel data={snapshot.data} lookups={lookups} />
          <WaitlistTimelinePanel events={snapshot.data.waitlistEvents} lookups={lookups} />
        </div>
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
            { header: "Capaciteit", className: "min-w-[240px] whitespace-normal", render: (suggestion) => <CapacityMini capacity={lookups.capacitiesByGroup.get(suggestion.group_id)} /> },
            {
              header: "Onderbouwing",
              className: "min-w-[320px] whitespace-normal",
              render: (suggestion) => (
                <div className="grid gap-2">
                  <span>{nullableText(suggestion.rationale)}</span>
                  <SmartDecisionPanel decision={smartDecisionFor(lookups, "placement", "placement_suggestion", suggestion.id)} compact />
                </div>
              )
            },
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
    <div className="grid min-w-0 max-w-full gap-6">
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
  const recommendedStageId = typeof intake.recommendation_snapshot.recommended_stage_id === "string" ? intake.recommendation_snapshot.recommended_stage_id : null;

  return (
    <WorkflowForm action={createWaitlistEntryFromIntakeAction} submitLabel="Naar wachtlijst">
      <input name="intake_submission_id" type="hidden" value={intake.id} />
      <SelectField defaultValue={recommendedStageId ?? ""} includeEmpty label="Aanbevolen niveau" name="recommended_stage_id" options={stages.map(optionFromName)} />
      <TextField defaultValue={todayInput()} label="Prioriteit vanaf" name="priority_date" type="date" />
      <TextAreaField label="Override-reden bij afwijking" name="override_reason" />
      <TextAreaField defaultValue={intake.notes} label="Interne notitie" name="notes" />
    </WorkflowForm>
  );
}

function WaitlistFilterBar({ data, filters }: { data: PlacementWorkflowData; filters: WaitlistFilters }) {
  return (
    <form action="/admin/wachtlijst" className="mb-4 grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      <div className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground lg:col-span-1">
        <Filter className="h-4 w-4" />
        Filters
      </div>
      <CompactSelect defaultValue={filters.program ?? ""} name="program" options={[{ label: "Alle programma's", value: "" }, ...data.programs.map(optionFromName)]} />
      <CompactSelect defaultValue={filters.stage ?? ""} name="stage" options={[{ label: "Alle niveaus", value: "" }, ...data.stages.map(optionFromName)]} />
      <CompactSelect
        defaultValue={filters.preferred_day ?? ""}
        name="preferred_day"
        options={[
          { label: "Alle dagen", value: "" },
          { label: "Maandag", value: "monday" },
          { label: "Dinsdag", value: "tuesday" },
          { label: "Woensdag", value: "wednesday" },
          { label: "Donderdag", value: "thursday" },
          { label: "Vrijdag", value: "friday" },
          { label: "Zaterdag", value: "saturday" },
          { label: "Zondag", value: "sunday" }
        ]}
      />
      <CompactSelect
        defaultValue={filters.status ?? ""}
        name="status"
        options={[
          { label: "Alle statussen", value: "" },
          { label: "Queued", value: "queued" },
          { label: "Matched", value: "matched" },
          { label: "Offered", value: "offered" },
          { label: "Placed", value: "placed" },
          { label: "Declined", value: "declined" }
        ]}
      />
      <CompactSelect
        defaultValue={filters.priority ?? ""}
        name="priority"
        options={[
          { label: "Alle prioriteit", value: "" },
          { label: "Laag", value: "low" },
          { label: "Normaal", value: "normal" },
          { label: "Hoog", value: "high" },
          { label: "Urgent", value: "urgent" }
        ]}
      />
      <CompactSelect
        defaultValue={filters.duplicate ?? ""}
        name="duplicate"
        options={[
          { label: "Alle duplicaten", value: "" },
          { label: "Geen risico", value: "none" },
          { label: "Waarschuwing", value: "warning" },
          { label: "Blokkerend", value: "blocking" },
          { label: "Onbekend", value: "unknown" }
        ]}
      />
      <CompactSelect
        defaultValue={filters.contact ?? ""}
        name="contact"
        options={[
          { label: "Alle contact", value: "" },
          { label: "Nooit benaderd", value: "never" },
          { label: "Ouder dan 30 dagen", value: "stale_30" },
          { label: "Recent contact", value: "recent_14" }
        ]}
      />
      <div>
        <button className="h-10 w-full rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Toepassen
        </button>
      </div>
    </form>
  );
}

function WaitlistScorePanel({ decision, entry }: { decision: SmartDecisionSummaryRow | null; entry: WaitlistEntryRow }) {
  const reasons = entry.score_reasons?.slice(0, 3) ?? [];

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {typeof entry.waitlist_score === "number" ? <ScorePill score={entry.waitlist_score} /> : <StatusPill tone="warning">Geen score</StatusPill>}
        <StatusPill tone={duplicateTone(entry.duplicate_risk)}>{duplicateRiskLabel(entry.duplicate_risk)}</StatusPill>
        {entry.reevaluation_requested_at ? <StatusPill tone="warning">Hercheck nodig</StatusPill> : null}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {reasons.length > 0 ? (
          reasons.map((reason) => (
            <p key={`${entry.id}-${reason.code ?? reason.label}`}>
              <span className="font-semibold text-foreground">{reason.label ?? reason.code}</span>
              {reason.detail ? ` - ${reason.detail}` : ""}
            </p>
          ))
        ) : (
          <p>Nog geen opgeslagen redenen.</p>
        )}
      </div>
      <SmartDecisionPanel compact decision={decision} />
    </div>
  );
}

function WaitlistPriorityPanel({ entry, events }: { entry: WaitlistEntryRow; events: WaitlistEntryEventRow[] }) {
  const lastEvent = events[0] ?? null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={priorityTone(entry.admin_priority)}>{priorityLabel(entry.admin_priority)}</StatusPill>
        {entry.last_contacted_at ? (
          <StatusPill tone="info">
            {entry.last_contact_channel ?? "contact"} {formatDate(entry.last_contacted_at)}
          </StatusPill>
        ) : (
          <StatusPill tone="warning">Nog niet benaderd</StatusPill>
        )}
      </div>
      {entry.priority_reason ? <p className="text-xs text-muted-foreground">Reden: {entry.priority_reason}</p> : null}
      <form action={updateWaitlistPriorityAction} className="grid gap-2 rounded-2xl border border-border bg-muted/30 p-3">
        <input name="waitlist_entry_id" type="hidden" value={entry.id} />
        <CompactSelect
          defaultValue={entry.admin_priority}
          name="admin_priority"
          options={[
            { label: "Laag", value: "low" },
            { label: "Normaal", value: "normal" },
            { label: "Hoog", value: "high" },
            { label: "Urgent", value: "urgent" }
          ]}
        />
        <CompactInput defaultValue={entry.priority_reason} name="priority_reason" placeholder="Prioriteitsreden" />
        <CompactInput defaultValue={entry.urgency_reason} name="urgency_reason" placeholder="Urgentie/tenantreden" />
        <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
          Prioriteit opslaan
        </button>
      </form>
      <div className="grid gap-2 rounded-2xl border border-border bg-muted/30 p-3">
        <form action={recordWaitlistContactAction} className="grid gap-2">
          <input name="waitlist_entry_id" type="hidden" value={entry.id} />
          <CompactSelect
            defaultValue="email"
            name="last_contact_channel"
            options={[
              { label: "E-mail", value: "email" },
              { label: "Telefoon", value: "phone" },
              { label: "WhatsApp", value: "whatsapp" },
              { label: "Intern", value: "internal" },
              { label: "Handmatig", value: "manual" }
            ]}
          />
          <CompactInput name="contact_note" placeholder="Contactnotitie" />
          <button className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" type="submit">
            <PhoneCall className="h-3.5 w-3.5" />
            Contact loggen
          </button>
        </form>
        <form action={reevaluateWaitlistEntryAction}>
          <input name="waitlist_entry_id" type="hidden" value={entry.id} />
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
            <RotateCcw className="h-3.5 w-3.5" />
            Herberekenen
          </button>
        </form>
      </div>
      {lastEvent ? <p className="text-xs text-muted-foreground">Laatste event: {waitlistEventLabel(lastEvent.event_type)} - {formatDate(lastEvent.created_at)}</p> : null}
    </div>
  );
}

function WaitlistTimelinePanel({ events, lookups }: { events: WaitlistEntryEventRow[]; lookups: LookupMaps }) {
  return (
    <Card>
      <SectionHeader title="Wachtlijst timeline" count={events.length} />
      <div className="grid gap-3">
        {events.length === 0 ? <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">Nog geen wachtlijst-events.</div> : null}
        {events.slice(0, 10).map((event) => {
          const waitlistEntry = findWaitlistEntryByEvent(lookups, event);

          return (
            <div key={event.id} className="rounded-2xl border border-border bg-muted/35 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{waitlistEventLabel(event.event_type)}</p>
                  <p className="text-xs text-muted-foreground">{event.note ?? "Geen notitie."}</p>
                </div>
                <StatusPill tone="neutral">{formatDate(event.created_at)}</StatusPill>
              </div>
              {waitlistEntry ? <div className="mt-2 text-xs text-muted-foreground">{intakeName(lookups, waitlistEntry)}</div> : null}
            </div>
          );
        })}
      </div>
    </Card>
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
      <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:border-red-300 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30" type="submit">
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
                <StatusPill tone={capacityTone(capacity)}>{capacityText(capacity)}</StatusPill>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${capacityPercent(capacity)}%` }} />
              </div>
              <CapacityBreakdown capacity={capacity} />
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
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-max min-w-full text-left text-sm">
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

function CompactSelect({ defaultValue, name, options }: { defaultValue?: string | null; name: string; options: { label: string; value: string }[] }) {
  return (
    <select className="h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name}>
      {options.map((option) => (
        <option key={`${name}-${option.value}`} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function CompactInput({ defaultValue, name, placeholder }: { defaultValue?: string | null; name: string; placeholder: string }) {
  return <input className="h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground outline-none ring-primary/20 placeholder:text-muted-foreground focus:ring-2" defaultValue={defaultValue ?? ""} name={name} placeholder={placeholder} />;
}

function ScorePill({ score }: { score: number }) {
  return <StatusPill tone={score >= 80 ? "success" : score >= 60 ? "info" : "warning"}>{score}/100</StatusPill>;
}

function InlineNotice({ children, tone }: { children: ReactNode; tone: "success" | "neutral" }) {
  const className = tone === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-800" : "border-border bg-muted/40 text-muted-foreground";

  return <div className={`rounded-2xl border px-3 py-2 text-xs font-semibold ${className}`}>{children}</div>;
}

function CapacityMini({ capacity }: { capacity: CapacitySnapshot | undefined }) {
  if (!capacity) {
    return <span className="text-sm text-muted-foreground">Cap. onbekend</span>;
  }

  return (
    <div className="grid gap-2">
      <StatusPill tone={capacityTone(capacity)}>{capacityText(capacity)}</StatusPill>
      <div className="grid gap-1 text-xs text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">{capacity.activeMemberships}</span> actief,{" "}
          <span className="font-semibold text-foreground">{capacity.heldSpots}</span> hold,{" "}
          <span className="font-semibold text-foreground">{capacity.reservedSpots + capacity.trialSpots + capacity.makeupSpots}</span> gereserveerd
        </p>
        {capacity.blockers.length > 0 ? <p className="font-semibold text-red-700">{capacity.blockers[0]?.label}</p> : null}
      </div>
    </div>
  );
}

function CapacityBreakdown({ capacity }: { capacity: CapacitySnapshot | undefined }) {
  if (!capacity) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <CapacityStat label="Open" value={capacity.openSpots} />
        <CapacityStat label="Bezet" value={capacity.activeMemberships} />
        <CapacityStat label="Hold" value={capacity.heldSpots} />
        <CapacityStat label="Reserve" value={capacity.reservedSpots + capacity.trialSpots + capacity.makeupSpots} />
      </div>
      {capacity.blockedSpots > 0 ? <p className="font-semibold text-red-700">{capacity.blockedSpots} plek{capacity.blockedSpots === 1 ? "" : "ken"} overboekt of geblokkeerd.</p> : null}
      {capacity.pendingSlotOffers > 0 ? <p>{capacity.pendingSlotOffers} open lesplek-aanbod{capacity.pendingSlotOffers === 1 ? "" : "en"} houden capaciteit vast.</p> : null}
    </div>
  );
}

function CapacityStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
    </div>
  );
}

function buildLookups(data: PlacementWorkflowData): LookupMaps {
  return {
    intakes: byId(data.intakes),
    programs: byId(data.programs),
    stages: byId(data.stages),
    groups: byId(data.groups),
    resources: byId(data.resources),
    waitlistEntries: byId(data.waitlistEntries),
    waitlistEntriesByIntake: new Map(data.waitlistEntries.flatMap((entry) => (entry.intake_submission_id ? [[entry.intake_submission_id, entry] as const] : []))),
    suggestionsByWaitlist: groupBy(data.placementSuggestions, (suggestion) => suggestion.waitlist_entry_id),
    offersBySuggestion: new Map(data.slotOffers.map((offer) => [offer.placement_suggestion_id, offer])),
    capacitiesByGroup: new Map(data.capacities.map((capacity) => [capacity.groupId, capacity])),
    duplicateMatchesByIntake: groupBy(data.intakeDuplicateMatches, (match) => match.intake_submission_id),
    smartDecisionsBySubject: new Map(data.smartDecisions.map((decision) => [smartDecisionKey(decision.engine_key, decision.subject_type, decision.subject_id), decision])),
    waitlistEventsByEntry: groupBy(data.waitlistEvents, (event) => event.waitlist_entry_id)
  };
}

function SmartDecisionPanel({ compact, decision }: { compact?: boolean; decision: SmartDecisionSummaryRow | null }) {
  if (!decision) {
    return <span className="text-xs text-muted-foreground">Nog geen smart decision.</span>;
  }

  const recommendedStage = typeof decision.recommendation.recommended_stage_label === "string" ? decision.recommendation.recommended_stage_label : null;
  const action = typeof decision.recommendation.action === "string" ? decision.recommendation.action : null;
  const reasons = decision.reasons_json.slice(0, compact ? 2 : 3);
  const blockers = decision.blockers_json.filter((blocker) => blocker.severity !== "warning");

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusPill tone={decision.confidence === "high" ? "success" : decision.confidence === "medium" ? "info" : "warning"}>{decision.confidence}</StatusPill>
        {typeof decision.score === "number" ? <span className="font-semibold text-foreground">{decision.score}/100</span> : null}
        <span className="text-muted-foreground">{decision.rule_version}</span>
      </div>
      {recommendedStage ? <p className="font-semibold text-foreground">Advies: {recommendedStage}</p> : action ? <p className="font-semibold text-foreground">Actie: {smartActionLabel(action)}</p> : null}
      {blockers.length > 0 ? <p className="mt-1 font-semibold text-red-700">{blockers.length} blocker{blockers.length === 1 ? "" : "s"}</p> : null}
      <ul className="mt-2 grid gap-1 text-muted-foreground">
        {reasons.map((reason) => (
          <li key={`${reason.code ?? reason.label}`}>
            <span className="font-semibold text-foreground">{reason.label ?? reason.code}</span>
            {reason.detail ? ` - ${reason.detail}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DuplicateWarningPanel({ matches }: { matches: IntakeDuplicateMatchRow[] }) {
  if (matches.length === 0) {
    return <StatusPill tone="success">Geen match</StatusPill>;
  }

  const blocking = matches.filter((match) => match.severity === "blocking").length;

  return (
    <div className="grid gap-2">
      <StatusPill tone={blocking > 0 ? "danger" : "warning"}>
        {matches.length} waarschuwing{matches.length === 1 ? "" : "en"}
      </StatusPill>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {matches.slice(0, 2).map((match) => (
          <p key={match.id}>
            <span className="font-semibold text-foreground">{match.label}</span> - {match.score}/100
          </p>
        ))}
      </div>
    </div>
  );
}

function smartDecisionFor(lookups: LookupMaps, engineKey: string, subjectType: string, subjectId: string) {
  return lookups.smartDecisionsBySubject.get(smartDecisionKey(engineKey, subjectType, subjectId)) ?? null;
}

function smartDecisionKey(engineKey: string, subjectType: string, subjectId: string) {
  return `${engineKey}:${subjectType}:${subjectId}`;
}

function smartActionLabel(action: string) {
  const labels: Record<string, string> = {
    approve_slot_offer: "Lesplek-aanbod voorbereiden",
    manual_review: "Handmatige review",
    recommend_start_stage: "Startniveau adviseren"
  };

  return labels[action] ?? action;
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

function applyWaitlistFilters(entries: WaitlistEntryRow[], filters: WaitlistFilters) {
  return entries.filter((entry) => {
    if (filters.program && entry.program_id !== filters.program) {
      return false;
    }

    if (filters.stage && entry.recommended_stage_id !== filters.stage) {
      return false;
    }

    if (filters.preferred_day && !entry.preferred_days.includes(filters.preferred_day)) {
      return false;
    }

    if (filters.status && entry.status !== filters.status) {
      return false;
    }

    if (filters.priority && entry.admin_priority !== filters.priority) {
      return false;
    }

    if (filters.duplicate && entry.duplicate_risk !== filters.duplicate) {
      return false;
    }

    if (filters.contact && !matchesContactFilter(entry, filters.contact)) {
      return false;
    }

    return true;
  });
}

function matchesContactFilter(entry: WaitlistEntryRow, filter: string) {
  if (filter === "never") {
    return !entry.last_contacted_at;
  }

  if (!entry.last_contacted_at) {
    return filter === "stale_30";
  }

  const days = daysSince(entry.last_contacted_at);

  if (filter === "stale_30") {
    return days >= 30;
  }

  if (filter === "recent_14") {
    return days <= 14;
  }

  return true;
}

function hasActiveWaitlistFilters(filters: WaitlistFilters) {
  return Object.values(filters).some((value) => typeof value === "string" && value.trim() !== "");
}

function findWaitlistEntryByEvent(lookups: LookupMaps, event: WaitlistEntryEventRow) {
  return lookups.waitlistEntries.get(event.waitlist_entry_id) ?? null;
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

  if (capacity.status === "blocked") {
    return "Geblokkeerd";
  }

  if (capacity.blockedSpots > 0) {
    return `${capacity.blockedSpots} overboekt`;
  }

  return `${capacity.openSpots}/${capacity.capacityLimit} vrij`;
}

function capacityPercent(capacity: CapacitySnapshot | undefined) {
  if (!capacity || capacity.capacityLimit <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (capacity.usedSpots / capacity.capacityLimit) * 100));
}

function capacityTone(capacity: CapacitySnapshot | undefined): "success" | "warning" | "danger" | "info" | "neutral" {
  if (!capacity) {
    return "neutral";
  }

  if (capacity.status === "blocked" || capacity.blockers.some((blocker) => blocker.severity === "blocking")) {
    return "danger";
  }

  if (capacity.status === "overbooked" || capacity.status === "full") {
    return "warning";
  }

  if (capacity.status === "nearly_full") {
    return "info";
  }

  return "success";
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

function priorityTone(priority: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (priority === "urgent") {
    return "danger";
  }

  if (priority === "high") {
    return "warning";
  }

  if (priority === "low") {
    return "neutral";
  }

  return "info";
}

function priorityLabel(priority: string) {
  const labels: Record<string, string> = {
    low: "Lage prioriteit",
    normal: "Normaal",
    high: "Hoge prioriteit",
    urgent: "Urgent"
  };

  return labels[priority] ?? priority;
}

function duplicateTone(risk: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (risk === "blocking") {
    return "danger";
  }

  if (risk === "warning") {
    return "warning";
  }

  if (risk === "none") {
    return "success";
  }

  return "neutral";
}

function duplicateRiskLabel(risk: string) {
  const labels: Record<string, string> = {
    unknown: "Duplicaat onbekend",
    none: "Geen duplicaat",
    warning: "Duplicaat waarschuwing",
    blocking: "Duplicaat blokkade"
  };

  return labels[risk] ?? risk;
}

function waitlistEventLabel(eventType: string) {
  const labels: Record<string, string> = {
    created: "Aangemaakt",
    scored: "Score berekend",
    priority_updated: "Prioriteit aangepast",
    status_changed: "Status gewijzigd",
    contacted: "Contactmoment",
    reevaluation_requested: "Herbeoordeling gevraagd",
    placement_suggested: "Plaatsingsvoorstel",
    placement_rejected: "Voorstel afgewezen",
    slot_offered: "Lesplek-aanbod",
    placed: "Geplaatst",
    cancelled: "Geannuleerd"
  };

  return labels[eventType] ?? eventType;
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

function daysSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

function shortToken(token: string) {
  return token.length > 12 ? `${token.slice(0, 8)}...` : token;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
