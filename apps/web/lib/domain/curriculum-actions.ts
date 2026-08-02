"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

const curriculumSteps = ["framework", "stages", "competencies", "items", "policies"] as const;

export async function createCurriculumDraftAction(formData: FormData) {
  const { context, tenant } = await requireCurriculumAdmin("/admin/programma");
  const result = await createAdminClient().rpc("create_curriculum_draft", {
    actor_user_id: context.user.id,
    clone_latest: formData.get("cloneLatest") === "on",
    target_idempotency_key: readIdempotencyKey(formData),
    target_name: requiredText(formData, "name", 160),
    target_program_id: requiredUuid(formData, "programId"),
    target_tenant_id: tenant.id
  });
  if (result.error || !result.data) redirect("/admin/programma?error=curriculum-create");
  revalidatePath("/admin/programma");
  redirect(`/admin/programma/leerlijn/${result.data}?step=framework&created=1`);
}

export async function saveCurriculumDraftStepAction(formData: FormData) {
  const versionId = requiredUuid(formData, "versionId");
  const step = readStep(formData);
  const { context } = await requireCurriculumAdmin(`/admin/programma/leerlijn/${versionId}`);
  const payload = buildStepPayload(step, formData);
  const result = await createAdminClient().rpc("save_curriculum_draft_step", {
    actor_user_id: context.user.id,
    expected_revision: requiredInteger(formData, "expectedRevision", 1, 1_000_000),
    target_entity_id: optionalUuid(formData, "entityId"),
    target_payload: payload,
    target_step: step,
    target_version_id: versionId
  });
  if (result.error) redirect(`/admin/programma/leerlijn/${versionId}?step=${step}&error=save`);
  revalidateCurriculum(versionId);
  redirect(`/admin/programma/leerlijn/${versionId}?step=${nextStep(step)}&saved=1`);
}

export async function validateCurriculumDraftAction(formData: FormData) {
  const versionId = requiredUuid(formData, "versionId");
  const { context } = await requireCurriculumAdmin(`/admin/programma/leerlijn/${versionId}`);
  const result = await createAdminClient().rpc("validate_curriculum_draft", {
    actor_user_id: context.user.id,
    target_version_id: versionId
  });
  if (result.error) redirect(`/admin/programma/leerlijn/${versionId}?step=review&error=validation`);
  revalidateCurriculum(versionId);
  redirect(`/admin/programma/leerlijn/${versionId}?step=review&validated=1`);
}

export async function publishCurriculumDraftAction(formData: FormData) {
  const versionId = requiredUuid(formData, "versionId");
  const { context } = await requireCurriculumAdmin(`/admin/programma/leerlijn/${versionId}`);
  if (formData.get("humanConfirmation") !== "confirmed") {
    redirect(`/admin/programma/leerlijn/${versionId}?step=review&error=confirmation`);
  }
  const result = await createAdminClient().rpc("publish_curriculum_version", {
    actor_user_id: context.user.id,
    expected_revision: requiredInteger(formData, "expectedRevision", 1, 1_000_000),
    target_idempotency_key: readIdempotencyKey(formData),
    target_version_id: versionId
  });
  if (result.error) redirect(`/admin/programma/leerlijn/${versionId}?step=review&error=publication`);
  revalidateCurriculum(versionId);
  redirect(`/admin/programma/leerlijn/${versionId}?step=review&published=1`);
}

export async function previewCurriculumMigrationAction(formData: FormData) {
  const { context } = await requireCurriculumAdmin("/admin/programma");
  const result = await createAdminClient().rpc("preview_curriculum_migration", {
    actor_user_id: context.user.id,
    target_from_version_id: requiredUuid(formData, "fromVersionId"),
    target_idempotency_key: readIdempotencyKey(formData),
    target_reason: requiredText(formData, "reason", 500),
    target_to_version_id: requiredUuid(formData, "toVersionId")
  });
  if (result.error) redirect("/admin/programma?error=migration-preview");
  revalidatePath("/admin/programma");
  redirect("/admin/programma?migration=previewed");
}

export async function approveCurriculumMigrationAction(formData: FormData) {
  const { context } = await requireCurriculumAdmin("/admin/programma");
  if (formData.get("humanConfirmation") !== "confirmed") redirect("/admin/programma?error=confirmation");
  const result = await createAdminClient().rpc("approve_curriculum_migration", {
    actor_user_id: context.user.id,
    target_plan_id: requiredUuid(formData, "planId")
  });
  if (result.error) redirect("/admin/programma?error=migration-approval");
  revalidatePath("/admin/programma");
  redirect("/admin/programma?migration=approved");
}

