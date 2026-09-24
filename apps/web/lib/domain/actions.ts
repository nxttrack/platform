"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBadgeGender } from "./badge-system-contract";
import { getActiveTenant } from "./core";

export async function createProgramAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const { error } = await admin.from("programs").insert({
    tenant_id: tenant.id,
    name: readRequired(formData, "name"),
    code: readOptional(formData, "code"),
    description: readOptional(formData, "description"),
    status: readOptional(formData, "status") ?? "active",
    sort_order: readInteger(formData, "sortOrder") ?? 0,
    min_age_months: readInteger(formData, "minAgeMonths"),
    max_age_months: readInteger(formData, "maxAgeMonths")
  });

  redirectAfterWrite("/admin/programma", error);
}

export async function createProgramStageAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const { error } = await admin.from("program_stages").insert({
    tenant_id: tenant.id,
    program_id: readRequired(formData, "programId"),
    name: readRequired(formData, "name"),
    code: readOptional(formData, "code"),
    badge_label: readOptional(formData, "badgeLabel"),
    color_hex: readOptional(formData, "colorHex"),
    status: readOptional(formData, "status") ?? "active",
    sort_order: readInteger(formData, "sortOrder") ?? 0
  });

  redirectAfterWrite("/admin/programma", error);
}

export async function createResourceAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const { error } = await admin.from("resources").insert({
    tenant_id: tenant.id,
    parent_resource_id: readOptional(formData, "parentResourceId"),
    kind: readRequired(formData, "kind"),
    name: readRequired(formData, "name"),
    code: readOptional(formData, "code"),
    capacity: readInteger(formData, "capacity"),
    safety_capacity: readInteger(formData, "safetyCapacity"),
    status: readOptional(formData, "status") ?? "active",
    sort_order: readInteger(formData, "sortOrder") ?? 0
  });

  redirectAfterWrite("/admin/resources", error);
}

export async function createGroupAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const { error } = await admin.from("groups").insert({
    tenant_id: tenant.id,
    program_id: readRequired(formData, "programId"),
    stage_id: readOptional(formData, "stageId"),
    default_resource_id: readOptional(formData, "resourceId"),
    name: readRequired(formData, "name"),
    code: readOptional(formData, "code"),
    status: readOptional(formData, "status") ?? "active",
    capacity: readInteger(formData, "capacity") ?? 8,
    default_weekday: readInteger(formData, "weekday"),
    default_start_time: readOptional(formData, "startTime"),
    default_end_time: readOptional(formData, "endTime"),
    starts_on: readOptional(formData, "startsOn"),
    ends_on: readOptional(formData, "endsOn")
  });

  redirectAfterWrite("/admin/groepen", error);
}

export async function createGroupInstructorAssignmentAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const { error } = await admin.from("group_instructor_assignments").insert({
    tenant_id: tenant.id,
    group_id: readRequired(formData, "groupId"),
    instructor_user_id: readRequired(formData, "instructorUserId"),
    role: readOptional(formData, "role") ?? "primary",
    status: "active",
    starts_on: readOptional(formData, "startsOn"),
    ends_on: readOptional(formData, "endsOn")
  });

  redirectAfterWrite("/admin/groepen", error);
}

export async function createSessionAction(formData: FormData) {
  const tenant = await getActionTenant();
  const startsAt = readRequired(formData, "startsAt");
  const endsAt = readRequired(formData, "endsAt");

  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    redirect("/admin/agenda?error=time");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sessions").insert({
    tenant_id: tenant.id,
    group_id: readRequired(formData, "groupId"),
    resource_id: readOptional(formData, "resourceId"),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    status: readOptional(formData, "status") ?? "scheduled",
    capacity_override: readInteger(formData, "capacityOverride"),
    notes: readOptional(formData, "notes")
  });

  redirectAfterWrite("/admin/agenda", error);
}

export async function createParticipantEnrollmentAction(formData: FormData) {
  const { tenant, actorUserId } = await getWriteActionContext();
  const admin = createAdminClient();
  const guardianUserId = readOptional(formData, "guardianUserId");
  const operationKey = readRequired(formData, "operationKey");
  const participant = {
    guardianUserId,
    displayName: readRequired(formData, "displayName"),
    birthDate: readOptional(formData, "birthDate"),
    gender: normalizeBadgeGender(readOptional(formData, "gender"))
  };
  const enrollment = {
    programId: readRequired(formData, "programId"),
    stageId: readOptional(formData, "stageId"),
    startsOn: readOptional(formData, "startsOn")
  };
  const { data, error } = await admin.rpc("create_participant_graph_atomic", {
    target_actor_user_id: actorUserId,
    target_tenant_id: tenant.id,
    target_idempotency_key: operationKey,
    target_request_fingerprint: fingerprint({ participant, enrollment }),
    target_participant: participant,
    target_enrollment: enrollment
  });

  const result = data as { outcome?: string } | null;
  if (error || result?.outcome !== "created") {
    redirect("/admin/leerlingen?error=participant");
  }
  redirect("/admin/leerlingen?saved=1");
}

export async function createGroupMembershipAction(formData: FormData) {
  const { tenant, actorUserId } = await getWriteActionContext();
  const admin = createAdminClient();
  const groupId = readRequired(formData, "groupId");
  const enrollmentId = readRequired(formData, "enrollmentId");
  const capacityWeight = readNumber(formData, "capacityWeight") ?? 1;
  const status = readOptional(formData, "status") ?? "active";
  const requestedBucket = readOptional(formData, "capacityBucket") ?? "regular";
  const capacityBucket = status === "trial"
    ? "trial"
    : requestedBucket === "flex" ? "flex" : "regular";
  const command = {
    groupId,
    enrollmentId,
    status,
    capacityBucket,
    capacityWeight,
    startsOn: readOptional(formData, "startsOn")
  };
  const { data, error } = await admin.rpc("place_group_membership_atomic", {
    target_actor_user_id: actorUserId,
    target_tenant_id: tenant.id,
    target_idempotency_key: readRequired(formData, "operationKey"),
    target_request_fingerprint: fingerprint(command),
    target_group_id: groupId,
    target_enrollment_id: enrollmentId,
    target_status: status,
    target_capacity_bucket: capacityBucket,
    target_capacity_weight: capacityWeight,
    target_starts_on: command.startsOn
  });

  const result = data as { outcome?: string } | null;
  if (error || result?.outcome === "write_failed") {
    redirect("/admin/leerlingen?error=placement");
  }
  if (result?.outcome === "capacity_full") {
    redirect("/admin/leerlingen?error=capacity");
  }
  if (result?.outcome === "conflict") {
    redirect("/admin/leerlingen?error=conflict");
  }
  if (result?.outcome !== "placed" && result?.outcome !== "already_placed") {
    redirect("/admin/leerlingen?error=placement");
  }
  redirect("/admin/leerlingen?saved=1");
}

async function getActionTenant() {
  const context = await requirePrivateShellContext("/admin");

  return getActiveTenant(context);
}

async function getWriteActionContext() {
  const context = await requirePrivateShellContext("/admin/leerlingen");

  return { tenant: getActiveTenant(context), actorUserId: context.user.id };
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function redirectAfterWrite(path: `/${string}`, error: { message: string } | null) {
  revalidatePath(path);

  if (error) {
    redirect(`${path}?error=write`);
  }

  redirect(`${path}?saved=1`);
}

function readRequired(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function readOptional(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function readInteger(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}
