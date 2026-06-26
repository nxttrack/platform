import type { ReactNode } from "react";
import { CalendarDays, FileCheck2, GraduationCap, Radar } from "lucide-react";

import { AdminTabs } from "@/components/admin/admin-tabs";
import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  createAfzwemEventAction,
  evaluateDiplomaReadinessRadarAction,
  inviteReadinessCandidateAction,
  inviteAfzwemParticipantAction,
  registerAfzwemResultAction,
  reviewDiplomaReadinessAction,
  updateCertificateVaultAction
} from "@/lib/afzwem/admin-afzwem-actions";
import type {
  AdminAfzwemData,
  AdminAfzwemSnapshot,
  AfzwemEventCandidateSuggestionRow,
  AfzwemCertificateAccessEventRow,
  AfzwemCertificateRow,
  AfzwemCertificateVersionRow,
  AfzwemEnrollmentRow,
  DiplomaReadinessEventRow,
  DiplomaReadinessRadarRow,
  AfzwemEventParticipantRow,
  AfzwemEventRow,
  AfzwemParticipantRow,
  AfzwemProgramRow,
  AfzwemReadinessCriteriaRow,
  AfzwemResourceRow,
  AfzwemResultRow,
  AfzwemStageRow
} from "@/lib/afzwem/admin-afzwem-read-model";

type AdminAfzwemPageProps = {
  snapshot: AdminAfzwemSnapshot;
};

type LookupMaps = {
  programs: Map<string, AfzwemProgramRow>;
  stages: Map<string, AfzwemStageRow>;
  resources: Map<string, AfzwemResourceRow>;
  participants: Map<string, AfzwemParticipantRow>;
  enrollments: Map<string, AfzwemEnrollmentRow>;
  criteria: Map<string, AfzwemReadinessCriteriaRow>;
  events: Map<string, AfzwemEventRow>;
  eventParticipantsByEvent: Map<string, AfzwemEventParticipantRow[]>;
  resultsByEventParticipant: Map<string, AfzwemResultRow>;
  certificatesByResult: Map<string, AfzwemCertificateRow>;
  certificateVersionsByCertificate: Map<string, AfzwemCertificateVersionRow[]>;
  certificateAccessEventsByCertificate: Map<string, AfzwemCertificateAccessEventRow[]>;
  readinessByEnrollment: Map<string, DiplomaReadinessRadarRow>;
  suggestionsByRadar: Map<string, AfzwemEventCandidateSuggestionRow[]>;
  readinessEventsByRadar: Map<string, DiplomaReadinessEventRow[]>;
};

