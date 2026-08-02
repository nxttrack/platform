"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import {
  normalizePlanningConflictResult,
  parseGroupScheduleDraft,
  type GroupScheduleDraft,
  type PlanningConflictResult
} from "./group-planning-contract";

const groupsPath = "/admin/groepen";

export async function previewGroupScheduleAction(input: unknown): Promise<
  { ok: true; result: PlanningConflictResult } | { ok: false; error: string }
> {
  try {
    const draft = parseGroupScheduleDraft(input);
    const { context, tenant } = await requireGroupPlanner();
    const result = await createAdminClient().rpc("preview_group_schedule", {
      actor_user_id: context.user.id,
      target_payload: draft,
      target_tenant_id: tenant.id
    });
    if (result.error) {
      console.error("[planning] advisory conflict check failed", {
        code: result.error.code,
        tenantId: tenant.id
      });
      return { ok: false, error: "De live conflictcontrole is tijdelijk niet beschikbaar." };
    }
    return { ok: true, result: normalizePlanningConflictResult(result.data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "De planningsinvoer is ongeldig."
    };
  }
}

export async function publishGroupScheduleAction(input: unknown) {
  if (!isRecord(input) || input.humanConfirmation !== true) {
    redirect(`${groupsPath}?error=confirmation`);
  }
  const idempotencyKey = readIdempotencyKey(input.idempotencyKey);
  let draft: GroupScheduleDraft;
  try {
    draft = parseGroupScheduleDraft(input.draft);
  } catch {
    redirect(`${groupsPath}?error=validation`);
  }
  const { context, tenant } = await requireGroupPlanner();
  const result = await createAdminClient().rpc("publish_group_schedule", {
    actor_user_id: context.user.id,
    target_idempotency_key: idempotencyKey,
    target_payload: draft,
    target_tenant_id: tenant.id
  });
  if (result.error) {
    console.error("[planning] transactional group publication failed", {
      code: result.error.code,
      message: result.error.message,
      tenantId: tenant.id
    });
    const reason = /Transactional planning conflict/i.test(result.error.message)
      ? "conflict"
      : "publication";
    redirect(`${groupsPath}?error=${reason}`);
  }
  revalidatePath(groupsPath);
  revalidatePath("/admin/agenda");
  redirect(`${groupsPath}?saved=published`);
}

export async function saveLessonTimeTemplateAction(formData: FormData) {
  const { context, tenant } = await requireGroupPlanner();
  const start = readTime(formData, "startTime");
  const end = readTime(formData, "endTime");
  if (start >= end) redirect(`${groupsPath}?error=time`);
  const result = await createAdminClient().from("lesson_time_templates").insert({
    tenant_id: tenant.id,
    name: readText(formData, "name", 2, 120),
    weekday: readInteger(formData, "weekday", 1, 7),
    local_start_time: start,
    local_end_time: end,
    recurrence_interval_weeks: readInteger(formData, "recurrenceIntervalWeeks", 1, 8),
    created_by_user_id: context.user.id
  });
  redirectAfterMasterdata(result.error, "template");
}

export async function saveResourceOpeningHoursAction(formData: FormData) {
  const { tenant } = await requireGroupPlanner();
  const resourceId = readUuid(formData, "resourceId");
  await requireTenantRow("resources", tenant.id, resourceId);
  const opensAt = readTime(formData, "opensAt");
  const closesAt = readTime(formData, "closesAt");
  if (opensAt >= closesAt) redirect(`${groupsPath}?error=time`);
  const result = await createAdminClient().from("resource_opening_hours").insert({
    tenant_id: tenant.id,
    resource_id: resourceId,
    weekday: readInteger(formData, "weekday", 1, 7),
    opens_at: opensAt,
    closes_at: closesAt,
    effective_from: readOptionalDate(formData, "effectiveFrom"),
    effective_until: readOptionalDate(formData, "effectiveUntil")
  });
  redirectAfterMasterdata(result.error, "opening-hours");
}

export async function saveInstructorQualificationAction(formData: FormData) {
  const { context, tenant } = await requireGroupPlanner();
  const instructorUserId = readUuid(formData, "instructorUserId");
  const programId = readUuid(formData, "programId");
  const stageId = readOptionalUuid(formData, "stageId");
  const resourceId = readOptionalUuid(formData, "resourceId");
  const validFrom = readOptionalDate(formData, "validFrom");
  const validUntil = readOptionalDate(formData, "validUntil");
  if (validFrom && validUntil && validFrom > validUntil) {
    redirect(`${groupsPath}?error=qualification-period`);
  }
  const admin = createAdminClient();
  const [membership, program, stage, resource] = await Promise.all([
    admin
      .from("tenant_memberships")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", instructorUserId)
      .eq("role", "instructor")
      .eq("status", "active")
      .maybeSingle(),
    admin
      .from("programs")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("id", programId)
      .eq("status", "active")
      .maybeSingle(),
    stageId
      ? admin.from("program_stages").select("id").eq("tenant_id", tenant.id).eq("program_id", programId).eq("id", stageId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: { id: "all" }, error: null }),
    resourceId
      ? admin.from("resources").select("id").eq("tenant_id", tenant.id).eq("id", resourceId).eq("status", "active").maybeSingle()
      : Promise.resolve({ data: { id: "all" }, error: null })
  ]);
  if (
    membership.error || !membership.data
    || program.error || !program.data
    || stage.error || !stage.data
    || resource.error || !resource.data
  ) {
    redirect(`${groupsPath}?error=qualification-scope`);
  }
  const result = await admin.from("instructor_qualifications").insert({
    tenant_id: tenant.id,
    instructor_user_id: instructorUserId,
    program_id: programId,
    stage_id: stageId,
    resource_id: resourceId,
    qualification_key: readKey(formData, "qualificationKey"),
    name: readText(formData, "name", 2, 160),
    status: "active",
    valid_from: validFrom,
    valid_until: validUntil,
    evidence_note: readOptionalText(formData, "evidenceNote", 1000),
    verified_by_user_id: context.user.id,
    verified_at: new Date().toISOString()
  });
  redirectAfterMasterdata(result.error, "qualification");
}

