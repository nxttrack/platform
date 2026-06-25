"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
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
        status: enumValue(formData, "status", ["draft", "active", "paused", "archived"], "active")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );
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
    tenantId: context.activeTenant.tenantId
  };
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

function priceCents(formData: FormData, key: string) {
  return Math.round(decimalValue(formData, key, 0, 0) * 100);
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
