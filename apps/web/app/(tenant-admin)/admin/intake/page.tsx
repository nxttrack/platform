import { Bot, Inbox, SearchCheck } from "lucide-react";

import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { IntakeTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getTenantIntakeInbox, type IntakeAnswerRow } from "@/lib/domain/intake";
import type { IntakeOption } from "@/lib/domain/public-site";
import { swimmingExperienceOptions } from "@/lib/domain/intake-recommendation-contract";
import { toSmartActivityItem } from "@/lib/domain/smart-event-contract";
import { getTenantSmartEvents } from "@/lib/domain/smart-events";
import { attributionChannelLabel } from "@/lib/analytics/attribution";
import { compareIntakeOperationalOrder } from "@/lib/ui/status-meta";
import { calculateLeadScoresForIntakes } from "@/lib/domain/lead-scoring";

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
  const [inbox, smartEvents] = await Promise.all([getTenantIntakeInbox(), getTenantSmartEvents()]);
  const params = (await searchParams) ?? {};
  const leadScores = await calculateLeadScoresForIntakes({
    tenantId: inbox.tenant.id,
    intakeSubmissionIds: inbox.submissions.map((submission) => submission.id),
    persist: true
  });
  const testFilter = getParam(params, "testdata") ?? "all";
  const query = getParam(params, "q");
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const submissions = inbox.submissions
    .filter((submission) => testFilter === "only" ? submission.is_test : testFilter === "hide" ? !submission.is_test : true)
    .sort(compareIntakeOperationalOrder);
  const programById = new Map(inbox.programs.map((program) => [program.id, program]));
  const answersBySubmission = groupAnswers(inbox.answers);
  const eventBySubjectId = new Map(inbox.events.map((event) => [event.subject_id, event]));

  return (
    <div className="space-y-5">
      <PageHeader kicker="Leerlingen" title="Aanmeldingen" subtitle={`Beoordeel aanvragen voor ${inbox.tenant.name}, herken prioriteit en open het volledige intakedossier zonder contextverlies.`} />
      <RouteFeedback success={saved ? "Intake-aanmelding is bijgewerkt." : null} error={error ? `Intake-actie is niet gelukt: ${error}.` : null} />

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminMetricCard icon={Inbox} label="Aanvragen" value={submissions.length} />
        <AdminMetricCard icon={SearchCheck} label="Nieuw te beoordelen" tone="warning" value={submissions.filter((submission) => submission.status === "received").length} />
        <AdminMetricCard icon={Bot} label="Journey Bot" tone="info" value={inbox.submissions.filter((submission) => submission.is_test).length} />
      </div>

      <AdminFilterPills current={testFilter} href={(value) => `/admin/intake?testdata=${value}`} items={[{ label: "Alle", value: "all" }, { label: "Verberg testdata", value: "hide" }, { label: "Alleen testdata", value: "only" }]} />

      <AdminListSurface>
        <IntakeTable
          initialSearch={query}
          rows={submissions.map((submission) => {
            const selectedChoice = getSelectedChoice(submission.recommendation_snapshot, submission.selected_group_id);
            const answers = answersBySubmission.get(submission.id) ?? [];
            const event = eventBySubjectId.get(submission.id);
            const leadScore = leadScores.get(submission.id) ?? {
              score_band: "waiting_for_information" as const,
              score: 0,
              confidence: 0,
              reasons: [],
              blockers: [],
              suggested_next_action: "Controleer de ontbrekende brondata."
            };
            return {
              choice: selectedChoice ? formatChoice(selectedChoice) : "",
              birthDate: submission.participant_birth_date ?? "",
              duplicateState: submission.duplicate_state,
              email: submission.parent_email,
              experience: [submission.swimming_experience ? getExperienceLabel(submission.swimming_experience) : "", answers.length ? answers.map(formatAnswer).join(" · ") : ""].filter(Boolean).join(" · "),
              id: submission.id,
              isTest: submission.is_test,
              journeyRunId: submission.journey_run_id ?? "",
              leadScore: {
                band: leadScore.score_band,
                score: leadScore.score,
                confidence: leadScore.confidence,
                reasons: leadScore.reasons,
                blockers: leadScore.blockers,
                suggestedAction: leadScore.suggested_next_action
              },
              notes: [submission.preferred_notes, submission.message].filter(Boolean).join(" · "),
              option: optionLabels[submission.selected_option],
              parent: submission.parent_name,
              participant: submission.participant_name,
              phone: submission.parent_phone ?? "",
              preferredDays: submission.preferred_days.join(", "),
              program: submission.program_id ? programById.get(submission.program_id)?.name ?? "Programma onbekend" : "Geen programma",
              receivedAt: submission.received_at,
              source: `${attributionChannelLabel(submission.attribution_channel)} · ${submission.attribution_source}${submission.attribution_campaign ? ` · ${submission.attribution_campaign}` : ""}${event ? ` · event ${event.status}` : ""}`,
              secondaryParent: submission.secondary_parent_name ?? "",
              status: submission.status,
              waitBand: submission.selected_wait_band,
              events: smartEvents
                .filter((smartEvent) => smartEvent.entity_type === "intake_submission" && smartEvent.entity_id === submission.id)
                .slice(0, 20)
                .map(toSmartActivityItem)
            };
          })}
        />
      </AdminListSurface>
    </div>
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
