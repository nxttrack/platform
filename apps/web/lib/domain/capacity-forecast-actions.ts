"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createClient } from "@/lib/supabase/server";
import { getActiveTenant } from "./core";

const forecastPath = "/admin/rapportages/capaciteit";

export async function requestCapacitySoftReservationAction(formData: FormData) {
  const { tenant } = await requireForecastManager();
  const durationHours = readInteger(formData, "durationHours", 2, 168);
  const supabase = await createClient();
  const result = await supabase.rpc("create_capacity_soft_reservation", {
    target_capacity_bucket: readBucket(formData),
    target_capacity_weight: 1,
    target_expires_at: new Date(Date.now() + durationHours * 3_600_000).toISOString(),
    target_forecast_result_id: null,
    target_group_id: readUuid(formData, "groupId"),
    target_idempotency_key: readIdempotencyKey(formData),
    target_reason: readReason(formData),
    target_tenant_id: tenant.id,
    target_waitlist_entry_id: readUuid(formData, "waitlistEntryId")
  });
  redirectAfter(result.error, "requested");
}

export async function reviewCapacitySoftReservationAction(formData: FormData) {
  await requireForecastManager();
  const supabase = await createClient();
  const result = await supabase.rpc("review_capacity_soft_reservation", {
    target_approved: formData.get("decision") === "approve",
    target_reason: readReason(formData),
    target_reservation_id: readUuid(formData, "reservationId")
  });
  redirectAfter(result.error, formData.get("decision") === "approve" ? "approved" : "rejected");
}

export async function releaseCapacitySoftReservationAction(formData: FormData) {
  await requireForecastManager();
  const supabase = await createClient();
  const result = await supabase.rpc("release_capacity_soft_reservation", {
    target_reason: readReason(formData),
    target_reservation_id: readUuid(formData, "reservationId")
  });
  redirectAfter(result.error, "released");
}

async function requireForecastManager() {
  const context = await requirePrivateShellContext(forecastPath);
  return { context, tenant: getActiveTenant(context) };
}

function redirectAfter(error: { message: string } | null, saved: string): never {
  if (error) {
    console.error("[capacity-forecast] soft reservation command failed", {
      code: "code" in error ? error.code : undefined,
      message: error.message
    });
    redirect(`${forecastPath}?error=soft-hold`);
  }
  revalidatePath(forecastPath);
  redirect(`${forecastPath}?saved=${saved}`);
}

function readUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    redirect(`${forecastPath}?error=validation`);
  }
  return value;
}

function readReason(formData: FormData) {
  const value = String(formData.get("reason") ?? "").trim();
  if (value.length < 3 || value.length > 1000) {
    redirect(`${forecastPath}?error=validation`);
  }
  return value;
}

function readIdempotencyKey(formData: FormData) {
  const value = String(formData.get("idempotencyKey") ?? "").trim();
  if (value.length < 8 || value.length > 200) {
    redirect(`${forecastPath}?error=validation`);
  }
  return value;
}

function readInteger(formData: FormData, key: string, minimum: number, maximum: number) {
  const value = Number(formData.get(key));
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    redirect(`${forecastPath}?error=validation`);
  }
  return value;
}

function readBucket(formData: FormData) {
  const value = String(formData.get("capacityBucket") ?? "");
  if (!["regular", "flex", "trial"].includes(value)) {
    redirect(`${forecastPath}?error=validation`);
  }
  return value;
}
