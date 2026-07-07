import { CheckCircle2, ListChecks } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createAdminTaskAction, updateAdminTaskStatusAction } from "@/lib/domain/admin-operations-actions";
import { formatDate, formatDateTime, getAdminOperationsData, isTaskOverdue } from "@/lib/domain/admin-operations";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminTasksPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getAdminOperationsData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const staffById = new Map(data.staffUsers.map((staff) => [staff.userId, staff]));
  const openTasks = data.tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const completedTasks = data.tasks.filter((task) => task.status === "done" || task.status === "cancelled");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Taken" subtitle="Dagelijkse backoffice taken met assignee, prioriteit, deadline en notificatie bij toewijzing." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <AdminSection title="Taak aanmaken">
          <form action={createAdminTaskAction} className="grid gap-4">
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
          </form>
        </AdminSection>

        <AdminSection title="Open taken">
          {openTasks.length === 0 ? (
            <EmptyState>Geen open taken.</EmptyState>
          ) : (
            <div className="space-y-3">
              {openTasks.map((task) => {
                const participant = task.related_participant_id ? participantById.get(task.related_participant_id) : null;
                const assignee = task.assigned_to_user_id ? staffById.get(task.assigned_to_user_id) : null;
                const overdue = isTaskOverdue(task);

                return (
                  <article className="rounded-lg border border-border bg-white p-4" key={task.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <ListChecks className="h-5 w-5 text-primary" />
                          <h2 className="font-bold text-foreground">{task.title}</h2>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {assignee?.label ?? "Niet toegewezen"} {participant ? `- ${participant.display_name}` : ""} {task.due_on ? `- deadline ${formatDate(task.due_on)}` : ""}
                        </p>
                        {task.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{task.description}</p> : null}
                      </div>
                      <StatusPill tone={overdue ? "danger" : task.priority === "urgent" || task.priority === "high" ? "warning" : "neutral"}>{overdue ? "overdue" : task.priority}</StatusPill>
                    </div>
                    <form action={updateAdminTaskStatusAction} className="mt-3 flex flex-wrap items-end gap-3">
                      <input name="taskId" type="hidden" value={task.id} />
                      <label className="space-y-2 text-sm font-semibold text-foreground">
                        <span>Status</span>
                        <select className="h-10 min-w-40 rounded-lg border border-border bg-white px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" defaultValue={task.status} name="status">
                          <option value="open">Open</option>
                          <option value="in_progress">Bezig</option>
                          <option value="done">Klaar</option>
                          <option value="cancelled">Geannuleerd</option>
                        </select>
                      </label>
                      <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
                        <CheckCircle2 className="h-4 w-4" />
                        Bijwerken
                      </button>
                    </form>
                  </article>
                );
              })}
            </div>
          )}
        </AdminSection>
      </div>

      <AdminSection title="Afgerond en geannuleerd">
        {completedTasks.length === 0 ? (
          <EmptyState>Nog geen afgeronde taken.</EmptyState>
        ) : (
          <DataList>
            {completedTasks.slice(0, 20).map((task) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={task.id}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{task.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{task.completed_at ? formatDateTime(task.completed_at) : formatDateTime(task.updated_at)}</p>
                </div>
                <StatusPill tone={task.status === "done" ? "success" : "neutral"}>{task.status}</StatusPill>
              </div>
            ))}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