export async function saveResourceLocationProfileAction(formData: FormData) {
  const { tenant } = await requireGroupPlanner();
  const resourceId = readUuid(formData, "resourceId");
  const resource = await createAdminClient()
    .from("resources")
    .select("id, kind")
    .eq("tenant_id", tenant.id)
    .eq("id", resourceId)
    .maybeSingle();
  if (resource.error || !resource.data || resource.data.kind !== "location") {
    redirect(`${groupsPath}?error=location-scope`);
  }
  const result = await createAdminClient().from("resource_location_profiles").upsert({
    tenant_id: tenant.id,
    resource_id: resourceId,
    address_line_1: readText(formData, "addressLine1", 1, 160),
    address_line_2: readOptionalText(formData, "addressLine2", 160),
    postal_code: readText(formData, "postalCode", 2, 20),
    city: readText(formData, "city", 1, 120),
    country_code: readCountryCode(formData),
    timezone: readText(formData, "timezone", 3, 80),
    public_notes: readOptionalText(formData, "publicNotes", 500)
  }, { onConflict: "tenant_id,resource_id" });
  redirectAfterMasterdata(result.error, "location");
}

export async function savePlanningPolicyAction(formData: FormData) {
  const { context, tenant } = await requireGroupPlanner();
  const result = await createAdminClient().from("tenant_planning_policies").upsert({
    tenant_id: tenant.id,
    qualification_enforcement: readEnum(formData, "qualificationEnforcement", ["blocking", "advisory"]),
    opening_hours_enforcement: readEnum(formData, "openingHoursEnforcement", ["blocking", "advisory"]),
    default_capacity_borrowing: readEnum(formData, "defaultCapacityBorrowing", ["none", "flex_from_regular", "bidirectional"]),
    maximum_schedule_horizon_days: readInteger(formData, "maximumScheduleHorizonDays", 7, 1095),
    updated_by_user_id: context.user.id
  }, { onConflict: "tenant_id" });
  redirectAfterMasterdata(result.error, "policy");
}

async function requireGroupPlanner() {
  const context = await requirePrivateShellContext(groupsPath);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff", "coordinator"].includes(role)
  )) {
    redirect(`${groupsPath}?error=forbidden`);
  }
  return { context, tenant };
}

async function requireTenantRow(table: "resources", tenantId: string, id: string) {
  const result = await createAdminClient().from(table).select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (result.error || !result.data) redirect(`${groupsPath}?error=scope`);
}

function redirectAfterMasterdata(error: { message: string } | null, saved: string): never {
  revalidatePath(groupsPath);
  if (error) {
    console.error("[planning] masterdata write failed", { message: error.message, saved });
    redirect(`${groupsPath}?error=masterdata`);
  }
  redirect(`${groupsPath}?saved=${saved}`);
}

function readIdempotencyKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/.test(value)) {
    throw new Error("Invalid idempotency key.");
  }
  return value;
}
function readText(formData: FormData, field: string, min: number, max: number) {
  const value = String(formData.get(field) ?? "").trim();
  if (value.length < min || value.length > max) throw new Error(`${field} is invalid.`);
  return value;
}
function readOptionalText(formData: FormData, field: string, max: number) {
  const value = String(formData.get(field) ?? "").trim();
  if (value.length > max) throw new Error(`${field} is invalid.`);
  return value || null;
}
function readInteger(formData: FormData, field: string, min: number, max: number) {
  const value = Number(formData.get(field));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${field} is invalid.`);
  return value;
}
function readTime(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}
function readOptionalDate(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "");
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}
function readUuid(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "");
  if (!isUuid(value)) throw new Error(`${field} is invalid.`);
  return value;
}
function readOptionalUuid(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "");
  return value ? readUuid(formData, field) : null;
}
function readKey(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}
function readCountryCode(formData: FormData) {
  const value = String(formData.get("countryCode") ?? "NL").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) throw new Error("countryCode is invalid.");
  return value;
}
function readEnum<T extends string>(formData: FormData, field: string, values: readonly T[]) {
  const value = String(formData.get(field) ?? "");
  if (!values.includes(value as T)) throw new Error(`${field} is invalid.`);
  return value as T;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
