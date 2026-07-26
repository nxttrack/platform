import { ListChecks } from "lucide-react";
import { AdminSection, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { TasksTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createAdminTaskAction } from "@/lib/domain/admin-operations-actions";
import { getAdminOperationsData } from "@/lib/domain/admin-operations";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminTasksPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getAdminOperationsData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const query = getParam(params, "q");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const staffById = new Map(data.staffUsers.map((staff) => [staff.userId, staff]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Taken" subtitle="Dagelijkse backoffice taken met assignee, prioriteit, deadline en notificatie bij toewijzing." />
      <RouteFeedback success={saved ? `Taakactie opgeslagen: ${saved}.` : null} error={error ? `Taakactie is niet gelukt: ${error}.` : null} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.65fr)_minmax(0,1.85fr)]">
        <AdminSection title="Taak aanmaken">
          <DirtyForm action={createAdminTaskAction} className="grid gap-4">
            <Field label="Titel" name="title" required placeholder="Bel ouder over proefles" />
            <TextAreaField label="Omschrijving" name="description" />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Toewijzen aan" name="assignedToUserId">
                <option value="">Nog niet toegewezen</option>
                {data.staffUsers.map((staff) => (
                  <option key={staff.userId} value={staff.userId}>
                    {staff.label}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Leerling" name="relatedParticipantId">
                <option value="">Geen leerling gekoppeld</option>
                {data.participants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.display_name}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectField label="Prioriteit" name="priority">
                <option value="normal">Normaal</option>
                <option value="low">Laag</option>
                <option value="high">Hoog</option>
                <option value="urgent">Urgent</option>
              </SelectField>
              <SelectField label="Status" name="status">
                <option value="open">Open</option>
                <option value="in_progress">Bezig</option>
                <option value="done">Klaar</option>
                <option value="cancelled">Geannuleerd</option>
              </SelectField>
              <Field label="Deadline" name="dueOn" type="date" />
            </div>
            <SubmitButton>
              <span className="inline-flex items-center gap-2">
                <ListChecks className="h-4 w-4" />
                Taak opslaan
              </span>
            </SubmitButton>
          </DirtyForm>
        </AdminSection>

        <AdminSection title="Takenoverzicht" description="Gebruik filters en opgeslagen weergaven; open een taak voor snelle statusmutaties.">
          <TasksTable initialSearch={query} rows={data.tasks.map((task) => ({
            assignee: task.assigned_to_user_id ? staffById.get(task.assigned_to_user_id)?.label ?? "Onbekende gebruiker" : "Niet toegewezen",
            description: task.description ?? "",
            dueOn: task.due_on ?? "",
            id: task.id,
            participant: task.related_participant_id ? participantById.get(task.related_participant_id)?.display_name ?? "Onbekende leerling" : "Geen leerling",
            priority: task.priority,
            status: task.status,
            title: task.title,
            updatedAt: task.updated_at
          }))} />
        </AdminSection>
      </div>
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
