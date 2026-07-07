"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDefaultIntakeForm, getRequestHostname, getTenantSlugFromRequest, type IntakeOption, type PublicIntakeQuestion } from "./public-site";

const intakeOptions = ["enrollment", "trial", "waitlist", "information_request"] as const satisfies readonly IntakeOption[];

export async function submitIntakeAction(formData: FormData) {
  const result = await submitIntake(formData);

  if (!result.ok) {
    redirect(`/intake?error=${result.error}`);
  }

  revalidatePath("/admin/intake");
  redirect(`/intake?ontvangen=1&referentie=${encodeURIComponent(result.reference)}`);
}

async function submitIntake(formData: FormData): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  const slug = await getTenantSlugFromRequest();

  if (!slug) {
    return { ok: false, error: "tenant" };
  }

  const selectedOption = readRequired(formData, "selectedOption") as IntakeOption;

  if (!intakeOptions.includes(selectedOption)) {
    return { ok: false, error: "option" };
  }

  const parentName = readRequired(formData, "parentName");
  const parentEmail = normalizeEmail(readRequired(formData, "parentEmail"));
  const participantName = readRequired(formData, "participantName");
  const consentGiven = formData.get("consentGiven") === "on";

  if (!isEmail(parentEmail) || !consentGiven || !parentName || !participantName) {
    return { ok: false, error: "required" };
  }

  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("id, slug, name").eq("slug", slug).eq("status", "active").maybeSingle();

  if (tenantResult.error || !tenantResult.data) {
    return { ok: false, error: "tenant" };
  }

  const tenant = tenantResult.data as { id: string; slug: string; name: string };
  const programId = readOptional(formData, "programId");
  const formId = readOptional(formData, "formId");
  const validation = await validateProgramAndForm({ tenantId: tenant.id, programId, formId, selectedOption });

  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const relevantQuestions = validation.questions.filter((question) => question.appliesToOptions.includes(selectedOption));

  if (relevantQuestions.some((question) => question.required && !readQuestionAnswer(formData, question))) {
    return { ok: false, error: "required" };
  }

  const submissionResult = await admin
    .from("intake_submissions")
    .insert({
      tenant_id: tenant.id,
      form_id: validation.formId,
      program_id: validation.programId,
      selected_option: selectedOption,
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: readOptional(formData, "parentPhone"),
      participant_name: participantName,
      participant_birth_date: readOptional(formData, "participantBirthDate"),
      preferred_days: formData.getAll("preferredDays").filter((value): value is string => typeof value === "string"),
      preferred_notes: readOptional(formData, "preferredNotes"),
      message: readOptional(formData, "message"),
      consent_given: consentGiven,
      source_hostname: await getRequestHostname()
    })
    .select("id")
    .single();

  if (submissionResult.error || !submissionResult.data) {
    return { ok: false, error: "write" };
  }

  const submissionId = (submissionResult.data as { id: string }).id;
  const answerRows = relevantQuestions.flatMap((question) => {
    const answer = readQuestionAnswer(formData, question);

    if (!answer) {
      return [];
    }

    return [
      {
        tenant_id: tenant.id,
        submission_id: submissionId,
        question_id: question.id,
        field_key: question.fieldKey,
        answer_text: typeof answer === "string" ? answer : null,
        answer_json: Array.isArray(answer) ? answer : null
      }
    ];
  });

  if (answerRows.length > 0) {
    const answersResult = await admin.from("intake_answers").insert(answerRows);

    if (answersResult.error) {
      return { ok: false, error: "answers" };
    }
  }

  const eventResult = await admin.from("tenant_events").insert({
    tenant_id: tenant.id,
    event_type: "intake.received",
    subject_type: "intake_submission",
    subject_id: submissionId,
    payload: {
      selectedOption,
      parentEmail,
      participantName,
      programId: validation.programId
    }
  });

  if (eventResult.error) {
    return { ok: false, error: "event" };
  }

  return { ok: true, reference: submissionId.slice(0, 8) };
}

async function validateProgramAndForm(input: {
  tenantId: string;
  programId: string | null;
  formId: string | null;
  selectedOption: IntakeOption;
}): Promise<{ ok: true; programId: string | null; formId: string | null; questions: PublicIntakeQuestion[] } | { ok: false; error: string }> {
  const admin = createAdminClient();

  if (input.programId) {
    const programResult = await admin.from("programs").select("id").eq("tenant_id", input.tenantId).eq("id", input.programId).eq("status", "active").maybeSingle();

    if (programResult.error || !programResult.data) {
      return { ok: false, error: "program" };
    }
  }

  if (!input.formId) {
    return {
      ok: true,
      programId: input.programId,
      formId: null,
      questions: getDefaultIntakeForm().questions
    };
  }

  const formResult = await admin.from("intake_forms").select("id, allowed_options").eq("tenant_id", input.tenantId).eq("id", input.formId).eq("status", "active").maybeSingle();

  if (formResult.error || !formResult.data) {
    return { ok: false, error: "form" };
  }

  const form = formResult.data as { id: string; allowed_options: IntakeOption[] };

  if (!form.allowed_options.includes(input.selectedOption)) {
    return { ok: false, error: "option" };
  }

  const questionsResult = await admin
    .from("intake_questions")
    .select("id, field_key, label, help_text, field_type, required, options, applies_to_options, sort_order")
    .eq("tenant_id", input.tenantId)
    .eq("form_id", form.id)
    .order("sort_order");

  if (questionsResult.error) {
    return { ok: false, error: "questions" };
  }

  return {
    ok: true,
    programId: input.programId,
    formId: form.id,
    questions: ((questionsResult.data ?? []) as {
      id: string;
      field_key: string;
      label: string;
      help_text: string | null;
      field_type: PublicIntakeQuestion["fieldType"];
      required: boolean;
      options: unknown;
      applies_to_options: IntakeOption[];
      sort_order: number;
    }[]).map((question) => ({
      id: question.id,
      fieldKey: question.field_key,
      label: question.label,
      helpText: question.help_text,
      fieldType: question.field_type,
      required: question.required,
      options: Array.isArray(question.options) ? question.options.filter((value): value is string => typeof value === "string") : [],
      appliesToOptions: question.applies_to_options,
      sortOrder: question.sort_order
    }))
  };
}

function readQuestionAnswer(formData: FormData, question: PublicIntakeQuestion): string | string[] | null {
  const fieldName = `answer_${question.fieldKey}`;

  if (question.fieldType === "checkbox") {
    const values = formData.getAll(fieldName).filter((value): value is string => typeof value === "string" && value.trim() !== "");

    return values.length > 0 ? values : null;
  }

  return readOptional(formData, fieldName);
}

function readRequired(formData: FormData, field: string) {
  return readOptional(formData, field) ?? "";
}

function readOptional(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}
