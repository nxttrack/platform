import { CheckCircle2, Circle, Clock3, ListChecks, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { updateInstructorTaskStatusAction } from "@/lib/domain/communication-actions";
import { formatCommunicationDate, getInstructorTasks, taskPriorityLabel, taskStatusLabel } from "@/lib/domain/communications";
import { getInstructorData } from "@/lib/domain/instructor";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function InstructorTasksPage({ searchParams }: PageProps) {
  const [data, tasks, params] = await Promise.all([getInstructorData(), getInstructorTasks(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const openTasks = tasks.filter((task) => task.status === "open" || task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const urgentTasks = openTasks.filter((task) => task.priority === "urgent" || isOverdue(task.due_on));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Taken" title="Mijn instructeurstaken" subtitle="Dagelijkse follow-ups, leerlingacties en teamtaken zonder backoffice-detour." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<ListChecks className="h-5 w-5" />} label="Open" value={openTasks.length} />
        <Metric icon={<Clock3 className="h-5 w-5" />} label="Urgent/over tijd" value={urgentTasks.length} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Afgerond" value={doneTasks.length} />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Actieve taken</h2>
            <p className="mt-1 text-sm text-muted-foreground">Taken die aan jou of aan jouw leerlingen zijn gekoppeld.</p>
          </div>
          <StatusPill tone={urgentTasks.length > 0 ? "warning" : "success"}>{urgentTasks.length} urgent</StatusPill>
        </div>
        {openTasks.length === 0 ? (
          <EmptyState>Geen open instructeurstaken.</EmptyState>
        ) : (
          <div className="space-y-3">
            {openTasks.map((task) => {
              const participant = task.related_participant_id ? participantById.get(task.related_participant_id) : null;

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={task.id}>
                  <TaskHeader task={task} />
                  {task.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{task.description}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {participant ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <UserRound className="h-4 w-4 text-primary" />
                        {participant.display_name}
                      </span>
                    ) : null}
                    <span>Deadline: {task.due_on ? formatDate(task.due_on) : "geen deadline"}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {task.status !== "in_progress" ? <TaskButton taskId={task.id} status="in_progress" label="Starten" /> : null}
                    {task.status !== "open" ? <TaskButton taskId={task.id} status="open" label="Terug open" /> : null}
                    <TaskButton taskId={task.id} status="done" label="Klaar" primary />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Recent afgerond</h2>
            <p className="mt-1 text-sm text-muted-foreground">Laatste afgeronde taken blijven zichtbaar voor context.</p>
          </div>
          <StatusPill>{doneTasks.length} klaar</StatusPill>
        </div>
        {doneTasks.length === 0 ? (
          <EmptyState>Nog geen afgeronde taken.</EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {doneTasks.slice(0, 8).map((task) => (
              <article className="rounded-lg border border-border bg-white p-4" key={task.id}>
                <TaskHeader task={task} compact />
                {task.completed_at ? <p className="mt-2 text-xs text-muted-foreground">Afgerond op {formatCommunicationDate(task.completed_at)}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TaskHeader({ compact = false, task }: { compact?: boolean; task: { due_on: string | null; priority: string; status: string; title: string } }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={priorityTone(task.priority, task.due_on)}>{taskPriorityLabel(task.priority)}</StatusPill>
          <StatusPill tone={taskStatusTone(task.status)}>{taskStatusLabel(task.status)}</StatusPill>
          {isOverdue(task.due_on) && task.status !== "done" ? <StatusPill tone="danger">over tijd</StatusPill> : null}
        </div>
        <h3 className={`${compact ? "mt-2 text-base" : "mt-2 text-lg"} font-bold text-foreground`}>{task.title}</h3>
      </div>
      {task.status === "done" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
    </div>
  );
}

function TaskButton({ label, primary = false, status, taskId }: { label: string; primary?: boolean; status: string; taskId: string }) {
  return (
    <form action={updateInstructorTaskStatusAction}>
      <input name="taskId" type="hidden" value={taskId} />
      <input name="status" type="hidden" value={status} />
      <input name="next" type="hidden" value="/instructor/taken" />
      <button className={`${primary ? "bg-primary text-primary-foreground" : "border border-border bg-white hover:bg-muted"} inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold`} type="submit">
        {label}
      </button>
    </form>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "task") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Taak bijgewerkt.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function isOverdue(value: string | null) {
  if (!value) {
    return false;
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return new Date(`${value}T23:59:59`).getTime() < today.getTime();
}

function priorityTone(priority: string, dueOn: string | null): "danger" | "warning" | "info" | "neutral" {
  if (priority === "urgent" || isOverdue(dueOn)) {
    return "danger";
  }

  if (priority === "high") {
    return "warning";
  }

  if (priority === "low") {
    return "neutral";
  }

  return "info";
}

function taskStatusTone(status: string): "success" | "warning" | "info" | "neutral" {
  if (status === "done") {
    return "success";
  }

  if (status === "in_progress") {
    return "warning";
  }

  if (status === "open") {
    return "info";
  }

  return "neutral";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