export async function executeCurriculumMigrationAction(formData: FormData) {
  const { context } = await requireCurriculumAdmin("/admin/programma");
  if (formData.get("humanConfirmation") !== "confirmed") redirect("/admin/programma?error=confirmation");
  const result = await createAdminClient().rpc("execute_curriculum_migration", {
    actor_user_id: context.user.id,
    target_idempotency_key: readIdempotencyKey(formData),
    target_plan_id: requiredUuid(formData, "planId")
  });
  if (result.error) redirect("/admin/programma?error=migration-execution");
  revalidatePath("/admin/programma");
  redirect("/admin/programma?migration=completed");
}

function buildStepPayload(step: (typeof curriculumSteps)[number], formData: FormData) {
  if (step === "framework") {
    return {
      description: optionalText(formData, "description", 1_000),
      diplomaCode: optionalText(formData, "diplomaCode", 80),
      name: requiredText(formData, "name", 160),
      weightingEnabled: formData.get("weightingEnabled") === "on"
    };
  }
  if (step === "stages") {
    return {
      colorHex: optionalText(formData, "colorHex", 7),
      description: optionalText(formData, "description", 1_000),
      legacyStageId: optionalUuid(formData, "legacyStageId"),
      name: requiredText(formData, "name", 160),
      sortOrder: requiredInteger(formData, "sortOrder", 0, 100_000),
      stableKey: requiredKey(formData, "stableKey")
    };
  }
  if (step === "competencies") {
    return {
      description: optionalText(formData, "description", 1_000),
      name: requiredText(formData, "name", 160),
      sortOrder: requiredInteger(formData, "sortOrder", 0, 100_000),
      stableKey: requiredKey(formData, "stableKey")
    };
  }
  if (step === "items") {
    return {
      competencyIds: formData.getAll("competencyIds").map(String).filter(isUuid),
      context: {
        environment: optionalText(formData, "environment", 120),
        equipment: optionalText(formData, "equipment", 120),
        notes: optionalText(formData, "contextNotes", 500),
        waterDepth: optionalText(formData, "waterDepth", 120)
      },
      contributesToDiploma: formData.get("contributesToDiploma") === "on",
      contributesToStage: formData.get("contributesToStage") === "on",
      description: optionalText(formData, "description", 1_000),
      masteryThreshold: requiredInteger(formData, "masteryThreshold", 1, 5),
      name: requiredText(formData, "name", 160),
      requiredForGraduation: formData.get("requiredForGraduation") === "on",
      requiredForTransition: formData.get("requiredForTransition") === "on",
      sortOrder: requiredInteger(formData, "sortOrder", 0, 100_000),
      stableKey: requiredKey(formData, "stableKey"),
      stageId: requiredUuid(formData, "stageId"),
      weight: requiredNumber(formData, "weight", 0.0001, 10_000)
    };
  }
  return {
    carryoverMode: "reference_open_items",
    coveragePercent: requiredInteger(formData, "coveragePercent", 1, 100),
    graduationThreshold: requiredInteger(formData, "graduationThreshold", 1, 5),
    transitionThreshold: requiredInteger(formData, "transitionThreshold", 1, 5)
  };
}

async function requireCurriculumAdmin(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  const allowed = context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff", "coordinator"].includes(role)
  );
  if (!allowed) redirect("/admin?error=forbidden");
  return { context, tenant };
}

function revalidateCurriculum(versionId: string) {
  revalidatePath("/admin/programma");
  revalidatePath(`/admin/programma/leerlijn/${versionId}`);
}

function readStep(formData: FormData) {
  const value = String(formData.get("step") ?? "");
  if (!curriculumSteps.includes(value as (typeof curriculumSteps)[number])) throw new Error("Invalid curriculum step");
  return value as (typeof curriculumSteps)[number];
}

function nextStep(step: (typeof curriculumSteps)[number]) {
  const index = curriculumSteps.indexOf(step);
  return curriculumSteps[Math.min(index + 1, curriculumSteps.length - 1)] ?? "framework";
}

function readIdempotencyKey(formData: FormData) {
  const value = String(formData.get("idempotencyKey") ?? "");
  if (value.length < 8 || value.length > 200) throw new Error("Invalid idempotency key");
  return value;
}

function requiredUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!isUuid(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function optionalUuid(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) return null;
  if (!isUuid(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredKey(formData: FormData, name: string) {
  const value = requiredText(formData, name, 120).toLowerCase().replace(/\s+/g, "_");
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function requiredText(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim();
  if (!value || value.length > maxLength) throw new Error(`Invalid ${name}`);
  return value;
}

function optionalText(formData: FormData, name: string, maxLength: number) {
  const value = String(formData.get(name) ?? "").trim();
  return value ? value.slice(0, maxLength) : null;
}

function requiredInteger(formData: FormData, name: string, minimum: number, maximum: number) {
  const value = Number(formData.get(name));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${name}`);
  return value;
}

function requiredNumber(formData: FormData, name: string, minimum: number, maximum: number) {
  const value = Number(formData.get(name));
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`Invalid ${name}`);
  return value;
}
