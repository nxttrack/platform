import { AdminSection, DataList, DataListRow, EmptyState } from "@/components/admin/domain-ui";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { updateIntakeDuplicateStateAction } from "@/lib/domain/intake-actions";
import { getTenantIntakeInbox, type IntakeAnswerRow } from "@/lib/domain/intake";
import type { IntakeOption } from "@/lib/domain/public-site";

const optionLabels: Record<IntakeOption, string> = {
  enrollment: "Inschrijving",
  trial: "Proefles",
  waitlist: "Wachtlijst",
  information_request: "Informatie"
};

export const dynamic = "force-dynamic";

export default async function AdminIntakePage() {
  const inbox = await getTenantIntakeInbox();
  const programById = new Map(inbox.programs.map((program) => [program.id, program]));
  const answersBySubmission = groupAnswers(inbox.answers);
  const eventBySubjectId = new Map(inbox.events.map((event) => [event.subject_id, event]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Intake" title="Aanmeldingen" subtitle={`Nieuwe oudervragen voor ${inbox.tenant.name}.`} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Ontvangen" value={inbox.submissions.length} />
        <Metric label="Nieuwe status" value={inbox.submissions.filter((submission) => submission.status === "received").length} />
        <Metric label="Mogelijk dubbel" value={inbox.submissions.filter((submission) => submission.duplicate_state === "possible_duplicate").length} />
      </div>

      <AdminSection title="Intake inbox" description="Beoordeel nieuwe aanvragen en zet geschikte inschrijvingen door naar de wachtlijst of plaatsing.">
        {inbox.submissions.length === 0 ? (
          <EmptyState>Nog geen intake-aanmeldingen.</EmptyState>
        ) : (
          <DataList>
            {inbox.submissions.map((submission) => {
              const program = submission.program_id ? programById.get(submission.program_id) : null;
              const event = eventBySubjectId.get(submission.id);
              const answers = answersBySubmission.get(submission.id) ?? [];

              return (
                <DataListRow
                  key={submission.id}
                  title={`${submission.participant_name} · ${optionLabels[submission.selected_option]}`}
                  meta={
                    <div className="space-y-1">
                      <p>
                        {submission.parent_name} · {submission.parent_email}
                        {submission.parent_phone ? ` · ${submission.parent_phone}` : ""}
                      </p>
                      <p>
                        {program?.name ?? "Geen programma"} · {formatDate(submission.received_at)}
                      </p>
                      {submission.preferred_days.length > 0 ? <p>Voorkeur: {submission.preferred_days.join(", ")}</p> : null}
                      {answers.length > 0 ? <p>Antwoorden: {answers.map(formatAnswer).join(" · ")}</p> : null}
                    </div>
                  }
                  aside={
                    <div className="space-y-1">
                      <StatusPill tone={submission.status === "received" ? "info" : "neutral"}>{submission.status}</StatusPill>
                      {submission.duplicate_state === "possible_duplicate" ? <StatusPill tone="warning">controleer dubbel</StatusPill> : null}
                      <StatusPill tone={event?.status === "pending" ? "warning" : "success"}>{event ? `event ${event.status}` : "geen event"}</StatusPill>
                      {submission.duplicate_state === "possible_duplicate" ? (
                        <div className="flex gap-1">
                          <DuplicateAction id={submission.id} label="Dubbel" state="confirmed_duplicate" />
                          <DuplicateAction id={submission.id} label="Uniek" state="dismissed" />
                        </div>
                      ) : null}
                    </div>
                  }
                />
              );
            })}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function DuplicateAction({ id, label, state }: { id: string; label: string; state: "confirmed_duplicate" | "dismissed" }) {
  return (
    <form action={updateIntakeDuplicateStateAction}>
      <input name="submissionId" type="hidden" value={id} />
      <input name="duplicateState" type="hidden" value={state} />
      <Button size="sm" type="submit" variant="outline">{label}</Button>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function groupAnswers(answers: IntakeAnswerRow[]) {
  const bySubmission = new Map<string, IntakeAnswerRow[]>();

  for (const answer of answers) {
    bySubmission.set(answer.submission_id, [...(bySubmission.get(answer.submission_id) ?? []), answer]);
  }

  return bySubmission;
}

function formatAnswer(answer: IntakeAnswerRow) {
  if (Array.isArray(answer.answer_json)) {
    return `${answer.field_key}: ${answer.answer_json.join(", ")}`;
  }

  return `${answer.field_key}: ${answer.answer_text ?? ""}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
