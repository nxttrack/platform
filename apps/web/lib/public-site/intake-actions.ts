"use server";

import { redirect } from "next/navigation";

import { queueDirectEventMessage } from "@/lib/communication/event-hooks";
import { defaultLanguage, normalizeSupportedLanguage, publicHref } from "@/lib/i18n";
import type { IntakeQuestion } from "@/lib/public-site/tenant-site";
import { detectAndStoreIntakeDuplicates } from "@/lib/smart-flow/intake-duplicates";
import { createIntakeRecommendationDecision } from "@/lib/smart-flow/intake-recommendation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getPublicTenantSiteSnapshot } from "./tenant-site";

export async function submitIntakeAction(formData: FormData) {
  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  const programSlug = requiredString(formData, "program_slug");
  const publicLanguage = normalizeSupportedLanguage(optionalString(formData, "public_language"), defaultLanguage);
  const snapshot = await getPublicTenantSiteSnapshot(programSlug);

  const selectedProgram = snapshot.selectedProgram;

  if (snapshot.status !== "ready" || !snapshot.tenant || !selectedProgram?.intakeConfig) {
    throw new Error("Intake is niet beschikbaar voor dit programma.");
  }

  const program = selectedProgram;
  const config = selectedProgram.intakeConfig;
  const intakeType = enumValue(formData, "intake_type", config.allowedOptions, "registration");
  const answers = collectAnswers(formData);
  validateConfiguredAnswers(config.questions, answers);

  if (!config.allowedOptions.includes(intakeType)) {
    throw new Error("Deze intake-optie is niet beschikbaar voor dit programma.");
  }

  const submissionId = crypto.randomUUID();
  const supabase = await createClient();
  const submission = {
    id: submissionId,
    tenant_id: snapshot.tenant.id,
    program_id: program.id,
    intake_form_config_id: config.id,
    intake_type: intakeType,
    parent_name: requiredString(formData, "parent_name"),
    parent_email: requiredEmail(formData, "parent_email"),
    parent_phone: optionalString(formData, "parent_phone"),
    participant_name: requiredString(formData, "participant_name"),
    participant_birthdate: optionalDate(formData, "participant_birthdate"),
    preferred_days: stringArray(formData, "preferred_days"),
    preferred_time_windows: stringArray(formData, "preferred_time_windows"),
    notes: optionalString(formData, "notes"),
    answers,
    intake_config_version: config.configVersion,
    status: "new"
  };

  const submissionResult = await supabase.from("intake_submissions").insert(submission);

  if (submissionResult.error) {
    throw new Error(submissionResult.error.message);
  }

  const eventResult = await supabase.from("intake_submission_events").insert({
    tenant_id: snapshot.tenant.id,
    submission_id: submissionId,
    status: "new",
    note: `Public registration form submitted as ${intakeType}.`
  });

  if (eventResult.error) {
    throw new Error(eventResult.error.message);
  }

  const decisionClient = createAdminClient();
  const recommendation = await createIntakeRecommendationDecision(decisionClient, {
    id: submissionId,
    tenantId: snapshot.tenant.id,
    program,
    intakeType,
    participantBirthdate: submission.participant_birthdate,
    preferredDays: submission.preferred_days,
    preferredTimeWindows: submission.preferred_time_windows,
    answers: submission.answers,
    intakeFormConfigId: config.id,
    intakeConfigVersion: config.configVersion,
    questions: config.questions,
    stageRecommendationRules: config.stageRecommendationRules
  });
  const duplicateSummary = await detectAndStoreIntakeDuplicates(decisionClient, {
    tenantId: snapshot.tenant.id,
    intakeSubmissionId: submissionId,
    participantName: submission.participant_name,
    participantBirthdate: submission.participant_birthdate,
    parentEmail: submission.parent_email
  });
  await throwOnError(
    decisionClient
      .from("intake_submissions")
      .update({
        stage_recommendation_decision_id: recommendation.decisionId,
        recommendation_snapshot: recommendation.recommendationSnapshot,
        missing_information: recommendation.missingInformation,
        duplicate_snapshot: {
          total: duplicateSummary.total,
          blocking: duplicateSummary.blocking,
          warning: duplicateSummary.warning,
          checked_at: new Date().toISOString()
        }
      })
      .eq("id", submissionId)
      .eq("tenant_id", snapshot.tenant.id)
  );

  const confirmationSummary = buildConfirmationSummary({
    answers,
    language: publicLanguage,
    participantName: submission.participant_name,
    preferredDays: submission.preferred_days,
    preferredTimeWindows: submission.preferred_time_windows,
    programName: program.name,
    tenantName: snapshot.tenant.name
  });

  await queueDirectEventMessage(supabase, {
    tenantId: snapshot.tenant.id,
    recipientEmail: submission.parent_email,
    recipientName: submission.parent_name,
    eventKey: "intake_submitted",
    templateCode: "intake-submitted",
    context: {
      parent_name: submission.parent_name,
      participant_name: submission.participant_name,
      intake_type: intakeType,
      program_name: program.name,
      tenant_name: snapshot.tenant.name,
      preferred_days: confirmationSummary.preferredDays,
      preferred_time_windows: confirmationSummary.preferredTimeWindows,
      lesson_preferences: confirmationSummary.lessonPreferences,
      summary: confirmationSummary.text
    },
    sourceTable: "intake_submissions",
    sourceRecordId: submissionId,
    fallbackSubject: `Inschrijfformulier ontvangen voor ${submission.participant_name}`,
    fallbackBody: confirmationSummary.emailBody.replace("{{parent_name}}", submission.parent_name)
  });

  await throwOnError(
    supabase.from("intake_submission_events").insert({
      tenant_id: snapshot.tenant.id,
      submission_id: submissionId,
      status: "new",
      note: "Bevestiging van het inschrijfformulier is klaargezet voor verzending."
    })
  );

  redirect(publicHref(publicLanguage, "intake", { program: program.slug, submitted: true, submission: submissionId }));
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requiredEmail(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${key} is geen geldig e-mailadres.`);
  }

  return value;
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function stringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value.trim() ? [value.trim()] : []));
}

function collectAnswers(formData: FormData) {
  const grouped = new Map<string, string[]>();

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_") && typeof value === "string" && value.trim()) {
      const answerKey = key.slice("answer_".length);
      grouped.set(answerKey, [...(grouped.get(answerKey) ?? []), value.trim()]);
    }
  }

  const answers: Record<string, string | string[]> = {};

  for (const [key, values] of grouped.entries()) {
    answers[key] = values.length === 1 ? values[0] ?? "" : values;
  }

  return answers;
}

function enumValue(formData: FormData, key: string, allowed: string[], fallback: string) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value) ? value : fallback;
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function buildConfirmationSummary(input: {
  answers: Record<string, string | string[]>;
  language: string;
  participantName: string;
  preferredDays: string[];
  preferredTimeWindows: string[];
  programName: string;
  tenantName: string;
}) {
  const preferredDays = input.preferredDays.map((day) => dayLabel(day, input.language)).join(", ") || "-";
  const preferredTimeWindows = input.preferredTimeWindows.map((time) => timeLabel(time, input.language)).join(", ") || "-";
  const lessonPreferences = lessonPreferencesFromAnswers(input.answers)
    .map((preference, index) => `${index + 1}. ${preference.groupName} - ${dayLabel(preference.weekday, input.language)} ${preference.startsAt}-${preference.endsAt} (${preference.stageName})`)
    .join("\n");
  const text = [
    `Programma: ${input.programName}`,
    `Kind: ${input.participantName}`,
    `Voorkeursdagen: ${preferredDays}`,
    `Voorkeurstijden: ${preferredTimeWindows}`,
    lessonPreferences ? `Gekozen voorkeursmomenten:\n${lessonPreferences}` : null
  ]
    .filter(Boolean)
    .join("\n");
  const emailBody =
    input.language === "en"
      ? `Hi {{parent_name}},\n\nGreat news: your registration for ${input.tenantName} has been received.\n\nBelow is a summary of the submitted form:\n\n${text}\n\n${input.tenantName} will contact you by e-mail about the next step.\n\nNXTTRACK`
      : `Hallo {{parent_name}},\n\nGelukt! Jouw inschrijving voor ${input.tenantName} is ontvangen.\n\nOnderstaand vind je een samenvatting van het ingevulde formulier:\n\n${text}\n\n${input.tenantName} neemt per e-mail contact met je op over de vervolgstap.\n\nNXTTRACK`;

  return {
    emailBody,
    lessonPreferences: lessonPreferences || "-",
    preferredDays,
    preferredTimeWindows,
    text
  };
}

function lessonPreferencesFromAnswers(answers: Record<string, string | string[]>) {
  return answerValues(answers.lesson_time_preferences).flatMap((value) => {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;

      return [
        {
          endsAt: stringFromUnknown(parsed.ends_at),
          groupName: stringFromUnknown(parsed.group_name),
          stageName: stringFromUnknown(parsed.stage_name),
          startsAt: stringFromUnknown(parsed.starts_at),
          weekday: stringFromUnknown(parsed.weekday)
        }
      ];
    } catch {
      return [];
    }
  });
}

function stringFromUnknown(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "-";
}

function dayLabel(value: string, language: string) {
  const labels: Record<string, { nl: string; en: string }> = {
    monday: { nl: "Maandag", en: "Monday" },
    tuesday: { nl: "Dinsdag", en: "Tuesday" },
    wednesday: { nl: "Woensdag", en: "Wednesday" },
    thursday: { nl: "Donderdag", en: "Thursday" },
    friday: { nl: "Vrijdag", en: "Friday" },
    saturday: { nl: "Zaterdag", en: "Saturday" },
    sunday: { nl: "Zondag", en: "Sunday" }
  };

  return labels[value]?.[language === "en" ? "en" : "nl"] ?? value;
}

function timeLabel(value: string, language: string) {
  const labels: Record<string, { nl: string; en: string }> = {
    morning: { nl: "Ochtend", en: "Morning" },
    afternoon: { nl: "Middag", en: "Afternoon" },
    evening: { nl: "Avond", en: "Evening" }
  };

  return labels[value]?.[language === "en" ? "en" : "nl"] ?? value;
}

function validateConfiguredAnswers(questions: IntakeQuestion[], answers: Record<string, string | string[]>) {
  for (const question of questions) {
    if (!question.required || !isQuestionActive(question, answers)) {
      continue;
    }

    const values = answerValues(answers[question.name]);

    if (values.length === 0) {
      throw new Error(`${question.label} is verplicht.`);
    }

    if (question.type === "consent" && !values.includes("accepted")) {
      throw new Error(`${question.label} moet worden bevestigd.`);
    }
  }
}

function isQuestionActive(question: IntakeQuestion, answers: Record<string, string | string[]>) {
  if (!question.condition) {
    return true;
  }

  const values = answerValues(answers[question.condition.question]);
  const expected = Array.isArray(question.condition.value) ? question.condition.value : question.condition.value ? [question.condition.value] : [];

  if (question.condition.operator === "exists") {
    return values.length > 0;
  }

  if (question.condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (question.condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (question.condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  return true;
}

function answerValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}
