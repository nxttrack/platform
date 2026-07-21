import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Users } from "lucide-react";
import type { ReactNode } from "react";
import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createSessionAction } from "@/lib/domain/actions";
import { decideCatchUpRequestAction, saveInstructorAvailabilityAction } from "@/lib/domain/planning-actions";
import { getPlanningData, type PlanningConflict, type PlanningSessionInsight } from "@/lib/domain/planning";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminAgendaPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getPlanningData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const sessionInsightById = new Map(data.sessionInsights.map((insight) => [insight.session.id, insight]));
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const pendingCatchUps = data.catchUpRequests.filter((request) => request.status === "requested");
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySessions = data.sessionInsights.filter((insight) => insight.dayKey === todayKey);
  const overCapacitySessions = data.sessionInsights.filter((insight) => insight.status === "over_capacity").length;

  return (
    <div className="space-y-6">
      <PageHeader kicker="Planboard" title="Planning en capaciteit" subtitle="Dag- en weekplanning met resource-, instructor- en capaciteitssignalen." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Vandaag" value={todaySessions.length.toString()} />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Conflicten" tone={data.conflicts.some((conflict) => conflict.severity === "danger") ? "danger" : data.conflicts.length > 0 ? "warning" : "success"} value={data.conflicts.length.toString()} />
        <Metric icon={<Users className="h-5 w-5" />} label="Over capaciteit" tone={overCapacitySessions > 0 ? "danger" : "success"} value={overCapacitySessions.toString()} />
        <Metric icon={<Clock className="h-5 w-5" />} label="Inhaalverzoeken" tone={pendingCatchUps.length > 0 ? "warning" : "success"} value={pendingCatchUps.length.toString()} />
      </div>

      <AdminSection title="Dag- en weekplan" description="Begin bij het rooster; open daarna alleen de formulieren die nodig zijn om de planning bij te sturen.">
        {data.dayPlan.length === 0 ? (
          <EmptyState>Geen lessen in de komende 14 dagen.</EmptyState>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {data.dayPlan.map((day) => (
              <section className="rounded-2xl border border-border bg-white p-4 shadow-soft" key={day.key}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-bold text-foreground">{day.label}</h2>
                  <StatusPill tone={day.sessions.some((session) => session.status === "over_capacity") ? "danger" : "neutral"}>{day.sessions.length} lessen</StatusPill>
                </div>
                <div className="space-y-2">
                  {day.sessions.map((insight) => (
                    <SessionPlanRow insight={insight} key={insight.session.id} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </AdminSection>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <AdminSection title="Les plannen" description="Een sessie is een concrete lesdatum en tijd. Conflicten verschijnen direct in het planboard.">
          <form action={createSessionAction} className="grid gap-4 md:grid-cols-2">
            <SelectField label="Lesgroep" name="groupId" required>
              <option value="">Kies groep</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Resource" name="resourceId">
              <option value="">Gebruik groepsresource</option>
              {data.resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </SelectField>
            <Field label="Start" name="startsAt" type="datetime-local" required />
            <Field label="Einde" name="endsAt" type="datetime-local" required />
            <SelectField label="Status" name="status">
              <option value="scheduled">Gepland</option>
              <option value="draft">Concept</option>
              <option value="completed">Afgerond</option>
              <option value="cancelled">Geannuleerd</option>
            </SelectField>
            <Field label="Capaciteit override" name="capacityOverride" type="number" />
            <div className="md:col-span-2">
              <TextAreaField label="Notitie" name="notes" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>Les opslaan</SubmitButton>
            </div>
          </form>
        </AdminSection>

        <AdminSection title="Catch-up approvals" description="Zet inhaalcredits om naar echte lessen zodra capaciteit klopt.">
          {pendingCatchUps.length === 0 ? (
            <EmptyState>Geen open inhaalverzoeken.</EmptyState>
          ) : (
            <DataList>
              {pendingCatchUps.map((request) => {
                const insight = sessionInsightById.get(request.preferred_session_id);
                const participant = participantById.get(request.participant_id);

                return (
                  <div className="grid gap-3 px-3 py-3" key={request.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{participant?.display_name ?? "Leerling"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {insight ? `${formatDateTime(insight.session.starts_at)} - ${insight.group?.name ?? "Lesgroep"} - ${formatNumber(insight.available)} vrij` : "Sessie niet gevonden"}
                        </p>
                      </div>
                      <StatusPill tone={insight && insight.available > 0 ? "success" : "danger"}>{insight ? insight.status : "missing"}</StatusPill>
                    </div>
                    <form action={decideCatchUpRequestAction} className="flex flex-wrap items-end gap-2">
                      <input name="requestId" type="hidden" value={request.id} />
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        <span>Notitie</span>
                        <input className="h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" name="adminNotes" placeholder="Optioneel" />
                      </label>
                      <button className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground" name="decision" type="submit" value="approved">
                        <CheckCircle2 className="h-4 w-4" />
                        Goedkeuren
                      </button>
                      <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold text-foreground hover:bg-muted" name="decision" type="submit" value="declined">
                        Afwijzen
                      </button>
                    </form>
                  </div>
                );
              })}
            </DataList>
          )}
        </AdminSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <AdminSection title="Conflicten">
          {data.conflicts.length === 0 ? (
            <EmptyState>Geen planningconflicten gevonden.</EmptyState>
          ) : (
            <DataList>
              {data.conflicts.slice(0, 12).map((conflict) => (
                <ConflictRow conflict={conflict} key={conflict.id} />
              ))}
            </DataList>
          )}
        </AdminSection>

        <AdminSection title="Instructor availability" description="Beschikbaarheid wordt gebruikt voor conflictwaarschuwingen. Instructors kunnen eigen beschikbaarheid later ook zelf beheren.">
          <form action={saveInstructorAvailabilityAction} className="grid gap-3">
            <SelectField label="Instructeur" name="instructorUserId" required>
              <option value="">Kies instructeur</option>
              {data.instructors.map((instructor) => (
                <option key={instructor.userId} value={instructor.userId}>
                  {instructor.label}
                </option>
              ))}
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Dag" name="weekday">
                <option value="1">Maandag</option>
                <option value="2">Dinsdag</option>
                <option value="3">Woensdag</option>
                <option value="4">Donderdag</option>
                <option value="5">Vrijdag</option>
                <option value="6">Zaterdag</option>
                <option value="0">Zondag</option>
              </SelectField>
              <Field label="Van" name="startsAt" required type="time" />
              <Field label="Tot" name="endsAt" required type="time" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Type" name="availabilityType">
                <option value="available">Beschikbaar</option>
                <option value="unavailable">Niet beschikbaar</option>
              </SelectField>
              <SelectField label="Status" name="status">
                <option value="active">Actief</option>
                <option value="inactive">Inactief</option>
              </SelectField>
            </div>
            <SubmitButton>Beschikbaarheid opslaan</SubmitButton>
          </form>
          <div className="mt-4">
            {data.availability.length === 0 ? (
              <EmptyState>Nog geen availability regels.</EmptyState>
            ) : (
              <DataList>
                {data.availability.slice(0, 6).map((row) => {
                  const instructor = data.instructors.find((item) => item.userId === row.instructor_user_id);

                  return <DataListRow aside={<StatusPill tone={row.availability_type === "available" ? "success" : "warning"}>{row.availability_type}</StatusPill>} key={row.id} meta={`${weekdayLabel(row.weekday)} ${row.starts_at.slice(0, 5)}-${row.ends_at.slice(0, 5)}`} title={instructor?.label ?? row.instructor_user_id} />;
                })}
              </DataList>
            )}
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, tone = "neutral" }: { icon: ReactNode; label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-foreground";

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={toneClass}>{icon}</span>
      </div>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
    </section>
  );
}

function ConflictRow({ conflict }: { conflict: PlanningConflict }) {
  return (
    <div className="px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-foreground">{conflict.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{conflict.detail}</p>
        </div>
        <StatusPill tone={conflict.severity === "danger" ? "danger" : "warning"}>{conflict.type}</StatusPill>
      </div>
    </div>
  );
}

function SessionPlanRow({ insight }: { insight: PlanningSessionInsight }) {
  return (
    <article className="rounded-xl border border-border bg-muted/30 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {formatTime(insight.session.starts_at)}-{formatTime(insight.session.ends_at)} · {insight.group?.name ?? "Lesgroep"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {insight.resourceName} · {insight.instructorNames.length > 0 ? insight.instructorNames.join(", ") : "geen instructeur"} · inhaalplekken {insight.catchUpHolds}
          </p>
        </div>
        <StatusPill tone={insight.status === "available" ? "success" : insight.status === "full" ? "warning" : "danger"}>
          {formatNumber(insight.used)}/{insight.capacity}
        </StatusPill>
      </div>
    </article>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error === "time") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De eindtijd moet na de starttijd liggen.</p>;
  }

  if (error === "capacity") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Geen capaciteit meer voor deze inhaalles.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function weekdayLabel(value: number) {
  return ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"][value] ?? "Dag";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
