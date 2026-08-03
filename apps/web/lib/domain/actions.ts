"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const guardianUserId = readOptional(formData, "guardianUserId");
  const participantResult = await admin
    .from("participants")
    .insert({
      tenant_id: tenant.id,
      guardian_user_id: guardianUserId,
      display_name: readRequired(formData, "displayName"),
      birth_date: readOptional(formData, "birthDate"),
      gender: readOptional(formData, "gender") ?? "unknown_legacy",
      status: "active"
    })
    .select("id")
    .single();

  if (participantResult.error || !participantResult.data) {
    redirect("/admin/leerlingen?error=participant");
  }

  const participantId = (participantResult.data as { id: string }).id;

  if (guardianUserId) {
    await admin.from("participant_guardians").upsert(
      {
        tenant_id: tenant.id,
        participant_id: participantId,
        guardian_user_id: guardianUserId,
        relationship: "parent",
        access_level: "primary",
        status: "active"
      },
      { onConflict: "tenant_id,participant_id,guardian_user_id" }
    );
  }

  const enrollmentResult = await admin.from("enrollments").insert({
    tenant_id: tenant.id,
    participant_id: participantId,
    guardian_user_id: guardianUserId,
    program_id: readRequired(formData, "programId"),
    current_stage_id: readOptional(formData, "stageId"),
    status: "active",
    source: "manual",
    starts_on: readOptional(formData, "startsOn") ?? new Date().toISOString().slice(0, 10)
  });

  redirectAfterWrite("/admin/leerlingen", enrollmentResult.error);
}

export async function createGroupMembershipAction(formData: FormData) {
  const tenant = await getActionTenant();
  const admin = createAdminClient();
  const groupId = readRequired(formData, "groupId");
  const enrollmentId = readRequired(formData, "enrollmentId");
  const capacityWeight = readNumber(formData, "capacityWeight") ?? 1;
  const status = readOptional(formData, "status") ?? "active";
  const requestedBucket = readOptional(formData, "capacityBucket") ?? "regular";
  const capacityBucket = status === "trial"
    ? "trial"
    : requestedBucket === "flex" ? "flex" : "regular";

  if (status === "active" || status === "trial") {
    const capacityOk = await groupHasCapacity({
      tenantId: tenant.id,
      groupId,
      capacityWeight
    });

    if (!capacityOk) {
      redirect("/admin/leerlingen?error=capacity");
    }
  }

  const enrollmentResult = await admin.from("enrollments").select("participant_id").eq("tenant_id", tenant.id).eq("id", enrollmentId).single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    redirect("/admin/leerlingen?error=enrollment");
  }

  const participantId = (enrollmentResult.data as { participant_id: string }).participant_id;
  const { error } = await admin.from("group_memberships").insert({
    tenant_id: tenant.id,
    group_id: groupId,
    enrollment_id: enrollmentId,
    participant_id: participantId,
    status,
    starts_on: readOptional(formData, "startsOn") ?? new Date().toISOString().slice(0, 10),
    capacity_weight: capacityWeight,
    capacity_bucket: capacityBucket
  });

  redirectAfterWrite("/admin/leerlingen", error);
}

async function getActionTenant() {
  const context = await requirePrivateShellContext("/admin");

  return getActiveTenant(context);
}

async function groupHasCapacity(input: { tenantId: string; groupId: string; capacityWeight: number }) {
  const admin = createAdminClient();
  const [groupResult, membershipsResult] = await Promise.all([
    admin.from("groups").select("capacity").eq("tenant_id", input.tenantId).eq("id", input.groupId).single(),
    admin.from("group_memberships").select("capacity_weight, status").eq("tenant_id", input.tenantId).eq("group_id", input.groupId)
  ]);

  if (groupResult.error || !groupResult.data || membershipsResult.error) {
    return false;
  }

  const capacity = Number((groupResult.data as { capacity: number }).capacity);
  const used = ((membershipsResult.data ?? []) as { capacity_weight: number; status: string }[])
    .filter((membership) => membership.status === "active" || membership.status === "trial")
    .reduce((total, membership) => total + Number(membership.capacity_weight), 0);

  return used + input.capacityWeight <= capacity;
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
