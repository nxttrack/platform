"use server";

import { redirect } from "next/navigation";

import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getPublicTenantSiteSnapshot } from "./tenant-site";

export async function submitIntakeAction(formData: FormData) {
  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  const programSlug = requiredString(formData, "program_slug");
  const snapshot = await getPublicTenantSiteSnapshot(programSlug);

  const selectedProgram = snapshot.selectedProgram;

  if (snapshot.status !== "ready" || !snapshot.tenant || !selectedProgram?.intakeConfig) {
    throw new Error("Intake is niet beschikbaar voor dit programma.");
  }

  const program = selectedProgram;
  const config = selectedProgram.intakeConfig;
  const intakeType = enumValue(formData, "intake_type", config.allowedOptions, "registration");

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
    answers: collectAnswers(formData),
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
    note: `Public intake submitted as ${intakeType}.`
  });

  if (eventResult.error) {
    throw new Error(eventResult.error.message);
  }

  redirect(`/intake?program=${encodeURIComponent(program.slug)}&submitted=1`);
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
  const answers: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (key.startsWith("answer_") && typeof value === "string" && value.trim()) {
      answers[key.slice("answer_".length)] = value.trim();
    }
  }

  return answers;
}

function enumValue(formData: FormData, key: string, allowed: string[], fallback: string) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value) ? value : fallback;
}