export function AdminAfzwemPage({ snapshot }: AdminAfzwemPageProps) {
  const lookups = buildLookups(snapshot.data);
  const scheduledEvents = snapshot.data.events.filter((event) => event.status === "scheduled").length;
  const passedResults = snapshot.data.results.filter((result) => result.result_status === "passed").length;
  const issuedCertificates = snapshot.data.certificates.filter((certificate) => certificate.status === "issued").length;
  const readyForReview = snapshot.data.readinessRadar.filter((row) => row.readiness_status === "ready_for_review").length;
  const almostReady = snapshot.data.readinessRadar.filter((row) => row.readiness_status === "almost_ready").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Afzwem workflow</StatusPill>}
        kicker="Backoffice - afzwemmen"
        subtitle="Afzwem-ready criteria, momenten, deelnemers, resultaatregistratie en digitale diplomakluis. Intern blijft dit een generieke milestone/certification workflow."
        title="Afzwemmen & diploma vault"
      />
      {snapshot.status === "ready" ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard icon={<FileCheck2 className="h-5 w-5" />} label="Criteria" value={snapshot.data.readinessCriteria.length.toString()} detail="afzwem-ready regels" />
            <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Momenten" value={scheduledEvents.toString()} detail="gepland" />
            <MetricCard icon={<Radar className="h-5 w-5" />} label="Radar" value={readyForReview.toString()} detail={`${almostReady} bijna klaar`} />
            <MetricCard icon={<GraduationCap className="h-5 w-5" />} label="Diploma's" value={issuedCertificates.toString()} detail={`${passedResults} geslaagd`} />
          </div>

          <AdminTabs
            tabs={[
              { id: "radar", label: "Radar", count: snapshot.data.readinessRadar.length, children: <AfzwemRadarPanel data={snapshot.data} lookups={lookups} /> },
              {
                id: "criteria",
                label: "Criteria",
                count: snapshot.data.readinessCriteria.length,
                children: (
                  <Card>
                    <SectionHeader title="Afzwem-ready criteria" count={snapshot.data.readinessCriteria.length} />
                    <div className="grid gap-3">
                      {snapshot.data.readinessCriteria.length === 0 ? <EmptyState>Geen criteria gevonden.</EmptyState> : null}
                      {snapshot.data.readinessCriteria.map((criteria) => (
                        <CriteriaCard key={criteria.id} criteria={criteria} lookups={lookups} />
                      ))}
                    </div>
                  </Card>
                )
              },
              {
                id: "nieuw",
                label: "Nieuw moment",
                count: snapshot.data.events.length,
                children: (
                  <Card>
                    <SectionHeader title="Nieuw afzwemmoment" count={snapshot.data.events.length} />
                    <AfzwemEventForm data={snapshot.data} />
                  </Card>
                )
              },
              {
                id: "momenten",
                label: "Momenten",
                count: snapshot.data.events.length,
                children: (
                  <Card>
                    <SectionHeader title="Afzwemmomenten" count={snapshot.data.events.length} />
                    <div className="grid gap-4">
                      {snapshot.data.events.length === 0 ? <EmptyState>Geen afzwemmomenten gevonden.</EmptyState> : null}
                      {snapshot.data.events.map((event) => (
                        <AfzwemEventCard key={event.id} data={snapshot.data} event={event} lookups={lookups} />
                      ))}
                    </div>
                  </Card>
                )
              },
              {
                id: "resultaten",
                label: "Resultaten",
                count: snapshot.data.results.length,
                children: (
                  <Card>
                    <SectionHeader title="Resultaten" count={snapshot.data.results.length} />
                    <div className="grid gap-3">
                      {snapshot.data.results.length === 0 ? <EmptyState>Nog geen resultaten geregistreerd.</EmptyState> : null}
                      {snapshot.data.results.map((result) => (
                        <ResultRow key={result.id} lookups={lookups} result={result} />
                      ))}
                    </div>
                  </Card>
                )
              },
              {
                id: "diplomas",
                label: "Diplomakluis",
                count: snapshot.data.certificates.length,
                children: (
                  <Card>
                    <SectionHeader title="Digitale diplomakluis" count={snapshot.data.certificates.length} />
                    <div className="grid gap-3">
                      {snapshot.data.certificates.length === 0 ? <EmptyState>Nog geen diploma-records gevonden.</EmptyState> : null}
                      {snapshot.data.certificates.map((certificate) => (
                        <CertificateVaultCard
                          key={certificate.id}
                          certificate={certificate}
                          events={lookups.certificateAccessEventsByCertificate.get(certificate.id) ?? []}
                          lookups={lookups}
                          versions={lookups.certificateVersionsByCertificate.get(certificate.id) ?? []}
                        />
                      ))}
                    </div>
                  </Card>
                )
              }
            ]}
          />
        </>
      ) : (
        <AfzwemStatusPanel snapshot={snapshot} />
      )}
    </div>
  );
}

