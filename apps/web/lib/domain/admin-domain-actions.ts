"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { buildFlowThroughRecommendation, upsertFlowThroughCapacityHold } from "@/lib/flow-through/flow-through-engine";
import { updateSmartDecisionLifecycle } from "@/lib/smart-flow/decision";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function createProgramAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("programs").insert({
      tenant_id: tenantId,
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active"),
      sort_order: intValue(formData, "sort_order", 0)
    })
  );
  revalidateAdminDomain();
}

export async function updateProgramAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("programs")
      .update({
        code: optionalCode(formData, "code", name),
        name,
        description: optionalString(formData, "description"),
        status: enumValue(formData, "status", ["draft", "active", "archived"], "active"),
        sort_order: intValue(formData, "sort_order", 0)
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createStageAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("stages").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active"),
      sort_order: intValue(formData, "sort_order", 0)
    })
  );
  revalidateAdminDomain();
}

export async function updateStageAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("stages")
      .update({
        program_id: requiredString(formData, "program_id"),
        code: optionalCode(formData, "code", name),
        name,
        description: optionalString(formData, "description"),
        status: enumValue(formData, "status", ["draft", "active", "archived"], "active"),
        sort_order: intValue(formData, "sort_order", 0)
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createStageModuleAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("stage_modules").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: requiredString(formData, "stage_id"),
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      rubric: jsonObjectValue(formData, "rubric"),
      assessment_scale: enumValue(formData, "assessment_scale", ["four_step", "percentage", "binary", "custom"], "four_step"),
      parent_copy: optionalString(formData, "parent_copy"),
      evidence_required: checkboxValue(formData, "evidence_required"),
      sort_order: intValue(formData, "sort_order", 0),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateStageModuleAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("stage_modules")
      .update({
        program_id: requiredString(formData, "program_id"),
        stage_id: requiredString(formData, "stage_id"),
        code: optionalCode(formData, "code", name),
        name,
        description: optionalString(formData, "description"),
        rubric: jsonObjectValue(formData, "rubric"),
        assessment_scale: enumValue(formData, "assessment_scale", ["four_step", "percentage", "binary", "custom"], "four_step"),
        parent_copy: optionalString(formData, "parent_copy"),
        evidence_required: checkboxValue(formData, "evidence_required"),
        sort_order: intValue(formData, "sort_order", 0),
        status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createStageProgressCriteriaAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("stage_progress_criteria").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: requiredString(formData, "stage_id"),
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      required_modules: intValue(formData, "required_modules", 0, 0),
      required_score: nullableDecimalValue(formData, "required_score", 0, 100),
      required_statuses: multiTextValue(formData, "required_statuses", ["passed"]),
      evidence_required: checkboxValue(formData, "evidence_required"),
      parent_copy: optionalString(formData, "parent_copy"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function createQuickAssessmentTemplateAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("quick_assessment_templates").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: optionalString(formData, "stage_id"),
      stage_module_id: optionalString(formData, "stage_module_id"),
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      default_status: enumValue(formData, "default_status", ["observed", "in_progress", "passed", "needs_attention"], "in_progress"),
      default_score: nullableDecimalValue(formData, "default_score", 0, 100),
      instructor_prompt: optionalString(formData, "instructor_prompt"),
      parent_friendly_copy: optionalString(formData, "parent_friendly_copy"),
      sort_order: intValue(formData, "sort_order", 0),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function createBadgeRuleAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("badge_rules").insert({
      tenant_id: tenantId,
      badge_id: requiredString(formData, "badge_id"),
      program_id: optionalString(formData, "program_id"),
      stage_id: optionalString(formData, "stage_id"),
      code: optionalCode(formData, "code", name),
      name,
      trigger_type: enumValue(formData, "trigger_type", ["manual", "progress_recommendation"], "progress_recommendation"),
      min_score: nullableDecimalValue(formData, "min_score", 0, 100),
      required_module_ids: multiTextValue(formData, "required_module_ids", []),
      required_status: enumValue(formData, "required_status", ["observed", "in_progress", "passed", "needs_attention"], "passed"),
      approval_role: enumValue(formData, "approval_role", ["instructor", "tenant_admin", "either"], "either"),
      recommendation_copy: optionalString(formData, "recommendation_copy"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function createSubscriptionPlanAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("subscription_plans").insert({
      tenant_id: tenantId,
      code: optionalCode(formData, "code", name),
      name,
      description: optionalString(formData, "description"),
      billing_interval: enumValue(formData, "billing_interval", ["weekly", "monthly", "quarterly", "yearly", "manual"], "monthly"),
      price_cents: priceCents(formData, "price"),
      currency: requiredString(formData, "currency").toUpperCase(),
      lesson_frequency_per_week: decimalValue(formData, "lesson_frequency_per_week", 1),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateSubscriptionPlanAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("subscription_plans")
      .update({
        code: optionalCode(formData, "code", name),
        name,
        description: optionalString(formData, "description"),
        billing_interval: enumValue(formData, "billing_interval", ["weekly", "monthly", "quarterly", "yearly", "manual"], "monthly"),
        price_cents: priceCents(formData, "price"),
        currency: requiredString(formData, "currency").toUpperCase(),
        lesson_frequency_per_week: decimalValue(formData, "lesson_frequency_per_week", 1),
        status: enumValue(formData, "status", ["draft", "active", "archived"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createResourceAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("resources").insert({
      tenant_id: tenantId,
      code: optionalCode(formData, "code", name),
      name,
      resource_type: enumValue(formData, "resource_type", ["lane", "pool", "room", "field", "space"], "space"),
      location_name: optionalString(formData, "location_name"),
      capacity: intValue(formData, "capacity", 1, 1),
      status: enumValue(formData, "status", ["active", "inactive", "maintenance"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateResourceAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("resources")
      .update({
        code: optionalCode(formData, "code", name),
        name,
        resource_type: enumValue(formData, "resource_type", ["lane", "pool", "room", "field", "space"], "space"),
        location_name: optionalString(formData, "location_name"),
        capacity: intValue(formData, "capacity", 1, 1),
        status: enumValue(formData, "status", ["active", "inactive", "maintenance"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createInstructorAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("instructors").insert({
      tenant_id: tenantId,
      display_name: requiredString(formData, "display_name"),
      email: optionalString(formData, "email"),
      status: enumValue(formData, "status", ["active", "inactive"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateInstructorAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("instructors")
      .update({
        display_name: requiredString(formData, "display_name"),
        email: optionalString(formData, "email"),
        status: enumValue(formData, "status", ["active", "inactive"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionInstructorStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await transitionRowStatus(supabase, tenantId, "instructors", requiredString(formData, "id"), enumValue(formData, "status", ["active", "inactive"], "active"));
  revalidateAdminDomain();
}

export async function createGroupAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("groups").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: requiredString(formData, "stage_id"),
      resource_id: optionalString(formData, "resource_id"),
      instructor_id: optionalString(formData, "instructor_id"),
      code: optionalCode(formData, "code", name),
      name,
      weekday: intValue(formData, "weekday", 1, 1, 7),
      starts_at: requiredTime(formData, "starts_at"),
      ends_at: requiredTime(formData, "ends_at"),
      capacity: intValue(formData, "capacity", 1, 1),
      reserved_spots: intValue(formData, "reserved_spots", 0, 0),
      trial_spots: intValue(formData, "trial_spots", 0, 0),
      makeup_spots: intValue(formData, "makeup_spots", 0, 0),
      overbooking_policy: enumValue(formData, "overbooking_policy", ["blocked", "warn", "allow"], "blocked"),
      capacity_policy: capacityPolicyJson(formData),
      status: enumValue(formData, "status", ["draft", "active", "paused", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateGroupAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase
      .from("groups")
      .update({
        program_id: requiredString(formData, "program_id"),
        stage_id: requiredString(formData, "stage_id"),
        resource_id: optionalString(formData, "resource_id"),
        instructor_id: optionalString(formData, "instructor_id"),
        code: optionalCode(formData, "code", name),
        name,
        weekday: intValue(formData, "weekday", 1, 1, 7),
        starts_at: requiredTime(formData, "starts_at"),
        ends_at: requiredTime(formData, "ends_at"),
        capacity: intValue(formData, "capacity", 1, 1),
        reserved_spots: intValue(formData, "reserved_spots", 0, 0),
        trial_spots: intValue(formData, "trial_spots", 0, 0),
        makeup_spots: intValue(formData, "makeup_spots", 0, 0),
        overbooking_policy: enumValue(formData, "overbooking_policy", ["blocked", "warn", "allow"], "blocked"),
        capacity_policy: capacityPolicyJson(formData),
        status: enumValue(formData, "status", ["draft", "active", "paused", "archived"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionGroupStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await transitionRowStatus(supabase, tenantId, "groups", requiredString(formData, "id"), enumValue(formData, "status", ["draft", "active", "paused", "archived"], "active"));
  revalidateAdminDomain();
}

export async function createSessionAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("sessions").insert({
      tenant_id: tenantId,
      group_id: requiredString(formData, "group_id"),
      resource_id: optionalString(formData, "resource_id"),
      instructor_id: optionalString(formData, "instructor_id"),
      starts_at: requiredDateTime(formData, "starts_at"),
      ends_at: requiredDateTime(formData, "ends_at"),
      status: enumValue(formData, "status", ["scheduled", "completed", "cancelled"], "scheduled")
    })
  );
  revalidateAdminDomain();
}

export async function updateSessionAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("sessions")
      .update({
        group_id: requiredString(formData, "group_id"),
        resource_id: optionalString(formData, "resource_id"),
        instructor_id: optionalString(formData, "instructor_id"),
        starts_at: requiredDateTime(formData, "starts_at"),
        ends_at: requiredDateTime(formData, "ends_at"),
        status: enumValue(formData, "status", ["scheduled", "completed", "cancelled"], "scheduled")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionSessionStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await transitionRowStatus(supabase, tenantId, "sessions", requiredString(formData, "id"), enumValue(formData, "status", ["scheduled", "completed", "cancelled"], "scheduled"));
  revalidateAdminDomain();
}

export async function createParticipantAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("participants").insert({
      tenant_id: tenantId,
      external_reference: optionalString(formData, "external_reference"),
      display_name: requiredString(formData, "display_name"),
      birthdate: optionalDate(formData, "birthdate"),
      status: enumValue(formData, "status", ["active", "inactive", "archived"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateParticipantAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("participants")
      .update({
        external_reference: optionalString(formData, "external_reference"),
        display_name: requiredString(formData, "display_name"),
        birthdate: optionalDate(formData, "birthdate"),
        status: enumValue(formData, "status", ["active", "inactive", "archived"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionParticipantStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await transitionRowStatus(supabase, tenantId, "participants", requiredString(formData, "id"), enumValue(formData, "status", ["active", "inactive", "archived"], "active"));
  revalidateAdminDomain();
}

export async function createEnrollmentAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("enrollments").insert({
      tenant_id: tenantId,
      external_reference: optionalString(formData, "external_reference"),
      participant_id: requiredString(formData, "participant_id"),
      program_id: requiredString(formData, "program_id"),
      current_stage_id: optionalString(formData, "current_stage_id"),
      subscription_plan_id: optionalString(formData, "subscription_plan_id"),
      status: enumValue(formData, "status", ["pending", "active", "paused", "completed", "cancelled"], "active"),
      started_on: requiredDate(formData, "started_on"),
      ended_on: optionalDate(formData, "ended_on")
    })
  );
  revalidateAdminDomain();
}

export async function updateEnrollmentAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("enrollments")
      .update({
        external_reference: optionalString(formData, "external_reference"),
        participant_id: requiredString(formData, "participant_id"),
        program_id: requiredString(formData, "program_id"),
        current_stage_id: optionalString(formData, "current_stage_id"),
        subscription_plan_id: optionalString(formData, "subscription_plan_id"),
        status: enumValue(formData, "status", ["pending", "active", "paused", "completed", "cancelled"], "active"),
        started_on: requiredDate(formData, "started_on"),
        ended_on: optionalDate(formData, "ended_on")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionEnrollmentStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const status = enumValue(formData, "status", ["pending", "active", "paused", "completed", "cancelled"], "active");

  await throwOnError(
    supabase
      .from("enrollments")
      .update({
        status,
        ended_on: ["completed", "cancelled"].includes(status) ? new Date().toISOString().slice(0, 10) : null
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function createGroupMembershipAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("group_memberships").insert({
      tenant_id: tenantId,
      enrollment_id: requiredString(formData, "enrollment_id"),
      group_id: requiredString(formData, "group_id"),
      status: enumValue(formData, "status", ["planned", "active", "ended", "cancelled"], "active"),
      starts_on: requiredDate(formData, "starts_on"),
      ends_on: optionalDate(formData, "ends_on")
    })
  );
  revalidateAdminDomain();
}

export async function updateGroupMembershipAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("group_memberships")
      .update({
        enrollment_id: requiredString(formData, "enrollment_id"),
        group_id: requiredString(formData, "group_id"),
        status: enumValue(formData, "status", ["planned", "active", "ended", "cancelled"], "active"),
        starts_on: requiredDate(formData, "starts_on"),
        ends_on: optionalDate(formData, "ends_on")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function transitionGroupMembershipStatusAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const status = enumValue(formData, "status", ["planned", "active", "ended", "cancelled"], "active");

  await throwOnError(
    supabase
      .from("group_memberships")
      .update({
        status,
        ends_on: ["ended", "cancelled"].includes(status) ? new Date().toISOString().slice(0, 10) : null
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

export async function reviewStageTransitionProposalAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const proposalId = requiredString(formData, "id");
  const decision = enumValue(formData, "decision", ["approved", "rejected", "applied", "cancelled"], "approved");
  const { data: proposal, error } = await supabase
    .from("stage_transition_proposals")
    .select("id, enrollment_id, participant_id, from_stage_id, to_stage_id, status")
    .eq("tenant_id", tenantId)
    .eq("id", proposalId)
    .single();

  if (error || !proposal) {
    throw new Error(error?.message ?? "Doorstroomvoorstel niet gevonden.");
  }

  if (decision === "applied") {
    await throwOnError(
      supabase
        .from("enrollments")
        .update({
          current_stage_id: proposal.to_stage_id
        })
        .eq("tenant_id", tenantId)
        .eq("id", proposal.enrollment_id)
    );
  }

  await throwOnError(
    supabase
      .from("stage_transition_proposals")
      .update({
        status: decision,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", proposalId)
      .eq("tenant_id", tenantId)
  );

  await notifyGuardiansForStageTransition(supabase, tenantId, proposal.participant_id, proposal.enrollment_id, decision);
  revalidateAdminDomain();
  revalidatePath("/parent/voortgang");
  revalidatePath("/instructor/leerlingen");
  revalidatePath(`/instructor/student/${proposal.participant_id}`);
}

export async function createFlowThroughRecommendationAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const proposalId = requiredString(formData, "stage_transition_proposal_id");
  const draft = await buildFlowThroughRecommendation(supabase, { tenantId, proposalId });
  const targetOption = draft.options.find((option) => option.status === "candidate") ?? draft.options[0] ?? null;
  const { data, error } = await supabase
    .from("flow_through_recommendations")
    .upsert(
      {
        tenant_id: tenantId,
        stage_transition_proposal_id: draft.proposal.id,
        enrollment_id: draft.enrollment.id,
        participant_id: draft.proposal.participant_id,
        program_id: draft.enrollment.program_id,
        from_stage_id: draft.proposal.from_stage_id,
        to_stage_id: draft.proposal.to_stage_id,
        current_group_membership_id: draft.currentMembership?.id ?? null,
        current_group_id: draft.currentGroup?.id ?? null,
        target_group_id: targetOption?.groupId ?? draft.targetGroupId,
        smart_decision_id: draft.smartDecisionId,
        score: draft.score,
        confidence: draft.confidence,
        reasons: draft.reasons,
        blockers: draft.blockers,
        completion_snapshot: draft.completionSnapshot,
        capacity_result: targetOption?.capacitySnapshot ?? draft.capacityResult,
        preferred_fit: targetOption?.preferredFit ?? draft.preferredFit,
        constraints_snapshot: targetOption?.constraintsSnapshot ?? draft.constraintsSnapshot,
        old_spot_release_on: draft.oldSpotReleaseOn,
        target_start_on: draft.targetStartOn,
        status: "recommended",
        decision_note: null,
        reviewed_by_profile_id: null,
        reviewed_at: null,
        created_by_profile_id: profileId
      },
      { onConflict: "tenant_id,stage_transition_proposal_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Doorstroomadvies kon niet worden opgeslagen.");
  }

  const recommendationId = (data as { id: string }).id;

  await throwOnError(
    supabase
      .from("flow_through_target_options")
      .update({ status: "expired" })
      .eq("tenant_id", tenantId)
      .eq("recommendation_id", recommendationId)
      .neq("status", "selected")
  );

  if (draft.options.length > 0) {
    await throwOnError(
      supabase.from("flow_through_target_options").upsert(
        draft.options.map((option) => ({
          tenant_id: tenantId,
          recommendation_id: recommendationId,
          group_id: option.groupId,
          resource_id: option.resourceId,
          instructor_id: option.instructorId,
          score: option.score,
          confidence: option.confidence,
          capacity_snapshot: option.capacitySnapshot,
          preferred_fit: option.preferredFit,
          constraints_snapshot: option.constraintsSnapshot,
          reasons: option.reasons,
          blockers: option.blockers,
          suggested_start_on: option.suggestedStartOn,
          status: option.status
        })),
        { onConflict: "tenant_id,recommendation_id,group_id" }
      )
    );
  }

  await insertFlowThroughEvent(supabase, tenantId, recommendationId, "created", "Doorstroomadvies aangemaakt vanuit stage transition proposal.", profileId, {
    stage_transition_proposal_id: draft.proposal.id,
    target_group_id: targetOption?.groupId ?? null,
    score: draft.score
  });
  await insertFlowThroughEvent(supabase, tenantId, recommendationId, "billing_guard", "Doorstroom wijzigt geen abonnement of betaalplan.", profileId, {
    subscription_plan_id: draft.enrollment.subscription_plan_id,
    billing_change: false
  });

  if (targetOption?.status === "candidate") {
    const holdId = await upsertFlowThroughCapacityHold(supabase, {
      tenantId,
      recommendationId,
      enrollmentId: draft.enrollment.id,
      groupId: targetOption.groupId,
      resourceId: targetOption.resourceId,
      startsOn: targetOption.suggestedStartOn,
      actorProfileId: profileId,
      capacitySnapshot: targetOption.capacitySnapshot
    });

    await throwOnError(
      supabase
        .from("flow_through_recommendations")
        .update({
          capacity_hold_id: holdId,
          target_group_id: targetOption.groupId,
          capacity_result: targetOption.capacitySnapshot,
          preferred_fit: targetOption.preferredFit,
          constraints_snapshot: targetOption.constraintsSnapshot
        })
        .eq("tenant_id", tenantId)
        .eq("id", recommendationId)
    );
    await insertFlowThroughEvent(supabase, tenantId, recommendationId, "hold_created", "Capaciteit tijdelijk vastgehouden voor doorstroom.", profileId, {
      capacity_hold_id: holdId,
      group_id: targetOption.groupId
    });
  }

  revalidateAdminDomain();
}

export async function reviewFlowThroughRecommendationAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const recommendationId = requiredString(formData, "id");
  const decision = enumValue(formData, "decision", ["approve_transition", "approve_with_group", "postpone", "reject"], "approve_transition");
  const decisionNote = optionalString(formData, "decision_note");
  const targetGroupId = optionalString(formData, "target_group_id");
  const oldSpotReleaseOn = optionalDate(formData, "old_spot_release_on") ?? todayInput();
  const targetStartOn = optionalDate(formData, "target_start_on") ?? oldSpotReleaseOn;
  const recommendation = await singleRow<{
    id: string;
    stage_transition_proposal_id: string;
    enrollment_id: string;
    participant_id: string;
    program_id: string;
    from_stage_id: string | null;
    to_stage_id: string;
    current_group_membership_id: string | null;
    current_group_id: string | null;
    target_group_id: string | null;
    capacity_hold_id: string | null;
    status: string;
  }>(
    supabase
      .from("flow_through_recommendations")
      .select("id, stage_transition_proposal_id, enrollment_id, participant_id, program_id, from_stage_id, to_stage_id, current_group_membership_id, current_group_id, target_group_id, capacity_hold_id, status")
      .eq("tenant_id", tenantId)
      .eq("id", recommendationId)
      .single()
  );
  const finalTargetGroupId = targetGroupId ?? recommendation.target_group_id;
  const targetOverride = Boolean(targetGroupId && recommendation.target_group_id && targetGroupId !== recommendation.target_group_id);

  if ((decision === "postpone" || decision === "reject" || targetOverride) && !decisionNote) {
    throw new Error("Een afwijzing, uitstel of afwijkende doelgroep heeft verplicht een reden nodig.");
  }

  if (decision === "approve_with_group" && !finalTargetGroupId) {
    throw new Error("Kies een doelgroep om stage en groepsplaatsing samen toe te passen.");
  }

  if (decision === "postpone" || decision === "reject") {
    const nextStatus = decision === "postpone" ? "postponed" : "rejected";
    await throwOnError(
      supabase
        .from("flow_through_recommendations")
        .update({
          status: nextStatus,
          decision_note: decisionNote,
          reviewed_by_profile_id: profileId,
          reviewed_at: new Date().toISOString()
        })
        .eq("tenant_id", tenantId)
        .eq("id", recommendation.id)
    );
    await releaseFlowThroughHold(supabase, tenantId, recommendation.id, recommendation.capacity_hold_id, decision === "postpone" ? "released" : "cancelled", decisionNote ?? nextStatus);
    await updateSmartDecisionLifecycle(supabase, {
      tenantId,
      engineKey: "flow_through",
      subjectType: "stage_transition_proposal",
      subjectId: recommendation.stage_transition_proposal_id,
      decisionStatus: decision === "reject" ? "rejected" : "cancelled",
      humanDecision: decision === "reject" ? "rejected" : "cancelled",
      overrideReason: decisionNote,
      decidedByProfileId: profileId,
      result: { status: nextStatus, billing_change: false }
    });
    await insertFlowThroughEvent(supabase, tenantId, recommendation.id, decision === "postpone" ? "postponed" : "rejected", decisionNote ?? "Doorstroomadvies bijgewerkt.", profileId);
    revalidateAdminDomain();
    return;
  }

  await throwOnError(
    supabase
      .from("enrollments")
      .update({
        current_stage_id: recommendation.to_stage_id
      })
      .eq("tenant_id", tenantId)
      .eq("id", recommendation.enrollment_id)
  );

  if (decision === "approve_with_group" && finalTargetGroupId) {
    if (recommendation.current_group_membership_id) {
      await throwOnError(
        supabase
          .from("group_memberships")
          .update({
            ends_on: oldSpotReleaseOn,
            status: oldSpotReleaseOn <= todayInput() ? "ended" : "active"
          })
          .eq("tenant_id", tenantId)
          .eq("id", recommendation.current_group_membership_id)
      );
    }

    await throwOnError(
      supabase.from("group_memberships").upsert(
        {
          tenant_id: tenantId,
          enrollment_id: recommendation.enrollment_id,
          group_id: finalTargetGroupId,
          status: targetStartOn <= todayInput() ? "active" : "planned",
          starts_on: targetStartOn,
          ends_on: null
        },
        { onConflict: "enrollment_id,group_id,starts_on" }
      )
    );
    await throwOnError(
      supabase
        .from("flow_through_target_options")
        .update({ status: "selected" })
        .eq("tenant_id", tenantId)
        .eq("recommendation_id", recommendation.id)
        .eq("group_id", finalTargetGroupId)
    );
    await releaseFlowThroughHold(supabase, tenantId, recommendation.id, recommendation.capacity_hold_id, "converted", "Doorstroom toegepast met nieuwe groep.");
    await triggerWaitlistRematchForReleasedSpot(supabase, tenantId, recommendation, oldSpotReleaseOn, profileId);
  } else {
    await releaseFlowThroughHold(supabase, tenantId, recommendation.id, recommendation.capacity_hold_id, "released", "Doorstroom toegepast zonder groepswijziging.");
  }

  await throwOnError(
    supabase
      .from("stage_transition_proposals")
      .update({
        status: "applied",
        reviewed_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", recommendation.stage_transition_proposal_id)
  );
  await throwOnError(
    supabase
      .from("flow_through_recommendations")
      .update({
        target_group_id: finalTargetGroupId,
        old_spot_release_on: oldSpotReleaseOn,
        target_start_on: targetStartOn,
        status: decision === "approve_with_group" ? "applied" : "approved_transition",
        decision_note: decisionNote,
        reviewed_by_profile_id: profileId,
        reviewed_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", recommendation.id)
  );
  await updateSmartDecisionLifecycle(supabase, {
    tenantId,
    engineKey: "flow_through",
    subjectType: "stage_transition_proposal",
    subjectId: recommendation.stage_transition_proposal_id,
    decisionStatus: "applied",
    humanDecision: targetOverride ? "overridden" : "approved",
    overrideReason: targetOverride ? decisionNote : null,
    decidedByProfileId: profileId,
    result: {
      stage_updated: true,
      group_changed: decision === "approve_with_group",
      target_group_id: finalTargetGroupId,
      billing_change: false
    }
  });
  await insertFlowThroughEvent(supabase, tenantId, recommendation.id, decision === "approve_with_group" ? "approved_with_group" : "approved_transition", decisionNote ?? "Doorstroom goedgekeurd door admin.", profileId, {
    target_group_id: finalTargetGroupId,
    old_spot_release_on: oldSpotReleaseOn,
    target_start_on: targetStartOn,
    billing_change: false
  });
  await insertFlowThroughEvent(supabase, tenantId, recommendation.id, "billing_guard", "Doorstroom toegepast zonder subscription/payment wijziging.", profileId, {
    billing_change: false
  });
  await notifyGuardiansForStageTransition(supabase, tenantId, recommendation.participant_id, recommendation.enrollment_id, "applied");
  await insertFlowThroughEvent(supabase, tenantId, recommendation.id, "parent_notified", "Ouder/verzorger notificatie aangemaakt.", profileId);

  revalidateAdminDomain();
  revalidatePath("/parent/dashboard");
  revalidatePath("/parent/lessen");
  revalidatePath("/parent/voortgang");
  revalidatePath("/instructor/agenda");
  revalidatePath("/instructor/leerlingen");
  revalidatePath(`/instructor/student/${recommendation.participant_id}`);
}

export async function createParticipantGuardianAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("participant_guardians").insert({
      tenant_id: tenantId,
      participant_id: requiredString(formData, "participant_id"),
      profile_id: requiredString(formData, "profile_id"),
      relationship: enumValue(formData, "relationship", ["parent", "guardian", "athlete_self"], "parent"),
      display_name: optionalString(formData, "display_name"),
      email: optionalString(formData, "email"),
      status: enumValue(formData, "status", ["active", "inactive", "revoked"], "active")
    })
  );
  revalidateAdminDomain();
}

export async function updateParticipantGuardianAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("participant_guardians")
      .update({
        participant_id: requiredString(formData, "participant_id"),
        profile_id: requiredString(formData, "profile_id"),
        relationship: enumValue(formData, "relationship", ["parent", "guardian", "athlete_self"], "parent"),
        display_name: optionalString(formData, "display_name"),
        email: optionalString(formData, "email"),
        status: enumValue(formData, "status", ["active", "inactive", "revoked"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
  revalidateAdminDomain();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om deze tenantdata te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

async function insertFlowThroughEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  recommendationId: string,
  eventType: string,
  note: string,
  profileId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await throwOnError(
    supabase.from("flow_through_events").insert({
      tenant_id: tenantId,
      recommendation_id: recommendationId,
      event_type: eventType,
      note,
      metadata,
      created_by_profile_id: profileId
    })
  );
}

async function releaseFlowThroughHold(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  recommendationId: string,
  capacityHoldId: string | null,
  status: "released" | "cancelled" | "converted",
  reason: string
) {
  if (!capacityHoldId) {
    return;
  }

  await throwOnError(
    supabase
      .from("capacity_holds")
      .update({
        status,
        released_at: new Date().toISOString(),
        release_reason: reason
      })
      .eq("tenant_id", tenantId)
      .eq("id", capacityHoldId)
      .eq("flow_through_recommendation_id", recommendationId)
      .eq("status", "active")
  );
  await insertFlowThroughEvent(supabase, tenantId, recommendationId, "hold_released", reason, null, {
    capacity_hold_id: capacityHoldId,
    status
  });
}

async function triggerWaitlistRematchForReleasedSpot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  recommendation: {
    id: string;
    program_id: string;
    from_stage_id: string | null;
    current_group_id: string | null;
  },
  releaseOn: string,
  profileId: string
) {
  const now = new Date().toISOString();
  let query = supabase
    .from("waitlist_entries")
    .update({ reevaluation_requested_at: now })
    .eq("tenant_id", tenantId)
    .eq("program_id", recommendation.program_id)
    .in("status", ["queued", "matched"]);

  query = recommendation.from_stage_id ? query.or(`recommended_stage_id.eq.${recommendation.from_stage_id},recommended_stage_id.is.null`) : query.is("recommended_stage_id", null);

  const { data, error } = await query.select("id");

  if (error) {
    throw new Error(error.message);
  }

  const waitlistEntries = Array.isArray(data) ? (data as { id: string }[]) : [];

  if (waitlistEntries.length === 0) {
    await insertFlowThroughEvent(supabase, tenantId, recommendation.id, "waitlist_rematch_triggered", "Geen wachtlijstkandidaten gevonden voor de vrijgekomen plek.", profileId, {
      release_on: releaseOn,
      current_group_id: recommendation.current_group_id
    });
    return;
  }

  await throwOnError(
    supabase.from("waitlist_entry_events").insert(
      waitlistEntries.map((entry) => ({
        tenant_id: tenantId,
        waitlist_entry_id: entry.id,
        event_type: "reevaluation_requested",
        note: "Plek vrijgekomen door doorstroom; kandidaat opnieuw evalueren.",
        created_by_profile_id: profileId,
        metadata: {
          flow_through_recommendation_id: recommendation.id,
          release_on: releaseOn,
          current_group_id: recommendation.current_group_id
        }
      }))
    )
  );
  await insertFlowThroughEvent(supabase, tenantId, recommendation.id, "waitlist_rematch_triggered", `${waitlistEntries.length} wachtlijstkandidaat(en) opnieuw gemarkeerd.`, profileId, {
    release_on: releaseOn,
    waitlist_entry_ids: waitlistEntries.map((entry) => entry.id)
  });
}

async function notifyGuardiansForStageTransition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  participantId: string,
  enrollmentId: string,
  decision: string
) {
  const { data, error } = await supabase
    .from("participant_guardians")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "active");

  if (error) {
    throw new Error(error.message);
  }

  const guardians = Array.isArray(data) ? (data as { profile_id: string }[]) : [];

  if (guardians.length === 0) {
    return;
  }

  await throwOnError(
    supabase.from("parent_notifications").insert(
      guardians.map((guardian) => ({
        tenant_id: tenantId,
        recipient_profile_id: guardian.profile_id,
        participant_id: participantId,
        enrollment_id: enrollmentId,
        title: decision === "applied" ? "Nieuw niveau actief" : decision === "approved" ? "Niveau-overgang goedgekeurd" : "Niveau-overgang bijgewerkt",
        body:
          decision === "applied"
            ? "De zwemschool heeft het nieuwe niveau actief gezet. Het abonnement blijft ongewijzigd."
            : decision === "approved"
              ? "De zwemschool heeft de niveau-overgang goedgekeurd. Plaatsing en lessen volgen apart."
              : "De status van het niveauvoorstel is bijgewerkt.",
        notification_type: "progress",
        status: "unread"
      }))
    )
  );
}

function revalidateAdminDomain() {
  for (const path of [
    "/admin",
    "/admin/programs",
    "/admin/stages",
    "/admin/groups",
    "/admin/sessions",
    "/admin/resources",
    "/admin/enrollments",
    "/admin/instructors",
    "/admin/programma",
    "/admin/groepen",
    "/admin/agenda",
    "/admin/leerlingen",
    "/admin/badges",
    "/admin/rapportages",
    "/admin/taken"
  ]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

async function singleRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Record niet gevonden.");
  }

  return data as Row;
}

async function transitionRowStatus(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, table: string, id: string, status: string) {
  await throwOnError(supabase.from(table).update({ status }).eq("id", id).eq("tenant_id", tenantId));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
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

function optionalCode(formData: FormData, key: string, fallback: string) {
  const value = optionalString(formData, key) ?? fallback;
  const code = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!code) {
    throw new Error(`${key} heeft geen geldige code.`);
  }

  return code;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function intValue(formData: FormData, key: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function decimalValue(formData: FormData, key: string, fallback: number, min = 0) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseFloat(value.replace(",", ".")) : fallback;

  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function nullableDecimalValue(formData: FormData, key: string, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function priceCents(formData: FormData, key: string) {
  return Math.round(decimalValue(formData, key, 0, 0) * 100);
}

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function multiTextValue(formData: FormData, key: string, fallback: string[]) {
  const values = formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" ? value.split(",") : []))
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? [...new Set(values)] : fallback;
}

function jsonObjectValue(formData: FormData, key: string) {
  const raw = optionalString(formData, key);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error(`${key} moet een JSON-object zijn.`);
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${key} bevat geen geldige JSON.`);
  }
}

function capacityPolicyJson(formData: FormData) {
  const raw = optionalString(formData, "capacity_policy");

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Capacity policy moet een JSON-object zijn.");
    }

    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("Capacity policy bevat geen geldige JSON.");
  }
}

function requiredTime(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige tijd.`);
  }

  return value;
}

function requiredDate(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
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

function requiredDateTime(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}
