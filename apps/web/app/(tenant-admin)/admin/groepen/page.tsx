import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createGroupAction, createGroupInstructorAssignmentAction } from "@/lib/domain/actions";
import { getTenantCoreData, type GroupCapacity } from "@/lib/domain/core";

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
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const capacityByGroupId = new Map(data.groupCapacity.map((capacity) => [capacity.groupId, capacity]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Core domeinmodel" title="Lesgroepen" subtitle="Maak groepen aan, koppel ze aan programma/stage/resource en wijs instructeurs toe." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Lesgroep aanmaken">
          <form action={createGroupAction} className="grid gap-4 md:grid-cols-2">
            <Field label="Naam" name="name" required placeholder="Maandag 16:00 Badje 1" />
            <Field label="Code" name="code" placeholder="ma-1600-b1" />
            <SelectField label="Programma" name="programId" required>
              <option value="">Kies programma</option>
              {data.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Badje/stage" name="stageId">
              <option value="">Nog niet gekoppeld</option>
              {data.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Resource" name="resourceId">
              <option value="">Geen vaste resource</option>
              {data.resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </SelectField>
            <Field label="Capaciteit" name="capacity" type="number" defaultValue={8} />
            <SelectField label="Vaste dag" name="weekday">
              <option value="">Geen vaste dag</option>
              {weekdays.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starttijd" name="startTime" type="time" />
              <Field label="Eindtijd" name="endTime" type="time" />
            </div>
            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <Field label="Startdatum" name="startsOn" type="date" />
              <Field label="Einddatum" name="endsOn" type="date" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>Lesgroep opslaan</SubmitButton>
            </div>
          </form>
        </AdminSection>

        <AdminSection title="Instructeur koppelen">
          <form action={createGroupInstructorAssignmentAction} className="grid gap-4 md:grid-cols-2">
            <SelectField label="Lesgroep" name="groupId" required>
              <option value="">Kies groep</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Instructeur" name="instructorUserId" required>
              <option value="">Kies instructeur</option>
              {data.instructors.map((instructor) => (
                <option key={instructor.userId} value={instructor.userId}>
                  {instructor.label}
                </option>
              ))}
            </SelectField>
            <SelectField label="Rol" name="role">
              <option value="primary">Primair</option>
              <option value="support">Support</option>
              <option value="substitute">Vervanger</option>
            </SelectField>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vanaf" name="startsOn" type="date" />
              <Field label="Tot" name="endsOn" type="date" />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>Instructeur koppelen</SubmitButton>
            </div>
          </form>
        </AdminSection>
      </div>

      <AdminSection title="Groepen en capaciteit">
        {data.groups.length === 0 ? (
          <EmptyState>Nog geen lesgroepen.</EmptyState>
        ) : (
          <DataList>
            {data.groups.map((group) => {
              const capacity = capacityByGroupId.get(group.id);
              const instructors = data.groupInstructorAssignments.filter((assignment) => assignment.group_id === group.id && assignment.status === "active");

              return (
                <DataListRow
                  key={group.id}
                  title={group.name}
                  meta={
                    <span>
                      {programById.get(group.program_id)?.name ?? "programma onbekend"} · {group.stage_id ? stageById.get(group.stage_id)?.name ?? "stage onbekend" : "geen stage"} ·{" "}
                      {group.default_resource_id ? resourceById.get(group.default_resource_id)?.name ?? "resource onbekend" : "geen resource"} · {instructors.length} instructeur(s)
                    </span>
                  }
                  aside={<CapacityPill capacity={capacity} />}
                />
              );
            })}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function CapacityPill({ capacity }: { capacity?: GroupCapacity }) {
  if (!capacity) {
    return <StatusPill>Geen capaciteit</StatusPill>;
  }

  const tone = capacity.status === "available" ? "success" : capacity.status === "full" ? "warning" : "danger";

  return (
    <StatusPill tone={tone}>
      {capacity.used}/{capacity.capacity}
    </StatusPill>
  );
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Opslaan is niet gelukt.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
