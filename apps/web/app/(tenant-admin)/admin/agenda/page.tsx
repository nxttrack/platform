import { toAmsterdamDate } from "@/lib/date/business-date";
import { AlertTriangle, CalendarDays, Clock, Users } from "lucide-react";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PlanningDayBoard } from "@/components/admin/planning-day-board";
import { PageHeader } from "@/components/shell/ui";
import { createSessionAction } from "@/lib/domain/actions";
import { saveInstructorAvailabilityAction } from "@/lib/domain/planning-actions";
import { getPlanningData } from "@/lib/domain/planning";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminAgendaPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getPlanningData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const pendingCatchUps = data.catchUpRequests.filter((request) => request.status === "requested");
  const todayKey = toAmsterdamDate();
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
      <Feedback saved={saved} error={error} />

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

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <div className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success" role="status">Opgeslagen: {saved}.</div>;
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

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
