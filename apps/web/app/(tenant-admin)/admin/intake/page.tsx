import { AdminSection, DataList, DataListRow, EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
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
        <Metric label="Events pending" value={inbox.events.filter((event) => event.status === "pending").length} />
      </div>

      <AdminSection title="Intake inbox" description="Deze lijst is de eerste operationele ingang; intake/wachtlijst-workflow komt later.">
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
                      <StatusPill tone={event?.status === "pending" ? "warning" : "success"}>{event ? `event ${event.status}` : "geen event"}</StatusPill>
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
