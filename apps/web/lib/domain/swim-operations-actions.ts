"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { evaluateBadgeTriggerSet } from "./badge-engine";
import { getActiveTenant } from "./core";
import { parseLearnerAssessmentValue } from "./learner-assessment";

export async function previewSwimTransitionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const enrollmentId = required(formData, "enrollmentId");
  const supabase = await createClient();
  const result = await supabase.rpc("preview_swim_transition", {
    target_enrollment_id: enrollmentId,
    target_tenant_id: tenant.id
  });

  finish(nextPath, result.error, "transition-preview");
}

export async function reviewSwimTransitionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  await requirePrivateShellContext("/instructor");
  const supabase = await createClient();
  const result = await supabase.rpc("review_swim_transition", {
    target_case_id: required(formData, "caseId"),
    target_reason: required(formData, "reason")
  });

  finish(nextPath, result.error, "transition-review");
}

export async function approveSwimTransitionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  await requirePrivateShellContext("/instructor");
  const supabase = await createClient();
  const result = await supabase.rpc("approve_swim_transition", {
    target_approved: required(formData, "decision") === "approve",
    target_case_id: required(formData, "caseId"),
    target_reason: required(formData, "reason")
  });

  finish(nextPath, result.error, "transition-approval");
}

export async function executeSwimTransitionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  await requirePrivateShellContext("/instructor");
  const supabase = await createClient();
  const operationId = optional(formData, "operationId") ?? crypto.randomUUID();
  const result = await supabase.rpc("execute_swim_transition", {
    target_case_id: required(formData, "caseId"),
    target_idempotency_key: `transition:web:${operationId}`,
    target_reason: required(formData, "reason")
  });

  finish(nextPath, result.error, "transition-execution");
}

export async function completePreviousStageItemsAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const enrollmentId = required(formData, "enrollmentId");
  const selectedCarryoverIds = formData
    .getAll("carryoverId")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const entries = selectedCarryoverIds.map((carryoverId) => ({
    carryoverId,
    context: {
      channel: "instructor_web",
      formulaVersion: "swim_progress_v3"
    },
    note: optional(formData, `note:${carryoverId}`),
    rating: parseLearnerAssessmentValue(optional(formData, `rating:${carryoverId}`)),
    visibility: optional(formData, `visibility:${carryoverId}`) === "internal"
      ? "internal"
      : "parent_visible"
  }));
  const operationId = optional(formData, "operationId") ?? crypto.randomUUID();
  const supabase = await createClient();
  const result = await supabase.rpc("complete_previous_stage_items", {
    target_enrollment_id: enrollmentId,
    target_entries: entries,
    target_idempotency_key: `carryover:web:${operationId}`,
    target_reason: required(formData, "reason"),
    target_tenant_id: tenant.id
  });

  if (result.error || !result.data) {
    finish(nextPath, result.error ?? { message: "Geen carryover-batch terugontvangen." }, "carryover");
  }

  const admin = createAdminClient();
  const batchItemsResult = await admin
    .from("swim_carryover_completion_items")
    .select("carryover_id, observation_id")
    .eq("tenant_id", tenant.id)
    .eq("batch_id", result.data);
  const carryoverIds = (batchItemsResult.data ?? []).map((item) => item.carryover_id);
  const carryoversResult = carryoverIds.length
    ? await admin
        .from("swim_item_carryovers")
        .select("id, curriculum_item_identity_id")
        .eq("tenant_id", tenant.id)
        .in("id", carryoverIds)
    : { data: [], error: null };
  const identityIds = (carryoversResult.data ?? []).map((carryover) => carryover.curriculum_item_identity_id);
  const identitiesResult = identityIds.length
    ? await admin
        .from("curriculum_item_identities")
        .select("id, stable_key")
        .eq("tenant_id", tenant.id)
        .in("id", identityIds)
    : { data: [], error: null };
  const identityById = new Map((identitiesResult.data ?? []).map((identity) => [identity.id, identity.stable_key]));
  const observationByCarryoverId = new Map(
    (batchItemsResult.data ?? []).map((item) => [item.carryover_id, item.observation_id])
  );

  await evaluateBadgeTriggerSet({
    tenantId: tenant.id,
    participantId: required(formData, "participantId"),
    events: (carryoversResult.data ?? []).flatMap((carryover) => {
      const observationId = observationByCarryoverId.get(carryover.id);
      const skill = identityById.get(carryover.curriculum_item_identity_id);
      return observationId && skill
        ? [
            {
              eventContext: { entityId: observationId, skill },
              eventType: "progress_item_completed"
            },
            {
              eventContext: { entityId: observationId, skill },
              eventType: "skill_completed"
            }
          ]
        : [];
    })
  });

  finish(nextPath, null, "carryover");
}

export async function awardRemainingBadgesAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const badgeReleaseIds = formData
    .getAll("badgeReleaseId")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (badgeReleaseIds.length === 0) {
    redirectWithStatus(nextPath, "error", "remaining-badges-empty");
  }

  const operationId = optional(formData, "operationId") ?? crypto.randomUUID();
  const supabase = await createClient();
  const result = await supabase.rpc("award_badge_batch", {
    target_actor_user_id: context.user.id,
    target_badge_release_ids: badgeReleaseIds,
    target_command_type: "remaining_badges",
    target_enrollment_id: required(formData, "enrollmentId"),
    target_idempotency_key: `remaining-badges:web:${operationId}`,
    target_participant_id: required(formData, "participantId"),
    target_reason: required(formData, "reason"),
    target_source_event_id: null,
    target_source_event_type: "remaining_badges_command",
    target_source_session_id: null,
    target_tenant_id: tenant.id,
    target_visibility: "parent_visible"
  });

  finish(nextPath, result.error, "remaining-badges");
}

function finish(
  nextPath: `/${string}`,
  error: { message: string } | null,
  key: string
): never {
  revalidatePath("/instructor");
  revalidatePath("/portaal");
  revalidatePath("/portaal/ontwikkeling");
  revalidatePath(nextPath);
  redirectWithStatus(nextPath, error ? "error" : "saved", key);
}

function required(formData: FormData, key: string) {
  const value = optional(formData, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function optional(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function redirectWithStatus(path: `/${string}`, key: "saved" | "error", value: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
}
