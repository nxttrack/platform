import { AlertTriangle, CalendarClock, Database, ShieldCheck, Users, Waves } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { GroupCreationWizard } from "@/components/admin/group-creation-wizard";
import { GroupsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createGroupInstructorAssignmentAction } from "@/lib/domain/actions";
import {
  saveInstructorQualificationAction,
  saveLessonTimeTemplateAction,
  savePlanningPolicyAction,
  saveResourceLocationProfileAction,
  saveResourceOpeningHoursAction
} from "@/lib/domain/group-planning-actions";
import { getGroupPlanningData } from "@/lib/domain/group-planning";
import { detectAttendanceRisks, detectProgressBottlenecks } from "@/lib/domain/learning-intelligence";
import { toSmartActivityItem } from "@/lib/domain/smart-event-contract";
import { getTenantSmartEvents } from "@/lib/domain/smart-events";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const weekdays = [
  ["1", "Maandag"],
  ["2", "Dinsdag"],
  ["3", "Woensdag"],
  ["4", "Donderdag"],
  ["5", "Vrijdag"],
  ["6", "Zaterdag"],
  ["7", "Zondag"]
] as const;

export const dynamic = "force-dynamic";

export default async function AdminGroupsPage({ searchParams }: PageProps) {
  const data = await getGroupPlanningData();
  const [smartEvents, attendanceSignals, bottlenecks] = await Promise.all([
    getTenantSmartEvents(),
    detectAttendanceRisks(data.tenant.id),
    detectProgressBottlenecks({
      tenantId: data.tenant.id,
      period: {
        from: new Date(Date.now() - 84 * 86_400_000).toISOString(),
        to: new Date().toISOString()
      }
    })
  ]);
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const query = getParam(params, "q");
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const capacityByGroupId = new Map(data.groupCapacity.map((capacity) => [capacity.groupId, capacity]));

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <>
            <AdminActionDrawer description="Koppel programma, niveau, lesmoment, resource en capaciteit." title="Nieuwe lesgroep" triggerLabel="Nieuwe groep" width="wide">
              <GroupCreationWizard
                defaultCapacityBorrowing={data.planningPolicy.default_capacity_borrowing as "none" | "flex_from_regular" | "bidirectional"}
                instructors={data.instructors}
                programs={data.programs.filter((program) => program.status === "active")}
                resources={data.resources.filter((resource) => resource.status === "active")}
                stages={data.stages.filter((stage) => stage.status === "active")}
                templates={data.lessonTimeTemplates}
              />
            </AdminActionDrawer>
            <AdminActionDrawer description="Beheer lestijden, openingstijden, locaties, kwalificaties en handhavingsbeleid in dezelfde gestructureerde registers." title="Planningsmasterdata" triggerLabel="Masterdata" triggerVariant="outline" width="wide">
              <PlanningMasterdataForms data={data} />
            </AdminActionDrawer>
            <AdminActionDrawer description="Wijs een primaire instructeur, ondersteuner of vervanger aan een groep toe." title="Instructeur koppelen" triggerLabel="Instructeur koppelen" triggerVariant="outline">
              <InstructorForm data={data} />
            </AdminActionDrawer>
          </>
        }
        kicker="Planning"
        subtitle="Scan capaciteit, lesmomenten en bezetting; open een groepsdossier zonder het overzicht te verlaten."
        title="Lesgroepen"
      />
      <RouteFeedback success={successMessage(saved)} error={errorMessage(error)} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Users} label="Groepen" value={data.groups.length} />
        <AdminMetricCard icon={CalendarClock} label="Gepubliceerde regels" tone="success" value={data.scheduleRules.filter((rule) => rule.status === "published").length} />
        <AdminMetricCard icon={ShieldCheck} label="Veilige resources" tone="info" value={data.resources.filter((resource) => resource.status === "active" && resource.safety_capacity !== null).length} />
        <AdminMetricCard icon={AlertTriangle} label="Vol / overvol" tone="warning" value={data.groupCapacity.filter((capacity) => capacity.status !== "available").length} />
      </div>

      <AdminListSurface>
        <GroupsTable
          initialSearch={query}
          rows={data.groups.map((group) => {
            const capacity = capacityByGroupId.get(group.id);
            const instructorCount = data.groupInstructorAssignments.filter((assignment) => assignment.group_id === group.id && assignment.status === "active").length;
            return {
              capacityLabel: capacity ? `${capacity.used}/${capacity.capacity} · R ${group.regular_capacity} · F ${group.flex_capacity} · P ${group.trial_capacity}` : "Geen capaciteit",
              capacityStatus: capacity?.status ?? "unknown",
              code: group.code ?? "",
              id: group.id,
              instructors: `${instructorCount} instructeur${instructorCount === 1 ? "" : "s"}`,
              name: group.name,
              program: programById.get(group.program_id)?.name ?? "Programma onbekend",
              resource: group.default_resource_id ? resourceById.get(group.default_resource_id)?.name ?? "Resource onbekend" : "Geen vaste resource",
              stage: group.stage_id ? stageById.get(group.stage_id)?.name ?? "Niveau onbekend" : "Geen niveau",
              status: group.status,
              time: formatGroupTime(group.default_weekday, group.default_start_time, group.default_end_time),
              events: smartEvents
                .filter((event) => event.group_id === group.id || (event.entity_type === "group" && event.entity_id === group.id))
                .slice(0, 20)
                .map(toSmartActivityItem),
              healthSignals: [
                ...attendanceSignals
                  .filter((signal) => signal.group_id === group.id)
                  .slice(0, 2)
                  .map((signal) => ({
                    label: "Aanwezigheid volgen",
                    detail: signal.reason,
                    tone: "info" as const
                  })),
                ...bottlenecks
                  .filter((signal) => signal.group_id === group.id)
                  .slice(0, 3)
                  .map((signal) => ({
                    label: signal.skill_label,
                    detail: `${signal.affected_count} van ${signal.total_count} observaties · ${signal.suggested_lesson_focus}`,
                    tone: "warning" as const
                  }))
              ]
            };
          })}
        />
      </AdminListSurface>
    </div>
  );
}

