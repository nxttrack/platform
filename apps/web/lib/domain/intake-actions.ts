"use server";

import { createHash, createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "./core";
import {
  isIntakeDaypart,
  isSwimmingExperience,
  rankIntakeSlots,
  type IntakeDaypart
} from "./intake-recommendation-contract";
import {
  getDefaultIntakeForm,
  getPublicTenantSiteDataBySlug,
  getRequestHostname,
  getTenantSlugFromRequest,
  type IntakeOption,
  type PublicIntakeQuestion
} from "./public-site";

const intakeOptions = ["enrollment", "trial", "waitlist", "information_request"] as const satisfies readonly IntakeOption[];

export async function submitIntakeAction(formData: FormData) {
  const result = await submitIntake(formData);

  if (!result.ok) {
    redirect(`/intake?error=${result.error}`);
  }

  revalidatePath("/admin/intake");
  redirect(`/intake?ontvangen=1&referentie=${encodeURIComponent(result.reference)}`);
}

export async function updateIntakeDuplicateStateAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/intake");
  const tenant = getActiveTenant(context);

  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect("/admin/intake?error=forbidden");
  }

  const submissionId = readRequired(formData, "submissionId");
  const duplicateState = readRequired(formData, "duplicateState");

  if (!["confirmed_duplicate", "dismissed"].includes(duplicateState)) {
    redirect("/admin/intake?error=state");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intake_submissions")
    .update({ duplicate_state: duplicateState })
    .eq("tenant_id", tenant.id)
    .eq("id", submissionId)
    .eq("duplicate_state", "possible_duplicate");

  if (error) {
    redirect("/admin/intake?error=write");
  }

  await admin.from("tenant_events").insert({
    tenant_id: tenant.id,
    event_type: `intake.duplicate_${duplicateState === "dismissed" ? "dismissed" : "confirmed"}`,
    subject_type: "intake_submission",
    subject_id: submissionId,
    payload: { reviewedByUserId: context.user.id }
  });

  revalidatePath("/admin/intake");
  redirect("/admin/intake?saved=duplicate");
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
  const participantBirthDate = readOptional(formData, "participantBirthDate");
  const secondaryParentName = readOptional(formData, "secondaryParentName");
  const secondaryParentEmail = normalizeOptionalEmail(readOptional(formData, "secondaryParentEmail"));
  const swimmingExperience = readOptional(formData, "swimmingExperience");
  const consentGiven = formData.get("consentGiven") === "on";
  const honeypot = readOptional(formData, "companyWebsite");
  const startedAt = Number(readOptional(formData, "formStartedAt"));

  if (
    !isEmail(parentEmail) ||
    !consentGiven ||
    !parentName ||
    !participantName ||
    !participantBirthDate ||
    !isValidBirthDate(participantBirthDate) ||
    !isSwimmingExperience(swimmingExperience) ||
    (secondaryParentEmail && !isEmail(secondaryParentEmail))
  ) {
    return { ok: false, error: "required" };
  }

  // Bots get the same calm success path as real visitors, without learning which trap fired.
  if (honeypot || !Number.isFinite(startedAt) || Date.now() - startedAt < 250) {
    return { ok: true, reference: "ONTVANGEN" };
  }

  const admin = createAdminClient();
  const tenantResult = await admin.from("tenants").select("id, slug, name").eq("slug", slug).eq("status", "active").maybeSingle();

  if (tenantResult.error || !tenantResult.data) {
    return { ok: false, error: "tenant" };
  }

  const tenant = tenantResult.data as { id: string; slug: string; name: string };
  const abuseFingerprint = await getAbuseFingerprint(tenant.id);
  const rateLimitResult = await admin.rpc("consume_public_intake_rate_limit", {
    target_tenant_id: tenant.id,
    target_fingerprint_hash: abuseFingerprint,
    target_window_started_at: getRateLimitWindowStart(),
    target_limit: 5
  });

  if (rateLimitResult.error || rateLimitResult.data !== true) {
    return { ok: false, error: "busy" };
  }

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

  const preferredWeekdays = formData
    .getAll("preferredWeekdays")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const preferredDayparts = parsePreferredDayparts(readOptional(formData, "preferredDayparts"), preferredWeekdays);
  const publicData = await getPublicTenantSiteDataBySlug(slug);
  const publicProgram = publicData?.programs.find((program) => program.id === validation.programId) ?? null;

  if (!publicProgram) {
    return { ok: false, error: "program" };
  }

  const recommendations = rankIntakeSlots({
    slots: publicProgram.slots,
    experience: swimmingExperience,
    preferredDays: preferredWeekdays,
    preferredDayparts
  });
  const selectedGroupId = readOptional(formData, "selectedGroupId");
  const selectedRecommendation = recommendations.find((recommendation) => recommendation.groupId === selectedGroupId) ?? null;

  if (publicProgram.slots.length > 0 && (preferredWeekdays.length === 0 || recommendations.length === 0 || !selectedRecommendation)) {
    return { ok: false, error: "choice" };
  }

  const dedupeKey = createHash("sha256")
    .update([tenant.id, parentEmail, normalizeName(participantName), validation.programId ?? "", selectedOption].join("|"))
    .digest("hex");
  const duplicateResult = await admin
    .from("intake_submissions")
    .select("id, received_at")
    .eq("tenant_id", tenant.id)
    .eq("dedupe_key", dedupeKey)
    .gte("received_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString())
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duplicateResult.error) {
    return { ok: false, error: "write" };
  }

  const duplicate = duplicateResult.data as { id: string; received_at: string } | null;

  // Double-clicks and browser retries are idempotent for ten minutes.
  if (duplicate && Date.now() - new Date(duplicate.received_at).getTime() < 10 * 60 * 1_000) {
    return { ok: true, reference: duplicate.id.slice(0, 8) };
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
      secondary_parent_name: secondaryParentName,
      secondary_parent_email: secondaryParentEmail,
      secondary_parent_phone: readOptional(formData, "secondaryParentPhone"),
      participant_name: participantName,
      participant_birth_date: participantBirthDate,
      preferred_days: formData.getAll("preferredDays").filter((value): value is string => typeof value === "string"),
      preferred_dayparts: preferredDayparts,
      preferred_notes: readOptional(formData, "preferredNotes"),
      message: readOptional(formData, "message"),
      swimming_experience: swimmingExperience,
      recommendation_snapshot: recommendations.map((recommendation) => ({
        groupId: recommendation.groupId,
        stageId: recommendation.stageId,
        weekday: recommendation.weekday,
        daypart: recommendation.daypart,
        startsAt: recommendation.startsAt,
        endsAt: recommendation.endsAt,
        waitBand: recommendation.waitBand,
        rank: recommendation.rank,
        reasons: recommendation.reasons
      })),
      selected_group_id: selectedRecommendation?.groupId ?? null,
      selected_wait_band: selectedRecommendation?.waitBand ?? "long",
      recommendation_version: "intake-v1",
      consent_given: consentGiven,
      source_hostname: await getRequestHostname(),
      dedupe_key: dedupeKey,
      duplicate_state: duplicate ? "possible_duplicate" : "unique",
      duplicate_of_submission_id: duplicate?.id ?? null,
      abuse_fingerprint: abuseFingerprint
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
      programId: validation.programId,
      duplicateState: duplicate ? "possible_duplicate" : "unique",
      duplicateOfSubmissionId: duplicate?.id ?? null,
      swimmingExperience,
      selectedGroupId: selectedRecommendation?.groupId ?? null,
      selectedWaitBand: selectedRecommendation?.waitBand ?? "long",
      recommendationVersion: "intake-v1"
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
  if (question.fieldKey === "swimming_experience" || question.fieldKey === "swim_experience") {
    return readOptional(formData, "swimmingExperience");
  }

  if (question.fieldKey === "preferred_moment") {
    return readOptional(formData, "preferredNotes");
  }

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

function normalizeOptionalEmail(email: string | null) {
  return email ? normalizeEmail(email) : null;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("nl").replace(/\s+/g, " ");
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function isValidBirthDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);

  return !Number.isNaN(parsed.getTime()) && parsed <= new Date() && parsed.getFullYear() >= 1900;
}

function parsePreferredDayparts(value: string | null, weekdays: number[]): Partial<Record<number, IntakeDaypart[]>> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      weekdays.flatMap((weekday) => {
        const values = (parsed as Record<string, unknown>)[String(weekday)];

        if (!Array.isArray(values)) {
          return [];
        }

        const dayparts = values.filter((candidate): candidate is IntakeDaypart => typeof candidate === "string" && isIntakeDaypart(candidate));
        return dayparts.length > 0 ? [[weekday, dayparts] as const] : [];
      })
    );
  } catch {
    return {};
  }
}

async function getAbuseFingerprint(tenantId: string) {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwardedFor || requestHeaders.get("x-real-ip") || "unknown";
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 240) || "unknown";
  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  const input = `${tenantId}|${address}|${userAgent}`;

  return secret ? createHmac("sha256", secret).update(input).digest("hex") : createHash("sha256").update(input).digest("hex");
}

function getRateLimitWindowStart() {
  const windowSize = 15 * 60 * 1_000;

  return new Date(Math.floor(Date.now() / windowSize) * windowSize).toISOString();
}
