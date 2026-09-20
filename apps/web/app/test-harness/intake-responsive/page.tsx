import { notFound } from "next/navigation";

import { PlanningDayBoard } from "@/components/admin/planning-day-board";
import { FocusNoteFields, RosterAttendanceFields } from "@/components/instructor/roster-form-fields";
import { IntakeProgramLayout } from "@/components/public/intake-program-layout";
import { IntakeWizard } from "@/components/public/intake-wizard";

export const dynamic = "force-dynamic";

export default async function ResponsiveIntakeHarness({ searchParams }: {
  searchParams: Promise<{ surface?: string; programma?: string }>;
}) {
  if (process.env.APP_ENV !== "test") notFound();
  const params = await searchParams;

  if (params.surface === "planning") {
    return <main className="p-4"><section className="rounded-2xl border p-4"><h1>Dag- en weekplan</h1><PlanningDayBoard days={[{
      key: "2026-09-22", label: "dinsdag 22 september", sessions: [{
        id: "fixture-session", groupName: "Sprint 4 Admin Groep 35512095754-1-0",
        startsAt: "2026-09-22T14:00:00Z", endsAt: "2026-09-22T14:45:00Z",
        instructorNames: ["Fictieve instructeur"], notes: "Alleen lokale fictieve gegevens.",
        resourceName: "Baan 1", status: "available", used: 1, capacity: 8, available: 7, catchUpHolds: 0
      }]
    }]} /></section></main>;
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
