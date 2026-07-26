import { AlertTriangle, CalendarClock, Users, Waves } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { GroupsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createGroupAction, createGroupInstructorAssignmentAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";

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
  const data = await getTenantCoreData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
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
              <GroupForm data={data} />
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
      <RouteFeedback success={saved ? "Groepsgegevens zijn opgeslagen." : null} error={error ? "Opslaan is niet gelukt." : null} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Users} label="Groepen" value={data.groups.length} />
        <AdminMetricCard icon={Waves} label="Actief" tone="success" value={data.groups.filter((group) => group.status === "active").length} />
        <AdminMetricCard icon={CalendarClock} label="Zonder lesmoment" tone="warning" value={data.groups.filter((group) => !group.default_weekday || !group.default_start_time).length} />
        <AdminMetricCard icon={AlertTriangle} label="Vol / overvol" tone="warning" value={data.groupCapacity.filter((capacity) => capacity.status !== "available").length} />
      </div>

      <AdminListSurface>
        <GroupsTable
          initialSearch={query}
          rows={data.groups.map((group) => {
            const capacity = capacityByGroupId.get(group.id);
            const instructorCount = data.groupInstructorAssignments.filter((assignment) => assignment.group_id === group.id && assignment.status === "active").length;
            return {
              capacityLabel: capacity ? `${capacity.used}/${capacity.capacity}` : "Geen capaciteit",
              capacityStatus: capacity?.status ?? "unknown",
              code: group.code ?? "",
              id: group.id,
              instructors: `${instructorCount} instructeur${instructorCount === 1 ? "" : "s"}`,
              name: group.name,
              program: programById.get(group.program_id)?.name ?? "Programma onbekend",
              resource: group.default_resource_id ? resourceById.get(group.default_resource_id)?.name ?? "Resource onbekend" : "Geen vaste resource",
              stage: group.stage_id ? stageById.get(group.stage_id)?.name ?? "Niveau onbekend" : "Geen niveau",
              status: group.status,
              time: formatGroupTime(group.default_weekday, group.default_start_time, group.default_end_time)
            };
          })}
        />
      </AdminListSurface>
    </div>
  );
}

function GroupForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
  return (
    <DirtyForm action={createGroupAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Naam" name="name" required placeholder="Maandag 16:00 Badje 1" />
      <Field label="Code" name="code" placeholder="ma-1600-b1" />
      <SelectField label="Programma" name="programId" required>
        <option value="">Kies programma</option>
        {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
      </SelectField>
      <SelectField label="Niveau" name="stageId">
        <option value="">Nog niet gekoppeld</option>
        {data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </SelectField>
      <SelectField label="Resource" name="resourceId">
        <option value="">Geen vaste resource</option>
        {data.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
      </SelectField>
      <Field label="Capaciteit" name="capacity" type="number" defaultValue={8} />
      <SelectField label="Vaste dag" name="weekday">
        <option value="">Geen vaste dag</option>
        {weekdays.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </SelectField>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starttijd" name="startTime" type="time" />
        <Field label="Eindtijd" name="endTime" type="time" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <Field label="Startdatum" name="startsOn" type="date" />
        <Field label="Einddatum" name="endsOn" type="date" />
      </div>
      <div className="sm:col-span-2"><SubmitButton>Lesgroep opslaan</SubmitButton></div>
    </DirtyForm>
  );
}

function InstructorForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
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

function formatGroupTime(weekday: number | null, start: string | null, end: string | null) {
  const day = weekdays.find(([value]) => Number(value) === weekday)?.[1] ?? "Geen vaste dag";
  return start ? `${day} ${start.slice(0, 5)}${end ? `–${end.slice(0, 5)}` : ""}` : day;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
