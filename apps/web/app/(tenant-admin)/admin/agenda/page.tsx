import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Users } from "lucide-react";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PlanningDayBoard } from "@/components/admin/planning-day-board";
import { PlanningWorkbench } from "@/components/admin/planning-workbench";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createSessionAction } from "@/lib/domain/actions";
import { decideCatchUpRequestAction, saveInstructorAvailabilityAction, undoPlanningChangeAction } from "@/lib/domain/planning-actions";
import { getPlanningData, type PlanningConflict } from "@/lib/domain/planning";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminAgendaPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getPlanningData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const undo = getParam(params, "undo");
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const sessionInsightById = new Map(data.sessionInsights.map((insight) => [insight.session.id, insight]));
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const pendingCatchUps = data.catchUpRequests.filter((request) => request.status === "requested");
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySessions = data.sessionInsights.filter((insight) => insight.dayKey === todayKey);
  const overCapacitySessions = data.sessionInsights.filter((insight) => insight.status === "over_capacity").length;

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <>
            <AdminActionDrawer description="Plan een concrete les; conflict- en capaciteitssignalen verschijnen direct op het planbord." title="Nieuwe les" triggerLabel="Les plannen" width="wide">
              <SessionForm data={data} />
            </AdminActionDrawer>
            <AdminActionDrawer description="Leg beschikbaarheid vast voor automatische conflictwaarschuwingen." title="Beschikbaarheid instructeur" triggerLabel="Beschikbaarheid" triggerVariant="outline">
              <AvailabilityForm data={data} />
            </AdminActionDrawer>
          </>
        }
        kicker="Planning"
        title="Planbord"
        subtitle="Scan de week, open lesdetails in een dossierdrawer en stuur alleen bij waar signalen daarom vragen."
      />
      <Feedback saved={saved} error={error} undo={undo} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={CalendarDays} label="Vandaag" value={todaySessions.length} />
        <AdminMetricCard icon={AlertTriangle} label="Conflicten" tone={data.conflicts.length ? "warning" : "success"} value={data.conflicts.length} />
        <AdminMetricCard icon={Users} label="Over capaciteit" tone={overCapacitySessions ? "warning" : "success"} value={overCapacitySessions} />
        <AdminMetricCard icon={Clock} label="Inhaalverzoeken" tone={pendingCatchUps.length ? "warning" : "success"} value={pendingCatchUps.length} />
      </div>

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Dag- en weekplan</h2><p className="text-[13px] text-muted-foreground">Klik een les voor capaciteit, instructeurs, inhaalplekken en conflicten.</p></div>
        {data.dayPlan.length === 0 ? (
          <EmptyState>Geen lessen in de komende 14 dagen.</EmptyState>
        ) : (
          <PlanningDayBoard days={data.dayPlan.map((day) => ({ key: day.key, label: day.label, sessions: day.sessions.map((insight) => ({ available: insight.available, capacity: insight.capacity, catchUpHolds: insight.catchUpHolds, endsAt: insight.session.ends_at, groupName: insight.group?.name ?? "Lesgroep", id: insight.session.id, instructorNames: insight.instructorNames, notes: insight.session.notes ?? "", resourceName: insight.resourceName, startsAt: insight.session.starts_at, status: insight.status, used: insight.used })) }))} />
        )}
      </AdminListSurface>

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">What-if planning</h2><p className="text-[13px] text-muted-foreground">Sleep of gebruik het toetsenbord; pas pas toe wanneer de conflictengine groen is.</p></div>
        <PlanningWorkbench initialItems={data.sessionInsights.map((insight) => ({ id: insight.session.id, groupName: insight.group?.name ?? "Lesgroep", startsAt: insight.session.starts_at, endsAt: insight.session.ends_at, resourceId: insight.session.resource_id, resourceName: insight.resourceName }))} />
      </AdminListSurface>

      <AdminSection title="Inhaalverzoeken" description="Zet inhaalcredits om naar echte lessen zodra capaciteit klopt.">
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
          {data.availability.length === 0 ? (
            <EmptyState>Nog geen beschikbaarheidsregels.</EmptyState>
          ) : (
            <DataList>
              {data.availability.slice(0, 8).map((row) => {
                const instructor = data.instructors.find((item) => item.userId === row.instructor_user_id);
                return <DataListRow aside={<StatusPill tone={row.availability_type === "available" ? "success" : "warning"}>{row.availability_type === "available" ? "Beschikbaar" : "Niet beschikbaar"}</StatusPill>} key={row.id} meta={`${weekdayLabel(row.weekday)} ${row.starts_at.slice(0, 5)}–${row.ends_at.slice(0, 5)}`} title={instructor?.label ?? row.instructor_user_id} />;
              })}
            </DataList>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function SessionForm({ data }: { data: Awaited<ReturnType<typeof getPlanningData>> }) {
  return (
    <form action={createSessionAction} className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Lesgroep" name="groupId" required>
        <option value="">Kies groep</option>
        {data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </SelectField>
      <SelectField label="Resource" name="resourceId">
        <option value="">Gebruik groepsresource</option>
        {data.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
      </SelectField>
      <Field label="Start" name="startsAt" type="datetime-local" required />
      <Field label="Einde" name="endsAt" type="datetime-local" required />
      <SelectField label="Status" name="status">
        <option value="scheduled">Gepland</option><option value="draft">Concept</option><option value="completed">Afgerond</option><option value="cancelled">Geannuleerd</option>
      </SelectField>
      <Field label="Capaciteit override" name="capacityOverride" type="number" />
      <div className="sm:col-span-2"><TextAreaField label="Notitie" name="notes" /></div>
      <div className="sm:col-span-2"><SubmitButton>Les opslaan</SubmitButton></div>
    </form>
  );
}

function AvailabilityForm({ data }: { data: Awaited<ReturnType<typeof getPlanningData>> }) {
  return (
    <form action={saveInstructorAvailabilityAction} className="grid gap-4">
      <SelectField label="Instructeur" name="instructorUserId" required>
        <option value="">Kies instructeur</option>
        {data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.label}</option>)}
      </SelectField>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Dag" name="weekday"><option value="1">Maandag</option><option value="2">Dinsdag</option><option value="3">Woensdag</option><option value="4">Donderdag</option><option value="5">Vrijdag</option><option value="6">Zaterdag</option><option value="0">Zondag</option></SelectField>
        <Field label="Van" name="startsAt" required type="time" />
        <Field label="Tot" name="endsAt" required type="time" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Type" name="availabilityType"><option value="available">Beschikbaar</option><option value="unavailable">Niet beschikbaar</option></SelectField>
        <SelectField label="Status" name="status"><option value="active">Actief</option><option value="inactive">Inactief</option></SelectField>
      </div>
      <SubmitButton>Beschikbaarheid opslaan</SubmitButton>
    </form>
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

function Feedback({ saved, error, undo }: { saved?: string; error?: string; undo?: string }) {
  if (saved) {
    return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success"><span className="mr-auto">Opgeslagen: {saved}.</span>{undo ? <form action={undoPlanningChangeAction}><input name="changeId" type="hidden" value={undo} /><button className="rounded-lg border border-success/30 bg-background px-3 py-1.5 font-bold text-foreground hover:bg-muted" type="submit">Ongedaan maken</button></form> : null}</div>;
  }

  if (error === "time") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De eindtijd moet na de starttijd liggen.</p>;
  }

  if (error === "capacity") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Geen capaciteit meer voor deze inhaalles.</p>;
  }

  if (error === "conflict") return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De wijziging is niet toegepast: de resource is op dit tijdstip al bezet.</p>;

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
