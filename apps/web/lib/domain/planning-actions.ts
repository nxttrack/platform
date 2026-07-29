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
  const context = await requirePrivateShellContext("/admin/inhaalmarkt");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const requestId = readRequired(formData, "requestId");
  const decision = readRequired(formData, "decision");
  if (!["approved", "declined"].includes(decision) || formData.get("humanConfirmation") !== "confirmed") {
    redirect("/admin/inhaalmarkt?error=confirmation");
  }
  const decisionResult = await admin.rpc("decide_makeup_marketplace_request", {
    target_tenant_id: tenant.id,
    target_request_id: requestId,
    actor_user_id: context.user.id,
    requested_decision: decision,
    decision_notes: readOptional(formData, "adminNotes"),
    human_confirmation: true
  });
  if (decisionResult.error) {
    console.error("[makeup-marketplace] decision failed", {
      tenantId: tenant.id,
      requestId,
      decision,
      code: decisionResult.error.code,
      message: decisionResult.error.message
    });
    redirect(`/admin/inhaalmarkt?error=${decisionResult.error.message === "makeup_no_capacity" ? "capacity" : "catchup"}`);
  }

  revalidatePath("/admin/inhaalmarkt");
  revalidatePath("/admin/agenda");
  revalidatePath("/portaal/lessen");
  redirect(`/admin/inhaalmarkt?saved=${decision === "approved" ? "catchup-approved" : "catchup-declined"}`);
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