function InstructorForm({ data }: { data: Awaited<ReturnType<typeof getGroupPlanningData>> }) {
  return (
    <DirtyForm action={createGroupInstructorAssignmentAction} className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Lesgroep" name="groupId" required>
        <option value="">Kies groep</option>
        {data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </SelectField>
      <SelectField label="Instructeur" name="instructorUserId" required>
        <option value="">Kies instructeur</option>
        {data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.label}</option>)}
      </SelectField>
      <SelectField label="Rol" name="role">
        <option value="primary">Primair</option>
        <option value="support">Ondersteuning</option>
        <option value="substitute">Vervanger</option>
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vanaf" name="startsOn" type="date" />
        <Field label="Tot" name="endsOn" type="date" />
      </div>
      <div className="sm:col-span-2"><SubmitButton>Instructeur koppelen</SubmitButton></div>
    </DirtyForm>
  );
}

function PlanningMasterdataForms({ data }: { data: Awaited<ReturnType<typeof getGroupPlanningData>> }) {
  const locations = data.resources.filter((resource) => resource.kind === "location" && resource.status === "active");
  return <div className="space-y-4" id="planning-masterdata">
    <MasterdataSection icon={<CalendarClock className="size-5" />} title="Lestijdtemplate">
      <DirtyForm action={saveLessonTimeTemplateAction} className="grid gap-3 sm:grid-cols-2">
        <Field label="Naam" name="name" placeholder="Maandag namiddag" required />
        <SelectField label="Weekdag" name="weekday" required>{weekdays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        <Field label="Starttijd" name="startTime" type="time" required />
        <Field label="Eindtijd" name="endTime" type="time" required />
        <Field defaultValue={1} label="Iedere x weken" min={1} name="recurrenceIntervalWeeks" type="number" />
        <div className="self-end"><SubmitButton>Template opslaan</SubmitButton></div>
      </DirtyForm>
    </MasterdataSection>
    <MasterdataSection icon={<Waves className="size-5" />} title="Openingstijden resource">
      <DirtyForm action={saveResourceOpeningHoursAction} className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Resource" name="resourceId" required><option value="">Kies resource</option>{data.resources.filter((resource) => resource.status === "active").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</SelectField>
        <SelectField label="Weekdag" name="weekday" required>{weekdays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        <Field label="Open" name="opensAt" type="time" required />
        <Field label="Dicht" name="closesAt" type="time" required />
        <Field label="Geldig vanaf" name="effectiveFrom" type="date" />
        <Field label="Geldig tot" name="effectiveUntil" type="date" />
        <div className="sm:col-span-2"><SubmitButton>Openingstijd opslaan</SubmitButton></div>
      </DirtyForm>
    </MasterdataSection>
    <MasterdataSection icon={<ShieldCheck className="size-5" />} title="Geverifieerde instructeurkwalificatie">
      <DirtyForm action={saveInstructorQualificationAction} className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Instructeur" name="instructorUserId" required><option value="">Kies instructeur</option>{data.instructors.map((instructor) => <option key={instructor.userId} value={instructor.userId}>{instructor.label}</option>)}</SelectField>
        <SelectField label="Programma" name="programId" required><option value="">Kies programma</option>{data.programs.filter((program) => program.status === "active").map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</SelectField>
        <SelectField label="Badje (optioneel)" name="stageId"><option value="">Alle badjes in scope</option>{data.stages.filter((stage) => stage.status === "active").map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</SelectField>
        <SelectField label="Resource (optioneel)" name="resourceId"><option value="">Alle resources in scope</option>{data.resources.filter((resource) => resource.status === "active").map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</SelectField>
        <Field label="Kwalificatiesleutel" name="qualificationKey" placeholder="zwemonderwijzer" required pattern="[a-z0-9]+(?:_[a-z0-9]+)*" />
        <Field label="Naam" name="name" placeholder="Zwemonderwijzer" required />
        <Field label="Geldig vanaf" name="validFrom" type="date" />
        <Field label="Geldig tot" name="validUntil" type="date" />
        <div className="sm:col-span-2"><TextAreaField label="Bewijsnotitie" name="evidenceNote" maxLength={1000} /></div>
        <div className="sm:col-span-2"><SubmitButton>Kwalificatie verifiëren</SubmitButton></div>
      </DirtyForm>
    </MasterdataSection>
    {locations.length ? <MasterdataSection icon={<Database className="size-5" />} title="Gestructureerd locatieprofiel">
      <DirtyForm action={saveResourceLocationProfileAction} className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Locatie" name="resourceId" required>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</SelectField>
        <Field defaultValue="Europe/Amsterdam" label="Tijdzone" name="timezone" required />
        <Field label="Adres" name="addressLine1" required />
        <Field label="Adresregel 2" name="addressLine2" />
        <Field label="Postcode" name="postalCode" required />
        <Field label="Plaats" name="city" required />
        <Field defaultValue="NL" label="Landcode" maxLength={2} name="countryCode" required />
        <div className="sm:col-span-2"><TextAreaField label="Publieke locatienotitie" name="publicNotes" maxLength={500} /></div>
        <div className="sm:col-span-2"><SubmitButton>Locatieprofiel opslaan</SubmitButton></div>
      </DirtyForm>
    </MasterdataSection> : null}
    <MasterdataSection icon={<ShieldCheck className="size-5" />} title="Planningsbeleid">
      <DirtyForm action={savePlanningPolicyAction} className="grid gap-3 sm:grid-cols-2">
        <SelectField defaultValue={data.planningPolicy.qualification_enforcement} label="Kwalificaties" name="qualificationEnforcement"><option value="blocking">Blokkerend</option><option value="advisory">Adviserend</option></SelectField>
        <SelectField defaultValue={data.planningPolicy.opening_hours_enforcement} label="Ontbrekende openingstijden" name="openingHoursEnforcement"><option value="advisory">Adviserend</option><option value="blocking">Blokkerend</option></SelectField>
        <SelectField defaultValue={data.planningPolicy.default_capacity_borrowing} label="Standaard lenen" name="defaultCapacityBorrowing"><option value="none">Niet lenen</option><option value="flex_from_regular">Flex van regulier</option><option value="bidirectional">Onderling</option></SelectField>
        <Field defaultValue={data.planningPolicy.maximum_schedule_horizon_days} label="Maximale horizon (dagen)" min={7} name="maximumScheduleHorizonDays" type="number" />
        <div className="sm:col-span-2"><SubmitButton>Beleid opslaan</SubmitButton></div>
      </DirtyForm>
    </MasterdataSection>
  </div>;
}

function MasterdataSection({ children, icon, title }: { children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return <details className="rounded-2xl border border-border bg-card p-4"><summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-foreground"><span className="text-primary">{icon}</span>{title}</summary><div className="mt-4 border-t border-border pt-4">{children}</div></details>;
}

function formatGroupTime(weekday: number | null, start: string | null, end: string | null) {
  const day = weekdays.find(([value]) => Number(value) === weekday)?.[1] ?? "Geen vaste dag";
  return start ? `${day} ${start.slice(0, 5)}${end ? `–${end.slice(0, 5)}` : ""}` : day;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(saved?: string) {
  return ({
    published: "De groep en alle occurrences zijn transactioneel gepubliceerd.",
    template: "Lestijdtemplate opgeslagen.",
    "opening-hours": "Openingstijden opgeslagen.",
    qualification: "Kwalificatie geverifieerd.",
    location: "Locatieprofiel opgeslagen.",
    policy: "Planningsbeleid opgeslagen.",
    "1": "Groepsgegevens zijn opgeslagen."
  } as Record<string, string>)[saved ?? ""] ?? null;
}

function errorMessage(error?: string) {
  return ({
    conflict: "De transactionele hercontrole vond een nieuw conflict; er is niets gedeeltelijk aangemaakt.",
    confirmation: "Bevestig de publicatie expliciet.",
    forbidden: "Je hebt geen beheerrecht voor planning.",
    "qualification-period": "De einddatum van de kwalificatie moet op of na de startdatum liggen.",
    "qualification-scope": "De kwalificatie past niet bij de gekozen instructeur-, programma-, badje- of resourcescope.",
    validation: "Controleer de planningsvelden.",
    time: "De eindtijd moet na de starttijd liggen."
  } as Record<string, string>)[error ?? ""] ?? (error ? "Opslaan is niet gelukt." : null);
}
