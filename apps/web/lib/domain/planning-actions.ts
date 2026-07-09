"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

const availabilityTypes = new Set(["available", "unavailable"]);
const availabilityStatuses = new Set(["active", "inactive"]);

export async function saveInstructorAvailabilityAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/agenda");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { error } = await admin.from("instructor_availability").insert({
    tenant_id: tenant.id,
    instructor_user_id: readRequired(formData, "instructorUserId"),
    weekday: readInteger(formData, "weekday") ?? 1,
    starts_at: readRequired(formData, "startsAt"),
    ends_at: readRequired(formData, "endsAt"),
    availability_type: readEnum(formData, "availabilityType", availabilityTypes, "available"),
    status: readEnum(formData, "status", availabilityStatuses, "active"),
    starts_on: readOptional(formData, "startsOn"),
    ends_on: readOptional(formData, "endsOn"),
    notes: readOptional(formData, "notes")
  });

  revalidatePath("/admin/agenda");

  if (error) {
    redirect("/admin/agenda?error=availability");
  }

  redirect("/admin/agenda?saved=availability");
}

export async function decideCatchUpRequestAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/agenda");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const requestId = readRequired(formData, "requestId");
  const decision = readRequired(formData, "decision");
  const requestResult = await admin
    .from("catch_up_requests")
    .select("id, credit_id, preferred_session_id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", requestId)
    .maybeSingle();

  if (requestResult.error || !requestResult.data || requestResult.data.status !== "requested") {
    redirect("/admin/agenda?error=catchup");
  }

  if (decision === "approved") {
    const capacityOk = await sessionHasCatchUpCapacity({
      tenantId: tenant.id,
      sessionId: requestResult.data.preferred_session_id,
      excludingRequestId: requestResult.data.id
    });

    if (!capacityOk) {
      redirect("/admin/agenda?error=capacity");
    }

    const { error: updateRequestError } = await admin
      .from("catch_up_requests")
      .update({
        assigned_session_id: requestResult.data.preferred_session_id,
        status: "approved",
        decided_at: new Date().toISOString(),
        decided_by_user_id: context.user.id,
        admin_notes: readOptional(formData, "adminNotes")
      })
      .eq("tenant_id", tenant.id)
      .eq("id", requestResult.data.id);

    if (updateRequestError) {
      redirect("/admin/agenda?error=catchup");
    }

    const { error: creditError } = await admin
      .from("catch_up_credits")
      .update({
        status: "reserved",
        used_session_id: requestResult.data.preferred_session_id,
        notes: readOptional(formData, "adminNotes")
      })
      .eq("tenant_id", tenant.id)
      .eq("id", requestResult.data.credit_id);

    if (creditError) {
      redirect("/admin/agenda?error=credit");
    }
  } else {
    const { error: updateRequestError } = await admin
      .from("catch_up_requests")
      .update({
        assigned_session_id: null,
        status: "declined",
        decided_at: new Date().toISOString(),
        decided_by_user_id: context.user.id,
        admin_notes: readOptional(formData, "adminNotes")
      })
      .eq("tenant_id", tenant.id)
      .eq("id", requestResult.data.id);

    if (updateRequestError) {
      redirect("/admin/agenda?error=catchup");
    }

    const { error: creditError } = await admin
      .from("catch_up_credits")
      .update({
        status: "available",
        used_session_id: null
      })
      .eq("tenant_id", tenant.id)
      .eq("id", requestResult.data.credit_id);

    if (creditError) {
      redirect("/admin/agenda?error=credit");
    }
  }

  revalidatePath("/admin/agenda");
  revalidatePath("/portaal/lessen");
  redirect(`/admin/agenda?saved=${decision === "approved" ? "catchup-approved" : "catchup-declined"}`);
}

async function sessionHasCatchUpCapacity(input: { excludingRequestId?: string; sessionId: string; tenantId: string }) {
  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("id, group_id, capacity_override, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionResult.error || !sessionResult.data || sessionResult.data.status !== "scheduled") {
    return false;
  }

  const [groupResult, membershipsResult, requestsResult] = await Promise.all([
    admin.from("groups").select("capacity").eq("tenant_id", input.tenantId).eq("id", sessionResult.data.group_id).maybeSingle(),
    admin.from("group_memberships").select("capacity_weight, status").eq("tenant_id", input.tenantId).eq("group_id", sessionResult.data.group_id),
    admin
      .from("catch_up_requests")
      .select("id, status")
      .eq("tenant_id", input.tenantId)
      .or(`preferred_session_id.eq.${input.sessionId},assigned_session_id.eq.${input.sessionId}`)
      .in("status", ["requested", "approved"])
  ]);

  if (groupResult.error || !groupResult.data || membershipsResult.error || requestsResult.error) {
    return false;
  }

  const capacity = Number(sessionResult.data.capacity_override ?? groupResult.data.capacity ?? 0);
  const used = ((membershipsResult.data ?? []) as { capacity_weight: number; status: string }[])
    .filter((membership) => membership.status === "active" || membership.status === "trial")
    .reduce((total, membership) => total + Number(membership.capacity_weight), 0);
  const holds = ((requestsResult.data ?? []) as { id: string; status: string }[]).filter((request) => request.id !== input.excludingRequestId).length;

  return used + holds + 1 <= capacity;
}

function readEnum(formData: FormData, field: string, allowed: Set<string>, fallback: string) {
  const value = readOptional(formData, field) ?? fallback;

  return allowed.has(value) ? value : fallback;
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
