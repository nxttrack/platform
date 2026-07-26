import { AdminSection } from "@/components/admin/domain-ui";
import { IntakeTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getTenantIntakeInbox, type IntakeAnswerRow } from "@/lib/domain/intake";
import type { IntakeOption } from "@/lib/domain/public-site";
import { swimmingExperienceOptions } from "@/lib/domain/intake-recommendation-contract";
import { attributionChannelLabel } from "@/lib/analytics/attribution";
import Link from "next/link";

const optionLabels: Record<IntakeOption, string> = {
  enrollment: "Inschrijving",
  trial: "Proefles",
  waitlist: "Wachtlijst",
  information_request: "Informatie"
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminIntakePage({ searchParams }: PageProps) {
  const inbox = await getTenantIntakeInbox();
  const params = (await searchParams) ?? {};
  const testFilter = getParam(params, "testdata") ?? "all";
  const query = getParam(params, "q");
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const submissions = inbox.submissions.filter((submission) => testFilter === "only" ? submission.is_test : testFilter === "hide" ? !submission.is_test : true);
  const programById = new Map(inbox.programs.map((program) => [program.id, program]));
  const answersBySubmission = groupAnswers(inbox.answers);
  const eventBySubjectId = new Map(inbox.events.map((event) => [event.subject_id, event]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Intake" title="Aanmeldingen" subtitle={`Nieuwe oudervragen voor ${inbox.tenant.name}.`} />
      <RouteFeedback success={saved ? "Intake-aanmelding is bijgewerkt." : null} error={error ? `Intake-actie is niet gelukt: ${error}.` : null} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Ontvangen" value={submissions.length} />
        <Metric label="Nieuwe status" value={submissions.filter((submission) => submission.status === "received").length} />
        <Metric label="Journey Bot" value={inbox.submissions.filter((submission) => submission.is_test).length} />
      </div>

      <AdminSection title="Intake inbox" description="Beoordeel nieuwe aanvragen en zet geschikte inschrijvingen door naar de wachtlijst of plaatsing.">
        <TestDataFilter current={testFilter} />
        <IntakeTable
          initialSearch={query}
          rows={submissions.map((submission) => {
            const selectedChoice = getSelectedChoice(submission.recommendation_snapshot, submission.selected_group_id);
            const answers = answersBySubmission.get(submission.id) ?? [];
            const event = eventBySubjectId.get(submission.id);
            return {
              choice: selectedChoice ? formatChoice(selectedChoice) : "",
              duplicateState: submission.duplicate_state,
              email: submission.parent_email,
              experience: [submission.swimming_experience ? getExperienceLabel(submission.swimming_experience) : "", answers.length ? answers.map(formatAnswer).join(" · ") : ""].filter(Boolean).join(" · "),
              id: submission.id,
              isTest: submission.is_test,
              option: optionLabels[submission.selected_option],
              parent: submission.parent_name,
              participant: submission.participant_name,
              phone: submission.parent_phone ?? "",
              preferredDays: submission.preferred_days.join(", "),
              program: submission.program_id ? programById.get(submission.program_id)?.name ?? "Programma onbekend" : "Geen programma",
              receivedAt: submission.received_at,
              source: `${attributionChannelLabel(submission.attribution_channel)} · ${submission.attribution_source}${submission.attribution_campaign ? ` · ${submission.attribution_campaign}` : ""}${event ? ` · event ${event.status}` : ""}`,
              status: submission.status,
              waitBand: submission.selected_wait_band
            };
          })}
        />
      </AdminSection>
    </div>
  );
}

function TestDataFilter({ current }: { current: string }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {[["all", "Alle"], ["hide", "Verberg testdata"], ["only", "Alleen testdata"]].map(([value, label]) => (
        <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${current === value ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-muted-foreground ring-border"}`} href={`/admin/intake?testdata=${value}`} key={value}>{label}</Link>
      ))}
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

type RecommendationSnapshot = {
  groupId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  stageId: string | null;
};

function getSelectedChoice(value: unknown, selectedGroupId: string | null): RecommendationSnapshot | null {
  if (!selectedGroupId || !Array.isArray(value)) {
    return null;
  }

  const selected = value.find(
    (candidate): candidate is RecommendationSnapshot =>
      !!candidate &&
      typeof candidate === "object" &&
      "groupId" in candidate &&
      candidate.groupId === selectedGroupId &&
      "weekday" in candidate &&
      typeof candidate.weekday === "number" &&
      "startsAt" in candidate &&
      typeof candidate.startsAt === "string" &&
      "endsAt" in candidate &&
      typeof candidate.endsAt === "string"
  );

  return selected ?? null;
}

function getExperienceLabel(value: string) {
  return swimmingExperienceOptions.find((option) => option.value === value)?.label ?? value;
}

function formatChoice(choice: RecommendationSnapshot) {
  const weekdays = ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
  return `${weekdays[choice.weekday] ?? "dag"} ${choice.startsAt}–${choice.endsAt}`;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
