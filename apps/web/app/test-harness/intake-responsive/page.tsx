import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, Clock, Send, Users } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { PlanningDayBoard } from "@/components/admin/planning-day-board";
import { FocusNoteFields, RosterAttendanceFields } from "@/components/instructor/roster-form-fields";
import { IntakeProgramLayout } from "@/components/public/intake-program-layout";
import { IntakeWizard } from "@/components/public/intake-wizard";
import { AppShell } from "@/components/shell/app-shell";
import { PageLoadingSkeleton } from "@/components/shell/page-loading-skeleton";
import { PageHeader } from "@/components/shell/ui";
import { adminNav } from "@/lib/navigation";

export const dynamic = "force-dynamic";

export default async function ResponsiveIntakeHarness({ searchParams }: {
  searchParams: Promise<{ surface?: string; programma?: string }>;
}) {
  if (process.env.APP_ENV !== "test") notFound();
  const params = await searchParams;

  if (params.surface === "loading") {
    return <AppShell accent="admin" brand={{ title: "NXTTRACK technische E2E-fixture", subtitle: "Backoffice" }} nav={adminNav} user={{ name: "E2E Tenantbeheerder", role: "Organisatiebeheerder" }}><PageLoadingSkeleton /></AppShell>;
  }

  if (params.surface === "graduation") {
    return <AppShell accent="admin" brand={{ title: "NXTTRACK technische E2E-fixture", subtitle: "Backoffice" }} nav={adminNav} user={{ name: "E2E Tenantbeheerder", role: "Organisatiebeheerder" }}><div className="min-w-0 space-y-5">
      <PageHeader kicker="Lesproces" title="Afzwemmen en diploma's" subtitle="Responsieve lokale fixture met lange, fictieve eventnamen." />
      <AdminListSurface>
        <div className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Fictieve leerling</p><span>ready</span></div><p className="mt-1 text-xs text-muted-foreground">Badje 1 · menselijk beoordeeld</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Alleen lokale fictieve gegevens voor het responsieve contract.</p></div>
          <form className="flex w-full min-w-0 flex-wrap items-end gap-2 md:w-auto">
            <label className="w-full min-w-0 space-y-2 text-sm font-semibold text-foreground sm:w-auto"><span>Afzwemevent</span><select className="h-10 w-full min-w-0 max-w-full rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none sm:w-64" defaultValue="" name="eventId"><option value="">Kies event</option><option value="fixture">Fictief afzwemevent met een uitzonderlijk lange naam - 18 oktober 2026, 10:00</option></select></label>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button"><Send className="size-4" />Uitnodigen</button>
          </form>
        </div>
      </AdminListSurface>
    </div></AppShell>;
  }

  if (params.surface === "capacity") {
    return <AppShell accent="admin" brand={{ title: "NXTTRACK technische E2E-fixture", subtitle: "Backoffice" }} nav={adminNav} user={{ name: "E2E Tenantbeheerder", role: "Organisatiebeheerder" }}><div className="min-w-0 space-y-5">
      <PageHeader kicker="Inzichten" title="Capaciteitsvoorspelling" subtitle="Responsieve lokale fixture met lange, fictieve lesgroep- en kandidaatnamen." />
      <AdminListSurface>
        <form className="grid min-w-0 gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-6">
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-foreground">Lesgroep<select className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue=""><option value="">Kies lesgroep</option><option value="fixture">Fictieve zwemgroep met een uitzonderlijk lange naam en locatieomschrijving</option></select></label>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-foreground">Wachtlijstkandidaat<select className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue=""><option value="">Kies kandidaat</option><option value="fixture">Fictieve wachtlijstkandidaat met een uitzonderlijk lange samengestelde naam</option></select></label>
          <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-foreground xl:col-span-2">Reden<input className="min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" placeholder="Waarom moet de planner deze plek beoordelen?" /></label>
          <div className="md:col-span-2 xl:col-span-6"><button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">Aanvraag klaarzetten</button></div>
        </form>
      </AdminListSurface>
    </div></AppShell>;
  }

  if (params.surface === "planning") {
    return <AppShell accent="admin" brand={{ title: "NXTTRACK technische E2E-fixture", subtitle: "Backoffice" }} nav={adminNav} user={{ name: "E2E Tenantbeheerder", role: "Organisatiebeheerder" }}><div className="min-w-0 space-y-5">
      <PageHeader
        action={<><AdminActionDrawer description="Alleen een lokale fixture." title="Nieuwe les" triggerLabel="Les plannen"><p>Read-only</p></AdminActionDrawer><AdminActionDrawer description="Alleen een lokale fixture." title="Beschikbaarheid instructeur" triggerLabel="Beschikbaarheid" triggerVariant="outline"><p>Read-only</p></AdminActionDrawer></>}
        kicker="Planning"
        title="Planbord"
        subtitle="Scan de week, open lesdetails in een dossierdrawer en stuur alleen bij waar signalen daarom vragen."
      />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={CalendarDays} label="Vandaag" value={1} />
        <AdminMetricCard icon={AlertTriangle} label="Conflicten" tone="success" value={0} />
        <AdminMetricCard icon={Users} label="Over capaciteit" tone="success" value={0} />
        <AdminMetricCard icon={Clock} label="Inhaalverzoeken" tone="warning" value={1} />
      </div>
      <AdminListSurface><h2>Dag- en weekplan</h2><PlanningDayBoard days={[{
        key: "2026-09-22", label: "dinsdag 22 september", sessions: [{
          id: "fixture-session", groupName: "Sprint 4 Admin Groep 35512095754-1-0",
          startsAt: "2026-09-22T14:00:00Z", endsAt: "2026-09-22T14:45:00Z",
          instructorNames: ["Fictieve instructeur"], notes: "Alleen lokale fictieve gegevens.",
          resourceName: "Baan 1", status: "available", used: 1, capacity: 8, available: 7, catchUpHolds: 0
        }]
      }]} /></AdminListSurface>
    </div></AppShell>;
  }

  if (params.surface === "instructor") {
    return <main className="p-4 md:pl-[264px]"><h1>Fictief instructeurrooster</h1><section className="rounded-2xl border p-4">
      <article className="rounded-xl border p-4"><h2>Vandaag focus</h2><form action={refuseFixtureSubmission}><FocusNoteFields id="fixture-focus-note" participantName="Fictieve leerling" /></form></article>
      <article className="mt-4 rounded-lg border p-3"><h2>Fictieve leerling</h2><form action={refuseFixtureSubmission}><RosterAttendanceFields participantName="Fictieve leerling" status="present" note="" /></form></article>
    </section></main>;
  }

  const programs = Array.from({ length: 40 }, (_, index) => ({
    id: `fixture-${index + 1}`,
    name: `Fictief zwemprogramma ${String(index + 1).padStart(2, "0")} met een lange programmanaam`,
    waitBand: "short" as const
  }));
  const selected = programs.find((program) => program.id === params.programma) ?? programs[0];
  return <main className="px-4 py-6"><h1>Fictieve intake met 40 programma’s</h1>
    <IntakeProgramLayout programs={programs} selectedProgramId={selected.id}>
      <IntakeWizard action={refuseFixtureSubmission} allowedOptions={["enrollment"]} formId={null} formStartedAt={Date.now()} programId={selected.id} programName={selected.name} questions={[]} slots={[]} />
    </IntakeProgramLayout>
  </main>;
}

async function refuseFixtureSubmission() {
  "use server";
  throw new Error("This read-only visual fixture cannot submit data.");
}