function AfzwemRadarPanel({ data, lookups }: { data: AdminAfzwemData; lookups: LookupMaps }) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Afzwem radar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Ziet wie bijna klaar is, waarom, wat nog mist en welk afzwemmoment logisch is. De radar wijzigt geen diploma of betaling zonder adminactie.
          </p>
        </div>
        <form action={evaluateDiplomaReadinessRadarAction}>
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
            Radar verversen
          </button>
        </form>
      </div>

      <div className="grid gap-4">
        {data.readinessRadar.length === 0 ? (
          <div className="grid gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="font-semibold">Nog geen radarrecords.</p>
              <p className="mt-1 text-sm text-muted-foreground">Ververs de radar om actieve inschrijvingen te beoordelen op voortgang, aanwezigheid, akkoord en minimale opbouwperiode.</p>
            </div>
            <form action={evaluateDiplomaReadinessRadarAction}>
              <button className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted" type="submit">
                Eerste scan draaien
              </button>
            </form>
          </div>
        ) : null}
        {data.readinessRadar.map((radarRow) => (
          <AfzwemRadarCard
            key={radarRow.id}
            events={lookups.readinessEventsByRadar.get(radarRow.id) ?? []}
            lookups={lookups}
            radarRow={radarRow}
            suggestions={lookups.suggestionsByRadar.get(radarRow.id) ?? []}
          />
        ))}
      </div>
    </Card>
  );
}

function AfzwemRadarCard({
  events,
  lookups,
  radarRow,
  suggestions
}: {
  events: DiplomaReadinessEventRow[];
  lookups: LookupMaps;
  radarRow: DiplomaReadinessRadarRow;
  suggestions: AfzwemEventCandidateSuggestionRow[];
}) {
  const participant = lookups.participants.get(radarRow.participant_id);
  const program = lookups.programs.get(radarRow.program_id);
  const stage = radarRow.stage_id ? lookups.stages.get(radarRow.stage_id) : null;
  const progress = radarRow.progress_snapshot;
  const attendance = radarRow.attendance_snapshot;
  const period = radarRow.period_snapshot;
  const candidateSuggestions = suggestions.filter((suggestion) => suggestion.suggested_status === "candidate").slice(0, 3);

  return (
    <div className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-4 xl:grid-cols-[1fr_0.9fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{participant?.display_name ?? "Leerling"}</p>
            <p className="text-sm text-muted-foreground">
              {program?.name ?? "Programma"} - {stage?.name ?? "Niveau onbekend"} - laatst berekend {formatDateTime(radarRow.last_evaluated_at)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={readinessTone(radarRow.readiness_status)}>{readinessLabel(radarRow.readiness_status)}</StatusPill>
            <StatusPill tone={radarRow.confidence === "high" ? "success" : radarRow.confidence === "medium" ? "info" : "warning"}>
              {radarRow.score === null ? "-" : `${formatNumber(radarRow.score)}%`} · {radarRow.confidence}
            </StatusPill>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <InfoTile label="Voortgang" value={`${valueFrom(progress, "completed_modules")}/${valueFrom(progress, "required_modules")} modules`} />
          <InfoTile label="Aanwezigheid" value={`${valueFrom(attendance, "attendance_percentage")}%`} />
          <InfoTile label="Opbouw" value={`${valueFrom(period, "session_count")} lessen`} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <ReasonBlock label="Waarom" rows={radarRow.reasons} tone="success" />
          <ReasonBlock label="Mist nog" rows={radarRow.missing_criteria.length > 0 ? radarRow.missing_criteria : radarRow.blockers} tone={radarRow.blockers.length > 0 ? "warning" : "success"} />
        </div>

        {events.length > 0 ? (
          <details className="mt-4 rounded-2xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Radar timeline</summary>
            <div className="mt-3 grid gap-2">
              {events.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded-xl bg-muted/50 p-3 text-sm">
                  <p className="font-semibold">{event.event_type}</p>
                  <p className="text-muted-foreground">{event.note ?? "Geen notitie"} - {formatDateTime(event.created_at)}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid gap-3">
        <form action={evaluateDiplomaReadinessRadarAction} className="rounded-2xl border border-border bg-card p-3">
          <input name="enrollment_id" type="hidden" value={radarRow.enrollment_id} />
          <button className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-muted" type="submit">
            Alleen deze leerling herberekenen
          </button>
        </form>

        <form action={reviewDiplomaReadinessAction} className="grid gap-3 rounded-2xl border border-border bg-card p-3">
          <input name="readiness_radar_id" type="hidden" value={radarRow.id} />
          <SelectField defaultValue={radarRow.readiness_status} label="Admin review" name="readiness_status" options={readinessStatusOptions} />
          <TextAreaField defaultValue={radarRow.review_note} label="Reviewreden / override" name="review_note" />
          <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
            Review opslaan
          </button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="mb-3 text-sm font-bold">Afzwemmoment suggesties</p>
          <div className="grid gap-3">
            {candidateSuggestions.length === 0 ? <EmptyState>Geen passend gepland afzwemmoment gevonden.</EmptyState> : null}
            {candidateSuggestions.map((suggestion) => (
              <AfzwemCandidateSuggestionForm key={suggestion.id} lookups={lookups} radarRow={radarRow} suggestion={suggestion} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AfzwemCandidateSuggestionForm({
  lookups,
  radarRow,
  suggestion
}: {
  lookups: LookupMaps;
  radarRow: DiplomaReadinessRadarRow;
  suggestion: AfzwemEventCandidateSuggestionRow;
}) {
  const event = lookups.events.get(suggestion.milestone_event_id);

  return (
    <form action={inviteReadinessCandidateAction} className="grid gap-3 rounded-xl border border-border bg-muted/35 p-3">
      <input name="readiness_radar_id" type="hidden" value={radarRow.id} />
      <input name="candidate_suggestion_id" type="hidden" value={suggestion.id} />
      <input name="milestone_event_id" type="hidden" value={suggestion.milestone_event_id} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{event?.title ?? "Afzwemmoment"}</p>
          <p className="text-sm text-muted-foreground">{event ? formatDateTime(event.starts_at) : "Datum onbekend"}</p>
        </div>
        <StatusPill tone={suggestion.confidence === "high" ? "success" : "info"}>{suggestion.score === null ? "-" : `${formatNumber(suggestion.score)}%`}</StatusPill>
      </div>
      <ReasonBlock label="Match" rows={suggestion.reasons} tone="success" />
      {suggestion.blockers.length > 0 ? <ReasonBlock label="Aandacht" rows={suggestion.blockers} tone="warning" /> : null}
      <TextAreaField label="Uitnodigingsnotitie / override reden" name="note" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Uitnodigen
      </button>
    </form>
  );
}

function CriteriaCard({ criteria, lookups }: { criteria: AfzwemReadinessCriteriaRow; lookups: LookupMaps }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{criteria.name}</p>
          <p className="text-sm text-muted-foreground">
            {lookups.programs.get(criteria.program_id)?.name ?? "Programma"} - {criteria.stage_id ? (lookups.stages.get(criteria.stage_id)?.name ?? "Niveau") : "Geen vast niveau"}
          </p>
          {criteria.description ? <p className="mt-2 text-sm text-muted-foreground">{criteria.description}</p> : null}
        </div>
        <StatusPill tone={criteria.status === "active" ? "success" : "neutral"}>{criteria.status}</StatusPill>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <InfoTile label="Modules" value={`${criteria.min_completed_modules} afgerond`} />
        <InfoTile label="Min. score" value={criteria.min_score === null ? "-" : `${criteria.min_score}%`} />
      </div>
    </div>
  );
}

function AfzwemEventForm({ data }: { data: AdminAfzwemData }) {
  return (
    <form action={createAfzwemEventAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Titel" name="title" required />
        <SelectField label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
        <SelectField includeEmpty label="Afzwem-stage" name="stage_id" options={data.stages.map(optionFromName)} />
        <SelectField includeEmpty label="Locatie" name="resource_id" options={data.resources.map((resource) => ({ label: resource.location_name ? `${resource.name} - ${resource.location_name}` : resource.name, value: resource.id }))} />
        <TextField label="Start" name="starts_at" required type="datetime-local" />
        <TextField label="Einde" name="ends_at" required type="datetime-local" />
        <TextField defaultValue={12} label="Capaciteit" min={1} name="capacity" type="number" />
        <SelectField defaultValue="scheduled" label="Status" name="status" options={eventStatusOptions} />
      </div>
      <TextAreaField label="Beschrijving" name="description" />
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        Afzwemmoment opslaan
      </button>
    </form>
  );
}

function AfzwemEventCard({ data, event, lookups }: { data: AdminAfzwemData; event: AfzwemEventRow; lookups: LookupMaps }) {
  const eventParticipants = lookups.eventParticipantsByEvent.get(event.id) ?? [];
  const resource = event.resource_id ? lookups.resources.get(event.resource_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{event.title}</p>
          <p className="text-sm text-muted-foreground">
            {lookups.programs.get(event.program_id)?.name ?? "Programma"} - {formatDateTime(event.starts_at)} - {resource?.location_name ?? resource?.name ?? "Locatie volgt"}
          </p>
        </div>
        <StatusPill tone={event.status === "scheduled" ? "success" : event.status === "cancelled" ? "danger" : "neutral"}>{event.status}</StatusPill>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <InfoTile label="Capaciteit" value={`${eventParticipants.length}/${event.capacity}`} />
            <InfoTile label="Einde" value={formatDateTime(event.ends_at)} />
            <InfoTile label="Type" value={event.event_type} />
          </div>
          <InviteParticipantForm data={data} event={event} />
        </div>

        <div className="grid gap-3">
          {eventParticipants.length === 0 ? <EmptyState>Nog geen deelnemers gekoppeld aan dit afzwemmoment.</EmptyState> : null}
          {eventParticipants.map((eventParticipant) => (
            <AfzwemParticipantRow key={eventParticipant.id} eventParticipant={eventParticipant} lookups={lookups} />
          ))}
        </div>
      </div>
    </div>
  );
}

function InviteParticipantForm({ data, event }: { data: AdminAfzwemData; event: AfzwemEventRow }) {
  const enrollmentOptions = data.enrollments
    .filter((enrollment) => enrollment.program_id === event.program_id)
    .map((enrollment) => {
      const participant = data.participants.find((candidate) => candidate.id === enrollment.participant_id);
      const stage = enrollment.current_stage_id ? data.stages.find((candidate) => candidate.id === enrollment.current_stage_id) : null;

      return {
        label: `${participant?.display_name ?? "Leerling"} - ${stage?.name ?? "geen stage"}`,
        value: enrollment.id
      };
    });

  return (
    <details className="rounded-2xl border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Kandidaat toevoegen</summary>
      <form action={inviteAfzwemParticipantAction} className="mt-4 grid gap-3">
        <input name="milestone_event_id" type="hidden" value={event.id} />
        <SelectField label="Leerling/enrollment" name="enrollment_id" options={enrollmentOptions} required />
        <SelectField includeEmpty label="Criteria" name="readiness_criteria_id" options={data.readinessCriteria.filter((criteria) => criteria.program_id === event.program_id).map(optionFromName)} />
        <SelectField defaultValue="invited" label="Status" name="status" options={participantStatusOptions} />
        <TextAreaField label="Notitie" name="note" />
        <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Uitnodiging opslaan
        </button>
      </form>
    </details>
  );
}

function AfzwemParticipantRow({ eventParticipant, lookups }: { eventParticipant: AfzwemEventParticipantRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(eventParticipant.participant_id);
  const enrollment = lookups.enrollments.get(eventParticipant.enrollment_id);
  const stage = enrollment?.current_stage_id ? lookups.stages.get(enrollment.current_stage_id) : null;
  const result = lookups.resultsByEventParticipant.get(eventParticipant.id);

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{participant?.display_name ?? "Leerling"}</p>
          <p className="text-sm text-muted-foreground">{stage?.name ?? "Niveau onbekend"} - {eventParticipant.note ?? "Geen notitie"}</p>
        </div>
        <StatusPill tone={eventParticipant.status === "confirmed" || eventParticipant.status === "attended" ? "success" : eventParticipant.status === "declined" || eventParticipant.status === "no_show" ? "danger" : "warning"}>{eventParticipant.status}</StatusPill>
      </div>
      <ResultForm eventParticipant={eventParticipant} result={result} />
    </div>
  );
}

function ResultForm({ eventParticipant, result }: { eventParticipant: AfzwemEventParticipantRow; result: AfzwemResultRow | undefined }) {
  return (
    <details className="mt-4 rounded-2xl border border-border bg-muted/35 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">{result ? "Resultaat bijwerken" : "Resultaat registreren"}</summary>
      <form action={registerAfzwemResultAction} className="mt-4 grid gap-3">
        <input name="milestone_event_participant_id" type="hidden" value={eventParticipant.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField defaultValue={result?.result_status ?? "passed"} label="Resultaat" name="result_status" options={resultStatusOptions} />
          <TextField defaultValue={result?.score ?? ""} label="Score" max={100} min={0} name="score" type="number" />
        </div>
        <TextAreaField defaultValue={result?.note} label="Resultaatnotitie" name="note" />
        <TextAreaField label="Guardrail override reden" name="guardrail_override_reason" />
        <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Resultaat opslaan
        </button>
      </form>
    </details>
  );
}

function ResultRow({ result, lookups }: { result: AfzwemResultRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(result.participant_id);
  const event = lookups.events.get(result.milestone_event_id);
  const certificate = result.certificate_id ? lookups.certificatesByResult.get(result.id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{participant?.display_name ?? "Leerling"}</p>
          <p className="text-sm text-muted-foreground">{event?.title ?? "Afzwemmoment"} - {formatDateTime(result.registered_at)}</p>
          {result.note ? <p className="mt-2 text-sm text-muted-foreground">{result.note}</p> : null}
        </div>
        <StatusPill tone={result.result_status === "passed" ? "success" : result.result_status === "failed" ? "danger" : "warning"}>{result.result_status}</StatusPill>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Score: {result.score === null ? "-" : `${result.score}%`} - Diploma: {certificate?.certificate_number ?? "nog niet gekoppeld"}</p>
    </div>
  );
}

function CertificateVaultCard({
  certificate,
  events,
  lookups,
  versions
}: {
  certificate: AfzwemCertificateRow;
  events: AfzwemCertificateAccessEventRow[];
  lookups: LookupMaps;
  versions: AfzwemCertificateVersionRow[];
}) {
  const currentVersion = versions.find((version) => version.id === certificate.current_version_id) ?? versions.find((version) => version.status === "current") ?? versions[0] ?? null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{certificate.title}</p>
          <p className="text-sm text-muted-foreground">{lookups.participants.get(certificate.participant_id)?.display_name ?? "Leerling"} - {certificate.certificate_number ?? "geen nummer"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={certificate.status === "revoked" ? "danger" : certificate.vault_status === "available" ? "success" : certificate.vault_status === "archived" ? "neutral" : "warning"}>{certificate.status}</StatusPill>
          <StatusPill tone={certificate.vault_status === "available" ? "success" : certificate.vault_status === "archived" ? "neutral" : "warning"}>{certificate.vault_status}</StatusPill>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <InfoTile label="Download" value={certificate.download_status} />
        <InfoTile label="Delen" value={certificate.share_enabled ? "aan" : "uit"} />
        <InfoTile label="Versie" value={`v${certificate.version_number}`} />
        <InfoTile label="Retentie" value={certificate.retention_until ? formatDate(certificate.retention_until) : "Niet ingesteld"} />
        <InfoTile label="Laatst download" value={certificate.last_downloaded_at ? formatDateTime(certificate.last_downloaded_at) : "Nog nooit"} />
        <InfoTile label="Bucket" value={certificate.storage_bucket} />
      </div>
      {currentVersion ? (
        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          Huidige versie: v{currentVersion.version_number} - {currentVersion.file_source} - {currentVersion.file_path}
        </div>
      ) : null}
      {certificate.status === "revoked" ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          Ingetrokken {certificate.revoked_at ? formatDateTime(certificate.revoked_at) : ""}: {certificate.revoked_reason ?? "Geen reden opgegeven"}
        </div>
      ) : null}
      <details className="mt-4 rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Vault voorbereiden</summary>
        <form action={updateCertificateVaultAction} className="mt-4 grid gap-3">
          <input name="certificate_id" type="hidden" value={certificate.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField defaultValue={certificate.status} label="Certificaatstatus" name="status" options={certificateStatusOptions} />
            <SelectField defaultValue={certificate.download_status} label="Downloadstatus" name="download_status" options={downloadStatusOptions} />
            <SelectField defaultValue={certificate.vault_status} label="Vaultstatus" name="vault_status" options={vaultStatusOptions} />
            <SelectField defaultValue={certificate.file_source} label="Bestandsbron" name="file_source" options={fileSourceOptions} />
            <TextField defaultValue={certificate.storage_bucket} label="Storage bucket" name="storage_bucket" />
            <TextField defaultValue={certificate.retention_until ?? ""} label="Bewaren tot" name="retention_until" type="date" />
            <TextField defaultValue={currentVersion?.mime_type ?? ""} label="MIME type" name="mime_type" />
            <TextField defaultValue={currentVersion?.file_size_bytes ?? ""} label="Bestandsgrootte bytes" min={0} name="file_size_bytes" type="number" />
          </div>
          <TextField defaultValue={certificate.file_path ?? ""} label="Bestandspad" name="file_path" />
          <TextField defaultValue={currentVersion?.original_filename ?? ""} label="Originele bestandsnaam" name="original_filename" />
          <TextAreaField defaultValue={currentVersion?.notes ?? ""} label="Versienotitie" name="version_notes" />
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-muted-foreground">
            <input className="h-4 w-4 accent-primary" defaultChecked={certificate.share_enabled} name="share_enabled" type="checkbox" />
            Delen voorbereiden
          </label>
          <TextField defaultValue={certificate.share_expires_at ? formatDateTimeInput(certificate.share_expires_at) : ""} label="Share verloopt op" name="share_expires_at" type="datetime-local" />
          <TextAreaField defaultValue={certificate.revoked_reason} label="Intrekreden" name="revoked_reason" />
          <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
            Vault opslaan
          </button>
        </form>
      </details>
      {versions.length > 0 ? (
        <details className="mt-3 rounded-2xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Versiehistorie ({versions.length})</summary>
          <div className="mt-3 grid gap-2">
            {versions.slice(0, 5).map((version) => (
              <div key={version.id} className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <p className="font-bold text-foreground">v{version.version_number} - {version.status}</p>
                <p>{version.file_path}</p>
                <p>{formatDateTime(version.created_at)} {version.retention_until ? `- bewaren tot ${formatDate(version.retention_until)}` : ""}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {events.length > 0 ? (
        <details className="mt-3 rounded-2xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-sm font-semibold text-primary">Audit ({events.length})</summary>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {events.slice(0, 8).map((event) => (
              <span key={event.id} className="rounded-full border border-border bg-background px-3 py-1">
                {event.event_type} - {formatDateTime(event.created_at)}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AfzwemStatusPanel({ snapshot }: AdminAfzwemPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Afzwemmen niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie en tenant adminrechten nodig.</p>
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

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{children}</div>;
}

function ReasonBlock({ label, rows, tone }: { label: string; rows: Array<Record<string, unknown>>; tone: "success" | "warning" }) {
  return (
    <div className={`rounded-2xl border p-3 ${tone === "success" ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
      <p className={`text-xs font-bold uppercase ${tone === "success" ? "text-emerald-700" : "text-amber-700"}`}>{label}</p>
      <div className="mt-2 grid gap-2">
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Geen bijzonderheden.</p> : null}
        {rows.slice(0, 4).map((row, index) => (
          <div key={`${String(row.code ?? row.label ?? label)}-${index}`} className="rounded-xl bg-background/75 p-2 text-sm">
            <p className="font-semibold">{String(row.label ?? row.code ?? "Signaal")}</p>
            {typeof row.detail === "string" ? <p className="mt-1 text-xs text-muted-foreground">{row.detail}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  defaultValue,
  label,
  max,
  min,
  name,
  required,
  type = "text"
}: {
  defaultValue?: string | number | null;
  label: string;
  max?: number;
  min?: number;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} max={max} min={min} name={name} required={required} type={type} />
    </label>
  );
}

function TextAreaField({ defaultValue, label, name }: { defaultValue?: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <textarea className={`${fieldClassName} min-h-20`} defaultValue={defaultValue ?? ""} name={name} />
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
  defaultValue?: string | number | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string | number }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
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

function buildLookups(data: AdminAfzwemData): LookupMaps {
  return {
    programs: byId(data.programs),
    stages: byId(data.stages),
    resources: byId(data.resources),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    criteria: byId(data.readinessCriteria),
    events: byId(data.events),
    eventParticipantsByEvent: groupBy(data.eventParticipants, (eventParticipant) => eventParticipant.milestone_event_id),
    resultsByEventParticipant: new Map(data.results.map((result) => [result.milestone_event_participant_id, result])),
    certificatesByResult: new Map(data.certificates.flatMap((certificate) => (certificate.source_result_id ? [[certificate.source_result_id, certificate] as const] : []))),
    certificateVersionsByCertificate: groupBy(data.certificateVersions, (version) => version.certificate_id),
    certificateAccessEventsByCertificate: groupBy(data.certificateAccessEvents, (event) => event.certificate_id),
    readinessByEnrollment: new Map(data.readinessRadar.map((radarRow) => [radarRow.enrollment_id, radarRow])),
    suggestionsByRadar: groupBy(data.candidateSuggestions, (suggestion) => suggestion.readiness_radar_id),
    readinessEventsByRadar: groupBy(data.readinessEvents, (event) => event.readiness_radar_id)
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

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(value);
}

function formatDateTimeInput(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function valueFrom(source: Record<string, unknown>, key: string) {
  const value = source[key];

  if (typeof value === "number") {
    return formatNumber(value);
  }

  if (typeof value === "string") {
    return value;
  }

  return "-";
}

function readinessTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "completed" || status === "invited") {
    return "success";
  }

  if (status === "ready_for_review") {
    return "info";
  }

  if (status === "almost_ready") {
    return "warning";
  }

  return status === "not_ready" ? "danger" : "neutral";
}

function readinessLabel(status: string) {
  return (
    {
      not_ready: "niet klaar",
      almost_ready: "bijna klaar",
      ready_for_review: "klaar voor review",
      invited: "uitgenodigd",
      completed: "afgerond"
    }[status] ?? status
  );
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const eventStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Gepland", value: "scheduled" },
  { label: "Afgerond", value: "completed" },
  { label: "Geannuleerd", value: "cancelled" }
];

const participantStatusOptions = [
  { label: "Uitgenodigd", value: "invited" },
  { label: "Bevestigd", value: "confirmed" },
  { label: "Afgewezen", value: "declined" },
  { label: "Aanwezig", value: "attended" },
  { label: "Niet verschenen", value: "no_show" },
  { label: "Geannuleerd", value: "cancelled" }
];

const resultStatusOptions = [
  { label: "Geslaagd", value: "passed" },
  { label: "Niet geslaagd", value: "failed" },
  { label: "Afwezig", value: "absent" },
  { label: "Herkansing nodig", value: "needs_retry" },
  { label: "In afwachting", value: "pending" }
];

const certificateStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Uitgegeven", value: "issued" },
  { label: "Ingetrokken", value: "revoked" }
];

const readinessStatusOptions = [
  { label: "Niet klaar", value: "not_ready" },
  { label: "Bijna klaar", value: "almost_ready" },
  { label: "Klaar voor review", value: "ready_for_review" }
];

const downloadStatusOptions = [
  { label: "Pending", value: "pending" },
  { label: "Ready", value: "ready" },
  { label: "Blocked", value: "blocked" }
];

const vaultStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Available", value: "available" },
  { label: "Archived", value: "archived" }
];

const fileSourceOptions = [
  { label: "Generated placeholder", value: "generated_placeholder" },
  { label: "Admin upload", value: "admin_upload" },
  { label: "External import", value: "external_import" },
  { label: "Manual path", value: "manual_path" }
];
